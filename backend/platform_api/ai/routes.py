"""``/api/agent``: the assistant over AG-UI, and whether this deployment has one."""

from typing import Annotated, Any, Final, cast

from fastapi import APIRouter, Depends, Request, Response
from fastapi.exceptions import RequestValidationError
from pydantic import BaseModel, Field, ValidationError
from pydantic_ai import Agent

from platform_api.ai.agent import AgentAdapter, AgentDeps, AgentOutput, toolset_for
from platform_api.auth.dependencies import CurrentPrincipal, authenticate
from platform_api.auth.principal import Principal
from platform_api.context import Platform, get_platform
from platform_api.errors import AUTHENTICATED, Unavailable, error_responses

router = APIRouter(prefix="/api/agent", tags=["agent"], responses=AUTHENTICATED)

PlatformDep = Annotated[Platform, Depends(get_platform)]

NOT_CONFIGURED: Final = "Assistant is not configured"

RUN_INPUT: Final[dict[str, Any]] = {
    "requestBody": {
        "required": True,
        "content": {
            "application/json": {
                "schema": {
                    "type": "object",
                    "description": (
                        "AG-UI 1.0 RunAgentInput. To answer an interrupt, send the thread's "
                        "messages again with resume: [{interruptId, status: 'resolved', "
                        "payload: {approved: true|false}}] or status 'cancelled'."
                    ),
                    "required": ["threadId", "runId", "messages"],
                    "properties": {
                        "threadId": {"type": "string"},
                        "runId": {"type": "string"},
                        "messages": {"type": "array", "items": {"type": "object"}},
                        "state": {},
                        "resume": {"type": "array", "items": {"type": "object"}},
                    },
                }
            }
        },
    }
}

RUN_RESPONSES: Final[dict[int | str, dict[str, Any]]] = {
    200: {
        "description": "AG-UI events as Server-Sent Events, ending in RUN_FINISHED or RUN_ERROR",
        "content": {"text/event-stream": {"schema": {"type": "string"}}},
    },
    **error_responses(503),
}


class AgentStatus(BaseModel):
    enabled: bool
    model: str | None = Field(description="The configured model, when enabled")


def get_agent(request: Request) -> Agent[AgentDeps, AgentOutput] | None:
    return cast(Agent[AgentDeps, AgentOutput] | None, request.app.state.agent)


@router.get("/status")
def status(platform: PlatformDep, _: CurrentPrincipal) -> AgentStatus:
    model = platform.settings.agent_model
    return AgentStatus(enabled=bool(model), model=model or None)


@router.post("", response_class=Response, responses=RUN_RESPONSES, openapi_extra=RUN_INPUT)
async def run(
    request: Request,
    platform: PlatformDep,
    principal: Annotated[Principal, Depends(authenticate)],
) -> Response:
    agent = get_agent(request)
    if agent is None:
        raise Unavailable(NOT_CONFIGURED)
    try:
        adapter = await AgentAdapter.from_request(request, agent=agent)
    except ValidationError as exc:
        raise RequestValidationError(exc.errors()) from exc
    return adapter.streaming_response(
        adapter.run_stream(
            deps=AgentDeps(principal), toolsets=[toolset_for(platform.ai, principal)]
        )
    )

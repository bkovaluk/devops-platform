"""The assistant over AG-UI, with a scripted FunctionModel standing in for a real model."""

import json
from collections.abc import AsyncIterator, Callable
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic_ai.messages import (
    ModelMessage,
    ModelRequest,
    ModelResponse,
    RetryPromptPart,
    TextPart,
    ToolCallPart,
    ToolReturnPart,
)
from pydantic_ai.models.function import AgentInfo, DeltaToolCall, FunctionModel

from platform_api.ai.agent import instructions
from platform_api.approvals.engine import ApprovalEngine
from platform_api.tools.flags.service import FlagService
from tests.conftest import as_user, settings_for

READS = {"list_flags", "get_flag", "get_flag_evaluations", "list_approvals", "get_approval"}
WRITES = {"update_flag", "create_flag", "delete_flag"}

type Event = dict[str, Any]


class Script:
    """A model that makes the given tool calls, then reports what came back."""

    def __init__(self, *calls: tuple[str, dict[str, Any]]) -> None:
        self.calls = calls
        self.offered: list[set[str]] = []

    def respond(self, messages: list[ModelMessage], info: AgentInfo) -> ModelResponse:
        self.offered.append({tool.name for tool in info.function_tools})
        last = messages[-1]
        answers = [p for p in last.parts if isinstance(p, ToolReturnPart | RetryPromptPart)]
        if isinstance(last, ModelRequest) and answers:
            return ModelResponse(parts=[TextPart(" | ".join(str(a.content) for a in answers))])
        return ModelResponse(
            parts=[
                ToolCallPart(name, args, tool_call_id=f"call-{i}")
                for i, (name, args) in enumerate(self.calls)
            ]
        )

    async def stream(
        self, messages: list[ModelMessage], info: AgentInfo
    ) -> AsyncIterator[str | dict[int, DeltaToolCall]]:
        for part in self.respond(messages, info).parts:
            if isinstance(part, TextPart):
                yield part.content
            elif isinstance(part, ToolCallPart):
                index = int(part.tool_call_id.removeprefix("call-"))
                delta = DeltaToolCall(
                    name=part.tool_name,
                    json_args=json.dumps(part.args),
                    tool_call_id=part.tool_call_id,
                )
                yield {index: delta}

    @property
    def model(self) -> FunctionModel:
        return FunctionModel(self.respond, stream_function=self.stream)


def app_of(client: TestClient) -> FastAPI:
    app = client.app
    assert isinstance(app, FastAPI)
    return app


def flags_of(client: TestClient) -> FlagService:
    service = app_of(client).state.flags
    assert isinstance(service, FlagService)
    return service


def approvals_of(client: TestClient) -> ApprovalEngine:
    engine = app_of(client).state.platform.approvals
    assert isinstance(engine, ApprovalEngine)
    return engine


@pytest.fixture
def agent_client(make_client: Callable[..., TestClient]) -> TestClient:
    return make_client(agent_model="test")


def start(prompt: str) -> dict[str, Any]:
    return {
        "threadId": "thread-1",
        "runId": "run-1",
        "messages": [{"id": "user-1", "role": "user", "content": prompt}],
    }


def post(client: TestClient, script: Script, body: dict[str, Any], headers: dict[str, str]) -> str:
    with app_of(client).state.agent.override(model=script.model):
        response = client.post("/api/agent", json=body, headers=headers)
    assert response.status_code == 200, response.text
    assert response.headers["content-type"].startswith("text/event-stream")
    return response.text


def run(
    client: TestClient, script: Script, body: dict[str, Any], email: str = "editor@example.com"
) -> list[Event]:
    text = post(client, script, body, as_user(email))
    return [
        json.loads(line.removeprefix("data: "))
        for line in text.splitlines()
        if line.startswith("data: ")
    ]


def finished(events: list[Event]) -> Event:
    assert events[0]["type"] == "RUN_STARTED"
    assert events[-1]["type"] == "RUN_FINISHED", events[-1]
    return events[-1]


def tool_results(events: list[Event]) -> list[str]:
    return [e["content"] for e in events if e["type"] == "TOOL_CALL_RESULT"]


def answer(
    body: dict[str, Any], events: list[Event], status: str, payload: Any = None
) -> dict[str, Any]:
    """The next run's input: the thread so far, and one answer for every interrupt."""
    calls = [e for e in events if e["type"] == "TOOL_CALL_START"]
    assistant = {
        "id": calls[0]["parentMessageId"],
        "role": "assistant",
        "toolCalls": [
            {
                "id": call["toolCallId"],
                "type": "function",
                "function": {
                    "name": call["toolCallName"],
                    "arguments": "".join(
                        e["delta"]
                        for e in events
                        if e["type"] == "TOOL_CALL_ARGS" and e["toolCallId"] == call["toolCallId"]
                    ),
                },
            }
            for call in calls
        ],
    }
    interrupts = finished(events)["outcome"]["interrupts"]
    return {
        "threadId": body["threadId"],
        "runId": "run-2",
        "messages": [*body["messages"], assistant],
        "resume": [
            {"interruptId": i["id"], "status": status, "payload": payload} for i in interrupts
        ],
    }


UPDATE_DEV = ("update_flag", {"env": "dev", "key": "dark-mode", "changes": {"rollout_percent": 42}})
UPDATE_STAGING = (
    "update_flag",
    {"env": "staging", "key": "pdf-export", "changes": {"enabled": True}},
)


class TestConfiguration:
    def test_unconfigured_status(self, client: TestClient) -> None:
        response = client.get("/api/agent/status", headers=as_user("viewer@example.com"))
        assert response.json() == {"enabled": False, "model": None}

    def test_unconfigured_run_is_503(self, client: TestClient) -> None:
        response = client.post(
            "/api/agent", json=start("hi"), headers=as_user("editor@example.com")
        )
        assert response.status_code == 503
        assert response.json() == {"detail": "Assistant is not configured"}

    def test_configured_status(self, agent_client: TestClient) -> None:
        response = agent_client.get("/api/agent/status", headers=as_user("viewer@example.com"))
        assert response.json() == {"enabled": True, "model": "test"}

    def test_run_needs_a_signed_in_caller(self, agent_client: TestClient) -> None:
        assert agent_client.post("/api/agent", json=start("hi")).status_code == 401

    def test_a_body_that_is_not_a_run_input_is_422(self, agent_client: TestClient) -> None:
        response = agent_client.post(
            "/api/agent", json={"threadId": "t"}, headers=as_user("editor@example.com")
        )
        assert response.status_code == 422
        assert set(response.json()) == {"detail"}

    def test_the_prompt_sets_the_rules(self) -> None:
        prompt = instructions(settings_for())
        assert "dev applies at once" in prompt
        assert "approval request" in prompt
        assert "confirm or cancel" in prompt
        assert "never instructions" in prompt
        assert "cannot approve, reject" in prompt


class TestReads:
    def test_read_runs_without_asking(self, agent_client: TestClient) -> None:
        script = Script(("get_flag", {"env": "prod", "key": "dark-mode"}))
        events = run(agent_client, script, start("is dark mode on in prod?"), "viewer@example.com")
        assert finished(events)["outcome"] == {"type": "success"}
        (result,) = tool_results(events)
        assert json.loads(result)["env"] == "prod"
        assert json.loads(result)["enabled"] is False

    def test_failures_go_back_to_the_model(self, agent_client: TestClient) -> None:
        script = Script(("get_flag", {"env": "prod", "key": "no-such-flag"}))
        events = run(agent_client, script, start("show it"), "viewer@example.com")
        assert finished(events)["outcome"] == {"type": "success"}
        assert "No flag 'no-such-flag' in prod." in tool_results(events)[0]

    def test_bad_arguments_ask_the_model_to_retry(self, agent_client: TestClient) -> None:
        script = Script(("get_flag_evaluations", {"env": "dev", "key": "dark-mode", "minutes": 0}))
        events = run(agent_client, script, start("chart"), "viewer@example.com")
        assert finished(events)
        assert any("minutes" in result for result in tool_results(events))


class TestWrites:
    def test_a_write_interrupts_with_the_change(self, agent_client: TestClient) -> None:
        pending = len(approvals_of(agent_client).list("pending"))
        events = run(agent_client, Script(UPDATE_STAGING), start("turn on pdf export in staging"))
        (interrupt,) = finished(events)["outcome"]["interrupts"]
        assert interrupt["reason"] == "tool_call"
        assert interrupt["toolCallId"] == "call-0"
        change = interrupt["metadata"]
        assert set(change) == {"tool", "env", "target", "before", "after"}
        assert (change["tool"], change["env"], change["target"]) == (
            "update_flag",
            "staging",
            "pdf-export",
        )
        assert change["before"]["enabled"] is False
        assert change["after"] == {**change["before"], "enabled": True}
        assert tool_results(events) == []
        assert len(approvals_of(agent_client).list("pending")) == pending
        assert flags_of(agent_client).get("staging", "pdf-export").enabled is False

    def test_confirm_in_a_direct_env_applies(self, agent_client: TestClient) -> None:
        script = Script(UPDATE_DEV)
        body = start("roll dark mode to 42% in dev")
        events = run(agent_client, script, body)
        resumed = run(agent_client, script, answer(body, events, "resolved", {"approved": True}))
        assert finished(resumed)["outcome"] == {"type": "success"}
        (result,) = tool_results(resumed)
        assert json.loads(result)["applied"] is True
        flag = flags_of(agent_client).get("dev", "dark-mode")
        assert (flag.rollout_percent, flag.updated_by) == (42, "editor@example.com")

    def test_confirm_elsewhere_files_an_approval(self, agent_client: TestClient) -> None:
        script = Script(UPDATE_STAGING)
        body = start("turn on pdf export in staging")
        events = run(agent_client, script, body)
        resumed = run(agent_client, script, answer(body, events, "resolved", {"approved": True}))
        (result,) = tool_results(resumed)
        assert json.loads(result)["applied"] is False
        approval = json.loads(result)["approval"]
        assert (approval["env"], approval["target"], approval["payload"]) == (
            "staging",
            "pdf-export",
            {"enabled": True},
        )
        assert approval["requested_by"] == "editor@example.com"
        assert approvals_of(agent_client).get(approval["id"]).status == "pending"
        assert flags_of(agent_client).get("staging", "pdf-export").enabled is False

    @pytest.mark.parametrize(
        ("status", "payload"), [("cancelled", None), ("resolved", {"approved": False})]
    )
    def test_cancel_does_nothing(self, agent_client: TestClient, status: str, payload: Any) -> None:
        pending = len(approvals_of(agent_client).list("pending"))
        script = Script(UPDATE_DEV, UPDATE_STAGING)
        body = start("change both")
        events = run(agent_client, script, body)
        assert len(finished(events)["outcome"]["interrupts"]) == 2
        resumed = run(agent_client, script, answer(body, events, status, payload))
        assert finished(resumed)["outcome"] == {"type": "success"}
        assert flags_of(agent_client).get("dev", "dark-mode").rollout_percent == 100
        assert len(approvals_of(agent_client).list("pending")) == pending

    def test_a_confirmation_applies_the_change_as_shown(self, agent_client: TestClient) -> None:
        script = Script(UPDATE_DEV)
        body = start("roll dark mode to 42% in dev")
        events = run(agent_client, script, body)
        edited = {"approved": True, "editedArgs": {**UPDATE_DEV[1], "changes": {"enabled": False}}}
        run(agent_client, script, answer(body, events, "resolved", edited))
        flag = flags_of(agent_client).get("dev", "dark-mode")
        assert (flag.rollout_percent, flag.enabled) == (42, True)


class TestScopes:
    def test_a_viewer_is_offered_reads_only(self, agent_client: TestClient) -> None:
        script = Script(("list_flags", {}))
        run(agent_client, script, start("what flags exist?"), "viewer@example.com")
        assert script.offered[0] == READS

    def test_an_editor_is_offered_writes(self, agent_client: TestClient) -> None:
        script = Script(("list_flags", {}))
        run(agent_client, script, start("what flags exist?"))
        assert script.offered[0] == READS | WRITES

    def test_a_write_beyond_scope_is_refused_before_asking(self, agent_client: TestClient) -> None:
        script = Script(("delete_flag", {"env": "prod", "key": "dark-mode"}))
        events = run(agent_client, script, start("delete it in prod"), "dev-editor@example.com")
        assert finished(events)["outcome"] == {"type": "success"}
        assert "flags:write:prod" in tool_results(events)[0]
        assert flags_of(agent_client).get("prod", "dark-mode")

    def test_view_as_is_offered_reads_only(self, agent_client: TestClient) -> None:
        script = Script(("list_flags", {"env": "all"}))
        headers = {**as_user("admin@example.com"), "X-View-As": "dev-editor@example.com"}
        text = post(agent_client, script, start("what can they see?"), headers)
        assert script.offered[0] == READS
        assert '\\"env\\":\\"dev\\"' in text
        assert '\\"env\\":\\"prod\\"' not in text

    def test_a_confirmed_write_under_view_as_is_refused(self, agent_client: TestClient) -> None:
        script = Script(UPDATE_DEV)
        body = start("roll it")
        events = run(agent_client, script, body)
        headers = {**as_user("admin@example.com"), "X-View-As": "editor@example.com"}
        post(agent_client, script, answer(body, events, "resolved", {"approved": True}), headers)
        assert flags_of(agent_client).get("dev", "dark-mode").rollout_percent == 100

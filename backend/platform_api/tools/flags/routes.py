from typing import Annotated, Any, cast

from fastapi import APIRouter, Depends, Query, Request
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse

from platform_api.auth.dependencies import CurrentPrincipal, require_scope
from platform_api.auth.principal import Principal
from platform_api.context import Platform, get_platform
from platform_api.envs import ALL, SingleEnv, selected_envs
from platform_api.errors import AUTHENTICATED, ENV_ITEM, ENV_LIST, ENV_MUTATION
from platform_api.tools.flags.models import (
    ApprovalQueued,
    EvaluationSeries,
    Flag,
    FlagApplied,
    FlagCreate,
    FlagPatch,
)
from platform_api.tools.flags.service import TOOL, Change, FlagService

router = APIRouter(prefix="/api/flags", tags=["flags"], responses=AUTHENTICATED)


def get_flags(request: Request) -> FlagService:
    return cast(FlagService, request.app.state.flags)


Flags = Annotated[FlagService, Depends(get_flags)]
Reader = Annotated[Principal, Depends(require_scope(TOOL, "read"))]
Writer = Annotated[Principal, Depends(require_scope(TOOL, "write"))]

CHANGE_RESPONSES: dict[int | str, dict[str, Any]] = {
    **ENV_MUTATION,
    202: {"model": ApprovalQueued, "description": "Filed for approval (not a direct env)"},
}


def _answer(change: Change) -> FlagApplied | JSONResponse:
    if isinstance(change, FlagApplied):
        return change
    return JSONResponse(status_code=202, content=jsonable_encoder(change))


@router.get("", responses=ENV_LIST)
def list_flags(
    platform: Annotated[Platform, Depends(get_platform)],
    principal: CurrentPrincipal,
    flags: Flags,
    env: Annotated[
        str, Query(description="One environment, or 'all' for every readable one")
    ] = ALL,
    q: Annotated[
        str | None, Query(max_length=100, description="Matches key or description")
    ] = None,
) -> list[Flag]:
    return flags.list(selected_envs(platform, principal, env, TOOL, "read"), q)


@router.post("", response_model=FlagApplied, responses=CHANGE_RESPONSES)
def create_flag(body: FlagCreate, env: SingleEnv, principal: Writer, flags: Flags) -> Any:
    return _answer(flags.create(env, body, principal.email))


@router.get("/{key}", responses=ENV_ITEM)
def get_flag(key: str, env: SingleEnv, _: Reader, flags: Flags) -> Flag:
    return flags.get(env, key)


@router.put("/{key}", response_model=FlagApplied, responses=CHANGE_RESPONSES)
def update_flag(key: str, body: FlagPatch, env: SingleEnv, principal: Writer, flags: Flags) -> Any:
    return _answer(flags.update(env, key, body, principal.email))


@router.delete("/{key}", response_model=FlagApplied, responses=CHANGE_RESPONSES)
def delete_flag(key: str, env: SingleEnv, principal: Writer, flags: Flags) -> Any:
    return _answer(flags.delete(env, key, principal.email))


@router.get("/{key}/evaluations", responses=ENV_ITEM)
def flag_evaluations(
    key: str,
    env: SingleEnv,
    _: Reader,
    flags: Flags,
    minutes: Annotated[int, Query(ge=1, le=1440)] = 60,
) -> EvaluationSeries:
    return flags.evaluations(env, key, minutes)

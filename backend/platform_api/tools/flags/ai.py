"""What a model may do with feature flags: the same reads and changes as the routes."""

from typing import Any

from pydantic import BaseModel, Field

from platform_api.ai.actions import AiAction, ChangePreview
from platform_api.auth.principal import Principal
from platform_api.auth.scopes import Scope
from platform_api.context import Platform
from platform_api.envs import ALL, check_env_access, selected_envs, single_env
from platform_api.tools.flags.models import FlagCreate, FlagPatch
from platform_api.tools.flags.service import TOOL, FlagService

ENV_DESCRIPTION = "One environment name, e.g. 'dev'"


class ListFlags(BaseModel):
    env: str = Field(default=ALL, description="One environment name, or 'all' for every one")
    q: str | None = Field(
        default=None, max_length=100, description="Only flags whose key or description match"
    )


class FlagRef(BaseModel):
    env: str = Field(description=ENV_DESCRIPTION)
    key: str = Field(description="The flag key")


class FlagEvaluations(FlagRef):
    minutes: int = Field(default=60, ge=1, le=1440, description="How far back to look")


class UpdateFlag(FlagRef):
    changes: FlagPatch = Field(description="Only the fields to change")


class CreateFlag(BaseModel):
    env: str = Field(description=ENV_DESCRIPTION)
    flag: FlagCreate


def ai_actions(platform: Platform, flags: FlagService) -> tuple[AiAction[Any], ...]:
    def env_for(principal: Principal, env: str, action: str) -> str:
        env = single_env(platform, env)
        check_env_access(principal, TOOL, action, env)
        return env

    def list_flags(principal: Principal, params: ListFlags) -> object:
        return flags.list(selected_envs(platform, principal, params.env, TOOL, "read"), params.q)

    def get_flag(principal: Principal, params: FlagRef) -> object:
        return flags.get(env_for(principal, params.env, "read"), params.key)

    def get_flag_evaluations(principal: Principal, params: FlagEvaluations) -> object:
        env = env_for(principal, params.env, "read")
        return flags.evaluations(env, params.key, params.minutes)

    def update_flag(principal: Principal, params: UpdateFlag) -> object:
        env = env_for(principal, params.env, "write")
        return flags.update(env, params.key, params.changes, principal.email)

    def create_flag(principal: Principal, params: CreateFlag) -> object:
        return flags.create(env_for(principal, params.env, "write"), params.flag, principal.email)

    def delete_flag(principal: Principal, params: FlagRef) -> object:
        return flags.delete(env_for(principal, params.env, "write"), params.key, principal.email)

    def preview_update(principal: Principal, params: UpdateFlag) -> ChangePreview:
        env = env_for(principal, params.env, "write")
        before = flags.get(env, params.key).model_dump(mode="json")
        after = {**before, **params.changes.changes()}
        return ChangePreview("update_flag", env, params.key, before, after)

    def preview_create(principal: Principal, params: CreateFlag) -> ChangePreview:
        env = env_for(principal, params.env, "write")
        after = {**params.flag.model_dump(mode="json"), "env": env}
        return ChangePreview("create_flag", env, params.flag.key, None, after)

    def preview_delete(principal: Principal, params: FlagRef) -> ChangePreview:
        env = env_for(principal, params.env, "write")
        before = flags.get(env, params.key).model_dump(mode="json")
        return ChangePreview("delete_flag", env, params.key, before, None)

    read, write = (Scope(TOOL, "read"),), (Scope(TOOL, "write"),)
    return (
        AiAction(
            "list_flags",
            "List feature flags in one environment or all of them, optionally filtered by "
            "text in the key or description.",
            ListFlags,
            "read",
            read,
            list_flags,
        ),
        AiAction(
            "get_flag",
            "Read one feature flag in one environment: whether it is on, its rollout "
            "percentage, owner and last change.",
            FlagRef,
            "read",
            read,
            get_flag,
        ),
        AiAction(
            "get_flag_evaluations",
            "Read a flag's evaluations per minute over a recent window, oldest first, with "
            "the share that returned true.",
            FlagEvaluations,
            "read",
            read,
            get_flag_evaluations,
        ),
        AiAction(
            "update_flag",
            "Change fields of an existing flag in one environment. Applies at once in a direct "
            "environment; anywhere else it files an approval request for a second person.",
            UpdateFlag,
            "write",
            write,
            update_flag,
            preview_update,
        ),
        AiAction(
            "create_flag",
            "Create a flag in one environment. Applies at once in a direct environment; "
            "anywhere else it files an approval request for a second person.",
            CreateFlag,
            "write",
            write,
            create_flag,
            preview_create,
        ),
        AiAction(
            "delete_flag",
            "Delete a flag from one environment. Applies at once in a direct environment; "
            "anywhere else it files an approval request for a second person.",
            FlagRef,
            "write",
            write,
            delete_flag,
            preview_delete,
        ),
    )

"""Feature flags: reads, and changes that apply directly or go through approval.

A change in a direct environment is written at once. Anywhere else it is
filed with the approval engine, and :meth:`FlagService.replay` writes it when
a second person approves. Replay refuses a change whose flag moved on since
the request was filed, so a reviewer never approves one diff and applies
another.
"""

from collections.abc import Sequence
from typing import Any, Final

from platform_api.approvals.engine import ApprovalEngine
from platform_api.approvals.models import Approval
from platform_api.clock import Clock
from platform_api.envs import fan_out
from platform_api.errors import Conflict, NotFound
from platform_api.tools.flags.evaluations import synthetic_series
from platform_api.tools.flags.models import (
    ApprovalQueued,
    EvaluationSeries,
    Flag,
    FlagApplied,
    FlagCreate,
    FlagPatch,
)
from platform_api.tools.flags.store import FlagStore

TOOL: Final = "flags"
ACTIONS: Final = frozenset({"create", "update", "delete"})

type Change = FlagApplied | ApprovalQueued


class FlagService:
    def __init__(
        self,
        store: FlagStore,
        approvals: ApprovalEngine,
        direct_envs: Sequence[str],
        clock: Clock,
    ) -> None:
        self._store = store
        self._approvals = approvals
        self._direct_envs = frozenset(direct_envs)
        self._clock = clock

    def list(self, envs: list[str], query: str | None) -> list[Flag]:
        flags = fan_out(envs, self._store.list)
        if not query:
            return flags
        needle = query.lower()
        return [f for f in flags if needle in f.key.lower() or needle in f.description.lower()]

    def get(self, env: str, key: str) -> Flag:
        flag = self._store.get(env, key)
        if flag is None:
            raise NotFound(f"No flag '{key}' in {env}.")
        return flag

    def evaluations(self, env: str, key: str, minutes: int) -> EvaluationSeries:
        flag = self.get(env, key)
        return EvaluationSeries(
            key=key, env=env, points=synthetic_series(flag, minutes, self._clock())
        )

    def _queue(
        self,
        env: str,
        action: str,
        key: str,
        payload: dict[str, Any],
        before: Flag | None,
        actor: str,
    ) -> ApprovalQueued:
        approval = self._approvals.file(
            env=env,
            tool=TOOL,
            action=action,
            target=key,
            payload=payload,
            before=before.model_dump(mode="json") if before else None,
            requested_by=actor,
        )
        return ApprovalQueued(approval=approval)

    def create(self, env: str, body: FlagCreate, actor: str) -> Change:
        if self._store.get(env, body.key) is not None:
            raise Conflict(f"Flag '{body.key}' already exists in {env}; edit it instead.")
        payload = body.model_dump()
        if env in self._direct_envs:
            return FlagApplied(flag=self._create(env, payload, actor))
        return self._queue(env, "create", body.key, payload, None, actor)

    def update(self, env: str, key: str, patch: FlagPatch, actor: str) -> Change:
        current = self.get(env, key)
        if env in self._direct_envs:
            return FlagApplied(flag=self._update(current, patch.changes(), actor))
        return self._queue(env, "update", key, patch.changes(), current, actor)

    def delete(self, env: str, key: str, actor: str) -> Change:
        current = self.get(env, key)
        if env in self._direct_envs:
            self._store.delete(env, key)
            return FlagApplied(flag=current)
        return self._queue(env, "delete", key, {}, current, actor)

    def _create(self, env: str, payload: dict[str, Any], actor: str) -> Flag:
        flag = Flag.model_validate(
            {**payload, "env": env, "updated_at": self._clock(), "updated_by": actor}
        )
        self._store.create(flag)
        return flag

    def _update(self, current: Flag, changes: dict[str, Any], actor: str) -> Flag:
        flag = Flag.model_validate(
            {
                **current.model_dump(),
                **changes,
                "updated_at": self._clock(),
                "updated_by": actor,
            }
        )
        self._store.put(flag)
        return flag

    def _unchanged_since_filed(self, approval: Approval) -> Flag:
        current = self._store.get(approval.env, approval.target)
        if current is None:
            raise NotFound(f"Flag '{approval.target}' no longer exists in {approval.env}.")
        if current.model_dump(mode="json") != approval.before:
            raise Conflict(
                f"Flag '{approval.target}' changed in {approval.env} after this request was "
                "filed; file the change again against its current state."
            )
        return current

    def replay(self, approval: Approval) -> str:
        """Apply an approved request; registered with the approval engine."""
        env, key, actor = approval.env, approval.target, approval.requested_by
        match approval.action:
            case "create":
                self._create(env, approval.payload, actor)
                return f"Created flag '{key}' in {env}."
            case "update":
                current = self._unchanged_since_filed(approval)
                self._update(current, approval.payload, actor)
                return f"Updated {', '.join(sorted(approval.payload))} of flag '{key}' in {env}."
            case "delete":
                self._unchanged_since_filed(approval)
                self._store.delete(env, key)
                return f"Deleted flag '{key}' from {env}."
        raise ValueError(f"flags cannot replay action '{approval.action}'")

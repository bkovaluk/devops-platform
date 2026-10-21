"""The two-person rule.

A change outside a direct environment is filed as a request carrying what it
would apply (``payload``) and what the target looked like (``before``). A
second person approves or rejects it; approving replays the stored change
through the tool's registered handler, and the outcome lands on the record as
``approved`` or ``failed`` with ``result`` saying what happened.

Rules the engine enforces for every tool:

* the reviewer is never the requester;
* only the requester may withdraw;
* only a pending request may be decided, and one older than the TTL reads as
  ``expired`` and can no longer be;
* one pending request per target at a time, so two requests cannot race to
  overwrite each other.

Whether the caller holds the scope to review is the route's call: it depends on
the request's environment, which only the route has authorization for.
"""

import logging
import secrets
from datetime import datetime, timedelta
from typing import Any, Literal

from platform_api.approvals.models import Approval, ApprovalStatus
from platform_api.approvals.registry import ApprovalRegistry
from platform_api.approvals.store import ApprovalStore
from platform_api.clock import Clock
from platform_api.errors import ApiError, Conflict, Forbidden, NotFound

logger = logging.getLogger(__name__)

type StatusFilter = Literal["pending", "all"]


def new_id(now: datetime) -> str:
    """Sortable by time of filing, unique without coordination."""
    return f"{int(now.timestamp() * 1000):013x}{secrets.token_hex(4)}"


class ApprovalEngine:
    def __init__(
        self,
        store: ApprovalStore,
        registry: ApprovalRegistry,
        *,
        ttl: timedelta,
        clock: Clock,
    ) -> None:
        self._store = store
        self._registry = registry
        self._ttl = ttl
        self._clock = clock

    def _as_read(self, approval: Approval) -> Approval:
        if approval.status == "pending" and self._clock() - approval.requested_at > self._ttl:
            return approval.model_copy(update={"status": "expired"})
        return approval

    def file(
        self,
        *,
        env: str,
        tool: str,
        action: str,
        target: str,
        payload: dict[str, Any],
        before: dict[str, Any] | None,
        requested_by: str,
    ) -> Approval:
        self._registry.handler_for(tool, action)
        for other in self.list("pending"):
            if (other.tool, other.env, other.target) == (tool, env, target):
                raise Conflict(
                    f"Request {other.id} already changes '{target}' in {env}; "
                    "approve, reject or withdraw it first."
                )
        now = self._clock()
        approval = Approval(
            id=new_id(now),
            env=env,
            tool=tool,
            action=action,
            target=target,
            payload=payload,
            before=before,
            status="pending",
            requested_by=requested_by,
            requested_at=now,
        )
        self._store.add(approval)
        logger.info(
            "approval.filed",
            extra={"fields": {"id": approval.id, "tool": tool, "action": action, "env": env}},
        )
        return approval

    def get(self, approval_id: str) -> Approval:
        approval = self._store.get(approval_id)
        if approval is None:
            raise NotFound(f"No approval request {approval_id}.")
        return self._as_read(approval)

    def list(self, status: StatusFilter) -> list[Approval]:
        approvals = [self._as_read(a) for a in self._store.list()]
        if status == "pending":
            approvals = [a for a in approvals if a.status == "pending"]
        return sorted(approvals, key=lambda a: (a.requested_at, a.id), reverse=True)

    def _pending(self, approval_id: str, verb: str) -> Approval:
        approval = self.get(approval_id)
        if approval.status == "expired":
            raise Conflict(
                f"Request {approval_id} expired before anyone decided it; file the change again."
            )
        if approval.status != "pending":
            raise Conflict(
                f"Request {approval_id} is already {approval.status}; only a pending request "
                f"can be {verb}."
            )
        return approval

    def _decided(
        self, approval: Approval, reviewer: str, status: ApprovalStatus, note: str | None
    ) -> Approval:
        return approval.model_copy(
            update={
                "status": status,
                "reviewed_by": reviewer,
                "reviewed_at": self._clock(),
                "review_note": note,
            }
        )

    def approve(self, approval_id: str, reviewer: str, note: str | None) -> Approval:
        approval = self._pending(approval_id, "approved")
        if reviewer == approval.requested_by:
            raise Forbidden("You requested this change, so someone else has to approve it.")
        handler = self._registry.handler_for(approval.tool, approval.action)
        claimed = self._store.transition(
            self._decided(approval, reviewer, "approved", note), expected="pending"
        )
        try:
            result = handler.replay(claimed)
        except ApiError as exc:
            outcome = claimed.model_copy(update={"status": "failed", "result": exc.detail})
        except Exception as exc:
            logger.error(
                "approval.replay_crashed", extra={"fields": {"id": approval_id}}, exc_info=exc
            )
            outcome = claimed.model_copy(
                update={"status": "failed", "result": f"The change could not be applied: {exc}"}
            )
        else:
            outcome = claimed.model_copy(update={"result": result})
        logger.info(
            "approval.decided",
            extra={"fields": {"id": approval_id, "status": outcome.status, "reviewer": reviewer}},
        )
        return self._store.transition(outcome, expected="approved")

    def reject(self, approval_id: str, reviewer: str, note: str) -> Approval:
        approval = self._pending(approval_id, "rejected")
        if reviewer == approval.requested_by:
            raise Forbidden("You requested this change; withdraw it instead of rejecting it.")
        rejected = self._decided(approval, reviewer, "rejected", note)
        logger.info("approval.decided", extra={"fields": {"id": approval_id, "status": "rejected"}})
        return self._store.transition(rejected, expected="pending")

    def withdraw(self, approval_id: str, requester: str) -> Approval:
        approval = self._pending(approval_id, "withdrawn")
        if requester != approval.requested_by:
            raise Forbidden(f"Only {approval.requested_by}, who filed it, can withdraw it.")
        withdrawn = approval.model_copy(update={"status": "withdrawn"})
        logger.info("approval.withdrawn", extra={"fields": {"id": approval_id}})
        return self._store.transition(withdrawn, expected="pending")

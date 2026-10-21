"""The approval queue, for every tool that registered approval actions.

A caller sees a request when they may read its tool in its environment.
Deciding one takes ``approvals:review`` in that environment; the engine adds
the rules that hold whatever the scope (never your own request, only pending
ones).
"""

from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query

from platform_api.approvals.engine import ApprovalEngine
from platform_api.approvals.models import Approval, ApproveBody, RejectBody
from platform_api.approvals.visibility import visible, visible_one
from platform_api.auth.dependencies import CurrentPrincipal
from platform_api.auth.principal import Principal, authorize
from platform_api.auth.scopes import Scope
from platform_api.context import Platform, get_platform
from platform_api.errors import AUTHENTICATED, DECISION, ITEM

router = APIRouter(prefix="/api/approvals", tags=["approvals"], responses=AUTHENTICATED)

PlatformDep = Annotated[Platform, Depends(get_platform)]


def _reviewable(engine: ApprovalEngine, principal: Principal, approval_id: str) -> Approval:
    approval = visible_one(engine, principal, approval_id)
    authorize(principal, Scope("approvals", "review", approval.env))
    return approval


@router.get("", responses=ITEM)
def list_approvals(
    platform: PlatformDep,
    principal: CurrentPrincipal,
    status: Annotated[Literal["pending", "all"], Query()] = "pending",
) -> list[Approval]:
    return [a for a in platform.approvals.list(status) if visible(principal, a)]


@router.get("/{approval_id}", responses=ITEM)
def get_approval(approval_id: str, platform: PlatformDep, principal: CurrentPrincipal) -> Approval:
    return visible_one(platform.approvals, principal, approval_id)


@router.post("/{approval_id}/approve", responses=DECISION)
def approve(
    approval_id: str,
    platform: PlatformDep,
    principal: CurrentPrincipal,
    body: ApproveBody | None = None,
) -> Approval:
    _reviewable(platform.approvals, principal, approval_id)
    return platform.approvals.approve(approval_id, principal.email, body.note if body else None)


@router.post("/{approval_id}/reject", responses=DECISION)
def reject(
    approval_id: str, body: RejectBody, platform: PlatformDep, principal: CurrentPrincipal
) -> Approval:
    _reviewable(platform.approvals, principal, approval_id)
    return platform.approvals.reject(approval_id, principal.email, body.note)


@router.post("/{approval_id}/withdraw", responses=DECISION)
def withdraw(approval_id: str, platform: PlatformDep, principal: CurrentPrincipal) -> Approval:
    visible_one(platform.approvals, principal, approval_id)
    return platform.approvals.withdraw(approval_id, principal.email)

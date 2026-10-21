"""Who sees which approval request: whoever may read its tool in its environment."""

from platform_api.approvals.engine import ApprovalEngine
from platform_api.approvals.models import Approval
from platform_api.auth.principal import Principal
from platform_api.auth.scopes import Scope
from platform_api.errors import NotFound


def visible(principal: Principal, approval: Approval) -> bool:
    return principal.holds(Scope(approval.tool, "read", approval.env))


def visible_one(engine: ApprovalEngine, principal: Principal, approval_id: str) -> Approval:
    """The request, or :class:`NotFound` when it does not exist or is not the caller's to see."""
    approval = engine.get(approval_id)
    if not visible(principal, approval):
        raise NotFound(f"No approval request {approval_id}.")
    return approval

"""What a model may do with approval requests: read them. Deciding one is for people."""

from collections.abc import Sequence
from typing import Any, Literal

from pydantic import BaseModel, Field

from platform_api.ai.actions import AiAction
from platform_api.approvals.engine import ApprovalEngine
from platform_api.approvals.visibility import visible, visible_one
from platform_api.auth.principal import Principal
from platform_api.auth.scopes import Scope


class ListApprovals(BaseModel):
    status: Literal["pending", "all"] = Field(
        default="pending", description="'pending' for the open queue, 'all' for history too"
    )


class ApprovalRef(BaseModel):
    approval_id: str = Field(description="The approval request id")


def ai_actions(engine: ApprovalEngine, tools: Sequence[str]) -> tuple[AiAction[Any], ...]:
    """Reads over the requests of *tools*, the ones that file approvals."""

    def list_approvals(principal: Principal, params: ListApprovals) -> object:
        return [a for a in engine.list(params.status) if visible(principal, a)]

    def get_approval(principal: Principal, params: ApprovalRef) -> object:
        return visible_one(engine, principal, params.approval_id)

    readers = tuple(Scope(tool, "read") for tool in tools)
    return (
        AiAction(
            "list_approvals",
            "List approval requests (changes outside the direct environments waiting for a "
            "second person), newest first, with what each would change.",
            ListApprovals,
            "read",
            readers,
            list_approvals,
        ),
        AiAction(
            "get_approval",
            "Read one approval request: the change, the item before it, who asked, and its "
            "status or result.",
            ApprovalRef,
            "read",
            readers,
            get_approval,
        ),
    )

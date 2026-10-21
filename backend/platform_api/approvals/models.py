from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

type ApprovalStatus = Literal["pending", "approved", "rejected", "withdrawn", "expired", "failed"]


class Approval(BaseModel):
    """One requested change, held until a second person decides it."""

    id: str
    env: str
    tool: str = Field(description="The tool that registered this action, e.g. 'flags'")
    action: str = Field(description="One of the tool's registered actions, e.g. 'update'")
    target: str = Field(description="The item the change is about, e.g. a flag key")
    payload: dict[str, Any] = Field(description="What the change applies when approved")
    before: dict[str, Any] | None = Field(description="The target as it was when requested")
    status: ApprovalStatus
    requested_by: str
    requested_at: datetime
    reviewed_by: str | None = None
    reviewed_at: datetime | None = None
    review_note: str | None = None
    result: str | None = Field(default=None, description="What replaying the change did")


class ApproveBody(BaseModel):
    note: str | None = Field(default=None, max_length=1000)


class RejectBody(BaseModel):
    note: str = Field(min_length=1, max_length=1000, description="Why, for the requester")

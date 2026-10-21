from datetime import datetime
from typing import Any, Final, Literal

from pydantic import BaseModel, Field, model_validator

from platform_api.approvals.models import Approval

KEY_PATTERN: Final = r"^[a-z0-9][a-z0-9._-]{0,62}$"


class Flag(BaseModel):
    key: str
    env: str
    description: str
    enabled: bool
    rollout_percent: int = Field(ge=0, le=100)
    owner: str
    updated_at: datetime
    updated_by: str


class FlagCreate(BaseModel):
    key: str = Field(pattern=KEY_PATTERN, description="Lowercase letters, digits, '.', '_', '-'")
    description: str = Field(max_length=500)
    enabled: bool
    rollout_percent: int = Field(ge=0, le=100)
    owner: str = Field(min_length=1, max_length=100)


class FlagPatch(BaseModel):
    description: str | None = Field(default=None, max_length=500)
    enabled: bool | None = None
    rollout_percent: int | None = Field(default=None, ge=0, le=100)
    owner: str | None = Field(default=None, min_length=1, max_length=100)

    @model_validator(mode="after")
    def _names_a_change(self) -> FlagPatch:
        if not self.changes():
            raise ValueError("name at least one field to change")
        return self

    def changes(self) -> dict[str, Any]:
        return self.model_dump(exclude_none=True)


class FlagApplied(BaseModel):
    """The change took effect at once (a direct environment)."""

    applied: Literal[True] = True
    flag: Flag


class ApprovalQueued(BaseModel):
    """The change waits for a second person (any other environment)."""

    applied: Literal[False] = False
    approval: Approval


class EvaluationPoint(BaseModel):
    t: datetime
    evaluations: int = Field(ge=0)
    enabled_share: float | None = Field(
        ge=0, le=1, description="Share of evaluations that returned true; null with none"
    )


class EvaluationSeries(BaseModel):
    key: str
    env: str
    points: list[EvaluationPoint] = Field(description="Oldest first, one per minute")

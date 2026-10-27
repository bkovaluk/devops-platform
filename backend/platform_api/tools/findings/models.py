"""The wire shapes of the Investigations tool: a row, its detail, a page, a review.

The DevOps agent writes the items and its shape grows; these models are this
API's own reading of them, never an import of the agent's. Everything the agent
may not have written yet is optional here, so an older item reads as a newer
one with the defaults the agent's contract names.
"""

from typing import Annotated, Any, Final, Literal

from pydantic import BaseModel, Field, StringConstraints, model_validator

from platform_api.envs import ALL

type FindingStatus = Literal["open", "acknowledged", "closed"]
type FindingWindow = Literal["24h", "7d", "30d", "90d", "365d"]
type Resolution = Literal["confirmed", "false_positive", "wrong", "dismissed"]
type Confidence = Literal["high", "medium", "low"]
type HypothesisState = Literal["likely", "ruled_out", "unverified"]
type ActionKind = Literal["change", "code", "read", "approval"]

NOTE_MAX_CHARS: Final = 500
QUERY_MAX_CHARS: Final = 200
PAGE_MAX: Final = 200

# Measured after the surrounding whitespace is dropped, as it is stored.
ReviewNote = Annotated[str, StringConstraints(strip_whitespace=True, max_length=NOTE_MAX_CHARS)]


class FindingRow(BaseModel):
    """One finding as the list shows it."""

    finding_id: str
    env: str
    created_at: str
    status: FindingStatus
    source: str | None = Field(default=None, description="'cloudwatch' or 'datadog'")
    severity: str | None = None
    title: str | None = None
    alarm_name: str | None = None
    resource_key: str | None = None
    resource_type: str | None = Field(
        default=None, description="The resource's kind, read off its key: 'Lambda', 'SQS'"
    )
    resource_name: str | None = Field(
        default=None, description="The dimension value its key names, else the alarm's name"
    )
    kind: str = "alarm"
    outcome: str | None = None
    fix_effort: str | None = None
    confidence: Confidence | None = None
    recurrence_count: int = 0
    linked_count: int = 0
    alarm_count: int | None = None
    tool_call_count: int | None = None
    tools_used: list[str] | None = None
    model: str | None = Field(default=None, description="The model id, shortened: 'opus-5.5'")
    steps: int | None = None
    error_signature: str | None = None
    resolution: Resolution | None = None
    resolved_by: str | None = None
    resolved_at: str | None = None
    acknowledged_by: str | None = None


class Evidence(BaseModel):
    """One fact the finding rests on, and the trail steps it came from."""

    kind: str | None = None
    detail: str | None = None
    steps: list[int] = []


class Hypothesis(BaseModel):
    """A cause the agent considered, where it ended up, and the steps that tested it."""

    text: str | None = None
    state: HypothesisState = "unverified"
    steps: list[int] = []


class ToolCall(BaseModel):
    """What a step called, as the agent describes it; the UI renders this, never the args.

    ``label`` is ``provider.service.action`` (``aws.s3.list_object_versions``);
    ``refused`` is set when a guard blocked the call.
    """

    provider: str
    service: str
    action: str
    label: str
    subject: str | None = None
    kind: Literal["evidence", "lookup"] = "evidence"
    refused: str | None = None


class ToolTrailStep(BaseModel):
    """One tool call of the investigation; its output is never kept."""

    step: int | None = None
    tool: str | None = None
    status: Literal["data", "empty", "error"] | None = None
    input: str | None = None
    args: dict[str, Any] | None = None
    call: ToolCall | None = None


class ContextSummary(BaseModel):
    """What the agent's context bundle held, never its content."""

    sections: dict[str, str] = {}
    counts: dict[str, int] = {}
    chars: int | None = None
    truncated: bool | None = None


class FindingHistoryEntry(BaseModel):
    """An earlier finding on the same resource."""

    finding_id: str
    created_at: str | None = None
    title: str | None = None
    status: str | None = None
    resolution: str | None = None
    outcome: str | None = None


class RunSummary(BaseModel):
    """How the investigation ended: why it stopped and what it spent."""

    stop_reason: str | None = None
    turns: int | None = None
    max_turns: int | None = None
    duration_seconds: float | None = None
    weighted_tokens: int | None = None
    token_budget: int | None = None


class CheckedFact(BaseModel):
    """A fact the agent verified with its tools, and the steps that show it."""

    text: str
    steps: list[int] = []


class FindingAction(BaseModel):
    """Something only a person can do: a change, a code fix, a denied read, an approval."""

    kind: ActionKind = "change"
    text: str
    detail: str | None = None
    command: str | None = None


class FindingDetail(FindingRow):
    """One finding whole, with the findings before it on the same resource."""

    summary: str | None = None
    likely_cause: str | None = None
    confidence_reason: str | None = None
    hypotheses: list[Hypothesis] = []
    evidence: list[Evidence] = []
    suggested_actions: list[str] = []
    actions: list[FindingAction] = []
    checked: list[CheckedFact] = []
    run: RunSummary | None = None
    tokens_used: int | None = None
    fix_effort_reason: str | None = None
    severity_floor: str | None = None
    proposed_severity: str | None = None
    alarm_arn: str | None = None
    alarm_reason: str | None = None
    alarm_time: str | None = None
    account_id: str | None = None
    region: str | None = None
    tool_trail: list[ToolTrailStep] = []
    sources_with_data: list[str] = []
    prior_finding_ids: list[str] = []
    context_summary: ContextSummary | None = None
    linked_alarms: list[str] = []
    member_alarms: list[str] = []
    incident_id: str | None = None
    linked_to: str | None = None
    previous_finding_id: str | None = None
    resolution_note: str | None = None
    acknowledged_at: str | None = None
    last_seen_at: str | None = None
    history: list[FindingHistoryEntry] = []


class FindingFacets(BaseModel):
    """Counts over the window, the status and the triage rule, before any other filter."""

    severity: dict[str, int] = {}
    outcome: dict[str, int] = {}
    effort: dict[str, int] = {}
    confidence: dict[str, int] = {}
    type: dict[str, int] = {}
    kind: dict[str, int] = {}
    tool: dict[str, int] = {}
    model: dict[str, int] = {}
    resolution: dict[str, int] = {}
    resolved_by: dict[str, int] = {}


class FindingQuery(BaseModel):
    """What the list is narrowed by. Within one facet any value matches; every facet must."""

    env: str = Field(default=ALL, description="One environment, or 'all' for every readable one")
    status: FindingStatus = "open"
    window: FindingWindow = Field(default="30d", description="'365d' is for closed findings")
    triage: bool = Field(
        default=False, description="Include the findings triage wrote without investigating"
    )
    severity: list[str] = []
    outcome: list[str] = []
    effort: list[str] = []
    confidence: list[str] = []
    type: list[str] = []
    kind: list[str] = Field(
        default=[], description="A kind, or 'has_linked' or 'repeating' for those findings"
    )
    tool: list[str] = []
    model: list[str] = []
    resolution: list[str] = []
    resolved_by: list[str] = []
    q: str = Field(
        default="",
        max_length=QUERY_MAX_CHARS,
        description="Matches title, alarm, resource or error signature",
    )
    offset: int = Field(default=0, ge=0)
    limit: int = Field(default=100, ge=1, le=PAGE_MAX)


class FindingList(BaseModel):
    env: str = Field(description="The environment selector the list was asked for")
    status: FindingStatus
    window: FindingWindow
    items: list[FindingRow] = Field(description="Newest first, one page")
    total: int = Field(description="Every finding the narrowing matches")
    facets: FindingFacets
    truncated: bool = Field(description="An environment held more than one read takes")


class ResolveFindingBody(BaseModel):
    resolution: Resolution
    note: ReviewNote | None = Field(default=None, description="Required for 'wrong'")

    @model_validator(mode="after")
    def _wrong_says_why(self) -> ResolveFindingBody:
        if self.resolution == "wrong" and not self.note:
            raise ValueError("'wrong' needs a note saying what was wrong")
        return self

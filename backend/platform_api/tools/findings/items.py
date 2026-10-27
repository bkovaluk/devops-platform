"""A findings-table item, read tolerantly into this API's shapes.

Items arrive as plain values: strings, numbers (``Decimal`` from DynamoDB),
lists, maps and ``None``. Anything absent, null, or of a type this reader does
not expect falls back to the contract's default rather than failing the page.
"""

import re
from decimal import Decimal
from typing import Any, Final, get_args

from pydantic import ValidationError

from platform_api.tools.findings.models import (
    CheckedFact,
    Confidence,
    ContextSummary,
    Evidence,
    FindingAction,
    FindingDetail,
    FindingHistoryEntry,
    FindingRow,
    Hypothesis,
    HypothesisState,
    Resolution,
    RunSummary,
    ToolCall,
    ToolTrailStep,
)

type Item = dict[str, Any]

FINDING_PREFIX: Final = "finding#"
SNAPSHOT_PREFIX: Final = "snap#"

_CONFIDENCE: Final[tuple[str, ...]] = get_args(Confidence.__value__)
_HYPOTHESIS_STATES: Final[tuple[str, ...]] = get_args(HypothesisState.__value__)
_RESOLUTIONS: Final[tuple[str, ...]] = get_args(Resolution.__value__)
_STATUSES: Final = ("open", "acknowledged", "closed")
_TRAIL_STATUSES: Final = ("data", "empty", "error")
_ACTION_KINDS: Final = frozenset({"change", "code", "read", "approval"})

# A member account's resource key is "<account id>|<key>".
_ACCOUNT_SCOPE: Final = re.compile(r"^\d{12}\|")

# `claude-<family>-<major>[-<minor>]`, then an optional release date and an
# optional Bedrock version suffix (`-20251001-v1:0`).
_CLAUDE_MODEL: Final = re.compile(
    r"claude-(?P<family>[a-z]+)-(?P<major>\d+)(?:-(?P<minor>\d{1,2}))?"
    r"(?:-\d{8})?(?:-v\d+(?::\d+)?)?$"
)

#: The attributes a row is built from; the list read projects exactly these.
ROW_ATTRIBUTES: Final[tuple[str, ...]] = (
    "pk",
    "finding_id",
    "env",
    "created_at",
    "status",
    "source",
    "severity",
    "title",
    "alarm_name",
    "resource_key",
    "kind",
    "outcome",
    "fix_effort",
    "confidence",
    "recurrence_count",
    "linked_alarms",
    "alarm_count",
    "tool_call_count",
    "tools_used",
    "model_id",
    "steps",
    "error_signature",
    "resolution",
    "resolved_by",
    "resolved_at",
    "acknowledged_by",
    "ttl",
)

#: The attributes a history entry is built from.
HISTORY_ATTRIBUTES: Final[tuple[str, ...]] = (
    "pk",
    "finding_id",
    "created_at",
    "title",
    "status",
    "resolution",
    "outcome",
)


def finding_key(finding_id: str) -> str:
    return f"{FINDING_PREFIX}{finding_id}"


def snapshot_key(finding_id: str) -> str:
    return f"{SNAPSHOT_PREFIX}{finding_id}"


def is_finding(item: Item) -> bool:
    return str(item.get("pk", "")).startswith(FINDING_PREFIX)


def is_expired(item: Item, now_epoch: int) -> bool:
    ttl = _int(item.get("ttl"))
    return ttl is not None and ttl < now_epoch


def short_model(model_id: str | None) -> str | None:
    """``us.anthropic.claude-opus-5-5`` reads ``opus-5.5``; anything else as stored."""
    if not model_id:
        return model_id
    match = _CLAUDE_MODEL.search(model_id)
    if match is None:
        return model_id
    version = match["major"] if match["minor"] is None else f"{match['major']}.{match['minor']}"
    return f"{match['family']}-{version}"


def resource_type(resource_key: str | None) -> str | None:
    """The kind of resource a key names: its CloudWatch namespace without ``AWS/``.

    A composite alarm's key starts ``alarm:`` and a Datadog monitor's ``datadog:``.
    """
    if not resource_key:
        return None
    local = _ACCOUNT_SCOPE.sub("", resource_key)
    if local.startswith("alarm:"):
        return "Composite"
    if local.startswith("datadog:"):
        return "Datadog"
    return local.split(":", 1)[0].removeprefix("AWS/")


def resource_name(resource_key: str | None, alarm_name: str | None) -> str | None:
    """The dimension value a key names, else the alarm's own name."""
    if resource_key:
        _, _, dimension = _ACCOUNT_SCOPE.sub("", resource_key).partition(":")
        _, sep, value = dimension.partition("=")
        if sep and value:
            return value
    return alarm_name


def to_row(item: Item, env: str) -> FindingRow:
    return FindingRow(**_row_fields(item, env))


def to_detail(item: Item, env: str, history: list[FindingHistoryEntry]) -> FindingDetail:
    return FindingDetail(
        **_row_fields(item, env),
        summary=_str(item.get("summary")),
        likely_cause=_str(item.get("likely_cause")),
        confidence_reason=_str(item.get("confidence_reason")),
        hypotheses=[
            Hypothesis(
                text=_str(entry.get("text")),
                state=_hypothesis_state(entry.get("state")),
                steps=_steps(entry.get("steps")),
            )
            for entry in _dicts(item.get("hypotheses"))
        ],
        evidence=[
            Evidence(
                kind=_str(entry.get("kind")),
                detail=_str(entry.get("detail")),
                steps=_steps(entry.get("steps")),
            )
            for entry in _dicts(item.get("evidence"))
        ],
        suggested_actions=_strs(item.get("suggested_actions")),
        actions=[a for a in (_action(entry) for entry in _dicts(item.get("actions"))) if a],
        checked=[
            CheckedFact(text=text, steps=_steps(entry.get("steps")))
            for entry in _dicts(item.get("checked"))
            if (text := _str(entry.get("text")))
        ],
        run=_run(item.get("run")),
        tokens_used=_int(item.get("tokens_used")),
        fix_effort_reason=_str(item.get("fix_effort_reason")),
        severity_floor=_str(item.get("severity_floor")),
        proposed_severity=_str(item.get("proposed_severity")),
        alarm_arn=_str(item.get("alarm_arn")),
        alarm_reason=_str(item.get("alarm_reason")),
        alarm_time=_str(item.get("alarm_time")),
        account_id=_str(item.get("account_id")),
        region=_str(item.get("region")),
        tool_trail=[_trail_step(step) for step in _dicts(item.get("tool_trail"))],
        sources_with_data=_strs(item.get("sources_with_data")),
        prior_finding_ids=_strs(item.get("prior_finding_ids")),
        context_summary=_context_summary(item.get("context_summary")),
        linked_alarms=_strs(item.get("linked_alarms")),
        member_alarms=_strs(item.get("member_alarms")),
        incident_id=_str(item.get("incident_id")),
        linked_to=_str(item.get("linked_to")),
        previous_finding_id=_str(item.get("previous_finding_id")),
        resolution_note=_str(item.get("resolution_note")),
        acknowledged_at=_str(item.get("acknowledged_at")),
        last_seen_at=_str(item.get("last_seen_at")),
        history=history,
    )


def to_history_entry(item: Item) -> FindingHistoryEntry:
    return FindingHistoryEntry(
        finding_id=finding_id_of(item),
        created_at=_str(item.get("created_at")),
        title=_str(item.get("title")),
        status=_str(item.get("status")),
        resolution=_str(item.get("resolution")),
        outcome=_str(item.get("outcome")),
    )


def finding_id_of(item: Item) -> str:
    stored = _str(item.get("finding_id"))
    if stored:
        return stored
    return str(item.get("pk", "")).removeprefix(FINDING_PREFIX)


def status_of(item: Item) -> str:
    status = item.get("status")
    return status if status in _STATUSES else "open"


def _row_fields(item: Item, env: str) -> dict[str, Any]:
    key = _str(item.get("resource_key"))
    alarm_name = _str(item.get("alarm_name"))
    tools_used = item.get("tools_used")
    resolution = item.get("resolution")
    return {
        "finding_id": finding_id_of(item),
        "env": _str(item.get("env")) or env,
        "created_at": _str(item.get("created_at")) or "",
        "status": status_of(item),
        "source": _str(item.get("source")),
        "severity": _str(item.get("severity")),
        "title": _str(item.get("title")),
        "alarm_name": alarm_name,
        "resource_key": key,
        "resource_type": resource_type(key),
        "resource_name": resource_name(key, alarm_name),
        "kind": _str(item.get("kind")) or "alarm",
        "outcome": _str(item.get("outcome")),
        "fix_effort": _str(item.get("fix_effort")),
        "confidence": _confidence(item.get("confidence")),
        "recurrence_count": _int(item.get("recurrence_count")) or 0,
        "linked_count": len(_strs(item.get("linked_alarms"))),
        "alarm_count": _int(item.get("alarm_count")),
        "tool_call_count": _int(item.get("tool_call_count")),
        "tools_used": _strs(tools_used) if isinstance(tools_used, (list, tuple, set)) else None,
        "model": short_model(_str(item.get("model_id"))),
        "steps": _int(item.get("steps")),
        "error_signature": _str(item.get("error_signature")),
        "resolution": resolution if resolution in _RESOLUTIONS else None,
        "resolved_by": _str(item.get("resolved_by")),
        "resolved_at": _str(item.get("resolved_at")),
        "acknowledged_by": _str(item.get("acknowledged_by")),
    }


def _trail_step(step: Item) -> ToolTrailStep:
    args = step.get("args")
    status = step.get("status")
    return ToolTrailStep(
        step=_int(step.get("step")),
        tool=_str(step.get("tool")),
        status=status if status in _TRAIL_STATUSES else None,
        input=_str(step.get("input")),
        args=_plain({str(k): v for k, v in args.items()}) if isinstance(args, dict) else None,
        call=_call(step.get("call")),
    )


def _action(entry: Item) -> FindingAction | None:
    """An action as the agent wrote it, or None without text; an unknown kind reads as change."""
    text = _str(entry.get("text"))
    if not text:
        return None
    kind = entry.get("kind")
    return FindingAction(
        kind=kind if kind in _ACTION_KINDS else "change",
        text=text,
        detail=_str(entry.get("detail")),
        command=_str(entry.get("command")),
    )


def _run(value: Any) -> RunSummary | None:
    """How the run ended, or None for an older finding or one that does not parse."""
    if not isinstance(value, dict):
        return None
    duration = value.get("duration_seconds")
    return RunSummary(
        stop_reason=_str(value.get("stop_reason")),
        turns=_int(value.get("turns")),
        max_turns=_int(value.get("max_turns")),
        duration_seconds=float(duration) if isinstance(duration, (int, float, Decimal)) else None,
        weighted_tokens=_int(value.get("weighted_tokens")),
        token_budget=_int(value.get("token_budget")),
    )


def _call(value: Any) -> ToolCall | None:
    """The agent's call descriptor, or None for an older step or one that does not parse."""
    if not isinstance(value, dict):
        return None
    try:
        return ToolCall.model_validate(value)
    except ValidationError:
        return None


def _context_summary(value: Any) -> ContextSummary | None:
    if not isinstance(value, dict):
        return None
    sections = value.get("sections")
    counts = value.get("counts")
    truncated = value.get("truncated")
    return ContextSummary(
        sections={
            str(name): str(status)
            for name, status in (sections.items() if isinstance(sections, dict) else ())
            if status is not None
        },
        counts={
            str(name): count
            for name, raw in (counts.items() if isinstance(counts, dict) else ())
            if (count := _int(raw)) is not None
        },
        chars=_int(value.get("chars")),
        truncated=truncated if isinstance(truncated, bool) else None,
    )


def _confidence(value: Any) -> Confidence | None:
    return value if value in _CONFIDENCE else None


def _hypothesis_state(value: Any) -> HypothesisState:
    return value if value in _HYPOTHESIS_STATES else "unverified"


def _steps(value: Any) -> list[int]:
    """The trail steps cited: whole numbers from 1, anything else dropped."""
    if not isinstance(value, (list, tuple, set)):
        return []
    entries = sorted(value) if isinstance(value, set) else value
    numbers = (_int(entry) for entry in entries if not isinstance(entry, float))
    return [number for number in numbers if number is not None and number >= 1]


def _plain(value: Any) -> Any:
    """A stored value with DynamoDB's numbers as ints or floats, so it reads as JSON."""
    if isinstance(value, Decimal):
        return int(value) if value == value.to_integral_value() else float(value)
    if isinstance(value, dict):
        return {str(key): _plain(entry) for key, entry in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [_plain(entry) for entry in value]
    return value


def _str(value: Any) -> str | None:
    if value is None or isinstance(value, (dict, list, set, bool)):
        return None
    if isinstance(value, Decimal):
        return str(_plain(value))
    return str(value)


def _int(value: Any) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float, Decimal)):
        return int(value)
    if isinstance(value, str):
        try:
            return int(value)
        except ValueError:
            return None
    return None


def _strs(value: Any) -> list[str]:
    """A list as stored; a string set (which DynamoDB keeps unordered) sorted."""
    if not isinstance(value, (list, set, tuple)):
        return []
    entries = sorted(value, key=str) if isinstance(value, set) else value
    return [str(entry) for entry in entries if entry is not None and not isinstance(entry, dict)]


def _dicts(value: Any) -> list[Item]:
    if not isinstance(value, list):
        return []
    return [entry for entry in value if isinstance(entry, dict)]

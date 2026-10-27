"""The DevOps agent's findings, read and reviewed in the environment they were written in.

A review is a person's verdict on the agent's own record, not a change to the
environment the finding is about, so acknowledging and closing apply at once in
every environment rather than going through the approval engine.

Retention follows the agent's contract: an acknowledged finding keeps 90 days
from the acknowledgement, a closed one 365 days from the close, and its
snapshot is extended to match so it can be replayed as an eval case.
"""

import logging
from collections import Counter
from collections.abc import Iterable, Sequence
from datetime import datetime, timedelta
from typing import Final

from platform_api.clock import Clock
from platform_api.envs import fan_out
from platform_api.errors import BadRequest, Conflict, NotFound
from platform_api.tools.findings.items import (
    Item,
    finding_id_of,
    is_expired,
    status_of,
    to_detail,
    to_history_entry,
    to_row,
)
from platform_api.tools.findings.models import (
    FindingDetail,
    FindingFacets,
    FindingHistoryEntry,
    FindingList,
    FindingQuery,
    FindingRow,
    ResolveFindingBody,
)
from platform_api.tools.findings.store import Acknowledgement, Closing, FindingStore

logger = logging.getLogger(__name__)

TOOL: Final = "findings"

WINDOWS: Final[dict[str, timedelta]] = {
    "24h": timedelta(hours=24),
    "7d": timedelta(days=7),
    "30d": timedelta(days=30),
    "90d": timedelta(days=90),
    "365d": timedelta(days=365),
}
CLOSED_ONLY_WINDOW: Final = "365d"

ACKNOWLEDGED_RETENTION: Final = timedelta(days=90)
CLOSED_RETENTION: Final = timedelta(days=365)

#: Findings triage wrote without an investigation; the list leaves them out unless asked.
TRIAGE_KINDS: Final = frozenset({"skipped", "deferred", "linked", "grouped", "storm"})
HAS_LINKED: Final = "has_linked"
REPEATING: Final = "repeating"

#: Resolutions that grade a reported cause.
GRADES: Final = frozenset({"confirmed", "false_positive", "wrong"})

HISTORY_READ: Final = 12
HISTORY_KEEP: Final = 5


def _expiry(at: datetime, retention: timedelta) -> int:
    return int((at + retention).timestamp())


class FindingService:
    def __init__(self, store: FindingStore, clock: Clock) -> None:
        self._store = store
        self._clock = clock

    def list(self, envs: list[str], ask: FindingQuery) -> FindingList:
        """One status's findings over the window in *envs*, faceted, filtered, newest first."""
        if ask.window == CLOSED_ONLY_WINDOW and ask.status != "closed":
            raise BadRequest(
                f"The {CLOSED_ONLY_WINDOW} window is for closed findings; pick a shorter one."
            )
        now = self._clock()
        since = (now - WINDOWS[ask.window]).isoformat()
        now_epoch = int(now.timestamp())

        def read(env: str) -> list[tuple[list[FindingRow], bool]]:
            items, truncated = self._store.window(env, ask.status, since)
            rows = [to_row(item, env) for item in items if not is_expired(item, now_epoch)]
            return [(rows, truncated)]

        reads = fan_out(envs, read)
        rows = [row for env_rows, _ in reads for row in env_rows]
        admitted = TRIAGE_KINDS if ask.triage else TRIAGE_KINDS & set(ask.kind)
        in_window = [row for row in rows if row.kind not in TRIAGE_KINDS or row.kind in admitted]
        matching = [row for row in in_window if _matches(row, ask)]
        matching.sort(key=lambda row: row.created_at, reverse=True)
        return FindingList(
            env=ask.env,
            status=ask.status,
            window=ask.window,
            items=matching[ask.offset : ask.offset + ask.limit],
            total=len(matching),
            facets=_facets(in_window),
            truncated=any(truncated for _, truncated in reads),
        )

    def get(self, env: str, finding_id: str) -> FindingDetail:
        """One finding whole, with up to five earlier findings on its resource."""
        item = self._item(env, finding_id)
        return to_detail(item, env, _history(self._store, env, item))

    def acknowledge(self, env: str, finding_id: str, actor: str) -> FindingDetail:
        """Somebody is looking at an open finding."""
        now = self._clock()
        ack = Acknowledgement(
            at=now.isoformat(), by=actor, ttl=_expiry(now, ACKNOWLEDGED_RETENTION)
        )
        if not self._store.acknowledge(env, finding_id, ack):
            current = self._item(env, finding_id)
            raise Conflict(
                f"Finding {finding_id} is {status_of(current)}; only an open finding "
                "can be acknowledged."
            )
        logger.info(
            "finding.acknowledged",
            extra={"fields": {"env": env, "finding_id": finding_id, "actor": actor}},
        )
        return self.get(env, finding_id)

    def close(
        self, env: str, finding_id: str, body: ResolveFindingBody, actor: str
    ) -> FindingDetail:
        """Close a finding with a verdict on what the agent reported."""
        current = self._item(env, finding_id)
        if status_of(current) == "closed":
            raise _already_closed(finding_id, current)
        _check_resolution(finding_id, body.resolution, current.get("outcome"))
        now = self._clock()
        ttl = _expiry(now, CLOSED_RETENTION)
        closing = Closing(
            resolution=body.resolution,
            note=body.note or None,
            at=now.isoformat(),
            by=actor,
            ttl=ttl,
        )
        if not self._store.close(env, finding_id, closing):
            raise _already_closed(finding_id, self._item(env, finding_id))
        self._store.extend_snapshot(env, finding_id, ttl)
        logger.info(
            "finding.closed",
            extra={
                "fields": {
                    "env": env,
                    "finding_id": finding_id,
                    "actor": actor,
                    "resolution": body.resolution,
                }
            },
        )
        return self.get(env, finding_id)

    def _item(self, env: str, finding_id: str) -> Item:
        item = self._store.get(env, finding_id)
        if item is None:
            raise NotFound(f"No finding {finding_id} in {env}; it may have expired.")
        return item


def _history(store: FindingStore, env: str, item: Item) -> list[FindingHistoryEntry]:
    """Up to five earlier findings on the item's resource, newest first."""
    resource_key = item.get("resource_key")
    if not isinstance(resource_key, str) or not resource_key:
        return []
    own = finding_id_of(item)
    earlier = store.on_resource(env, resource_key, HISTORY_READ)
    return [to_history_entry(entry) for entry in earlier if finding_id_of(entry) != own][
        :HISTORY_KEEP
    ]


def _already_closed(finding_id: str, item: Item) -> Conflict:
    resolver = item.get("resolved_by")
    by = resolver if isinstance(resolver, str) and resolver else "someone else"
    return Conflict(f"Finding {finding_id} is already closed by {by}.")


def _check_resolution(finding_id: str, resolution: str, outcome: object) -> None:
    """What a resolution may say, given what the agent reported.

    A finding stored without an outcome counts as reported.
    """
    reported = outcome in (None, "reported")
    if resolution in GRADES and not reported:
        raise Conflict(
            f"Finding {finding_id} reported no cause ({outcome}), so there is nothing to "
            f"grade as {resolution}; close it as dismissed."
        )
    if resolution == "dismissed" and reported:
        raise Conflict(
            f"Finding {finding_id} reported a cause; close it as confirmed, "
            "false_positive or wrong."
        )


def _matches(row: FindingRow, ask: FindingQuery) -> bool:
    return (
        _among(row.severity, ask.severity)
        and _among(row.outcome, ask.outcome)
        and _among(row.fix_effort, ask.effort)
        and _among(row.confidence, ask.confidence)
        and _among(row.resource_type, ask.type)
        and _kind_matches(row, ask.kind)
        and (not ask.tool or any(tool in ask.tool for tool in row.tools_used or ()))
        and _among(row.model, ask.model)
        and _among(row.resolution, ask.resolution)
        and _among(row.resolved_by, ask.resolved_by)
        and _searched(row, ask.q)
    )


def _among(value: str | None, wanted: Sequence[str]) -> bool:
    return not wanted or value in wanted


def _kind_matches(row: FindingRow, wanted: Sequence[str]) -> bool:
    return (
        not wanted
        or row.kind in wanted
        or (HAS_LINKED in wanted and row.linked_count > 0)
        or (REPEATING in wanted and row.recurrence_count > 0)
    )


def _searched(row: FindingRow, q: str) -> bool:
    needle = q.strip().lower()
    if not needle:
        return True
    haystack = (row.title, row.alarm_name, row.resource_name, row.error_signature)
    return any(needle in field.lower() for field in haystack if field)


def _facets(rows: Iterable[FindingRow]) -> FindingFacets:
    counts: dict[str, Counter[str]] = {name: Counter() for name in FindingFacets.model_fields}
    for row in rows:
        _tally(counts["severity"], row.severity)
        _tally(counts["outcome"], row.outcome)
        _tally(counts["effort"], row.fix_effort)
        _tally(counts["confidence"], row.confidence)
        _tally(counts["type"], row.resource_type)
        _tally(counts["kind"], row.kind)
        if row.linked_count > 0:
            counts["kind"][HAS_LINKED] += 1
        if row.recurrence_count > 0:
            counts["kind"][REPEATING] += 1
        for tool in dict.fromkeys(row.tools_used or ()):
            counts["tool"][tool] += 1
        _tally(counts["model"], row.model)
        _tally(counts["resolution"], row.resolution)
        _tally(counts["resolved_by"], row.resolved_by)
    return FindingFacets(**{name: dict(counter) for name, counter in counts.items()})


def _tally(counter: Counter[str], value: str | None) -> None:
    if value is not None:
        counter[value] += 1

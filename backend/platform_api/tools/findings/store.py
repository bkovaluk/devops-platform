"""Where the DevOps agent's findings are read, and their review written.

The agent owns its table. This store reads ``finding#`` items and writes only
the review fields of one: ``status``, ``acknowledged_at``, ``acknowledged_by``,
``resolution``, ``resolution_note``, ``resolved_at``, ``resolved_by`` and
``ttl``, plus the ``ttl`` of its ``snap#`` item on close. Every write names
nothing else.

:class:`DynamoFindingStore` reads each env's table in that env's account; a
list is one ``by_status`` query over the window, newest first and capped, and
the table is never scanned. :class:`MemoryFindingStore` holds the same items
for a run without AWS.
"""

import logging
import threading
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any, Final, Protocol

from boto3.dynamodb.types import TypeDeserializer
from botocore.exceptions import BotoCoreError, ClientError

from platform_api.aws import get_boto3_client
from platform_api.config import Settings
from platform_api.storage import is_condition_failure, upstream
from platform_api.tools.findings.items import (
    HISTORY_ATTRIBUTES,
    ROW_ATTRIBUTES,
    Item,
    finding_key,
    is_finding,
    snapshot_key,
)

logger = logging.getLogger(__name__)

STATUS_INDEX: Final = "by_status"
RESOURCE_INDEX: Final = "by_resource"

#: The most findings one window read takes from one env.
WINDOW_CAP: Final = 5_000

_deserializer = TypeDeserializer()


@dataclass(frozen=True, slots=True)
class Acknowledgement:
    at: str
    by: str
    ttl: int


@dataclass(frozen=True, slots=True)
class Closing:
    resolution: str
    note: str | None
    at: str
    by: str
    ttl: int


class FindingStore(Protocol):
    def window(self, env: str, status: str, since: str) -> tuple[list[Item], bool]:
        """Findings in *status* created at or after *since*, newest first, and whether cut."""
        ...

    def get(self, env: str, finding_id: str) -> Item | None: ...

    def on_resource(self, env: str, resource_key: str, limit: int) -> list[Item]:
        """The newest findings on a resource key, any status, newest first."""
        ...

    def acknowledge(self, env: str, finding_id: str, ack: Acknowledgement) -> bool:
        """Mark an open finding acknowledged; False when it is missing or not open."""
        ...

    def close(self, env: str, finding_id: str, closing: Closing) -> bool:
        """Close an unclosed finding with a resolution; False when missing or closed."""
        ...

    def extend_snapshot(self, env: str, finding_id: str, ttl: int) -> None:
        """Keep the finding's snapshot as long as the closed finding; never raises."""
        ...


class MemoryFindingStore:
    def __init__(self) -> None:
        self._items: dict[tuple[str, str], Item] = {}
        self._lock = threading.Lock()

    def put(self, env: str, item: Item) -> None:
        """Hold an item as the agent would have written it."""
        with self._lock:
            self._items[(env, str(item["pk"]))] = dict(item)

    def window(self, env: str, status: str, since: str) -> tuple[list[Item], bool]:
        with self._lock:
            found = [
                dict(item)
                for (e, _), item in self._items.items()
                if e == env
                and is_finding(item)
                and item.get("status") == status
                and str(item.get("created_at", "")) >= since
            ]
        found.sort(key=lambda item: str(item.get("created_at", "")), reverse=True)
        return found[:WINDOW_CAP], len(found) > WINDOW_CAP

    def get(self, env: str, finding_id: str) -> Item | None:
        with self._lock:
            item = self._items.get((env, finding_key(finding_id)))
        return dict(item) if item else None

    def snapshot(self, env: str, finding_id: str) -> Item | None:
        with self._lock:
            item = self._items.get((env, snapshot_key(finding_id)))
        return dict(item) if item else None

    def on_resource(self, env: str, resource_key: str, limit: int) -> list[Item]:
        with self._lock:
            found = [
                dict(item)
                for (e, _), item in self._items.items()
                if e == env and is_finding(item) and item.get("resource_key") == resource_key
            ]
        found.sort(key=lambda item: str(item.get("created_at", "")), reverse=True)
        return found[:limit]

    def acknowledge(self, env: str, finding_id: str, ack: Acknowledgement) -> bool:
        with self._lock:
            item = self._items.get((env, finding_key(finding_id)))
            if item is None or item.get("status") != "open":
                return False
            item.update(
                status="acknowledged", acknowledged_at=ack.at, acknowledged_by=ack.by, ttl=ack.ttl
            )
            return True

    def close(self, env: str, finding_id: str, closing: Closing) -> bool:
        with self._lock:
            item = self._items.get((env, finding_key(finding_id)))
            if item is None or item.get("status") == "closed":
                return False
            item.update(
                status="closed",
                resolution=closing.resolution,
                resolved_at=closing.at,
                resolved_by=closing.by,
                ttl=closing.ttl,
            )
            if closing.note is None:
                item.pop("resolution_note", None)
            else:
                item["resolution_note"] = closing.note
            return True

    def extend_snapshot(self, env: str, finding_id: str, ttl: int) -> None:
        with self._lock:
            snapshot = self._items.get((env, snapshot_key(finding_id)))
            if snapshot is not None:
                snapshot["ttl"] = ttl


def _names(*attributes: str) -> dict[str, str]:
    return {f"#{attribute}": attribute for attribute in attributes}


def _plain(raw: dict[str, Any]) -> Item:
    return {key: _deserializer.deserialize(value) for key, value in raw.items()}


class DynamoFindingStore:
    """Each env's findings table, through a client acting in that env's account."""

    def __init__(self, client_for: Callable[[str], Any], table_for: Callable[[str], str]) -> None:
        self._client_for = client_for
        self._table_for = table_for

    def window(self, env: str, status: str, since: str) -> tuple[list[Item], bool]:
        names = _names(*ROW_ATTRIBUTES)
        kwargs: dict[str, Any] = {
            "TableName": self._table_for(env),
            "IndexName": STATUS_INDEX,
            "KeyConditionExpression": "#status = :status AND #created_at >= :since",
            "ExpressionAttributeNames": names,
            "ExpressionAttributeValues": {":status": {"S": status}, ":since": {"S": since}},
            "ProjectionExpression": ", ".join(names),
            "ScanIndexForward": False,
        }
        items: list[Item] = []
        try:
            client = self._client_for(env)
            while True:
                response = client.query(**kwargs, Limit=WINDOW_CAP - len(items))
                items.extend(_plain(raw) for raw in response.get("Items", []))
                token = response.get("LastEvaluatedKey")
                if not token:
                    return items, False
                if len(items) >= WINDOW_CAP:
                    return items, True
                kwargs["ExclusiveStartKey"] = token
        except (ClientError, BotoCoreError) as exc:
            raise upstream(exc, f"listing findings in {env}") from exc

    def get(self, env: str, finding_id: str) -> Item | None:
        try:
            response = self._client_for(env).get_item(
                TableName=self._table_for(env),
                Key={"pk": {"S": finding_key(finding_id)}},
                ConsistentRead=True,
            )
        except (ClientError, BotoCoreError) as exc:
            raise upstream(exc, f"reading finding {finding_id} in {env}") from exc
        raw = response.get("Item")
        return _plain(raw) if raw else None

    def on_resource(self, env: str, resource_key: str, limit: int) -> list[Item]:
        names = _names(*HISTORY_ATTRIBUTES)
        projection = ", ".join(names)
        names["#resource_key"] = "resource_key"
        try:
            response = self._client_for(env).query(
                TableName=self._table_for(env),
                IndexName=RESOURCE_INDEX,
                KeyConditionExpression="#resource_key = :key",
                ExpressionAttributeNames=names,
                ExpressionAttributeValues={":key": {"S": resource_key}},
                ProjectionExpression=projection,
                ScanIndexForward=False,
                Limit=limit,
            )
        except (ClientError, BotoCoreError) as exc:
            raise upstream(exc, f"reading the history of a resource in {env}") from exc
        return [_plain(raw) for raw in response.get("Items", [])]

    def _update(self, env: str, doing: str, **kwargs: Any) -> bool:
        try:
            self._client_for(env).update_item(
                TableName=self._table_for(env), ReturnValues="NONE", **kwargs
            )
        except ClientError as exc:
            if is_condition_failure(exc):
                return False
            raise upstream(exc, doing) from exc
        except BotoCoreError as exc:
            raise upstream(exc, doing) from exc
        return True

    def acknowledge(self, env: str, finding_id: str, ack: Acknowledgement) -> bool:
        return self._update(
            env,
            f"acknowledging finding {finding_id} in {env}",
            Key={"pk": {"S": finding_key(finding_id)}},
            UpdateExpression=(
                "SET #status = :acknowledged, #acknowledged_at = :at, "
                "#acknowledged_by = :by, #ttl = :ttl"
            ),
            ConditionExpression="attribute_exists(pk) AND #status = :open",
            ExpressionAttributeNames=_names("status", "acknowledged_at", "acknowledged_by", "ttl"),
            ExpressionAttributeValues={
                ":acknowledged": {"S": "acknowledged"},
                ":open": {"S": "open"},
                ":at": {"S": ack.at},
                ":by": {"S": ack.by},
                ":ttl": {"N": str(ack.ttl)},
            },
        )

    def close(self, env: str, finding_id: str, closing: Closing) -> bool:
        names = _names(
            "status", "resolution", "resolution_note", "resolved_at", "resolved_by", "ttl"
        )
        values: dict[str, Any] = {
            ":closed": {"S": "closed"},
            ":resolution": {"S": closing.resolution},
            ":at": {"S": closing.at},
            ":by": {"S": closing.by},
            ":ttl": {"N": str(closing.ttl)},
        }
        assignments = [
            "#status = :closed",
            "#resolution = :resolution",
            "#resolved_at = :at",
            "#resolved_by = :by",
            "#ttl = :ttl",
        ]
        if closing.note is None:
            expression = f"SET {', '.join(assignments)} REMOVE #resolution_note"
        else:
            values[":note"] = {"S": closing.note}
            expression = f"SET {', '.join([*assignments, '#resolution_note = :note'])}"
        return self._update(
            env,
            f"closing finding {finding_id} in {env}",
            Key={"pk": {"S": finding_key(finding_id)}},
            UpdateExpression=expression,
            ConditionExpression="attribute_exists(pk) AND #status <> :closed",
            ExpressionAttributeNames=names,
            ExpressionAttributeValues=values,
        )

    def extend_snapshot(self, env: str, finding_id: str, ttl: int) -> None:
        try:
            self._client_for(env).update_item(
                TableName=self._table_for(env),
                Key={"pk": {"S": snapshot_key(finding_id)}},
                UpdateExpression="SET #ttl = :ttl",
                ConditionExpression="attribute_exists(pk)",
                ExpressionAttributeNames=_names("ttl"),
                ExpressionAttributeValues={":ttl": {"N": str(ttl)}},
                ReturnValues="NONE",
            )
        except ClientError as exc:
            if is_condition_failure(exc):
                return
            logger.warning(
                "finding.snapshot_ttl_not_extended",
                extra={"fields": {"env": env, "finding_id": finding_id}},
                exc_info=exc,
            )
        except BotoCoreError as exc:
            logger.warning(
                "finding.snapshot_ttl_not_extended",
                extra={"fields": {"env": env, "finding_id": finding_id}},
                exc_info=exc,
            )


def build_finding_store(settings: Settings) -> FindingStore:
    if settings.store == "dynamodb":
        return DynamoFindingStore(
            lambda env: get_boto3_client("dynamodb", env), settings.findings_table
        )
    return MemoryFindingStore()

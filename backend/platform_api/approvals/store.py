"""Where approval requests are kept.

The store holds records as stored; the engine decides what they read as
(a pending request past its TTL reads as ``expired`` without being rewritten).
:meth:`ApprovalStore.transition` is the only write after creation and is
conditional on the stored status, so two reviewers racing on one request
cannot both win.
"""

import json
import threading
from typing import Any, Final, Protocol

from botocore.exceptions import BotoCoreError, ClientError

from platform_api.approvals.models import Approval, ApprovalStatus
from platform_api.errors import Conflict
from platform_api.storage import is_condition_failure, upstream

PARTITION: Final = "APPROVAL"


def _moved_on(approval_id: str, expected: ApprovalStatus) -> Conflict:
    return Conflict(
        f"Request {approval_id} is no longer {expected}; reload it to see what changed."
    )


class ApprovalStore(Protocol):
    def add(self, approval: Approval) -> None: ...

    def get(self, approval_id: str) -> Approval | None: ...

    def list(self) -> list[Approval]: ...

    def transition(self, updated: Approval, expected: ApprovalStatus) -> Approval:
        """Replace the record with *updated* if its stored status is *expected*."""
        ...


class MemoryApprovalStore:
    def __init__(self) -> None:
        self._items: dict[str, Approval] = {}
        self._lock = threading.Lock()

    def add(self, approval: Approval) -> None:
        with self._lock:
            self._items[approval.id] = approval

    def get(self, approval_id: str) -> Approval | None:
        with self._lock:
            return self._items.get(approval_id)

    def list(self) -> list[Approval]:
        with self._lock:
            return list(self._items.values())

    def transition(self, updated: Approval, expected: ApprovalStatus) -> Approval:
        with self._lock:
            current = self._items.get(updated.id)
            if current is None or current.status != expected:
                raise _moved_on(updated.id, expected)
            self._items[updated.id] = updated
            return updated


class DynamoApprovalStore:
    def __init__(self, client: Any, table: str) -> None:
        self._client = client
        self._table = table

    @staticmethod
    def _item(approval: Approval) -> dict[str, Any]:
        return {
            "pk": {"S": PARTITION},
            "sk": {"S": approval.id},
            "status": {"S": approval.status},
            "doc": {"S": approval.model_dump_json()},
        }

    @staticmethod
    def _approval(item: dict[str, Any]) -> Approval:
        return Approval.model_validate(json.loads(item["doc"]["S"]))

    def add(self, approval: Approval) -> None:
        try:
            self._client.put_item(
                TableName=self._table,
                Item=self._item(approval),
                ConditionExpression="attribute_not_exists(pk)",
            )
        except (ClientError, BotoCoreError) as exc:
            raise upstream(exc, "filing the approval request") from exc

    def get(self, approval_id: str) -> Approval | None:
        try:
            response = self._client.get_item(
                TableName=self._table,
                Key={"pk": {"S": PARTITION}, "sk": {"S": approval_id}},
            )
        except (ClientError, BotoCoreError) as exc:
            raise upstream(exc, "reading the approval request") from exc
        item = response.get("Item")
        return self._approval(item) if item else None

    def list(self) -> list[Approval]:
        approvals: list[Approval] = []
        kwargs: dict[str, Any] = {
            "TableName": self._table,
            "KeyConditionExpression": "pk = :pk",
            "ExpressionAttributeValues": {":pk": {"S": PARTITION}},
        }
        try:
            while True:
                response = self._client.query(**kwargs)
                approvals.extend(self._approval(item) for item in response.get("Items", []))
                if "LastEvaluatedKey" not in response:
                    return approvals
                kwargs["ExclusiveStartKey"] = response["LastEvaluatedKey"]
        except (ClientError, BotoCoreError) as exc:
            raise upstream(exc, "listing approval requests") from exc

    def transition(self, updated: Approval, expected: ApprovalStatus) -> Approval:
        try:
            self._client.put_item(
                TableName=self._table,
                Item=self._item(updated),
                ConditionExpression="#status = :expected",
                ExpressionAttributeNames={"#status": "status"},
                ExpressionAttributeValues={":expected": {"S": expected}},
            )
        except ClientError as exc:
            if is_condition_failure(exc):
                raise _moved_on(updated.id, expected) from exc
            raise upstream(exc, "updating the approval request") from exc
        except BotoCoreError as exc:
            raise upstream(exc, "updating the approval request") from exc
        return updated

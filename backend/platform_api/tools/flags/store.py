"""Where flags are kept, behind one small interface.

:class:`MemoryFlagStore` is the default and lives as long as the process;
:class:`DynamoFlagStore` keeps one item per flag under ``pk = FLAG#<env>``,
``sk = <key>`` in the shared table.
"""

import json
import threading
from typing import Any, Protocol

from botocore.exceptions import BotoCoreError, ClientError

from platform_api.config import Settings
from platform_api.errors import Conflict, NotFound
from platform_api.storage import dynamodb_client, is_condition_failure, upstream
from platform_api.tools.flags.models import Flag


def _exists(flag: Flag) -> Conflict:
    return Conflict(f"Flag '{flag.key}' already exists in {flag.env}; edit it instead.")


def _missing(env: str, key: str) -> NotFound:
    return NotFound(f"No flag '{key}' in {env}.")


class FlagStore(Protocol):
    def list(self, env: str) -> list[Flag]:
        """Every flag in *env*, ordered by key."""
        ...

    def get(self, env: str, key: str) -> Flag | None: ...

    def create(self, flag: Flag) -> None:
        """Add *flag*; :class:`Conflict` if its key is taken in its env."""
        ...

    def put(self, flag: Flag) -> None:
        """Replace an existing flag; :class:`NotFound` if it is gone."""
        ...

    def delete(self, env: str, key: str) -> None:
        """Remove a flag; :class:`NotFound` if it is gone."""
        ...


class MemoryFlagStore:
    def __init__(self) -> None:
        self._flags: dict[tuple[str, str], Flag] = {}
        self._lock = threading.Lock()

    def list(self, env: str) -> list[Flag]:
        with self._lock:
            return sorted((f for (e, _), f in self._flags.items() if e == env), key=lambda f: f.key)

    def get(self, env: str, key: str) -> Flag | None:
        with self._lock:
            return self._flags.get((env, key))

    def create(self, flag: Flag) -> None:
        with self._lock:
            if (flag.env, flag.key) in self._flags:
                raise _exists(flag)
            self._flags[(flag.env, flag.key)] = flag

    def put(self, flag: Flag) -> None:
        with self._lock:
            if (flag.env, flag.key) not in self._flags:
                raise _missing(flag.env, flag.key)
            self._flags[(flag.env, flag.key)] = flag

    def delete(self, env: str, key: str) -> None:
        with self._lock:
            if self._flags.pop((env, key), None) is None:
                raise _missing(env, key)


class DynamoFlagStore:
    def __init__(self, client: Any, table: str) -> None:
        self._client = client
        self._table = table

    @staticmethod
    def _key(env: str, key: str) -> dict[str, Any]:
        return {"pk": {"S": f"FLAG#{env}"}, "sk": {"S": key}}

    @classmethod
    def _item(cls, flag: Flag) -> dict[str, Any]:
        return {**cls._key(flag.env, flag.key), "doc": {"S": flag.model_dump_json()}}

    @staticmethod
    def _flag(item: dict[str, Any]) -> Flag:
        return Flag.model_validate(json.loads(item["doc"]["S"]))

    def list(self, env: str) -> list[Flag]:
        flags: list[Flag] = []
        kwargs: dict[str, Any] = {
            "TableName": self._table,
            "KeyConditionExpression": "pk = :pk",
            "ExpressionAttributeValues": {":pk": {"S": f"FLAG#{env}"}},
        }
        try:
            while True:
                response = self._client.query(**kwargs)
                flags.extend(self._flag(item) for item in response.get("Items", []))
                if "LastEvaluatedKey" not in response:
                    return flags
                kwargs["ExclusiveStartKey"] = response["LastEvaluatedKey"]
        except (ClientError, BotoCoreError) as exc:
            raise upstream(exc, f"listing flags in {env}") from exc

    def get(self, env: str, key: str) -> Flag | None:
        try:
            response = self._client.get_item(TableName=self._table, Key=self._key(env, key))
        except (ClientError, BotoCoreError) as exc:
            raise upstream(exc, f"reading flag '{key}' in {env}") from exc
        item = response.get("Item")
        return self._flag(item) if item else None

    def _write(self, flag: Flag, condition: str, on_condition: Exception, doing: str) -> None:
        try:
            self._client.put_item(
                TableName=self._table, Item=self._item(flag), ConditionExpression=condition
            )
        except ClientError as exc:
            if is_condition_failure(exc):
                raise on_condition from exc
            raise upstream(exc, doing) from exc
        except BotoCoreError as exc:
            raise upstream(exc, doing) from exc

    def create(self, flag: Flag) -> None:
        self._write(
            flag,
            "attribute_not_exists(pk)",
            _exists(flag),
            f"creating flag '{flag.key}' in {flag.env}",
        )

    def put(self, flag: Flag) -> None:
        self._write(
            flag,
            "attribute_exists(pk)",
            _missing(flag.env, flag.key),
            f"updating flag '{flag.key}' in {flag.env}",
        )

    def delete(self, env: str, key: str) -> None:
        try:
            self._client.delete_item(
                TableName=self._table,
                Key=self._key(env, key),
                ConditionExpression="attribute_exists(pk)",
            )
        except ClientError as exc:
            if is_condition_failure(exc):
                raise _missing(env, key) from exc
            raise upstream(exc, f"deleting flag '{key}' in {env}") from exc
        except BotoCoreError as exc:
            raise upstream(exc, f"deleting flag '{key}' in {env}") from exc


def build_flag_store(settings: Settings) -> FlagStore:
    if settings.store == "dynamodb":
        return DynamoFlagStore(dynamodb_client(settings), settings.dynamodb_table)
    return MemoryFlagStore()

from collections.abc import Iterator
from typing import Any

import boto3
import pytest
from fastapi.testclient import TestClient
from moto import mock_aws

from platform_api.app import create_app
from platform_api.approvals.models import Approval
from platform_api.approvals.store import DynamoApprovalStore
from platform_api.errors import Conflict, NotFound, UpstreamError
from platform_api.tools.flags.models import Flag
from platform_api.tools.flags.store import DynamoFlagStore
from tests.conftest import START, FakeClock, TokenIsEmail, as_user, settings_for

TABLE = "platform-test"


@pytest.fixture
def dynamodb(monkeypatch: pytest.MonkeyPatch) -> Iterator[Any]:
    for name, value in {
        "AWS_ACCESS_KEY_ID": "testing",
        "AWS_SECRET_ACCESS_KEY": "testing",
        "AWS_DEFAULT_REGION": "us-east-1",
    }.items():
        monkeypatch.setenv(name, value)
    with mock_aws():
        client = boto3.client("dynamodb", region_name="us-east-1")
        client.create_table(
            TableName=TABLE,
            KeySchema=[
                {"AttributeName": "pk", "KeyType": "HASH"},
                {"AttributeName": "sk", "KeyType": "RANGE"},
            ],
            AttributeDefinitions=[
                {"AttributeName": "pk", "AttributeType": "S"},
                {"AttributeName": "sk", "AttributeType": "S"},
            ],
            BillingMode="PAY_PER_REQUEST",
        )
        yield client


def flag(key: str, env: str = "dev", **changes: Any) -> Flag:
    values: dict[str, Any] = {
        "key": key,
        "env": env,
        "description": "d",
        "enabled": True,
        "rollout_percent": 10,
        "owner": "team-x",
        "updated_at": START,
        "updated_by": "a@example.com",
    }
    values.update(changes)
    return Flag.model_validate(values)


def approval(approval_id: str, **changes: Any) -> Approval:
    values: dict[str, Any] = {
        "id": approval_id,
        "env": "prod",
        "tool": "flags",
        "action": "update",
        "target": "k",
        "payload": {"enabled": False},
        "before": None,
        "status": "pending",
        "requested_by": "a@example.com",
        "requested_at": START,
    }
    values.update(changes)
    return Approval.model_validate(values)


def test_flag_store_round_trip(dynamodb: Any) -> None:
    store = DynamoFlagStore(dynamodb, TABLE)
    store.create(flag("b"))
    store.create(flag("a"))
    store.create(flag("a", env="prod"))
    assert [f.key for f in store.list("dev")] == ["a", "b"]
    assert store.get("dev", "a") == flag("a")
    assert store.get("dev", "missing") is None
    store.put(flag("a", rollout_percent=55))
    assert store.get("dev", "a") == flag("a", rollout_percent=55)
    store.delete("dev", "a")
    assert store.get("dev", "a") is None
    assert [f.env for f in store.list("prod")] == ["prod"]


def test_flag_store_conditions(dynamodb: Any) -> None:
    store = DynamoFlagStore(dynamodb, TABLE)
    store.create(flag("a"))
    with pytest.raises(Conflict):
        store.create(flag("a"))
    with pytest.raises(NotFound):
        store.put(flag("ghost"))
    with pytest.raises(NotFound):
        store.delete("dev", "ghost")


def test_flag_store_upstream_failures(dynamodb: Any) -> None:
    store = DynamoFlagStore(dynamodb, "no-such-table")
    for call in (
        lambda: store.list("dev"),
        lambda: store.get("dev", "a"),
        lambda: store.create(flag("a")),
        lambda: store.delete("dev", "a"),
    ):
        with pytest.raises(UpstreamError, match="The data store failed"):
            call()


def test_approval_store_round_trip(dynamodb: Any) -> None:
    store = DynamoApprovalStore(dynamodb, TABLE)
    store.add(approval("1"))
    store.add(approval("2"))
    assert store.get("1") == approval("1")
    assert store.get("3") is None
    assert {a.id for a in store.list()} == {"1", "2"}
    decided = approval("1", status="rejected", reviewed_by="b@example.com", review_note="no")
    assert store.transition(decided, expected="pending") == decided
    assert store.get("1") == decided
    with pytest.raises(Conflict):
        store.transition(approval("1", status="approved"), expected="pending")


def test_approval_store_upstream_failures(dynamodb: Any) -> None:
    store = DynamoApprovalStore(dynamodb, "no-such-table")
    for call in (
        lambda: store.add(approval("1")),
        lambda: store.get("1"),
        lambda: store.list(),
        lambda: store.transition(approval("1"), expected="pending"),
    ):
        with pytest.raises(UpstreamError):
            call()


def test_app_runs_on_dynamodb(dynamodb: Any) -> None:
    settings = settings_for(store="dynamodb", dynamodb_table=TABLE)
    client = TestClient(create_app(settings, verifier=TokenIsEmail(), clock=FakeClock(START)))
    editor, reviewer = as_user("editor@example.com"), as_user("reviewer@example.com")

    assert client.get("/api/flags?env=all", headers=editor).json() == []
    body = {"description": "d", "enabled": False, "rollout_percent": 0, "owner": "team-x"}
    created = client.post("/api/flags?env=dev", json={"key": "k", **body}, headers=editor)
    assert created.status_code == 200
    queued = client.post("/api/flags?env=prod", json={"key": "k", **body}, headers=editor)
    assert queued.status_code == 202
    approval_id = queued.json()["approval"]["id"]

    approved = client.post(f"/api/approvals/{approval_id}/approve", headers=reviewer)
    assert approved.json()["status"] == "approved"
    flags = client.get("/api/flags?env=all", headers=editor).json()
    assert [(f["env"], f["key"]) for f in flags] == [("dev", "k"), ("prod", "k")]
    all_approvals = client.get("/api/approvals?status=all", headers=editor).json()
    assert [a["status"] for a in all_approvals] == ["approved"]


def test_store_failure_answers_502(dynamodb: Any) -> None:
    settings = settings_for(store="dynamodb", dynamodb_table="no-such-table")
    client = TestClient(create_app(settings, verifier=TokenIsEmail()))
    response = client.get("/api/flags?env=dev", headers=as_user("viewer@example.com"))
    assert response.status_code == 502
    assert response.json() == {
        "detail": "The data store failed while listing flags in dev; try again in a moment."
    }

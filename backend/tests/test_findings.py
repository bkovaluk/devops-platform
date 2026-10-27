import json
from collections.abc import Iterator
from datetime import timedelta
from decimal import Decimal
from typing import Any

import boto3
import pytest
from boto3.dynamodb.types import TypeSerializer
from botocore.exceptions import ClientError
from fastapi.testclient import TestClient
from moto import mock_aws
from pydantic import ValidationError

from platform_api.app import create_app
from platform_api.config import Settings
from platform_api.errors import UpstreamError
from platform_api.tools.findings import store as store_module
from platform_api.tools.findings.items import resource_name, resource_type, short_model, to_detail
from platform_api.tools.findings.models import FindingQuery, ResolveFindingBody
from platform_api.tools.findings.seed import example_findings, seed_examples
from platform_api.tools.findings.service import FindingService
from platform_api.tools.findings.store import (
    Acknowledgement,
    Closing,
    DynamoFindingStore,
    MemoryFindingStore,
)
from tests.conftest import START, FakeClock, TokenIsEmail, as_user, settings_for

ADMIN = as_user("admin@example.com")
EDITOR = as_user("editor@example.com")
VIEWER = as_user("viewer@example.com")
DEV_EDITOR = as_user("dev-editor@example.com")
ENVS = ["dev", "staging", "prod"]


def epoch(delta: timedelta) -> int:
    return int((START + delta).timestamp())


def ids(response: Any) -> list[str]:
    return [item["finding_id"] for item in response.json()["items"]]


class TestList:
    def test_all_lists_open_findings_newest_first_and_tags_env(self, client: TestClient) -> None:
        body = client.get("/api/findings", headers=VIEWER).json()
        assert body["env"] == "all" and body["status"] == "open" and body["window"] == "30d"
        assert [(i["env"], i["finding_id"]) for i in body["items"]] == [
            ("prod", "f-checkout-0001"),
            ("dev", "f-reports-0001"),
            ("prod", "f-orders-0001"),
            ("staging", "f-billing-0001"),
        ]
        assert body["total"] == 4 and body["truncated"] is False
        first = body["items"][0]
        assert first["resource_type"] == "Lambda"
        assert first["resource_name"] == "checkout-api"
        assert first["model"] == "opus-5.5"
        assert first["tools_used"][0] == "get_metric"

    def test_facets_count_the_window_before_any_filter(self, client: TestClient) -> None:
        facets = client.get("/api/findings?severity=high", headers=VIEWER).json()["facets"]
        assert facets["severity"] == {"high": 1, "medium": 2, "low": 1}
        assert facets["kind"] == {"alarm": 4, "repeating": 1}
        assert facets["outcome"] == {"reported": 3, "incomplete": 1}
        assert facets["type"] == {"Lambda": 2, "SQS": 1, "RDS": 1}

    def test_one_env(self, client: TestClient) -> None:
        response = client.get("/api/findings?env=prod", headers=VIEWER)
        assert response.json()["env"] == "prod"
        assert ids(response) == ["f-checkout-0001", "f-orders-0001"]

    def test_unreadable_env_is_403(self, client: TestClient) -> None:
        assert client.get("/api/findings?env=all", headers=DEV_EDITOR).status_code == 403
        assert client.get("/api/findings?env=prod", headers=DEV_EDITOR).status_code == 403

    def test_triage_rows_only_when_asked(self, client: TestClient) -> None:
        with_triage = client.get("/api/findings?env=prod&triage=true", headers=VIEWER)
        assert ids(with_triage) == ["f-checkout-0001", "f-notify-0001", "f-orders-0001"]
        by_kind = client.get("/api/findings?env=prod&kind=skipped", headers=VIEWER)
        assert ids(by_kind) == ["f-notify-0001"]

    def test_filters_combine(self, client: TestClient) -> None:
        two = client.get("/api/findings?severity=high&severity=medium&type=Lambda", headers=VIEWER)
        assert ids(two) == ["f-checkout-0001"]
        assert ids(client.get("/api/findings?kind=repeating", headers=VIEWER)) == ["f-orders-0001"]
        assert ids(client.get("/api/findings?tool=describe_queue", headers=VIEWER)) == [
            "f-orders-0001"
        ]
        assert ids(client.get("/api/findings?q=KEYERROR", headers=VIEWER)) == ["f-checkout-0001"]
        assert ids(client.get("/api/findings?outcome=incomplete", headers=VIEWER)) == [
            "f-billing-0001"
        ]

    def test_pages(self, client: TestClient) -> None:
        page = client.get("/api/findings?offset=1&limit=2", headers=VIEWER).json()
        assert [i["finding_id"] for i in page["items"]] == ["f-reports-0001", "f-orders-0001"]
        assert page["total"] == 4
        assert client.get("/api/findings?limit=0", headers=VIEWER).status_code == 422

    def test_other_statuses_and_windows(self, client: TestClient) -> None:
        acknowledged = client.get("/api/findings?status=acknowledged", headers=VIEWER)
        assert ids(acknowledged) == ["f-search-0001"]
        closed = client.get("/api/findings?status=closed&window=365d", headers=VIEWER).json()
        assert [i["finding_id"] for i in closed["items"]] == [
            "f-resizer-0001",
            "f-gateway-0001",
            "f-checkout-0000",
        ]
        assert closed["facets"]["resolution"] == {"confirmed": 2, "false_positive": 1}
        week = client.get("/api/findings?status=closed&window=7d", headers=VIEWER)
        assert ids(week) == ["f-resizer-0001", "f-gateway-0001"]
        refused = client.get("/api/findings?window=365d", headers=VIEWER)
        assert refused.status_code == 400
        assert "closed findings" in refused.json()["detail"]


class TestGet:
    def test_detail_with_history(self, client: TestClient) -> None:
        detail = client.get("/api/findings/f-checkout-0001?env=prod", headers=VIEWER).json()
        assert detail["likely_cause"].startswith("Version 214")
        assert [h["finding_id"] for h in detail["history"]] == ["f-checkout-0000"]
        assert [h["state"] for h in detail["hypotheses"]] == ["likely", "ruled_out", "ruled_out"]
        assert detail["tool_trail"][3]["call"]["label"] == "aws.lambda.list_event_source_mappings"
        assert detail["actions"][0]["command"].startswith("aws lambda update-alias")
        assert detail["run"]["stop_reason"] == "chose"
        assert detail["context_summary"]["counts"]["metric"] == 60

    def test_missing_and_env_rules(self, client: TestClient) -> None:
        missing = client.get("/api/findings/f-nope?env=prod", headers=VIEWER)
        assert missing.status_code == 404
        assert missing.json() == {"detail": "No finding f-nope in prod; it may have expired."}
        one = "/api/findings/f-checkout-0001"
        assert client.get(f"{one}?env=all", headers=VIEWER).status_code == 400
        assert client.get("/api/findings/bad id?env=prod", headers=VIEWER).status_code == 422
        assert client.get(f"{one}?env=prod", headers=DEV_EDITOR).status_code == 403


class TestReview:
    def test_acknowledge(self, client: TestClient) -> None:
        url = "/api/findings/f-checkout-0001/acknowledge?env=prod"
        assert client.post(url, headers=VIEWER).status_code == 403
        done = client.post(url, headers=EDITOR).json()
        assert done["status"] == "acknowledged"
        assert done["acknowledged_by"] == "editor@example.com"
        assert done["acknowledged_at"] == START.isoformat()
        again = client.post(url, headers=EDITOR)
        assert again.status_code == 409
        assert again.json() == {
            "detail": "Finding f-checkout-0001 is acknowledged; only an open finding "
            "can be acknowledged."
        }
        listed = client.get("/api/findings?status=acknowledged&env=prod", headers=VIEWER)
        assert ids(listed) == ["f-checkout-0001", "f-search-0001"]

    def test_acknowledge_a_missing_finding_is_404(self, client: TestClient) -> None:
        response = client.post("/api/findings/f-nope/acknowledge?env=prod", headers=EDITOR)
        assert response.status_code == 404

    def test_close_grades_a_reported_cause(self, client: TestClient) -> None:
        url = "/api/findings/f-checkout-0001/close?env=prod"
        wrong = client.post(url, json={"resolution": "wrong", "note": "  "}, headers=EDITOR)
        assert wrong.status_code == 422
        assert wrong.json() == {"detail": "'wrong' needs a note saying what was wrong."}
        dismissed = client.post(url, json={"resolution": "dismissed"}, headers=EDITOR)
        assert dismissed.status_code == 409
        noted = {"resolution": "wrong", "note": "  The cache, not the deploy. "}
        closed = client.post(url, json=noted, headers=EDITOR).json()
        assert closed["status"] == "closed"
        assert closed["resolution"] == "wrong"
        assert closed["resolution_note"] == "The cache, not the deploy."
        assert closed["resolved_by"] == "editor@example.com"
        again = client.post(url, json={"resolution": "confirmed"}, headers=EDITOR)
        assert again.status_code == 409
        assert again.json() == {
            "detail": "Finding f-checkout-0001 is already closed by editor@example.com."
        }

    def test_close_dismisses_a_finding_without_a_cause(self, client: TestClient) -> None:
        url = "/api/findings/f-billing-0001/close?env=staging"
        graded = client.post(url, json={"resolution": "confirmed"}, headers=EDITOR)
        assert graded.status_code == 409
        assert "close it as dismissed" in graded.json()["detail"]
        closed = client.post(url, json={"resolution": "dismissed"}, headers=EDITOR).json()
        assert closed["resolution"] == "dismissed"
        assert closed["resolution_note"] is None

    def test_review_needs_the_review_scope_and_no_lens(self, client: TestClient) -> None:
        url = "/api/findings/f-orders-0001/close?env=prod"
        body = {"resolution": "confirmed"}
        assert client.post(url, json=body, headers=VIEWER).status_code == 403
        lens = {**ADMIN, "X-View-As": "editor@example.com"}
        assert client.post(url, json=body, headers=lens).status_code == 403
        assert client.post(url, json=body, headers=ADMIN).status_code == 200


@pytest.fixture
def memory() -> MemoryFindingStore:
    store = MemoryFindingStore()
    seed_examples(store, ENVS, START)
    return store


class TestRetention:
    def test_acknowledging_keeps_the_finding_ninety_days(self, memory: MemoryFindingStore) -> None:
        service = FindingService(memory, FakeClock(START))
        service.acknowledge("prod", "f-orders-0001", "a@example.com")
        assert (memory.get("prod", "f-orders-0001") or {})["ttl"] == epoch(timedelta(days=90))

    def test_closing_keeps_finding_and_snapshot_a_year(self, memory: MemoryFindingStore) -> None:
        clock = FakeClock(START)
        service = FindingService(memory, clock)
        clock.advance(hours=1)
        confirmed = ResolveFindingBody(resolution="confirmed")
        service.close("prod", "f-orders-0001", confirmed, "a@example.com")
        year = epoch(timedelta(days=365, hours=1))
        assert (memory.get("prod", "f-orders-0001") or {})["ttl"] == year
        assert (memory.snapshot("prod", "f-orders-0001") or {})["ttl"] == year

    def test_expired_findings_leave_the_list(self, memory: MemoryFindingStore) -> None:
        item = memory.get("prod", "f-orders-0001") or {}
        memory.put("prod", {**item, "ttl": epoch(timedelta(seconds=-1))})
        listed = FindingService(memory, FakeClock(START)).list(ENVS, FindingQuery())
        assert "f-orders-0001" not in [row.finding_id for row in listed.items]

    def test_a_finding_without_an_outcome_counts_as_reported(
        self, memory: MemoryFindingStore
    ) -> None:
        item = memory.get("dev", "f-reports-0001") or {}
        memory.put("dev", {k: v for k, v in item.items() if k != "outcome"})
        service = FindingService(memory, FakeClock(START))
        body = ResolveFindingBody(resolution="false_positive")
        assert service.close("dev", "f-reports-0001", body, "a").resolution == "false_positive"


class TestItems:
    def test_models_and_resources(self) -> None:
        assert short_model("us.anthropic.claude-opus-5-5") == "opus-5.5"
        assert short_model("anthropic.claude-sonnet-4-20250514-v1:0") == "sonnet-4"
        assert short_model("custom-model") == "custom-model"
        assert short_model(None) is None
        scoped = "2" * 12 + "|AWS/SQS:QueueName=orders-queue"
        assert resource_type(scoped) == "SQS"
        assert resource_name(scoped, "alarm") == "orders-queue"
        assert resource_type("alarm:checkout-composite") == "Composite"
        assert resource_type("datadog:monitor/7/env:prod") == "Datadog"
        assert resource_name("alarm:checkout-composite", "composite") == "composite"
        assert resource_type(None) is None

    def test_reads_odd_items_tolerantly(self) -> None:
        detail = to_detail(
            {
                "pk": "finding#f-odd",
                "status": "paused",
                "created_at": "2026-10-20T12:00:00+00:00",
                "confidence": "certain",
                "resolution": "maybe",
                "recurrence_count": Decimal(2),
                "tools_used": {"b", "a"},
                "hypotheses": [{"text": "x", "state": "odd", "steps": [Decimal(1), 0, "2", 1.5]}],
                "evidence": ["not a map", {"kind": "log", "detail": Decimal("1.5")}],
                "actions": [{"kind": "odd", "text": "Do it"}, {"kind": "code"}],
                "checked": [{"text": ""}, {"text": "Seen", "steps": None}],
                "run": {"stop_reason": "chose", "duration_seconds": Decimal("12.5")},
                "tool_trail": [
                    {"step": Decimal(1), "status": "weird", "args": {"n": Decimal(3)}},
                    {"step": 2, "call": {"provider": "aws"}},
                ],
                "context_summary": {
                    "sections": {"metric": "available", "x": None},
                    "counts": {"metric": Decimal(60), "bad": "many"},
                    "truncated": "no",
                },
                "linked_alarms": ["a", None, {"x": 1}],
            },
            "prod",
            [],
        )
        assert detail.finding_id == "f-odd"
        assert detail.status == "open"
        assert detail.confidence is None and detail.resolution is None
        assert detail.recurrence_count == 2
        assert detail.tools_used == ["a", "b"]
        assert detail.hypotheses[0].state == "unverified"
        assert detail.hypotheses[0].steps == [1, 2]
        assert len(detail.evidence) == 1 and detail.evidence[0].detail == "1.5"
        assert [(a.kind, a.text) for a in detail.actions] == [("change", "Do it")]
        assert [c.text for c in detail.checked] == ["Seen"]
        assert detail.run is not None and detail.run.duration_seconds == 12.5
        assert detail.tool_trail[0].status is None
        assert detail.tool_trail[0].args == {"n": 3}
        assert detail.tool_trail[1].call is None
        assert detail.context_summary is not None
        assert detail.context_summary.sections == {"metric": "available"}
        assert detail.context_summary.counts == {"metric": 60}
        assert detail.context_summary.truncated is None
        assert detail.linked_count == 1
        assert detail.env == "prod"


@pytest.mark.parametrize(
    ("overrides", "message"),
    [
        ({"findings_tables": '{"moon": "t"}'}, "FINDINGS_TABLES names environments"),
        ({"findings_tables": '{"prod": 1}'}, "map environment names to table names"),
    ],
)
def test_findings_tables_are_validated(overrides: dict[str, Any], message: str) -> None:
    with pytest.raises(ValidationError, match=message):
        Settings(_env_file=None, **overrides)


def test_findings_tables_default_to_the_agent_name() -> None:
    settings = Settings(_env_file=None, findings_tables='{"prod": "ops-findings"}')
    assert settings.findings_table("prod") == "ops-findings"
    assert settings.findings_table("dev") == "devops-agent-findings-dev"


PLATFORM_TABLE = "platform-test"


def findings_table(client: Any, name: str) -> None:
    attributes = ["pk", "status", "created_at", "resource_key"]
    client.create_table(
        TableName=name,
        KeySchema=[{"AttributeName": "pk", "KeyType": "HASH"}],
        AttributeDefinitions=[{"AttributeName": a, "AttributeType": "S"} for a in attributes],
        GlobalSecondaryIndexes=[
            {
                "IndexName": index,
                "KeySchema": [
                    {"AttributeName": hash_key, "KeyType": "HASH"},
                    {"AttributeName": "created_at", "KeyType": "RANGE"},
                ],
                "Projection": {"ProjectionType": "ALL"},
            }
            for index, hash_key in (("by_status", "status"), ("by_resource", "resource_key"))
        ],
        BillingMode="PAY_PER_REQUEST",
    )


def put(client: Any, table: str, item: dict[str, Any]) -> None:
    serializer = TypeSerializer()
    plain = json.loads(json.dumps(item), parse_float=Decimal)
    attributes = {key: serializer.serialize(value) for key, value in plain.items()}
    client.put_item(TableName=table, Item=attributes)


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
        for env in ENVS:
            findings_table(client, f"findings-{env}")
        for env, item in example_findings(ENVS, START):
            put(client, f"findings-{env}", item)
        snapshot = {"pk": "snap#f-orders-0001", "finding_id": "f-orders-0001", "ttl": 1}
        put(client, "findings-prod", snapshot)
        yield client


def dynamo_store(client: Any) -> DynamoFindingStore:
    return DynamoFindingStore(lambda env: client, lambda env: f"findings-{env}")


class TestDynamoStore:
    def test_reads(self, dynamodb: Any) -> None:
        store = dynamo_store(dynamodb)
        items, truncated = store.window("prod", "open", "2026-01-01")
        assert [i["finding_id"] for i in items] == [
            "f-checkout-0001",
            "f-notify-0001",
            "f-orders-0001",
        ]
        assert truncated is False
        stored = store.get("prod", "f-checkout-0001") or {}
        assert stored["run"]["duration_seconds"] == Decimal("84.6")
        assert store.get("prod", "f-nope") is None
        history = store.on_resource("prod", "AWS/Lambda:FunctionName=checkout-api", 12)
        assert [i["finding_id"] for i in history] == ["f-checkout-0001", "f-checkout-0000"]

    def test_window_stops_at_the_cap(self, dynamodb: Any, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr(store_module, "WINDOW_CAP", 1)
        items, truncated = dynamo_store(dynamodb).window("prod", "open", "2026-01-01")
        assert len(items) == 1 and truncated is True

    def test_review_writes(self, dynamodb: Any) -> None:
        store = dynamo_store(dynamodb)
        ack = Acknowledgement(at="2026-10-20T12:00:00+00:00", by="a@example.com", ttl=5)
        assert store.acknowledge("prod", "f-orders-0001", ack) is True
        assert store.acknowledge("prod", "f-orders-0001", ack) is False
        assert store.acknowledge("prod", "f-nope", ack) is False
        noted = Closing("wrong", "not it", "2026-10-20T13:00:00+00:00", "b@example.com", 9)
        assert store.close("prod", "f-orders-0001", noted) is True
        assert store.close("prod", "f-orders-0001", noted) is False
        item = store.get("prod", "f-orders-0001") or {}
        assert (item["status"], item["resolution"], item["resolution_note"]) == (
            "closed",
            "wrong",
            "not it",
        )
        assert item["acknowledged_by"] == "a@example.com" and item["ttl"] == 9
        assert item["likely_cause"].startswith("Reserved concurrency")
        plain = Closing("confirmed", None, "2026-10-20T13:00:00+00:00", "b@example.com", 9)
        assert store.close("prod", "f-checkout-0001", plain) is True
        assert "resolution_note" not in (store.get("prod", "f-checkout-0001") or {})

        store.extend_snapshot("prod", "f-orders-0001", 99)
        store.extend_snapshot("prod", "f-checkout-0001", 99)
        snapshot = dynamodb.get_item(
            TableName="findings-prod", Key={"pk": {"S": "snap#f-orders-0001"}}
        )["Item"]
        assert snapshot["ttl"] == {"N": "99"}
        missing = dynamodb.get_item(
            TableName="findings-prod", Key={"pk": {"S": "snap#f-checkout-0001"}}
        )
        assert "Item" not in missing

    def test_failures(self, dynamodb: Any, caplog: pytest.LogCaptureFixture) -> None:
        store = DynamoFindingStore(lambda env: dynamodb, lambda env: "no-such-table")
        ack = Acknowledgement(at="t", by="a", ttl=1)
        closing = Closing("confirmed", None, "t", "a", 1)
        for call in (
            lambda: store.window("prod", "open", "2026"),
            lambda: store.get("prod", "f"),
            lambda: store.on_resource("prod", "k", 1),
            lambda: store.acknowledge("prod", "f", ack),
            lambda: store.close("prod", "f", closing),
        ):
            with pytest.raises(UpstreamError, match="The data store failed"):
                call()
        store.extend_snapshot("prod", "f", 1)
        assert "finding.snapshot_ttl_not_extended" in caplog.text

    def test_app_reads_each_env_table(self, dynamodb: Any) -> None:
        dynamodb.create_table(
            TableName=PLATFORM_TABLE,
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
        tables = json.dumps({env: f"findings-{env}" for env in ENVS})
        settings = settings_for(
            store="dynamodb", dynamodb_table=PLATFORM_TABLE, findings_tables=tables
        )
        client = TestClient(create_app(settings, verifier=TokenIsEmail(), clock=FakeClock(START)))
        listed = client.get("/api/findings", headers=VIEWER).json()
        assert [i["finding_id"] for i in listed["items"]][:2] == [
            "f-checkout-0001",
            "f-reports-0001",
        ]
        closed = client.post(
            "/api/findings/f-billing-0001/close?env=staging",
            json={"resolution": "dismissed"},
            headers=EDITOR,
        )
        assert closed.json()["status"] == "closed"
        broken = settings_for(
            store="dynamodb", dynamodb_table=PLATFORM_TABLE, findings_tables='{"prod": "gone"}'
        )
        failing = TestClient(create_app(broken, verifier=TokenIsEmail()))
        response = failing.get("/api/findings?env=prod", headers=VIEWER)
        assert response.status_code == 502
        assert response.json() == {
            "detail": "The data store failed while listing findings in prod; try again in a moment."
        }


def test_snapshot_failure_never_fails_the_close(caplog: pytest.LogCaptureFixture) -> None:
    class Refusing:
        def update_item(self, **_: Any) -> None:
            raise ClientError({"Error": {"Code": "AccessDeniedException"}}, "UpdateItem")

    DynamoFindingStore(lambda env: Refusing(), lambda env: "t").extend_snapshot("prod", "f", 1)
    assert "finding.snapshot_ttl_not_extended" in caplog.text

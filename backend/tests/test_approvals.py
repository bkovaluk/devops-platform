from collections.abc import Callable
from typing import Any

from fastapi.testclient import TestClient

from platform_api.tools.flags.service import FlagService
from tests.conftest import FakeClock, as_user

EDITOR = as_user("editor@example.com")
REVIEWER = as_user("reviewer@example.com")
LEAD = as_user("lead@example.com")
VIEWER = as_user("viewer@example.com")
DEV_EDITOR = as_user("dev-editor@example.com")
PROD_REVIEWER = as_user("prod-reviewer@example.com")

NEW_FLAG = {"description": "d", "enabled": True, "rollout_percent": 5, "owner": "team-x"}


def file_update(
    client: TestClient, key: str = "dark-mode", env: str = "prod", **change: Any
) -> str:
    response = client.put(
        f"/api/flags/{key}?env={env}", json=change or {"enabled": True}, headers=EDITOR
    )
    assert response.status_code == 202, response.text
    return str(response.json()["approval"]["id"])


def flags_of(client: TestClient) -> FlagService:
    service = client.app.state.flags  # type: ignore[attr-defined]
    assert isinstance(service, FlagService)
    return service


class TestList:
    def test_newest_first(self, client: TestClient, clock: FakeClock) -> None:
        clock.advance(minutes=5)
        newest = file_update(client)
        approvals = client.get("/api/approvals", headers=REVIEWER).json()
        assert approvals[0]["id"] == newest
        assert len(approvals) == 3
        times = [a["requested_at"] for a in approvals]
        assert times == sorted(times, reverse=True)
        seeded = {a["requested_by"] for a in approvals[1:]}
        assert seeded == {"grace@example.com", "alan@example.com"}

    def test_pending_is_the_default_and_all_includes_decided(
        self, empty_client: TestClient
    ) -> None:
        for env in ("staging", "prod"):
            empty_client.post(
                f"/api/flags?env={env}", json={"key": "a", **NEW_FLAG}, headers=EDITOR
            )
        newest, _ = (a["id"] for a in empty_client.get("/api/approvals", headers=REVIEWER).json())
        empty_client.post(f"/api/approvals/{newest}/reject", json={"note": "no"}, headers=REVIEWER)
        assert len(empty_client.get("/api/approvals", headers=REVIEWER).json()) == 1
        everything = empty_client.get("/api/approvals?status=all", headers=REVIEWER).json()
        assert [a["status"] for a in everything] == ["rejected", "pending"]
        assert empty_client.get("/api/approvals?status=bogus", headers=REVIEWER).status_code == 422

    def test_only_requests_the_caller_may_read(self, client: TestClient) -> None:
        assert client.get("/api/approvals", headers=DEV_EDITOR).json() == []

    def test_get_one_and_404(self, client: TestClient) -> None:
        approval_id = file_update(client)
        one = client.get(f"/api/approvals/{approval_id}", headers=VIEWER).json()
        assert one["id"] == approval_id
        assert one["reviewed_by"] is None
        assert client.get("/api/approvals/nope", headers=VIEWER).status_code == 404
        hidden = client.get(f"/api/approvals/{approval_id}", headers=DEV_EDITOR)
        assert hidden.status_code == 404

    def test_requires_auth(self, client: TestClient) -> None:
        assert client.get("/api/approvals").status_code == 401


class TestApprove:
    def test_replays_the_change(self, client: TestClient, clock: FakeClock) -> None:
        approval_id = file_update(client, rollout_percent=30, enabled=True)
        clock.advance(minutes=10)
        response = client.post(
            f"/api/approvals/{approval_id}/approve", json={"note": "ship it"}, headers=REVIEWER
        )
        assert response.status_code == 200
        approval = response.json()
        assert approval["status"] == "approved"
        assert approval["reviewed_by"] == "reviewer@example.com"
        assert approval["reviewed_at"] == "2026-10-20T12:10:30Z"
        assert approval["review_note"] == "ship it"
        assert approval["result"] == (
            "Updated enabled, rollout_percent of flag 'dark-mode' in prod."
        )
        flag = client.get("/api/flags/dark-mode?env=prod", headers=VIEWER).json()
        assert flag["enabled"] is True
        assert flag["rollout_percent"] == 30
        assert flag["updated_by"] == "editor@example.com"

    def test_body_is_optional(self, client: TestClient) -> None:
        approval_id = file_update(client)
        response = client.post(f"/api/approvals/{approval_id}/approve", headers=REVIEWER)
        assert response.status_code == 200
        assert response.json()["review_note"] is None

    def test_replays_create_and_delete(self, client: TestClient) -> None:
        filed = client.post(
            "/api/flags?env=prod", json={"key": "fresh", **NEW_FLAG}, headers=EDITOR
        )
        created = filed.json()["approval"]["id"]
        approved = client.post(f"/api/approvals/{created}/approve", headers=REVIEWER).json()
        assert approved["result"] == "Created flag 'fresh' in prod."
        fresh = client.get("/api/flags/fresh?env=prod", headers=VIEWER).json()
        assert fresh["rollout_percent"] == 5
        assert fresh["updated_by"] == "editor@example.com"

        filed = client.delete("/api/flags/fresh?env=prod", headers=EDITOR)
        deleted = filed.json()["approval"]["id"]
        approved = client.post(f"/api/approvals/{deleted}/approve", headers=REVIEWER).json()
        assert approved["result"] == "Deleted flag 'fresh' from prod."
        assert client.get("/api/flags/fresh?env=prod", headers=VIEWER).status_code == 404

    def test_requester_cannot_approve(self, client: TestClient) -> None:
        response = client.put("/api/flags/dark-mode?env=prod", json={"enabled": True}, headers=LEAD)
        approval_id = response.json()["approval"]["id"]
        denied = client.post(f"/api/approvals/{approval_id}/approve", headers=LEAD)
        assert denied.status_code == 403
        assert denied.json() == {
            "detail": "You requested this change, so someone else has to approve it."
        }
        still = client.get(f"/api/approvals/{approval_id}", headers=LEAD).json()
        assert still["status"] == "pending"

    def test_review_scope_is_required(self, client: TestClient) -> None:
        approval_id = file_update(client)
        denied = client.post(
            f"/api/approvals/{approval_id}/approve", headers=as_user("editor2@example.com")
        )
        assert denied.status_code == 403
        assert "approvals:review:prod" in denied.json()["detail"]

    def test_review_scope_is_per_env(self, client: TestClient) -> None:
        prod = file_update(client, env="prod")
        staging = file_update(client, env="staging", enabled=False)
        approve_prod = client.post(f"/api/approvals/{prod}/approve", headers=PROD_REVIEWER)
        assert approve_prod.status_code == 200
        approve_staging = client.post(f"/api/approvals/{staging}/approve", headers=PROD_REVIEWER)
        assert approve_staging.status_code == 403

    def test_replay_fails_when_the_target_moved_on(self, client: TestClient) -> None:
        approval_id = file_update(client, key="checkout-v2", rollout_percent=20)
        flags = flags_of(client)
        moved = flags.get("prod", "checkout-v2").model_copy(update={"rollout_percent": 99})
        flags._store.put(moved)
        response = client.post(f"/api/approvals/{approval_id}/approve", headers=REVIEWER)
        assert response.status_code == 200
        approval = response.json()
        assert approval["status"] == "failed"
        assert "changed in prod after this request was filed" in approval["result"]
        flag = client.get("/api/flags/checkout-v2?env=prod", headers=VIEWER).json()
        assert flag["rollout_percent"] == 99

    def test_replay_fails_when_the_target_is_gone(self, client: TestClient) -> None:
        approval_id = file_update(client, key="pdf-export")
        flags_of(client)._store.delete("prod", "pdf-export")
        approval = client.post(f"/api/approvals/{approval_id}/approve", headers=REVIEWER).json()
        assert approval["status"] == "failed"
        assert approval["result"] == "Flag 'pdf-export' no longer exists in prod."

    def test_only_pending_can_be_decided(self, client: TestClient) -> None:
        approval_id = file_update(client)
        client.post(f"/api/approvals/{approval_id}/approve", headers=REVIEWER)
        again = client.post(f"/api/approvals/{approval_id}/approve", headers=REVIEWER)
        assert again.status_code == 409
        assert again.json()["detail"] == (
            f"Request {approval_id} is already approved; only a pending request can be approved."
        )

    def test_one_pending_request_per_target(self, client: TestClient) -> None:
        file_update(client)
        response = client.put("/api/flags/dark-mode?env=prod", json={"owner": "x"}, headers=EDITOR)
        assert response.status_code == 409
        assert "already changes 'dark-mode' in prod" in response.json()["detail"]

    def test_missing_request_is_404(self, client: TestClient) -> None:
        assert client.post("/api/approvals/nope/approve", headers=REVIEWER).status_code == 404


class TestReject:
    def test_note_is_required(self, client: TestClient) -> None:
        approval_id = file_update(client)
        url = f"/api/approvals/{approval_id}/reject"
        assert client.post(url, headers=REVIEWER).status_code == 422
        empty = client.post(url, json={"note": ""}, headers=REVIEWER)
        assert empty.status_code == 422
        assert empty.json()["detail"].startswith("note: ")

    def test_reject(self, client: TestClient) -> None:
        approval_id = file_update(client)
        response = client.post(
            f"/api/approvals/{approval_id}/reject", json={"note": "not this week"}, headers=REVIEWER
        )
        assert response.status_code == 200
        approval = response.json()
        assert approval["status"] == "rejected"
        assert approval["review_note"] == "not this week"
        assert approval["result"] is None
        flag = client.get("/api/flags/dark-mode?env=prod", headers=VIEWER).json()
        assert flag["enabled"] is False

    def test_requester_cannot_reject(self, client: TestClient) -> None:
        filed = client.put("/api/flags/dark-mode?env=prod", json={"enabled": True}, headers=LEAD)
        approval_id = filed.json()["approval"]["id"]
        response = client.post(
            f"/api/approvals/{approval_id}/reject", json={"note": "n"}, headers=LEAD
        )
        assert response.status_code == 403
        assert "withdraw it instead" in response.json()["detail"]


class TestWithdraw:
    def test_requester_withdraws(self, client: TestClient) -> None:
        approval_id = file_update(client)
        response = client.post(f"/api/approvals/{approval_id}/withdraw", headers=EDITOR)
        assert response.status_code == 200
        assert response.json()["status"] == "withdrawn"
        assert response.json()["reviewed_by"] is None

    def test_only_the_requester(self, client: TestClient) -> None:
        approval_id = file_update(client)
        response = client.post(f"/api/approvals/{approval_id}/withdraw", headers=REVIEWER)
        assert response.status_code == 403
        assert response.json() == {
            "detail": "Only editor@example.com, who filed it, can withdraw it."
        }

    def test_withdrawn_frees_the_target(self, client: TestClient) -> None:
        approval_id = file_update(client)
        client.post(f"/api/approvals/{approval_id}/withdraw", headers=EDITOR)
        file_update(client)


class TestExpiry:
    def test_pending_reads_as_expired_after_the_ttl(
        self, client: TestClient, clock: FakeClock
    ) -> None:
        approval_id = file_update(client)
        clock.advance(hours=72, seconds=1)
        one = client.get(f"/api/approvals/{approval_id}", headers=VIEWER).json()
        assert one["status"] == "expired"
        assert client.get("/api/approvals", headers=VIEWER).json() == []
        everything = client.get("/api/approvals?status=all", headers=VIEWER).json()
        assert {a["status"] for a in everything} == {"expired"}

    def test_expired_cannot_be_decided(self, client: TestClient, clock: FakeClock) -> None:
        approval_id = file_update(client)
        clock.advance(hours=73)
        response = client.post(f"/api/approvals/{approval_id}/approve", headers=REVIEWER)
        assert response.status_code == 409
        assert "expired" in response.json()["detail"]
        withdraw = client.post(f"/api/approvals/{approval_id}/withdraw", headers=EDITOR)
        assert withdraw.status_code == 409

    def test_expired_frees_the_target(self, client: TestClient, clock: FakeClock) -> None:
        file_update(client)
        clock.advance(hours=73)
        file_update(client)

    def test_ttl_is_configurable(
        self, make_client: Callable[..., TestClient], clock: FakeClock
    ) -> None:
        client = make_client(approval_ttl_hours=1)
        approval_id = file_update(client)
        clock.advance(minutes=61)
        one = client.get(f"/api/approvals/{approval_id}", headers=VIEWER).json()
        assert one["status"] == "expired"

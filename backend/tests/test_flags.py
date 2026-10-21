from collections.abc import Callable

from fastapi.testclient import TestClient

from platform_api.tools.flags.seed import EXAMPLES
from tests.conftest import FakeClock, as_user

ADMIN = as_user("admin@example.com")
EDITOR = as_user("editor@example.com")
VIEWER = as_user("viewer@example.com")
DEV_EDITOR = as_user("dev-editor@example.com")

NEW_FLAG = {
    "key": "beta-search",
    "description": "Try the new ranking",
    "enabled": True,
    "rollout_percent": 20,
    "owner": "team-search",
}


class TestList:
    def test_all_fans_out_and_tags_env(self, client: TestClient) -> None:
        flags = client.get("/api/flags?env=all", headers=VIEWER).json()
        assert len(flags) == len(EXAMPLES) * 3
        assert [f["env"] for f in flags[:: len(EXAMPLES)]] == ["dev", "staging", "prod"]
        assert flags[0].keys() == {
            "key",
            "env",
            "description",
            "enabled",
            "rollout_percent",
            "owner",
            "updated_at",
            "updated_by",
        }
        assert flags[0]["updated_at"].endswith("Z")

    def test_env_defaults_to_all(self, client: TestClient) -> None:
        assert len(client.get("/api/flags", headers=VIEWER).json()) == len(EXAMPLES) * 3

    def test_one_env(self, client: TestClient) -> None:
        flags = client.get("/api/flags?env=prod", headers=VIEWER).json()
        assert {f["env"] for f in flags} == {"prod"}
        assert [f["key"] for f in flags] == sorted(f["key"] for f in flags)

    def test_query_matches_key_and_description(self, client: TestClient) -> None:
        by_key = client.get("/api/flags?env=dev&q=CHECKOUT", headers=VIEWER).json()
        assert [f["key"] for f in by_key] == ["checkout-v2"]
        by_text = client.get("/api/flags?env=dev&q=onboarding tour", headers=VIEWER).json()
        assert [f["key"] for f in by_text] == ["new-onboarding"]

    def test_all_covers_only_readable_envs(self, client: TestClient) -> None:
        flags = client.get("/api/flags?env=all", headers=DEV_EDITOR).json()
        assert {f["env"] for f in flags} == {"dev"}

    def test_unreadable_env_is_403(self, client: TestClient) -> None:
        response = client.get("/api/flags?env=prod", headers=DEV_EDITOR)
        assert response.status_code == 403
        assert response.json() == {
            "detail": "You need the flags:read:prod scope to do this; ask an admin for access."
        }

    def test_nothing_readable_is_403(self, make_client: Callable[..., TestClient]) -> None:
        client = make_client(default_roles="")
        response = client.get("/api/flags?env=all", headers=as_user("nobody@example.com"))
        assert response.status_code == 403

    def test_unknown_env_is_400(self, client: TestClient) -> None:
        response = client.get("/api/flags?env=qa", headers=VIEWER)
        assert response.status_code == 400
        assert response.json()["detail"] == (
            "Unknown environment 'qa'; choose one of dev, staging, prod."
        )

    def test_requires_auth(self, client: TestClient) -> None:
        assert client.get("/api/flags").status_code == 401


class TestGet:
    def test_one_flag(self, client: TestClient) -> None:
        flag = client.get("/api/flags/checkout-v2?env=prod", headers=VIEWER).json()
        assert flag["key"] == "checkout-v2"
        assert flag["env"] == "prod"
        assert flag["rollout_percent"] == 10

    def test_missing_is_404(self, client: TestClient) -> None:
        response = client.get("/api/flags/nope?env=dev", headers=VIEWER)
        assert response.status_code == 404
        assert response.json() == {"detail": "No flag 'nope' in dev."}

    def test_all_is_400_on_single_item_routes(self, client: TestClient) -> None:
        for method, path, body in [
            ("GET", "/api/flags/checkout-v2?env=all", None),
            ("PUT", "/api/flags/checkout-v2?env=all", {"enabled": True}),
            ("DELETE", "/api/flags/checkout-v2?env=all", None),
            ("POST", "/api/flags?env=all", NEW_FLAG),
            ("GET", "/api/flags/checkout-v2/evaluations?env=all", None),
        ]:
            response = client.request(method, path, json=body, headers=ADMIN)
            assert response.status_code == 400, (method, path)
            assert "not 'all'" in response.json()["detail"]

    def test_env_is_required(self, client: TestClient) -> None:
        response = client.get("/api/flags/checkout-v2", headers=VIEWER)
        assert response.status_code == 422
        assert response.json() == {"detail": "env: Field required."}


class TestChange:
    def test_update_in_a_direct_env_applies(self, client: TestClient) -> None:
        response = client.put(
            "/api/flags/checkout-v2?env=dev", json={"rollout_percent": 40}, headers=EDITOR
        )
        assert response.status_code == 200
        body = response.json()
        assert body["applied"] is True
        assert body["flag"]["rollout_percent"] == 40
        assert body["flag"]["updated_by"] == "editor@example.com"
        assert body["flag"]["updated_at"] == "2026-10-20T12:00:30Z"
        fetched = client.get("/api/flags/checkout-v2?env=dev", headers=EDITOR).json()
        assert fetched == body["flag"]

    def test_update_elsewhere_files_an_approval(self, client: TestClient) -> None:
        response = client.put(
            "/api/flags/dark-mode?env=prod", json={"enabled": True}, headers=EDITOR
        )
        assert response.status_code == 202
        body = response.json()
        assert body["applied"] is False
        approval = body["approval"]
        assert approval["status"] == "pending"
        assert approval["action"] == "update"
        assert approval["tool"] == "flags"
        assert approval["target"] == "dark-mode"
        assert approval["payload"] == {"enabled": True}
        assert approval["before"]["enabled"] is False
        assert approval["requested_by"] == "editor@example.com"
        unchanged = client.get("/api/flags/dark-mode?env=prod", headers=EDITOR).json()
        assert unchanged["enabled"] is False

    def test_create_direct_and_conflict(self, client: TestClient) -> None:
        created = client.post("/api/flags?env=dev", json=NEW_FLAG, headers=EDITOR)
        assert created.status_code == 200
        assert created.json()["flag"]["key"] == "beta-search"
        again = client.post("/api/flags?env=dev", json=NEW_FLAG, headers=EDITOR)
        assert again.status_code == 409
        assert again.json() == {
            "detail": "Flag 'beta-search' already exists in dev; edit it instead."
        }

    def test_create_elsewhere_files_an_approval(self, client: TestClient) -> None:
        response = client.post("/api/flags?env=staging", json=NEW_FLAG, headers=EDITOR)
        assert response.status_code == 202
        assert response.json()["approval"]["before"] is None
        assert response.json()["approval"]["action"] == "create"

    def test_create_existing_elsewhere_is_409(self, client: TestClient) -> None:
        body = {**NEW_FLAG, "key": "dark-mode"}
        assert client.post("/api/flags?env=prod", json=body, headers=EDITOR).status_code == 409

    def test_delete_direct(self, client: TestClient) -> None:
        response = client.delete("/api/flags/pdf-export?env=dev", headers=EDITOR)
        assert response.status_code == 200
        assert response.json()["flag"]["key"] == "pdf-export"
        assert client.get("/api/flags/pdf-export?env=dev", headers=EDITOR).status_code == 404

    def test_delete_elsewhere_files_an_approval(self, client: TestClient) -> None:
        response = client.delete("/api/flags/pdf-export?env=prod", headers=EDITOR)
        assert response.status_code == 202
        assert response.json()["approval"]["action"] == "delete"
        assert response.json()["approval"]["payload"] == {}

    def test_change_to_missing_flag_is_404(self, client: TestClient) -> None:
        put = client.put("/api/flags/nope?env=dev", json={"enabled": True}, headers=EDITOR)
        assert put.status_code == 404
        assert client.delete("/api/flags/nope?env=prod", headers=EDITOR).status_code == 404

    def test_viewer_cannot_write(self, client: TestClient) -> None:
        response = client.put(
            "/api/flags/dark-mode?env=dev", json={"enabled": False}, headers=VIEWER
        )
        assert response.status_code == 403
        assert "flags:write:dev" in response.json()["detail"]

    def test_env_qualified_writer(self, client: TestClient) -> None:
        ok = client.put("/api/flags/dark-mode?env=dev", json={"enabled": False}, headers=DEV_EDITOR)
        assert ok.status_code == 200
        denied = client.put(
            "/api/flags/dark-mode?env=prod", json={"enabled": True}, headers=DEV_EDITOR
        )
        assert denied.status_code == 403

    def test_validation_reads_as_a_sentence(self, client: TestClient) -> None:
        response = client.put(
            "/api/flags/dark-mode?env=dev", json={"rollout_percent": 101}, headers=EDITOR
        )
        assert response.status_code == 422
        assert response.json() == {
            "detail": "rollout_percent: Input should be less than or equal to 100."
        }

    def test_empty_patch_is_422(self, client: TestClient) -> None:
        response = client.put("/api/flags/dark-mode?env=dev", json={}, headers=EDITOR)
        assert response.status_code == 422
        assert response.json() == {"detail": "name at least one field to change."}

    def test_bad_key_is_422(self, client: TestClient) -> None:
        body = {**NEW_FLAG, "key": "Not A Key"}
        response = client.post("/api/flags?env=dev", json=body, headers=EDITOR)
        assert response.status_code == 422
        assert response.json()["detail"].startswith("key: ")


class TestEvaluations:
    def test_series_shape(self, client: TestClient) -> None:
        response = client.get("/api/flags/checkout-v2/evaluations?env=prod", headers=VIEWER)
        assert response.status_code == 200
        series = response.json()
        assert series["key"] == "checkout-v2"
        assert series["env"] == "prod"
        points = series["points"]
        assert len(points) == 60
        assert points[0]["t"] == "2026-10-20T11:01:00Z"
        assert points[-1]["t"] == "2026-10-20T12:00:00Z"
        for point in points:
            if point["evaluations"] == 0:
                assert point["enabled_share"] is None
            else:
                assert 0.05 <= point["enabled_share"] <= 0.15

    def test_series_is_deterministic(self, client: TestClient, clock: FakeClock) -> None:
        url = "/api/flags/checkout-v2/evaluations?env=prod&minutes=240"
        first = client.get(url, headers=VIEWER).json()["points"]
        assert first == client.get(url, headers=VIEWER).json()["points"]
        assert any(p["enabled_share"] is None for p in first)
        clock.advance(minutes=1)
        later = client.get(url, headers=VIEWER).json()["points"]
        assert later[:-1] == first[1:]

    def test_disabled_flag_has_zero_share(self, client: TestClient) -> None:
        url = "/api/flags/dark-mode/evaluations?env=prod&minutes=30"
        points = client.get(url, headers=VIEWER).json()["points"]
        assert {p["enabled_share"] for p in points} <= {0.0, None}

    def test_fully_rolled_out_flag_has_full_share(self, client: TestClient) -> None:
        url = "/api/flags/search-autocomplete/evaluations?env=prod&minutes=30"
        points = client.get(url, headers=VIEWER).json()["points"]
        assert {p["enabled_share"] for p in points} <= {1.0, None}

    def test_minutes_bounds_and_missing_flag(self, client: TestClient) -> None:
        url = "/api/flags/checkout-v2/evaluations?env=prod&minutes="
        assert len(client.get(url + "1", headers=VIEWER).json()["points"]) == 1
        assert client.get(url + "0", headers=VIEWER).status_code == 422
        assert client.get(url + "1441", headers=VIEWER).status_code == 422
        missing = "/api/flags/nope/evaluations?env=prod"
        assert client.get(missing, headers=VIEWER).status_code == 404

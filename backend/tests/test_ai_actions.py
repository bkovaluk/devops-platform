import logging
from collections.abc import Iterator
from typing import Any

import pytest
from fastapi.testclient import TestClient
from pydantic import BaseModel, ValidationError

from platform_api.ai.actions import AiAction, AiRegistry
from platform_api.auth.principal import Principal
from platform_api.auth.scopes import Scope
from platform_api.context import Platform
from platform_api.errors import Forbidden, NotFound

READS = {"list_flags", "get_flag", "get_flag_evaluations", "list_approvals", "get_approval"}
WRITES = {"update_flag", "create_flag", "delete_flag"}


def platform_of(client: TestClient) -> Platform:
    platform = client.app.state.platform  # type: ignore[attr-defined]
    assert isinstance(platform, Platform)
    return platform


def principal(client: TestClient, email: str, view_as: str | None = None) -> Principal:
    roles = platform_of(client).roles
    if view_as:
        return Principal(view_as, "x", roles.grants_for(view_as), view_as=view_as)
    return Principal(email, "x", roles.grants_for(email))


def offered(client: TestClient, who: Principal) -> set[str]:
    return {action.name for action in platform_of(client).ai.offered(who)}


def read_action(name: str, run: Any) -> AiAction[BaseModel]:
    return AiAction(name, "d", BaseModel, "read", (Scope("flags", "read"),), run)


@pytest.fixture
def ai_log(
    client: TestClient, caplog: pytest.LogCaptureFixture
) -> Iterator[pytest.LogCaptureFixture]:
    """The app's logging setup replaces the root handlers, so capture is re-attached."""
    root = logging.getLogger()
    root.addHandler(caplog.handler)
    caplog.set_level(logging.INFO, logger="platform_api.ai.actions")
    yield caplog
    root.removeHandler(caplog.handler)


def ai_lines(caplog: pytest.LogCaptureFixture) -> list[dict[str, Any]]:
    return [r.__dict__["fields"] for r in caplog.records if r.getMessage() == "ai.call"]


class TestDeclared:
    def test_exactly_the_contract_actions(self, client: TestClient) -> None:
        actions = {a.name: a.kind for a in platform_of(client).ai.actions}
        assert actions == {**dict.fromkeys(READS, "read"), **dict.fromkeys(WRITES, "write")}

    def test_deciding_approvals_is_never_exposed(self, client: TestClient) -> None:
        names = {a.name for a in platform_of(client).ai.actions}
        assert not {n for n in names if any(v in n for v in ("approve", "reject", "withdraw"))}
        assert all(a.kind == "read" for a in platform_of(client).ai.actions if "approval" in a.name)

    def test_every_action_is_described_for_a_model(self, client: TestClient) -> None:
        for action in platform_of(client).ai.actions:
            assert len(action.description) > 40
            assert issubclass(action.params, BaseModel)


class TestOffered:
    def test_viewer_gets_reads_only(self, client: TestClient) -> None:
        assert offered(client, principal(client, "viewer@example.com")) == READS

    def test_editor_gets_everything(self, client: TestClient) -> None:
        assert offered(client, principal(client, "editor@example.com")) == READS | WRITES

    def test_a_grant_in_one_env_is_enough_to_be_offered(self, client: TestClient) -> None:
        assert offered(client, principal(client, "dev-editor@example.com")) == READS | WRITES

    def test_no_scope_no_actions(self) -> None:
        registry = AiRegistry(["dev"])
        registry.register(read_action("peek", lambda p, _: 1))
        assert registry.offered(Principal("x@example.com", "x", ())) == []

    def test_view_as_offers_reads_only(self, client: TestClient) -> None:
        who = principal(client, "admin@example.com", view_as="editor@example.com")
        assert offered(client, who) == READS


class TestCall:
    def test_runs_as_the_principal(self, client: TestClient) -> None:
        ai = platform_of(client).ai
        flags = ai.call(
            principal(client, "dev-editor@example.com"), "list_flags", {}, surface="mcp"
        )
        assert {f["env"] for f in flags} == {"dev"}

    def test_env_scope_is_checked_per_env(self, client: TestClient) -> None:
        with pytest.raises(Forbidden, match="flags:write:prod"):
            platform_of(client).ai.call(
                principal(client, "dev-editor@example.com"),
                "update_flag",
                {"env": "prod", "key": "dark-mode", "changes": {"enabled": True}},
                surface="mcp",
            )

    def test_unoffered_action_is_refused(self, client: TestClient) -> None:
        with pytest.raises(Forbidden, match="flags:write in at least one environment"):
            platform_of(client).ai.call(
                principal(client, "viewer@example.com"),
                "delete_flag",
                {"env": "dev", "key": "dark-mode"},
                surface="mcp",
            )

    def test_view_as_cannot_write(self, client: TestClient) -> None:
        who = principal(client, "admin@example.com", view_as="editor@example.com")
        with pytest.raises(Forbidden, match="read-only"):
            platform_of(client).ai.call(
                who, "delete_flag", {"env": "dev", "key": "dark-mode"}, surface="agent"
            )

    def test_unknown_action(self, client: TestClient) -> None:
        with pytest.raises(NotFound):
            platform_of(client).ai.call(
                principal(client, "admin@example.com"), "approve", {}, surface="mcp"
            )

    def test_arguments_are_validated(self, client: TestClient) -> None:
        with pytest.raises(ValidationError):
            platform_of(client).ai.call(
                principal(client, "admin@example.com"),
                "get_flag_evaluations",
                {"env": "dev", "key": "dark-mode", "minutes": 0},
                surface="mcp",
            )

    def test_a_read_has_nothing_to_propose(self, client: TestClient) -> None:
        with pytest.raises(ValueError, match="is a read"):
            platform_of(client).ai.propose(
                principal(client, "admin@example.com"), "list_flags", {}, surface="agent"
            )


class TestProposals:
    def test_update_shows_before_and_after(self, client: TestClient) -> None:
        preview = platform_of(client).ai.propose(
            principal(client, "editor@example.com"),
            "update_flag",
            {"env": "prod", "key": "dark-mode", "changes": {"rollout_percent": 10}},
            surface="agent",
        )
        assert (preview.tool, preview.env, preview.target) == ("update_flag", "prod", "dark-mode")
        assert preview.before is not None
        assert preview.before["rollout_percent"] == 0
        assert preview.after == {**preview.before, "rollout_percent": 10}

    def test_create_and_delete(self, client: TestClient) -> None:
        ai, who = platform_of(client).ai, principal(client, "editor@example.com")
        flag = {
            "key": "beta",
            "description": "d",
            "enabled": False,
            "rollout_percent": 0,
            "owner": "team-x",
        }
        created = ai.propose(who, "create_flag", {"env": "dev", "flag": flag}, surface="agent")
        assert (created.before, created.after) == (None, {**flag, "env": "dev"})
        deleted = ai.propose(
            who, "delete_flag", {"env": "dev", "key": "dark-mode"}, surface="agent"
        )
        assert deleted.after is None
        assert deleted.before is not None

    def test_proposing_is_authorized_like_the_write(self, client: TestClient) -> None:
        with pytest.raises(Forbidden, match="flags:write:staging"):
            platform_of(client).ai.propose(
                principal(client, "dev-editor@example.com"),
                "delete_flag",
                {"env": "staging", "key": "dark-mode"},
                surface="agent",
            )

    def test_proposing_changes_nothing(self, client: TestClient) -> None:
        ai, who = platform_of(client).ai, principal(client, "editor@example.com")
        ref = {"env": "dev", "key": "dark-mode"}
        before = ai.call(who, "get_flag", ref, surface="agent")
        ai.propose(who, "delete_flag", ref, surface="agent")
        assert ai.call(who, "get_flag", ref, surface="agent") == before


class TestLogging:
    def test_one_line_per_call_with_principal_tool_env_outcome(
        self, client: TestClient, ai_log: pytest.LogCaptureFixture
    ) -> None:
        ai, viewer = platform_of(client).ai, principal(client, "viewer@example.com")
        ai.call(viewer, "get_flag", {"env": "dev", "key": "dark-mode"}, surface="mcp")
        with pytest.raises(Forbidden):
            ai.call(viewer, "delete_flag", {"env": "dev", "key": "k"}, surface="mcp")
        common = {
            "surface": "mcp",
            "principal": "viewer@example.com",
            "view_as": None,
            "env": "dev",
        }
        assert ai_lines(ai_log) == [
            {**common, "tool": "get_flag", "outcome": "ok", "status": None},
            {**common, "tool": "delete_flag", "outcome": "refused", "status": 403},
        ]

    def test_free_text_arguments_stay_out_of_the_log(
        self, client: TestClient, ai_log: pytest.LogCaptureFixture
    ) -> None:
        private = "private-note-1234"
        platform_of(client).ai.call(
            principal(client, "editor@example.com"),
            "update_flag",
            {"env": "dev", "key": "dark-mode", "changes": {"description": private}},
            surface="agent",
        )
        assert ai_lines(ai_log)
        assert private not in ai_log.text
        assert all(private not in str(line) for line in ai_lines(ai_log))

    def test_invalid_and_crashing_calls_are_logged(
        self, client: TestClient, ai_log: pytest.LogCaptureFixture
    ) -> None:
        def boom(_: Principal, __: Any) -> object:
            raise RuntimeError("boom")

        registry = AiRegistry(["dev"])
        registry.register(read_action("boom", boom))
        who = principal(client, "admin@example.com")
        with pytest.raises(RuntimeError):
            registry.call(who, "boom", {}, surface="mcp")
        with pytest.raises(ValidationError):
            platform_of(client).ai.call(who, "get_flag", {"env": "dev"}, surface="mcp")
        assert [line["outcome"] for line in ai_lines(ai_log)] == ["error", "invalid"]


class TestDeclaration:
    def test_a_write_needs_a_preview(self) -> None:
        with pytest.raises(ValueError, match="need a preview"):
            AiAction("w", "d", BaseModel, "write", (Scope("flags", "write"),), lambda p, _: 1)

    def test_an_action_needs_a_scope(self) -> None:
        with pytest.raises(ValueError, match="at least one scope"):
            AiAction("r", "d", BaseModel, "read", (), lambda p, _: 1)

    def test_names_are_unique(self, client: TestClient) -> None:
        ai = platform_of(client).ai
        with pytest.raises(ValueError, match="already registered"):
            ai.register(ai.actions[0])

"""The MCP server, driven by FastMCP's client over the app in process (no network)."""

import asyncio
from collections.abc import Awaitable, Callable
from typing import Any

import httpx2
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from fastmcp import Client
from fastmcp.client.transports import StreamableHttpTransport
from fastmcp.exceptions import McpError, ToolError
from fastmcp.utilities.asgi_transport import StreamingASGITransport, run_asgi_lifespan

from platform_api.tools.flags.service import FlagService

READS = {"list_flags", "get_flag", "get_flag_evaluations", "list_approvals", "get_approval"}
WRITES = {"update_flag", "create_flag", "delete_flag"}
JSON_RPC = {"Accept": "application/json, text/event-stream"}


def app_of(client: TestClient) -> FastAPI:
    app = client.app
    assert isinstance(app, FastAPI)
    return app


def mcp[T](
    app: FastAPI,
    token: str | None,
    use: Callable[[Client[StreamableHttpTransport]], Awaitable[T]],
    headers: dict[str, str] | None = None,
) -> T:
    def in_process(**kwargs: Any) -> httpx2.AsyncClient:
        return httpx2.AsyncClient(transport=StreamingASGITransport(app), **kwargs)

    async def session() -> T:
        transport = StreamableHttpTransport(
            "http://testserver/mcp", auth=token, headers=headers, httpx_client_factory=in_process
        )
        failure: Exception | None = None
        # Raised outside the lifespan's task group, so a test sees the error itself.
        async with run_asgi_lifespan(app):
            try:
                async with Client(transport) as client:
                    return await use(client)
            except Exception as exc:
                failure = exc
        raise failure

    return asyncio.run(session())


def tool_names(app: FastAPI, token: str, headers: dict[str, str] | None = None) -> set[str]:
    async def use(client: Client[StreamableHttpTransport]) -> set[str]:
        return {tool.name for tool in await client.list_tools()}

    return mcp(app, token, use, headers)


def call(app: FastAPI, token: str, tool: str, arguments: dict[str, Any]) -> Any:
    async def use(client: Client[StreamableHttpTransport]) -> Any:
        return (await client.call_tool(tool, arguments)).structured_content

    return mcp(app, token, use)


def flags_of(client: TestClient) -> FlagService:
    service = app_of(client).state.flags
    assert isinstance(service, FlagService)
    return service


class TestToolsList:
    @pytest.mark.parametrize(
        ("email", "expected"),
        [
            ("viewer@example.com", READS),
            ("reviewer@example.com", READS),
            ("editor@example.com", READS | WRITES),
            ("dev-editor@example.com", READS | WRITES),
            ("admin@example.com", READS | WRITES),
        ],
    )
    def test_per_role(self, client: TestClient, email: str, expected: set[str]) -> None:
        assert tool_names(app_of(client), email) == expected

    def test_view_as_lists_reads_only(self, client: TestClient) -> None:
        names = tool_names(app_of(client), "admin@example.com", {"X-View-As": "editor@example.com"})
        assert names == READS

    def test_schemas_come_from_the_input_models(self, client: TestClient) -> None:
        async def use(c: Client[StreamableHttpTransport]) -> dict[str, Any]:
            return {t.name: t.input_schema for t in await c.list_tools()}

        schemas = mcp(app_of(client), "admin@example.com", use)
        assert schemas["get_flag"]["required"] == ["env", "key"]
        assert "changes" in schemas["update_flag"]["properties"]

    def test_annotations_mark_reads_and_deletes(self, client: TestClient) -> None:
        async def use(c: Client[StreamableHttpTransport]) -> dict[str, Any]:
            return {t.name: t.annotations for t in await c.list_tools()}

        annotations = mcp(app_of(client), "admin@example.com", use)
        assert annotations["get_flag"].read_only_hint is True
        assert annotations["update_flag"].read_only_hint is False
        assert annotations["delete_flag"].destructive_hint is True


class TestCalls:
    def test_read(self, client: TestClient) -> None:
        flag = call(
            app_of(client), "viewer@example.com", "get_flag", {"env": "dev", "key": "dark-mode"}
        )
        assert (flag["key"], flag["env"]) == ("dark-mode", "dev")

    def test_list_reads_are_wrapped(self, client: TestClient) -> None:
        result = call(app_of(client), "dev-editor@example.com", "list_flags", {})
        assert {f["env"] for f in result["items"]} == {"dev"}

    def test_approvals_read(self, client: TestClient) -> None:
        app = app_of(client)
        pending = call(app, "reviewer@example.com", "list_approvals", {})["items"]
        assert pending
        one = call(app, "reviewer@example.com", "get_approval", {"approval_id": pending[0]["id"]})
        assert one["id"] == pending[0]["id"]

    def test_write_in_a_direct_env_applies(self, client: TestClient) -> None:
        result = call(
            app_of(client),
            "editor@example.com",
            "update_flag",
            {"env": "dev", "key": "dark-mode", "changes": {"rollout_percent": 42}},
        )
        assert result["applied"] is True
        assert flags_of(client).get("dev", "dark-mode").rollout_percent == 42

    def test_write_elsewhere_files_an_approval(self, client: TestClient) -> None:
        result = call(
            app_of(client),
            "editor@example.com",
            "delete_flag",
            {"env": "staging", "key": "dark-mode"},
        )
        assert result["applied"] is False
        assert result["approval"]["action"] == "delete"
        assert result["approval"]["requested_by"] == "editor@example.com"
        assert flags_of(client).get("staging", "dark-mode")

    def test_write_beyond_scope_is_a_tool_error(self, client: TestClient) -> None:
        with pytest.raises(ToolError, match="flags:write:prod"):
            call(
                app_of(client),
                "dev-editor@example.com",
                "update_flag",
                {"env": "prod", "key": "dark-mode", "changes": {"enabled": True}},
            )

    def test_viewer_cannot_call_a_write_it_was_not_listed(self, client: TestClient) -> None:
        with pytest.raises(ToolError, match="flags:write"):
            call(
                app_of(client),
                "viewer@example.com",
                "delete_flag",
                {"env": "dev", "key": "dark-mode"},
            )

    def test_bad_arguments_are_a_sentence(self, client: TestClient) -> None:
        with pytest.raises(ToolError, match="minutes"):
            call(
                app_of(client),
                "viewer@example.com",
                "get_flag_evaluations",
                {"env": "dev", "key": "dark-mode", "minutes": 0},
            )


class TestAuth:
    def test_no_token_is_401(self, client: TestClient) -> None:
        response = client.post(
            "/mcp", json={"jsonrpc": "2.0", "id": 1, "method": "tools/list"}, headers=JSON_RPC
        )
        assert response.status_code == 401
        assert response.json() == {"detail": "Sign in first: the request carries no bearer token."}
        assert response.headers["WWW-Authenticate"] == "Bearer"

    def test_the_client_cannot_connect_without_a_token(self, client: TestClient) -> None:
        with pytest.raises(McpError):
            tool_names(app_of(client), "")

    def test_view_as_needs_an_admin(self, client: TestClient) -> None:
        headers = {**JSON_RPC, "Authorization": "Bearer lead@example.com"}
        response = client.post(
            "/mcp",
            json={"jsonrpc": "2.0", "id": 1, "method": "tools/list"},
            headers={**headers, "X-View-As": "viewer@example.com"},
        )
        assert response.status_code == 403

    def test_view_as_cannot_write(self, client: TestClient) -> None:
        async def use(c: Client[StreamableHttpTransport]) -> Any:
            return await c.call_tool("delete_flag", {"env": "dev", "key": "dark-mode"})

        with pytest.raises(ToolError, match="read-only"):
            mcp(app_of(client), "admin@example.com", use, {"X-View-As": "editor@example.com"})
        assert flags_of(client).get("dev", "dark-mode")

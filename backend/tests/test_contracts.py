"""The generated artifacts the frontend reads must match the code.

When one of these fails, regenerate:
    uv run python scripts/dump_openapi.py
    uv run python scripts/dump_scope_contract.py
"""

import json

from platform_api.artifacts import (
    OPENAPI_PATH,
    SCOPE_CONTRACT_PATH,
    openapi_document,
    scope_contract_document,
)


def test_openapi_json_is_current() -> None:
    assert OPENAPI_PATH.read_text() == openapi_document(), "run scripts/dump_openapi.py"


def test_scope_contract_json_is_current() -> None:
    assert SCOPE_CONTRACT_PATH.read_text() == scope_contract_document(), (
        "run scripts/dump_scope_contract.py"
    )


def test_openapi_covers_the_contract() -> None:
    paths = json.loads(openapi_document())["paths"]
    expected = {
        "/health": {"get"},
        "/config": {"get"},
        "/auth/me": {"get"},
        "/api/flags": {"get", "post"},
        "/api/flags/{key}": {"get", "put", "delete"},
        "/api/flags/{key}/evaluations": {"get"},
        "/api/approvals": {"get"},
        "/api/approvals/{approval_id}": {"get"},
        "/api/approvals/{approval_id}/approve": {"post"},
        "/api/approvals/{approval_id}/reject": {"post"},
        "/api/approvals/{approval_id}/withdraw": {"post"},
        "/api/agent": {"post"},
        "/api/agent/status": {"get"},
    }
    assert {path: set(ops) for path, ops in paths.items()} == expected
    assert {"200", "202", "409"} <= set(paths["/api/flags"]["post"]["responses"])
    for method in ("put", "delete"):
        assert {"200", "202", "404"} <= set(paths["/api/flags/{key}"][method]["responses"])
    queued = paths["/api/flags/{key}"]["put"]["responses"]["202"]["content"]["application/json"]
    assert queued["schema"]["$ref"].endswith("/ApprovalQueued")
    agent = paths["/api/agent"]["post"]
    assert "text/event-stream" in agent["responses"]["200"]["content"]
    assert "503" in agent["responses"]
    assert agent["requestBody"]["content"]["application/json"]["schema"]["required"] == [
        "threadId",
        "runId",
        "messages",
    ]

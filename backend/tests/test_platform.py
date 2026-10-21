"""Configuration, the error contract, logging, and the unauthenticated routes."""

import json
import logging
import sys
from collections.abc import Callable
from typing import Any

import pytest
from fastapi import APIRouter
from fastapi.testclient import TestClient
from pydantic import ValidationError

from platform_api.app import create_app
from platform_api.config import Settings, default_settings
from platform_api.envs import fan_out
from platform_api.errors import validation_sentence
from platform_api.log import JsonFormatter
from tests.conftest import TokenIsEmail, settings_for


def test_health_and_config_need_no_auth(client: TestClient) -> None:
    assert client.get("/health").json() == {"status": "ok"}
    assert client.get("/config").json() == {
        "app_name": "DevOps Platform",
        "environments": ["dev", "staging", "prod"],
        "direct_envs": ["dev"],
    }


def test_config_follows_settings(make_client: Callable[..., TestClient]) -> None:
    client = make_client(environments="dev,qa,prod", direct_envs="dev,qa", app_name="Ops")
    assert client.get("/config").json() == {
        "app_name": "Ops",
        "environments": ["dev", "qa", "prod"],
        "direct_envs": ["dev", "qa"],
    }


@pytest.mark.parametrize(
    ("overrides", "message"),
    [
        ({"environments": ""}, "at least one environment"),
        ({"environments": "dev,dev"}, "must not repeat"),
        ({"environments": "dev,all"}, "reserved"),
        ({"direct_envs": "qa"}, "DIRECT_ENVS"),
        ({"approval_ttl_hours": 0}, "APPROVAL_TTL_HOURS"),
        ({"auth_mode": "oidc"}, "OIDC_ISSUER, OIDC_AUDIENCE, OIDC_JWKS_URL"),
        ({"role_bindings": "{"}, "ROLE_BINDINGS is not valid JSON"),
        ({"role_bindings": "[]"}, "must be a JSON object"),
        ({"role_bindings": '{"a@example.com": "admin"}'}, "list of role names"),
        ({"custom_roles": '{"r": "flags:read"}'}, "list of scopes"),
        ({"aws_role_arns": '{"dev": 1}'}, "role ARN strings"),
    ],
)
def test_settings_validation(overrides: dict[str, Any], message: str) -> None:
    with pytest.raises(ValidationError, match=message):
        Settings(_env_file=None, **overrides)


def test_settings_parse_lists_and_maps() -> None:
    settings = Settings(
        _env_file=None,
        cors_origins="http://localhost:5173, https://ops.example.com",
        aws_role_arns='{"prod": "arn:aws:iam::123456789012:role/x"}',
    )
    assert settings.cors_origin_list == ["http://localhost:5173", "https://ops.example.com"]
    assert settings.aws_role_arn_map == {"prod": "arn:aws:iam::123456789012:role/x"}
    assert default_settings().environment_list == ["dev", "staging", "prod"]


def test_unknown_roles_fail_at_startup() -> None:
    with pytest.raises(ValueError, match="unknown role"):
        create_app(settings_for(default_roles="ghost"))


def test_cors_allows_the_view_as_header(make_client: Callable[..., TestClient]) -> None:
    client = make_client(cors_origins="http://localhost:5173")
    response = client.options(
        "/api/flags",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "authorization,x-view-as",
        },
    )
    assert response.status_code == 200
    assert "x-view-as" in response.headers["access-control-allow-headers"].lower()


def test_unknown_paths_and_crashes_keep_the_error_shape() -> None:
    app = create_app(settings_for(), verifier=TokenIsEmail())
    crash = APIRouter()

    @crash.get("/boom")
    def boom() -> None:
        raise RuntimeError("kaboom")

    app.include_router(crash)
    client = TestClient(app, raise_server_exceptions=False)
    assert client.get("/nowhere").json() == {"detail": "Not Found"}
    response = client.get("/boom")
    assert response.status_code == 500
    assert response.json() == {"detail": "Something went wrong on our side; try again in a moment."}


def test_validation_sentence_edge_cases() -> None:
    assert validation_sentence([]) == "The request did not validate."
    two = [
        {"loc": ("body", "owner"), "msg": "String should have at least 1 character"},
        {"loc": ("query", "env"), "msg": "Field required"},
    ]
    assert validation_sentence(two) == (
        "owner: String should have at least 1 character (1 more problem(s))."
    )


def test_json_formatter_merges_fields_and_exceptions() -> None:
    try:
        raise ValueError("bad")
    except ValueError:
        record = logging.LogRecord(
            "x", logging.ERROR, __file__, 1, "hello %s", ("you",), sys.exc_info()
        )
    record.fields = {"env": "prod"}
    line = json.loads(JsonFormatter().format(record))
    assert line["message"] == "hello you"
    assert line["env"] == "prod"
    assert line["level"] == "ERROR"
    assert "ValueError: bad" in line["exception"]


def test_fan_out_keeps_env_order() -> None:
    assert fan_out(["a", "b", "c"], lambda env: [env, env.upper()]) == [
        "a",
        "A",
        "b",
        "B",
        "c",
        "C",
    ]

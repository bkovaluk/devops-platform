import json
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient

from platform_api.app import create_app
from platform_api.auth.providers import Identity
from platform_api.config import Settings
from platform_api.errors import Unauthenticated

ROLE_BINDINGS = {
    "admin@example.com": ["admin"],
    "editor@example.com": ["editor"],
    "editor2@example.com": ["editor"],
    "reviewer@example.com": ["reviewer"],
    "lead@example.com": ["editor", "reviewer"],
    "viewer@example.com": ["viewer"],
    "dev-editor@example.com": ["dev-editor"],
    "prod-reviewer@example.com": ["prod-reviewer"],
}
CUSTOM_ROLES = {
    "dev-editor": ["flags:read:dev", "flags:write:dev"],
    "prod-reviewer": ["flags:read", "approvals:review:prod"],
}

START = datetime(2026, 10, 20, 12, 0, 30, tzinfo=UTC)


class TokenIsEmail:
    """Test verifier: the bearer token is the caller's email."""

    def verify(self, token: str | None) -> Identity:
        if not token:
            raise Unauthenticated("Sign in first: the request carries no bearer token.")
        return Identity(email=token, name=token.split("@")[0])


class FakeClock:
    def __init__(self, now: datetime) -> None:
        self.now = now

    def __call__(self) -> datetime:
        return self.now

    def advance(self, **delta: float) -> None:
        self.now += timedelta(**delta)


def as_user(email: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {email}"}


def settings_for(**overrides: Any) -> Settings:
    values: dict[str, Any] = {
        "role_bindings": json.dumps(ROLE_BINDINGS),
        "custom_roles": json.dumps(CUSTOM_ROLES),
        "log_level": "WARNING",
    }
    values.update(overrides)
    return Settings(_env_file=None, **values)


@pytest.fixture
def clock() -> FakeClock:
    return FakeClock(START)


@pytest.fixture
def make_client(clock: FakeClock) -> Callable[..., TestClient]:
    def make(**overrides: Any) -> TestClient:
        app = create_app(settings_for(**overrides), verifier=TokenIsEmail(), clock=clock)
        return TestClient(app)

    return make


@pytest.fixture
def client(make_client: Callable[..., TestClient]) -> TestClient:
    return make_client()


@pytest.fixture
def empty_client(make_client: Callable[..., TestClient]) -> TestClient:
    """No seeded flags or approvals."""
    return make_client(seed_example_data=False)

import time
from typing import Any

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient

from platform_api.app import create_app
from platform_api.auth.providers import DevVerifier, OidcVerifier, build_verifier
from platform_api.errors import Forbidden, Unauthenticated
from tests.conftest import as_user, settings_for

ISSUER = "https://issuer.example.com"
AUDIENCE = "platform-ui"
OIDC = {
    "auth_mode": "oidc",
    "oidc_issuer": ISSUER,
    "oidc_audience": AUDIENCE,
    "oidc_jwks_url": "https://issuer.example.com/jwks",
}


class StaticKeys:
    def __init__(self, public_key: Any) -> None:
        self._key = jwt.PyJWK.from_dict(
            {**jwt.algorithms.RSAAlgorithm.to_jwk(public_key, as_dict=True), "alg": "RS256"}
        )

    def get_signing_key_from_jwt(self, token: str) -> jwt.PyJWK:
        return self._key


@pytest.fixture(scope="module")
def private_key() -> rsa.RSAPrivateKey:
    return rsa.generate_private_key(public_exponent=65537, key_size=2048)


def token(private_key: rsa.RSAPrivateKey, **claims: Any) -> str:
    now = int(time.time())
    body = {
        "iss": ISSUER,
        "aud": AUDIENCE,
        "exp": now + 300,
        "iat": now,
        "email": "Ada@Example.com",
        "email_verified": True,
        "name": "Ada",
        "hd": "example.com",
    }
    body.update(claims)
    return jwt.encode({k: v for k, v in body.items() if v is not None}, private_key, "RS256")


def verifier(private_key: rsa.RSAPrivateKey, hosted_domain: str | None = None) -> OidcVerifier:
    return OidcVerifier(
        issuer=ISSUER,
        audience=AUDIENCE,
        keys=StaticKeys(private_key.public_key()),
        hosted_domain=hosted_domain,
    )


def test_oidc_accepts_a_valid_token(private_key: rsa.RSAPrivateKey) -> None:
    identity = verifier(private_key, "example.com").verify(token(private_key))
    assert identity.email == "ada@example.com"
    assert identity.name == "Ada"


def test_oidc_falls_back_to_the_local_part_for_a_name(private_key: rsa.RSAPrivateKey) -> None:
    identity = verifier(private_key).verify(token(private_key, name=None))
    assert identity.name == "ada"


@pytest.mark.parametrize(
    "claims",
    [{"aud": "someone-else"}, {"iss": "https://evil.example.com"}, {"exp": 1}, {"email": None}],
)
def test_oidc_rejects_bad_tokens(private_key: rsa.RSAPrivateKey, claims: dict[str, Any]) -> None:
    with pytest.raises(Unauthenticated):
        verifier(private_key).verify(token(private_key, **claims))


def test_oidc_rejects_missing_token(private_key: rsa.RSAPrivateKey) -> None:
    with pytest.raises(Unauthenticated, match="no bearer token"):
        verifier(private_key).verify(None)


def test_oidc_rejects_a_token_signed_by_another_key(private_key: rsa.RSAPrivateKey) -> None:
    other = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    with pytest.raises(Unauthenticated):
        verifier(private_key).verify(token(other))


def test_oidc_enforces_hosted_domain_and_verified_email(private_key: rsa.RSAPrivateKey) -> None:
    with pytest.raises(Forbidden, match=r"example\.com account"):
        verifier(private_key, "example.com").verify(token(private_key, hd="other.example.org"))
    with pytest.raises(Forbidden, match="Verify the address"):
        verifier(private_key).verify(token(private_key, email_verified=False))


def test_build_verifier_follows_auth_mode() -> None:
    assert isinstance(build_verifier(settings_for()), DevVerifier)
    assert isinstance(build_verifier(settings_for(**OIDC)), OidcVerifier)


def test_oidc_mode_answers_401_without_a_token() -> None:
    client = TestClient(create_app(settings_for(**OIDC)))
    response = client.get("/auth/me")
    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"
    assert response.json() == {"detail": "Sign in first: the request carries no bearer token."}
    assert client.get("/health").status_code == 200


def test_dev_mode_answers_as_the_dev_user_without_a_token() -> None:
    client = TestClient(create_app(settings_for(dev_user_email="dev@example.com")))
    me = client.get("/auth/me").json()
    assert me == {
        "email": "dev@example.com",
        "name": "Ada",
        "scopes": ["*"],
        "is_admin": True,
        "view_as": None,
    }


def test_me_lists_scopes(client: TestClient) -> None:
    me = client.get("/auth/me", headers=as_user("lead@example.com")).json()
    assert me == {
        "email": "lead@example.com",
        "name": "lead",
        "scopes": ["flags:read", "flags:write", "approvals:review"],
        "is_admin": False,
        "view_as": None,
    }


def test_unlisted_users_hold_the_default_roles(client: TestClient) -> None:
    me = client.get("/auth/me", headers=as_user("stranger@example.com")).json()
    assert me["scopes"] == ["flags:read"]


def test_bearer_scheme_is_required(client: TestClient) -> None:
    response = client.get("/auth/me", headers={"Authorization": "Basic abc"})
    assert response.status_code == 401


class TestViewAs:
    def test_admin_sees_what_another_user_sees(self, client: TestClient) -> None:
        headers = {**as_user("admin@example.com"), "X-View-As": "Viewer@example.com"}
        me = client.get("/auth/me", headers=headers).json()
        assert me == {
            "email": "viewer@example.com",
            "name": "viewer",
            "scopes": ["flags:read"],
            "is_admin": False,
            "view_as": "viewer@example.com",
        }

    def test_view_as_narrows_reads(self, client: TestClient) -> None:
        headers = {**as_user("admin@example.com"), "X-View-As": "dev-editor@example.com"}
        flags = client.get("/api/flags?env=all", headers=headers).json()
        assert {f["env"] for f in flags} == {"dev"}

    def test_non_admins_may_not_ask(self, client: TestClient) -> None:
        headers = {**as_user("lead@example.com"), "X-View-As": "viewer@example.com"}
        response = client.get("/auth/me", headers=headers)
        assert response.status_code == 403
        assert "Only admins" in response.json()["detail"]

    def test_view_as_is_read_only(self, client: TestClient) -> None:
        headers = {**as_user("admin@example.com"), "X-View-As": "lead@example.com"}
        response = client.put(
            "/api/flags/dark-mode?env=dev", json={"enabled": False}, headers=headers
        )
        assert response.status_code == 403
        assert "read-only" in response.json()["detail"]

    def test_target_must_be_an_email(self, client: TestClient) -> None:
        headers = {**as_user("admin@example.com"), "X-View-As": "role:viewer"}
        assert client.get("/auth/me", headers=headers).status_code == 400

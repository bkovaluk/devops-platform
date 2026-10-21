"""Who is calling: a bearer token in, a verified identity out.

The provider is chosen by ``AUTH_MODE``. ``dev`` answers every request as the
configured user and is for local work only. ``oidc`` verifies an ID token
against the issuer's published keys; with ``OIDC_HOSTED_DOMAIN`` set it also
requires Google's ``hd`` claim, which is how a Google Workspace sign-in is
confined to one organisation. Any other OIDC issuer works the same way.
"""

import logging
from dataclasses import dataclass
from typing import Final, Protocol

import jwt

from platform_api.config import Settings
from platform_api.errors import Forbidden, Unauthenticated

logger = logging.getLogger(__name__)

ALGORITHMS: Final = ["RS256", "ES256"]


@dataclass(frozen=True, slots=True)
class Identity:
    email: str
    name: str


class TokenVerifier(Protocol):
    def verify(self, token: str | None) -> Identity:
        """The identity behind *token*, or :class:`Unauthenticated`."""
        ...


class SigningKeys(Protocol):
    """Resolves the key a token was signed with (``jwt.PyJWKClient`` fits)."""

    def get_signing_key_from_jwt(self, token: str) -> jwt.PyJWK: ...


class DevVerifier:
    """Accepts any request as one configured user. Never for a shared deployment."""

    def __init__(self, email: str, name: str) -> None:
        self._identity = Identity(email=email.lower(), name=name)

    def verify(self, token: str | None) -> Identity:
        return self._identity


class OidcVerifier:
    def __init__(
        self,
        *,
        issuer: str,
        audience: str,
        keys: SigningKeys,
        hosted_domain: str | None = None,
    ) -> None:
        self._issuer = issuer
        self._audience = audience
        self._keys = keys
        self._hosted_domain = hosted_domain

    def verify(self, token: str | None) -> Identity:
        if not token:
            raise Unauthenticated("Sign in first: the request carries no bearer token.")
        try:
            key = self._keys.get_signing_key_from_jwt(token)
            claims = jwt.decode(
                token,
                key.key,
                algorithms=ALGORITHMS,
                audience=self._audience,
                issuer=self._issuer,
                options={"require": ["exp", "iss", "aud"]},
            )
        except jwt.PyJWTError as exc:
            logger.info("auth.rejected", extra={"fields": {"reason": str(exc)}})
            raise Unauthenticated("Sign in again: the bearer token is invalid or expired.") from exc
        email = claims.get("email")
        if not isinstance(email, str) or not email:
            raise Unauthenticated("Sign in again: the token carries no email address.")
        if claims.get("email_verified") is False:
            raise Forbidden(f"Verify the address {email} with your identity provider first.")
        if self._hosted_domain and claims.get("hd") != self._hosted_domain:
            raise Forbidden(f"Sign in with a {self._hosted_domain} account.")
        email = email.lower()
        name = claims.get("name")
        return Identity(
            email=email,
            name=name if isinstance(name, str) and name else email.split("@")[0],
        )


def build_verifier(settings: Settings) -> TokenVerifier:
    if settings.auth_mode == "dev":
        logger.warning(
            "auth.dev_mode",
            extra={"fields": {"user": settings.dev_user_email}},
        )
        return DevVerifier(settings.dev_user_email, settings.dev_user_name)
    assert settings.oidc_issuer and settings.oidc_audience and settings.oidc_jwks_url
    return OidcVerifier(
        issuer=settings.oidc_issuer,
        audience=settings.oidc_audience,
        keys=jwt.PyJWKClient(settings.oidc_jwks_url, cache_keys=True),
        hosted_domain=settings.oidc_hosted_domain,
    )

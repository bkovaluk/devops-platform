"""FastAPI dependencies that turn a request into an authorized principal."""

from collections.abc import Callable
from typing import Annotated

from fastapi import Depends, Request

from platform_api.auth.principal import Principal
from platform_api.auth.scopes import TOOL_ACTIONS
from platform_api.auth.view_as import HEADER, READ_ONLY_METHODS, read_only, view_as
from platform_api.context import Platform, get_platform
from platform_api.envs import SingleEnv, check_env_access

BEARER = "bearer"


def bearer_token(request: Request) -> str | None:
    scheme, _, token = request.headers.get("Authorization", "").partition(" ")
    if scheme.lower() != BEARER:
        return None
    return token.strip() or None


def authenticate(
    request: Request, platform: Annotated[Platform, Depends(get_platform)]
) -> Principal:
    """The verified caller, or whoever an admin is viewing as, whatever the method."""
    identity = platform.verifier.verify(bearer_token(request))
    principal = Principal(
        email=identity.email,
        name=identity.name,
        grants=platform.roles.grants_for(identity.email),
    )
    request.state.principal_email = principal.email
    target = request.headers.get(HEADER)
    if target:
        principal = view_as(principal, target, platform.roles)
        request.state.view_as = principal.view_as
    return principal


def current_principal(
    request: Request, platform: Annotated[Platform, Depends(get_platform)]
) -> Principal:
    principal = authenticate(request, platform)
    if principal.view_as and request.method.upper() not in READ_ONLY_METHODS:
        raise read_only(principal)
    return principal


CurrentPrincipal = Annotated[Principal, Depends(current_principal)]


def require_scope(tool: str, action: str) -> Callable[..., Principal]:
    """A dependency admitting callers who may do *action* with *tool* in the route's env.

    For routes about one item in one environment: the ``env`` query parameter is
    validated (``all`` is a 400) and qualifies the requirement, so a grant
    narrowed to ``dev`` opens the route in dev only.
    """
    if action not in TOOL_ACTIONS.get(tool, ()):
        raise ValueError(f"'{tool}:{action}' is not in the scope vocabulary")

    def dependency(env: SingleEnv, principal: CurrentPrincipal) -> Principal:
        check_env_access(principal, tool, action, env)
        return principal

    return dependency

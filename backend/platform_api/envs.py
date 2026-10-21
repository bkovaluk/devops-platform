"""Environments: which one a request names, which ones a caller may reach, and
reading many at once.

List routes take ``env=all`` or one environment; ``all`` covers every
configured environment the caller holds the scope for. Routes about one item
take exactly one environment and refuse ``all`` with a 400.
"""

from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from typing import Annotated, Final

from fastapi import Depends, Query

from platform_api.auth.principal import Principal, authorize
from platform_api.auth.scopes import Scope
from platform_api.context import Platform, get_platform
from platform_api.errors import BadRequest, Forbidden

ALL: Final = "all"

_pool = ThreadPoolExecutor(max_workers=8, thread_name_prefix="fan-out")


def known_env(platform: Platform, env: str) -> str:
    envs = platform.settings.environment_list
    if env not in envs:
        raise BadRequest(f"Unknown environment '{env}'; choose one of {', '.join(envs)}.")
    return env


def single_env(
    platform: Annotated[Platform, Depends(get_platform)],
    env: Annotated[str, Query(description="One environment; 'all' is refused")],
) -> str:
    if env == ALL:
        raise BadRequest("This route is about one item, so name one environment, not 'all'.")
    return known_env(platform, env)


#: The one environment a single-item route acts in, validated.
SingleEnv = Annotated[str, Depends(single_env)]


def check_env_access(principal: Principal, tool: str, action: str, env: str) -> None:
    authorize(principal, Scope(tool, action, env))


def accessible_envs(platform: Platform, principal: Principal, tool: str, action: str) -> list[str]:
    """Every configured environment where *principal* may do *action* with *tool*."""
    return [
        env
        for env in platform.settings.environment_list
        if principal.holds(Scope(tool, action, env))
    ]


def selected_envs(
    platform: Platform, principal: Principal, selector: str, tool: str, action: str
) -> list[str]:
    """The environments a list request covers, in configured order."""
    if selector == ALL:
        envs = accessible_envs(platform, principal, tool, action)
        if not envs:
            raise Forbidden(f"You need {tool}:{action} in at least one environment to list these.")
        return envs
    env = known_env(platform, selector)
    check_env_access(principal, tool, action, env)
    return [env]


def fan_out[T](envs: list[str], fetch: Callable[[str], list[T]]) -> list[T]:
    """Run *fetch* for every environment in parallel; results keep *envs* order."""
    if len(envs) == 1:
        return fetch(envs[0])
    futures = [_pool.submit(fetch, env) for env in envs]
    return [item for future in futures for item in future.result()]

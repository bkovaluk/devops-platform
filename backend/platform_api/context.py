"""Everything a request handler needs, built once per app by the factory."""

from dataclasses import dataclass
from typing import cast

from fastapi import Request

from platform_api.ai.actions import AiRegistry
from platform_api.approvals.engine import ApprovalEngine
from platform_api.approvals.registry import ApprovalRegistry
from platform_api.auth.providers import TokenVerifier
from platform_api.auth.roles import RoleBook
from platform_api.auth.scopes import Vocabulary
from platform_api.clock import Clock
from platform_api.config import Settings


@dataclass(frozen=True, slots=True)
class Platform:
    settings: Settings
    vocabulary: Vocabulary
    verifier: TokenVerifier
    roles: RoleBook
    approvals: ApprovalEngine
    approval_registry: ApprovalRegistry
    ai: AiRegistry
    clock: Clock


def get_platform(request: Request) -> Platform:
    return cast(Platform, request.app.state.platform)

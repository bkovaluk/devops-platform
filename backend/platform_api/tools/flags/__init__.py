"""Feature flags, the example tool: one per environment, changed under approval."""

from fastapi import FastAPI

from platform_api.approvals.registry import ApprovalHandler
from platform_api.context import Platform
from platform_api.tools.flags.ai import ai_actions
from platform_api.tools.flags.routes import router
from platform_api.tools.flags.seed import seed_examples
from platform_api.tools.flags.service import ACTIONS, TOOL, FlagService
from platform_api.tools.flags.store import build_flag_store


def install(app: FastAPI, platform: Platform) -> None:
    settings = platform.settings
    store = build_flag_store(settings)
    service = FlagService(store, platform.approvals, settings.direct_env_list, platform.clock)
    platform.approval_registry.register(ApprovalHandler(TOOL, ACTIONS, service.replay))
    platform.ai.register(*ai_actions(platform, service))
    app.state.flags = service
    app.include_router(router)
    if settings.store == "memory" and settings.seed_example_data:
        seed_examples(
            store,
            platform.approvals,
            settings.environment_list,
            settings.direct_env_list,
            platform.clock(),
        )

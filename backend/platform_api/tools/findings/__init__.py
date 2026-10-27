"""Investigations: the DevOps agent's findings, read and reviewed per environment."""

from fastapi import FastAPI

from platform_api.context import Platform
from platform_api.tools.findings.routes import router
from platform_api.tools.findings.seed import seed_examples
from platform_api.tools.findings.service import FindingService
from platform_api.tools.findings.store import MemoryFindingStore, build_finding_store


def install(app: FastAPI, platform: Platform) -> None:
    settings = platform.settings
    store = build_finding_store(settings)
    app.state.findings = FindingService(store, platform.clock)
    app.include_router(router)
    if isinstance(store, MemoryFindingStore) and settings.seed_example_data:
        seed_examples(store, settings.environment_list, platform.clock())

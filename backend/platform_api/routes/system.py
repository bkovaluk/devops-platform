"""Unauthenticated routes: liveness, and what the UI needs before sign-in."""

from typing import Annotated, Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from platform_api.context import Platform, get_platform

router = APIRouter(tags=["system"])


class Health(BaseModel):
    status: Literal["ok"] = "ok"


class PublicConfig(BaseModel):
    app_name: str
    environments: list[str]
    direct_envs: list[str]


@router.get("/health")
def health() -> Health:
    return Health()


@router.get("/config")
def public_config(platform: Annotated[Platform, Depends(get_platform)]) -> PublicConfig:
    settings = platform.settings
    return PublicConfig(
        app_name=settings.app_name,
        environments=settings.environment_list,
        direct_envs=settings.direct_env_list,
    )

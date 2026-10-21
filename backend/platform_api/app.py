"""The app factory: settings in, a fully wired FastAPI app out."""

from datetime import timedelta

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.routing import APIRoute

from platform_api.ai import mcp
from platform_api.ai import routes as agent
from platform_api.ai.actions import AiRegistry
from platform_api.ai.agent import build_agent
from platform_api.approvals import ai as approval_ai
from platform_api.approvals.engine import ApprovalEngine
from platform_api.approvals.registry import ApprovalRegistry
from platform_api.approvals.store import ApprovalStore, DynamoApprovalStore, MemoryApprovalStore
from platform_api.auth.providers import TokenVerifier, build_verifier
from platform_api.auth.roles import RoleBook
from platform_api.auth.scopes import vocabulary_for
from platform_api.auth.view_as import HEADER as VIEW_AS_HEADER
from platform_api.clock import Clock, utc_now
from platform_api.config import Settings, get_settings
from platform_api.context import Platform
from platform_api.errors import install_error_handlers
from platform_api.log import configure_logging, log_requests
from platform_api.routes import approvals, auth, system
from platform_api.storage import dynamodb_client
from platform_api.tools import INSTALLERS


def operation_id(route: APIRoute) -> str:
    """``<tag>_<function>``, so generated clients read as surface and verb."""
    tag = str(route.tags[0]) if route.tags else "default"
    return f"{tag}_{route.name}"


def _approval_store(settings: Settings) -> ApprovalStore:
    if settings.store == "dynamodb":
        return DynamoApprovalStore(dynamodb_client(settings), settings.dynamodb_table)
    return MemoryApprovalStore()


def create_app(
    settings: Settings | None = None,
    *,
    verifier: TokenVerifier | None = None,
    clock: Clock = utc_now,
) -> FastAPI:
    settings = settings or get_settings()
    configure_logging(settings.log_level)

    vocabulary = vocabulary_for(settings.environment_list)
    registry = ApprovalRegistry()
    platform = Platform(
        settings=settings,
        vocabulary=vocabulary,
        verifier=verifier or build_verifier(settings),
        roles=RoleBook.from_settings(settings, vocabulary),
        approvals=ApprovalEngine(
            _approval_store(settings),
            registry,
            ttl=timedelta(hours=settings.approval_ttl_hours),
            clock=clock,
        ),
        approval_registry=registry,
        ai=AiRegistry(settings.environment_list),
        clock=clock,
    )
    mcp_server = mcp.build_mcp(platform)
    mcp_app = mcp_server.http_app(path=mcp.MCP_PATH, stateless_http=True, json_response=True)

    app = FastAPI(
        title=settings.app_name,
        version="0.1.0",
        generate_unique_id_function=operation_id,
        lifespan=mcp_app.lifespan,
    )
    app.state.platform = platform
    app.state.agent = build_agent(settings)
    install_error_handlers(app)
    app.middleware("http")(log_requests)
    if settings.cors_origin_list:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=settings.cors_origin_list,
            allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
            allow_headers=["Authorization", "Content-Type", VIEW_AS_HEADER],
        )

    app.include_router(system.router)
    app.include_router(auth.router)
    app.include_router(approvals.router)
    app.include_router(agent.router)
    for install in INSTALLERS:
        install(app, platform)
    platform.ai.register(*approval_ai.ai_actions(platform.approvals, registry.tools))
    mcp.publish(mcp_server, platform.ai)
    mcp.mount(app, platform, mcp_app)
    return app

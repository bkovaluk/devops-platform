"""The ASGI entry point: ``uvicorn platform_api.main:app``."""

from platform_api.app import create_app

app = create_app()

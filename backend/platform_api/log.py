"""Structured logging: one JSON object per line.

Pass structured context as ``extra={"fields": {...}}``; it is merged into the
line beside the message. Every request is logged once, on its way out.
"""

import json
import logging
import time
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime

from fastapi import Request, Response

logger = logging.getLogger("platform_api.request")


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        line: dict[str, object] = {
            "ts": datetime.fromtimestamp(record.created, tz=UTC).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        fields = getattr(record, "fields", None)
        if isinstance(fields, dict):
            line.update(fields)
        if record.exc_info:
            line["exception"] = self.formatException(record.exc_info)
        return json.dumps(line, default=str)


def configure_logging(level: str) -> None:
    handler = logging.StreamHandler()
    handler.setFormatter(JsonFormatter())
    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(getattr(logging, level.upper(), logging.INFO))
    # FastMCP installs console handlers of its own on import; its lines join these instead.
    fastmcp = logging.getLogger("fastmcp")
    fastmcp.handlers = []
    fastmcp.propagate = True


async def log_requests(
    request: Request, call_next: Callable[[Request], Awaitable[Response]]
) -> Response:
    started = time.perf_counter()
    response = await call_next(request)
    logger.info(
        "request",
        extra={
            "fields": {
                "method": request.method,
                "path": request.url.path,
                "status": response.status_code,
                "duration_ms": round((time.perf_counter() - started) * 1000, 1),
                "principal": getattr(request.state, "principal_email", None),
                "view_as": getattr(request.state, "view_as", None),
            }
        },
    )
    return response

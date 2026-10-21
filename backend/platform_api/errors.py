"""The error contract: every failure answers `{"detail": "<one sentence>"}`.

Code anywhere in the service raises an :class:`ApiError` subclass with a
sentence a person can act on; the handlers installed by
:func:`install_error_handlers` turn it, FastAPI's own validation failures and
anything unexpected into that one shape.

The dictionaries at the bottom are how the statuses reach OpenAPI: each names a
shape of failure, so a route declares what it can answer with in one reference.
"""

import logging
from collections.abc import Mapping, Sequence
from typing import Any, Final

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger(__name__)


class ErrorBody(BaseModel):
    detail: str


class ApiError(Exception):
    """A failure with a status and a sentence for the caller."""

    status_code: int = 500

    def __init__(self, detail: str, *, headers: dict[str, str] | None = None) -> None:
        super().__init__(detail)
        self.detail = detail
        self.headers = headers


class BadRequest(ApiError):
    status_code = 400


class Unauthenticated(ApiError):
    status_code = 401

    def __init__(self, detail: str) -> None:
        super().__init__(detail, headers={"WWW-Authenticate": "Bearer"})


class Forbidden(ApiError):
    status_code = 403


class NotFound(ApiError):
    status_code = 404


class Conflict(ApiError):
    status_code = 409


class UpstreamError(ApiError):
    status_code = 502


class Unavailable(ApiError):
    status_code = 503


def _body(status_code: int, detail: str, headers: dict[str, str] | None = None) -> JSONResponse:
    return JSONResponse(status_code=status_code, content={"detail": detail}, headers=headers)


def validation_sentence(errors: Sequence[Mapping[str, Any]]) -> str:
    """FastAPI's list of validation failures, as the first one in a sentence.

    A parameter shared by two dependencies is reported once per dependency, so
    identical failures are counted once.
    """
    sentences: list[str] = []
    for error in errors:
        location = [str(part) for part in error.get("loc", ()) if part not in ("body", "query")]
        message = str(error.get("msg", "is invalid")).removeprefix("Value error, ").rstrip(".")
        sentence = f"{'.'.join(location)}: {message}" if location else message
        if sentence not in sentences:
            sentences.append(sentence)
    if not sentences:
        return "The request did not validate."
    more = f" ({len(sentences) - 1} more problem(s))" if len(sentences) > 1 else ""
    return f"{sentences[0]}{more}."


def install_error_handlers(app: FastAPI) -> None:
    async def on_api_error(_: Request, exc: Exception) -> JSONResponse:
        assert isinstance(exc, ApiError)
        return _body(exc.status_code, exc.detail, exc.headers)

    async def on_http_error(_: Request, exc: Exception) -> JSONResponse:
        assert isinstance(exc, StarletteHTTPException)
        detail = exc.detail if isinstance(exc.detail, str) else "The request failed."
        return _body(exc.status_code, detail, dict(exc.headers or {}) or None)

    async def on_validation_error(_: Request, exc: Exception) -> JSONResponse:
        assert isinstance(exc, RequestValidationError)
        return _body(422, validation_sentence(list(exc.errors())))

    async def on_unexpected(request: Request, exc: Exception) -> JSONResponse:
        logger.error("unhandled error", extra={"fields": {"path": request.url.path}}, exc_info=exc)
        return _body(500, "Something went wrong on our side; try again in a moment.")

    app.add_exception_handler(ApiError, on_api_error)
    app.add_exception_handler(StarletteHTTPException, on_http_error)
    app.add_exception_handler(RequestValidationError, on_validation_error)
    app.add_exception_handler(Exception, on_unexpected)


_DESCRIPTIONS: Final[dict[int, str]] = {
    400: "The request names something this deployment cannot act on",
    401: "No verified identity on the request",
    403: "The caller's scopes do not open this",
    404: "No such resource",
    409: "The resource is not in a state that allows this",
    422: "The request did not validate",
    502: "An upstream service failed",
    503: "The feature is not configured on this deployment",
}


def error_responses(*statuses: int) -> dict[int | str, dict[str, Any]]:
    """The OpenAPI declaration for a set of statuses, all carrying :class:`ErrorBody`."""
    return {
        status: {"model": ErrorBody, "description": _DESCRIPTIONS[status]} for status in statuses
    }


#: Any authenticated operation: no identity, no scope, or a request that does not validate.
AUTHENTICATED: Final = error_responses(401, 403, 422)

#: Lists across one environment or all of them.
ENV_LIST: Final = error_responses(400, 502)

#: Reads one item in one environment.
ENV_ITEM: Final = error_responses(400, 404, 502)

#: Changes one item in one environment.
ENV_MUTATION: Final = error_responses(400, 404, 409, 502)

#: Reads one stored record.
ITEM: Final = error_responses(404, 502)

#: Moves one stored record to another state.
DECISION: Final = error_responses(404, 409, 502)

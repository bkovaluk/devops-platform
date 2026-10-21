"""Time, injectable so expiry and series can be tested at a fixed instant."""

from collections.abc import Callable
from datetime import UTC, datetime

type Clock = Callable[[], datetime]


def utc_now() -> datetime:
    return datetime.now(tz=UTC)

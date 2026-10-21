"""A per-minute evaluation series for one flag, synthesised deterministically.

The example tool has no real SDK telemetry behind it, so the chart is fed by a
generator: each minute's numbers are seeded from (env, key, minute), so the
same minute always reads the same, a page refresh does not reshuffle history,
and a new minute appears as time passes. ``enabled_share`` follows the flag's
current state: zero while disabled, close to the rollout percentage while
enabled, and null for the occasional minute with no evaluations.

Replace :func:`synthetic_series` with a query against your metrics store to
make the chart real; the route and the response shape stay as they are.
"""

import hashlib
import math
import random
from datetime import datetime, timedelta
from typing import Final

from platform_api.tools.flags.models import EvaluationPoint, Flag

QUIET_MINUTE_ODDS: Final = 0.04
SHARE_JITTER: Final = 0.03


def _seed(*parts: str) -> int:
    return int.from_bytes(hashlib.sha256(":".join(parts).encode()).digest()[:8], "big")


def _point(flag: Flag, minute: datetime, base_rate: float) -> EvaluationPoint:
    rng = random.Random(_seed(flag.env, flag.key, minute.isoformat()))
    if rng.random() < QUIET_MINUTE_ODDS:
        return EvaluationPoint(t=minute, evaluations=0, enabled_share=None)
    time_of_day = (minute.hour * 60 + minute.minute) / 1440
    diurnal = 0.65 + 0.35 * math.sin(2 * math.pi * (time_of_day - 0.25))
    evaluations = max(1, round(base_rate * diurnal * rng.uniform(0.8, 1.2)))
    if not flag.enabled:
        return EvaluationPoint(t=minute, evaluations=evaluations, enabled_share=0.0)
    target = flag.rollout_percent / 100
    share = min(1.0, max(0.0, target + rng.uniform(-SHARE_JITTER, SHARE_JITTER)))
    if target in (0.0, 1.0):
        share = target
    return EvaluationPoint(t=minute, evaluations=evaluations, enabled_share=round(share, 4))


def synthetic_series(flag: Flag, minutes: int, now: datetime) -> list[EvaluationPoint]:
    """*minutes* points ending at the current minute, oldest first."""
    end = now.replace(second=0, microsecond=0)
    base_rate = 40 + (_seed(flag.env, flag.key) % 360)
    return [
        _point(flag, end - timedelta(minutes=offset), base_rate)
        for offset in range(minutes - 1, -1, -1)
    ]

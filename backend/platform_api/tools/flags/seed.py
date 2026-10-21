"""Example data for a fresh in-memory run, so every screen has something on it."""

from datetime import datetime, timedelta
from typing import Final, NamedTuple

from platform_api.approvals.engine import ApprovalEngine
from platform_api.tools.flags.models import Flag
from platform_api.tools.flags.store import FlagStore

EDITORS: Final = ("ada@example.com", "grace@example.com", "alan@example.com")


class _Example(NamedTuple):
    key: str
    description: str
    owner: str
    # (enabled, rollout_percent) in the lowest, middle and highest environment.
    stages: tuple[tuple[bool, int], tuple[bool, int], tuple[bool, int]]


EXAMPLES: Final = (
    _Example(
        "checkout-v2",
        "Route checkout through the rewritten payment flow",
        "team-payments",
        ((True, 100), (True, 50), (True, 10)),
    ),
    _Example(
        "search-autocomplete",
        "Suggest queries while typing in global search",
        "team-search",
        ((True, 100), (True, 100), (True, 100)),
    ),
    _Example(
        "dark-mode",
        "Offer the dark theme in account settings",
        "team-web",
        ((True, 100), (True, 100), (False, 0)),
    ),
    _Example(
        "new-onboarding",
        "Show the three-step onboarding tour to new sign-ups",
        "team-growth",
        ((True, 100), (True, 25), (False, 0)),
    ),
    _Example(
        "strict-rate-limits",
        "Enforce per-token rate limits on the public API",
        "team-platform",
        ((True, 100), (True, 100), (True, 50)),
    ),
    _Example(
        "pdf-export",
        "Allow exporting reports as PDF",
        "team-reports",
        ((True, 100), (False, 0), (False, 0)),
    ),
    _Example(
        "audit-log-streaming",
        "Stream audit events to the external log sink",
        "team-security",
        ((True, 100), (True, 100), (True, 100)),
    ),
    _Example(
        "legacy-dashboard",
        "Keep the legacy dashboard reachable from the main navigation",
        "team-web",
        ((False, 0), (True, 100), (True, 100)),
    ),
)


def _stage(position: int, count: int) -> int:
    if position == 0:
        return 0
    return 2 if position == count - 1 else 1


def example_flags(environments: list[str], now: datetime) -> list[Flag]:
    flags: list[Flag] = []
    for position, env in enumerate(environments):
        stage = _stage(position, len(environments))
        for index, example in enumerate(EXAMPLES):
            enabled, rollout = example.stages[stage]
            flags.append(
                Flag(
                    key=example.key,
                    env=env,
                    description=example.description,
                    enabled=enabled,
                    rollout_percent=rollout,
                    owner=example.owner,
                    updated_at=now - timedelta(hours=index * 7 + position * 3 + 1),
                    updated_by=EDITORS[(index + position) % len(EDITORS)],
                )
            )
    return flags


def seed_examples(
    store: FlagStore,
    engine: ApprovalEngine,
    environments: list[str],
    direct_envs: list[str],
    now: datetime,
) -> None:
    """Example flags in every environment, and two requests waiting for review."""
    for flag in example_flags(environments, now):
        store.create(flag)
    reviewed = [env for env in environments if env not in direct_envs]
    if not reviewed:
        return
    first, last = reviewed[0], reviewed[-1]
    checkout = store.get(first, "checkout-v2")
    assert checkout is not None
    engine.file(
        env=first,
        tool="flags",
        action="update",
        target="checkout-v2",
        payload={"rollout_percent": 75},
        before=checkout.model_dump(mode="json"),
        requested_by="grace@example.com",
    )
    engine.file(
        env=last,
        tool="flags",
        action="create",
        target="holiday-banner",
        payload={
            "key": "holiday-banner",
            "description": "Show the seasonal banner on the home page",
            "enabled": False,
            "rollout_percent": 0,
            "owner": "team-web",
        },
        before=None,
        requested_by="alan@example.com",
    )

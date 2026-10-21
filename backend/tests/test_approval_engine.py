"""The engine on its own, with a stand-in tool registered."""

from datetime import timedelta

import pytest

from platform_api.approvals.engine import ApprovalEngine
from platform_api.approvals.models import Approval
from platform_api.approvals.registry import (
    ApprovalHandler,
    ApprovalRegistry,
    Replay,
    UnknownApprovalAction,
)
from platform_api.approvals.store import MemoryApprovalStore
from platform_api.errors import Conflict
from tests.conftest import START, FakeClock


def engine_with(
    replay: Replay, store: MemoryApprovalStore | None = None, clock: FakeClock | None = None
) -> ApprovalEngine:
    return ApprovalEngine(
        store or MemoryApprovalStore(),
        ApprovalRegistry([ApprovalHandler("widgets", frozenset({"paint"}), replay)]),
        ttl=timedelta(hours=1),
        clock=clock or FakeClock(START),
    )


def file(engine: ApprovalEngine, target: str = "t") -> Approval:
    return engine.file(
        env="prod",
        tool="widgets",
        action="paint",
        target=target,
        payload={"colour": "blue"},
        before=None,
        requested_by="a@example.com",
    )


def test_replay_receives_the_claimed_request() -> None:
    seen: list[Approval] = []

    def replay(approval: Approval) -> str:
        seen.append(approval)
        return "painted"

    engine = engine_with(replay)
    approved = engine.approve(file(engine).id, "b@example.com", None)
    assert approved.status == "approved"
    assert approved.result == "painted"
    assert seen[0].status == "approved"
    assert seen[0].reviewed_by == "b@example.com"


def test_unexpected_replay_errors_mark_the_request_failed() -> None:
    def replay(approval: Approval) -> str:
        raise RuntimeError("paint ran out")

    engine = engine_with(replay)
    failed = engine.approve(file(engine).id, "b@example.com", None)
    assert failed.status == "failed"
    assert failed.result == "The change could not be applied: paint ran out"
    assert engine.get(failed.id).status == "failed"


def test_filing_an_unregistered_action_fails() -> None:
    engine = engine_with(lambda approval: "")
    with pytest.raises(UnknownApprovalAction):
        engine.file(
            env="prod",
            tool="widgets",
            action="melt",
            target="t",
            payload={},
            before=None,
            requested_by="a@example.com",
        )


def test_registry_rules() -> None:
    registry = ApprovalRegistry()
    registry.register(ApprovalHandler("widgets", frozenset({"paint"}), lambda a: ""))
    with pytest.raises(ValueError, match="already registered"):
        registry.register(ApprovalHandler("widgets", frozenset({"paint"}), lambda a: ""))
    with pytest.raises(ValueError, match="at least one action"):
        registry.register(ApprovalHandler("gadgets", frozenset(), lambda a: ""))
    with pytest.raises(UnknownApprovalAction):
        registry.handler_for("gadgets", "paint")
    assert registry.tools == ["widgets"]


def test_store_transition_is_conditional() -> None:
    store = MemoryApprovalStore()
    engine = engine_with(lambda approval: "", store=store)
    approval = file(engine)
    store.transition(approval.model_copy(update={"status": "withdrawn"}), expected="pending")
    with pytest.raises(Conflict):
        store.transition(approval.model_copy(update={"status": "approved"}), expected="pending")


def test_ids_sort_by_filing_time() -> None:
    clock = FakeClock(START)
    engine = engine_with(lambda approval: "", clock=clock)
    first = file(engine, "a")
    clock.advance(seconds=1)
    second = file(engine, "b")
    assert first.id < second.id

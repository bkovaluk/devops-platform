"""Which tools file approvals, and how each one's change is replayed.

A tool registers one :class:`ApprovalHandler` naming the actions it files and
the function that applies a stored request once it is approved. The engine
knows nothing else about tools.
"""

from collections.abc import Callable, Iterable
from dataclasses import dataclass

from platform_api.approvals.models import Approval

#: Applies an approved request and says what it did. Raising marks it ``failed``.
type Replay = Callable[[Approval], str]


@dataclass(frozen=True, slots=True)
class ApprovalHandler:
    tool: str
    actions: frozenset[str]
    replay: Replay


class UnknownApprovalAction(LookupError):
    """No tool registered this tool/action pair."""


class ApprovalRegistry:
    def __init__(self, handlers: Iterable[ApprovalHandler] = ()) -> None:
        self._handlers: dict[str, ApprovalHandler] = {}
        for handler in handlers:
            self.register(handler)

    def register(self, handler: ApprovalHandler) -> None:
        if handler.tool in self._handlers:
            raise ValueError(f"tool '{handler.tool}' already registered approval actions")
        if not handler.actions:
            raise ValueError(f"tool '{handler.tool}' must register at least one action")
        self._handlers[handler.tool] = handler

    def handler_for(self, tool: str, action: str) -> ApprovalHandler:
        handler = self._handlers.get(tool)
        if handler is None or action not in handler.actions:
            raise UnknownApprovalAction(f"no approval action '{action}' registered for '{tool}'")
        return handler

    @property
    def tools(self) -> list[str]:
        return sorted(self._handlers)

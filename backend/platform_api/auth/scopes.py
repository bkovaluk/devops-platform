"""The permission grammar: what a scope is and when a grant covers one.

A scope is ``<tool>:<action>[:<qualifier>]``. Tools and their actions are the
closed vocabulary in :data:`TOOL_ACTIONS`; the qualifier is an environment name
and narrows a grant to that environment.

* A *requirement* (:class:`Scope`) names exactly what the caller is doing, so it
  never contains ``*``. Routes about one environment qualify it with that env.
* A *grant* (:class:`Grant`) is what a role carries. ``*`` alone grants
  everything; ``<tool>:*`` grants every action of one tool. An unqualified
  grant covers every environment; a qualified one covers only its own and never
  satisfies an unqualified requirement.

Nothing here knows about HTTP or identities, so the rule can be exported to the
UI (see :mod:`platform_api.auth.contract`) and tested on its own.
"""

from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from typing import Final

WILDCARD: Final = "*"
SEPARATOR: Final = ":"

#: Every tool and the actions it understands. Adding a tool starts here.
TOOL_ACTIONS: Final[Mapping[str, tuple[str, ...]]] = {
    "flags": ("read", "write"),
    "approvals": ("review",),
    "findings": ("read", "review"),
}


class InvalidScope(ValueError):
    """A scope or grant string outside the grammar."""


@dataclass(frozen=True, slots=True)
class Vocabulary:
    """The tools and actions this build knows, and the environments that qualify them."""

    tools: Mapping[str, tuple[str, ...]]
    qualifiers: tuple[str, ...]

    def check(self, tool: str, action: str, qualifier: str | None, source: str) -> None:
        if tool not in self.tools:
            raise InvalidScope(f"unknown tool '{tool}' in '{source}'")
        if action != WILDCARD and action not in self.tools[tool]:
            raise InvalidScope(f"unknown action '{action}' for tool '{tool}' in '{source}'")
        if qualifier is not None and qualifier not in self.qualifiers:
            raise InvalidScope(f"unknown environment '{qualifier}' in '{source}'")


def vocabulary_for(environments: Iterable[str]) -> Vocabulary:
    return Vocabulary(tools=TOOL_ACTIONS, qualifiers=tuple(environments))


def _segments(raw: str) -> list[str]:
    segments = raw.split(SEPARATOR)
    if not 2 <= len(segments) <= 3 or any(not segment for segment in segments):
        raise InvalidScope(f"malformed scope '{raw}'")
    return segments


@dataclass(frozen=True, slots=True)
class Scope:
    """A concrete requirement: what the caller is trying to do."""

    tool: str
    action: str
    qualifier: str | None = None

    def __str__(self) -> str:
        parts = [self.tool, self.action] + ([self.qualifier] if self.qualifier else [])
        return SEPARATOR.join(parts)

    @classmethod
    def parse(cls, raw: str, vocabulary: Vocabulary) -> Scope:
        segments = _segments(raw)
        tool, action = segments[0], segments[1]
        qualifier = segments[2] if len(segments) == 3 else None
        if WILDCARD in segments:
            raise InvalidScope(f"a requirement cannot contain '{WILDCARD}': '{raw}'")
        vocabulary.check(tool, action, qualifier, raw)
        return cls(tool, action, qualifier)


@dataclass(frozen=True, slots=True)
class Grant:
    """What a role confers. ``tool`` is ``*`` only for the bare ``*`` grant."""

    tool: str
    action: str
    qualifier: str | None = None

    @property
    def is_everything(self) -> bool:
        return self.tool == WILDCARD

    def __str__(self) -> str:
        if self.is_everything:
            return WILDCARD
        parts = [self.tool, self.action] + ([self.qualifier] if self.qualifier else [])
        return SEPARATOR.join(parts)

    @classmethod
    def parse(cls, raw: str, vocabulary: Vocabulary) -> Grant:
        if raw == WILDCARD:
            return EVERYTHING
        segments = _segments(raw)
        tool, action = segments[0], segments[1]
        qualifier = segments[2] if len(segments) == 3 else None
        if tool == WILDCARD or qualifier == WILDCARD:
            raise InvalidScope(f"only the action segment of a grant may be '{WILDCARD}': '{raw}'")
        vocabulary.check(tool, action, qualifier, raw)
        return cls(tool, action, qualifier)


EVERYTHING: Final = Grant(WILDCARD, WILDCARD)


def satisfies(grant: Grant, required: Scope) -> bool:
    """Whether *grant* covers *required*."""
    if grant.is_everything:
        return True
    if grant.tool != required.tool:
        return False
    if grant.action not in (WILDCARD, required.action):
        return False
    return grant.qualifier is None or grant.qualifier == required.qualifier

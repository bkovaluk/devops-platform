"""The scope vocabulary, exported for the frontend as ``scope-contract.json``.

The UI decides what to show before it calls anything, so it needs the grammar
and the matching rule. Rather than re-implement them from prose, it reads this
export: the tools and actions, the environments that qualify them, the seeded
roles, and ``cases``, a table of grant/requirement pairs with the answer this
implementation gives. The UI runs ``cases`` against its own matcher as a
conformance suite, so a disagreement is a failing test rather than a
permission bug.

``expected`` is ``true``, ``false``, or ``"invalid"`` when either side is
outside the grammar and must be rejected rather than read as a non-match.
"""

from collections.abc import Callable, Sequence
from typing import Final

from platform_api.auth.roles import SEEDED_ROLES
from platform_api.auth.scopes import (
    EVERYTHING,
    WILDCARD,
    Grant,
    InvalidScope,
    Scope,
    Vocabulary,
    satisfies,
)

CONTRACT_VERSION: Final = 1
INVALID: Final = "invalid"

type Case = dict[str, str | bool]


def _sample(vocabulary: Vocabulary) -> tuple[str, str]:
    tool = next(iter(vocabulary.tools))
    return tool, vocabulary.tools[tool][0]


def invalid_grants(vocabulary: Vocabulary) -> list[str]:
    tool, action = _sample(vocabulary)
    return [
        tool,
        f"{tool}:",
        f":{action}",
        f"{tool}::{action}",
        f"nope:{action}",
        f"{tool}:destroy",
        f"{tool}:{action}:nowhere",
        f"{tool}:{action}:{vocabulary.qualifiers[0]}:extra",
        f"{WILDCARD}:{action}",
        f"{WILDCARD}:{WILDCARD}",
        f"{tool}:{action}:{WILDCARD}",
    ]


def invalid_requirements(vocabulary: Vocabulary) -> list[str]:
    tool, action = _sample(vocabulary)
    return [
        WILDCARD,
        f"{tool}:{WILDCARD}",
        f"{WILDCARD}:{action}",
        tool,
        f"nope:{action}",
        f"{tool}:{action}:nowhere",
    ]


def _case(grant: Grant, required: Scope) -> Case:
    return {"grant": str(grant), "required": str(required), "expected": satisfies(grant, required)}


def _valid_cases(vocabulary: Vocabulary) -> list[Case]:
    """The whole grid: every action of every tool, unqualified and in every env."""
    tools = list(vocabulary.tools)
    envs = list(vocabulary.qualifiers)
    cases: list[Case] = []
    for index, tool in enumerate(tools):
        neighbour = tools[(index + 1) % len(tools)]
        actions = vocabulary.tools[tool]
        for position, action in enumerate(actions):
            other = actions[(position + 1) % len(actions)]
            for qualifier in [None, *envs]:
                required = Scope(tool, action, qualifier)
                grants = [
                    Grant(tool, action),
                    Grant(tool, WILDCARD),
                    EVERYTHING,
                    Grant(neighbour, vocabulary.tools[neighbour][0]),
                    Grant(tool, other),
                ]
                for env in envs:
                    grants += [Grant(tool, action, env), Grant(tool, WILDCARD, env)]
                cases.extend(_case(grant, required) for grant in grants)
    return cases


def _rejects(parse: Callable[[str], object], raw: str) -> str:
    try:
        parse(raw)
    except InvalidScope:
        return raw
    raise AssertionError(f"'{raw}' is listed as invalid but parses")


def _malformed_cases(vocabulary: Vocabulary) -> list[Case]:
    readable = ":".join(_sample(vocabulary))
    cases: list[Case] = []
    for raw in invalid_grants(vocabulary):
        _rejects(lambda r: Grant.parse(r, vocabulary), raw)
        cases.append({"grant": raw, "required": readable, "expected": INVALID})
    for raw in invalid_requirements(vocabulary):
        _rejects(lambda r: Scope.parse(r, vocabulary), raw)
        cases.append({"grant": readable, "required": raw, "expected": INVALID})
    return cases


def _dedup(cases: Sequence[Case]) -> list[Case]:
    seen: dict[tuple[str, str], Case] = {}
    for case in cases:
        seen.setdefault((str(case["grant"]), str(case["required"])), case)
    return [seen[key] for key in sorted(seen)]


def build_scope_contract(vocabulary: Vocabulary) -> dict[str, object]:
    """The exported vocabulary. Deterministic, because it is a committed artifact."""
    return {
        "version": CONTRACT_VERSION,
        "grammar": "<tool>:<action>[:<env>]",
        "wildcard": WILDCARD,
        "tools": {tool: list(actions) for tool, actions in vocabulary.tools.items()},
        "qualifiers": list(vocabulary.qualifiers),
        "roles": {name: list(scopes) for name, scopes in SEEDED_ROLES.items()},
        "invalid_grants": invalid_grants(vocabulary),
        "invalid_requirements": invalid_requirements(vocabulary),
        "cases": _dedup(_valid_cases(vocabulary) + _malformed_cases(vocabulary)),
    }

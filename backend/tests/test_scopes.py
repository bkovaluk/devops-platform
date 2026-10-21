import pytest

from platform_api.auth.contract import INVALID, build_scope_contract
from platform_api.auth.principal import Principal
from platform_api.auth.roles import SEEDED_ROLES, RoleBook
from platform_api.auth.scopes import (
    EVERYTHING,
    Grant,
    InvalidScope,
    Scope,
    satisfies,
    vocabulary_for,
)

VOCAB = vocabulary_for(["dev", "staging", "prod"])


def grant(raw: str) -> Grant:
    return Grant.parse(raw, VOCAB)


def scope(raw: str) -> Scope:
    return Scope.parse(raw, VOCAB)


@pytest.mark.parametrize(
    ("held", "required", "expected"),
    [
        ("flags:read", "flags:read", True),
        ("flags:read", "flags:read:prod", True),
        ("flags:read:dev", "flags:read:dev", True),
        ("flags:read:dev", "flags:read:prod", False),
        ("flags:read:dev", "flags:read", False),
        ("flags:*", "flags:write:prod", True),
        ("flags:*:dev", "flags:write:prod", False),
        ("*", "approvals:review:prod", True),
        ("flags:read", "flags:write", False),
        ("approvals:review", "flags:read", False),
    ],
)
def test_satisfies(held: str, required: str, expected: bool) -> None:
    assert satisfies(grant(held), scope(required)) is expected


@pytest.mark.parametrize(
    "raw",
    ["flags", "flags:", ":read", "nope:read", "flags:destroy", "flags:read:moon", "*:read", "*:*"],
)
def test_invalid_grants(raw: str) -> None:
    with pytest.raises(InvalidScope):
        grant(raw)


@pytest.mark.parametrize("raw", ["*", "flags:*", "*:read", "flags", "flags:read:moon"])
def test_invalid_requirements(raw: str) -> None:
    with pytest.raises(InvalidScope):
        scope(raw)


def test_str_round_trips() -> None:
    for raw in ["*", "flags:read", "flags:*", "flags:write:prod"]:
        assert str(grant(raw)) == raw
    assert str(scope("approvals:review:dev")) == "approvals:review:dev"
    assert grant("*") is EVERYTHING


def test_contract_cases_agree_with_the_matcher() -> None:
    contract = build_scope_contract(VOCAB)
    cases = contract["cases"]
    assert isinstance(cases, list) and len(cases) > 100
    for case in cases:
        if case["expected"] == INVALID:
            with pytest.raises(InvalidScope):
                grant(case["grant"])
                scope(case["required"])
            continue
        assert satisfies(grant(case["grant"]), scope(case["required"])) is case["expected"]
    assert contract["roles"] == {name: list(s) for name, s in SEEDED_ROLES.items()}
    assert contract["qualifiers"] == ["dev", "staging", "prod"]


def test_role_book_rejects_unknown_roles_and_bad_scopes() -> None:
    with pytest.raises(ValueError, match="unknown role"):
        RoleBook(SEEDED_ROLES, {"a@example.com": ["ghost"]}, ["viewer"], VOCAB)
    with pytest.raises(ValueError, match="role 'broken'"):
        RoleBook({"broken": ["flags:fly"]}, {}, [], VOCAB)


def test_role_book_merges_grants_and_defaults() -> None:
    book = RoleBook(SEEDED_ROLES, {"Lead@Example.com": ["editor", "reviewer"]}, ["viewer"], VOCAB)
    assert [str(g) for g in book.grants_for("lead@example.com")] == [
        "flags:read",
        "flags:write",
        "approvals:review",
    ]
    assert book.roles_for("anyone@example.com") == ("viewer",)


def test_principal_admin_and_holds() -> None:
    admin = Principal("a@example.com", "a", (EVERYTHING,))
    viewer = Principal("v@example.com", "v", (grant("flags:read"),))
    assert admin.is_admin and not viewer.is_admin
    assert viewer.holds(scope("flags:read:prod"))
    assert not viewer.holds(scope("flags:write:prod"))
    assert viewer.scopes == ["flags:read"]

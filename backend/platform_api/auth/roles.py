"""Roles: named sets of grants, and who holds which.

The seeded roles cover the example tool; ``CUSTOM_ROLES`` adds more and
``ROLE_BINDINGS`` assigns them by email. Everyone else holds ``DEFAULT_ROLES``.
"""

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Final

from platform_api.auth.scopes import Grant, InvalidScope, Vocabulary
from platform_api.config import Settings

#: The roles every deployment starts with.
SEEDED_ROLES: Final[Mapping[str, tuple[str, ...]]] = {
    "viewer": ("flags:read",),
    "editor": ("flags:read", "flags:write"),
    "reviewer": ("flags:read", "approvals:review"),
    "admin": ("*",),
}


@dataclass(frozen=True, slots=True)
class Role:
    name: str
    grants: tuple[Grant, ...]


def _role(name: str, scopes: Sequence[str], vocabulary: Vocabulary) -> Role:
    try:
        return Role(name, tuple(Grant.parse(scope, vocabulary) for scope in scopes))
    except InvalidScope as exc:
        raise ValueError(f"role '{name}': {exc}") from exc


class RoleBook:
    """Every role this deployment defines, and the roles each identity holds."""

    def __init__(
        self,
        roles: Mapping[str, Sequence[str]],
        bindings: Mapping[str, Sequence[str]],
        default_roles: Sequence[str],
        vocabulary: Vocabulary,
    ) -> None:
        self.roles = {name: _role(name, scopes, vocabulary) for name, scopes in roles.items()}
        self._bindings = {email.lower(): tuple(names) for email, names in bindings.items()}
        self._default = tuple(default_roles)
        for names in [*self._bindings.values(), self._default]:
            self._check_names(names)

    @classmethod
    def from_settings(cls, settings: Settings, vocabulary: Vocabulary) -> RoleBook:
        roles = {**SEEDED_ROLES, **settings.custom_role_map}
        bindings = dict(settings.role_binding_map)
        if settings.auth_mode == "dev":
            bindings.setdefault(settings.dev_user_email.lower(), settings.dev_user_role_list)
        return cls(roles, bindings, settings.default_role_list, vocabulary)

    def _check_names(self, names: Sequence[str]) -> None:
        unknown = sorted(set(names) - set(self.roles))
        if unknown:
            raise ValueError(f"unknown role(s) {unknown}; defined: {sorted(self.roles)}")

    def roles_for(self, email: str) -> tuple[str, ...]:
        return self._bindings.get(email.lower(), self._default)

    def grants_for(self, email: str) -> tuple[Grant, ...]:
        grants: dict[str, Grant] = {}
        for name in self.roles_for(email):
            for grant in self.roles[name].grants:
                grants.setdefault(str(grant), grant)
        return tuple(grants.values())

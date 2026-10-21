"""The caller as authorization sees them: an identity and the grants it holds."""

from dataclasses import dataclass

from platform_api.auth.scopes import Grant, Scope, satisfies
from platform_api.errors import Forbidden


@dataclass(frozen=True, slots=True)
class Principal:
    email: str
    name: str
    grants: tuple[Grant, ...]
    #: Set when an admin is answering as this principal through ``X-View-As``.
    view_as: str | None = None

    @property
    def is_admin(self) -> bool:
        return any(grant.is_everything for grant in self.grants)

    @property
    def scopes(self) -> list[str]:
        return [str(grant) for grant in self.grants]

    def holds(self, required: Scope) -> bool:
        return any(satisfies(grant, required) for grant in self.grants)


def authorize(principal: Principal, required: Scope) -> None:
    """Raise :class:`Forbidden` unless *principal* holds a grant covering *required*."""
    if not principal.holds(required):
        raise Forbidden(f"You need the {required} scope to do this; ask an admin for access.")

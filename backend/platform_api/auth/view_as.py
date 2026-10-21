"""Answering as somebody else, for admins checking what another person sees.

``X-View-As: <email>`` replaces the caller's identity and grants with the
target's for one request. Two rules keep it from being an escalation: only a
principal holding ``*`` may ask, checked against the real caller before
anything is substituted; and a request answered this way may only read, so a
change can never be filed under somebody else's name. API routes enforce the
second rule by method; the AI surfaces, which carry reads and writes over the
same method, by offering and running read actions only.
"""

from typing import Final

from platform_api.auth.principal import Principal
from platform_api.auth.roles import RoleBook
from platform_api.errors import BadRequest, Forbidden

HEADER: Final = "X-View-As"

READ_ONLY_METHODS: Final = frozenset({"GET", "HEAD", "OPTIONS"})


def view_as(actor: Principal, target: str, roles: RoleBook) -> Principal:
    if not actor.is_admin:
        raise Forbidden(f"Only admins may send {HEADER}; remove the header and try again.")
    email = target.strip().lower()
    if "@" not in email:
        raise BadRequest(f"{HEADER} must be an email address, not '{target}'.")
    return Principal(
        email=email,
        name=email.split("@")[0],
        grants=roles.grants_for(email),
        view_as=email,
    )


def read_only(principal: Principal) -> Forbidden:
    """The refusal for a change attempted while viewing as *principal*."""
    return Forbidden(
        f"Viewing as {principal.view_as} is read-only; remove {HEADER} to make changes."
    )

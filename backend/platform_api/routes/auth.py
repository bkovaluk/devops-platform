from fastapi import APIRouter
from pydantic import BaseModel, Field

from platform_api.auth.dependencies import CurrentPrincipal
from platform_api.errors import AUTHENTICATED

router = APIRouter(prefix="/auth", tags=["auth"], responses=AUTHENTICATED)


class Me(BaseModel):
    email: str
    name: str
    scopes: list[str] = Field(description="Grants held, '<tool>:<action>[:<env>]' or '*'")
    is_admin: bool
    view_as: str | None = Field(description="Whose view this is, when X-View-As was honoured")


@router.get("/me")
def me(principal: CurrentPrincipal) -> Me:
    return Me(
        email=principal.email,
        name=principal.name,
        scopes=principal.scopes,
        is_admin=principal.is_admin,
        view_as=principal.view_as,
    )

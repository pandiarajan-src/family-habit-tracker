"""Dependencies and OpenAPI response docs shared by the resource routers."""

from datetime import date
from typing import Annotated, Any

from fastapi import Depends, Query

from app.security.sessions import (
    PASSCODE_CHALLENGE,
    Auth,
    ClockDep,
    Db,
    FamilyAuth,
    MemberAuth,
    unauthorized_doc,
)
from app.services.context import Ctx


def _ctx(auth: Auth, db: Db, clock: ClockDep) -> Ctx:
    return Ctx(
        db=db,
        family_id=auth.family.id,
        timezone=auth.family.timezone,
        now=clock.now(),
        actor=auth.acting_member,
    )


def family_ctx(auth: FamilyAuth, db: Db, clock: ClockDep) -> Ctx:
    """Family session required (reads) [child-data-privacy #3]."""
    return _ctx(auth, db, clock)


def member_ctx(auth: MemberAuth, db: Db, clock: ClockDep) -> Ctx:
    """Family session plus an acting member (writes, and self/parent reads)."""
    return _ctx(auth, db, clock)


FamilyCtx = Annotated[Ctx, Depends(family_ctx)]
MemberCtx = Annotated[Ctx, Depends(member_ctx)]

# `from` is a Python keyword, so the parameter is `from_` with the alias `from`.
FromDate = Annotated[date, Query(alias="from")]
ToDate = Annotated[date, Query()]

R401: dict[str, Any] = unauthorized_doc(
    "No family session, or it ended after 5 idle minutes", PASSCODE_CHALLENGE
)
R403: dict[str, Any] = {
    "description": "Missing CSRF token, no acting member, or not allowed (REQ-028)"
}
R404: dict[str, Any] = {"description": "Not found in this family"}
R422: dict[str, Any] = {"description": "Invalid request"}


def r409(description: str) -> dict[str, Any]:
    return {"description": description}

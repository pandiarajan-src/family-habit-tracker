"""The signed-in family and its timezone (REQ-027)."""

import logging

from fastapi import APIRouter

from app.schemas.family import FamilyRead, FamilyUpdate
from app.security.sessions import Db, FamilyAuth, ParentAuth

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/families", tags=["families"])


@router.get(
    "/current",
    response_model=FamilyRead,
    summary="Get the signed-in family",
    responses={401: {"description": "No family session"}},
)
def read_family(auth: FamilyAuth) -> FamilyRead:
    return FamilyRead(id=auth.family.id, timezone=auth.family.timezone)


@router.patch(
    "/current",
    response_model=FamilyRead,
    summary="Change the family timezone (parents only)",
    responses={
        401: {"description": "No family session"},
        403: {"description": "Missing CSRF token, no acting member, or not a parent"},
    },
)
def update_family(body: FamilyUpdate, auth: ParentAuth, db: Db) -> FamilyRead:
    family = auth.family
    family.timezone = body.timezone
    db.add(family)
    db.commit()
    logger.info("family timezone changed family_id=%s", family.id)
    return FamilyRead(id=family.id, timezone=family.timezone)

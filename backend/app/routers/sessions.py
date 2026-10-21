"""Passcode entry, who's checking in (PIN), switch person and sign out (REQ-001 to REQ-004)."""

import logging
from datetime import datetime
from zoneinfo import ZoneInfo

from fastapi import APIRouter, HTTPException, Request, Response, status
from sqlmodel import Session, select

from app.models import DeviceSession, Family, Member, MemberCredential
from app.schemas.member import MemberRead
from app.schemas.session import SessionCreate, SessionRead, SessionUpdate
from app.security.hashing import verify_secret
from app.security.pin_lockout import is_locked, record_failure, record_success
from app.security.sessions import (
    PASSCODE_CHALLENGE,
    PIN_CHALLENGE,
    ClockDep,
    Db,
    FamilyAuth,
    ParentAuth,
    end_session,
    get_owned_or_404,
    start_session,
    unauthorized_doc,
    wrong_passcode,
    wrong_pin,
)
from app.services.balance import balance_of
from app.services.context import Ctx

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/sessions", tags=["sessions"])

_401 = unauthorized_doc("No family session, or it ended after 5 idle minutes", PASSCODE_CHALLENGE)
_403 = {"description": "Missing CSRF token, or the acting member isn't allowed"}


def _session_read(
    db: Session, now: datetime, row: DeviceSession, family: Family, acting: Member | None
) -> SessionRead:
    member = None
    if acting is not None:
        ctx = Ctx(db=db, family_id=family.id, timezone=family.timezone, now=now)
        member = MemberRead.from_member(acting, balance_of(ctx, acting.id))
    return SessionRead(
        family_id=family.id,
        acting_member=member,
        expires_at=row.expires_at.astimezone(ZoneInfo(family.timezone)),
    )


@router.post(
    "",
    response_model=SessionRead,
    status_code=status.HTTP_201_CREATED,
    summary="Sign this device in with the family passcode",
    responses={
        401: unauthorized_doc("Wrong passcode", PASSCODE_CHALLENGE),
        429: {"description": "Too many wrong passcodes from this client; wait 15 minutes"},
    },
)
def create_session(
    body: SessionCreate, request: Request, response: Response, db: Db, clock: ClockDep
) -> SessionRead:
    limiter = request.app.state.passcode_limiter
    client = request.client.host if request.client else "unknown"
    now = clock.now()
    if limiter.is_blocked(client, now):
        logger.warning("passcode attempt refused: rate limited")
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many tries. Wait 15 minutes, then try again.",
            headers={"Retry-After": str(int(limiter.window.total_seconds()))},
        )
    # One family in v1; checking each hash keeps passcodes unique to their family.
    family = next(
        (f for f in db.exec(select(Family)).all() if verify_secret(f.passcode_hash, body.passcode)),
        None,
    )
    if family is None:
        limiter.record_failure(client, now)
        logger.info("passcode attempt rejected")
        raise wrong_passcode()

    row = start_session(db, response, request, family)
    logger.info("session started family_id=%s", family.id)
    return _session_read(db, now, row, family, None)


@router.get(
    "/current",
    response_model=SessionRead,
    summary="Get this device's session and acting member",
    responses={401: _401},
)
def read_session(auth: FamilyAuth, db: Db, clock: ClockDep) -> SessionRead:
    return _session_read(db, clock.now(), auth.session, auth.family, auth.acting_member)


@router.patch(
    "/current",
    response_model=SessionRead,
    summary="Choose who's checking in (with their PIN), or switch person",
    responses={
        401: unauthorized_doc(
            "Session missing or ended (`FamilyPasscode`), or wrong PIN (`MemberPIN`)",
            PASSCODE_CHALLENGE,
            PIN_CHALLENGE,
        ),
        403: _403,
        404: {"description": "Member not found in this family"},
        429: {"description": "Too many wrong PINs for this member; ask a parent or wait 5 min"},
    },
)
def update_session(body: SessionUpdate, auth: FamilyAuth, db: Db, clock: ClockDep) -> SessionRead:
    row = auth.session
    if body.acting_member_id is None:
        row.acting_member_id = None
        row.acting_member_last_activity_at = None
        db.add(row)
        db.commit()
        return _session_read(db, clock.now(), row, auth.family, None)

    member = get_owned_or_404(db, Member, body.acting_member_id, auth.family.id)
    credential = db.get(MemberCredential, member.id)
    now = clock.now()
    if credential is not None and credential.locked_until and is_locked(credential, now):
        logger.warning("pin attempt refused: locked member_id=%s", member.id)
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many tries. Ask a parent, or wait 5 minutes.",
            headers={"Retry-After": str(int((credential.locked_until - now).total_seconds()))},
        )
    # SessionUpdate already requires a PIN when choosing a member.
    if credential is None or body.pin is None or not verify_secret(credential.pin_hash, body.pin):
        if credential is not None:
            record_failure(credential, now)
            db.add(credential)
            db.commit()
        logger.info("pin attempt rejected member_id=%s", member.id)
        raise wrong_pin()

    record_success(credential)
    row.acting_member_id = member.id
    row.acting_member_last_activity_at = now
    db.add_all([credential, row])
    db.commit()
    logger.info("acting member set member_id=%s session_family_id=%s", member.id, auth.family.id)
    return _session_read(db, now, row, auth.family, member)


@router.delete(
    "/current",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    summary="Sign this device out of the family (parents only)",
    responses={401: _401, 403: _403},
)
def delete_session(auth: ParentAuth, db: Db) -> Response:
    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    end_session(db, response, auth.session)
    logger.info("session ended family_id=%s", auth.family.id)
    return response

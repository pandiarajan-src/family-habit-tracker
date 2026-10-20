"""Family sessions and the `require_*` dependencies every data route uses.

Order of checks: no/ended session → 401, bad CSRF → 403, missing acting member or role → 403.
A missing session is always 401, even on writes (REQ-028).
"""

import hashlib
import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Annotated
from uuid import UUID

from fastapi import Depends, HTTPException, Request, Response, status
from sqlmodel import Session, SQLModel

from app.clock import Clock
from app.db import get_db
from app.models import DeviceSession, Family, Member, Role
from app.security.csrf import CSRF_COOKIE, check_csrf, new_csrf_token

SESSION_COOKIE = "fht_session"
IDLE_TIMEOUT = timedelta(minutes=5)
BACKGROUND_HEADER = "X-Background-Refresh"


def get_clock(request: Request) -> Clock:
    return request.app.state.clock


Db = Annotated[Session, Depends(get_db)]
ClockDep = Annotated[Clock, Depends(get_clock)]


@dataclass(slots=True)
class Auth:
    session: DeviceSession
    family: Family
    acting_member: Member | None


def _token_id(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def start_session(
    db: Session, response: Response, request: Request, family: Family
) -> DeviceSession:
    """Create a session row and set the session and CSRF cookies."""
    token = secrets.token_urlsafe(32)
    now = get_clock(request).now()
    row = DeviceSession(
        id=_token_id(token),
        family_id=family.id,
        last_activity_at=now,
        expires_at=now + IDLE_TIMEOUT,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    secure = request.app.state.settings.cookie_secure
    response.set_cookie(
        SESSION_COOKIE, token, httponly=True, samesite="lax", secure=secure, path="/"
    )
    # Readable by the app so it can echo it in X-CSRF-Token.
    response.set_cookie(
        CSRF_COOKIE, new_csrf_token(), httponly=False, samesite="lax", secure=secure, path="/"
    )
    return row


def end_session(db: Session, response: Response, row: DeviceSession) -> None:
    db.delete(row)
    db.commit()
    response.delete_cookie(SESSION_COOKIE, path="/")
    response.delete_cookie(CSRF_COOKIE, path="/")


# Every 401 names what the client must ask for in `WWW-Authenticate` (spec §4): the family
# passcode (no session, or it ended) or the member's PIN (wrong PIN). The status alone can't
# tell them apart: PATCH /sessions/current returns both.
PASSCODE_CHALLENGE = "FamilyPasscode"
PIN_CHALLENGE = "MemberPIN"


def _unauthorized(detail: str = "Unlock with the family passcode") -> HTTPException:
    return HTTPException(
        status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": PASSCODE_CHALLENGE},
    )


def wrong_passcode() -> HTTPException:
    return _unauthorized("Wrong passcode")


def wrong_pin() -> HTTPException:
    return HTTPException(
        status.HTTP_401_UNAUTHORIZED,
        detail="Wrong PIN",
        headers={"WWW-Authenticate": PIN_CHALLENGE},
    )


def unauthorized_doc(description: str, *challenges: str) -> dict:
    """OpenAPI entry for a 401, documenting which challenges it can carry."""
    return {
        "description": description,
        "headers": {
            "WWW-Authenticate": {
                "description": (
                    f"`{PASSCODE_CHALLENGE}`: unlock again; `{PIN_CHALLENGE}`: wrong PIN"
                ),
                "schema": {"type": "string", "enum": list(challenges)},
            }
        },
    }


def _is_person_initiated(request: Request) -> bool:
    return request.headers.get(BACKGROUND_HEADER) != "1"


def require_family(request: Request, db: Db, clock: ClockDep) -> Auth:
    token = request.cookies.get(SESSION_COOKIE)
    if not token:
        raise _unauthorized()
    row = db.get(DeviceSession, _token_id(token))
    if row is None:
        raise _unauthorized()
    now = clock.now()
    if is_expired(row, now):
        db.delete(row)
        db.commit()
        raise _unauthorized("Signed out after 5 quiet minutes")
    check_csrf(request)

    apply_activity(row, now, person_initiated=_is_person_initiated(request))
    db.add(row)
    db.commit()
    db.refresh(row)

    family = db.get(Family, row.family_id)
    if family is None:  # cascades remove sessions with their family; defensive only
        raise _unauthorized()
    acting = db.get(Member, row.acting_member_id) if row.acting_member_id else None
    return Auth(session=row, family=family, acting_member=acting)


def is_expired(row: DeviceSession, now: datetime) -> bool:
    """The family session ends 5 minutes after the last person-initiated request (REQ-004)."""
    return now >= row.expires_at


def apply_activity(row: DeviceSession, now: datetime, *, person_initiated: bool) -> None:
    """Clear an idle acting member, then record activity unless it's a background refresh."""
    if row.acting_member_id is not None and _idle(row.acting_member_last_activity_at, now):
        row.acting_member_id = None
        row.acting_member_last_activity_at = None
    # Background refreshes (REQ-012) don't count as activity (REQ-004).
    if person_initiated:
        row.last_activity_at = now
        row.expires_at = now + IDLE_TIMEOUT
        if row.acting_member_id is not None:
            row.acting_member_last_activity_at = now


def _idle(last_activity_at: datetime | None, now: datetime) -> bool:
    return last_activity_at is None or now >= last_activity_at + IDLE_TIMEOUT


FamilyAuth = Annotated[Auth, Depends(require_family)]


def require_member(auth: FamilyAuth) -> Auth:
    if auth.acting_member is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Choose who's checking in first")
    return auth


MemberAuth = Annotated[Auth, Depends(require_member)]


def require_parent(auth: MemberAuth) -> Auth:
    if auth.acting_member is None or auth.acting_member.role != Role.parent:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Only a parent can do this")
    return auth


ParentAuth = Annotated[Auth, Depends(require_parent)]


def get_owned_or_404[T: SQLModel](db: Session, model: type[T], id_: UUID, family_id: UUID) -> T:
    """Fetch a family-owned row; another family's ID is a 404, never a 403 (REQ-028)."""
    row = db.get(model, id_)
    if row is None or getattr(row, "family_id", None) != family_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=f"{model.__name__} not found")
    return row

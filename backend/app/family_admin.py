"""Server-side family administration for `scripts/family-setup.sh` (via `app.cli`).

Creating, deleting and editing the family happens at the server, not over HTTP, so passcode
entry stays the only unauthenticated route [child-data-privacy #3]. The rules match the API:
nicknames 1-20 characters and unique ignoring case, one emoji avatar, 4-digit PINs, and a
family always keeps at least one parent. Secrets are hashed here and never printed or logged.
"""

import re
import unicodedata
from dataclasses import dataclass
from uuid import UUID
from zoneinfo import available_timezones

from sqlalchemy import func
from sqlmodel import Session, delete, select

from app.clock import SystemClock
from app.models import DeviceSession, Family, Member, MemberCredential, Role
from app.schemas.fields import is_single_emoji
from app.security.hashing import hash_secret

PIN_PATTERN = re.compile(r"^[0-9]{4}$")
MIN_PASSCODE_LENGTH = 6
MAX_PASSCODE_LENGTH = 128  # SessionCreate.passcode's limit: a longer one could never be typed in
MAX_NICKNAME_LENGTH = 20


class AdminError(Exception):
    """A rule the family's details break; the message is safe to show (no secrets)."""


@dataclass(frozen=True, slots=True)
class MemberDetails:
    nickname: str
    avatar_emoji: str
    role: Role
    pin: str


def check_nickname(nickname: str) -> str:
    nickname = nickname.strip()
    if not 1 <= len(nickname) <= MAX_NICKNAME_LENGTH:
        raise AdminError(f"A nickname is 1-{MAX_NICKNAME_LENGTH} characters.")
    if any(unicodedata.category(c) == "Cc" for c in nickname):
        raise AdminError("A nickname can't contain tabs or other control characters.")
    return nickname


def check_emoji(avatar_emoji: str) -> str:
    avatar_emoji = avatar_emoji.strip()
    if not is_single_emoji(avatar_emoji):
        raise AdminError("The avatar is exactly one emoji, such as 🦉 or 🌻.")
    return avatar_emoji


def check_role(role: str) -> Role:
    try:
        return Role(role.strip().lower())
    except ValueError:
        raise AdminError("A role is parent or child.") from None


def check_pin(pin: str) -> str:
    if not PIN_PATTERN.match(pin):
        raise AdminError("A PIN is exactly 4 numbers.")
    return pin


def check_passcode(passcode: str) -> str:
    if not MIN_PASSCODE_LENGTH <= len(passcode) <= MAX_PASSCODE_LENGTH:
        raise AdminError(
            f"A family passcode is {MIN_PASSCODE_LENGTH}-{MAX_PASSCODE_LENGTH} characters."
        )
    return passcode


def check_timezone(timezone: str) -> str:
    timezone = timezone.strip()
    if timezone not in available_timezones():
        raise AdminError("Unknown timezone; use an IANA name such as Europe/London.")
    return timezone


def get_family(db: Session) -> Family | None:
    """The family (v1 has one per database), or None."""
    return db.exec(select(Family).order_by(Family.created_at)).first()


def list_members(db: Session, family: Family) -> list[Member]:
    query = select(Member).where(Member.family_id == family.id).order_by(Member.created_at)
    return list(db.exec(query).all())


def check_nickname_free(
    db: Session, family: Family, nickname: str, member_id: UUID | None = None
) -> None:
    """Nicknames are unique within the family, ignoring case ("Mia" and "mia" clash)."""
    query = select(Member).where(
        Member.family_id == family.id, func.lower(Member.nickname) == nickname.lower()
    )
    clash = db.exec(query).first()
    if clash is not None and clash.id != member_id:
        raise AdminError("Someone in the family already has that nickname.")


def _add_member(db: Session, family: Family, details: MemberDetails) -> Member:
    member = Member(
        family_id=family.id,
        nickname=details.nickname,
        avatar_emoji=details.avatar_emoji,
        role=details.role,
        created_at=SystemClock().now(),
    )
    db.add(member)
    db.flush()
    db.add(MemberCredential(member_id=member.id, pin_hash=hash_secret(details.pin)))
    return member


def create_family(db: Session, timezone: str, passcode: str, first_parent: MemberDetails) -> Family:
    if get_family(db) is not None:
        raise AdminError("A family already exists; update it or delete it first.")
    if first_parent.role is not Role.parent:
        raise AdminError("The first member must be a parent.")
    family = Family(
        timezone=check_timezone(timezone),
        passcode_hash=hash_secret(check_passcode(passcode)),
        created_at=SystemClock().now(),
    )
    db.add(family)
    db.flush()
    _add_member(db, family, first_parent)
    db.commit()
    return family


def delete_family(db: Session) -> int:
    """Delete every family; the database cascades to members, PINs, habits, check-ins,
    savers, gems, prizes, claims, adjustments and device sessions (spec §3)."""
    count = len(db.exec(select(Family)).all())
    db.exec(delete(Family))
    db.commit()
    return count


def change_passcode(db: Session, family: Family, passcode: str) -> None:
    """New family passcode; every device is signed out, so the old one stops working at once."""
    family.passcode_hash = hash_secret(check_passcode(passcode))
    db.add(family)
    db.exec(delete(DeviceSession).where(DeviceSession.family_id == family.id))
    db.commit()


def add_member(db: Session, family: Family, details: MemberDetails) -> Member:
    check_nickname_free(db, family, details.nickname)
    member = _add_member(db, family, details)
    db.commit()
    return member


def update_member(
    db: Session,
    family: Family,
    member_id: UUID,
    *,
    nickname: str | None = None,
    avatar_emoji: str | None = None,
    role: Role | None = None,
    pin: str | None = None,
) -> Member:
    """Change only the details given. A new PIN also clears any PIN lockout."""
    member = db.get(Member, member_id)
    if member is None or member.family_id != family.id:
        raise AdminError("No member with that id in this family.")
    if nickname is not None:
        check_nickname_free(db, family, nickname, member.id)
        member.nickname = nickname
    if avatar_emoji is not None:
        member.avatar_emoji = avatar_emoji
    if role is not None and role is not member.role:
        if member.role is Role.parent and _parent_count(db, family) == 1:
            raise AdminError("A family always needs at least one parent.")
        member.role = role
    db.add(member)
    if pin is not None:
        credential = db.get(MemberCredential, member.id) or MemberCredential(
            member_id=member.id, pin_hash=""
        )
        credential.pin_hash = hash_secret(pin)
        credential.failed_attempts = 0
        credential.locked_until = None
        db.add(credential)
    db.commit()
    db.refresh(member)
    return member


def _parent_count(db: Session, family: Family) -> int:
    query = select(func.count()).where(Member.family_id == family.id, Member.role == Role.parent)
    return db.exec(query).one()

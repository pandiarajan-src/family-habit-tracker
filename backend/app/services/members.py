"""Family members (REQ-005, REQ-006, REQ-007): profiles, roles, PINs and removal."""

from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import func as sa_func
from sqlmodel import col, func, select

from app.db import transaction
from app.domain.permissions import Action
from app.models import AdjustmentKind, Member, MemberCredential, Role
from app.security.hashing import hash_secret, verify_secret
from app.security.pin_lockout import is_locked, record_failure, record_success
from app.security.sessions import ensure_allowed, get_owned_or_404, wrong_pin
from app.services import adjustments
from app.services.context import Ctx

NEEDS_A_PARENT = "A family always needs at least one parent"


def _unprocessable(detail: str) -> HTTPException:
    return HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, detail=detail)


def list_members(ctx: Ctx) -> list[Member]:
    return list(
        ctx.db.exec(
            select(Member)
            .where(Member.family_id == ctx.family_id)
            .order_by(col(Member.created_at), col(Member.id))
        )
    )


def parent_count(ctx: Ctx) -> int:
    return ctx.db.exec(
        select(func.count())
        .select_from(Member)
        .where(Member.family_id == ctx.family_id, Member.role == Role.parent)
    ).one()


def _check_nickname_free(ctx: Ctx, nickname: str, member_id: UUID | None = None) -> None:
    """Nicknames are unique within the family, ignoring case ("Mia" and "mia" clash)."""
    query = select(Member.id).where(
        Member.family_id == ctx.family_id,
        sa_func.lower(Member.nickname) == nickname.lower(),
    )
    if member_id is not None:
        query = query.where(Member.id != member_id)
    if ctx.db.exec(query).first() is not None:
        raise _unprocessable("Someone in the family already has that nickname")


def create(ctx: Ctx, nickname: str, avatar_emoji: str, role: Role, pin: str) -> Member:
    with transaction(ctx.db, immediate=True):
        ensure_allowed(Action.MEMBER_CREATE, ctx.acting)
        _check_nickname_free(ctx, nickname)
        member = Member(
            family_id=ctx.family_id,
            nickname=nickname,
            avatar_emoji=avatar_emoji,
            role=role,
            created_at=ctx.now,
        )
        ctx.db.add(member)
        ctx.db.flush()
        ctx.db.add(MemberCredential(member_id=member.id, pin_hash=hash_secret(pin)))
    return member


def update(
    ctx: Ctx,
    member_id: UUID,
    nickname: str | None,
    avatar_emoji: str | None,
    role: Role | None,
) -> Member:
    with transaction(ctx.db, immediate=True):
        member = get_owned_or_404(ctx.db, Member, member_id, ctx.family_id)
        ensure_allowed(Action.MEMBER_PROFILE_EDIT, ctx.acting, member)
        if role is not None and role != member.role:
            ensure_allowed(Action.MEMBER_ROLE_CHANGE, ctx.acting, member)
            if member.role is Role.parent and parent_count(ctx) == 1:
                raise _unprocessable(NEEDS_A_PARENT)
            member.role = role
        if nickname is not None and nickname != member.nickname:
            _check_nickname_free(ctx, nickname, member.id)
            member.nickname = nickname
        if avatar_emoji is not None:
            member.avatar_emoji = avatar_emoji
        ctx.db.add(member)
    return member


def delete(ctx: Ctx, member_id: UUID) -> None:
    """Everything the member owns goes with them, by database cascade [child-data-privacy #4].

    Rows where they only acted (a check-in they added for a child, a claim they decided) stay,
    with the actor set to null ("a family member", REQ-007).
    """
    with transaction(ctx.db, immediate=True):
        member = get_owned_or_404(ctx.db, Member, member_id, ctx.family_id)
        ensure_allowed(Action.MEMBER_DELETE, ctx.acting)
        if member.role is Role.parent and parent_count(ctx) == 1:
            raise _unprocessable(NEEDS_A_PARENT)
        ctx.db.delete(member)


def _current_pin_ok(ctx: Ctx, credential: MemberCredential | None, current_pin: str) -> bool:
    """Check your current PIN; a wrong one counts toward the 5-try lockout (REQ-003)."""
    if credential is not None and is_locked(credential, ctx.now):
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many tries. Ask a parent, or wait 5 minutes.",
        )
    if credential is not None and verify_secret(credential.pin_hash, current_pin):
        return True
    if credential is not None:
        record_failure(credential, ctx.now)
        ctx.db.add(credential)
    return False


def set_pin(ctx: Ctx, member_id: UUID, pin: str, current_pin: str | None) -> None:
    """Your own PIN needs the current one; a parent resets a child's without it (REQ-005, C14).

    A wrong current PIN is a `MemberPIN` 401, raised after the commit so the attempt counts.
    """
    with transaction(ctx.db, immediate=True):
        member = get_owned_or_404(ctx.db, Member, member_id, ctx.family_id)
        ensure_allowed(Action.PIN_SET, ctx.acting, member)
        credential = ctx.db.get(MemberCredential, member.id)
        is_self = member.id == ctx.acting.id
        if is_self and current_pin is None:
            raise _unprocessable("current_pin is needed to change your own PIN")
        accepted = not is_self or _current_pin_ok(ctx, credential, current_pin or "")
        if accepted:
            credential = credential or MemberCredential(member_id=member.id, pin_hash="")
            credential.pin_hash = hash_secret(pin)
            record_success(credential)  # a parent's reset clears the lockout too
            ctx.db.add(credential)
            if not is_self:
                adjustments.record(ctx, AdjustmentKind.pin_reset, member)
    if not accepted:
        raise wrong_pin()

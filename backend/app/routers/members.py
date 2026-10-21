"""Family members, their PINs and gem history (REQ-005, REQ-006, REQ-007, REQ-021, REQ-022)."""

import logging
from datetime import date
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, Response, status

from app.domain.permissions import Action
from app.models import Member
from app.routers.deps import R401, R403, R404, R422, FamilyCtx, MemberCtx
from app.schemas.credential import MemberCredentialUpdate
from app.schemas.gem_transaction import GemTransactionRead
from app.schemas.member import MemberCreate, MemberRead, MemberUpdate
from app.security.sessions import (
    PASSCODE_CHALLENGE,
    PIN_CHALLENGE,
    ensure_allowed,
    get_owned_or_404,
    unauthorized_doc,
)
from app.services import balance, members
from app.services.adjustments import year_ago
from app.services.context import Ctx

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/members", tags=["members"])


def _read(ctx: Ctx, member: Member) -> MemberRead:
    return MemberRead.from_member(member, balance.balance_of(ctx, member.id))


@router.get(
    "",
    response_model=list[MemberRead],
    summary="List the family's members with their gem balances",
    responses={401: R401},
)
def list_members(ctx: FamilyCtx) -> list[MemberRead]:
    rows = members.list_members(ctx)
    balances = balance.balances(ctx, [m.id for m in rows])
    return [MemberRead.from_member(m, balances[m.id]) for m in rows]


@router.post(
    "",
    response_model=MemberRead,
    status_code=status.HTTP_201_CREATED,
    summary="Add a family member (parents only)",
    responses={401: R401, 403: R403, 422: R422},
)
def create_member(body: MemberCreate, ctx: MemberCtx) -> MemberRead:
    member = members.create(ctx, body.nickname, body.avatar_emoji, body.role, body.pin)
    logger.info("member created member_id=%s by=%s", member.id, ctx.acting.id)
    return _read(ctx, member)


@router.get(
    "/{member_id}",
    response_model=MemberRead,
    summary="Get one member",
    responses={401: R401, 404: R404},
)
def read_member(member_id: UUID, ctx: FamilyCtx) -> MemberRead:
    return _read(ctx, get_owned_or_404(ctx.db, Member, member_id, ctx.family_id))


@router.patch(
    "/{member_id}",
    response_model=MemberRead,
    summary="Edit a nickname or avatar (yourself or a parent); change a role (parents only)",
    responses={401: R401, 403: R403, 404: R404, 422: R422},
)
def update_member(member_id: UUID, body: MemberUpdate, ctx: MemberCtx) -> MemberRead:
    member = members.update(ctx, member_id, body.nickname, body.avatar_emoji, body.role)
    logger.info("member updated member_id=%s by=%s", member.id, ctx.acting.id)
    return _read(ctx, member)


@router.delete(
    "/{member_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    summary="Remove a member and all of their data (parents only)",
    responses={
        401: R401,
        403: R403,
        404: R404,
        422: {"description": "A family always needs at least one parent"},
    },
)
def delete_member(member_id: UUID, ctx: MemberCtx) -> Response:
    members.delete(ctx, member_id)
    logger.info("member removed member_id=%s by=%s", member_id, ctx.acting.id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.put(
    "/{member_id}/credentials",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    summary="Set your own PIN, or reset a child's PIN (parents)",
    responses={
        401: unauthorized_doc(
            "Session missing or ended (`FamilyPasscode`), or wrong current PIN (`MemberPIN`)",
            PASSCODE_CHALLENGE,
            PIN_CHALLENGE,
        ),
        403: R403,
        404: R404,
        422: R422,
        429: {"description": "Too many wrong PINs for this member; ask a parent or wait 5 min"},
    },
)
def set_pin(member_id: UUID, body: MemberCredentialUpdate, ctx: MemberCtx) -> Response:
    members.set_pin(ctx, member_id, body.pin, body.current_pin)
    logger.info("pin changed member_id=%s by=%s", member_id, ctx.acting.id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get(
    "/{member_id}/gem-transactions",
    response_model=list[GemTransactionRead],
    summary="A member's gem earnings and spends, newest first (yourself or a parent)",
    responses={401: R401, 403: R403, 404: R404, 422: R422},
)
def list_gem_transactions(
    member_id: UUID,
    ctx: MemberCtx,
    from_: Annotated[
        date | None, Query(alias="from", description="Default: 12 months before `to`")
    ] = None,
    to: Annotated[date | None, Query(description="Default: today")] = None,
) -> list[GemTransactionRead]:
    member = get_owned_or_404(ctx.db, Member, member_id, ctx.family_id)
    ensure_allowed(Action.GEM_HISTORY_VIEW, ctx.acting, member)
    end = to or ctx.today
    start = from_ or year_ago(end)
    if end < start:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, detail="'to' must be on or after 'from'"
        )
    events = balance.gem_history(ctx, member.id, start, end)
    return [GemTransactionRead.from_event(e) for e in events]

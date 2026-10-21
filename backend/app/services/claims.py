"""Prizes and prize claims (REQ-024, REQ-025, REQ-026).

A claim holds its cost with a `prize_hold` transaction. Approving keeps the hold (the gems are
spent); declining or cancelling adds a matching `prize_release`.
"""

from uuid import UUID

from fastapi import HTTPException, status
from sqlmodel import col, select

from app.db import transaction
from app.domain.balance import can_afford, gems_to_go
from app.domain.permissions import Action
from app.models import (
    ClaimStatus,
    GemTransaction,
    GemTransactionKind,
    Member,
    Prize,
    PrizeClaim,
)
from app.security.sessions import ensure_allowed, get_owned_or_404
from app.services.balance import balance_of
from app.services.context import Ctx
from app.services.members import parent_count


def _conflict(detail: str) -> HTTPException:
    return HTTPException(status.HTTP_409_CONFLICT, detail=detail)


def list_prizes(ctx: Ctx) -> list[Prize]:
    return list(
        ctx.db.exec(
            select(Prize)
            .where(Prize.family_id == ctx.family_id)
            .order_by(col(Prize.gem_cost), col(Prize.created_at), col(Prize.id))
        )
    )


def create_prize(ctx: Ctx, title: str, gem_cost: int) -> Prize:
    with transaction(ctx.db, immediate=True):
        ensure_allowed(Action.PRIZE_MANAGE, ctx.acting)
        prize = Prize(family_id=ctx.family_id, title=title, gem_cost=gem_cost, created_at=ctx.now)
        ctx.db.add(prize)
    return prize


def update_prize(ctx: Ctx, prize_id: UUID, title: str | None, gem_cost: int | None) -> Prize:
    """Pending claims keep the cost they were made at: they hold their own copy (REQ-024)."""
    with transaction(ctx.db, immediate=True):
        prize = get_owned_or_404(ctx.db, Prize, prize_id, ctx.family_id)
        ensure_allowed(Action.PRIZE_MANAGE, ctx.acting)
        if title is not None:
            prize.title = title
        if gem_cost is not None:
            prize.gem_cost = gem_cost
        ctx.db.add(prize)
    return prize


def _has_pending_claim(ctx: Ctx, prize_id: UUID) -> bool:
    return (
        ctx.db.exec(
            select(PrizeClaim.id).where(
                PrizeClaim.prize_id == prize_id, PrizeClaim.status == ClaimStatus.pending
            )
        ).first()
        is not None
    )


def delete_prize(ctx: Ctx, prize_id: UUID) -> None:
    """Past claims keep the title and cost; their `prize_id` is set to null."""
    with transaction(ctx.db, immediate=True):
        prize = get_owned_or_404(ctx.db, Prize, prize_id, ctx.family_id)
        ensure_allowed(Action.PRIZE_MANAGE, ctx.acting)
        if _has_pending_claim(ctx, prize.id):
            raise _conflict("A claim for this prize is waiting for a decision")
        ctx.db.delete(prize)


def list_claims(
    ctx: Ctx, claim_status: ClaimStatus | None, member_id: UUID | None
) -> list[PrizeClaim]:
    query = select(PrizeClaim).where(PrizeClaim.family_id == ctx.family_id)
    if claim_status is not None:
        query = query.where(PrizeClaim.status == claim_status)
    if member_id is not None:
        query = query.where(PrizeClaim.member_id == member_id)
    return list(
        ctx.db.exec(query.order_by(col(PrizeClaim.requested_at).desc(), col(PrizeClaim.id)))
    )


def claim(ctx: Ctx, prize_id: UUID) -> PrizeClaim:
    """Claim a prize for yourself; its cost is held from your balance (REQ-025)."""
    with transaction(ctx.db, immediate=True):
        prize = get_owned_or_404(ctx.db, Prize, prize_id, ctx.family_id)
        ensure_allowed(Action.CLAIM_CREATE, ctx.acting, ctx.acting)
        available = balance_of(ctx, ctx.acting.id).available
        if not can_afford(available, prize.gem_cost):
            raise _conflict(f"{gems_to_go(available, prize.gem_cost)} more gems to go!")
        row = PrizeClaim(
            family_id=ctx.family_id,
            prize_id=prize.id,
            prize_title=prize.title,
            gem_cost=prize.gem_cost,
            member_id=ctx.acting.id,
            status=ClaimStatus.pending,
            requested_at=ctx.now,
        )
        ctx.db.add(row)
        ctx.db.flush()
        ctx.db.add(
            GemTransaction(
                member_id=ctx.acting.id,
                kind=GemTransactionKind.prize_hold,
                amount=-row.gem_cost,
                prize_claim_id=row.id,
                created_at=ctx.now,
            )
        )
    return row


def decide(ctx: Ctx, claim_id: UUID, new_status: ClaimStatus) -> PrizeClaim:
    """Cancel your own claim, or (as a parent) approve or decline one (REQ-025, REQ-026)."""
    with transaction(ctx.db, immediate=True):
        row = get_owned_or_404(ctx.db, PrizeClaim, claim_id, ctx.family_id)
        claimant = ctx.db.get_one(Member, row.member_id)
        if new_status is ClaimStatus.cancelled:
            ensure_allowed(Action.CLAIM_CANCEL, ctx.acting, claimant)
        else:
            # A parent's own claim needs the other parent, unless they're the only one (C5).
            ensure_allowed(
                Action.CLAIM_DECIDE, ctx.acting, claimant, parent_count=parent_count(ctx)
            )
        if row.status is not ClaimStatus.pending:
            raise _conflict("This claim has already been decided")
        if new_status is not ClaimStatus.approved:
            ctx.db.add(
                GemTransaction(
                    member_id=row.member_id,
                    kind=GemTransactionKind.prize_release,
                    amount=row.gem_cost,
                    prize_claim_id=row.id,
                    created_at=ctx.now,
                )
            )
        row.status = new_status
        row.decided_at = ctx.now
        row.decided_by_member_id = ctx.acting.id
        ctx.db.add(row)
    return row

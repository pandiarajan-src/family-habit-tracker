"""Adjustments (REQ-015): a note for the child each time a parent changes their data.

Rows hold member and habit IDs and a date, never nicknames or titles [child-data-privacy #2].
"""

from datetime import date
from uuid import UUID

from fastapi import HTTPException, status
from sqlmodel import col, select

from app.db import transaction
from app.domain.permissions import Action
from app.models import Adjustment, AdjustmentKind, Member
from app.security.sessions import ensure_allowed, get_owned_or_404
from app.services.context import Ctx


def record(
    ctx: Ctx,
    kind: AdjustmentKind,
    target: Member,
    habit_id: UUID | None = None,
    day: date | None = None,
) -> None:
    """Note a change made by someone other than the owner (a parent changing a child's data)."""
    if target.id == ctx.acting.id:
        return
    ctx.db.add(
        Adjustment(
            family_id=ctx.family_id,
            target_member_id=target.id,
            actor_member_id=ctx.acting.id,
            kind=kind,
            habit_id=habit_id,
            date=day,
            created_at=ctx.now,
        )
    )


def year_ago(today: date) -> date:
    """The same date 12 months back (29 Feb → 28 Feb)."""
    try:
        return today.replace(year=today.year - 1)
    except ValueError:
        return today.replace(year=today.year - 1, day=28)


def list_for(ctx: Ctx, member_id: UUID | None) -> list[Adjustment]:
    """The last 12 months of changes to a member's data, newest first."""
    target = get_owned_or_404(ctx.db, Member, member_id or ctx.acting.id, ctx.family_id)
    ensure_allowed(Action.ADJUSTMENTS_VIEW, ctx.acting, target)
    rows = ctx.db.exec(
        select(Adjustment)
        .where(Adjustment.target_member_id == target.id, Adjustment.family_id == ctx.family_id)
        .order_by(col(Adjustment.created_at).desc(), col(Adjustment.id))
    )
    since = year_ago(ctx.today)
    return [row for row in rows if ctx.local_date(row.created_at) >= since]


def acknowledge(ctx: Ctx, adjustment_id: UUID) -> Adjustment:
    """The child taps "Got it" (REQ-015). Only the member it is about can do that."""
    with transaction(ctx.db, immediate=True):
        row = get_owned_or_404(ctx.db, Adjustment, adjustment_id, ctx.family_id)
        if row.target_member_id != ctx.acting.id:
            raise HTTPException(
                status.HTTP_403_FORBIDDEN, detail="Only the member it's about can dismiss it"
            )
        if row.acknowledged_at is None:
            row.acknowledged_at = ctx.now
            ctx.db.add(row)
    return row

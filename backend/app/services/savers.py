"""Streak savers (REQ-020): spend gems so a past day (or week) keeps the streak going.

The balance is checked inside `BEGIN IMMEDIATE`, so two devices can't overspend.
"""

from datetime import date
from uuid import UUID

from fastapi import HTTPException, status
from sqlmodel import col, select

from app.db import transaction
from app.domain import savers
from app.domain.balance import can_afford
from app.domain.permissions import Action
from app.domain.streaks import DailyHistory
from app.models import (
    AdjustmentKind,
    GemTransaction,
    GemTransactionKind,
    Habit,
    Member,
    StreakSaver,
)
from app.security.sessions import ensure_allowed, get_owned_or_404
from app.services import adjustments
from app.services.balance import balance_of, load_habit_data, reconcile_writeoff
from app.services.check_ins import check_range
from app.services.context import Ctx


def _unprocessable(detail: str) -> HTTPException:
    return HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, detail=detail)


def _gems(n: int) -> str:
    return f"{n} gem" if n == 1 else f"{n} gems"


def use(ctx: Ctx, habit_id: UUID, period_start: date) -> StreakSaver:
    with transaction(ctx.db, immediate=True):
        habit = get_owned_or_404(ctx.db, Habit, habit_id, ctx.family_id)
        owner = ctx.db.get_one(Member, habit.member_id)
        ensure_allowed(Action.STREAK_SAVER_USE, ctx.acting, owner)
        if habit.archived_at is not None:
            raise _unprocessable("Bring the habit back before saving its streak")
        history = load_habit_data(ctx.db, [habit])[0].history()
        if isinstance(history, DailyHistory) and period_start in history.done:
            raise HTTPException(status.HTTP_409_CONFLICT, detail="That day is already checked in")
        if isinstance(history, DailyHistory):
            saveable = savers.is_saveable_day(history, period_start, ctx.today)
        else:
            saveable = savers.is_saveable_week(history, period_start, ctx.today)
        if not saveable:
            raise _unprocessable(
                "A streak saver works on one of the last 7 days (or last week), "
                "right after a done or saved one"
            )
        cost = (
            savers.daily_saver_cost(history, period_start, ctx.today)
            if isinstance(history, DailyHistory)
            else savers.weekly_saver_cost(history, period_start, ctx.today)
        )
        if not can_afford(balance_of(ctx, owner.id).available, cost):
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                detail=f"You need {_gems(cost)} for this saver — keep going and you'll get there!",
            )
        saver = StreakSaver(
            habit_id=habit.id,
            member_id=owner.id,
            period_start=period_start,
            cost=cost,
            created_by_member_id=ctx.acting.id,
            created_at=ctx.now,
        )
        ctx.db.add(saver)
        ctx.db.flush()
        ctx.db.add(
            GemTransaction(
                member_id=owner.id,
                kind=GemTransactionKind.streak_saver,
                amount=-cost,
                streak_saver_id=saver.id,
                created_at=ctx.now,
            )
        )
        adjustments.record(ctx, AdjustmentKind.streak_saver_used, owner, habit.id, period_start)
        ctx.db.flush()
        # Joining two runs moves where the streak bonuses fall, which can lower earnings.
        reconcile_writeoff(ctx, owner.id)
    return saver


def list_range(ctx: Ctx, start: date, end: date, member_id: UUID | None) -> list[StreakSaver]:
    check_range(start, end)
    query = (
        select(StreakSaver)
        .join(Habit, col(Habit.id) == col(StreakSaver.habit_id))
        .where(
            Habit.family_id == ctx.family_id,
            StreakSaver.period_start >= start,
            StreakSaver.period_start <= end,
        )
    )
    if member_id is not None:
        query = query.where(StreakSaver.member_id == member_id)
    return list(ctx.db.exec(query.order_by(col(StreakSaver.period_start), col(StreakSaver.id))))

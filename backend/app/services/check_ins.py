"""Check-ins (REQ-011 to REQ-014): today or yesterday for yourself, any past day for a parent
correcting a child. PUT is idempotent per (habit, date); removing one reconciles write-offs."""

from datetime import date, timedelta
from uuid import UUID, uuid4

from fastapi import HTTPException, status
from sqlmodel import col, select

from app.db import insert_if_absent, transaction
from app.domain.permissions import Action, is_allowed
from app.models import AdjustmentKind, CheckIn, Frequency, Habit, Member, StreakSaver
from app.security.sessions import ensure_allowed, get_owned_or_404
from app.services import adjustments
from app.services.balance import reconcile_writeoff
from app.services.context import Ctx

MAX_RANGE_DAYS = 62  # REQ-023


def _unprocessable(detail: str) -> HTTPException:
    return HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, detail=detail)


def check_range(start: date, end: date) -> None:
    if end < start:
        raise _unprocessable("'to' must be on or after 'from'")
    if (end - start).days + 1 > MAX_RANGE_DAYS:
        raise _unprocessable(f"Ask for at most {MAX_RANGE_DAYS} days at once")


def _writable(ctx: Ctx, habit_id: UUID, day: date) -> tuple[Habit, Member]:
    """The habit and its owner, once the actor may change this day's check-in.

    Today and yesterday: the owner, or a parent for a child (REQ-011, REQ-013). An older day:
    only a parent correcting a child (REQ-014); the owner gets a 422 window error, anyone else
    403. Future days and days before the habit existed are always 422.
    """
    habit = get_owned_or_404(ctx.db, Habit, habit_id, ctx.family_id)
    owner = ctx.db.get_one(Member, habit.member_id)
    in_window = ctx.today - timedelta(days=1) <= day <= ctx.today
    correction = not in_window and is_allowed(
        Action.CHECK_IN_CORRECTION, ctx.acting.role, owner.role, is_self=owner.id == ctx.acting.id
    )
    if not correction:
        ensure_allowed(Action.CHECK_IN, ctx.acting, owner)
    if day > ctx.today:
        raise _unprocessable("You can't check in for a future day")
    if day < habit.created_on:
        raise _unprocessable("That day is before the habit was created")
    if not in_window and not correction:
        raise _unprocessable("Only today and yesterday can be checked in")
    if habit.archived_at is not None:
        raise _unprocessable("Bring the habit back before checking it in")
    return habit, owner


def _is_saved_day(ctx: Ctx, habit: Habit, day: date) -> bool:
    """A saved day can't be checked in (REQ-020). A saved *week* can still be completed (C21)."""
    if habit.frequency is not Frequency.daily:
        return False
    saver = ctx.db.exec(
        select(StreakSaver.id).where(
            StreakSaver.habit_id == habit.id, StreakSaver.period_start == day
        )
    ).first()
    return saver is not None


def _find(ctx: Ctx, habit_id: UUID, day: date) -> CheckIn | None:
    return ctx.db.exec(
        select(CheckIn).where(CheckIn.habit_id == habit_id, CheckIn.date == day)
    ).first()


def check_in(ctx: Ctx, habit_id: UUID, day: date) -> tuple[CheckIn, bool]:
    """Returns the check-in and whether this request created it (201) or it existed (200)."""
    with transaction(ctx.db, immediate=True):
        habit, owner = _writable(ctx, habit_id, day)
        if _is_saved_day(ctx, habit, day):
            raise HTTPException(
                status.HTTP_409_CONFLICT, detail="That day was saved with a streak saver"
            )
        values = {
            "id": uuid4(),
            "habit_id": habit.id,
            "member_id": owner.id,
            "date": day,
            "created_by_member_id": ctx.acting.id,
            "created_at": ctx.now,
        }
        created = insert_if_absent(ctx.db, CheckIn, values, ["habit_id", "date"])
        if created:
            adjustments.record(ctx, AdjustmentKind.check_in_added, owner, habit.id, day)
        row = ctx.db.exec(
            select(CheckIn).where(CheckIn.habit_id == habit.id, CheckIn.date == day)
        ).one()
    return row, created


def undo(ctx: Ctx, habit_id: UUID, day: date) -> None:
    """Remove a check-in; idempotent, so an undo racing a check-in leaves the last one's state."""
    with transaction(ctx.db, immediate=True):
        habit, owner = _writable(ctx, habit_id, day)
        row = _find(ctx, habit.id, day)
        if row is None:
            return
        ctx.db.delete(row)
        ctx.db.flush()
        adjustments.record(ctx, AdjustmentKind.check_in_removed, owner, habit.id, day)
        reconcile_writeoff(ctx, owner.id)


def list_range(ctx: Ctx, start: date, end: date, member_id: UUID | None) -> list[CheckIn]:
    check_range(start, end)
    query = (
        select(CheckIn)
        .join(Habit, col(Habit.id) == col(CheckIn.habit_id))
        .where(Habit.family_id == ctx.family_id, CheckIn.date >= start, CheckIn.date <= end)
    )
    if member_id is not None:
        query = query.where(CheckIn.member_id == member_id)
    return list(ctx.db.exec(query.order_by(col(CheckIn.date), col(CheckIn.id))))

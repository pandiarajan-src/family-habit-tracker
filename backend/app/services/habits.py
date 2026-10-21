"""Habits (REQ-008, REQ-009, REQ-010) and their streak, progress and saver fields."""

from dataclasses import dataclass
from uuid import UUID

from fastapi import HTTPException, status
from sqlmodel import col, func, select

from app.db import transaction
from app.domain import savers, streaks
from app.domain.dates import week_start
from app.domain.permissions import Action
from app.domain.streaks import WeeklyHistory, week_check_ins
from app.domain.weekly_targets import target_for_week
from app.models import AdjustmentKind, Frequency, Habit, Member, WeeklyTarget
from app.security.sessions import ensure_allowed, get_owned_or_404
from app.services import adjustments
from app.services.balance import HabitData, load_habit_data, reconcile_writeoff
from app.services.context import Ctx

MAX_ACTIVE_HABITS = 20

UNSET = object()  # "goal_note not sent", as opposed to null (clear it)


def _unprocessable(detail: str) -> HTTPException:
    return HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, detail=detail)


@dataclass(frozen=True, slots=True)
class HabitView:
    """A habit plus the derived fields HabitRead shows (REQ-016, REQ-017, REQ-020)."""

    habit: Habit
    weekly_target: int | None
    current_streak: int
    best_streak: int
    streak_pending: bool
    today_done: bool
    week_done: int | None
    saveable: list[savers.SaveablePeriod]


def view(ctx: Ctx, data: HabitData) -> HabitView:
    history = data.history()
    as_of = data.as_of(ctx)
    streak = streaks.streak(history, as_of)
    archived = data.habit.archived_at is not None
    weekly = isinstance(history, WeeklyHistory)
    return HabitView(
        habit=data.habit,
        weekly_target=target_for_week(history.targets, ctx.today) if weekly else None,
        current_streak=streak.current,
        best_streak=streak.best,
        streak_pending=streak.pending,
        today_done=ctx.today in data.done,
        week_done=len(week_check_ins(history, ctx.today, ctx.today)) if weekly else None,
        # An archived habit has no streak to save until it is brought back.
        saveable=[] if archived else savers.saveable_periods(history, ctx.today),
    )


def views(ctx: Ctx, habits: list[Habit]) -> list[HabitView]:
    return [view(ctx, data) for data in load_habit_data(ctx.db, habits)]


def list_habits(ctx: Ctx, member_id: UUID | None, include_archived: bool) -> list[HabitView]:
    query = select(Habit).where(Habit.family_id == ctx.family_id)
    if member_id is not None:
        query = query.where(Habit.member_id == member_id)
    if not include_archived:
        query = query.where(col(Habit.archived_at).is_(None))
    habits = list(ctx.db.exec(query.order_by(col(Habit.created_on), col(Habit.id))))
    return views(ctx, habits)


def get_view(ctx: Ctx, habit_id: UUID) -> HabitView:
    return view(ctx, load_habit_data(ctx.db, [_get(ctx, habit_id)])[0])


def _get(ctx: Ctx, habit_id: UUID) -> Habit:
    return get_owned_or_404(ctx.db, Habit, habit_id, ctx.family_id)


def owner_for_write(ctx: Ctx, habit: Habit) -> Member:
    """The habit's owner, once the actor may change it (self, or a parent for a child)."""
    owner = ctx.db.get_one(Member, habit.member_id)
    ensure_allowed(Action.HABIT_WRITE, ctx.acting, owner)
    return owner


def _check_active_limit(ctx: Ctx, member_id: UUID) -> None:
    active = ctx.db.exec(
        select(func.count())
        .select_from(Habit)
        .where(Habit.member_id == member_id, col(Habit.archived_at).is_(None))
    ).one()
    if active >= MAX_ACTIVE_HABITS:
        raise _unprocessable(f"A member can have up to {MAX_ACTIVE_HABITS} active habits")


def _set_target(ctx: Ctx, habit: Habit, target: int) -> None:
    """A new target counts from this family week; earlier weeks keep theirs (REQ-009)."""
    monday = week_start(ctx.today)
    existing = ctx.db.get(WeeklyTarget, (habit.id, monday))
    if existing is not None:  # a second change this week replaces the first
        existing.target = target
        ctx.db.add(existing)
    else:
        ctx.db.add(WeeklyTarget(habit_id=habit.id, effective_from_week=monday, target=target))


def create(
    ctx: Ctx,
    member_id: UUID,
    title: str,
    goal_note: str | None,
    frequency: Frequency,
    weekly_target: int | None,
) -> HabitView:
    with transaction(ctx.db, immediate=True):
        owner = get_owned_or_404(ctx.db, Member, member_id, ctx.family_id)
        ensure_allowed(Action.HABIT_WRITE, ctx.acting, owner)
        _check_active_limit(ctx, owner.id)
        habit = Habit(
            family_id=ctx.family_id,
            member_id=owner.id,
            title=title,
            goal_note=goal_note,
            frequency=frequency,
            created_on=ctx.today,
        )
        ctx.db.add(habit)
        ctx.db.flush()
        if weekly_target is not None:
            _set_target(ctx, habit, weekly_target)
        adjustments.record(ctx, AdjustmentKind.habit_created, owner, habit.id)
    return get_view(ctx, habit.id)


def update(
    ctx: Ctx,
    habit_id: UUID,
    *,
    title: str | None = None,
    goal_note: object = UNSET,
    weekly_target: int | None = None,
    archived: bool | None = None,
) -> HabitView:
    with transaction(ctx.db, immediate=True):
        habit = _get(ctx, habit_id)
        owner = owner_for_write(ctx, habit)
        changed = False
        if title is not None and title != habit.title:
            habit.title, changed = title, True
        if goal_note is not UNSET and goal_note != habit.goal_note:
            habit.goal_note, changed = goal_note, True  # type: ignore[assignment]
        if weekly_target is not None:
            if habit.frequency is not Frequency.weekly:
                raise _unprocessable("Only weekly habits have a target")
            targets = load_habit_data(ctx.db, [habit])[0].targets
            if weekly_target != target_for_week(targets, ctx.today):
                _set_target(ctx, habit, weekly_target)
                changed = True
        kind = AdjustmentKind.habit_updated
        if archived is True and habit.archived_at is None:
            habit.archived_at, changed = ctx.now, True
            kind = AdjustmentKind.habit_archived
        elif archived is False and habit.archived_at is not None:
            _check_active_limit(ctx, habit.member_id)
            # Unarchiving starts the streak again from today (REQ-009, C20).
            habit.archived_at, habit.restarted_on, changed = None, ctx.today, True
        if changed:
            ctx.db.add(habit)
            ctx.db.flush()
            adjustments.record(ctx, kind, owner, habit.id)
            # A higher target can take this week below it, and its gem with it (REQ-019).
            reconcile_writeoff(ctx, owner.id)
    return get_view(ctx, habit_id)


def delete(ctx: Ctx, habit_id: UUID) -> None:
    """Deletes the habit's check-ins and savers (DB cascade); spent gems stay spent (REQ-009)."""
    with transaction(ctx.db, immediate=True):
        habit = _get(ctx, habit_id)
        owner = owner_for_write(ctx, habit)
        ctx.db.delete(habit)
        ctx.db.flush()
        adjustments.record(ctx, AdjustmentKind.habit_deleted, owner)
        reconcile_writeoff(ctx, owner.id)

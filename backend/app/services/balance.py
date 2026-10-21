"""Gem balances (REQ-014, REQ-018, REQ-019, REQ-021): load inputs, run the engine.

Earned gems are derived from each habit's check-ins, savers and targets. Spends live in
GemTransaction. Any write that can lower earnings calls `reconcile_writeoff()` in its transaction.
"""

import datetime as dt
from collections import defaultdict
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import date
from uuid import UUID

from sqlmodel import Session, col, func, select

from app.domain import balance as engine
from app.domain import gems
from app.domain.streaks import DailyHistory, WeeklyHistory
from app.domain.weekly_targets import TargetChange
from app.models import (
    CheckIn,
    ClaimStatus,
    Frequency,
    GemTransaction,
    GemTransactionKind,
    Habit,
    PrizeClaim,
    StreakSaver,
    WeeklyTarget,
)
from app.services.context import Ctx


@dataclass(frozen=True, slots=True)
class HabitData:
    """A habit with everything the engine needs about it."""

    habit: Habit
    done: frozenset[date]
    saved: frozenset[date]
    targets: tuple[TargetChange, ...]

    def history(self) -> DailyHistory | WeeklyHistory:
        if self.habit.frequency is Frequency.daily:
            return DailyHistory(self.done, self.saved, restart_on=self.habit.restarted_on)
        return WeeklyHistory(
            self.done, self.targets, saved_weeks=self.saved, restart_on=self.habit.restarted_on
        )

    def as_of(self, ctx: Ctx) -> date:
        """Today, or the archive date: an archived habit's streak and gems are frozen (REQ-009)."""
        archived_at = self.habit.archived_at
        return ctx.today if archived_at is None else min(ctx.today, ctx.local_date(archived_at))


def load_habit_data(db: Session, habits: Iterable[Habit]) -> list[HabitData]:
    """Three queries for any number of habits."""
    habits = list(habits)
    ids = [h.id for h in habits]
    done: defaultdict[UUID, set[date]] = defaultdict(set)
    saved: defaultdict[UUID, set[date]] = defaultdict(set)
    targets: defaultdict[UUID, list[TargetChange]] = defaultdict(list)
    if ids:
        for habit_id, day in db.exec(
            select(CheckIn.habit_id, CheckIn.date).where(col(CheckIn.habit_id).in_(ids))
        ):
            done[habit_id].add(day)
        for habit_id, day in db.exec(
            select(StreakSaver.habit_id, StreakSaver.period_start).where(
                col(StreakSaver.habit_id).in_(ids)
            )
        ):
            saved[habit_id].add(day)
        for row in db.exec(select(WeeklyTarget).where(col(WeeklyTarget.habit_id).in_(ids))):
            targets[row.habit_id].append(TargetChange(row.effective_from_week, row.target))
    return [
        HabitData(h, frozenset(done[h.id]), frozenset(saved[h.id]), tuple(targets[h.id]))
        for h in habits
    ]


def earn_events(ctx: Ctx, data: HabitData) -> list[gems.EarnEvent]:
    return gems.earnings(data.history(), data.as_of(ctx))


def _habits_of(db: Session, member_ids: list[UUID]) -> list[Habit]:
    return list(db.exec(select(Habit).where(col(Habit.member_id).in_(member_ids))))


def _earned(ctx: Ctx, member_ids: list[UUID]) -> dict[UUID, int]:
    earned = dict.fromkeys(member_ids, 0)
    for data in load_habit_data(ctx.db, _habits_of(ctx.db, member_ids)):
        earned[data.habit.member_id] += gems.total(earn_events(ctx, data))
    return earned


def _sums(db: Session, member_ids: list[UUID]) -> dict[UUID, int]:
    rows = db.exec(
        select(GemTransaction.member_id, func.sum(GemTransaction.amount))
        .where(col(GemTransaction.member_id).in_(member_ids))
        .group_by(col(GemTransaction.member_id))
    )
    return {member_id: total or 0 for member_id, total in rows}


def _held(db: Session, member_ids: list[UUID]) -> dict[UUID, int]:
    rows = db.exec(
        select(PrizeClaim.member_id, func.sum(PrizeClaim.gem_cost))
        .where(col(PrizeClaim.member_id).in_(member_ids), PrizeClaim.status == ClaimStatus.pending)
        .group_by(col(PrizeClaim.member_id))
    )
    return {member_id: total or 0 for member_id, total in rows}


def balances(ctx: Ctx, member_ids: list[UUID]) -> dict[UUID, engine.Balance]:
    """Available and held gems for each member (REQ-021)."""
    earned = _earned(ctx, member_ids)
    sums = _sums(ctx.db, member_ids)
    held = _held(ctx.db, member_ids)
    return {m: engine.balance(earned[m], [sums.get(m, 0)], [held.get(m, 0)]) for m in member_ids}


def balance_of(ctx: Ctx, member_id: UUID) -> engine.Balance:
    return balances(ctx, [member_id])[member_id]


def reconcile_writeoff(ctx: Ctx, member_id: UUID) -> int:
    """Write off a shortfall so the balance is exactly 0, never negative (REQ-014, C6).

    Call it inside the transaction of every write that can lower earnings. Returns the amount.
    """
    earned = _earned(ctx, [member_id])[member_id]
    amount = engine.writeoff_amount(earned, [_sums(ctx.db, [member_id]).get(member_id, 0)])
    if amount:
        ctx.db.add(
            GemTransaction(
                member_id=member_id,
                kind=GemTransactionKind.correction_writeoff,
                amount=amount,
                created_at=ctx.now,
            )
        )
        ctx.db.flush()
    return amount


@dataclass(frozen=True, slots=True)
class HistoryEvent:
    """One line of a member's gem history (REQ-021): derived earnings and ledger rows alike."""

    date: dt.date
    kind: str  # an EarnKind or a GemTransactionKind
    amount: int
    habit_id: UUID | None = None
    prize_claim_id: UUID | None = None


def gem_history(ctx: Ctx, member_id: UUID, start: date, end: date) -> list[HistoryEvent]:
    """Earning and spending events from `start` to `end`, newest first."""
    events = [
        HistoryEvent(event.date, event.kind.value, event.amount, habit_id=data.habit.id)
        for data in load_habit_data(ctx.db, _habits_of(ctx.db, [member_id]))
        for event in earn_events(ctx, data)
    ]
    rows = ctx.db.exec(
        select(GemTransaction, StreakSaver.habit_id)
        .outerjoin(StreakSaver, col(StreakSaver.id) == col(GemTransaction.streak_saver_id))
        .where(GemTransaction.member_id == member_id)
    )
    events += [
        HistoryEvent(
            ctx.local_date(row.created_at),
            row.kind.value,
            row.amount,
            habit_id=habit_id,
            prize_claim_id=row.prize_claim_id,
        )
        for row, habit_id in rows
    ]
    in_range = [e for e in events if start <= e.date <= end]
    # Stable newest-first order: by date, then earnings before spends on the same day.
    return sorted(in_range, key=lambda e: e.date, reverse=True)

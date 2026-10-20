"""Daily and weekly streaks (REQ-016, REQ-017).

Both kinds are built the same way: a timeline of periods (days, or Monday-to-Sunday weeks) from the
first checked-in or saved period up to today, split into runs. Gems (REQ-018/019) and streak savers
(REQ-020) reuse these runs, so all three always agree.

An archived habit's streak is frozen: pass its archive date as `today`. Unarchiving starts it again
from that day: pass the date as `restart_on`, and no run carries over into it (REQ-009).
"""

from dataclasses import dataclass
from datetime import date
from enum import StrEnum

from app.domain.dates import ONE_WEEK, date_range, week_start
from app.domain.weekly_targets import TargetChange, target_for_week


class PeriodStatus(StrEnum):
    DONE = "done"  # a checked-in day, or a week that reached its target
    SAVED = "saved"  # covered by a streak saver: keeps the run going, adds nothing to it
    OPEN = "open"  # a past period with neither: the run before it has ended
    PENDING = "pending"  # today not checked in yet, or this week still in progress


@dataclass(frozen=True)
class Period:
    start: date  # the day, or the Monday of the week
    status: PeriodStatus
    completed_on: date | None = None  # the check-in day that made a DONE period done


@dataclass(frozen=True)
class Run:
    """An unbroken run of periods; only DONE periods count toward the streak."""

    periods: tuple[Period, ...]

    @property
    def start(self) -> date:
        return self.periods[0].start

    @property
    def end(self) -> date:
        return self.periods[-1].start

    @property
    def count(self) -> int:
        return sum(p.status is PeriodStatus.DONE for p in self.periods)

    @property
    def saved(self) -> int:
        return sum(p.status is PeriodStatus.SAVED for p in self.periods)


@dataclass(frozen=True)
class DailyHistory:
    done: frozenset[date]  # days with a check-in
    saved: frozenset[date] = frozenset()  # days covered by a streak saver
    restart_on: date | None = None  # last unarchive date: no run carries over into it


@dataclass(frozen=True)
class WeeklyHistory:
    done: frozenset[date]  # days with a check-in (a day counts once, REQ-011)
    targets: tuple[TargetChange, ...]  # WeeklyTarget rows, any order
    saved_weeks: frozenset[date] = frozenset()  # Mondays of weeks covered by a streak saver
    restart_on: date | None = None


type History = DailyHistory | WeeklyHistory


@dataclass(frozen=True)
class Streak:
    current: int
    best: int
    # The current run is alive but today (or this week) isn't done yet:
    # "Check in today to make it 4!" (REQ-016).
    pending: bool


def daily_timeline(history: DailyHistory, today: date) -> list[Period]:
    covered = {d for d in history.done | history.saved if d <= today}
    if not covered:
        return []
    periods = []
    for day in date_range(min(covered), today):
        if day in history.done:
            periods.append(Period(day, PeriodStatus.DONE, completed_on=day))
        elif day in history.saved:
            periods.append(Period(day, PeriodStatus.SAVED))
        elif day == today:
            periods.append(Period(day, PeriodStatus.PENDING))
        else:
            periods.append(Period(day, PeriodStatus.OPEN))
    return periods


def week_check_ins(history: WeeklyHistory, week: date, today: date) -> list[date]:
    """The check-in days of the week containing `week`, up to today, in order."""
    monday = week_start(week)
    return sorted(d for d in history.done if monday <= d < monday + ONE_WEEK and d <= today)


def weekly_timeline(history: WeeklyHistory, today: date) -> list[Period]:
    this_week = week_start(today)
    covered = {week_start(d) for d in history.done if d <= today}
    covered |= {w for w in history.saved_weeks if w <= this_week}
    if not covered:
        return []
    periods = []
    for monday in date_range(min(covered), this_week, ONE_WEEK):
        days = week_check_ins(history, monday, today)
        target = target_for_week(history.targets, monday)
        if len(days) >= target:
            periods.append(Period(monday, PeriodStatus.DONE, completed_on=days[target - 1]))
        elif monday in history.saved_weeks:
            periods.append(Period(monday, PeriodStatus.SAVED))
        elif monday == this_week:
            periods.append(Period(monday, PeriodStatus.PENDING))
        else:
            periods.append(Period(monday, PeriodStatus.OPEN))
    return periods


def timeline(history: History, today: date) -> list[Period]:
    if isinstance(history, DailyHistory):
        return daily_timeline(history, today)
    return weekly_timeline(history, today)


def restart_period(history: History) -> date | None:
    """The period that must start a new run, if the habit was unarchived."""
    if history.restart_on is None or isinstance(history, DailyHistory):
        return history.restart_on
    return week_start(history.restart_on)


def runs(history: History, today: date) -> list[Run]:
    """The unbroken runs, oldest first. An OPEN period or the restart period ends a run."""
    restart = restart_period(history)
    result: list[Run] = []
    current: list[Period] = []
    for period in timeline(history, today):
        if current and period.start == restart:
            result.append(Run(tuple(current)))
            current = []
        if period.status is PeriodStatus.OPEN:
            if current:
                result.append(Run(tuple(current)))
            current = []
        else:
            current.append(period)
    if current:
        result.append(Run(tuple(current)))
    return result


def streak(history: History, today: date) -> Streak:
    """Current and best streak (REQ-016, REQ-017).

    The current run ends today (or this week); while today is still pending, the run ending
    yesterday (or last week) is still alive.
    """
    periods = timeline(history, today)
    all_runs = runs(history, today)
    if not all_runs:
        return Streak(current=0, best=0, pending=False)
    last = periods[-1]
    latest = all_runs[-1]
    current = latest.count if latest.end == last.start else 0
    return Streak(
        current=current,
        best=max(run.count for run in all_runs),
        pending=current > 0 and last.status is PeriodStatus.PENDING,
    )

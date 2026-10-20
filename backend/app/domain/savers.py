"""Streak savers (REQ-020): which past periods can be saved, and what a saver costs.

A day can be saved when it is in the past, at most 7 family days ago, has no check-in or saver, and
directly follows a checked-in or saved day. For a weekly habit, only the most recent past week can
be saved, when it ended below target and directly follows a complete or saved week.

The 1st saver in an unbroken run costs 1 gem, the 2nd 2, and so on. A saver that joins two runs
counts the savers of both. A new run starts again at 1.
"""

from dataclasses import dataclass, replace
from datetime import date, timedelta

from app.domain.dates import ONE_DAY, ONE_WEEK, date_range, week_start
from app.domain.streaks import (
    DailyHistory,
    PeriodStatus,
    WeeklyHistory,
    restart_period,
    runs,
    weekly_timeline,
)

SAVER_WINDOW = timedelta(days=7)


@dataclass(frozen=True)
class SaveablePeriod:
    period_start: date  # the day, or the Monday of the week
    cost: int


def _cost(history: DailyHistory | WeeklyHistory, period: date, today: date) -> int:
    """Savers in the run `period` would join once saved, counting itself."""
    if isinstance(history, DailyHistory):
        saved_history = replace(history, saved=history.saved | {period})
    else:
        saved_history = replace(history, saved_weeks=history.saved_weeks | {period})
    run = next(r for r in runs(saved_history, today) if r.start <= period <= r.end)
    return run.saved


def _after_restart(history: DailyHistory | WeeklyHistory, period: date) -> bool:
    """A saver must continue a run, so it can't land on or before the unarchive period."""
    restart = restart_period(history)
    return restart is None or period > restart


def is_saveable_day(history: DailyHistory, day: date, today: date) -> bool:
    covered = history.done | history.saved
    return (
        today - SAVER_WINDOW <= day < today
        and day not in covered
        and day - ONE_DAY in covered
        and _after_restart(history, day)
    )


def daily_saver_cost(history: DailyHistory, day: date, today: date) -> int:
    if not is_saveable_day(history, day, today):
        raise ValueError("that day can't be saved")
    return _cost(history, day, today)


def saveable_days(history: DailyHistory, today: date) -> list[SaveablePeriod]:
    """Every day a saver could be used on right now, oldest first, with its cost."""
    return [
        SaveablePeriod(day, _cost(history, day, today))
        for day in date_range(today - SAVER_WINDOW, today - ONE_DAY)
        if is_saveable_day(history, day, today)
    ]


def is_saveable_week(history: WeeklyHistory, week: date, today: date) -> bool:
    last_week = week_start(today) - ONE_WEEK
    if week != last_week or not _after_restart(history, last_week):
        return False
    status = {p.start: p.status for p in weekly_timeline(history, today)}
    return status.get(last_week) is PeriodStatus.OPEN and status.get(last_week - ONE_WEEK) in (
        PeriodStatus.DONE,
        PeriodStatus.SAVED,
    )


def weekly_saver_cost(history: WeeklyHistory, week: date, today: date) -> int:
    if not is_saveable_week(history, week, today):
        raise ValueError("that week can't be saved")
    return _cost(history, week, today)


def saveable_weeks(history: WeeklyHistory, today: date) -> list[SaveablePeriod]:
    """The most recent past week, if a saver could be used on it right now."""
    last_week = week_start(today) - ONE_WEEK
    if not is_saveable_week(history, last_week, today):
        return []
    return [SaveablePeriod(last_week, _cost(history, last_week, today))]


def saveable_periods(history: DailyHistory | WeeklyHistory, today: date) -> list[SaveablePeriod]:
    if isinstance(history, DailyHistory):
        return saveable_days(history, today)
    return saveable_weeks(history, today)

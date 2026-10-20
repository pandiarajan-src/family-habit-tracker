"""History day and week states (REQ-023, C13).

Days are "Done", "Saved" or "Not yet". A weekly habit's days are only "Done" or "Not yet"; its week
gets one state instead. Today is never "Saved", because savers cover past days only (REQ-020).
Days after today or before the habit existed have no state (the calendar shows them blank).
"""

from dataclasses import dataclass
from datetime import date
from enum import StrEnum

from app.domain.dates import week_start
from app.domain.streaks import DailyHistory, WeeklyHistory, week_check_ins
from app.domain.weekly_targets import target_for_week


class DayState(StrEnum):
    DONE = "done"
    SAVED = "saved"
    NOT_YET = "not_yet"


class WeekStateKind(StrEnum):
    COMPLETE = "complete"  # "Week complete — 3 of 3"
    SAVED = "saved"  # "Week saved"
    IN_PROGRESS = "in_progress"  # this week, below target so far: "In progress — 2 of 3"
    BELOW_TARGET = "below_target"  # a past week that ended below target, not saved
    COMING_UP = "coming_up"  # a future week


@dataclass(frozen=True)
class WeekState:
    kind: WeekStateKind
    done: int  # capped at the target: 5 check-ins against 3 shows as "3 of 3" (C13)
    target: int


def day_state(
    history: DailyHistory | WeeklyHistory,
    day: date,
    today: date,
    created_on: date | None = None,
) -> DayState | None:
    if day > today or (created_on is not None and day < created_on):
        return None
    if day in history.done:
        return DayState.DONE
    if isinstance(history, DailyHistory) and day in history.saved and day < today:
        return DayState.SAVED
    return DayState.NOT_YET


def week_state(
    history: WeeklyHistory,
    week: date,
    today: date,
    created_on: date | None = None,
) -> WeekState | None:
    monday = week_start(week)
    if created_on is not None and monday < week_start(created_on):
        return None
    target = target_for_week(history.targets, monday)
    if monday > today:
        return WeekState(WeekStateKind.COMING_UP, 0, target)
    done = len(week_check_ins(history, monday, today))
    if done >= target:
        kind = WeekStateKind.COMPLETE
    elif monday in history.saved_weeks:
        kind = WeekStateKind.SAVED
    elif monday == week_start(today):
        kind = WeekStateKind.IN_PROGRESS
    else:
        kind = WeekStateKind.BELOW_TARGET
    return WeekState(kind, min(done, target), target)

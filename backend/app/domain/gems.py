"""Earned gems (REQ-018, REQ-019), derived from check-ins and streak savers, never stored.

Each function returns dated events, so the same rules give the balance and the REQ-021 history.
Undo, yesterday check-ins, parent corrections and deletes just recompute them.
"""

from collections.abc import Iterable
from dataclasses import dataclass
from datetime import date
from enum import StrEnum

from app.domain.streaks import DailyHistory, PeriodStatus, WeeklyHistory, runs

DAILY_GEM = 1
DAILY_BONUS_CYCLE = 7
WEEKLY_GEM = 1
WEEKLY_BONUS_EVERY = 5  # weeks 5, 10, 15, ... (there is no 7-week bonus)
WEEKLY_BONUS = 5


class EarnKind(StrEnum):
    DAILY_CHECKIN = "daily_checkin"
    DAILY_BONUS_5 = "daily_bonus_5"
    DAILY_BONUS_7 = "daily_bonus_7"
    WEEKLY_GOAL = "weekly_goal"
    WEEKLY_BONUS_5 = "weekly_bonus_5"


# Streak day n earns +5 when n mod 7 = 5 and +7 when n mod 7 = 0: days 5, 7, 12, 14, 19, 21, ...
DAILY_BONUSES = {5: (EarnKind.DAILY_BONUS_5, 5), 0: (EarnKind.DAILY_BONUS_7, 7)}


@dataclass(frozen=True)
class EarnEvent:
    date: date  # the check-in day that earned it (for a week: the day it reached its target)
    kind: EarnKind
    amount: int


def daily_earnings(history: DailyHistory, today: date) -> list[EarnEvent]:
    """1 gem per checked-in day; streak bonuses on the 7-day cycle. Saved days earn nothing."""
    events = []
    for run in runs(history, today):
        n = 0
        for period in run.periods:
            if period.status is not PeriodStatus.DONE:
                continue
            n += 1
            events.append(EarnEvent(period.start, EarnKind.DAILY_CHECKIN, DAILY_GEM))
            bonus = DAILY_BONUSES.get(n % DAILY_BONUS_CYCLE)
            if bonus is not None:
                events.append(EarnEvent(period.start, *bonus))
    return events


def weekly_earnings(history: WeeklyHistory, today: date) -> list[EarnEvent]:
    """1 gem per complete week; +5 every 5 complete weeks in a run. Saved weeks earn nothing."""
    events = []
    for run in runs(history, today):
        n = 0
        for period in run.periods:
            if period.status is not PeriodStatus.DONE:
                continue
            n += 1
            completed_on = period.completed_on or period.start
            events.append(EarnEvent(completed_on, EarnKind.WEEKLY_GOAL, WEEKLY_GEM))
            if n % WEEKLY_BONUS_EVERY == 0:
                events.append(EarnEvent(completed_on, EarnKind.WEEKLY_BONUS_5, WEEKLY_BONUS))
    return events


def earnings(history: DailyHistory | WeeklyHistory, today: date) -> list[EarnEvent]:
    if isinstance(history, DailyHistory):
        return daily_earnings(history, today)
    return weekly_earnings(history, today)


def total(events: Iterable[EarnEvent]) -> int:
    return sum(event.amount for event in events)

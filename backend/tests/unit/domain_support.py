"""Shared dates for the domain-engine unit tests: today = Tue 20 Oct 2026 (Europe/London)."""

from datetime import date, timedelta

from app.domain.streaks import DailyHistory, WeeklyHistory
from app.domain.weekly_targets import TargetChange

TODAY = date(2026, 10, 20)  # a Tuesday
THIS_WEEK = date(2026, 10, 19)  # its Monday
LONG_AGO = date(2026, 1, 5)  # a Monday well before any test history


def d(offset: int) -> date:
    """A day relative to today: d(-1) is yesterday."""
    return TODAY + timedelta(days=offset)


def days(*offsets: int) -> frozenset[date]:
    return frozenset(d(o) for o in offsets)


def span(first: int, last: int) -> frozenset[date]:
    """Every day from d(first) to d(last) inclusive."""
    return days(*range(first, last + 1))


def week(offset: int) -> date:
    """The Monday `offset` weeks from this week: week(-1) is last Monday."""
    return THIS_WEEK + timedelta(weeks=offset)


def week_days_done(offset: int, count: int) -> frozenset[date]:
    """The first `count` days (Mon, Tue, ...) of a week, as check-ins."""
    monday = week(offset)
    return frozenset(monday + timedelta(days=i) for i in range(count))


def daily(done: frozenset[date], saved: frozenset[date] = frozenset(), **kw) -> DailyHistory:
    return DailyHistory(done=done, saved=saved, **kw)


def weekly(
    done: frozenset[date],
    target: int = 3,
    saved_weeks: frozenset[date] = frozenset(),
    targets: tuple[TargetChange, ...] | None = None,
    **kw,
) -> WeeklyHistory:
    return WeeklyHistory(
        done=done,
        targets=targets or (TargetChange(LONG_AGO, target),),
        saved_weeks=saved_weeks,
        **kw,
    )


def weeks_done(*offsets: int, per_week: int = 3) -> frozenset[date]:
    """Check-ins that complete each listed week at the given count."""
    result: frozenset[date] = frozenset()
    for offset in offsets:
        result |= week_days_done(offset, per_week)
    return result

"""Family days and weeks (REQ-017, REQ-027): Monday-to-Sunday weeks in the family's timezone."""

from collections.abc import Iterator
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

ONE_DAY = timedelta(days=1)
ONE_WEEK = timedelta(days=7)


def family_date(instant: datetime, timezone: str) -> date:
    """The family date of an instant: 23:59 local counts for that local date (REQ-027)."""
    if instant.tzinfo is None:
        raise ValueError("family_date needs a timezone-aware datetime")
    return instant.astimezone(ZoneInfo(timezone)).date()


def week_start(day: date) -> date:
    """The Monday of the ISO week that contains `day`."""
    return day - timedelta(days=day.weekday())


def week_days(day: date) -> list[date]:
    """Monday to Sunday of the week that contains `day`."""
    monday = week_start(day)
    return [monday + timedelta(days=i) for i in range(7)]


def date_range(start: date, end: date, step: timedelta = ONE_DAY) -> Iterator[date]:
    """`start` to `end` inclusive; empty when `end` is before `start`."""
    day = start
    while day <= end:
        yield day
        day += step

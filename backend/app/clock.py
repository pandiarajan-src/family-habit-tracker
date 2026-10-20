"""The only source of "now". Everything else asks a Clock, so tests can freeze or advance time."""

from datetime import UTC, date, datetime, timedelta
from typing import Protocol
from zoneinfo import ZoneInfo


class Clock(Protocol):
    def now(self) -> datetime:
        """Current time, timezone-aware, in UTC."""
        ...


class SystemClock:
    def now(self) -> datetime:
        return datetime.now(UTC)


class FrozenClock:
    """A clock that only moves when told to (tests)."""

    def __init__(self, now: datetime) -> None:
        if now.tzinfo is None:
            raise ValueError("FrozenClock needs a timezone-aware datetime")
        self._now = now.astimezone(UTC)

    def now(self) -> datetime:
        return self._now

    def advance(self, delta: timedelta) -> None:
        self._now += delta


def family_today(clock: Clock, timezone: str) -> date:
    """Today's date in the family's timezone (REQ-027)."""
    return clock.now().astimezone(ZoneInfo(timezone)).date()

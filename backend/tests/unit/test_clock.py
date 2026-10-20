"""REQ-027 (unit): family dates across midnight and daylight-saving changes."""

from datetime import UTC, date, datetime, timedelta

import pytest

from app.clock import FrozenClock, SystemClock, family_today

pytestmark = pytest.mark.req("REQ-027")

LONDON = "Europe/London"


def _today(utc: datetime, timezone: str = LONDON) -> date:
    return family_today(FrozenClock(utc), timezone)


@pytest.mark.parametrize(
    ("utc", "timezone", "expected"),
    [
        # 23:59 BST on Tue 20 Oct counts for the 20th, though UTC is still 22:59 (REQ-027).
        (datetime(2026, 10, 20, 22, 59, tzinfo=UTC), LONDON, date(2026, 10, 20)),
        # 00:30 BST on the 21st is already the 21st locally, though UTC is the 20th.
        (datetime(2026, 10, 20, 23, 30, tzinfo=UTC), LONDON, date(2026, 10, 21)),
        # Clocks go back on Sun 25 Oct 2026: 01:30 UTC is 01:30 GMT, the 25th.
        (datetime(2026, 10, 25, 1, 30, tzinfo=UTC), LONDON, date(2026, 10, 25)),
        # The hour before the change: 23:30 UTC on the 24th is 00:30 BST on the 25th.
        (datetime(2026, 10, 24, 23, 30, tzinfo=UTC), LONDON, date(2026, 10, 25)),
        # Clocks go forward on Sun 29 Mar 2026; just before midnight GMT it's still the 28th.
        (datetime(2026, 3, 28, 23, 59, tzinfo=UTC), LONDON, date(2026, 3, 28)),
        (datetime(2026, 3, 29, 1, 30, tzinfo=UTC), LONDON, date(2026, 3, 29)),
        # Another zone: 19:00 UTC is 00:30 IST the next day.
        (datetime(2026, 10, 20, 19, 0, tzinfo=UTC), "Asia/Kolkata", date(2026, 10, 21)),
    ],
)
def test_req_027_family_today_uses_the_family_timezone(
    utc: datetime, timezone: str, expected: date
) -> None:
    assert _today(utc, timezone) == expected


def test_req_027_frozen_clock_moves_only_when_advanced() -> None:
    clock = FrozenClock(datetime(2026, 10, 20, 8, 0, tzinfo=UTC))
    assert clock.now() == clock.now()

    clock.advance(timedelta(minutes=5))

    assert clock.now() == datetime(2026, 10, 20, 8, 5, tzinfo=UTC)


def test_req_027_frozen_clock_rejects_naive_datetimes() -> None:
    with pytest.raises(ValueError, match="timezone-aware"):
        FrozenClock(datetime(2026, 10, 20, 8, 0))  # noqa: DTZ001  (the point of the test)


def test_req_027_system_clock_is_aware_utc() -> None:
    assert SystemClock().now().utcoffset() == timedelta(0)

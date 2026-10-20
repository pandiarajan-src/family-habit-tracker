"""REQ-017 / REQ-027 (unit): family dates and Monday-to-Sunday weeks."""

from datetime import UTC, date, datetime, timedelta

import pytest

from app.domain.dates import date_range, family_date, week_days, week_start

LONDON = "Europe/London"


@pytest.mark.req("REQ-017")
@pytest.mark.parametrize("day", [date(2026, 10, 19) + timedelta(days=i) for i in range(7)])
def test_req_017_weeks_start_on_monday(day: date) -> None:
    assert week_start(day) == date(2026, 10, 19)


@pytest.mark.req("REQ-017")
def test_req_017_week_days_run_monday_to_sunday() -> None:
    assert week_days(date(2026, 10, 22)) == [
        date(2026, 10, 19) + timedelta(days=i) for i in range(7)
    ]


@pytest.mark.req("REQ-017")
@pytest.mark.parametrize(
    ("utc", "expected_day", "expected_week"),
    [
        # Sun 18 Oct 23:30 BST is 22:30 UTC: still Sunday, so the week that began Mon 12 Oct.
        (datetime(2026, 10, 18, 22, 30, tzinfo=UTC), date(2026, 10, 18), date(2026, 10, 12)),
        # Mon 19 Oct 00:00 BST is 23:00 UTC on Sunday: already the new week locally.
        (datetime(2026, 10, 18, 23, 0, tzinfo=UTC), date(2026, 10, 19), date(2026, 10, 19)),
        # After the clocks go back (GMT = UTC): Sun 25 Oct 23:30 and Mon 26 Oct 00:00.
        (datetime(2026, 10, 25, 23, 30, tzinfo=UTC), date(2026, 10, 25), date(2026, 10, 19)),
        (datetime(2026, 10, 26, 0, 0, tzinfo=UTC), date(2026, 10, 26), date(2026, 10, 26)),
    ],
)
def test_req_017_sunday_2330_and_monday_0000_fall_in_different_family_weeks(
    utc: datetime, expected_day: date, expected_week: date
) -> None:
    day = family_date(utc, LONDON)

    assert day == expected_day
    assert week_start(day) == expected_week


@pytest.mark.req("REQ-027")
def test_req_027_family_date_uses_the_local_date_not_utc() -> None:
    # 23:59 BST on Tue 20 Oct is 22:59 UTC; 00:30 IST on the 21st is 19:00 UTC on the 20th.
    assert family_date(datetime(2026, 10, 20, 22, 59, tzinfo=UTC), LONDON) == date(2026, 10, 20)
    assert family_date(datetime(2026, 10, 20, 19, 0, tzinfo=UTC), "Asia/Kolkata") == date(
        2026, 10, 21
    )


@pytest.mark.req("REQ-027")
def test_req_027_family_date_rejects_naive_datetimes() -> None:
    with pytest.raises(ValueError, match="timezone-aware"):
        family_date(datetime(2026, 10, 20, 9, 0), LONDON)  # noqa: DTZ001  (the point of the test)


@pytest.mark.req("REQ-017")
def test_req_017_date_range_is_inclusive_and_can_step_by_weeks() -> None:
    assert list(date_range(date(2026, 10, 19), date(2026, 10, 21))) == [
        date(2026, 10, 19),
        date(2026, 10, 20),
        date(2026, 10, 21),
    ]
    assert list(date_range(date(2026, 10, 5), date(2026, 10, 19), timedelta(weeks=1))) == [
        date(2026, 10, 5),
        date(2026, 10, 12),
        date(2026, 10, 19),
    ]
    assert list(date_range(date(2026, 10, 20), date(2026, 10, 19))) == []

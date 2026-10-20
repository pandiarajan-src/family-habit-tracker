"""REQ-018 / REQ-019 (unit): earned gems are derived from check-ins and savers."""

from datetime import timedelta

import pytest

from app.domain.gems import EarnEvent, EarnKind, daily_earnings, earnings, total, weekly_earnings
from tests.unit.domain_support import (
    TODAY,
    d,
    daily,
    days,
    span,
    week,
    week_days_done,
    weekly,
    weeks_done,
)

# ---- REQ-018: daily gems ------------------------------------------------------------------


def _earned_on_streak_day(n: int) -> int:
    """Gems earned on day n of a run that started n - 1 days ago and ends today."""
    events = daily_earnings(daily(span(-(n - 1), 0)), TODAY)
    return total(e for e in events if e.date == TODAY)


@pytest.mark.req("REQ-018")
@pytest.mark.parametrize(
    ("n", "expected"),
    [
        (1, 1),
        (2, 1),
        (4, 1),
        (5, 1 + 5),  # n mod 7 = 5
        (6, 1),
        (7, 1 + 7),  # n mod 7 = 0
        (8, 1),
        (11, 1),
        (12, 1 + 5),
        (13, 1),
        (14, 1 + 7),
        (19, 1 + 5),
        (21, 1 + 7),
        (26, 1 + 5),
        (28, 1 + 7),
        (29, 1),
        (30, 1),
    ],
)
def test_req_018_gems_for_streak_day_n(n: int, expected: int) -> None:
    assert _earned_on_streak_day(n) == expected


@pytest.mark.req("REQ-018")
@pytest.mark.parametrize(
    ("length", "expected"),
    [
        (4, 4),
        (5, 10),
        (7, 19),  # spec: "a 7-day streak has earned 7 + 5 + 7 = 19 gems"
        (14, 38),
        (30, 30 + 4 * 5 + 4 * 7),  # bonuses on days 5, 12, 19, 26 and 7, 14, 21, 28
    ],
)
def test_req_018_total_gems_for_a_run(length: int, expected: int) -> None:
    assert total(daily_earnings(daily(span(-(length - 1), 0)), TODAY)) == expected


@pytest.mark.req("REQ-018")
def test_req_018_gems_are_per_habit_so_three_habits_today_earn_three() -> None:
    habits = [daily(days(0)), daily(days(0)), daily(days(0))]

    assert sum(total(daily_earnings(h, TODAY)) for h in habits) == 3


@pytest.mark.req("REQ-018")
def test_req_018_bonus_events_are_dated_and_labelled() -> None:
    events = daily_earnings(daily(span(-6, 0)), TODAY)

    assert [e for e in events if e.kind is not EarnKind.DAILY_CHECKIN] == [
        EarnEvent(d(-2), EarnKind.DAILY_BONUS_5, 5),
        EarnEvent(d(0), EarnKind.DAILY_BONUS_7, 7),
    ]


@pytest.mark.req("REQ-018")
def test_req_018_a_saved_day_earns_nothing_and_does_not_advance_the_count() -> None:
    # 4 days, a saved day, then the 5th checked-in day gets the +5 bonus.
    history = daily(span(-5, -2) | days(0), saved=days(-1))

    events = daily_earnings(history, TODAY)

    assert all(e.date != d(-1) for e in events)
    assert total(e for e in events if e.date == TODAY) == 1 + 5


@pytest.mark.req("REQ-018")
def test_req_018_a_backfill_that_joins_two_runs_recomputes_the_bonuses() -> None:
    before = daily(span(-9, -6) | span(-4, 0))  # runs of 4 and 5
    after = daily(span(-9, 0))  # a parent backfills d(-5): one run of 10

    assert total(daily_earnings(before, TODAY)) == 4 + (5 + 5)
    assert total(daily_earnings(after, TODAY)) == 10 + 5 + 7


@pytest.mark.req("REQ-018")
def test_req_018_undo_takes_back_the_gem_and_any_bonus_it_earned() -> None:
    with_today = daily(span(-4, 0))
    undone = daily(span(-4, -1))

    assert total(daily_earnings(with_today, TODAY)) == 10
    assert total(daily_earnings(undone, TODAY)) == 4


@pytest.mark.req("REQ-018")
def test_req_018_a_new_run_starts_the_bonus_cycle_again() -> None:
    history = daily(span(-12, -8) | span(-4, 0))  # two runs of 5, each with a +5

    assert total(daily_earnings(history, TODAY)) == 2 * (5 + 5)


# ---- REQ-019: weekly gems -----------------------------------------------------------------


@pytest.mark.req("REQ-019")
@pytest.mark.parametrize(
    ("weeks", "expected"),
    [
        (1, 1),
        (4, 4),
        (5, 5 + 5),
        (7, 7 + 5),  # no 7-week bonus
        (10, 10 + 10),
        (15, 15 + 15),
    ],
)
def test_req_019_one_gem_per_complete_week_and_five_every_five_weeks(
    weeks: int, expected: int
) -> None:
    history = weekly(weeks_done(*range(-weeks, 0)))

    assert total(weekly_earnings(history, TODAY)) == expected


@pytest.mark.req("REQ-019")
def test_req_019_bonuses_land_at_weeks_5_10_and_15() -> None:
    history = weekly(weeks_done(*range(-15, 0)))

    bonus_weeks = [
        e.date for e in weekly_earnings(history, TODAY) if e.kind is EarnKind.WEEKLY_BONUS_5
    ]

    # Dated on the day each week reached its target (its Wednesday, the 3rd check-in).
    assert bonus_weeks == [week(w) + timedelta(days=2) for w in (-11, -6, -1)]


@pytest.mark.req("REQ-019")
def test_req_019_a_week_still_in_progress_earns_nothing_yet() -> None:
    history = weekly(weeks_done(-1) | week_days_done(0, 2))

    assert total(weekly_earnings(history, TODAY)) == 1


@pytest.mark.req("REQ-019")
def test_req_019_a_week_dropping_below_target_loses_its_gem_and_bonus() -> None:
    complete = weeks_done(-5, -4, -3, -2, -1)
    last_week_undone = complete - {week(-1)}  # week -1 down to 2 of 3
    middle_undone = complete - {week(-3)}  # splits into two runs of 2

    assert total(weekly_earnings(weekly(complete), TODAY)) == 5 + 5
    assert total(weekly_earnings(weekly(last_week_undone), TODAY)) == 4
    assert total(weekly_earnings(weekly(middle_undone), TODAY)) == 4


@pytest.mark.req("REQ-019")
def test_req_019_a_saved_week_earns_nothing_but_keeps_the_bonus_count() -> None:
    history = weekly(
        weeks_done(-6, -5, -4, -3, -1), saved_weeks=frozenset({week(-2)})
    )  # 5 complete weeks in one run

    assert total(weekly_earnings(history, TODAY)) == 5 + 5


@pytest.mark.req("REQ-018")
def test_req_018_earnings_picks_the_rules_for_the_habit_frequency() -> None:
    assert total(earnings(daily(span(-4, 0)), TODAY)) == 10
    assert total(earnings(weekly(weeks_done(-1)), TODAY)) == 1

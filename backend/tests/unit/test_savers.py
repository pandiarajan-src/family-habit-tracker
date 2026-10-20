"""REQ-020 (unit): which periods a streak saver can cover, and its rising cost."""

import pytest

from app.domain.savers import (
    SaveablePeriod,
    daily_saver_cost,
    is_saveable_day,
    is_saveable_week,
    saveable_days,
    saveable_periods,
    saveable_weeks,
    weekly_saver_cost,
)
from app.domain.streaks import streak
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

pytestmark = pytest.mark.req("REQ-020")

# ---- daily habits -------------------------------------------------------------------------


def test_req_020_a_day_7_days_back_that_follows_a_checked_in_day_can_be_saved() -> None:
    history = daily(span(-15, -8))

    assert saveable_days(history, TODAY) == [SaveablePeriod(d(-7), 1)]


def test_req_020_a_day_8_days_back_is_outside_the_window() -> None:
    history = daily(span(-16, -9))

    assert not is_saveable_day(history, d(-8), TODAY)
    assert saveable_days(history, TODAY) == []


def test_req_020_today_can_never_be_saved() -> None:
    history = daily(days(-1))

    assert not is_saveable_day(history, TODAY, TODAY)
    assert saveable_days(history, TODAY) == []


def test_req_020_a_future_day_can_never_be_saved() -> None:
    assert not is_saveable_day(daily(days(0)), d(1), TODAY)


@pytest.mark.parametrize(
    ("day", "expected"),
    [
        (-4, True),  # follows d(-5), checked in
        (-2, True),  # follows d(-3), checked in
        (-1, False),  # follows d(-2), which has neither: a gap, so the run already ended
        (-5, False),  # already checked in
        (-3, False),  # already checked in
    ],
)
def test_req_020_a_saved_day_must_directly_follow_a_checked_in_or_saved_day(
    day: int, expected: bool
) -> None:
    assert is_saveable_day(daily(days(-5, -3)), d(day), TODAY) is expected


def test_req_020_a_day_after_a_saved_day_can_be_saved_but_a_saved_day_cannot_again() -> None:
    history = daily(span(-6, -4), saved=days(-3))

    assert is_saveable_day(history, d(-2), TODAY)
    assert not is_saveable_day(history, d(-3), TODAY)


def test_req_020_cost_rises_1_2_3_within_one_run() -> None:
    history = daily(span(-8, -5))

    first = daily_saver_cost(history, d(-4), TODAY)
    history = daily(history.done, saved=history.saved | {d(-4)})
    second = daily_saver_cost(history, d(-3), TODAY)
    history = daily(history.done, saved=history.saved | {d(-3)})
    third = daily_saver_cost(history, d(-2), TODAY)

    assert (first, second, third) == (1, 2, 3)
    assert first + second == 3  # "two saved days cost 3 gems in total"


def test_req_020_cost_goes_back_to_1_when_a_new_run_starts() -> None:
    # The old run (with a saver) ended at the gap on d(-8), now outside the 7-day window.
    history = daily(days(-12, -11, -9) | span(-7, -2), saved=days(-10))

    assert saveable_days(history, TODAY) == [SaveablePeriod(d(-1), 1)]


def test_req_020_a_saver_that_joins_two_runs_counts_the_savers_of_both() -> None:
    history = daily(days(-6, -4, -2), saved=days(-5))

    assert daily_saver_cost(history, d(-3), TODAY) == 2


def test_req_020_saving_a_day_keeps_the_streak_alive_without_adding_to_it() -> None:
    history = daily(span(-5, -2))
    assert streak(history, TODAY).current == 0

    saved = daily(history.done, saved=days(-1))

    assert streak(saved, TODAY).current == 4


def test_req_020_asking_the_cost_of_an_unsaveable_day_is_an_error() -> None:
    with pytest.raises(ValueError, match="can't be saved"):
        daily_saver_cost(daily(days(-1)), TODAY, TODAY)


def test_req_020_unarchiving_starts_a_new_run_so_older_days_cannot_be_saved() -> None:
    history = daily(span(-4, -3) | days(-1), restart_on=d(-2))

    assert not is_saveable_day(history, d(-2), TODAY)  # the restart day itself
    assert is_saveable_day(daily(days(-2), restart_on=d(-2)), d(-1), TODAY)


# ---- weekly habits ------------------------------------------------------------------------


def test_req_020_last_week_below_target_after_a_complete_week_can_be_saved() -> None:
    history = weekly(weeks_done(-2) | week_days_done(-1, 1))

    assert saveable_weeks(history, TODAY) == [SaveablePeriod(week(-1), 1)]
    assert weekly_saver_cost(history, week(-1), TODAY) == 1


def test_req_020_a_complete_week_cannot_be_saved() -> None:
    assert saveable_weeks(weekly(weeks_done(-2, -1)), TODAY) == []


def test_req_020_only_the_most_recent_past_week_can_be_saved() -> None:
    history = weekly(weeks_done(-3) | week_days_done(-2, 1))

    assert not is_saveable_week(history, week(-2), TODAY)
    assert not is_saveable_week(history, week(0), TODAY)  # this week is still in progress


def test_req_020_a_week_must_follow_a_complete_or_saved_week() -> None:
    after_gap = weekly(weeks_done(-3) | week_days_done(-1, 1))
    first_week = weekly(week_days_done(-1, 2))

    assert saveable_weeks(after_gap, TODAY) == []
    assert saveable_weeks(first_week, TODAY) == []


def test_req_020_weekly_cost_rises_within_one_run() -> None:
    history = weekly(weeks_done(-3) | week_days_done(-1, 2), saved_weeks=frozenset({week(-2)}))

    assert saveable_weeks(history, TODAY) == [SaveablePeriod(week(-1), 2)]


def test_req_020_an_already_saved_week_cannot_be_saved_again() -> None:
    history = weekly(weeks_done(-2), saved_weeks=frozenset({week(-1)}))

    assert saveable_weeks(history, TODAY) == []
    with pytest.raises(ValueError, match="can't be saved"):
        weekly_saver_cost(history, week(-1), TODAY)


def test_req_020_unarchiving_a_weekly_habit_last_week_blocks_saving_that_week() -> None:
    history = weekly(weeks_done(-2) | week_days_done(-1, 1), restart_on=d(-7))

    assert saveable_weeks(history, TODAY) == []


def test_req_020_saveable_periods_picks_days_or_weeks_by_frequency() -> None:
    assert saveable_periods(daily(days(-2)), TODAY) == [SaveablePeriod(d(-1), 1)]
    assert saveable_periods(weekly(weeks_done(-2)), TODAY) == [SaveablePeriod(week(-1), 1)]

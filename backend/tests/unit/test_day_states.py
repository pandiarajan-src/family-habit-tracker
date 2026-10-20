"""REQ-023 / REQ-017 (unit): History day states and weekly-habit week states (C13)."""

from datetime import date

import pytest

from app.domain.day_states import DayState, WeekState, WeekStateKind, day_state, week_state
from app.domain.weekly_targets import TargetChange
from tests.unit.domain_support import (
    TODAY,
    d,
    daily,
    days,
    week,
    week_days_done,
    weekly,
    weeks_done,
)

DAILY = daily(days(-3, -1), saved=days(-2))


@pytest.mark.req("REQ-023")
@pytest.mark.parametrize(
    ("day", "expected"),
    [
        (d(-3), DayState.DONE),
        (d(-2), DayState.SAVED),
        (d(-1), DayState.DONE),
        (d(-4), DayState.NOT_YET),
        (TODAY, DayState.NOT_YET),  # today not checked in yet
        (d(1), None),  # coming up: no state
    ],
)
def test_req_023_daily_day_states(day: date, expected: DayState | None) -> None:
    assert day_state(DAILY, day, TODAY) == expected


@pytest.mark.req("REQ-023")
def test_req_023_today_is_never_saved() -> None:
    history = daily(days(-1), saved=days(0))  # shouldn't exist, but must not show as Saved

    assert day_state(history, TODAY, TODAY) is DayState.NOT_YET


@pytest.mark.req("REQ-023")
def test_req_023_days_before_the_habit_existed_have_no_state() -> None:
    assert day_state(DAILY, d(-10), TODAY, created_on=d(-5)) is None
    assert day_state(DAILY, d(-5), TODAY, created_on=d(-5)) is DayState.NOT_YET


@pytest.mark.req("REQ-023")
def test_req_023_weekly_days_are_only_done_or_not_yet() -> None:
    history = weekly(week_days_done(-1, 1), saved_weeks=frozenset({week(-1)}))

    assert day_state(history, week(-1), TODAY) is DayState.DONE
    assert {day_state(history, d(o), TODAY) for o in range(-7, -1)} == {DayState.NOT_YET}


@pytest.mark.req("REQ-023")
@pytest.mark.parametrize(
    ("history", "monday", "expected"),
    [
        # "Week complete — 3 of 3"
        (weekly(weeks_done(-1)), week(-1), WeekState(WeekStateKind.COMPLETE, 3, 3)),
        # 5 of 3 shows as "Week complete — 3 of 3", not "5 of 3" (C13).
        (weekly(week_days_done(-1, 5)), week(-1), WeekState(WeekStateKind.COMPLETE, 3, 3)),
        # "Week saved"
        (
            weekly(week_days_done(-1, 1), saved_weeks=frozenset({week(-1)})),
            week(-1),
            WeekState(WeekStateKind.SAVED, 1, 3),
        ),
        # "In progress — 2 of 3" for this week.
        (weekly(week_days_done(0, 2)), week(0), WeekState(WeekStateKind.IN_PROGRESS, 2, 3)),
        (weekly(frozenset()), TODAY, WeekState(WeekStateKind.IN_PROGRESS, 0, 3)),
        # A past week below target that wasn't saved.
        (weekly(week_days_done(-2, 1)), week(-2), WeekState(WeekStateKind.BELOW_TARGET, 1, 3)),
        # "Coming up"
        (weekly(frozenset()), week(1), WeekState(WeekStateKind.COMING_UP, 0, 3)),
    ],
)
def test_req_023_week_states(history, monday: date, expected: WeekState) -> None:
    assert week_state(history, monday, TODAY) == expected


@pytest.mark.req("REQ-017")
def test_req_017_week_state_uses_the_target_that_week_had() -> None:
    targets = (TargetChange(week(-4), 3), TargetChange(week(0), 1))
    history = weekly(week_days_done(-1, 2) | week_days_done(0, 1), targets=targets)

    assert week_state(history, week(-1), TODAY).kind is WeekStateKind.BELOW_TARGET
    assert week_state(history, week(0), TODAY) == WeekState(WeekStateKind.COMPLETE, 1, 1)


@pytest.mark.req("REQ-023")
def test_req_023_a_complete_week_shows_complete_even_if_it_was_saved() -> None:
    history = weekly(weeks_done(-1), saved_weeks=frozenset({week(-1)}))

    assert week_state(history, week(-1), TODAY).kind is WeekStateKind.COMPLETE


@pytest.mark.req("REQ-023")
def test_req_023_weeks_before_the_habit_existed_have_no_state() -> None:
    history = weekly(frozenset())

    assert week_state(history, week(-2), TODAY, created_on=d(-6)) is None
    assert week_state(history, week(-1), TODAY, created_on=d(-6)) is not None

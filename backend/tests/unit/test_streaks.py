"""REQ-016 / REQ-017 / REQ-009 (unit): daily and weekly streaks."""

from datetime import UTC, datetime

import pytest

from app.domain.dates import family_date
from app.domain.streaks import PeriodStatus, Streak, runs, streak, weekly_timeline
from app.domain.weekly_targets import TargetChange
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

# ---- REQ-016: daily streaks ---------------------------------------------------------------


@pytest.mark.req("REQ-016")
@pytest.mark.parametrize(
    ("done", "saved", "expected"),
    [
        # No history at all.
        (frozenset(), frozenset(), Streak(current=0, best=0, pending=False)),
        # A run ending today: 4 days.
        (span(-3, 0), frozenset(), Streak(current=4, best=4, pending=False)),
        # Today not checked in yet: yesterday's 3 is still alive ("Check in today to make it 4!").
        (span(-3, -1), frozenset(), Streak(current=3, best=3, pending=True)),
        # A saved day bridges the run but doesn't add to it: 4 checked-in days, 1 saved.
        (span(-5, -4) | span(-2, -1), days(-3), Streak(current=4, best=4, pending=True)),
        # Nothing on the day before yesterday or yesterday: the run has ended.
        (span(-5, -3), frozenset(), Streak(current=0, best=3, pending=False)),
        # A gap before yesterday ends the old run; the new one starts after it.
        (span(-6, -3) | days(-1), frozenset(), Streak(current=1, best=4, pending=True)),
        (span(-6, -3) | span(-1, 0), frozenset(), Streak(current=2, best=4, pending=False)),
        # Only today.
        (days(0), frozenset(), Streak(current=1, best=1, pending=False)),
    ],
)
def test_req_016_daily_streak(done: frozenset, saved: frozenset, expected: Streak) -> None:
    assert streak(daily(done, saved), TODAY) == expected


@pytest.mark.req("REQ-016")
def test_req_016_best_streak_is_the_longest_run_ever() -> None:
    history = daily(span(-30, -21) | span(-10, -8) | span(-1, 0))  # runs of 10, 3, 2

    assert streak(history, TODAY) == Streak(current=2, best=10, pending=False)


@pytest.mark.req("REQ-016")
def test_req_016_saved_days_never_count_toward_best_either() -> None:
    history = daily(span(-10, -9) | span(-7, -6), saved=days(-8))

    assert streak(history, TODAY).best == 4


@pytest.mark.req("REQ-016")
def test_req_016_check_ins_after_today_are_ignored() -> None:
    assert streak(daily(days(-1, 1, 2)), TODAY) == Streak(current=1, best=1, pending=True)


@pytest.mark.req("REQ-016")
def test_req_016_a_saved_day_on_its_own_keeps_nothing_alive() -> None:
    # A parent removed the check-in before a saved day: the saver still bridges, but counts 0.
    assert streak(daily(frozenset(), saved=days(-1)), TODAY) == Streak(0, 0, pending=False)


@pytest.mark.req("REQ-016")
def test_req_016_runs_split_on_gaps_and_report_their_counts() -> None:
    history = daily(span(-8, -6) | days(-4) | span(-2, 0), saved=days(-3))

    result = [(r.start, r.end, r.count, r.saved) for r in runs(history, TODAY)]

    assert result == [(d(-8), d(-6), 3, 0), (d(-4), d(0), 4, 1)]


# ---- REQ-009: archive freezes, unarchive restarts --------------------------------------


@pytest.mark.req("REQ-009")
def test_req_009_an_archived_habit_keeps_the_streak_it_had_on_the_archive_date() -> None:
    history = daily(span(-10, -6))  # archived on d(-6)

    assert streak(history, d(-6)) == Streak(current=5, best=5, pending=False)


@pytest.mark.req("REQ-009")
def test_req_009_unarchiving_starts_the_streak_again_from_that_day() -> None:
    history = daily(span(-4, 0), restart_on=d(-1))

    assert streak(history, TODAY) == Streak(current=2, best=3, pending=False)


@pytest.mark.req("REQ-009")
def test_req_009_unarchiving_a_weekly_habit_starts_from_that_week() -> None:
    # Sunday of last week; target 2, since only Mon and Tue of this week have happened.
    history = weekly(weeks_done(-3, -2, -1, 0, per_week=2), target=2, restart_on=d(-2))

    assert streak(history, TODAY) == Streak(current=2, best=2, pending=False)


# ---- REQ-017: weekly streaks --------------------------------------------------------------


@pytest.mark.req("REQ-017")
@pytest.mark.parametrize(
    ("done", "saved_weeks", "expected"),
    [
        (frozenset(), frozenset(), Streak(0, 0, pending=False)),
        # 3 complete weeks; this week in progress (1 of 3) doesn't break the run.
        (weeks_done(-3, -2, -1) | week_days_done(0, 1), frozenset(), Streak(3, 3, pending=True)),
        # Last week ended below target and wasn't saved: the run has ended.
        (weeks_done(-3, -2) | week_days_done(-1, 2), frozenset(), Streak(0, 2, pending=False)),
        # A saved week bridges the run without counting.
        (weeks_done(-3, -1), frozenset({week(-2)}), Streak(2, 2, pending=True)),
        # 5 check-ins against a target of 3 is one complete week, not more.
        (week_days_done(-1, 5), frozenset(), Streak(1, 1, pending=True)),
    ],
)
def test_req_017_weekly_streak(done: frozenset, saved_weeks: frozenset, expected: Streak) -> None:
    assert streak(weekly(done, saved_weeks=saved_weeks), TODAY) == expected


@pytest.mark.req("REQ-017")
def test_req_017_this_week_counts_as_soon_as_it_reaches_its_target() -> None:
    # Target 2: Mon and Tue of this week are the only days so far.
    done = weeks_done(-3, -2, -1, 0, per_week=2)

    assert streak(weekly(done, target=2), TODAY) == Streak(4, 4, pending=False)


@pytest.mark.req("REQ-017")
def test_req_017_a_complete_week_after_one_below_target_starts_a_new_run() -> None:
    done = weeks_done(-3, -2, 0, per_week=2) | week_days_done(-1, 1)

    assert streak(weekly(done, target=2), TODAY) == Streak(1, 2, pending=False)


@pytest.mark.req("REQ-017")
def test_req_017_a_lowered_target_applies_from_its_week_only() -> None:
    targets = (TargetChange(week(-5), 3), TargetChange(week(-1), 2))
    # Week -2 had 2 check-ins under the old target of 3: below target, so the run ended there.
    done = weeks_done(-4, -3) | week_days_done(-2, 2) | week_days_done(-1, 2)

    assert streak(weekly(done, targets=targets), TODAY) == Streak(1, 2, pending=True)


@pytest.mark.req("REQ-017")
def test_req_017_a_raised_target_makes_this_week_in_progress() -> None:
    targets = (TargetChange(week(-5), 2), TargetChange(week(0), 4))
    done = weeks_done(-2, -1, per_week=2) | week_days_done(0, 2)  # 2 of 4 so far

    assert streak(weekly(done, targets=targets), TODAY) == Streak(2, 2, pending=True)


@pytest.mark.req("REQ-017")
def test_req_017_sunday_2330_counts_for_last_week_and_monday_0000_for_this_week() -> None:
    sunday_late = family_date(datetime(2026, 10, 18, 22, 30, tzinfo=UTC), "Europe/London")
    monday_midnight = family_date(datetime(2026, 10, 18, 23, 0, tzinfo=UTC), "Europe/London")
    history = weekly(frozenset({sunday_late, monday_midnight}), target=1)

    statuses = [(p.start, p.status) for p in weekly_timeline(history, TODAY)]

    assert statuses == [(week(-1), PeriodStatus.DONE), (week(0), PeriodStatus.DONE)]
    assert streak(history, TODAY) == Streak(2, 2, pending=False)


@pytest.mark.req("REQ-017")
def test_req_017_a_week_is_done_on_the_day_it_reaches_its_target() -> None:
    history = weekly(week_days_done(-1, 5), target=3)

    (period, _) = weekly_timeline(history, TODAY)

    assert period.completed_on == d(-6)  # the 3rd check-in: Wed 14 Oct

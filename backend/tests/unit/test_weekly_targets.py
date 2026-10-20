"""REQ-009 / REQ-008 (unit): weekly targets and the week they take effect from."""

from datetime import date

import pytest

from app.domain.weekly_targets import TargetChange, change_target, target_for_week
from tests.unit.domain_support import TODAY, week

pytestmark = pytest.mark.req("REQ-009")

HISTORY = (TargetChange(week(0), 2), TargetChange(week(-3), 3))  # deliberately unsorted


@pytest.mark.parametrize(
    ("day", "expected"),
    [
        (week(-3), 3),  # the week the first target starts
        (date(2026, 10, 18), 3),  # Sunday of last week keeps the old target
        (week(0), 2),  # Monday of this week has the new one
        (TODAY, 2),
        (week(4), 2),  # future weeks too
        (week(-10), 3),  # before the first row: the habit's first target
    ],
)
def test_req_009_target_for_week_uses_the_target_in_effect_that_week(
    day: date, expected: int
) -> None:
    assert target_for_week(HISTORY, day) == expected


def test_req_009_a_weekly_habit_needs_a_target() -> None:
    with pytest.raises(ValueError, match="at least one target"):
        target_for_week((), TODAY)


def test_req_009_a_new_target_counts_from_this_week_and_past_weeks_keep_theirs() -> None:
    changes = change_target((TargetChange(week(-3), 3),), 5, TODAY)

    assert changes == (TargetChange(week(-3), 3), TargetChange(week(0), 5))
    assert target_for_week(changes, week(-1)) == 3
    assert target_for_week(changes, TODAY) == 5


def test_req_009_a_second_change_in_the_same_week_replaces_the_first() -> None:
    changes = change_target(HISTORY, 4, TODAY)

    assert changes == (TargetChange(week(-3), 3), TargetChange(week(0), 4))


@pytest.mark.req("REQ-008")
@pytest.mark.parametrize("target", [0, 8, -1])
def test_req_008_targets_outside_1_to_7_are_rejected(target: int) -> None:
    with pytest.raises(ValueError, match="1-7"):
        TargetChange(week(0), target)


@pytest.mark.req("REQ-008")
@pytest.mark.parametrize("target", [1, 7])
def test_req_008_targets_1_and_7_are_allowed(target: int) -> None:
    assert TargetChange(week(0), target).target == target


def test_req_009_targets_start_on_a_monday() -> None:
    with pytest.raises(ValueError, match="Monday"):
        TargetChange(TODAY, 3)

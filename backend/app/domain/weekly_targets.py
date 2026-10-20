"""Weekly targets over time (REQ-009): a new target applies from the current family week onward."""

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date

from app.domain.dates import week_start

MIN_TARGET = 1
MAX_TARGET = 7


@dataclass(frozen=True)
class TargetChange:
    """One WeeklyTarget row: `target` check-in days a week from `effective_from_week` on."""

    effective_from_week: date
    target: int

    def __post_init__(self) -> None:
        if self.effective_from_week.weekday() != 0:
            raise ValueError("effective_from_week must be a Monday")
        if not MIN_TARGET <= self.target <= MAX_TARGET:
            raise ValueError(f"target must be {MIN_TARGET}-{MAX_TARGET}")


def target_for_week(changes: Sequence[TargetChange], day: date) -> int:
    """The target in effect for the week containing `day`.

    The habit's first target also covers anything before it (no check-ins can predate the habit).
    """
    if not changes:
        raise ValueError("a weekly habit needs at least one target")
    ordered = sorted(changes, key=lambda c: c.effective_from_week)
    monday = week_start(day)
    target = ordered[0].target
    for change in ordered:
        if change.effective_from_week > monday:
            break
        target = change.target
    return target


def change_target(
    changes: Sequence[TargetChange], target: int, today: date
) -> tuple[TargetChange, ...]:
    """The targets after setting `target` today: past weeks keep theirs (REQ-009).

    A second change in the same week replaces the first, since (habit, week) is unique.
    """
    monday = week_start(today)
    kept = [c for c in changes if c.effective_from_week != monday]
    return tuple(sorted([*kept, TargetChange(monday, target)], key=lambda c: c.effective_from_week))

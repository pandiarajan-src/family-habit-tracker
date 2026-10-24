from datetime import date
from typing import Self
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models import Frequency
from app.schemas.fields import GoalNote, Title
from app.services.habits import HabitView


class SaveablePeriodRead(BaseModel):
    period_start: date = Field(description="The day, or the Monday of the week, to save")
    cost: int


class WeekProgressRead(BaseModel):
    done: int = Field(description="Check-in days this family week (may exceed the target)")
    target: int
    complete: bool


class TargetChangeRead(BaseModel):
    effective_from_week: date = Field(description="The Monday this target counts from")
    target: int


class HabitRead(BaseModel):
    id: UUID
    member_id: UUID
    title: str
    goal_note: str | None
    frequency: Frequency
    weekly_target: int | None = Field(description="This week's target; null for daily habits")
    target_history: list[TargetChangeRead] = Field(
        description="Every target change, oldest first; past weeks keep theirs (REQ-017). "
        "Empty for daily habits"
    )
    created_on: date
    archived: bool
    archived_on: date | None = Field(
        description="The family date it was archived; History shows no state after it"
    )
    current_streak: int
    best_streak: int
    streak_pending: bool = Field(
        description="The streak is alive but today (or this week) isn't done yet (REQ-016)"
    )
    today_done: bool
    week_progress: WeekProgressRead | None = Field(description="Weekly habits only")
    next_saver_cost: int | None = Field(
        description="The cheapest saver available now, or null if nothing can be saved"
    )
    saveable_periods: list[SaveablePeriodRead]

    @classmethod
    def from_view(cls, v: HabitView) -> HabitRead:
        habit = v.habit
        progress = None
        if v.weekly_target is not None and v.week_done is not None:
            progress = WeekProgressRead(
                done=v.week_done, target=v.weekly_target, complete=v.week_done >= v.weekly_target
            )
        return cls(
            id=habit.id,
            member_id=habit.member_id,
            title=habit.title,
            goal_note=habit.goal_note,
            frequency=habit.frequency,
            weekly_target=v.weekly_target,
            target_history=[
                TargetChangeRead(effective_from_week=t.effective_from_week, target=t.target)
                for t in v.targets
            ],
            created_on=habit.created_on,
            archived=habit.archived_at is not None,
            archived_on=v.archived_on,
            current_streak=v.current_streak,
            best_streak=v.best_streak,
            streak_pending=v.streak_pending,
            today_done=v.today_done,
            week_progress=progress,
            next_saver_cost=min((p.cost for p in v.saveable), default=None),
            saveable_periods=[
                SaveablePeriodRead(period_start=p.period_start, cost=p.cost) for p in v.saveable
            ],
        )


class HabitCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    member_id: UUID
    title: Title
    goal_note: GoalNote | None = None
    frequency: Frequency
    weekly_target: int | None = Field(default=None, ge=1, le=7)

    @model_validator(mode="after")
    def _weekly_needs_a_target(self) -> Self:
        if self.frequency is Frequency.weekly and self.weekly_target is None:
            raise ValueError("a weekly habit needs a weekly_target of 1-7")
        if self.frequency is Frequency.daily and self.weekly_target is not None:
            raise ValueError("only weekly habits have a weekly_target")
        return self


class HabitUpdate(BaseModel):
    """Only the fields sent change; `goal_note: null` clears the note."""

    model_config = ConfigDict(extra="forbid")

    title: Title | None = None
    goal_note: GoalNote | None = None
    weekly_target: int | None = Field(default=None, ge=1, le=7)
    archived: bool | None = None

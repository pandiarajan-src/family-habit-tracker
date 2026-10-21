from datetime import date, datetime
from enum import StrEnum
from uuid import UUID, uuid4

import sqlalchemy as sa
from sqlmodel import Field, SQLModel

from app.db import UTCDateTime


class Frequency(StrEnum):
    daily = "daily"
    weekly = "weekly"


class Habit(SQLModel, table=True):
    """A member's habit. The title and goal note are never logged [child-data-privacy #2]."""

    __tablename__ = "habit"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    family_id: UUID = Field(foreign_key="family.id", ondelete="CASCADE", index=True)
    member_id: UUID = Field(foreign_key="member.id", ondelete="CASCADE", index=True)
    title: str = Field(max_length=40)
    goal_note: str | None = Field(default=None, max_length=60)
    frequency: Frequency = Field(
        sa_type=sa.Enum(Frequency, native_enum=False, create_constraint=True, length=6)
    )
    created_on: date  # family date; no check-ins before it (REQ-013)
    archived_at: datetime | None = Field(default=None, sa_type=UTCDateTime)
    # Last unarchive date: no streak run carries over into it (REQ-009, C20).
    restarted_on: date | None = None


class WeeklyTarget(SQLModel, table=True):
    """A weekly habit's target from a given week on; past weeks keep theirs (REQ-009)."""

    __tablename__ = "weekly_target"

    habit_id: UUID = Field(foreign_key="habit.id", ondelete="CASCADE", primary_key=True)
    effective_from_week: date = Field(primary_key=True)  # a Monday
    target: int = Field(ge=1, le=7)

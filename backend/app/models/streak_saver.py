from datetime import date, datetime
from uuid import UUID, uuid4

import sqlalchemy as sa
from sqlmodel import Field, SQLModel

from app.db import UTCDateTime


class StreakSaver(SQLModel, table=True):
    """A past day (or week) saved with gems so the streak carries on (REQ-020)."""

    __tablename__ = "streak_saver"
    __table_args__ = (sa.UniqueConstraint("habit_id", "period_start"),)

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    habit_id: UUID = Field(foreign_key="habit.id", ondelete="CASCADE")
    member_id: UUID = Field(foreign_key="member.id", ondelete="CASCADE", index=True)
    period_start: date  # the saved day, or the Monday of the saved week
    cost: int = Field(ge=1)
    created_by_member_id: UUID | None = Field(
        default=None, foreign_key="member.id", ondelete="SET NULL"
    )
    created_at: datetime = Field(sa_type=UTCDateTime)

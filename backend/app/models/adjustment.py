import datetime as dt
from datetime import datetime
from enum import StrEnum
from uuid import UUID, uuid4

import sqlalchemy as sa
from sqlmodel import Field, SQLModel

from app.db import UTCDateTime


class AdjustmentKind(StrEnum):
    habit_created = "habit_created"
    habit_updated = "habit_updated"
    habit_archived = "habit_archived"
    habit_deleted = "habit_deleted"
    check_in_added = "check_in_added"
    check_in_removed = "check_in_removed"
    streak_saver_used = "streak_saver_used"
    pin_reset = "pin_reset"


class Adjustment(SQLModel, table=True):
    """A parent's change to a child's data (REQ-015). IDs only: no nicknames or titles."""

    __tablename__ = "adjustment"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    family_id: UUID = Field(foreign_key="family.id", ondelete="CASCADE", index=True)
    target_member_id: UUID = Field(foreign_key="member.id", ondelete="CASCADE", index=True)
    actor_member_id: UUID | None = Field(default=None, foreign_key="member.id", ondelete="SET NULL")
    kind: AdjustmentKind = Field(
        sa_type=sa.Enum(AdjustmentKind, native_enum=False, create_constraint=True, length=17)
    )
    habit_id: UUID | None = Field(default=None, foreign_key="habit.id", ondelete="SET NULL")
    date: dt.date | None = None
    acknowledged_at: datetime | None = Field(default=None, sa_type=UTCDateTime)
    created_at: datetime = Field(sa_type=UTCDateTime)

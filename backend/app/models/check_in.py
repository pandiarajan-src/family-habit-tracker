import datetime as dt
from datetime import datetime
from uuid import UUID, uuid4

import sqlalchemy as sa
from sqlmodel import Field, SQLModel

from app.db import UTCDateTime


class CheckIn(SQLModel, table=True):
    """One habit done on one family day; (habit_id, date) is unique (REQ-012)."""

    __tablename__ = "check_in"
    __table_args__ = (sa.UniqueConstraint("habit_id", "date"),)

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    habit_id: UUID = Field(foreign_key="habit.id", ondelete="CASCADE")
    # Denormalised so deleting a member removes their check-ins directly [child-data-privacy #4].
    member_id: UUID = Field(foreign_key="member.id", ondelete="CASCADE", index=True)
    date: dt.date
    created_by_member_id: UUID | None = Field(
        default=None, foreign_key="member.id", ondelete="SET NULL"
    )
    created_at: datetime = Field(sa_type=UTCDateTime)

import datetime as dt
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models import CheckIn
from app.services.context import Ctx


class CheckInCreate(BaseModel):
    """No fields: the habit and the date are in the path."""

    model_config = ConfigDict(extra="forbid")


class CheckInRead(BaseModel):
    id: UUID
    habit_id: UUID
    member_id: UUID
    date: dt.date
    created_by_member_id: UUID | None = Field(description="Null once that member is removed")
    created_at: datetime = Field(description="In the family's timezone (ISO-8601 with offset)")

    @classmethod
    def from_row(cls, row: CheckIn, ctx: Ctx) -> CheckInRead:
        return cls(
            id=row.id,
            habit_id=row.habit_id,
            member_id=row.member_id,
            date=row.date,
            created_by_member_id=row.created_by_member_id,
            created_at=ctx.local(row.created_at),
        )

from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models import StreakSaver
from app.services.context import Ctx


class StreakSaverCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    period_start: date = Field(description="The day to save, or the Monday of the week")


class StreakSaverRead(BaseModel):
    id: UUID
    habit_id: UUID
    member_id: UUID
    period_start: date
    cost: int
    created_at: datetime = Field(description="In the family's timezone (ISO-8601 with offset)")

    @classmethod
    def from_row(cls, row: StreakSaver, ctx: Ctx) -> StreakSaverRead:
        return cls(
            id=row.id,
            habit_id=row.habit_id,
            member_id=row.member_id,
            period_start=row.period_start,
            cost=row.cost,
            created_at=ctx.local(row.created_at),
        )

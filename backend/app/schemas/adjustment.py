import datetime as dt
from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models import Adjustment, AdjustmentKind
from app.services.context import Ctx


class AdjustmentRead(BaseModel):
    """IDs only; the client joins nicknames and titles it already has (REQ-015)."""

    id: UUID
    kind: AdjustmentKind
    actor_member_id: UUID | None = Field(description="Null once that member is removed")
    target_member_id: UUID
    habit_id: UUID | None = Field(description="Null once the habit is deleted")
    date: dt.date | None = Field(description="The day that changed, for check-ins and savers")
    acknowledged_at: datetime | None
    created_at: datetime

    @classmethod
    def from_row(cls, row: Adjustment, ctx: Ctx) -> AdjustmentRead:
        return cls(
            id=row.id,
            kind=row.kind,
            actor_member_id=row.actor_member_id,
            target_member_id=row.target_member_id,
            habit_id=row.habit_id,
            date=row.date,
            acknowledged_at=ctx.local(row.acknowledged_at) if row.acknowledged_at else None,
            created_at=ctx.local(row.created_at),
        )


class AdjustmentUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    acknowledged: Literal[True]

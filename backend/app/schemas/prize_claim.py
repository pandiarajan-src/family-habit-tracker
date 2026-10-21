from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models import ClaimStatus, PrizeClaim
from app.services.context import Ctx


class PrizeClaimRead(BaseModel):
    id: UUID
    prize_id: UUID | None = Field(description="Null once the prize is deleted")
    prize_title: str = Field(description="As it was when the claim was made")
    gem_cost: int = Field(description="As it was when the claim was made")
    member_id: UUID
    status: ClaimStatus
    requested_at: datetime
    decided_at: datetime | None
    decided_by_member_id: UUID | None

    @classmethod
    def from_row(cls, row: PrizeClaim, ctx: Ctx) -> PrizeClaimRead:
        return cls(
            id=row.id,
            prize_id=row.prize_id,
            prize_title=row.prize_title,
            gem_cost=row.gem_cost,
            member_id=row.member_id,
            status=row.status,
            requested_at=ctx.local(row.requested_at),
            decided_at=ctx.local(row.decided_at) if row.decided_at else None,
            decided_by_member_id=row.decided_by_member_id,
        )


class PrizeClaimCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    prize_id: UUID


class PrizeClaimUpdate(BaseModel):
    """Parents approve or decline; the claimant cancels."""

    model_config = ConfigDict(extra="forbid")

    status: Literal["approved", "declined", "cancelled"]

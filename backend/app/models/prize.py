from datetime import datetime
from enum import StrEnum
from uuid import UUID, uuid4

import sqlalchemy as sa
from sqlmodel import Field, SQLModel

from app.db import UTCDateTime


class Prize(SQLModel, table=True):
    __tablename__ = "prize"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    family_id: UUID = Field(foreign_key="family.id", ondelete="CASCADE", index=True)
    title: str = Field(max_length=40)
    gem_cost: int = Field(ge=1, le=10_000)
    created_at: datetime = Field(sa_type=UTCDateTime)


class ClaimStatus(StrEnum):
    pending = "pending"
    approved = "approved"
    declined = "declined"
    cancelled = "cancelled"


class PrizeClaim(SQLModel, table=True):
    """A claim keeps the prize's title and cost from when it was made (REQ-024)."""

    __tablename__ = "prize_claim"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    # Not in spec §3, but every family-owned row carries it so lookups are family-scoped.
    family_id: UUID = Field(foreign_key="family.id", ondelete="CASCADE", index=True)
    prize_id: UUID | None = Field(default=None, foreign_key="prize.id", ondelete="SET NULL")
    prize_title: str = Field(max_length=40)
    gem_cost: int = Field(ge=1)
    member_id: UUID = Field(foreign_key="member.id", ondelete="CASCADE", index=True)
    status: ClaimStatus = Field(
        sa_type=sa.Enum(ClaimStatus, native_enum=False, create_constraint=True, length=9)
    )
    requested_at: datetime = Field(sa_type=UTCDateTime)
    decided_at: datetime | None = Field(default=None, sa_type=UTCDateTime)
    decided_by_member_id: UUID | None = Field(
        default=None, foreign_key="member.id", ondelete="SET NULL"
    )

from datetime import datetime
from enum import StrEnum
from uuid import UUID, uuid4

import sqlalchemy as sa
from sqlmodel import Field, SQLModel

from app.db import UTCDateTime


class GemTransactionKind(StrEnum):
    streak_saver = "streak_saver"
    prize_hold = "prize_hold"
    prize_release = "prize_release"
    correction_writeoff = "correction_writeoff"


class GemTransaction(SQLModel, table=True):
    """Spends, holds, releases and write-offs. Earned gems are derived, never stored (spec §3)."""

    __tablename__ = "gem_transaction"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    member_id: UUID = Field(foreign_key="member.id", ondelete="CASCADE", index=True)
    kind: GemTransactionKind = Field(
        sa_type=sa.Enum(GemTransactionKind, native_enum=False, create_constraint=True, length=19)
    )
    amount: int  # negative for a spend or hold; positive for a release or write-off
    # SET NULL, not CASCADE: deleting a habit deletes its savers, but spent gems stay spent
    # (REQ-009).
    streak_saver_id: UUID | None = Field(
        default=None, foreign_key="streak_saver.id", ondelete="SET NULL"
    )
    prize_claim_id: UUID | None = Field(
        default=None, foreign_key="prize_claim.id", ondelete="CASCADE"
    )
    created_at: datetime = Field(sa_type=UTCDateTime)

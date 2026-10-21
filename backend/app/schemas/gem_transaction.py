import datetime as dt
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

from app.services.balance import HistoryEvent

# Derived earnings (REQ-018/019) plus the stored ledger kinds (spec §3), confirmed for Phase 8.
GemEventKind = Literal[
    "daily_checkin",
    "daily_bonus_5",
    "daily_bonus_7",
    "weekly_goal",
    "weekly_bonus_5",
    "streak_saver",
    "prize_hold",
    "prize_release",
    "correction_writeoff",
]


class GemTransactionRead(BaseModel):
    kind: GemEventKind
    amount: int = Field(description="Positive for earnings, releases and write-offs")
    date: dt.date
    habit_id: UUID | None = None
    prize_claim_id: UUID | None = None

    @classmethod
    def from_event(cls, event: HistoryEvent) -> GemTransactionRead:
        return cls(
            kind=event.kind,  # type: ignore[arg-type]
            amount=event.amount,
            date=event.date,
            habit_id=event.habit_id,
            prize_claim_id=event.prize_claim_id,
        )

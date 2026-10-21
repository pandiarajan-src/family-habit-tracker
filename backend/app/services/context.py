"""Who is asking, for which family, and when: passed to every service call."""

from dataclasses import dataclass
from datetime import date, datetime
from uuid import UUID
from zoneinfo import ZoneInfo

from sqlmodel import Session

from app.domain.dates import family_date
from app.models import Member


@dataclass(frozen=True, slots=True)
class Ctx:
    db: Session
    family_id: UUID
    timezone: str
    now: datetime  # UTC, from the Clock
    actor: Member | None = None  # the acting member; None for family-session reads

    @property
    def today(self) -> date:
        """Today's family date (REQ-027)."""
        return family_date(self.now, self.timezone)

    def local(self, instant: datetime) -> datetime:
        """A stored UTC datetime in the family's timezone, for responses [api-conventions #5]."""
        return instant.astimezone(ZoneInfo(self.timezone))

    def local_date(self, instant: datetime) -> date:
        return family_date(instant, self.timezone)

    @property
    def acting(self) -> Member:
        """The acting member; routes that call this depend on `require_member`."""
        if self.actor is None:  # pragma: no cover - guarded by require_member
            raise RuntimeError("no acting member")
        return self.actor

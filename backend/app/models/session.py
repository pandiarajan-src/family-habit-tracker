from datetime import datetime
from uuid import UUID

from sqlmodel import Field, SQLModel

from app.db import UTCDateTime


class DeviceSession(SQLModel, table=True):
    """A device signed in with the family passcode (spec §3 "Session")."""

    __tablename__ = "session"

    # SHA-256 of the cookie value, so a database leak doesn't hand out live sessions.
    id: str = Field(primary_key=True, max_length=64)
    family_id: UUID = Field(foreign_key="family.id", ondelete="CASCADE", index=True)
    acting_member_id: UUID | None = Field(
        default=None, foreign_key="member.id", ondelete="SET NULL"
    )
    last_activity_at: datetime = Field(sa_type=UTCDateTime)
    acting_member_last_activity_at: datetime | None = Field(default=None, sa_type=UTCDateTime)
    expires_at: datetime = Field(sa_type=UTCDateTime)

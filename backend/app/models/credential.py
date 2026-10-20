from datetime import datetime
from uuid import UUID

from sqlmodel import Field, SQLModel

from app.db import UTCDateTime


class MemberCredential(SQLModel, table=True):
    """A member's hashed PIN and lockout state.

    Never returned by the API [child-data-privacy #1].
    """

    __tablename__ = "member_credential"

    member_id: UUID = Field(foreign_key="member.id", ondelete="CASCADE", primary_key=True)
    pin_hash: str
    failed_attempts: int = Field(default=0, ge=0)
    locked_until: datetime | None = Field(default=None, sa_type=UTCDateTime)

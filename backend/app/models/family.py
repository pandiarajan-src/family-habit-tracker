from datetime import datetime
from uuid import UUID, uuid4

from sqlmodel import Field, SQLModel

from app.db import UTCDateTime


class Family(SQLModel, table=True):
    __tablename__ = "family"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    timezone: str = Field(max_length=64)
    # argon2 hash; never returned by the API or logged.
    passcode_hash: str
    created_at: datetime = Field(sa_type=UTCDateTime)

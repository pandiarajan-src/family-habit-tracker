from datetime import datetime
from enum import StrEnum
from uuid import UUID, uuid4

import sqlalchemy as sa
from sqlmodel import Field, SQLModel

from app.db import UTCDateTime


class Role(StrEnum):
    parent = "parent"
    child = "child"


class Member(SQLModel, table=True):
    """Only nickname, avatar and role [child-data-privacy #1]. The PIN lives in MemberCredential."""

    __tablename__ = "member"
    __table_args__ = (sa.UniqueConstraint("family_id", "nickname"),)

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    family_id: UUID = Field(foreign_key="family.id", ondelete="CASCADE", index=True)
    nickname: str = Field(max_length=20)
    avatar_emoji: str = Field(max_length=16)
    role: Role = Field(sa_type=sa.Enum(Role, native_enum=False, create_constraint=True, length=6))
    created_at: datetime = Field(sa_type=UTCDateTime)

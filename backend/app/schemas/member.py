from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.domain.balance import Balance
from app.models import Member, Role
from app.schemas.fields import AvatarEmoji, Nickname, Pin


class MemberRead(BaseModel):
    """The only member fields the API returns [child-data-privacy #1]; never credential fields."""

    id: UUID
    nickname: str
    avatar_emoji: str
    role: Literal["parent", "child"]
    gem_balance: int = Field(description="Available gems, never below 0 (REQ-021)")
    gems_held: int = Field(description="Gems held by pending prize claims (REQ-021)")

    @classmethod
    def from_member(cls, member: Member, balance: Balance) -> MemberRead:
        return cls(
            id=member.id,
            nickname=member.nickname,
            avatar_emoji=member.avatar_emoji,
            role=member.role.value,
            gem_balance=balance.available,
            gems_held=balance.held,
        )


class MemberCreate(BaseModel):
    """Nickname, avatar, role and a first PIN only: any other field is a 422 [child-data-privacy
    #1]."""

    model_config = ConfigDict(extra="forbid")

    nickname: Nickname
    avatar_emoji: AvatarEmoji
    role: Role
    pin: Pin


class MemberUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    nickname: Nickname | None = None
    avatar_emoji: AvatarEmoji | None = None
    role: Role | None = Field(default=None, description="Only a parent can change a role")

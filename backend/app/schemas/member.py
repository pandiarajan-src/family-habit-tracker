from typing import Literal
from uuid import UUID

from pydantic import BaseModel

from app.models import Member


class MemberRead(BaseModel):
    """The only member fields the API returns [child-data-privacy #1]; never credential fields."""

    id: UUID
    nickname: str
    avatar_emoji: str
    role: Literal["parent", "child"]
    gem_balance: int
    gems_held: int

    @classmethod
    def from_member(cls, member: Member) -> MemberRead:
        # Gems are derived from check-ins and spends; the engine and those tables land in
        # Phases 2-3, so every balance is 0 until then.
        return cls(
            id=member.id,
            nickname=member.nickname,
            avatar_emoji=member.avatar_emoji,
            role=member.role.value,
            gem_balance=0,
            gems_held=0,
        )

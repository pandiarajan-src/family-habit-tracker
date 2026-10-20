from datetime import datetime
from typing import Self
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.schemas.member import MemberRead


class SessionCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    passcode: str = Field(min_length=1, max_length=128)


class SessionUpdate(BaseModel):
    """Choose who's checking in (with their PIN), or `acting_member_id: null` to switch person."""

    model_config = ConfigDict(extra="forbid")

    acting_member_id: UUID | None
    pin: str | None = Field(default=None, pattern=r"^[0-9]{4}$")

    @model_validator(mode="after")
    def _pin_needed_to_choose_a_member(self) -> Self:
        if self.acting_member_id is not None and self.pin is None:
            raise ValueError("pin is required to choose a member")
        return self


class SessionRead(BaseModel):
    family_id: UUID
    acting_member: MemberRead | None
    expires_at: datetime = Field(description="In the family's timezone (ISO-8601 with offset)")

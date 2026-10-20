from uuid import UUID
from zoneinfo import available_timezones

from pydantic import BaseModel, ConfigDict, field_validator


class FamilyRead(BaseModel):
    id: UUID
    timezone: str


class FamilyUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    timezone: str

    @field_validator("timezone")
    @classmethod
    def _must_be_iana_name(cls, value: str) -> str:
        if value not in available_timezones():
            raise ValueError("must be an IANA timezone name, e.g. Europe/London")
        return value

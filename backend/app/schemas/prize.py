from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models import Prize
from app.schemas.fields import Title


class PrizeRead(BaseModel):
    id: UUID
    title: str
    gem_cost: int

    @classmethod
    def from_row(cls, row: Prize) -> PrizeRead:
        return cls(id=row.id, title=row.title, gem_cost=row.gem_cost)


class PrizeCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: Title
    gem_cost: int = Field(ge=1, le=10_000)


class PrizeUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: Title | None = None
    gem_cost: int | None = Field(default=None, ge=1, le=10_000)

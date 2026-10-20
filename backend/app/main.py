"""FastAPI application factory."""

from typing import Literal

from fastapi import APIRouter, FastAPI, status
from pydantic import BaseModel

from app.config import Settings

API_PREFIX = "/api/v1"


class HealthRead(BaseModel):
    status: Literal["ok"]


health_router = APIRouter(tags=["health"])


@health_router.get(
    "/health",
    response_model=HealthRead,
    status_code=status.HTTP_200_OK,
    summary="Check that the API is up",
)
def read_health() -> HealthRead:
    return HealthRead(status="ok")


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings.from_env()
    app = FastAPI(title="Family Habit Tracker API", version="0.1.0")
    app.state.settings = settings
    app.include_router(health_router, prefix=API_PREFIX)
    return app


app = create_app()

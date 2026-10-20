"""FastAPI application factory."""

from datetime import timedelta
from typing import Literal

from fastapi import APIRouter, FastAPI, status
from pydantic import BaseModel

from app.clock import Clock, SystemClock
from app.config import Settings
from app.db import make_engine
from app.errors import install_error_handlers
from app.routers import families, sessions
from app.security.headers import install_security_headers
from app.security.log_redaction import install_log_redaction
from app.security.rate_limit import FailureWindow

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


def create_app(settings: Settings | None = None, clock: Clock | None = None) -> FastAPI:
    settings = settings or Settings.from_env()
    # Swagger UI/ReDoc pull assets from a CDN, so they're off in prod [child-data-privacy #5].
    docs = settings.app_env != "prod"
    app = FastAPI(
        title="Family Habit Tracker API",
        version="0.1.0",
        docs_url="/docs" if docs else None,
        redoc_url="/redoc" if docs else None,
    )
    app.state.settings = settings
    app.state.clock = clock or SystemClock()
    app.state.engine = make_engine(settings.database_url)
    app.state.passcode_limiter = FailureWindow(max_failures=10, window=timedelta(minutes=15))

    install_log_redaction(settings.log_level)
    install_error_handlers(app)
    install_security_headers(app)
    app.include_router(health_router, prefix=API_PREFIX)
    app.include_router(sessions.router, prefix=API_PREFIX)
    app.include_router(families.router, prefix=API_PREFIX)
    return app


app = create_app()

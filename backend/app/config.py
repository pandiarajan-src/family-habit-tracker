"""Settings read from environment variables (see `.env.example` at the repo root)."""

import os
from dataclasses import dataclass
from typing import Literal

type AppEnv = Literal["dev", "test", "e2e", "prod"]

_APP_ENVS: tuple[AppEnv, ...] = ("dev", "test", "e2e", "prod")


def _bool(value: str) -> bool:
    return value.strip().lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True, slots=True)
class Settings:
    app_env: AppEnv
    database_url: str
    cookie_secure: bool
    log_level: str

    @classmethod
    def from_env(cls) -> Settings:
        app_env = os.environ.get("APP_ENV", "dev")
        if app_env not in _APP_ENVS:
            raise ValueError(f"APP_ENV must be one of {_APP_ENVS}, got {app_env!r}")
        return cls(
            app_env=app_env,
            database_url=os.environ.get("DATABASE_URL", "sqlite:///./family_habit_tracker.db"),
            # Secure cookies are on in prod; off for http://localhost because WebKit drops them.
            cookie_secure=_bool(os.environ.get("COOKIE_SECURE", str(app_env == "prod"))),
            log_level=os.environ.get("LOG_LEVEL", "INFO"),
        )

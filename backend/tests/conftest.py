import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app


@pytest.fixture
def settings(tmp_path) -> Settings:
    return Settings(
        app_env="test",
        database_url=f"sqlite:///{tmp_path / 'test.db'}",
        cookie_secure=False,
        log_level="WARNING",
    )


@pytest.fixture
def client(settings: Settings) -> TestClient:
    with TestClient(create_app(settings)) as c:
        yield c

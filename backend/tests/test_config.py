import pytest

from app.config import Settings


def test_defaults_to_dev_with_insecure_cookie(monkeypatch: pytest.MonkeyPatch) -> None:
    for name in ("APP_ENV", "DATABASE_URL", "COOKIE_SECURE", "LOG_LEVEL"):
        monkeypatch.delenv(name, raising=False)

    settings = Settings.from_env()

    assert settings.app_env == "dev"
    assert settings.database_url.startswith("sqlite:///")
    assert settings.cookie_secure is False


def test_prod_turns_secure_cookie_on(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("APP_ENV", "prod")
    monkeypatch.delenv("COOKIE_SECURE", raising=False)

    assert Settings.from_env().cookie_secure is True


def test_rejects_unknown_app_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("APP_ENV", "staging")

    with pytest.raises(ValueError, match="APP_ENV"):
        Settings.from_env()

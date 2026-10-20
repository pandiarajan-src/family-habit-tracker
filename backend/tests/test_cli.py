"""Server-side setup commands: family creation is a CLI, not an HTTP endpoint (spec C7)."""

from collections.abc import Iterator

import pytest
from sqlalchemy import inspect
from sqlmodel import Session, select

from app import cli
from app.config import Settings
from app.db import make_engine
from app.models import Family, Member, MemberCredential, Role
from app.security.hashing import verify_secret


@pytest.fixture
def cli_env(settings: Settings, monkeypatch: pytest.MonkeyPatch) -> Settings:
    monkeypatch.setenv("APP_ENV", "dev")
    monkeypatch.setenv("DATABASE_URL", settings.database_url)
    return settings


@pytest.fixture
def db(cli_env: Settings) -> Iterator[Session]:
    engine = make_engine(cli_env.database_url)
    with Session(engine) as session:
        yield session
    engine.dispose()


def _answers(monkeypatch: pytest.MonkeyPatch, typed: list[str], secrets: list[str]) -> None:
    typed_iter, secret_iter = iter(typed), iter(secrets)
    monkeypatch.setattr("builtins.input", lambda _prompt="": next(typed_iter))
    monkeypatch.setattr(cli.getpass, "getpass", lambda _prompt="": next(secret_iter))


def test_cli_migrate_creates_the_tables(cli_env: Settings) -> None:
    cli.main(["migrate"])

    engine = make_engine(cli_env.database_url)
    tables = set(inspect(engine).get_table_names())
    engine.dispose()
    assert {"family", "member", "member_credential", "session"} <= tables


def test_cli_seed_dev_creates_the_sample_family_once(
    cli_env: Settings, db: Session, capsys: pytest.CaptureFixture[str]
) -> None:
    cli.main(["seed-dev"])
    cli.main(["seed-dev"])

    assert len(db.exec(select(Family)).all()) == 1
    members = {m.nickname: m for m in db.exec(select(Member)).all()}
    assert set(members) == {"Dad", "Mum", "Mia", "Kavi"}
    assert members["Mia"].role is Role.child
    mia_pin = db.get(MemberCredential, members["Mia"].id)
    assert mia_pin is not None and verify_secret(mia_pin.pin_hash, "3579")
    out = capsys.readouterr().out
    assert "nothing to do" in out
    assert cli.DEV_PASSCODE not in out


def test_cli_seed_dev_refuses_prod(cli_env: Settings, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("APP_ENV", "prod")

    with pytest.raises(SystemExit, match="refuses"):
        cli.main(["seed-dev"])


def test_cli_setup_family_stores_only_hashes_and_never_prints_secrets(
    cli_env: Settings,
    db: Session,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    _answers(
        monkeypatch,
        typed=["Mum", "🌻"],
        secrets=[
            "short",  # too short: asked again
            "owl-sunflower-26",
            "owl-sunflower-26",
            "12a4",  # not 4 digits: asked again
            "2468",
            "2469",  # confirmation differs: asked again
            "2468",
            "2468",
        ],
    )

    cli.main(["setup-family", "--timezone", "Asia/Kolkata"])

    [family] = db.exec(select(Family)).all()
    [mum] = db.exec(select(Member)).all()
    credential = db.get(MemberCredential, mum.id)
    assert family.timezone == "Asia/Kolkata"
    assert (mum.nickname, mum.avatar_emoji, mum.role) == ("Mum", "🌻", Role.parent)
    assert verify_secret(family.passcode_hash, "owl-sunflower-26")
    assert credential is not None and verify_secret(credential.pin_hash, "2468")
    out = capsys.readouterr().out
    assert f"Family created: {family.id}" in out
    assert "owl-sunflower-26" not in out
    assert "2468" not in out


def test_cli_setup_family_rejects_an_unknown_timezone(cli_env: Settings) -> None:
    with pytest.raises(SystemExit, match="Unknown timezone"):
        cli.main(["setup-family", "--timezone", "Mars/Olympus_Mons"])


def test_cli_setup_family_rejects_a_bad_nickname(
    cli_env: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    _answers(monkeypatch, typed=["A" * 21], secrets=[])

    with pytest.raises(SystemExit, match="1-20 characters"):
        cli.main(["setup-family"])

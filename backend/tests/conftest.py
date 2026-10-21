from collections.abc import Callable, Iterator
from contextlib import ExitStack

import pytest
from argon2 import PasswordHasher, profiles
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlmodel import Session

from app.config import Settings
from app.main import create_app
from app.security import hashing
from tests.support import (
    FAMILY_TZ,
    NOW,
    OTHER_MEMBERS,
    OTHER_PASSCODE,
    PASSCODE,
    SAMPLE_MEMBERS,
    Person,
    SeededFamily,
    Seeder,
    act_as,
    unlock,
)


@pytest.fixture(autouse=True)
def _cheap_password_hashing(monkeypatch: pytest.MonkeyPatch) -> None:
    """Real argon2 costs ~50 ms per hash and dominated the suite's run time.

    Behaviour is the same (argon2id, salted); only the cost drops. The production
    parameters are checked in tests/unit/test_hashing.py.
    """
    monkeypatch.setattr(hashing, "_hasher", PasswordHasher.from_parameters(profiles.CHEAPEST))


@pytest.fixture
def settings(tmp_path) -> Settings:
    return Settings(
        app_env="test",
        database_url=f"sqlite:///{tmp_path / 'test.db'}",
        cookie_secure=False,
        # Every app log line reaches caplog, so the privacy checks see INFO lines too.
        log_level="DEBUG",
    )


@pytest.fixture
def client(settings: Settings) -> TestClient:
    with TestClient(create_app(settings)) as c:
        yield c


# Fixtures below import Phase 1 modules inside their bodies, so a module that doesn't exist
# yet fails only the tests that need it and never breaks collection.


@pytest.fixture
def clock():
    from app.clock import FrozenClock

    return FrozenClock(NOW)


@pytest.fixture
def api_app(settings: Settings, clock) -> FastAPI:
    return create_app(settings, clock=clock)


def _seed_family(
    settings: Settings, passcode: str, members: tuple[tuple[str, str, str, str], ...]
) -> SeededFamily:
    from app.db import make_engine, upgrade_to_head
    from app.models import Family, Member, MemberCredential
    from app.security.hashing import hash_secret

    upgrade_to_head(settings.database_url)
    engine = make_engine(settings.database_url)
    try:
        with Session(engine) as db:
            family = Family(timezone=FAMILY_TZ, passcode_hash=hash_secret(passcode), created_at=NOW)
            db.add(family)
            db.flush()
            people: dict[str, Person] = {}
            for nickname, avatar_emoji, role, pin in members:
                member = Member(
                    family_id=family.id,
                    nickname=nickname,
                    avatar_emoji=avatar_emoji,
                    role=role,
                    created_at=NOW,
                )
                db.add(member)
                db.flush()
                db.add(
                    MemberCredential(
                        member_id=member.id, pin_hash=hash_secret(pin), failed_attempts=0
                    )
                )
                people[nickname] = Person(member.id, nickname, avatar_emoji, role, pin)
            db.commit()
            return SeededFamily(id=family.id, passcode=passcode, members=people)
    finally:
        engine.dispose()


@pytest.fixture
def family(settings: Settings) -> SeededFamily:
    return _seed_family(settings, PASSCODE, SAMPLE_MEMBERS)


@pytest.fixture
def other_family(settings: Settings, family: SeededFamily) -> SeededFamily:
    return _seed_family(settings, OTHER_PASSCODE, OTHER_MEMBERS)


@pytest.fixture
def make_client(api_app: FastAPI) -> Iterator[Callable[[], TestClient]]:
    """A new device: its own cookie jar against the same app and database."""
    with ExitStack() as stack:
        yield lambda: stack.enter_context(TestClient(api_app))


@pytest.fixture
def anon(make_client: Callable[[], TestClient], family: SeededFamily) -> TestClient:
    return make_client()


@pytest.fixture
def unlocked(anon: TestClient, family: SeededFamily) -> TestClient:
    response = unlock(anon, family.passcode)
    assert response.status_code == 201, response.text
    return anon


@pytest.fixture
def as_parent(unlocked: TestClient, family: SeededFamily) -> TestClient:
    response = act_as(unlocked, family["Mum"])
    assert response.status_code == 200, response.text
    return unlocked


@pytest.fixture
def as_child(unlocked: TestClient, family: SeededFamily) -> TestClient:
    response = act_as(unlocked, family["Mia"])
    assert response.status_code == 200, response.text
    return unlocked


@pytest.fixture
def db(settings: Settings, family: SeededFamily) -> Iterator[Session]:
    """A database session on the test database (after the family is seeded)."""
    from app.db import make_engine

    engine = make_engine(settings.database_url)
    with Session(engine) as session:
        yield session
    engine.dispose()


@pytest.fixture
def seed(db: Session, family: SeededFamily) -> Seeder:
    return Seeder(db, family.id)

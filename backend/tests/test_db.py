"""Database foundations: SQLite pragmas, cascades and the `transaction()` helper."""

import sqlite3
from collections.abc import Iterator
from uuid import uuid4

import pytest
from sqlalchemy import Engine
from sqlalchemy.exc import StatementError
from sqlmodel import Session, select

from app.config import Settings
from app.db import make_engine, transaction, upgrade_to_head
from app.models import Family, Member, MemberCredential
from tests.support import NOW


@pytest.fixture
def engine(settings: Settings) -> Iterator[Engine]:
    upgrade_to_head(settings.database_url)
    engine = make_engine(settings.database_url)
    yield engine
    engine.dispose()


@pytest.fixture
def db_path(settings: Settings) -> str:
    return settings.database_url.removeprefix("sqlite:///")


def _other_writer(db_path: str) -> sqlite3.Connection:
    """A second connection that fails at once instead of waiting for a lock."""
    return sqlite3.connect(db_path, timeout=0, isolation_level=None)


@pytest.mark.req("REQ-007")
def test_req_007_every_connection_enforces_foreign_keys(engine: Engine) -> None:
    for _ in range(2):  # a fresh pooled connection gets the pragma too
        with engine.connect() as connection:
            assert connection.exec_driver_sql("PRAGMA foreign_keys").scalar() == 1


def test_nfr_connections_use_wal_and_a_busy_timeout(engine: Engine) -> None:
    with engine.connect() as connection:
        assert connection.exec_driver_sql("PRAGMA journal_mode").scalar() == "wal"
        assert connection.exec_driver_sql("PRAGMA busy_timeout").scalar() == 5000


@pytest.mark.req("REQ-007")
def test_req_007_deleting_a_family_cascades_in_the_database(engine: Engine) -> None:
    with Session(engine) as db:
        family = Family(timezone="Europe/London", passcode_hash="x", created_at=NOW)
        db.add(family)
        db.flush()
        member = Member(
            family_id=family.id, nickname="Mia", avatar_emoji="🐬", role="child", created_at=NOW
        )
        db.add(member)
        db.flush()
        db.add(MemberCredential(member_id=member.id, pin_hash="x"))
        db.commit()
        family_id = family.id

    # Raw SQL, so only the database's ON DELETE CASCADE can remove the children.
    with engine.begin() as connection:
        connection.exec_driver_sql("DELETE FROM family WHERE id = ?", (family_id.hex,))
    with engine.connect() as connection:
        assert connection.exec_driver_sql("SELECT count(*) FROM member").scalar() == 0
        assert connection.exec_driver_sql("SELECT count(*) FROM member_credential").scalar() == 0


def test_nfr_immediate_transaction_takes_the_write_lock_before_any_write(
    engine: Engine, db_path: str
) -> None:
    other = _other_writer(db_path)
    with Session(engine) as db, transaction(db, immediate=True):
        # Only a read so far, but another writer is already shut out.
        db.get(Family, uuid4())
        with pytest.raises(sqlite3.OperationalError, match="locked"):
            other.execute("BEGIN IMMEDIATE")
    other.execute("BEGIN IMMEDIATE")  # released on commit
    other.rollback()
    other.close()


def test_nfr_default_transaction_does_not_lock_until_it_writes(
    engine: Engine, db_path: str
) -> None:
    other = _other_writer(db_path)
    with Session(engine) as db, transaction(db):
        db.get(Family, uuid4())
        other.execute("BEGIN IMMEDIATE")
        other.execute("ROLLBACK")
    other.close()


def test_nfr_transaction_rolls_back_on_error(engine: Engine) -> None:
    with Session(engine) as db:
        with pytest.raises(RuntimeError, match="boom"), transaction(db, immediate=True):
            db.add(Family(timezone="Europe/London", passcode_hash="x", created_at=NOW))
            db.flush()
            raise RuntimeError("boom")
        assert db.exec(select(Family)).all() == []


def test_nfr_transaction_refuses_to_nest_inside_an_open_transaction(engine: Engine) -> None:
    with Session(engine) as db:
        db.get(Family, uuid4())  # opens a transaction
        with pytest.raises(RuntimeError, match="new transaction"), transaction(db):
            pass


def test_nfr_naive_datetimes_are_refused_at_the_database(engine: Engine) -> None:
    naive = NOW.replace(tzinfo=None)

    with Session(engine) as db:
        db.add(Family(timezone="Europe/London", passcode_hash="x", created_at=naive))
        with pytest.raises(StatementError, match="naive datetimes"):
            db.flush()

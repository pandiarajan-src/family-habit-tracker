"""Database engine, per-request sessions and migrations."""

from collections.abc import Iterator
from contextlib import contextmanager
from datetime import UTC, datetime
from pathlib import Path

from alembic import command
from alembic.config import Config
from fastapi import Request
from sqlalchemy import DateTime, Engine, event
from sqlalchemy.types import TypeDecorator
from sqlmodel import Session, create_engine

MIGRATIONS_DIR = Path(__file__).resolve().parent.parent / "migrations"


class UTCDateTime(TypeDecorator[datetime]):
    """Stores aware datetimes as UTC and returns them aware. SQLite would drop the offset."""

    impl = DateTime(timezone=True)
    cache_ok = True

    def process_bind_param(self, value: datetime | None, dialect) -> datetime | None:
        if value is None:
            return None
        if value.tzinfo is None:
            raise ValueError("naive datetimes are not stored; use the Clock")
        return value.astimezone(UTC).replace(tzinfo=None)

    def process_result_value(self, value: datetime | None, dialect) -> datetime | None:
        return None if value is None else value.replace(tzinfo=UTC)


def make_engine(database_url: str) -> Engine:
    """Engine with the SQLite pragmas every connection needs (FK cascades, WAL, busy timeout)."""
    is_sqlite = database_url.startswith("sqlite")
    engine = create_engine(
        database_url,
        connect_args={"check_same_thread": False} if is_sqlite else {},
    )
    if is_sqlite:

        @event.listens_for(engine, "connect")
        def _sqlite_pragmas(dbapi_connection, _record) -> None:
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.execute("PRAGMA journal_mode=WAL")
            cursor.execute("PRAGMA busy_timeout=5000")
            cursor.close()
            # Let SQLAlchemy issue BEGIN (below) instead of pysqlite, so `transaction()` can
            # ask for BEGIN IMMEDIATE (SQLAlchemy's documented SQLite recipe).
            dbapi_connection.isolation_level = None

        @event.listens_for(engine, "begin")
        def _sqlite_begin(connection) -> None:
            mode = connection.get_execution_options().get(_SQLITE_BEGIN, "")
            connection.exec_driver_sql(f"BEGIN {mode}".strip())

    return engine


_SQLITE_BEGIN = "sqlite_begin"


@contextmanager
def transaction(db: Session, *, immediate: bool = False) -> Iterator[Session]:
    """Run a block as one transaction: commit on success, roll back on error.

    `immediate=True` takes SQLite's write lock at BEGIN, so a read-then-write check (e.g. "is
    the gem balance enough?") can't interleave with another device's spend (plan: Concurrency).
    """
    if db.in_transaction():
        raise RuntimeError("transaction() must start a new transaction; commit first")
    if immediate:
        db.connection(execution_options={_SQLITE_BEGIN: "IMMEDIATE"})
    try:
        yield db
        db.commit()
    except BaseException:
        db.rollback()
        raise


def upgrade_to_head(database_url: str) -> None:
    """Run Alembic migrations up to the latest revision."""
    config = Config()
    config.set_main_option("script_location", str(MIGRATIONS_DIR))
    config.set_main_option("sqlalchemy.url", database_url)
    command.upgrade(config, "head")


def get_db(request: Request) -> Iterator[Session]:
    with Session(request.app.state.engine) as db:
        yield db

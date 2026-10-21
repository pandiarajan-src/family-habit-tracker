"""Migrations and models agree, and every migration can be undone (data is kept ≥ 13 months)."""

import pytest
from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from sqlalchemy import Engine, inspect
from sqlmodel import SQLModel

import app.models  # noqa: F401  (registers every table)
from app.config import Settings
from app.db import MIGRATIONS_DIR, make_engine, upgrade_to_head


@pytest.fixture
def engine(settings: Settings):
    upgrade_to_head(settings.database_url)
    engine = make_engine(settings.database_url)
    yield engine
    engine.dispose()


def test_migrations_create_exactly_the_model_tables(engine: Engine) -> None:
    with engine.connect() as connection:
        diff = compare_metadata(MigrationContext.configure(connection), SQLModel.metadata)

    assert diff == []


def test_migrations_downgrade_to_access_control_and_back(
    engine: Engine, settings: Settings
) -> None:
    from alembic import command
    from alembic.config import Config

    config = Config()
    config.set_main_option("script_location", str(MIGRATIONS_DIR))
    config.set_main_option("sqlalchemy.url", settings.database_url)

    command.downgrade(config, "0001")
    assert "habit" not in inspect(engine).get_table_names()
    command.upgrade(config, "head")
    assert "habit" in inspect(engine).get_table_names()


@pytest.mark.req("REQ-012")
def test_req_012_one_check_in_per_habit_and_day_is_a_database_constraint(
    engine: Engine,
) -> None:
    unique = inspect(engine).get_unique_constraints("check_in")

    assert [c["column_names"] for c in unique] == [["habit_id", "date"]]

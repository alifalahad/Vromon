"""
Alembic migrations: the migration chain must build exactly the schema the ORM
models describe, downgrade cleanly, and adopt databases created by the old
`create_all` startup.

Runs on SQLite by default. Set TEST_POSTGRES_URL (e.g. in CI) to run the same
checks against PostgreSQL as well.
"""

from __future__ import annotations

import os

import pytest
from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from alembic.script import ScriptDirectory
from sqlalchemy import create_engine, inspect, text

import app.models  # noqa: F401
from app.db.base import Base
from app.db.migrations import BASELINE_REVISION, alembic_config, upgrade_to_head


@pytest.fixture(params=["sqlite", "postgresql"])
def engine(request, tmp_path):
    if request.param == "sqlite":
        url = f"sqlite:///{tmp_path / 'migrations.db'}"
    else:
        url = os.environ.get("TEST_POSTGRES_URL")
        if not url:
            pytest.skip("TEST_POSTGRES_URL not set")
    eng = create_engine(url)
    if eng.dialect.name == "postgresql":
        # Start from an empty schema so runs are independent
        with eng.begin() as conn:
            conn.execute(text("DROP SCHEMA public CASCADE; CREATE SCHEMA public"))
    yield eng
    eng.dispose()


def _head() -> str:
    return ScriptDirectory.from_config(alembic_config()).get_current_head()


def _version(eng) -> str | None:
    with eng.connect() as conn:
        return MigrationContext.configure(conn).get_current_revision()


def _drift(eng) -> list:
    with eng.connect() as conn:
        ctx = MigrationContext.configure(conn, opts={"compare_type": True})
        return compare_metadata(ctx, Base.metadata)


def test_upgrade_builds_exactly_the_model_schema(engine):
    upgrade_to_head(engine)
    assert _version(engine) == _head()
    assert _drift(engine) == []


def test_downgrade_to_base_and_back(engine):
    upgrade_to_head(engine)
    with engine.begin() as conn:
        command.downgrade(alembic_config(conn), "base")
    assert set(inspect(engine).get_table_names()) <= {"alembic_version"}
    upgrade_to_head(engine)
    assert _drift(engine) == []


def test_adopts_a_database_created_by_create_all(engine):
    # A pre-Alembic database: the baseline schema without an alembic_version table
    with engine.begin() as conn:
        command.upgrade(alembic_config(conn), BASELINE_REVISION)
        conn.execute(text("DROP TABLE alembic_version"))
    assert _version(engine) is None
    upgrade_to_head(engine)
    assert _version(engine) == _head()
    assert _drift(engine) == []


def test_upgrade_is_idempotent(engine):
    upgrade_to_head(engine)
    upgrade_to_head(engine)
    assert _version(engine) == _head()


def test_baseline_is_the_root_revision():
    script = ScriptDirectory.from_config(alembic_config())
    base = script.get_base()
    assert base == BASELINE_REVISION


def test_0002_deletes_pre_account_trips_only_in_production(engine, monkeypatch):
    """Decision D4: production drops ownerless trips (and their children); development keeps them."""
    from app.core.config import settings

    def seed_ownerless_trip(conn):
        conn.execute(text(
            "INSERT INTO trips (id, destination, start_date, end_date, num_travelers, total_budget, currency, status, created_at, updated_at) "
            "VALUES (1, 'Cox''s Bazar', '2026-11-01', '2026-11-02', 1, 1000, 'BDT', 'draft', '2026-10-01', '2026-10-01')"
        ))
        conn.execute(text(
            "INSERT INTO trip_preferences (id, trip_id, interests_json, travel_style, activity_level, accommodation_preference, preferred_start_time, preferred_end_time) "
            "VALUES (1, 1, '[]', 'Balanced', 'Medium', 'Standard', '09:00', '20:00')"
        ))

    for env, expected in (("development", 1), ("production", 0)):
        with engine.begin() as conn:
            if _version(engine):
                command.downgrade(alembic_config(conn), "base")
            command.upgrade(alembic_config(conn), BASELINE_REVISION)
            seed_ownerless_trip(conn)
        monkeypatch.setattr(settings, "app_env", env)
        upgrade_to_head(engine)
        with engine.connect() as conn:
            assert conn.execute(text("SELECT COUNT(*) FROM trips")).scalar() == expected, env
            assert conn.execute(text("SELECT COUNT(*) FROM trip_preferences")).scalar() == expected, env

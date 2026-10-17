"""
Vromon Backend — schema migrations (Alembic).

`upgrade_to_head()` runs at startup instead of `Base.metadata.create_all`, which
never alters existing tables. A database created by `create_all` before Alembic
existed (no `alembic_version` table, but the app's tables present) is stamped at
the baseline revision first: its schema is exactly the baseline, so nothing needs
recreating.
"""

from __future__ import annotations

import logging
from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import inspect
from sqlalchemy.engine import Engine

BACKEND_DIR = Path(__file__).resolve().parents[2]
BASELINE_REVISION = "0001"

logger = logging.getLogger("vromon.migrations")


def alembic_config(connection=None) -> Config:
    cfg = Config(str(BACKEND_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    # Keep the app's logging configuration; alembic.ini's would replace it.
    cfg.attributes["configure_logger"] = False
    if connection is not None:
        cfg.attributes["connection"] = connection
    return cfg


def upgrade_to_head(engine: Engine) -> None:
    from app.db.base import Base
    import app.models  # noqa: F401  (registers tables on Base.metadata)

    with engine.begin() as connection:
        cfg = alembic_config(connection)
        tables = set(inspect(connection).get_table_names())
        if "alembic_version" not in tables and tables & set(Base.metadata.tables):
            logger.info("Existing pre-migration database found; stamping baseline %s", BASELINE_REVISION)
            command.stamp(cfg, BASELINE_REVISION)
        command.upgrade(cfg, "head")

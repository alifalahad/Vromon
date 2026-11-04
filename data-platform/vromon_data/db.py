"""
The pipeline writes to the same database as the app: VROMON_DATABASE_URL, else the
backend's DATABASE_URL (environment or backend/.env), else backend/vromon.db.
A relative SQLite path is taken relative to backend/, as the app does.
"""

from __future__ import annotations

import os

from dotenv import dotenv_values
from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from vromon_data.paths import REPO_DIR

BACKEND_DIR = REPO_DIR / "backend"


def database_url() -> str:
    url = (os.environ.get("VROMON_DATABASE_URL") or os.environ.get("DATABASE_URL")
           or dotenv_values(BACKEND_DIR / ".env").get("DATABASE_URL") or "sqlite:///./vromon.db")
    if url.startswith("sqlite:///./"):
        url = "sqlite:///" + (BACKEND_DIR / url[len("sqlite:///./"):]).as_posix()
    return url


def make_engine(url: str | None = None) -> Engine:
    return create_engine(url or database_url())


def migrate(engine: Engine) -> None:
    """Bring the schema to the app's latest migration (the same chain the API runs at startup)."""
    from app.db.migrations import upgrade_to_head
    upgrade_to_head(engine)


def session_factory(engine: Engine) -> sessionmaker[Session]:
    return sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

"""
Vromon backend — pytest configuration and shared fixtures.

Provides a shared in-memory SQLite engine for API endpoint tests so that
FastAPI's get_db dependency and the test setup both point to the same database.
"""

from __future__ import annotations

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base, get_db
from app.db.seeder import seed_database
from app.main import app

# ---------------------------------------------------------------------------
# Shared in-memory database for API tests
# ---------------------------------------------------------------------------

TEST_DATABASE_URL = "sqlite://"  # in-memory, shared via connect_args

_api_engine = create_engine(
    TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},
    # Use StaticPool so all connections share the same in-memory database
    poolclass=__import__("sqlalchemy.pool", fromlist=["StaticPool"]).StaticPool,
)
_ApiTestSession = sessionmaker(autocommit=False, autoflush=False, bind=_api_engine)


def _get_test_db():
    """Override for FastAPI's get_db dependency: uses the shared test engine."""
    db = _ApiTestSession()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture(scope="session", autouse=True)
def setup_api_test_db():
    """
    Create all tables and seed demo data once per test session.

    Using 'session' scope so that seed data is loaded once and remains
    available across all API endpoint tests.
    """
    Base.metadata.create_all(bind=_api_engine)

    db = _ApiTestSession()
    try:
        seed_database(db)
    finally:
        db.close()

    # Override the FastAPI dependency so endpoints use the test database
    app.dependency_overrides[get_db] = _get_test_db

    yield

    # Cleanup
    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=_api_engine)


# ---------------------------------------------------------------------------
# Keep ordinary test runs offline
# ---------------------------------------------------------------------------

@pytest.fixture(scope="session", autouse=True)
def disable_live_ai_providers():
    """
    Force the dummy embedding provider and "no LLM configured" for the whole
    test session, even if backend/.env contains real API keys, so normal test
    runs never make paid network calls (the app lifespan runs ingestion).

    Set VROMON_LIVE_TESTS=1 to keep the configured providers for live tests.
    """
    import os
    from app.core.config import settings

    if os.environ.get("VROMON_LIVE_TESTS") == "1":
        yield
        return

    mp = pytest.MonkeyPatch()
    mp.setattr(settings, "embedding_provider", "")
    mp.setattr(settings, "llm_provider", "")
    yield
    mp.undo()

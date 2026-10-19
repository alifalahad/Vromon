"""
Vromon backend — pytest configuration and shared fixtures.

Provides a shared in-memory SQLite engine for API endpoint tests so that
FastAPI's get_db dependency and the test setup both point to the same database.
"""

from __future__ import annotations

import os
import tempfile

# Never touch the developer's database (backend/vromon.db or DATABASE_URL in .env):
# anything that falls back to the app's own engine (e.g. the startup lifespan) gets
# a throwaway SQLite file. Must run before `app` is imported.
os.environ["DATABASE_URL"] = f"sqlite:///{tempfile.mkdtemp(prefix='vromon-tests-')}/app.db"
# Tests never call the real road service (no network, no quota): straight-line estimates,
# or the fake service in test_trip_planner_step5.py
os.environ["ROUTING_PROVIDER"] = "none"
os.environ["ORS_API_KEY"] = ""
# Nor the weather service when planning (test_trip_planner_step7.py turns it on with a fake forecast)
os.environ["WEATHER_PLANNING"] = "false"

import pytest  # noqa: E402
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


# ---------------------------------------------------------------------------
# Accounts: API tests run as a signed-in test user
# ---------------------------------------------------------------------------

import uuid  # noqa: E402

from fastapi import Depends  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402

from app.core.auth import get_current_user  # noqa: E402
from app.core.rate_limit import limiter  # noqa: E402
from app.models.models import User  # noqa: E402

TEST_USER_ID = uuid.UUID("00000000-0000-4000-8000-000000000001")


def _test_current_user(db: Session = Depends(get_db)) -> User:
    """Stands in for token verification; uses whatever database the request uses."""
    user = db.get(User, TEST_USER_ID)
    if user is None:
        user = User(id=TEST_USER_ID, auth_subject="test-user", email="test@example.com", friend_code="TESTUSR1")
        db.add(user)
        db.commit()
        db.refresh(user)
    return user


@pytest.fixture(autouse=True)
def shared_test_db():
    """
    Some modules install their own get_db override and remove it (or clear all
    overrides) at teardown. Later modules that use the shared database get it back.
    """
    app.dependency_overrides.setdefault(get_db, _get_test_db)


@pytest.fixture(autouse=True)
def signed_in_test_user():
    """Every test acts as TEST_USER_ID unless it removes this override (see test_accounts.py)."""
    app.dependency_overrides[get_current_user] = _test_current_user
    yield
    app.dependency_overrides.pop(get_current_user, None)


@pytest.fixture(autouse=True)
def rate_limits_off():
    """Rate limits are tested explicitly; elsewhere they would make tests order-dependent."""
    limiter.enabled = False
    yield
    limiter.enabled = True


@pytest.fixture(autouse=True)
def push_off(monkeypatch):
    """No test talks to the real Expo Push API; tests that check pushes capture them (test_friends.py)."""
    from app.core.config import settings as app_settings

    monkeypatch.setattr(app_settings, "push_enabled", False)


@pytest.fixture(autouse=True)
def local_photo_store(monkeypatch, tmp_path):
    """No test talks to the real bucket: photos go to a temporary folder with locally signed URLs."""
    from app.services.photos import storage

    store = storage.LocalStore(tmp_path / "photos", b"test-secret")
    monkeypatch.setattr(storage, "_configured_store", lambda: store)
    return store

"""
Tests for Phase 6 — Itinerary generation endpoint + constraint validator.

Run with: pytest tests/test_itinerary_generation.py -v
"""

import pytest
from datetime import date, timedelta
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from fastapi.testclient import TestClient

from app.db.base import Base, get_db
from app.db.seeder import seed_database
from app.models.models import (
    Destination, Place, Trip, TripPreference, TripConstraint,
    Itinerary, ItineraryItem,
)
from app.services.itinerary.constraint_validator import (
    ConstraintValidator, ValidationReport,
)
from app.main import app
from tests.conftest import TEST_USER_ID

# ---------------------------------------------------------------------------
# Shared test DB (StaticPool so TestClient and fixtures share the same data)
# ---------------------------------------------------------------------------
from sqlalchemy.pool import StaticPool

TEST_DB_URL = "sqlite://"
_engine = create_engine(
    TEST_DB_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
_Session = sessionmaker(autocommit=False, autoflush=False, bind=_engine)


def _get_test_db():
    db = _Session()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture(scope="module", autouse=True)
def setup_db():
    Base.metadata.create_all(bind=_engine)
    db = _Session()
    try:
        seed_database(db)
    finally:
        db.close()
    app.dependency_overrides[get_db] = _get_test_db
    yield
    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=_engine)


@pytest.fixture
def db():
    session = _Session()
    yield session
    session.close()


@pytest.fixture
def client():
    return TestClient(app)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def make_trip(db, days: int = 2) -> Trip:
    today = date.today()
    trip = Trip(
        user_id=TEST_USER_ID,
        destination="Cox's Bazar",
        start_date=today,
        end_date=today + timedelta(days=days - 1),
        num_travelers=2,
        total_budget=20000,
        title="Test Trip",
        status="draft",
    )
    db.add(trip)
    db.flush()

    pref = TripPreference(
        trip_id=trip.id,
        travel_style="Balanced",
        activity_level="Medium",
        accommodation_preference="Standard",
        preferred_start_time="09:00",
        preferred_end_time="20:00",
    )
    pref.interests = ["Beach", "Nature"]
    db.add(pref)

    cons = TripConstraint(
        trip_id=trip.id,
        max_activities_per_day=4,
        max_daily_budget=0.0,
        avoid_crowded=False,
        avoid_high_activity=False,
    )
    cons.must_visit = []
    cons.excluded_places = []
    db.add(cons)

    db.commit()
    db.refresh(trip)
    return trip


# ---------------------------------------------------------------------------
# Constraint Validator Unit Tests
# ---------------------------------------------------------------------------

class TestConstraintValidator:

    def test_clean_itinerary_has_no_hard_violations(self, db):
        """A properly generated itinerary should have no hard violations."""
        from app.services.itinerary.itinerary_service import ItineraryService
        trip = make_trip(db, days=2)
        svc = ItineraryService()
        days = svc.generate(db, trip)

        validator = ConstraintValidator()
        report = validator.validate(trip, days)

        assert not report.has_hard_violations, (
            f"Unexpected hard violations: {[v.message for v in report.hard_violations]}"
        )

    def test_time_overlap_detected(self, db):
        """Manually inject an overlapping item and confirm detection."""
        trip = make_trip(db, days=1)
        day = Itinerary(
            trip_id=trip.id,
            day_number=1,
            total_cost=0,
            total_travel_time=0,
        )
        db.add(day)
        db.flush()

        # Two items that overlap: 10:00–12:00 and 11:00–13:00
        item_a = ItineraryItem(
            item_type="activity", title="Place A",
            start_time="10:00", end_time="12:00",
            duration_minutes=120, cost=0,
            travel_time_to_next=0, distance_to_next=0,
            recommendation_score=0, order_index=0,
        )
        item_a.recommendation_reasons = []
        item_b = ItineraryItem(
            item_type="activity", title="Place B",
            start_time="11:00", end_time="13:00",
            duration_minutes=120, cost=0,
            travel_time_to_next=0, distance_to_next=0,
            recommendation_score=0, order_index=1,
        )
        item_b.recommendation_reasons = []
        day.items = [item_a, item_b]
        db.commit()

        validator = ConstraintValidator()
        report = validator.validate(trip, [day])
        codes = [v.code for v in report.violations]
        assert "TIME_OVERLAP" in codes

    def test_excluded_place_detected(self, db):
        """A scheduled excluded place should trigger a hard violation."""
        trip = make_trip(db, days=1)
        # Mark place 1 as excluded
        trip.constraints.excluded_places = [1]
        db.commit()

        day = Itinerary(
            trip_id=trip.id,
            day_number=1,
            total_cost=0,
            total_travel_time=0,
        )
        db.add(day)
        db.flush()

        item = ItineraryItem(
            item_type="activity", title="Excluded Place",
            place_id=1,
            start_time="10:00", end_time="11:30",
            duration_minutes=90, cost=0,
            travel_time_to_next=0, distance_to_next=0,
            recommendation_score=0, order_index=0,
        )
        item.recommendation_reasons = []
        day.items = [item]
        db.commit()

        validator = ConstraintValidator()
        report = validator.validate(trip, [day])
        codes = [v.code for v in report.violations]
        assert "EXCLUDED_PLACE_SCHEDULED" in codes

        # Cleanup
        trip.constraints.excluded_places = []
        db.commit()

    def test_must_visit_missing_detected(self, db):
        """A missing must-visit place should trigger a hard violation."""
        trip = make_trip(db, days=1)
        trip.constraints.must_visit = [999]  # non-existent place
        db.commit()

        day = Itinerary(
            trip_id=trip.id,
            day_number=1,
            total_cost=0,
            total_travel_time=0,
        )
        db.add(day)
        db.flush()
        day.items = []
        db.commit()

        validator = ConstraintValidator()
        report = validator.validate(trip, [day])
        codes = [v.code for v in report.violations]
        assert "MUST_VISIT_MISSING" in codes

        # Cleanup
        trip.constraints.must_visit = []
        db.commit()

    def test_activity_limit_exceeded(self, db):
        """Scheduling more activities than the limit should be flagged."""
        trip = make_trip(db, days=1)
        trip.constraints.max_activities_per_day = 2
        db.commit()

        day = Itinerary(
            trip_id=trip.id,
            day_number=1,
            total_cost=0,
            total_travel_time=0,
        )
        db.add(day)
        db.flush()

        items = []
        for i in range(3):
            item = ItineraryItem(
                item_type="activity", title=f"Activity {i}",
                start_time=f"{9 + i * 2:02d}:00",
                end_time=f"{10 + i * 2:02d}:30",
                duration_minutes=90, cost=0,
                travel_time_to_next=0, distance_to_next=0,
                recommendation_score=0, order_index=i,
            )
            item.recommendation_reasons = []
            items.append(item)
        day.items = items
        db.commit()

        validator = ConstraintValidator()
        report = validator.validate(trip, [day])
        codes = [v.code for v in report.violations]
        assert "ACTIVITY_LIMIT_EXCEEDED" in codes

        # Cleanup
        trip.constraints.max_activities_per_day = 4
        db.commit()


# ---------------------------------------------------------------------------
# API Endpoint Tests
# ---------------------------------------------------------------------------

class TestGenerateEndpoint:

    def test_generate_returns_itinerary(self, client, db):
        """POST generate should return days with items."""
        trip = make_trip(db, days=2)
        response = client.post(f"/api/v1/trips/{trip.id}/generate")
        assert response.status_code == 200, response.text
        data = response.json()
        assert data["trip_id"] == trip.id
        assert data["days_generated"] == 2
        assert len(data["itinerary"]) == 2
        assert "valid" in data
        assert "warnings" in data

    def test_generate_creates_activities(self, client, db):
        """Generated itinerary should contain activity items."""
        trip = make_trip(db, days=1)
        response = client.post(f"/api/v1/trips/{trip.id}/generate")
        assert response.status_code == 200
        data = response.json()
        day = data["itinerary"][0]
        activities = [i for i in day["items"] if i["item_type"] == "activity"]
        assert len(activities) > 0, "Should have at least one activity"

    def test_get_itinerary_after_generate(self, client, db):
        """GET itinerary should return saved days after generate."""
        trip = make_trip(db, days=2)
        client.post(f"/api/v1/trips/{trip.id}/generate")
        response = client.get(f"/api/v1/trips/{trip.id}/itinerary")
        assert response.status_code == 200
        data = response.json()
        assert len(data["days"]) == 2

    def test_regenerate_replaces_itinerary(self, client, db):
        """Regenerating should replace all existing days."""
        trip = make_trip(db, days=1)
        client.post(f"/api/v1/trips/{trip.id}/generate")
        # Get initial item count
        r1 = client.get(f"/api/v1/trips/{trip.id}/itinerary")
        count1 = len(r1.json()["days"][0]["items"])

        # Regenerate
        client.post(f"/api/v1/trips/{trip.id}/regenerate")
        r2 = client.get(f"/api/v1/trips/{trip.id}/itinerary")
        assert len(r2.json()["days"]) == 1  # same number of days

    def test_generate_nonexistent_trip(self, client):
        """Generating for a non-existent trip should return 404."""
        response = client.post("/api/v1/trips/99999/generate")
        assert response.status_code == 404

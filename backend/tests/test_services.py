"""
Tests for Vromon core services (v2).

Run with: pytest tests/ -v
"""

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from datetime import date, timedelta

from app.db.base import Base
from app.models.models import (
    Destination, Place, TripPreference, TripConstraint, Trip,
)
from app.services.recommendation.recommendation_service import RecommendationService
from app.services.itinerary.itinerary_service import (
    _time_to_minutes, _minutes_to_time, _haversine_km,
)

# ---------------------------------------------------------------------------
# Test DB setup
# ---------------------------------------------------------------------------
TEST_DB_URL = "sqlite://"  # in-memory

engine = create_engine(TEST_DB_URL, connect_args={"check_same_thread": False})
TestSession = sessionmaker(bind=engine)


@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def db():
    session = TestSession()
    yield session
    session.close()


# ---------------------------------------------------------------------------
# Sample data helpers
# ---------------------------------------------------------------------------

def make_destination(db):
    dest = Destination(
        id=1,
        name="Cox's Bazar",
        country="Bangladesh",
        latitude=21.4272,
        longitude=92.0058,
    )
    db.add(dest)
    db.commit()
    return dest


def make_place(db, id, name, category, tags, rating=4.5, cost=0,
               crowd="Medium", activity="Medium", dest_id=1):
    p = Place(
        id=id, name=name, destination_id=dest_id,
        destination_name="Cox's Bazar",
        category=category, latitude=21.43, longitude=92.00,
        rating=rating, review_count=100,
        average_visit_duration=2.0, estimated_cost=cost,
        opening_time="08:00", closing_time="18:00",
        crowd_level=crowd, activity_level=activity,
    )
    p.tags = tags
    db.add(p)
    db.commit()
    return p


def make_trip(db, interests, travel_style, activity_level,
              budget=15000, avoid_crowded=False, max_acts=4):
    trip = Trip(
        destination="Cox's Bazar",
        start_date=date.today(),
        end_date=date.today() + timedelta(days=2),
        num_travelers=2,
        total_budget=budget,
        status="draft",
    )
    db.add(trip)
    db.flush()

    pref = TripPreference(
        trip_id=trip.id,
        travel_style=travel_style,
        activity_level=activity_level,
        accommodation_preference="Standard",
        preferred_start_time="09:00",
        preferred_end_time="20:00",
    )
    pref.interests = interests
    db.add(pref)

    cons = TripConstraint(
        trip_id=trip.id,
        max_activities_per_day=max_acts,
        avoid_crowded=avoid_crowded,
    )
    cons.must_visit = []
    cons.excluded_places = []
    db.add(cons)
    db.commit()
    db.refresh(trip)
    return trip


# ---------------------------------------------------------------------------
# Recommendation tests
# ---------------------------------------------------------------------------

class TestRecommendation:

    def test_interest_match_scores_higher(self, db):
        """Places matching user interests should score higher."""
        make_destination(db)
        make_place(db, 1, "Beach A", "Beach", ["Beach", "Relaxation"])
        make_place(db, 2, "Museum", "Culture", ["Culture", "History"])

        rec = RecommendationService()
        results = rec.recommend(
            db=db,
            destination="Cox's Bazar",
            interests=["Beach"],
            travel_style="Relaxed",
            activity_level="Low",
            daily_budget=5000,
        )
        scores = {p.name: s for p, s, _ in results}
        assert scores["Beach A"] > scores["Museum"], \
            "Beach place should score higher when user prefers Beach"

    def test_excluded_places_not_returned(self, db):
        """Excluded places must not appear in results."""
        make_destination(db)
        make_place(db, 1, "Place A", "Beach", ["Beach"])
        make_place(db, 2, "Place B", "Nature", ["Nature"])

        rec = RecommendationService()
        results = rec.recommend(
            db=db,
            destination="Cox's Bazar",
            interests=["Beach"],
            travel_style="Balanced",
            activity_level="Medium",
            daily_budget=5000,
            exclude_ids=[2],
        )
        returned_ids = [p.id for p, _, _ in results]
        assert 2 not in returned_ids, "Excluded place should not appear"

    def test_must_visit_always_included(self, db):
        """Must-visit places must be included with max score."""
        make_destination(db)
        make_place(db, 1, "Popular Beach", "Beach", ["Beach"], rating=2.0)
        make_place(db, 2, "Must Visit", "Culture", ["Culture"], rating=2.0)

        rec = RecommendationService()
        results = rec.recommend(
            db=db,
            destination="Cox's Bazar",
            interests=[],
            travel_style="Balanced",
            activity_level="Medium",
            daily_budget=5000,
            must_visit_ids=[2],
        )
        returned_ids = [p.id for p, _, _ in results]
        assert 2 in returned_ids, "Must-visit place must always be included"
        assert results[0][0].id == 2, "Must-visit should be first"

    def test_crowded_penalty(self, db):
        """High-crowd places should be penalised when avoid_crowded is True."""
        make_destination(db)
        make_place(db, 1, "Quiet Beach", "Beach", ["Beach"], crowd="Low")
        make_place(db, 2, "Crowded Beach", "Beach", ["Beach"], crowd="High")

        rec = RecommendationService()
        results = rec.recommend(
            db=db,
            destination="Cox's Bazar",
            interests=["Beach"],
            travel_style="Relaxed",
            activity_level="Low",
            daily_budget=5000,
            avoid_crowded=True,
        )
        scores = {p.name: s for p, s, _ in results}
        assert scores["Quiet Beach"] > scores["Crowded Beach"], \
            "Crowded places should score lower when avoid_crowded=True"

    def test_score_clamped_0_1(self, db):
        """All scores must be in [0, 1]."""
        make_destination(db)
        make_place(db, 1, "Test Place", "Beach", ["Beach", "Nature", "Food"])
        make_place(db, 2, "Low Place", "Culture", [], rating=1.0)

        rec = RecommendationService()
        results = rec.recommend(
            db=db,
            destination="Cox's Bazar",
            interests=["Beach"],
            travel_style="Relaxed",
            activity_level="Low",
            daily_budget=5000,
        )
        for _, score, _ in results:
            assert 0.0 <= score <= 1.0, f"Score {score} out of [0,1] range"

    def test_reasons_provided(self, db):
        """Each result should include at least one reason."""
        make_destination(db)
        make_place(db, 1, "Beach Place", "Beach", ["Beach"])

        rec = RecommendationService()
        results = rec.recommend(
            db=db,
            destination="Cox's Bazar",
            interests=["Beach"],
            travel_style="Balanced",
            activity_level="Medium",
            daily_budget=5000,
        )
        for _, _, reasons in results:
            assert len(reasons) >= 1, "At least one reason should be provided"


# ---------------------------------------------------------------------------
# Utility function tests
# ---------------------------------------------------------------------------

class TestUtils:

    def test_time_to_minutes(self):
        assert _time_to_minutes("09:00") == 540
        assert _time_to_minutes("13:30") == 810
        assert _time_to_minutes("00:00") == 0

    def test_minutes_to_time(self):
        assert _minutes_to_time(540) == "09:00"
        assert _minutes_to_time(810) == "13:30"
        assert _minutes_to_time(0) == "00:00"

    def test_haversine_same_point(self):
        d = _haversine_km(21.43, 92.0, 21.43, 92.0)
        assert d == pytest.approx(0.0, abs=0.001)

    def test_haversine_known_distance(self):
        # Laboni Beach to Inani Beach (~32 km road, Haversine ~20 km)
        d = _haversine_km(21.4272, 92.0058, 21.25, 92.01)
        assert 15 < d < 25, f"Expected ~20km, got {d:.1f}km"


# ---------------------------------------------------------------------------
# Itinerary service tests (integration)
# ---------------------------------------------------------------------------

class TestItineraryService:
    """Integration tests using the full itinerary service."""

    def test_generates_for_each_day(self, db):
        from app.services.itinerary.itinerary_service import ItineraryService
        from app.db.seeder import seed_database

        seed_database(db)
        trip = make_trip(db, ["Beach", "Nature"], "Balanced", "Medium", budget=25000)

        svc = ItineraryService()
        days = svc.generate(db, trip)

        assert len(days) == trip.num_days, "Should generate one Itinerary per day"

    def test_no_overlapping_activities(self, db):
        from app.services.itinerary.itinerary_service import ItineraryService
        from app.db.seeder import seed_database

        seed_database(db)
        trip = make_trip(db, ["Beach"], "Balanced", "Medium")
        svc = ItineraryService()
        days = svc.generate(db, trip)

        for day in days:
            items_sorted = sorted(day.items, key=lambda x: _time_to_minutes(x.start_time))
            for i in range(len(items_sorted) - 1):
                a = items_sorted[i]
                b = items_sorted[i + 1]
                assert _time_to_minutes(a.end_time) <= _time_to_minutes(b.start_time), \
                    f"Overlap: {a.title} ends {a.end_time}, {b.title} starts {b.start_time}"

    def test_respects_max_activities(self, db):
        from app.services.itinerary.itinerary_service import ItineraryService
        from app.db.seeder import seed_database

        seed_database(db)
        max_acts = 3
        trip = make_trip(db, ["Beach", "Nature"], "Balanced", "Medium", max_acts=max_acts)
        svc = ItineraryService()
        days = svc.generate(db, trip)

        for day in days:
            actual = len([i for i in day.items if i.item_type == "activity"])
            assert actual <= max_acts, \
                f"Day {day.day_number}: {actual} activities > max {max_acts}"


# ---------------------------------------------------------------------------
# API endpoint tests
# ---------------------------------------------------------------------------

class TestHealthEndpoint:
    """Tests for system endpoints."""

    def test_health_returns_healthy(self):
        from fastapi.testclient import TestClient
        from app.main import app
        client = TestClient(app)
        response = client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"

    def test_root_returns_info(self):
        from fastapi.testclient import TestClient
        from app.main import app
        client = TestClient(app)
        response = client.get("/")
        assert response.status_code == 200
        data = response.json()
        assert data["app"] == "Vromon"
        assert data["version"] == "2.0.0"


class TestDestinationEndpoints:
    """Tests for destination API endpoints."""

    def test_list_destinations(self):
        from fastapi.testclient import TestClient
        from app.main import app
        client = TestClient(app)
        response = client.get("/api/v1/destinations")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        # Should have at least Cox's Bazar from seed data
        assert len(data) >= 1
        assert data[0]["name"] == "Cox's Bazar"

    def test_get_destination_places(self):
        from fastapi.testclient import TestClient
        from app.main import app
        client = TestClient(app)
        response = client.get("/api/v1/destinations/1/places")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) > 0


class TestTripEndpoints:
    """Tests for trip API endpoints."""

    def test_create_trip(self):
        from fastapi.testclient import TestClient
        from app.main import app
        client = TestClient(app)
        trip_data = {
            "destination": "Cox's Bazar",
            "start_date": str(date.today()),
            "end_date": str(date.today() + timedelta(days=2)),
            "num_travelers": 2,
            "total_budget": 15000,
            "preference": {
                "interests": ["Beach", "Nature"],
                "travel_style": "Balanced",
                "activity_level": "Medium",
            },
            "constraints": {
                "max_activities_per_day": 4,
                "avoid_crowded": False,
            },
        }
        response = client.post("/api/v1/trips", json=trip_data)
        assert response.status_code == 201
        data = response.json()
        assert data["destination"] == "Cox's Bazar"
        assert data["status"] == "draft"

    def test_create_trip_invalid_dates(self):
        from fastapi.testclient import TestClient
        from app.main import app
        client = TestClient(app)
        trip_data = {
            "destination": "Cox's Bazar",
            "start_date": "2026-12-15",
            "end_date": "2026-12-10",  # before start
            "total_budget": 15000,
        }
        response = client.post("/api/v1/trips", json=trip_data)
        assert response.status_code == 422, "Should reject invalid date range"

    def test_create_trip_invalid_budget(self):
        from fastapi.testclient import TestClient
        from app.main import app
        client = TestClient(app)
        trip_data = {
            "destination": "Cox's Bazar",
            "start_date": "2026-12-10",
            "end_date": "2026-12-15",
            "total_budget": -1000,
        }
        response = client.post("/api/v1/trips", json=trip_data)
        assert response.status_code == 422, "Should reject negative budget"

    def test_list_trips(self):
        from fastapi.testclient import TestClient
        from app.main import app
        client = TestClient(app)
        response = client.get("/api/v1/trips")
        assert response.status_code == 200
        assert isinstance(response.json(), list)

    def test_get_nonexistent_trip(self):
        from fastapi.testclient import TestClient
        from app.main import app
        client = TestClient(app)
        response = client.get("/api/v1/trips/99999")
        assert response.status_code == 404

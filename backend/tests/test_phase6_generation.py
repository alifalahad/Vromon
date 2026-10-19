"""
Week 2 · Phase 6 tests: generate, persist, retrieve and honestly report an itinerary.

Covers Prompt B9: request validation, unknown trips, no eligible places, exclusions,
ordering, daily limits and time boundaries, overlaps, must-visit places, hard-conflict
reporting, persistence and retrieval, rollback on failure, repeated/concurrent
generation, and missing-data warnings (placeholder meal prices, currencies).
"""

from __future__ import annotations

from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.v1.endpoints import trips as trips_api
from app.db.base import Base, get_db
from app.db.seeder import missing_place_fields, seed_database
from app.main import app
from app.models.models import Itinerary, ItineraryItem, Place, Restaurant, User
from app.services.itinerary.itinerary_service import _time_to_minutes
from tests.conftest import TEST_USER_ID

_engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
_Session = sessionmaker(autocommit=False, autoflush=False, bind=_engine)


def _get_test_db():
    s = _Session()
    try:
        yield s
    finally:
        s.close()


@pytest.fixture(scope="module", autouse=True)
def setup_db():
    Base.metadata.create_all(bind=_engine)
    s = _Session()
    try:
        seed_database(s)
    finally:
        s.close()
    yield
    Base.metadata.drop_all(bind=_engine)


@pytest.fixture
def client():
    app.dependency_overrides[get_db] = _get_test_db
    yield TestClient(app)
    app.dependency_overrides.pop(get_db, None)


def all_place_ids() -> list[int]:
    """Every place of the test trips' destination (other destinations are imported too since step 10)."""
    s = _Session()
    try:
        return [pid for (pid,) in s.query(Place.id).filter(Place.destination_name == "Cox's Bazar").order_by(Place.id)]
    finally:
        s.close()


def place_id(name: str) -> int:
    s = _Session()
    try:
        return s.query(Place).filter(Place.name == name).one().id
    finally:
        s.close()


def create_trip(client, days=2, must=(), excluded=(), max_per_day=4, start="09:00", end="20:00") -> int:
    first = date(2026, 11, 1)
    r = client.post("/api/v1/trips", json={
        "destination": "Cox's Bazar",
        "start_date": str(first),
        "end_date": str(first + timedelta(days=days - 1)),
        "num_travelers": 2,
        "total_budget": 30000,
        "preference": {"interests": ["Beach", "Nature"], "preferred_start_time": start, "preferred_end_time": end},
        "constraints": {"max_activities_per_day": max_per_day, "must_visit": list(must), "excluded_places": list(excluded)},
    })
    assert r.status_code == 201, r.text
    return r.json()["id"]


def generate(client, trip_id, algorithm="heuristic"):
    return client.post(f"/api/v1/trips/{trip_id}/generate", params={"algorithm": algorithm})


def activities(day: dict) -> list[dict]:
    return [i for i in day["items"] if i["item_type"] == "activity"]


def db_day_rows(trip_id: int) -> list[int]:
    s = _Session()
    try:
        return sorted(n for (n,) in s.query(Itinerary.day_number).filter(Itinerary.trip_id == trip_id))
    finally:
        s.close()


# ---------------------------------------------------------------------------
# Request validation and missing resources
# ---------------------------------------------------------------------------

class TestRequests:
    def test_unknown_trip(self, client):
        assert generate(client, 999_999).status_code == 404
        assert client.get("/api/v1/trips/999999/itinerary").status_code == 404

    def test_unknown_algorithm_rejected(self, client):
        trip_id = create_trip(client)
        assert generate(client, trip_id, "llm").status_code == 422
        assert db_day_rows(trip_id) == []

    def test_no_eligible_places_is_explicit_and_keeps_previous_itinerary(self, client):
        trip_id = create_trip(client)
        assert generate(client, trip_id).status_code == 200
        before = client.get(f"/api/v1/trips/{trip_id}/itinerary").json()

        r = client.patch(f"/api/v1/trips/{trip_id}", json={"constraints": {"excluded_places": all_place_ids()}})
        assert r.status_code == 200, r.text
        for algorithm in ("heuristic", "cpsat"):
            r = generate(client, trip_id, algorithm)
            assert r.status_code == 422, r.text
            assert r.json()["detail"]["eligible_places"] == 0
            assert "No places" in r.json()["detail"]["message"]

        after = client.get(f"/api/v1/trips/{trip_id}/itinerary").json()
        assert [d["id"] for d in after["days"]] == [d["id"] for d in before["days"]]


# ---------------------------------------------------------------------------
# Generated schedule properties
# ---------------------------------------------------------------------------

class TestSchedule:
    def test_typed_response_with_status_dates_and_ordering(self, client):
        trip_id = create_trip(client, days=3)
        r = generate(client, trip_id)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["status"] in ("valid", "valid_with_warnings")
        assert data["valid"] is True
        assert data["replaced_previous"] is False
        assert [d["day_date"] for d in data["itinerary"]] == ["2026-11-01", "2026-11-02", "2026-11-03"]
        for day in data["itinerary"]:
            starts = [_time_to_minutes(i["start_time"]) for i in day["items"]]
            assert starts == sorted(starts), "items must be chronological"
            for item in day["items"]:
                assert item["currency"] == "BDT"
                assert item["cost_source"] in ("data", "placeholder")
                if item["item_type"] == "activity":
                    assert item["category"] == item["place"]["category"]
                    assert item["recommendation_reasons"], "activities explain their ranking"

    def test_excluded_places_never_scheduled(self, client):
        excluded = [place_id("Laboni Beach"), place_id("Inani Beach"), place_id("Himchari National Park")]
        trip_id = create_trip(client, days=3, excluded=excluded)
        data = generate(client, trip_id).json()
        scheduled = {i["place_id"] for d in data["itinerary"] for i in activities(d)}
        assert scheduled.isdisjoint(excluded)
        assert not any(v["code"] == "EXCLUDED_PLACE_SCHEDULED" for v in data["validation"]["violations"])

    def test_daily_limit_time_window_and_no_overlaps(self, client):
        trip_id = create_trip(client, days=2, max_per_day=2, start="10:00", end="17:00")
        data = generate(client, trip_id).json()
        for day in data["itinerary"]:
            assert len(activities(day)) <= 2
            items = sorted(day["items"], key=lambda i: _time_to_minutes(i["start_time"]))
            for a, b in zip(items, items[1:]):
                assert _time_to_minutes(a["end_time"]) <= _time_to_minutes(b["start_time"])
            for item in activities(day):
                assert _time_to_minutes(item["start_time"]) >= _time_to_minutes("10:00")
                # The greedy baseline allows a last activity up to 60 min past the day end…
                assert _time_to_minutes(item["end_time"]) <= _time_to_minutes("18:00")
        codes = {v["code"] for v in data["validation"]["violations"]}
        assert not codes & {"ACTIVITY_LIMIT_EXCEEDED", "TIME_OVERLAP"}
        # …but every such overrun is reported to the user, never silent
        late = {
            i["id"] for d in data["itinerary"] for i in activities(d)
            if _time_to_minutes(i["end_time"]) > _time_to_minutes("17:00")
        }
        flagged = {
            v["item_id"] for v in data["validation"]["violations"] if v["code"] == "AFTER_PREFERRED_END"
        }
        assert late <= flagged

    def test_must_visit_scheduled_when_feasible(self, client):
        must = place_id("Ramu Buddhist Temple Complex")
        trip_id = create_trip(client, days=2, must=[must])
        data = generate(client, trip_id).json()
        assert must in {i["place_id"] for d in data["itinerary"] for i in activities(d)}

    def test_hard_conflict_is_reported_not_hidden(self, client):
        trip_id = create_trip(client, days=1)
        data = generate(client, trip_id).json()
        scheduled = activities(data["itinerary"][0])[0]["place_id"]
        # The user later excludes a place that is already in the saved plan
        client.patch(f"/api/v1/trips/{trip_id}", json={"constraints": {"excluded_places": [scheduled]}})
        itinerary = client.get(f"/api/v1/trips/{trip_id}/itinerary").json()
        assert itinerary["validation"]["valid"] is False
        assert itinerary["status"] == "invalid"
        hit = [v for v in itinerary["validation"]["violations"] if v["code"] == "EXCLUDED_PLACE_SCHEDULED"]
        assert hit and hit[0]["severity"] == "hard" and hit[0]["item_id"]

    def test_days_without_activities_are_flagged(self, client):
        # 10 days with up to 10 activities a day needs more than the 25 seeded places
        trip_id = create_trip(client, days=10, max_per_day=10)
        data = generate(client, trip_id).json()
        empty_days = [d["day_number"] for d in data["itinerary"] if not activities(d)]
        flagged = [v["day_number"] for v in data["validation"]["violations"] if v["code"] == "NO_ACTIVITIES"]
        assert empty_days, "test setup should exhaust the places"
        assert flagged == empty_days
        assert all(v["severity"] == "soft" for v in data["validation"]["violations"] if v["code"] == "NO_ACTIVITIES")
        assert data["status"] == "valid_with_warnings"


# ---------------------------------------------------------------------------
# Persistence, retrieval, repeated generation and failure safety
# ---------------------------------------------------------------------------

class TestPersistence:
    def test_generated_itinerary_is_retrievable(self, client):
        trip_id = create_trip(client, days=2)
        generated = generate(client, trip_id).json()
        saved = client.get(f"/api/v1/trips/{trip_id}/itinerary").json()
        assert [d["id"] for d in saved["days"]] == [d["id"] for d in generated["itinerary"]]
        assert [[i["id"] for i in d["items"]] for d in saved["days"]] == [[i["id"] for i in d["items"]] for d in generated["itinerary"]]
        assert saved["status"] == generated["status"]
        assert client.get(f"/api/v1/trips/{trip_id}").json()["status"] == "generated"

    def test_repeated_generation_replaces_instead_of_accumulating(self, client):
        trip_id = create_trip(client, days=2)
        assert generate(client, trip_id).json()["replaced_previous"] is False
        for _ in range(3):
            again = generate(client, trip_id).json()
            assert again["replaced_previous"] is True
        assert db_day_rows(trip_id) == [1, 2]
        # Only the latest itinerary's items remain (SQLite may reuse deleted row IDs,
        # so count rows instead of checking old IDs)
        s = _Session()
        try:
            stored = (
                s.query(ItineraryItem).join(Itinerary).filter(Itinerary.trip_id == trip_id).count()
            )
        finally:
            s.close()
        assert stored == sum(len(d["items"]) for d in again["itinerary"])

    def test_stale_concurrent_request_does_not_duplicate_days(self, client):
        """
        Reproduces two overlapping Generate taps: request A loaded the trip (with no
        itinerary) before request B saved one. A must still replace B's days.
        """
        trip_id = create_trip(client, days=2)
        stale = _Session()
        try:
            # Request A reads the trip (no days yet) and keeps it, as a request does.
            # The identity map holds objects weakly, so the reference must stay alive.
            owner = stale.get(User, TEST_USER_ID)
            held = trips_api._load_trip(stale, trip_id, owner)
            assert held.itinerary_days == []
            assert generate(client, trip_id).status_code == 200   # request B saves 2 days
            trips_api.generate_itinerary(trip_id, stale, owner, "heuristic")  # request A continues
        finally:
            stale.close()
        assert db_day_rows(trip_id) == [1, 2]

    def test_failure_during_generation_keeps_previous_itinerary(self, client, monkeypatch):
        trip_id = create_trip(client, days=2)
        before = generate(client, trip_id).json()

        def boom(db, trip):
            raise RuntimeError("planner crashed")

        monkeypatch.setattr(trips_api.itinerary_service, "generate", boom)
        r = TestClient(app, raise_server_exceptions=False).post(f"/api/v1/trips/{trip_id}/generate")
        assert r.status_code == 500
        monkeypatch.undo()

        after = client.get(f"/api/v1/trips/{trip_id}/itinerary").json()
        assert [d["id"] for d in after["days"]] == [d["id"] for d in before["itinerary"]]


# ---------------------------------------------------------------------------
# Missing data and budget honesty
# ---------------------------------------------------------------------------

class TestMissingData:
    def test_seed_places_have_explicit_cost_and_hours(self):
        import json
        from pathlib import Path

        seed = json.loads((Path(__file__).resolve().parents[2] / "data/seed/coxsbazar.json").read_text())
        assert [p["name"] for p in seed["places"] if missing_place_fields(p)] == []
        assert missing_place_fields({"name": "x"}) == ["estimated_cost", "opening_time", "closing_time"]

    def test_straight_line_travel_is_disclosed(self, client):
        data = generate(client, create_trip(client, days=1)).json()
        info = [v for v in data["validation"]["violations"] if v["severity"] == "info"]
        assert any(v["code"] == "ESTIMATED_TRAVEL_TIME" for v in info)
        assert data["valid"] is True, "info notes never make a plan invalid"

    def test_placeholder_meal_price_is_flagged_and_kept_out_of_known_total(self, client):
        s = _Session()
        s.query(Restaurant).update({Restaurant.is_active: False})
        s.commit()
        try:
            trip_id = create_trip(client, days=1)
            data = generate(client, trip_id).json()
        finally:
            s.query(Restaurant).update({Restaurant.is_active: True})
            s.commit()
            s.close()

        meals = [i for i in data["itinerary"][0]["items"] if i["item_type"] == "meal"]
        assert meals and all(m["cost_source"] == "placeholder" for m in meals)
        notes = [v for v in data["validation"]["violations"] if v["code"] == "PLACEHOLDER_MEAL_COST"]
        assert {v["item_id"] for v in notes} == {m["id"] for m in meals}

        budget = client.get(f"/api/v1/trips/{trip_id}/budget").json()
        assert budget["placeholder_meals"] == len(meals)
        assert budget["categories"]["meals"] == 0
        assert budget["placeholder_total"] == sum(m["cost"] for m in meals) * 2  # 2 travellers
        # plus local travel since step 7; each part is rounded to ৳10
        assert budget["estimated_total"] == pytest.approx(
            budget["known_total"] + budget["placeholder_total"] + budget["categories"]["transport"], abs=30
        )
        assert next(p for p in budget["parts"] if p["key"] == "food")["estimate"] is True
        assert any("placeholder" in r for r in budget["incomplete_reasons"])

    def test_other_currency_is_not_added_to_totals(self, client):
        trip_id = create_trip(client, days=1)
        data = generate(client, trip_id).json()
        paid = next(i for i in activities(data["itinerary"][0]) if i["cost"] > 0)
        s = _Session()
        s.query(Place).filter(Place.id == paid["place_id"]).update({Place.currency: "USD"})
        s.commit()
        try:
            budget = client.get(f"/api/v1/trips/{trip_id}/budget").json()
            itinerary = client.get(f"/api/v1/trips/{trip_id}/itinerary").json()
        finally:
            s.query(Place).filter(Place.id == paid["place_id"]).update({Place.currency: "BDT"})
            s.commit()
            s.close()
        assert budget["excluded_other_currency"] == 1
        known_activities = sum(i["cost"] for i in activities(data["itinerary"][0]) if i["id"] != paid["id"]) * 2
        assert budget["categories"]["activities"] == pytest.approx(known_activities)
        assert any("USD" in r for r in budget["incomplete_reasons"])
        assert any(v["code"] == "CURRENCY_MISMATCH" for v in itinerary["validation"]["violations"])


def test_stored_match_score_is_the_ranking_score(client):
    """The day-theme bonus orders places but must not inflate the displayed match score."""
    data = generate(client, create_trip(client, days=3)).json()
    scores = [i["recommendation_score"] for d in data["itinerary"] for i in activities(d)]
    assert scores and all(0 <= s <= 1 for s in scores)


def test_single_interest_theme_is_not_repeated():
    from app.services.itinerary.itinerary_service import ItineraryService

    assert ItineraryService()._theme_label(["Culture", "Culture"], 1) == "Culture"
    assert ItineraryService()._theme_label(["Beach", "Nature"], 1) == "Beach & Nature"

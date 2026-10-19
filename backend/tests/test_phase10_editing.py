"""
Phase 10 tests — itinerary editing, adaptation, budget, saved trips, feedback.

Every edit must keep the itinerary consistent (recomputed travel legs and
totals, no overlaps, opening hours respected) and must return a fresh
validation report. Must-visit places are protected.
"""

from __future__ import annotations

from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base, get_db
from app.db.seeder import seed_database
from app.main import app
from app.models.models import Itinerary, Place
from app.services.itinerary.itinerary_service import _time_to_minutes

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


def place_id(name: str) -> int:
    s = _Session()
    try:
        return s.query(Place).filter(Place.name == name).one().id
    finally:
        s.close()


def create_trip(client, days=2, travelers=2, budget=30000, interests=("Beach", "Nature"),
                must=(), excluded=(), max_per_day=4, daily_cap=0.0, generate=True) -> dict:
    start = date(2026, 11, 1)
    payload = {
        "destination": "Cox's Bazar",
        "start_date": str(start),
        "end_date": str(start + timedelta(days=days - 1)),
        "num_travelers": travelers,
        "total_budget": budget,
        "preference": {"interests": list(interests), "travel_style": "Balanced",
                       "preferred_start_time": "09:00", "preferred_end_time": "20:00"},
        "constraints": {"max_activities_per_day": max_per_day, "must_visit": list(must),
                        "excluded_places": list(excluded), "max_daily_budget": daily_cap},
    }
    resp = client.post("/api/v1/trips", json=payload)
    assert resp.status_code == 201, resp.text
    trip = resp.json()
    if generate:
        gen = client.post(f"/api/v1/trips/{trip['id']}/generate")
        assert gen.status_code == 200, gen.text
    return trip


def itinerary(client, trip_id) -> dict:
    resp = client.get(f"/api/v1/trips/{trip_id}/itinerary")
    assert resp.status_code == 200
    return resp.json()


def activities(day: dict) -> list[dict]:
    return [i for i in day["items"] if i["item_type"] == "activity"]


def assert_day_consistent(day: dict):
    """Items are ordered, non-overlapping, inside opening hours; totals match items."""
    items = sorted(day["items"], key=lambda i: i["order_index"])
    for a, b in zip(items, items[1:]):
        assert _time_to_minutes(a["end_time"]) <= _time_to_minutes(b["start_time"]), (a["title"], b["title"])
    for i in activities(day):
        p = i["place"]
        assert _time_to_minutes(p["opening_time"]) <= _time_to_minutes(i["start_time"])
        assert _time_to_minutes(i["end_time"]) <= _time_to_minutes(p["closing_time"])
    assert day["total_cost"] == pytest.approx(sum(i["cost"] for i in items), abs=0.01)
    acts = activities(day)
    if acts:
        assert acts[-1]["travel_time_to_next"] == 0.0  # no leg to a removed/non-existent place


# ---------------------------------------------------------------------------
# Remove
# ---------------------------------------------------------------------------

class TestRemove:

    def test_remove_recomputes_day_and_returns_validation(self, client):
        trip = create_trip(client)
        day = itinerary(client, trip["id"])["days"][0]
        target = activities(day)[0]
        resp = client.delete(f"/api/v1/trips/{trip['id']}/items/{target['id']}")
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert target["title"] in data["message"]
        assert target["id"] not in [i["id"] for i in data["day"]["items"]]
        assert data["validation"]["valid"] is True
        assert_day_consistent(data["day"])

    def test_cannot_remove_item_of_another_trip(self, client):
        a = create_trip(client, days=1)
        b = create_trip(client, days=1)
        foreign = activities(itinerary(client, b["id"])["days"][0])[0]
        assert client.delete(f"/api/v1/trips/{a['id']}/items/{foreign['id']}").status_code == 404
        assert foreign["id"] in [i["id"] for i in itinerary(client, b["id"])["days"][0]["items"]]

    def test_must_visit_is_protected(self, client):
        mv = place_id("Ramu Buddhist Temple Complex")
        trip = create_trip(client, must=[mv])
        item = next(i for d in itinerary(client, trip["id"])["days"] for i in d["items"] if i["place_id"] == mv)
        resp = client.delete(f"/api/v1/trips/{trip['id']}/items/{item['id']}")
        assert resp.status_code == 409
        assert "must-visit" in resp.json()["detail"]

    def test_meals_cannot_be_removed(self, client):
        trip = create_trip(client, days=1)
        meal = next(i for i in itinerary(client, trip["id"])["days"][0]["items"] if i["item_type"] == "meal")
        assert client.delete(f"/api/v1/trips/{trip['id']}/items/{meal['id']}").status_code == 422


# ---------------------------------------------------------------------------
# Alternatives / replace
# ---------------------------------------------------------------------------

class TestReplace:

    def test_alternatives_fit_slot_and_are_unused(self, client):
        excl = place_id("Laboni Beach")
        trip = create_trip(client, excluded=[excl])
        it = itinerary(client, trip["id"])
        used = {i["place_id"] for d in it["days"] for i in activities(d)}
        target = activities(it["days"][0])[0]
        data = client.get(f"/api/v1/trips/{trip['id']}/items/{target['id']}/alternatives").json()
        assert data["alternatives"], "expected at least one alternative"
        for alt in data["alternatives"]:
            p = alt["place"]
            assert p["id"] not in used and p["id"] != excl
            assert _time_to_minutes(p["opening_time"]) <= _time_to_minutes(alt["start_time"])
            assert _time_to_minutes(alt["end_time"]) <= _time_to_minutes(p["closing_time"])

    def test_auto_replace_keeps_itinerary_valid(self, client):
        trip = create_trip(client)
        it = itinerary(client, trip["id"])
        target = activities(it["days"][0])[0]
        resp = client.post(f"/api/v1/trips/{trip['id']}/items/{target['id']}/replace", json={})
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert target["title"] not in [i["title"] for i in activities(data["day"])]
        assert data["validation"]["valid"] is True
        assert_day_consistent(data["day"])
        assert len(itinerary(client, trip["id"])["days"]) == len(it["days"])

    def test_replace_with_chosen_alternative(self, client):
        trip = create_trip(client)
        target = activities(itinerary(client, trip["id"])["days"][0])[0]
        alt = client.get(f"/api/v1/trips/{trip['id']}/items/{target['id']}/alternatives").json()["alternatives"][-1]
        resp = client.post(f"/api/v1/trips/{trip['id']}/items/{target['id']}/replace",
                           json={"place_id": alt["place"]["id"]})
        assert resp.status_code == 200, resp.text
        assert alt["place"]["name"] in [i["title"] for i in activities(resp.json()["day"])]

    def test_replace_with_excluded_or_used_place_rejected(self, client):
        excl = place_id("Laboni Beach")
        trip = create_trip(client, excluded=[excl])
        day = itinerary(client, trip["id"])["days"][0]
        a, b = activities(day)[:2]
        for bad in (excl, b["place_id"]):
            resp = client.post(f"/api/v1/trips/{trip['id']}/items/{a['id']}/replace", json={"place_id": bad})
            assert resp.status_code == 422
        assert a["id"] in [i["id"] for i in itinerary(client, trip["id"])["days"][0]["items"]]

    def test_must_visit_cannot_be_replaced(self, client):
        mv = place_id("Ramu Buddhist Temple Complex")
        trip = create_trip(client, must=[mv])
        item = next(i for d in itinerary(client, trip["id"])["days"] for i in d["items"] if i["place_id"] == mv)
        assert client.post(f"/api/v1/trips/{trip['id']}/items/{item['id']}/replace", json={}).status_code == 409


# ---------------------------------------------------------------------------
# Regenerate one day
# ---------------------------------------------------------------------------

class TestRegenerateDay:

    def test_day_changes_other_days_untouched(self, client):
        trip = create_trip(client, days=3)
        before = itinerary(client, trip["id"])
        day1 = before["days"][0]
        resp = client.post(f"/api/v1/trips/{trip['id']}/days/{day1['id']}/regenerate")
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert {i["place_id"] for i in activities(data["day"])} != {i["place_id"] for i in activities(day1)}
        assert data["validation"]["valid"] is True
        assert_day_consistent(data["day"])
        after = itinerary(client, trip["id"])
        assert len(after["days"]) == 3
        assert after["days"][1]["items"] == before["days"][1]["items"]
        assert after["days"][2]["items"] == before["days"][2]["items"]

    def test_must_visit_on_that_day_is_kept(self, client):
        mv = place_id("Himchari National Park")
        trip = create_trip(client, days=2, must=[mv])
        it = itinerary(client, trip["id"])
        day = next(d for d in it["days"] if mv in [i["place_id"] for i in d["items"]])
        data = client.post(f"/api/v1/trips/{trip['id']}/days/{day['id']}/regenerate").json()
        assert mv in [i["place_id"] for i in data["day"]["items"]]
        assert data["validation"]["valid"] is True

    def test_no_duplicate_day_rows_created(self, client):
        trip = create_trip(client, days=2)
        day = itinerary(client, trip["id"])["days"][0]
        client.post(f"/api/v1/trips/{trip['id']}/days/{day['id']}/regenerate")
        s = _Session()
        try:
            assert s.query(Itinerary).filter(Itinerary.trip_id == trip["id"]).count() == 2
        finally:
            s.close()

    def test_unknown_day_404(self, client):
        trip = create_trip(client, days=1)
        assert client.post(f"/api/v1/trips/{trip['id']}/days/999999/regenerate").status_code == 404


# ---------------------------------------------------------------------------
# Adapt
# ---------------------------------------------------------------------------

class TestAdapt:

    def adapt(self, client, trip_id, kind):
        resp = client.post(f"/api/v1/trips/{trip_id}/adapt", json={"adaptation_type": kind})
        assert resp.status_code == 200, resp.text
        return resp.json()

    def test_relax_removes_one_per_day_and_reports_changes(self, client):
        trip = create_trip(client, days=2)
        before = itinerary(client, trip["id"])
        data = self.adapt(client, trip["id"], "relax")
        assert data["changed"] is True
        assert len(data["changes"]) == sum(1 for d in before["days"] if len(activities(d)) > 1)
        for b, a in zip(before["days"], data["days"]):
            if len(activities(b)) > 1:
                assert len(activities(a)) == len(activities(b)) - 1
            assert_day_consistent(a)
        assert data["validation"]["valid"] is True

    def test_adaptations_never_remove_must_visit(self, client):
        mv = place_id("Sunset Boat Ride")   # paid, so a reduce_budget candidate
        trip = create_trip(client, days=1, must=[mv])
        assert mv in [i["place_id"] for i in itinerary(client, trip["id"])["days"][0]["items"]]
        for kind in ("relax", "reduce_budget", "avoid_crowds", "relax", "reduce_budget"):
            data = self.adapt(client, trip["id"], kind)
            assert mv in [i["place_id"] for d in data["days"] for i in d["items"]], kind

    def test_reduce_budget_only_removes_paid_activities(self, client):
        trip = create_trip(client, days=2)
        data = self.adapt(client, trip["id"], "reduce_budget")
        assert all(c["cost"] > 0 for c in data["changes"])

    def test_avoid_crowds_removes_high_crowd_places(self, client):
        trip = create_trip(client, days=2)
        data = self.adapt(client, trip["id"], "avoid_crowds")
        remaining = [i for d in data["days"] for i in activities(d)]
        assert all(i["place"]["crowd_level"] != "High" for i in remaining)

    def test_energise_adds_activity_that_fits(self, client):
        trip = create_trip(client, days=1, max_per_day=6)
        self.adapt(client, trip["id"], "relax")
        before = len(activities(itinerary(client, trip["id"])["days"][0]))
        data = self.adapt(client, trip["id"], "energise")
        assert data["changed"] is True
        assert data["changes"][0]["action"] == "added"
        assert len(activities(data["days"][0])) == before + 1
        assert_day_consistent(data["days"][0])
        assert data["validation"]["valid"] is True

    def test_energise_reports_no_change_when_day_is_full(self, client):
        trip = create_trip(client, days=1, max_per_day=1)
        data = self.adapt(client, trip["id"], "energise")
        assert data["changed"] is False
        assert "No change" in data["message"]

    def test_adapt_requires_itinerary(self, client):
        trip = create_trip(client, generate=False)
        resp = client.post(f"/api/v1/trips/{trip['id']}/adapt", json={"adaptation_type": "relax"})
        assert resp.status_code == 409

    def test_unknown_adaptation_rejected(self, client):
        trip = create_trip(client, days=1)
        resp = client.post(f"/api/v1/trips/{trip['id']}/adapt", json={"adaptation_type": "teleport"})
        assert resp.status_code == 422


# ---------------------------------------------------------------------------
# Budget
# ---------------------------------------------------------------------------

class TestBudget:

    def test_breakdown_is_consistent_with_itinerary(self, client):
        trip = create_trip(client, days=3, travelers=3, budget=50000)
        it = itinerary(client, trip["id"])
        data = client.get(f"/api/v1/trips/{trip['id']}/budget").json()
        acts = sum(i["cost"] for d in it["days"] for i in activities(d))
        meals = sum(i["cost"] for d in it["days"] for i in d["items"] if i["item_type"] == "meal")
        assert data["categories"]["activities"] == pytest.approx(acts * 3)
        assert data["categories"]["meals"] == pytest.approx(meals * 3)
        assert data["nights"] == 2
        assert data["categories"]["accommodation"] == pytest.approx(data["hotel"]["price_per_night"] * 2 * 2)
        # Local travel is counted since step 7 (an estimate); no starting city, so no getting there
        assert data["categories"]["transport"] > 0
        cats = data["categories"]
        # each part is rounded to ৳10
        assert data["estimated_total"] == pytest.approx(
            cats["activities"] + cats["meals"] + cats["accommodation"] + cats["transport"], abs=30
        )
        assert data["remaining"] == pytest.approx(50000 - data["estimated_total"])
        assert data["over_budget"] is (data["estimated_total"] > 50000)
        assert not any(p["key"] == "getting_there" and p["known"] for p in data["parts"])

    def test_over_budget_flag(self, client):
        trip = create_trip(client, days=3, travelers=4, budget=1000)
        assert client.get(f"/api/v1/trips/{trip['id']}/budget").json()["over_budget"] is True

    def test_budget_tracks_edits(self, client):
        trip = create_trip(client, days=1, travelers=1)
        before = client.get(f"/api/v1/trips/{trip['id']}/budget").json()["categories"]["activities"]
        paid = [i for i in activities(itinerary(client, trip["id"])["days"][0]) if i["cost"] > 0]
        if not paid:
            pytest.skip("no paid activity in this itinerary")
        client.delete(f"/api/v1/trips/{trip['id']}/items/{paid[0]['id']}")
        after = client.get(f"/api/v1/trips/{trip['id']}/budget").json()["categories"]["activities"]
        assert after == pytest.approx(before - paid[0]["cost"])


# ---------------------------------------------------------------------------
# Saved trips, duplicate, delete, feedback, itinerary validation
# ---------------------------------------------------------------------------

class TestSavedTrips:

    def test_itinerary_includes_validation(self, client):
        trip = create_trip(client)
        assert itinerary(client, trip["id"])["validation"]["valid"] is True

    def test_duplicate_copies_settings_not_itinerary(self, client):
        mv = place_id("Himchari National Park")
        trip = create_trip(client, must=[mv])
        resp = client.post(f"/api/v1/trips/{trip['id']}/duplicate")
        assert resp.status_code == 201
        copy = resp.json()
        assert copy["id"] != trip["id"]
        assert copy["title"].endswith("(Copy)")
        assert copy["status"] == "draft"
        assert copy["preference"]["interests"] == trip["preference"]["interests"]
        assert copy["constraints"]["must_visit"] == [mv]
        assert itinerary(client, copy["id"])["days"] == []

    def test_delete_trip(self, client):
        trip = create_trip(client, days=1)
        assert client.delete(f"/api/v1/trips/{trip['id']}").status_code == 204
        assert client.get(f"/api/v1/trips/{trip['id']}").status_code == 404
        assert trip["id"] not in [t["id"] for t in client.get("/api/v1/trips").json()]

    def test_feedback_roundtrip_and_update(self, client):
        trip = create_trip(client, days=1)
        assert client.get(f"/api/v1/trips/{trip['id']}/feedback").json() is None
        r = client.post(f"/api/v1/trips/{trip['id']}/feedback",
                        json={"rating": 4, "tags": ["Great food"], "comment": "Nice"})
        assert r.status_code == 201
        client.post(f"/api/v1/trips/{trip['id']}/feedback", json={"rating": 5, "tags": [], "comment": None})
        fb = client.get(f"/api/v1/trips/{trip['id']}/feedback").json()
        assert fb["rating"] == 5

    def test_feedback_rating_validated(self, client):
        trip = create_trip(client, days=1)
        assert client.post(f"/api/v1/trips/{trip['id']}/feedback", json={"rating": 9}).status_code == 422


class TestDailyCapWithMeals:
    """The default planner must reserve lunch/dinner cost before accepting activities."""

    @pytest.mark.parametrize("cap", [2000, 2500, 3000])
    def test_heuristic_generation_and_regenerate_day_respect_cap(self, client, cap):
        trip = create_trip(client, days=3, daily_cap=cap, must=[], interests=("Beach", "Nature", "Photography"))
        it = itinerary(client, trip["id"])
        codes = [v["code"] for v in it["validation"]["violations"]]
        assert "DAILY_BUDGET_EXCEEDED" not in codes
        for day in it["days"]:
            r = client.post(f"/api/v1/trips/{trip['id']}/days/{day['id']}/regenerate").json()
            assert "DAILY_BUDGET_EXCEEDED" not in [v["code"] for v in r["validation"]["violations"]], r["day"]

"""
Android Phase 3: geography reference data, visits and travel stats.

Uses the real data/geo/*.json (Natural Earth, Bangladesh point of view; GeoNames),
seeded once into the shared test database.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta

import pytest
from fastapi import Depends
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.api.v1.endpoints import geo as geo_api
from app.core.auth import get_current_user
from app.db import get_db
from app.db.geo_seed import seed_geo
from app.main import app
from app.models.models import User, Visit
from tests.conftest import _ApiTestSession


@pytest.fixture(scope="module", autouse=True)
def geo_data():
    with _ApiTestSession() as db:
        assert seed_geo(db), "data/geo/*.json missing: run scripts/geo/build.sh"


@pytest.fixture
def client():
    return TestClient(app)


def _user(name: str) -> User:
    with _ApiTestSession() as db:
        u = User(auth_subject=f"{name}-{uuid.uuid4()}", friend_code=uuid.uuid4().hex[:8].upper(), username=f"{name}{uuid.uuid4().hex[:6]}")
        db.add(u)
        db.commit()
        db.refresh(u)
        return u


@pytest.fixture
def act_as():
    """Switch the signed-in user for the next requests."""
    def _as(user: User):
        def current_user(db: Session = Depends(get_db)) -> User:
            return db.get(User, user.id)  # loaded in the request's own session, like the real dependency

        app.dependency_overrides[get_current_user] = current_user
    yield _as


# ---------------------------------------------------------------------------
# Reference data
# ---------------------------------------------------------------------------

class TestReferenceData:
    def test_countries_follow_the_bangladesh_point_of_view(self, client):
        countries = {c["iso2"]: c for c in client.get("/api/v1/geo/countries").json()}
        assert countries["BD"]["name"] == "Bangladesh" and countries["BD"]["name_bn"] == "বাংলাদেশ"
        assert "IL" not in countries  # drawn as part of Palestine in this point of view
        assert countries["PS"]["counts_toward_world"] is True  # UN observer
        assert countries["VA"]["counts_toward_world"] is True  # UN observer
        assert sum(c["counts_toward_world"] for c in countries.values()) == 194  # decision D6 as amended

    def test_regions_and_city_search(self, client):
        regions = client.get("/api/v1/geo/regions", params={"country": "bd"}).json()
        assert any(r["name"].startswith("Dhaka") for r in regions)
        assert all(r["country_iso2"] == "BD" for r in regions)
        cities = client.get("/api/v1/geo/cities", params={"q": "dhak"}).json()
        assert cities[0]["name"] == "Dhaka" and cities[0]["country_iso2"] == "BD"  # largest first
        assert client.get("/api/v1/geo/cities", params={"q": "x"}).status_code == 422  # too short

    def test_tiles_support_range_requests(self, client):
        if not (geo_api.TILES_DIR / "regions.pmtiles").is_file():
            pytest.skip("PMTiles not built")
        resp = client.get("/api/v1/geo/tiles/regions.pmtiles", headers={"Range": "bytes=0-126"})
        assert resp.status_code == 206
        assert len(resp.content) == 127 and resp.content[:7] == b"PMTiles"
        assert client.get("/api/v1/geo/tiles/../../.env").status_code == 404
        assert client.get("/api/v1/geo/tiles/secret.pmtiles").status_code == 404


# ---------------------------------------------------------------------------
# Visits
# ---------------------------------------------------------------------------

class TestVisits:
    def test_upsert_update_and_delete(self, client, act_as):
        act_as(_user("v"))
        body = {"visits": [
            {"place_type": "country", "place_code": "BD", "status": "lived"},
            {"place_type": "country", "place_code": "NP", "status": "want"},
            {"place_type": "city", "place_code": "1185241", "status": "visited", "first_visited_on": "2024-01-02"},  # Dhaka
        ]}
        rows = client.put("/api/v1/me/visits", json=body).json()
        assert {r["place_code"]: r["country_iso2"] for r in rows} == {"BD": "BD", "NP": "NP", "1185241": "BD"}
        assert {(r["place_type"], r["place_code"], r["status"]) for r in rows} == {
            ("country", "BD", "lived"), ("country", "NP", "want"), ("city", "1185241", "visited"),
        }
        rows = client.put("/api/v1/me/visits", json={"visits": [{"place_type": "country", "place_code": "NP", "status": "visited"}]}).json()
        assert next(r for r in rows if r["place_code"] == "NP")["status"] == "visited"
        assert client.delete("/api/v1/me/visits/country/NP").status_code == 204
        assert client.delete("/api/v1/me/visits/country/NP").status_code == 204  # idempotent

    def test_unknown_places_and_bad_dates_are_rejected(self, client, act_as):
        act_as(_user("bad"))
        bad = client.put("/api/v1/me/visits", json={"visits": [
            {"place_type": "country", "place_code": "IL", "status": "visited"},
            {"place_type": "city", "place_code": "999999999", "status": "visited"},
        ]})
        assert bad.status_code == 422
        assert "country:IL" in bad.json()["detail"] and "city:999999999" in bad.json()["detail"]
        dates = {"place_type": "country", "place_code": "BD", "status": "visited", "first_visited_on": "2025-05-02", "last_visited_on": "2025-05-01"}
        assert client.put("/api/v1/me/visits", json={"visits": [dates]}).status_code == 422
        assert client.put("/api/v1/me/visits", json={"visits": [{"place_type": "planet", "place_code": "X", "status": "visited"}]}).status_code == 422

    def test_last_write_wins_for_offline_edits(self, client, act_as):
        act_as(_user("lww"))
        now = datetime.utcnow()
        client.put("/api/v1/me/visits", json={"visits": [{"place_type": "country", "place_code": "IN", "status": "lived", "client_updated_at": now.isoformat()}]})
        stale = (now - timedelta(hours=1)).isoformat()
        rows = client.put("/api/v1/me/visits", json={"visits": [{"place_type": "country", "place_code": "IN", "status": "want", "client_updated_at": stale}]}).json()
        assert next(r for r in rows if r["place_code"] == "IN")["status"] == "lived"


# ---------------------------------------------------------------------------
# Stats
# ---------------------------------------------------------------------------

def test_stats(client, act_as):
    user = _user("stats")
    act_as(user)
    client.put("/api/v1/me/visits", json={"visits": [
        {"place_type": "country", "place_code": "BD", "status": "lived"},       # lived counts as visited
        {"place_type": "country", "place_code": "FR", "status": "visited"},
        {"place_type": "country", "place_code": "GL", "status": "visited"},     # Greenland: territory, not in the world count
        {"place_type": "country", "place_code": "JP", "status": "want"},        # wanting doesn't count
        {"place_type": "city", "place_code": "1185241", "status": "visited"},
        {"place_type": "region", "place_code": "BD-C", "status": "visited"},
    ]})
    s = client.get(f"/api/v1/users/{user.id}/stats").json()
    assert (s["countries"], s["cities"], s["want_to_visit"]) == (3, 1, 1)
    assert s["world_countries"] == 2 and s["world_total"] == 194
    assert s["world_percent"] == round(100 * 2 / 194, 1)
    assert s["continent_names"] == ["Asia", "Europe", "North America"]


# ---------------------------------------------------------------------------
# Privacy, export, deletion
# ---------------------------------------------------------------------------

def test_strangers_get_404_for_visits_and_stats(client, act_as):
    alice, bob = _user("alice"), _user("bob")
    act_as(alice)
    client.put("/api/v1/me/visits", json={"visits": [{"place_type": "country", "place_code": "BD", "status": "visited"}]})
    assert client.get(f"/api/v1/users/{alice.id}/visits").status_code == 200
    act_as(bob)
    assert client.get(f"/api/v1/users/{alice.id}/visits").status_code == 404
    assert client.get(f"/api/v1/users/{alice.id}/stats").status_code == 404
    # Bob's delete can't touch Alice's visit
    client.delete("/api/v1/me/visits/country/BD")
    with _ApiTestSession() as db:
        assert db.query(Visit).filter(Visit.user_id == alice.id).count() == 1


def test_export_includes_visits_and_delete_removes_them(client, act_as):
    user = _user("gone")
    act_as(user)
    client.put("/api/v1/me/visits", json={"visits": [{"place_type": "country", "place_code": "NP", "status": "visited", "note": "Annapurna"}]})
    exported = client.get("/api/v1/me/export").json()
    assert exported["visits"][0]["place_code"] == "NP" and exported["visits"][0]["note"] == "Annapurna"
    assert client.delete("/api/v1/me").status_code == 204
    with _ApiTestSession() as db:
        assert db.query(Visit).filter(Visit.user_id == user.id).count() == 0

"""
Phase 11 tests — input validation, partial updates, CORS, admin guard.

Every case here was accepted (or crashed with 500) before Phase 11.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.config import settings
from app.db.base import Base, get_db
from app.db.seeder import seed_database
from app.main import app

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
    yield TestClient(app, raise_server_exceptions=False)
    app.dependency_overrides.pop(get_db, None)


BASE = {"destination": "Cox's Bazar", "start_date": "2026-11-01", "end_date": "2026-11-02",
        "num_travelers": 2, "total_budget": 20000}


def detail_text(resp) -> str:
    return str(resp.json()["detail"])


class TestTripValidation:

    @pytest.mark.parametrize("time", ["abc", "25:99", "9:00", "24:00", "12:60", ""])
    def test_malformed_times_rejected(self, client, time):
        r = client.post("/api/v1/trips", json={**BASE, "preference": {"preferred_start_time": time}})
        assert r.status_code == 422

    def test_day_must_end_after_it_starts(self, client):
        r = client.post("/api/v1/trips", json={**BASE, "preference": {"preferred_start_time": "18:00", "preferred_end_time": "09:00"}})
        assert r.status_code == 422
        assert "later than" in detail_text(r)

    def test_must_visit_and_excluded_overlap_rejected(self, client):
        r = client.post("/api/v1/trips", json={**BASE, "constraints": {"must_visit": [1], "excluded_places": [1]}})
        assert r.status_code == 422
        assert "both must-visit and excluded" in detail_text(r)

    def test_unknown_destination_rejected(self, client):
        r = client.post("/api/v1/trips", json={**BASE, "destination": "Atlantis"})
        assert r.status_code == 422
        assert "Unknown destination" in detail_text(r)

    def test_unknown_place_ids_rejected(self, client):
        r = client.post("/api/v1/trips", json={**BASE, "constraints": {"must_visit": [99999]}})
        assert r.status_code == 422
        assert "99999" in detail_text(r)

    def test_non_positive_place_ids_rejected(self, client):
        assert client.post("/api/v1/trips", json={**BASE, "constraints": {"excluded_places": [0]}}).status_code == 422

    def test_trip_length_limited(self, client):
        assert client.post("/api/v1/trips", json={**BASE, "end_date": "2027-11-01"}).status_code == 422
        assert client.post("/api/v1/trips", json={**BASE, "end_date": "2026-11-30"}).status_code == 201

    def test_all_problems_reported_together(self, client):
        r = client.post("/api/v1/trips", json={
            **BASE, "destination": "Atlantis",
            "preference": {"preferred_start_time": "18:00", "preferred_end_time": "09:00"},
        })
        assert r.status_code == 422
        assert len(r.json()["detail"]) >= 2

    def test_valid_trip_still_generates(self, client):
        r = client.post("/api/v1/trips", json={**BASE, "preference": {"interests": ["Beach"]},
                                               "constraints": {"must_visit": [2], "excluded_places": [1]}})
        assert r.status_code == 201, r.text
        assert client.post(f"/api/v1/trips/{r.json()['id']}/generate").status_code == 200


class TestPartialUpdate:

    def make(self, client):
        r = client.post("/api/v1/trips", json={
            **BASE,
            "preference": {"interests": ["Beach"], "preferred_start_time": "08:00", "preferred_end_time": "21:00"},
            "constraints": {"max_activities_per_day": 6, "max_daily_budget": 3000, "excluded_places": [1]},
        })
        assert r.status_code == 201, r.text
        return r.json()["id"]

    def test_patch_changes_only_sent_fields(self, client):
        tid = self.make(client)
        r = client.patch(f"/api/v1/trips/{tid}", json={"constraints": {"must_visit": [2]}})
        assert r.status_code == 200, r.text
        cons = r.json()["constraints"]
        assert cons["must_visit"] == [2]
        assert cons["max_activities_per_day"] == 6       # not reset to the default 4
        assert cons["max_daily_budget"] == 3000          # not reset to 0
        assert cons["excluded_places"] == [1]
        pref = client.patch(f"/api/v1/trips/{tid}", json={"preference": {"preferred_end_time": "22:00"}}).json()["preference"]
        assert pref["preferred_start_time"] == "08:00" and pref["preferred_end_time"] == "22:00"
        assert pref["interests"] == ["Beach"]

    def test_patch_validates_merged_values_and_rolls_back(self, client):
        tid = self.make(client)
        r = client.patch(f"/api/v1/trips/{tid}", json={"constraints": {"must_visit": [1]}})  # 1 is excluded
        assert r.status_code == 422
        r = client.patch(f"/api/v1/trips/{tid}", json={"preference": {"preferred_end_time": "07:00"}})
        assert r.status_code == 422
        trip = client.get(f"/api/v1/trips/{tid}").json()
        assert trip["constraints"]["must_visit"] == []
        assert trip["preference"]["preferred_end_time"] == "21:00"

    def test_status_restricted(self, client):
        tid = self.make(client)
        assert client.patch(f"/api/v1/trips/{tid}", json={"status": "hacked"}).status_code == 422
        assert client.patch(f"/api/v1/trips/{tid}", json={"status": "saved"}).status_code == 200


class TestHostileInput:

    def test_sql_like_strings_are_harmless(self, client):
        assert client.get("/api/v1/places", params={"destination": "x' OR '1'='1"}).json() == []
        assert client.get("/api/v1/rag/search", params={"q": "' OR 1=1 --", "source_type": '%"; DROP'}).status_code == 200

    def test_errors_do_not_leak_exception_types(self, client, monkeypatch):
        import app.api.v1.endpoints.trips as trips_mod

        def boom(*a, **k):
            raise RuntimeError("secret internal detail")
        monkeypatch.setattr(trips_mod, "_trip_summary_out", boom)
        client.post("/api/v1/trips", json=BASE)
        r = client.get("/api/v1/trips")
        assert r.status_code == 500
        assert "RuntimeError" not in r.text and "secret internal detail" not in r.text


class TestCorsAndAdmin:

    def test_cors_allows_configured_origin_only(self, client):
        allowed = settings.cors_origins_list[0]   # whatever CORS_ORIGINS is set to
        ok = client.options("/api/v1/trips", headers={"Origin": allowed, "Access-Control-Request-Method": "GET"})
        assert ok.headers.get("access-control-allow-origin") == allowed
        bad = client.options("/api/v1/trips", headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "DELETE"})
        assert bad.headers.get("access-control-allow-origin") is None

    def test_ingest_open_in_development_without_token(self, client, monkeypatch):
        monkeypatch.setattr(settings, "admin_token", "")
        monkeypatch.setattr(settings, "app_env", "development")
        assert client.post("/api/v1/rag/ingest").status_code == 200

    def test_ingest_requires_token_when_configured(self, client, monkeypatch):
        monkeypatch.setattr(settings, "admin_token", "s3cret-token")
        assert client.post("/api/v1/rag/ingest").status_code == 401
        assert client.post("/api/v1/rag/ingest", headers={"X-Admin-Token": "wrong"}).status_code == 401
        assert client.post("/api/v1/rag/ingest", headers={"X-Admin-Token": "s3cret-token"}).status_code == 200

    def test_ingest_disabled_in_production_without_token(self, client, monkeypatch):
        monkeypatch.setattr(settings, "admin_token", "")
        monkeypatch.setattr(settings, "app_env", "production")
        assert client.post("/api/v1/rag/ingest").status_code == 403

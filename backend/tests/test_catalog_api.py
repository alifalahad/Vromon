"""
Data platform: the read-only catalog API. Only published records are served, and every
field says where it came from (guideline §1.1, §6.2).
"""

from __future__ import annotations

import uuid
from datetime import datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete

from app.main import app
from app.models.catalog import (
    AdminAdjacency, AdminBoundary, AdminUnit, Attraction, AttractionCategory, AttractionMedia, DataSource,
)
from tests.conftest import _ApiTestSession

SQUARE = '{"type":"Polygon","coordinates":[[[90.0,22.0],[90.5,22.0],[90.5,22.5],[90.0,22.5],[90.0,22.0]]]}'


@pytest.fixture(scope="module", autouse=True)
def catalog():
    ids = {k: uuid.uuid4() for k in ("div", "d1", "d2", "a1", "a2")}
    now = datetime.utcnow()
    with _ApiTestSession() as db:
        db.add_all([
            DataSource(source_id="t_wikidata", source_name="Wikidata", organization="Wikimedia", source_type="open_dataset",
                       access_method="api", license_name="CC0 1.0", attribution_text="Wikidata (CC0)",
                       terms_review_status="open_license", reliability_class="community_geospatial", recommended_use="production"),
            AttractionCategory(code="t_religious", name_en="Religious sites", name_bn="ধর্মীয় স্থান", app_category="Culture"),
        ])
        db.flush()
        db.add_all([
            AdminUnit(id=ids["div"], country_iso2="BD", level="division", slug="t-division-barishal", name_en="Barishal",
                      name_bn="বরিশাল", status="published", field_status={}),
            AdminUnit(id=ids["d1"], country_iso2="BD", level="district", slug="t-district-barishal", name_en="Barishal",
                      name_bn="বরিশাল", parent_id=ids["div"], status="published",
                      field_status={"name_bn": {"status": "verified", "source_id": "t_wikidata", "verified_at": now.isoformat()}}),
            AdminUnit(id=ids["d2"], country_iso2="BD", level="district", slug="t-district-bhola", name_en="Bhola",
                      parent_id=ids["div"], status="published", field_status={}),
        ])
        db.flush()
        db.add_all([
            AdminBoundary(admin_unit_id=ids["d1"], source_id="t_wikidata", geometry_geojson=SQUARE, simplify_tolerance_deg=0.0005,
                          min_lon=90.0, min_lat=22.0, max_lon=90.5, max_lat=22.5),
            AdminAdjacency(unit_id=ids["d1"], neighbor_id=ids["d2"], shared_border_km=40.0, method="test"),
            Attraction(id=ids["a1"], slug="t-guthia-mosque", canonical_name_en="Guthia Mosque", canonical_name_bn="গুঠিয়া মসজিদ",
                       category_code="t_religious", district_id=ids["d1"], latitude=22.1, longitude=90.1, status="published",
                       field_status={"latitude": {"status": "verified", "source_id": "t_wikidata"},
                                     "opening_hours": {"status": "unknown"}}),
            Attraction(id=ids["a2"], slug="t-not-reviewed", canonical_name_en="Not Reviewed", district_id=ids["d1"],
                       status="needs_review", field_status={}),
        ])
        db.flush()
        db.add_all([
            AttractionMedia(attraction_id=ids["a1"], original_url="https://commons.wikimedia.org/wiki/File:G.jpg",
                            file_url="https://upload.wikimedia.org/g.jpg", source_id="t_wikidata", license="CC BY-SA 4.0",
                            attribution="Rahim, CC BY-SA 4.0, via Wikimedia Commons", retrieved_at=now,
                            approval_status="auto_approved"),
            AttractionMedia(attraction_id=ids["a1"], original_url="https://commons.wikimedia.org/wiki/File:Unclear.jpg",
                            source_id="t_wikidata", license="Fair use", retrieved_at=now, approval_status="needs_review"),
        ])
        db.commit()
    yield ids
    with _ApiTestSession() as db:
        db.execute(delete(AttractionMedia).where(AttractionMedia.attraction_id == ids["a1"]))
        db.execute(delete(Attraction).where(Attraction.id.in_([ids["a1"], ids["a2"]])))
        db.execute(delete(AdminAdjacency).where(AdminAdjacency.unit_id == ids["d1"]))
        db.execute(delete(AdminBoundary).where(AdminBoundary.admin_unit_id == ids["d1"]))
        db.execute(delete(AdminUnit).where(AdminUnit.id.in_([ids["d1"], ids["d2"]])))
        db.execute(delete(AdminUnit).where(AdminUnit.id == ids["div"]))
        db.execute(delete(AttractionCategory).where(AttractionCategory.code == "t_religious"))
        db.execute(delete(DataSource).where(DataSource.source_id == "t_wikidata"))
        db.commit()


@pytest.fixture
def client():
    return TestClient(app)


def test_districts_of_a_division(client):
    r = client.get("/api/v1/catalog/admin-units", params={"level": "district", "parent": "t-division-barishal"})
    assert r.status_code == 200
    assert [d["slug"] for d in r.json()] == ["t-district-barishal", "t-district-bhola"]
    assert r.headers["cache-control"].startswith("public")


def test_district_detail_has_neighbours_sources_and_outline(client):
    d = client.get("/api/v1/catalog/admin-units/t-district-barishal", params={"geometry": True}).json()
    assert [n["slug"] for n in d["neighbors"]] == ["t-district-bhola"]
    assert d["parent_slug"] == "t-division-barishal"
    assert d["fields"]["name_bn"]["status"] == "verified" and d["fields"]["name_bn"]["license"] == "CC0 1.0"
    assert d["geometry"]["type"] == "Polygon"


def test_only_published_attractions_are_served(client):
    rows = client.get("/api/v1/catalog/attractions", params={"district": "t-district-barishal"}).json()
    assert [a["slug"] for a in rows] == ["t-guthia-mosque"]
    assert client.get("/api/v1/catalog/attractions/t-not-reviewed").status_code == 404


def test_attraction_detail_says_what_is_unknown(client):
    a = client.get("/api/v1/catalog/attractions/t-guthia-mosque").json()
    assert a["name_bn"] == "গুঠিয়া মসজিদ"
    assert a["fields"]["latitude"] == {**a["fields"]["latitude"], "status": "verified", "source": "Wikidata"}
    assert a["fields"]["opening_hours"]["status"] == "unknown" and a["opening_hours"] is None
    assert a["attribution"] == ["Wikidata (CC0)"]
    # Only the photo with an open licence, with its credit line
    assert [p["attribution"] for p in a["photos"]] == ["Rahim, CC BY-SA 4.0, via Wikimedia Commons"]


def test_search_in_bangla_and_english(client):
    assert [a["slug"] for a in client.get("/api/v1/catalog/attractions", params={"q": "guthia"}).json()] == ["t-guthia-mosque"]
    assert [a["slug"] for a in client.get("/api/v1/catalog/attractions", params={"q": "গুঠিয়া"}).json()] == ["t-guthia-mosque"]


def test_unknown_level_is_rejected(client):
    assert client.get("/api/v1/catalog/admin-units", params={"level": "planet"}).status_code == 422

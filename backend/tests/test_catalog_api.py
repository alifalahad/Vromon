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


def test_transport_endpoints_serve_published_records_only(client):
    from app.models.catalog import FareProduct, TimetableVersion, Train, TrainService, TransportOperator
    with _ApiTestSession() as db:
        op = TransportOperator(slug="t-railway", operator_type="railway")
        db.add(op)
        db.flush()
        v = TimetableVersion(operator_id=op.id, name="Time table no. 54", zone="t", status="published")
        draft = TimetableVersion(operator_id=op.id, name="Draft", zone="t", status="needs_review")
        t = Train(operator_id=op.id, train_number="t705", name_bn="একতা এক্সপ্রেস")
        db.add_all([v, draft, t])
        db.flush()
        db.add_all([
            TrainService(timetable_version_id=v.id, train_id=t.id, origin_name="ঢাকা", destination_name="পঞ্চগড়",
                         departure_time="10:15", arrival_time="21:00", arrival_day_offset=0, runs_daily=True,
                         status="published", field_status={}),
            TrainService(timetable_version_id=draft.id, train_id=t.id, origin_name="ঢাকা", destination_name="পঞ্চগড়",
                         status="needs_review", field_status={}),
            FareProduct(mode="train", origin_name="ঢাকা", destination_name="পঞ্চগড়", fare_class="snigdha", amount=900,
                        fare_type="official_operator", source_id="t_wikidata", last_checked_at=datetime.utcnow(),
                        status="published"),
            FareProduct(mode="train", origin_name="ঢাকা", destination_name="পঞ্চগড়", fare_class="ac_seat", amount=1000,
                        fare_type="official_operator", source_id="t_wikidata", last_checked_at=datetime.utcnow(),
                        status="needs_review"),
        ])
        db.commit()
    rows = client.get("/api/v1/catalog/trains", params={"from": "ঢাকা"}).json()
    assert [(r["train_number"], r["timetable"], r["runs_daily"]) for r in rows] == [("t705", "Time table no. 54", True)]
    fares = client.get("/api/v1/catalog/fares", params={"mode": "train", "from": "ঢাকা"}).json()
    assert [(f["fare_class"], f["fare_type"]) for f in fares] == [("snigdha", "official_operator")]


def test_journey_plan_labels_what_is_calculated_and_what_is_missing(client):
    from app.models.catalog import JourneyCalculation
    with _ApiTestSession() as db:
        db.add(JourneyCalculation(origin_ref="admin_unit:t-district-barishal", destination_ref="admin_unit:t-district-bhola",
                                  origin_lat=22.7, origin_lon=90.35, destination_lat=22.68, destination_lon=90.65, mode="road",
                                  distance_km=60.5, duration_min=95, engine="openrouteservice", profile="driving-car",
                                  network_version="test", is_estimate=True, calculated_at=datetime.utcnow()))
        db.commit()
    plan = client.get("/api/v1/catalog/journeys/plan", params={"from": "t-district-barishal", "to": "t-district-bhola"}).json()
    assert plan["road"]["distance_km"] == 60.5 and plan["road"]["kind"] == "calculated"
    assert any(m.startswith("train:") for m in plan["missing"]) and any(m.startswith("fares:") for m in plan["missing"])
    assert client.get("/api/v1/catalog/journeys/plan", params={"from": "x", "to": "y"}).status_code == 404


def test_foods_only_published_with_their_gi_evidence(client):
    from app.models.catalog import LocalFood
    with _ApiTestSession() as db:
        import uuid as _u
        d = db.scalar(__import__("sqlalchemy").select(AdminUnit.id).where(AdminUnit.slug == "t-district-barishal"))
        db.add_all([LocalFood(slug="t-gi-1", name_bn="বরিশালের আমড়া", is_food=True, district_id=d, district_evidence="product_name",
                              gi_registration_no="১", source_id="t_wikidata", status="published", last_checked_at=datetime.utcnow()),
                    LocalFood(slug="t-gi-2", name_bn="অন্য পণ্য", is_food=True, district_id=d, district_evidence="applicant",
                              source_id="t_wikidata", status="needs_review", last_checked_at=datetime.utcnow())])
        db.commit()
    rows = client.get("/api/v1/catalog/foods", params={"district": "t-district-barishal"}).json()
    assert [(r["name_bn"], r["district_evidence"]) for r in rows] == [("বরিশালের আমড়া", "product_name")]


def test_hotels_say_what_is_official_and_what_is_a_listing(client):
    from app.models.catalog import ServicePlace
    with _ApiTestSession() as db:
        d = db.scalar(__import__("sqlalchemy").select(AdminUnit.id).where(AdminUnit.slug == "t-district-barishal"))
        db.add_all([
            ServicePlace(slug="t-sea-gull", kind="accommodation", category="hotel", name_en="Sea Gull", district_id=d,
                         official_star_rating=5, listing_confidence=0.9, status="published", field_status={}),
            ServicePlace(slug="t-inn", kind="accommodation", category="inn", name_en="Small Inn", district_id=d,
                         listing_confidence=0.95, status="published", field_status={}),
            ServicePlace(slug="t-unchecked", kind="accommodation", name_en="Pending", district_id=d, status="needs_review",
                         field_status={}),
        ])
        db.commit()
    rows = client.get("/api/v1/catalog/hotels", params={"district": "t-district-barishal"}).json()
    assert [(r["slug"], r["trust"], r["price"]) for r in rows] == [("t-sea-gull", "official", None), ("t-inn", "business_listing", None)]
    assert [r["slug"] for r in client.get("/api/v1/catalog/hotels", params={"stars": 5}).json()] == ["t-sea-gull"]

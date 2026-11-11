"""
Explore: Bangladesh's districts with their GI foods and photos, and the world's countries and
cities with Wikidata's facts. Only published records and approved photos are served.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete

from app.main import app
from app.models.catalog import AdminBoundary, AdminUnit, Attraction, AttractionMedia, CountryFacts, GeoMedia, LocalFood
from app.models.models import City, Country
from tests.conftest import _ApiTestSession

SQUARE = '{"type":"Polygon","coordinates":[[[90.0,22.0],[90.5,22.0],[90.5,22.5],[90.0,22.5],[90.0,22.0]]]}'


@pytest.fixture(scope="module", autouse=True)
def world():
    ids = {k: uuid.uuid4() for k in ("div", "d1", "d2", "a1")}
    now = datetime.utcnow()
    added_bd = False
    with _ApiTestSession() as db:
        if db.get(Country, "BD") is None:
            db.add(Country(iso2="BD", iso3="BGD", name="Bangladesh", continent="Asia", counts_toward_world=True))
            added_bd = True
        db.add_all([
            Country(iso2="QZ", name="Testland", name_bn="টেস্টল্যান্ড", continent="Testinent", counts_toward_world=True),
            Country(iso2="QY", name="Smallland", continent="Testinent", counts_toward_world=False, type="Dependency"),
            AdminUnit(id=ids["div"], country_iso2="BD", level="division", slug="x-division-khulna", name_en="Khulna",
                      status="published", field_status={}),
        ])
        db.flush()
        db.add_all([
            CountryFacts(iso2="QZ", wikidata_id="Q1", capital_en="Test City", population=5_000_000, population_year=2024,
                         area_km2=1000.0, currencies=[{"code": "TST", "name": "test"}], languages=["Testish"],
                         calling_codes=["+999"], source_id="wikidata", retrieved_at=now),
            CountryFacts(iso2="QY", wikidata_id="Q2", population=1000, source_id="wikidata", retrieved_at=now),
            GeoMedia(entity_type="country", entity_key="QZ", original_url="https://commons.wikimedia.org/wiki/File:T.jpg",
                     file_url="https://upload.wikimedia.org/t.jpg", license="CC BY-SA 4.0", attribution="A, CC BY-SA 4.0",
                     source_id="wikimedia_commons", approval_status="auto_approved", retrieved_at=now),
            GeoMedia(entity_type="country", entity_key="QY", original_url="https://commons.wikimedia.org/wiki/File:U.jpg",
                     license="Fair use", source_id="wikimedia_commons", approval_status="needs_review", retrieved_at=now),
            City(geonameid=990001, country_iso2="QZ", name="Testopolis", lat=1.0, lon=2.0, population=900_000),
            City(geonameid=990002, country_iso2="QZ", name="Smallton", lat=1.1, lon=2.1, population=20_000),
            AdminUnit(id=ids["d1"], country_iso2="BD", level="district", slug="x-district-bagerhat", name_en="Bagerhat",
                      name_bn="বাগেরহাট", parent_id=ids["div"], status="published", field_status={}, area_km2=3959.0),
            AdminUnit(id=ids["d2"], country_iso2="BD", level="district", slug="x-district-satkhira", name_en="Satkhira",
                      parent_id=ids["div"], status="published", field_status={}),
        ])
        db.flush()
        db.add_all([
            AdminBoundary(admin_unit_id=ids["d2"], source_id="t", geometry_geojson=SQUARE, simplify_tolerance_deg=0.0005,
                          min_lon=90.0, min_lat=22.0, max_lon=90.5, max_lat=22.5),
            GeoMedia(entity_type="district", entity_key="x-district-bagerhat",
                     original_url="https://commons.wikimedia.org/wiki/File:Sixty_Dome.jpg", file_url="https://u/s.jpg",
                     license="CC BY 4.0", attribution="B, CC BY 4.0", source_id="wikimedia_commons",
                     approval_status="auto_approved", retrieved_at=now),
            Attraction(id=ids["a1"], slug="x-mangrove", canonical_name_en="Mangrove Park", district_id=ids["d2"],
                       latitude=22.2, longitude=90.2, status="published", field_status={}),
            LocalFood(slug="x-bagerhat-prawn", name_bn="বাগেরহাটের চিংড়ি", name_en="Bagerhat prawn", is_food=True,
                      district_id=ids["d1"], gi_registration_no="99", gi_application_date=date(2022, 1, 1),
                      source_id="dpdt_gi", status="published", last_checked_at=now),
            LocalFood(slug="x-bagerhat-mat", name_bn="মাদুর", is_food=False, district_id=ids["d1"], source_id="dpdt_gi",
                      status="published", last_checked_at=now),
            LocalFood(slug="x-bagerhat-pending", name_bn="অপেক্ষমাণ", is_food=True, district_id=ids["d1"],
                      source_id="dpdt_gi", status="needs_review", last_checked_at=now),
        ])
        db.commit()
    yield ids
    with _ApiTestSession() as db:
        db.execute(delete(LocalFood).where(LocalFood.slug.like("x-bagerhat-%")))
        db.execute(delete(Attraction).where(Attraction.id == ids["a1"]))
        db.execute(delete(GeoMedia).where(GeoMedia.entity_key.in_(["QZ", "QY", "x-district-bagerhat"])))
        db.execute(delete(AdminBoundary).where(AdminBoundary.admin_unit_id == ids["d2"]))
        db.execute(delete(AdminUnit).where(AdminUnit.id.in_([ids["d1"], ids["d2"]])))
        db.execute(delete(AdminUnit).where(AdminUnit.id == ids["div"]))
        db.execute(delete(City).where(City.geonameid.in_([990001, 990002])))
        db.execute(delete(CountryFacts).where(CountryFacts.iso2.in_(["QZ", "QY"])))
        db.execute(delete(Country).where(Country.iso2.in_(["QZ", "QY"] + (["BD"] if added_bd else []))))
        db.commit()


@pytest.fixture
def client():
    return TestClient(app)


def test_bangladesh_divisions_districts_photos_and_gi_foods(client):
    r = client.get("/api/v1/explore/bangladesh")
    assert r.status_code == 200
    body = r.json()
    khulna = next(d for d in body["divisions"] if d["slug"] == "x-division-khulna")
    cards = {d["slug"]: d for d in khulna["districts"]}
    bagerhat, satkhira = cards["x-district-bagerhat"], cards["x-district-satkhira"]
    assert bagerhat["photo"]["kind"] == "photo" and bagerhat["photo"]["attribution"] == "B, CC BY 4.0"
    assert bagerhat["counts"]["gi_foods"] == 1 and bagerhat["counts"]["gi_products"] == 1   # the pending one isn't counted
    # No photo of its own nor of an attraction: Esri's imagery over the district, credited
    assert satkhira["photo"]["kind"] == "satellite" and "Esri" in satkhira["photo"]["attribution"]
    assert satkhira["bbox"] == [90.0, 22.0, 90.5, 22.5] and satkhira["counts"]["attractions"] == 1
    foods = [f["name_bn"] for f in body["gi_foods"]]
    assert "বাগেরহাটের চিংড়ি" in foods and "মাদুর" not in foods and "অপেক্ষমাণ" not in foods


def test_district_detail_has_its_foods_products_and_outline(client):
    r = client.get("/api/v1/explore/districts/x-district-bagerhat")
    assert r.status_code == 200
    d = r.json()
    assert d["name_bn"] == "বাগেরহাট" and d["division_en"] == "Khulna"
    assert {f["name_bn"] for f in d["foods"]} == {"বাগেরহাটের চিংড়ি", "মাদুর"}
    assert client.get("/api/v1/explore/districts/x-district-satkhira").json()["geometry"]["type"] == "Polygon"
    assert client.get("/api/v1/explore/districts/x-division-khulna").status_code == 404


def test_countries_with_facts_and_only_approved_photos(client):
    r = client.get("/api/v1/explore/countries", params={"continent": "Testinent"})
    assert r.status_code == 200
    rows = r.json()
    assert [c["iso2"] for c in rows] == ["QZ", "QY"]                    # largest population first
    assert rows[0]["photo"]["url"] == "https://upload.wikimedia.org/t.jpg" and rows[1]["photo"] is None
    assert rows[0]["facts"]["capital_en"] == "Test City" and rows[0]["facts"]["calling_codes"] == ["+999"]
    detail = client.get("/api/v1/explore/countries/qz").json()
    assert [c["name"] for c in detail["cities"]] == ["Testopolis", "Smallton"]


def test_continents_count_their_countries(client):
    c = next(x for x in client.get("/api/v1/explore/continents").json() if x["name"] == "Testinent")
    assert c["countries"] == 2 and c["un_members_and_observers"] == 1 and c["population"] == 5_001_000
    assert [x["iso2"] for x in c["largest"]] == ["QZ", "QY"]


def test_search_finds_districts_countries_and_cities(client):
    r = client.get("/api/v1/explore/search", params={"q": "testo"})
    assert [c["name"] for c in r.json()["cities"]] == ["Testopolis"]
    r = client.get("/api/v1/explore/search", params={"q": "বাগেরহাট"})
    assert [d["slug"] for d in r.json()["districts"]] == ["x-district-bagerhat"]
    assert client.get("/api/v1/explore/search", params={"q": "opolis"}).json()["cities"] == []   # names start with it


def test_district_map_is_the_published_render_as_jpeg(client, world, tmp_path, monkeypatch):
    from PIL import Image

    from app.api.v1.endpoints import explore
    from app.models.catalog import MapExport

    Image.new("RGB", (216, 270), "white").save(tmp_path / "x-district-bagerhat-en.png")
    monkeypatch.setattr(explore, "MAPS_DIR", tmp_path)
    monkeypatch.setattr(explore, "MAP_CACHE", tmp_path / "web")
    with _ApiTestSession() as db:
        db.add_all([
            MapExport(district_id=world["d1"], language="en", variant="final", file_path="x-district-bagerhat-en.png",
                      sha256="ab" * 32, template_version="district-map-1", status="published",
                      credits={"credits_on_map": ["Terrain: Copernicus DEM GLO-90, ESA/EU"]}),
            MapExport(district_id=world["d1"], language="bn", variant="final", file_path="x-district-bagerhat-bn.png",
                      sha256="cd" * 32, template_version="district-map-1", status="needs_review", credits={}),
        ])
        db.commit()
    try:
        meta = client.get("/api/v1/explore/districts/x-district-bagerhat/maps").json()
        assert meta["languages"] == ["en"] and meta["credits"] == ["Terrain: Copernicus DEM GLO-90, ESA/EU"]
        r = client.get("/api/v1/explore/districts/x-district-bagerhat/map", params={"lang": "en", "size": "card"})
        assert r.status_code == 200 and r.headers["content-type"] == "image/jpeg"
        assert client.get("/api/v1/explore/districts/x-district-bagerhat/map", params={"lang": "bn"}).status_code == 404
    finally:
        with _ApiTestSession() as db:
            db.execute(delete(MapExport).where(MapExport.district_id == world["d1"]))
            db.commit()

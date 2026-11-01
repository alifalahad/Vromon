"""Map home step 4: each destination's country and region, for matching map places to destinations."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.db.geo_seed import seed_geo
from app.main import app
from app.models.models import Destination
from app.services.destination_places import fill_destination_places, region_near
from tests.conftest import _ApiTestSession


def _destination(db, name: str, lat: float, lon: float, country: str = "Bangladesh") -> Destination:
    dest = db.query(Destination).filter(Destination.name == name).first()
    if dest is None:
        dest = Destination(name=name, country=country, latitude=lat, longitude=lon)
        db.add(dest)
        db.commit()
    return dest


def test_regions_come_from_the_nearest_city():
    with _ApiTestSession() as db:
        assert seed_geo(db)
        assert region_near(db, "BD", 24.8949, 91.8687) == "BD-G"   # Sylhet
        assert region_near(db, "BD", 24.75, 90.41) == "BD-H"       # Mymensingh
        assert region_near(db, "BD", 21.4272, 92.0058) == "BD-B"   # Cox's Bazar, Chattogram division
        assert region_near(db, "BD", 10.0, 80.0) is None           # far from every Bangladeshi city


def test_destinations_get_country_and_region_and_the_api_returns_them():
    with _ApiTestSession() as db:
        assert seed_geo(db)
        _destination(db, "Sylhet (test)", 24.8949, 91.8687)
        _destination(db, "Nowhere (test)", 0.0, 0.0, country="Atlantis")
        fill_destination_places(db)
        assert fill_destination_places(db) == 0  # nothing left to fill: cheap to run at every start

    rows = {d["name"]: d for d in TestClient(app).get("/api/v1/destinations").json()}
    assert rows["Sylhet (test)"]["country_iso2"] == "BD"
    assert rows["Sylhet (test)"]["region_code"] == "BD-G"
    if "Nowhere (test)" in rows:
        assert rows["Nowhere (test)"]["region_code"] is None

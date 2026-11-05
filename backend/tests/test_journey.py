"""
Getting there, door to door (services.journey): timetabled trains, flights between airports, buses
from named terminals, a hired car; the traveller's chosen modes first, else by budget.
"""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy import delete

from app.models.catalog import TimetableVersion, Train, TrainService, TransportHub, TransportOperator
from app.services import journey
from app.services.routing.roads import ROADS
from tests.conftest import _ApiTestSession

START = journey.Point(23.80, 90.40, "Testpur")
DEST = journey.Point(22.30, 91.80, "Sea Town")       # ~220 km away


@pytest.fixture(scope="module")
def network():
    ids = {k: uuid.uuid4() for k in ("op", "tt", "train", "s1", "s2", "a1", "a2", "b1", "b2", "svc")}
    with _ApiTestSession() as db:
        db.add(TransportOperator(id=ids["op"], slug="x-railway", name_en="Test Railway", operator_type="railway"))
        db.flush()
        db.add_all([
            TimetableVersion(id=ids["tt"], operator_id=ids["op"], name="x-timetable", status="published"),
            Train(id=ids["train"], operator_id=ids["op"], train_number="X701", name_en="Sea Express"),
            TransportHub(id=ids["s1"], slug="x-st-1", hub_type="railway_station", name_en="Testpur Station",
                         latitude=23.82, longitude=90.41, status="published", field_status={}),
            TransportHub(id=ids["s2"], slug="x-st-2", hub_type="railway_station", name_en="Sea Town Station",
                         latitude=22.31, longitude=91.81, status="published", field_status={}),
            TransportHub(id=ids["a1"], slug="x-ap-1", hub_type="airport", name_en="Testpur Airport", iata_code="TPX",
                         latitude=23.85, longitude=90.40, status="published", field_status={}),
            TransportHub(id=ids["a2"], slug="x-ap-2", hub_type="airport", name_en="Sea Town Airport", iata_code="STX",
                         latitude=22.25, longitude=91.82, status="published", field_status={}),
            TransportHub(id=ids["b1"], slug="x-bt-1", hub_type="bus_terminal", name_en="Testpur Bus Terminal",
                         latitude=23.79, longitude=90.42, status="published", field_status={}),
            TransportHub(id=ids["b2"], slug="x-bt-2", hub_type="bus_terminal", name_en="Corner bus stop",
                         latitude=22.30, longitude=91.80, status="published", field_status={}),
        ])
        db.flush()
        db.add(TrainService(id=ids["svc"], timetable_version_id=ids["tt"], train_id=ids["train"], origin_hub_id=ids["s1"],
                            destination_hub_id=ids["s2"], departure_time="07:00", arrival_time="12:30", off_day=2,
                            status="published", field_status={}))
        db.commit()
    ROADS.reset()   # no road data: the straight-line estimate, said so
    yield ids
    with _ApiTestSession() as db:
        db.execute(delete(TrainService).where(TrainService.id == ids["svc"]))
        db.execute(delete(TransportHub).where(TransportHub.id.in_([ids[k] for k in ("s1", "s2", "a1", "a2", "b1", "b2")])))
        db.execute(delete(Train).where(Train.id == ids["train"]))
        db.execute(delete(TimetableVersion).where(TimetableVersion.id == ids["tt"]))
        db.execute(delete(TransportOperator).where(TransportOperator.id == ids["op"]))
        db.commit()


def _plan(**kw):
    with _ApiTestSession() as db:
        return journey.plan(db, START, DEST, **{"preferred": [], "by_budget": True, "budget_per_person": 20000,
                                                "travellers": 2, **kw})


def test_every_way_with_its_legs_and_what_is_estimated(network):
    p = _plan(preferred=["train"], by_budget=False)
    modes = [o["mode"] for o in p["options"]]
    assert modes[0] == "train" and set(modes) == {"train", "plane", "bus", "car"}
    train = p["options"][0]
    assert train["recommended"] and train["reason"].startswith("Your choice")
    rail = next(l for l in train["legs"] if l["mode"] == "train")
    assert (rail["depart"], rail["arrive"]) == ("07:00", "12:30") and "Sea Express (X701)" in rail["detail"]
    assert "doesn't run on Wed" in rail["detail"] and rail["fare_kind"] == "estimate"
    plane = next(o for o in p["options"] if o["mode"] == "plane")
    assert [l["mode"] for l in plane["legs"]] == ["cng", "plane", "cng"] and "TPX" in plane["legs"][1]["from"]
    bus = next(o for o in p["options"] if o["mode"] == "bus")
    assert bus["legs"][0]["to"] == "Testpur Bus Terminal" or bus["legs"][0]["from"] == "Testpur Bus Terminal"
    assert all("Corner bus stop" not in (l["from"], l["to"]) for l in bus["legs"])   # not a terminal
    assert p["road_source"].startswith("estimate")


def test_by_budget_the_fastest_that_fits_else_the_cheapest(network):
    rich = _plan(budget_per_person=100000)
    assert rich["options"][0]["mode"] == "plane" and rich["options"][0]["reason"].startswith("The fastest way that fits")
    poor = _plan(budget_per_person=1000)
    best = poor["options"][0]
    assert best["reason"].startswith("The cheapest way")
    assert best["cost_per_person"] == min(o["cost_per_person"] for o in poor["options"])


def test_launch_isnt_made_up(network):
    p = _plan(preferred=["launch"], by_budget=False)
    assert "launch" not in [o["mode"] for o in p["options"]] and any(m.startswith("launch") for m in p["missing"])


from tests.test_phase10_editing import client, setup_db  # noqa: E402,F401 (fixtures)


def test_a_trip_from_your_location_with_your_ways(client, network):
    from app.models.models import City, Country
    with _ApiTestSession() as db:
        if not db.get(Country, "BD"):
            db.add(Country(iso2="BD", name="Bangladesh"))
        if not db.get(City, 990900):
            db.add(City(geonameid=990900, country_iso2="BD", name="Testpur", lat=23.81, lon=90.41, population=50000))
        db.commit()
    payload = {"destination": "Cox's Bazar", "start_date": "2026-11-01", "end_date": "2026-11-02", "num_travelers": 2,
               "total_budget": 30000, "preference": {"interests": ["Beach"]},
               "origin_point": {"lat": 23.80, "lon": 90.40, "label": "Your location"}, "transport_modes": ["bus", "car"]}
    r = client.post("/api/v1/trips", json=payload)
    assert r.status_code == 201, r.text
    tid = r.json()["id"]
    j = client.get(f"/api/v1/trips/{tid}/journey").json()
    assert j["from"] == "Your location" and j["preferences"]["transport_modes"] == ["bus", "car"]
    assert j["options"][0]["mode"] in ("bus", "car") and j["options"][0]["recommended"]
    j = client.put(f"/api/v1/trips/{tid}/journey/preferences", json={"transport_modes": [], "transport_by_budget": True}).json()
    assert j["preferences"]["transport_by_budget"] and j["options"][0]["reason"]
    assert client.put(f"/api/v1/trips/{tid}/journey/preferences", json={"transport_modes": ["rocket"]}).status_code == 422

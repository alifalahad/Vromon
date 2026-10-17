"""
Android Phase 7: trip stops (D7), trip statistics (prompt §6.8: completed trips
only, duration = end − start + 1, weeks / months / years, the 20-day example),
and the "mark these places as visited?" offer.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import date, timedelta

import pytest
from fastapi import Depends
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.auth import get_current_user, new_friend_code
from app.db import get_db
from app.db.geo_seed import seed_geo
from app.main import app
from app.models.models import Trip, User, Visit
from app.services.stats.trips import summarize, trip_days, trip_phase, viewer_today
from tests.conftest import _ApiTestSession

API = "/api/v1"
COX = 1336134  # GeoNames: Cox's Bazar
DHAKA = 1185241
KOLKATA = 1275004


@pytest.fixture(scope="module", autouse=True)
def geo_data():
    with _ApiTestSession() as db:
        assert seed_geo(db)


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def act_as():
    def _as(user: User):
        def current_user(db: Session = Depends(get_db)) -> User:
            return db.get(User, user.id)

        app.dependency_overrides[get_current_user] = current_user
    yield _as


def _user(name: str) -> User:
    with _ApiTestSession() as db:
        u = User(auth_subject=f"{name}-{uuid.uuid4()}", friend_code=new_friend_code(),
                 username=f"{name}{uuid.uuid4().hex[:6]}", display_name=name.title())
        db.add(u)
        db.commit()
        db.refresh(u)
        return u


def _trip(client, start: date, days: int = 2, **extra) -> dict:
    body = {
        "destination": "Cox's Bazar", "start_date": str(start), "end_date": str(start + timedelta(days=days - 1)),
        "num_travelers": 1, "total_budget": 20000, "preference": {"interests": ["Beach"]}, "constraints": {}, **extra,
    }
    resp = client.post(f"{API}/trips", json=body)
    assert resp.status_code in (200, 201), resp.text
    return resp.json()


# ---------------------------------------------------------------------------
# The maths (pure)
# ---------------------------------------------------------------------------

@dataclass
class _Stop:
    country_iso2: str
    city_geonameid: int | None = None
    transport_mode: str | None = None


@dataclass
class _Trip:
    start_date: date
    end_date: date
    stops: list = field(default_factory=list)
    id: int = 1
    title: str | None = None
    destination: str = "Somewhere"


COUNTRIES = {"BD": ("Bangladesh", "Asia"), "IN": ("India", "Asia"), "FR": ("France", "Europe")}


class TestMaths:
    def test_the_20_day_example(self):
        assert trip_days(date(2026, 10, 12), date(2026, 10, 31)) == 20  # 10-trips-tab.jpg
        assert trip_days(date(2026, 10, 12), date(2026, 10, 12)) == 1

    def test_only_completed_trips_count(self):
        trip = _Trip(date(2026, 10, 12), date(2026, 10, 31), [_Stop("IN", KOLKATA, "plane"), _Stop("BD", DHAKA, "plane")])
        before = summarize([trip], date(2026, 10, 1), COUNTRIES)
        during = summarize([trip], date(2026, 10, 20), COUNTRIES)
        last_day = summarize([trip], date(2026, 10, 31), COUNTRIES)
        after = summarize([trip], date(2026, 11, 1), COUNTRIES)
        assert (before.trips, before.total_days, before.upcoming) == (0, 0, 1)  # the screenshot: 0 trips, 1 upcoming
        assert (during.trips, during.ongoing) == (0, 1)
        assert last_day.trips == 0  # still ongoing on its last day
        assert (after.trips, after.total_days, after.countries, after.cities, after.continents) == (1, 20, 2, 2, 1)

    def test_weeks_months_years_and_average(self):
        trips = [_Trip(date(2026, 10, 12), date(2026, 10, 31), id=1), _Trip(date(2025, 3, 1), date(2025, 3, 3), id=2)]
        s = summarize(trips, date(2027, 1, 1), COUNTRIES)
        assert s.total_days == 23
        assert s.weeks == round(23 / 7, 2) == 3.29
        assert s.months == round(23 / 30.44, 2) == 0.76
        assert s.years == round(23 / 365.25, 2) == 0.06
        assert s.average_days == 11.5
        assert s.longest_trip == {"trip_id": 1, "title": "Somewhere", "days": 20}
        assert s.per_year == [{"year": 2025, "trips": 1, "days": 3}, {"year": 2026, "trips": 1, "days": 20}]

    def test_nothing_completed_is_all_zeros(self):
        s = summarize([], date(2026, 10, 17), COUNTRIES)
        assert (s.trips, s.total_days, s.weeks, s.months, s.years, s.average_days) == (0, 0, 0.0, 0.0, 0.0, 0.0)
        assert s.longest_trip is None and s.most_visited_country is None

    def test_countries_continents_modes_and_most_visited(self):
        trips = [
            _Trip(date(2026, 1, 1), date(2026, 1, 5), [_Stop("BD", DHAKA, "bus"), _Stop("IN", KOLKATA, "train")], id=1),
            _Trip(date(2026, 2, 1), date(2026, 2, 2), [_Stop("BD", DHAKA), _Stop("FR", None, "plane")], id=2),
        ]
        s = summarize(trips, date(2026, 10, 17), COUNTRIES)
        assert (s.countries, s.cities, s.continents) == (3, 2, 2)
        assert s.continent_names == ["Asia", "Europe"]
        assert s.most_visited_country == {"iso2": "BD", "name": "Bangladesh", "trips": 2}
        assert {m["mode"]: m["count"] for m in s.transport_modes} == {"bus": 1, "train": 1, "plane": 1}

    def test_phases(self):
        today = date(2026, 10, 17)
        assert trip_phase(date(2026, 10, 18), date(2026, 10, 20), today) == "upcoming"
        assert trip_phase(date(2026, 10, 17), date(2026, 10, 17), today) == "ongoing"
        assert trip_phase(date(2026, 10, 10), date(2026, 10, 16), today) == "past"

    def test_the_phones_today_is_trusted_within_a_day(self):
        today = date.today()
        assert viewer_today(today + timedelta(days=1)) == today + timedelta(days=1)
        assert viewer_today(today - timedelta(days=5)) == today
        assert viewer_today(None) == today


# ---------------------------------------------------------------------------
# Stops
# ---------------------------------------------------------------------------

class TestStops:
    def test_a_new_trip_has_its_destination_as_a_stop(self, client, act_as):
        act_as(_user("ana"))
        trip = _trip(client, date.today() + timedelta(days=10))
        assert [(s["city_geonameid"], s["country_iso2"], s["transport_mode"]) for s in trip["stops"]] == [(COX, "BD", None)]
        assert trip["stops"][0]["arrive_on"] == trip["start_date"] and trip["stops"][0]["depart_on"] == trip["end_date"]

    def test_origin_and_mode_from_the_wizard(self, client, act_as):
        act_as(_user("bea"))
        trip = _trip(client, date.today() + timedelta(days=10), origin={"city_geonameid": DHAKA}, transport_mode="bus")
        stops = trip["stops"]
        assert [(s["position"], s["city_name"], s["country_name"], s["transport_mode"]) for s in stops] == [
            (0, "Dhaka", "Bangladesh", None), (1, stops[1]["city_name"], "Bangladesh", "bus"),
        ]
        listed = client.get(f"{API}/trips").json()
        assert [s["city_geonameid"] for s in listed[0]["stops"]] == [DHAKA, COX]

    def test_replace_the_route(self, client, act_as):
        act_as(_user("cai"))
        trip = _trip(client, date.today() + timedelta(days=10))
        resp = client.put(f"{API}/trips/{trip['id']}/stops", json={"stops": [
            {"city_geonameid": DHAKA, "transport_mode": "car"},
            {"city_geonameid": KOLKATA, "transport_mode": "plane"},
            {"country_iso2": "fr", "transport_mode": "train"},
        ]})
        assert resp.status_code == 200, resp.text
        assert [(s["city_geonameid"], s["country_iso2"], s["transport_mode"]) for s in resp.json()["stops"]] == [
            (DHAKA, "BD", "car"), (KOLKATA, "IN", "plane"), (None, "FR", "train"),
        ]
        # Again, shorter: positions are reused without clashing
        resp = client.put(f"{API}/trips/{trip['id']}/stops", json={"stops": [{"city_geonameid": KOLKATA}]})
        assert [s["position"] for s in resp.json()["stops"]] == [0]

    @pytest.mark.parametrize("stops, status", [
        ([{"city_geonameid": 999999999}], 422),
        ([{"city_geonameid": DHAKA, "country_iso2": "IN"}], 422),
        ([{"country_iso2": "XX"}], 422),
        ([{"transport_mode": "plane"}], 422),
        ([{"city_geonameid": DHAKA, "transport_mode": "rocket"}], 422),
        ([{"city_geonameid": DHAKA, "arrive_on": "2026-10-05", "depart_on": "2026-10-01"}], 422),
        ([], 422),
    ])
    def test_bad_routes(self, client, act_as, stops, status):
        act_as(_user("dov"))
        trip = _trip(client, date.today() + timedelta(days=10))
        assert client.put(f"{API}/trips/{trip['id']}/stops", json={"stops": stops}).status_code == status

    def test_friends_read_stops_but_cannot_change_them(self, client, act_as):
        eli, fay, gus = _user("eli"), _user("fay"), _user("gus")
        act_as(eli)
        trip = _trip(client, date.today() + timedelta(days=10))
        req = client.post(f"{API}/friend-requests", json={"user_id": str(fay.id)}).json()
        act_as(fay)
        client.post(f"{API}/friend-requests/{req['id']}/accept")
        got = client.get(f"{API}/trips/{trip['id']}").json()
        assert got["user_id"] == str(eli.id) and got["stops"][0]["city_geonameid"] == COX
        assert client.put(f"{API}/trips/{trip['id']}/stops", json={"stops": [{"city_geonameid": DHAKA}]}).status_code == 404
        assert client.post(f"{API}/trips/{trip['id']}/mark-visited", json={"mark": True}).status_code == 404
        act_as(gus)
        assert client.get(f"{API}/trips/{trip['id']}").status_code == 404

    def test_duplicate_copies_the_route(self, client, act_as):
        act_as(_user("hal"))
        trip = _trip(client, date.today() + timedelta(days=10), origin={"city_geonameid": DHAKA}, transport_mode="bus")
        copy = client.post(f"{API}/trips/{trip['id']}/duplicate").json()
        assert [s["city_geonameid"] for s in copy["stops"]] == [DHAKA, COX]


# ---------------------------------------------------------------------------
# Mark as visited
# ---------------------------------------------------------------------------

class TestMarkVisited:
    def test_marks_cities_and_countries_without_downgrading(self, client, act_as):
        ivy = _user("ivy")
        act_as(ivy)
        start = date.today() - timedelta(days=10)
        trip = _trip(client, start, days=3, origin={"city_geonameid": DHAKA})
        client.put(f"{API}/me/visits", json={"visits": [
            {"place_type": "country", "place_code": "BD", "status": "lived"},
            {"place_type": "city", "place_code": str(DHAKA), "status": "want"},
        ]})
        assert trip["visited_prompt"] is None
        resp = client.post(f"{API}/trips/{trip['id']}/mark-visited", json={"mark": True})
        assert resp.status_code == 200 and resp.json()["visited_prompt"] == "marked"
        with _ApiTestSession() as db:
            visits = {(v.place_type, v.place_code): v for v in db.scalars(select(Visit).where(Visit.user_id == ivy.id))}
        assert visits[("country", "BD")].status == "lived"  # never downgraded
        assert visits[("city", str(DHAKA))].status == "visited"  # want → visited
        cox = visits[("city", str(COX))]
        assert cox.status == "visited" and cox.first_visited_on == start and cox.last_visited_on == start + timedelta(days=2)
        assert client.get(f"{API}/trips/{trip['id']}").json()["visited_prompt"] == "marked"

    def test_dismiss(self, client, act_as):
        jo = _user("jo")
        act_as(jo)
        trip = _trip(client, date.today() - timedelta(days=5))
        resp = client.post(f"{API}/trips/{trip['id']}/mark-visited", json={"mark": False})
        assert resp.json() == {"visited_prompt": "dismissed", "places_marked": 0}
        with _ApiTestSession() as db:
            assert not db.scalars(select(Visit).where(Visit.user_id == jo.id)).all()

    def test_not_before_the_trip_ends(self, client, act_as):
        act_as(_user("kim"))
        trip = _trip(client, date.today() + timedelta(days=3))
        assert client.post(f"{API}/trips/{trip['id']}/mark-visited", json={"mark": True}).status_code == 409


# ---------------------------------------------------------------------------
# Stats endpoints
# ---------------------------------------------------------------------------

class TestStatsEndpoints:
    def test_my_trip_stats_count_completed_trips_only(self, client, act_as):
        act_as(_user("lea"))
        today = date.today()
        _trip(client, today - timedelta(days=20), days=20)  # completed: 20 days
        _trip(client, today - timedelta(days=1), days=3)  # ongoing
        _trip(client, today + timedelta(days=5), days=4)  # upcoming
        s = client.get(f"{API}/me/trips/stats", params={"today": str(today)}).json()
        assert (s["trips"], s["total_days"], s["ongoing"], s["upcoming"]) == (1, 20, 1, 1)
        assert (s["weeks"], s["months"], s["years"], s["average_days"]) == (2.86, 0.66, 0.05, 20.0)
        assert (s["countries"], s["cities"], s["continents"]) == (1, 1, 1)

    def test_a_friend_sees_trip_stats_a_stranger_gets_404(self, client, act_as):
        mo, ned, oz = _user("mo"), _user("ned"), _user("oz")
        act_as(mo)
        _trip(client, date.today() - timedelta(days=10), days=2)
        req = client.post(f"{API}/friend-requests", json={"user_id": str(ned.id)}).json()
        act_as(ned)
        client.post(f"{API}/friend-requests/{req['id']}/accept")
        assert client.get(f"{API}/users/{mo.id}/trips/stats").json()["trips"] == 1
        trips = client.get(f"{API}/users/{mo.id}/trips").json()
        assert trips[0]["stops"][0]["city_geonameid"] == COX
        act_as(oz)
        assert client.get(f"{API}/users/{mo.id}/trips/stats").status_code == 404

    def test_export_includes_stops(self, client, act_as):
        act_as(_user("pia"))
        _trip(client, date.today() + timedelta(days=2))
        assert client.get(f"{API}/me/export").json()["trips"][0]["stops"][0]["city_geonameid"] == COX


def test_existing_trip_rows_load_without_stops():
    """Trips made before Phase 7 with no geography match still serialise."""
    with _ApiTestSession() as db:
        t = Trip(destination="Nowhere", start_date=date(2026, 1, 1), end_date=date(2026, 1, 2), total_budget=1)
        db.add(t)
        db.commit()
        assert t.stops == []
        db.delete(t)
        db.commit()

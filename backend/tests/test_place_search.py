"""
Search anything in free time (docs/trip-upgrades, step 6; design.md §6, D10): the four sources, the score,
"never empty", the geocoder's cache and limits, adding any result as a private stop, and that nobody else
is ever offered someone's private stop.

Each test gets a small made-up town in an empty corner of the map (no seeded destination within 60 km),
with Vromon's sights, a restaurant, a hotel, a sight of the next destination and places-index rows named
like Khulna's. No network: the geocoder is replaced in every test, and roads are the straight-line estimate.
"""

from __future__ import annotations

import uuid
from datetime import date, timedelta

import pytest
from fastapi import Depends
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core import names
from app.core.auth import get_current_user
from app.core.config import settings
from app.db import get_db
from app.db.destinations import _sync
from app.main import app
from app.models.catalog import GeocodeCache, PoiIndex, ReviewTask
from app.models.models import Destination, Hotel, Itinerary, ItineraryItem, Place, Restaurant, Trip, TripMember, User
from app.services import friends as social
from app.services import place_search, rooms
from app.services.routing import ROADS
from tests.conftest import _ApiTestSession
from tests.test_trip_stays import API, _user

# Town centres at least 1° apart (beyond a day's reach) and far from every seeded destination
_GRID = iter([(26.3, 88.4), (26.3, 89.5), (25.5, 88.4), (25.5, 89.5), (25.5, 90.6), (23.1, 88.3), (21.0, 88.6),
              (21.0, 89.7), (20.6, 91.0), (26.3, 90.6), (25.5, 91.8), (23.4, 91.2), (26.5, 91.7), (20.6, 92.2),
              (22.0, 88.3), (22.6, 91.2), (24.6, 92.6), (21.8, 92.6)])
START = date.today() + timedelta(days=20)

# The town (offsets from its centre, in degrees: 0.01° ≈ 1.1 km)
SIGHTS = [("Divisional Museum", 0.0, 0.0), ("Shahid Hadis Park", 0.005, -0.008)]
POIS = [
    ("Govt. B.L College, Khulna", None, "college", "college_university", 0.040, -0.010),      # ~4.5 km
    ("Govt. Brajalal College", "সরকারি ব্রজলাল কলেজ", "college", "college_university", 0.042, -0.012),
    ("BSL Azam Khan Govt Commerce College", None, "college", "college_university", 0.012, 0.004),   # nearer, wrong name
    ("Chalna College-University", None, "college", "college_university", -0.150, 0.020),            # ~17 km
    ("Khulna Zilla School", None, "school", "high_school", 0.003, 0.006),
    ("Sadar Hospital", "সদর হাসপাতাল", "hospital", "hospital", 0.010, 0.010),
    ("Sonadanga Bus Stand", "সোনাডাঙ্গা বাসস্ট্যান্ড", "bus_station", "bus_station", 0.020, -0.030),
    ("Far Away College", None, "college", "college_university", 0.300, 0.300),                         # ~45 km: beyond the area
]


@pytest.fixture(autouse=True)
def no_network(monkeypatch):
    """Straight-line roads; a geocoder that answers from a list (tests set it) and counts its calls."""
    ROADS.reset(None)
    calls: list[str] = []
    answers: dict[str, list[dict]] = {}

    def fake_fetch(text, lat, lon):
        calls.append(text)
        return answers.get(text.lower(), [])

    monkeypatch.setattr(place_search, "_fetch", fake_fetch)
    monkeypatch.setattr(settings, "ors_api_key", "test-key")
    place_search._last_call.clear()
    yield {"calls": calls, "answers": answers}
    ROADS.reset(None)


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
    app.dependency_overrides.pop(get_current_user, None)


def _world() -> dict:
    lat0, lon0 = next(_GRID)
    tag = uuid.uuid4().hex[:6]
    with _ApiTestSession() as db:
        dest = Destination(name=f"Searchtown{tag}", country="Bangladesh", latitude=lat0, longitude=lon0)
        nextdoor = Destination(name=f"Nextdoor{tag}", country="Bangladesh", latitude=lat0 - 0.12, longitude=lon0 + 0.05)
        db.add_all([dest, nextdoor])
        db.flush()
        sights = [Place(name=n, destination_id=dest.id, destination_name=dest.name, category="Historical", latitude=lat0 + a,
                        longitude=lon0 + b, opening_time="09:00", closing_time="17:00", average_visit_duration=1.0, estimated_cost=50)
                  for n, a, b in SIGHTS]
        other = Place(name="Rupsha Bridge Viewpoint", destination_id=nextdoor.id, destination_name=nextdoor.name, category="Nature",
                      latitude=lat0 - 0.10, longitude=lon0 + 0.04, opening_time="06:00", closing_time="20:00", average_visit_duration=1.0)
        hotel = Hotel(name="Hotel Castle Salam", destination_id=dest.id, destination_name=dest.name, category="Standard",
                      price_per_night=3000, price_known=True, latitude=lat0 + 0.002, longitude=lon0 + 0.003, is_active=True)
        food = Restaurant(name="Kacchi Bhai", destination_id=dest.id, destination_name=dest.name, cuisine="biryani",
                          latitude=lat0 + 0.004, longitude=lon0 - 0.002)
        db.add_all(sights + [other, hotel, food])
        pois = []
        for i, (name, bn, kind, cat, a, b) in enumerate(POIS):
            p = PoiIndex(id=f"t{tag}-{i}", source="overture", name=name, name_bn=bn, category=cat, kind=kind,
                         lat=round(lat0 + a, 6), lon=round(lon0 + b, 6), confidence=0.9,
                         name_key=names.match_key(name, drop_generic=False))
            pois.append(p)
        db.add_all(pois)
        db.commit()
        return {"dest": dest.name, "dest_id": dest.id, "lat": lat0, "lon": lon0, "sights": [s.id for s in sights],
                "other": other.id, "hotel": hotel.id, "food": food.id, "poi": {p.name: p.id for p in pois}}


def _trip(client, w: dict, stops: list[int] | None = None, days: int = 2) -> tuple[int, int, list[int]]:
    """A planned trip in the town: day 1 has these stops (place ids). Returns (trip, day 1, item ids)."""
    r = client.post(f"{API}/trips", json={
        "destination": w["dest"], "start_date": str(START), "end_date": str(START + timedelta(days=days - 1)), "num_travelers": 2,
        "total_budget": 40000, "preference": {"interests": ["Historical"], "accommodation_preference": "Standard"},
        "stay": {"kind": "hotel", "hotel_id": w["hotel"]},
    })
    assert r.status_code == 201, r.text
    tid = r.json()["id"]
    stops = w["sights"] if stops is None else stops
    with _ApiTestSession() as db:
        trip = db.get(Trip, tid)
        first = None
        for n in range(1, days + 1):
            day = Itinerary(trip_id=tid, day_number=n, day_date=START + timedelta(days=n - 1), theme="Test", total_cost=0, total_travel_time=0)
            t = 9 * 60 + 30
            for k, pid in enumerate(stops if n == 1 else []):
                p = db.get(Place, pid)
                day.items.append(ItineraryItem(item_type="activity", place_id=pid, title=p.name, start_time=f"{t // 60:02d}:{t % 60:02d}",
                                               end_time=f"{(t + 60) // 60:02d}:{(t + 60) % 60:02d}", duration_minutes=60, cost=0,
                                               travel_time_to_next=0, distance_to_next=0, recommendation_score=0.5, order_index=k))
                t += 90
            db.add(day)
            db.flush()
            first = first or day
        trip.status = "generated"
        db.commit()
        return tid, first.id, [i.id for i in sorted(first.items, key=lambda i: i.order_index)]


def _search(client, tid: int, day_id: int, q: str, near: int | None = None, part: str = "places", limit: int = 8) -> dict:
    params = {"q": q, "part": part, "limit": limit}
    if near is not None:
        params["near_item_id"] = near
    r = client.get(f"{API}/trips/{tid}/days/{day_id}/search", params=params)
    assert r.status_code == 200, r.text
    return r.json()


def _results(res: dict, group: str | None = None) -> list[dict]:
    return [x for g in res["groups"] if group is None or g["key"] == group for x in g["results"]]


def _names(res: dict, group: str | None = None) -> list[str]:
    return [x["name"] for x in _results(res, group)]


# ---------------------------------------------------------------------------
# The shared name fold
# ---------------------------------------------------------------------------

NAMES = ["Bogura", "Bogra", "বগুড়া", "Bagerhat", "বাগেরহাট", "Chittagong", "Chattogram", "চট্টগ্রাম", "Barisal", "Barishal",
         "Jessore", "Jashore", "Comilla", "Cumilla", "Cox's Bazar", "কক্সবাজার", "Govt. Brajalal College", "ব্রজলাল কলেজ",
         "Sonadanga", "সোনাডাঙ্গা", "Shah Jalal", "শাহজালাল"]


def test_the_name_fold_is_the_data_platforms():
    """Search and the places index fold names with the same code: the keys the index stored still match."""
    assert names.match_key("Bogura") == "bagara" and names.match_key("Bagerhat") == names.match_key("বাগেরহাট") == "bagarat"
    assert names.match_key("Barisal") == names.match_key("Barishal") and names.match_key("Jessore") == names.match_key("Jashore")
    assert names.match_key("Sonadanga") == names.match_key("সোনাডাঙ্গা") == "sanadanga"
    assert names.match_key("BM College", drop_generic=False) == "bm calaga"          # as the step-5 index stored it
    assert names.name_similarity("Bagerhat", "বাগেরহাট") == 100.0
    # Search's own key keeps vowels apart: Bogura isn't Bagerhat, but spellings and scripts still meet
    assert names.search_key("Brojolal") == names.search_key("Brajalal") == names.search_key("ব্রজলাল")
    assert names.search_key("Bogura") != names.search_key("Bagerhat")
    assert names.search_text("Govt. B.L. College") == "govt bl college" == names.search_text("Govt B L College")
    assert names.search_text("খুলনা ২৫") == "খুলনা 25"


def test_bogura_doesnt_find_bagerhat():
    q = place_search.read_query("Bogura")
    assert place_search.name_score(q, "Bagerhat Sadar") < place_search.SHOW
    assert place_search.name_score(q, "Bogra Zilla School") >= place_search.SHOW


# ---------------------------------------------------------------------------
# Finding things
# ---------------------------------------------------------------------------

def test_bl_college_finds_the_college_and_not_a_nearer_wrong_name(client, act_as):
    act_as(_user("psbl"))
    w = _world()
    tid, day, items = _trip(client, w)
    res = _search(client, tid, day, "BL College", near=items[0])
    other = _results(res, "other")
    assert other[0]["name"] == "Govt. B.L College, Khulna"
    assert other[0]["kind"] == "college" and other[0]["checked"] is False and other[0]["source"] == "poi"
    assert other[0]["ref"] == {"poi_id": w["poi"]["Govt. B.L College, Khulna"]}
    assert 4.0 < other[0]["distance_km"] < 5.5
    assert res["near"]["name"] == "Divisional Museum" and res["kind"] == "college"
    assert "BSL Azam Khan Govt Commerce College" not in _names(res)       # "bl" isn't "bsl"


def test_a_kind_word_alone_gives_the_nearest_of_that_kind(client, act_as):
    act_as(_user("pskind"))
    w = _world()
    tid, day, items = _trip(client, w)
    for q in ("college", "colleges", "কলেজ"):
        res = _search(client, tid, day, q, near=items[0])
        got = _results(res, "other")
        assert [x["kind"] for x in got] == ["college"] * len(got) and len(got) >= 3, q
        assert [x["distance_km"] for x in got] == sorted(x["distance_km"] for x in got), q
        assert got[0]["name"] == "BSL Azam Khan Govt Commerce College", q     # the nearest
        assert "Far Away College" not in _names(res), q                     # beyond 25 km
        assert res["addresses_wanted"] is False, q                           # a kind needs no geocoder


def test_a_typo_and_bangla_find_it(client, act_as):
    act_as(_user("pstypo"))
    w = _world()
    tid, day, items = _trip(client, w)
    assert "Govt. Brajalal College" in _names(_search(client, tid, day, "Brojolal Colege", near=items[0]), "other")
    assert "Govt. Brajalal College" in _names(_search(client, tid, day, "brajal", near=items[0]), "other")     # still typing
    assert _names(_search(client, tid, day, "সদর হাসপাতাল", near=items[0]))[0] == "Sadar Hospital"
    assert _names(_search(client, tid, day, "ব্রজলাল কলেজ", near=items[0]))[0] == "Govt. Brajalal College"
    assert _names(_search(client, tid, day, "Sonadanga", near=items[0]))[0] == "Sonadanga Bus Stand"
    assert _names(_search(client, tid, day, "hospitel", near=items[0]))[0] == "Sadar Hospital"


def test_vromon_places_first_then_what_vromon_knows_nearby(client, act_as):
    act_as(_user("psgroups"))
    w = _world()
    tid, day, items = _trip(client, w, stops=[w["sights"][0]])
    res = _search(client, tid, day, "park", near=items[0])
    assert res["groups"][0]["key"] == "vromon" and _names(res, "vromon") == ["Shahid Hadis Park"]
    assert _results(res, "vromon")[0]["checked"] is True
    assert _names(_search(client, tid, day, "kacchi bhai"), "nearby") == ["Kacchi Bhai"]
    assert _results(_search(client, tid, day, "kacchi bhai"), "nearby")[0]["ref"] == {"restaurant_id": w["food"]}
    # a sight of the next destination, 11 km away
    near = _search(client, tid, day, "rupsha bridge")
    assert _results(near, "nearby")[0]["ref"] == {"place_id": w["other"]}
    # places already in the trip aren't offered again
    assert "Divisional Museum" not in _names(_search(client, tid, day, "museum"))
    # …nor their copy in the places index, as a "not checked" place (found on the phone in step 8)
    with _ApiTestSession() as db:
        db.add(PoiIndex(id=f"copy-{uuid.uuid4().hex[:8]}", source="overture", name="Divisional Museum", category="museum",
                        kind="museum", lat=round(w["lat"] + 0.0003, 6), lon=round(w["lon"] + 0.0002, 6), confidence=0.9,
                        name_key=names.match_key("Divisional Museum", drop_generic=False)))
        db.commit()
    assert "Divisional Museum" not in _names(_search(client, tid, day, "divisional museum"))


def test_nonsense_is_never_a_dead_end(client, act_as):
    act_as(_user("psnone"))
    w = _world()
    tid, day, items = _trip(client, w)
    res = _search(client, tid, day, "xqzvw blorp", near=items[0])
    assert res["groups"] == [] and res["pin"] is True
    assert len(res["did_you_mean"]) == 3
    # a misspelt kind: "Colleges near you"
    res = _search(client, tid, day, "zqx colege", near=items[0])
    assert res["kind"] == "college" and res["pin"] is True
    assert res["kind_results"]["kind"] == "college"
    assert [x["kind"] for x in res["kind_results"]["results"]] == ["college"] * len(res["kind_results"]["results"])
    assert res["kind_results"]["results"][0]["name"] == "BSL Azam Khan Govt Commerce College"


# ---------------------------------------------------------------------------
# The geocoder: only when needed, cached, limited
# ---------------------------------------------------------------------------

def _address(name: str, lat: float, lon: float, layer="neighbourhood") -> dict:
    return {"gid": f"openstreetmap:{layer}:{name}", "name": name, "label": f"{name}, Khulna, Bangladesh", "layer": layer, "lat": lat, "lon": lon}


def test_the_geocoder_only_when_needed_and_cached(client, act_as, no_network):
    act_as(_user("psgeo"))
    w = _world()
    tid, day, items = _trip(client, w)
    no_network["answers"]["kda avenue"] = [_address("KDA Avenue", w["lat"] + 0.01, w["lon"] + 0.01, "street")]
    # A kind: no geocoder
    _search(client, tid, day, "college", part="all")
    assert no_network["calls"] == []
    # An address the places don't know: once, then from the cache
    res = _search(client, tid, day, "KDA Avenue", part="all")
    assert res["geocoder"] == "used" and _names(res, "addresses") == ["KDA Avenue"]
    hit = _results(res, "addresses")[0]
    assert hit["checked"] is False and hit["kind"] == "street" and hit["address"] == "KDA Avenue, Khulna, Bangladesh"
    again = _search(client, tid, day, "kda  avenue", part="addresses")
    assert again["geocoder"] == "cached" and _names(again, "addresses") == ["KDA Avenue"]
    assert no_network["calls"] == ["KDA Avenue"]
    # The app's first request (places only) says whether the second is worth it
    assert _search(client, tid, day, "KDA Avenue")["addresses_wanted"] is True
    assert _search(client, tid, day, "college")["addresses_wanted"] is False
    # Nothing about the user is kept with the query
    with _ApiTestSession() as db:
        row = db.scalar(select(GeocodeCache).where(GeocodeCache.query_key == "kda avenue"))
        assert row is not None and set(c.name for c in GeocodeCache.__table__.columns) == {"id", "query_key", "area_key", "results_json", "fetched_at"}


def test_the_geocoder_rate_limit_and_daily_cap(client, act_as, no_network, monkeypatch):
    me, other = _user("psrate"), _user("psrate2")
    act_as(me)
    w = _world()
    tid, day, _ = _trip(client, w)
    assert _search(client, tid, day, "first street", part="addresses")["geocoder"] == "used"
    res = _search(client, tid, day, "second street", part="addresses")
    assert res["geocoder"] == "wait" and 0 < res["retry_after"] <= 2.0       # 1 call per user per 2 s
    assert no_network["calls"] == ["first street"]
    # someone else isn't held up
    act_as(other)
    tid2, day2, _ = _trip(client, w)
    assert _search(client, tid2, day2, "third street", part="addresses")["geocoder"] == "used"
    # the daily cap counts every call today, whoever made it
    place_search._last_call.clear()
    with _ApiTestSession() as db:
        today = db.query(GeocodeCache).filter(GeocodeCache.fetched_at >= date.today()).count()
    monkeypatch.setattr(settings, "geocode_daily_cap", today)
    assert _search(client, tid2, day2, "fourth street", part="addresses")["geocoder"] == "capped"
    assert len(no_network["calls"]) == 2
    # without a key there's no geocoder, and the places still answer
    monkeypatch.setattr(settings, "ors_api_key", "")
    res = _search(client, tid2, day2, "fifth street", part="all")
    assert res["geocoder"] == "off" and res["pin"] is True


# ---------------------------------------------------------------------------
# Adding any result: a private stop that works like any stop
# ---------------------------------------------------------------------------

def _add(client, tid: int, day: int, body: dict, status: int = 201) -> dict:
    r = client.post(f"{API}/trips/{tid}/days/{day}/items", json=body)
    assert r.status_code == status, r.text
    return r.json()


def _day(client, tid: int, day: int) -> dict:
    r = client.get(f"{API}/trips/{tid}")
    assert r.status_code == 200, r.text
    return next(d for d in r.json()["itinerary_days"] if d["id"] == day)


def test_adding_each_kind_of_result_makes_a_working_stop(client, act_as, no_network):
    me = _user("psadd")
    act_as(me)
    w = _world()
    tid, day, items = _trip(client, w, stops=[w["sights"][0]])
    no_network["answers"]["kda avenue"] = [_address("KDA Avenue", w["lat"] + 0.01, w["lon"] + 0.01, "street")]
    token = _results(_search(client, tid, day, "KDA Avenue", part="addresses"), "addresses")[0]["ref"]["geocode"]
    added = [
        ({"poi_id": w["poi"]["Govt. B.L College, Khulna"]}, "Govt. B.L College, Khulna", "poi", "college"),
        ({"geocode": token}, "KDA Avenue", "geocode", "street"),
        ({"pin": {"lat": w["lat"] - 0.01, "lon": w["lon"] + 0.012, "name": "  Aunt's   office "}}, "Aunt's office", "pin", "pin"),
        ({"restaurant_id": w["food"]}, "Kacchi Bhai", "restaurant", "restaurant"),
    ]
    for body, name, source, kind in added:
        out = _add(client, tid, day, body)
        assert out["message"].startswith(f"Added '{name}'")
    # a sight of the next destination: Vromon's own place, not a copy
    _add(client, tid, day, {"place_id": w["other"]})
    d = _day(client, tid, day)
    stops = {i["title"]: i for i in d["items"] if i["item_type"] == "activity"}
    assert set(stops) == {"Divisional Museum", "Govt. B.L College, Khulna", "KDA Avenue", "Aunt's office", "Kacchi Bhai",
                          "Rupsha Bridge Viewpoint"}
    for body, name, source, kind in added:
        p = stops[name]["place"]
        assert (p["listed"], p["source"], p["kind"], p["checked"] if source != "restaurant" else False) == (False, source, kind, False)
        assert p["cost_known"] is False and stops[name]["duration_minutes"] == 60
        assert p["hours_known"] is (source == "restaurant")        # a restaurant's known hours come along
        assert stops[name]["cost_source"] == "placeholder"
    assert stops["Rupsha Bridge Viewpoint"]["place"]["listed"] is True
    # times run on from one stop to the next, with the ride between
    ordered = sorted(d["items"], key=lambda i: i["order_index"])
    for a, b in zip(ordered, ordered[1:]):
        assert a["end_time"] <= b["start_time"]
    assert all(i["travel_time_to_next"] > 0 for i in ordered[:-1])
    # the route draws every stop, and Today reads the same day
    route = client.get(f"{API}/trips/{tid}/days/{day}/route")
    assert route.status_code == 200, route.text
    assert len(ordered) == 6
    # the same result added to another trip reuses the traveller's place
    tid2, day2, _ = _trip(client, w)
    _add(client, tid2, day2, {"poi_id": w["poi"]["Govt. B.L College, Khulna"]})
    with _ApiTestSession() as db:
        mine = db.scalars(select(Place).where(Place.owner_user_id == me.id)).all()
        assert sorted(p.name for p in mine) == ["Aunt's office", "Govt. B.L College, Khulna", "KDA Avenue", "Kacchi Bhai"]
    # added once per trip, like any place
    assert "already in your trip" in _add(client, tid, day, {"poi_id": w["poi"]["Govt. B.L College, Khulna"]}, 409)["detail"]
    # …and it isn't offered again by search
    assert "Govt. B.L College, Khulna" not in _names(_search(client, tid, day, "BL College"))


def test_what_cant_be_added(client, act_as):
    act_as(_user("psbad"))
    w = _world()
    tid, day, _ = _trip(client, w)
    assert _add(client, tid, day, {"pin": {"lat": w["lat"] + 1.5, "lon": w["lon"], "name": "Too far"}}, 422)["detail"].startswith("'Too far' is too far")
    assert _add(client, tid, day, {"pin": {"lat": 40.0, "lon": 10.0, "name": "Abroad"}}, 422)
    assert _add(client, tid, day, {"pin": {"lat": w["lat"], "lon": w["lon"], "name": "   "}}, 422)
    assert _add(client, tid, day, {"poi_id": "no-such-place"}, 404)
    assert _add(client, tid, day, {"geocode": "999999.0"}, 410)
    assert _add(client, tid, day, {"poi_id": w["poi"]["Sadar Hospital"], "place_id": w["sights"][0]}, 422)
    assert _add(client, tid, day, {}, 422)


# ---------------------------------------------------------------------------
# Privacy: a private stop is never offered to anyone else
# ---------------------------------------------------------------------------

def test_a_private_stop_never_leaks(client, act_as):
    owner, member, friend, stranger = (_user(n) for n in ("psown", "psmember", "psfriend", "psstranger"))
    with _ApiTestSession() as db:
        social.befriend(db, owner.id, member.id)
        social.befriend(db, owner.id, friend.id)
        db.commit()
    act_as(owner)
    w = _world()
    tid, day, _ = _trip(client, w)
    _add(client, tid, day, {"pin": {"lat": w["lat"] + 0.003, "lon": w["lon"] + 0.003, "name": "Aunt's house"}})
    _add(client, tid, day, {"poi_id": w["poi"]["Khulna Zilla School"]})
    with _ApiTestSession() as db:
        private = {p.name: p.id for p in db.scalars(select(Place).where(Place.owner_user_id == owner.id))}
        db.add(TripMember(trip_id=tid, user_id=member.id, status="invited", invited_by=owner.id))
        db.flush()
        rooms.join(db, db.get(Trip, tid), db.get(User, member.id))
        db.commit()
    pin_id = private["Aunt's house"]
    assert client.get(f"{API}/places/{pin_id}").json()["listed"] is False        # the owner ✓
    # a room member sees the stop, in the plan and on its own
    act_as(member)
    seen = client.get(f"{API}/trips/{tid}")
    assert seen.status_code == 200 and "Aunt's house" in [i["title"] for d in seen.json()["itinerary_days"] for i in d["items"]]
    assert client.get(f"{API}/places/{pin_id}").status_code == 200
    # nobody else, and nothing offers it to anyone: another traveller's trip in the same town
    for other in (friend, stranger):
        act_as(other)
        assert client.get(f"{API}/places/{pin_id}").status_code == 404
        tid2, day2, items2 = _trip(client, w)
        everything = [
            client.get(f"{API}/destinations/{w['dest_id']}/places").json(),
            client.get(f"{API}/places", params={"destination": w["dest"]}).json(),
            [s["place"] for s in client.get(f"{API}/trips/{tid2}/days/{day2}/suggestions", params={"limit": 25}).json()["suggestions"]],
            [r["place"] for r in client.post(f"{API}/places/recommendations", json={"destination": w["dest"], "limit": 50}).json()["recommendations"]],
        ]
        for rows in everything:
            assert not {p["id"] for p in rows} & set(private.values())
        for q in ("Aunt's house", "aunt", "zilla school"):
            res = _search(client, tid2, day2, q, part="all")
            assert not [x for x in _results(res) if x["ref"].get("place_id") in private.values()]
        # the index's school is still offered (it's open data), as the other traveller's own result
        assert _results(_search(client, tid2, day2, "zilla school"), "other")[0]["ref"] == {"poi_id": w["poi"]["Khulna Zilla School"]}
        # and can't be used by its id, sent as a card, or added
        assert _add(client, tid2, day2, {"place_id": pin_id}, 404)
        assert client.get(f"{API}/destinations/{w['dest_id']}").json()["place_count"] == 2
    # search and adding are the owner's: the member, the friend and a stranger get 404
    for other in (member, friend, stranger):
        act_as(other)
        assert client.get(f"{API}/trips/{tid}/days/{day}/search", params={"q": "college"}).status_code == 404
        assert client.post(f"{API}/trips/{tid}/days/{day}/items", json={"poi_id": w["poi"]["Sadar Hospital"]}).status_code == 404


def test_suggest_a_private_stop_to_vromon(client, act_as):
    owner, other = _user("pssuggest"), _user("pssuggest2")
    act_as(owner)
    w = _world()
    tid, day, _ = _trip(client, w)
    _add(client, tid, day, {"poi_id": w["poi"]["Sadar Hospital"]})
    with _ApiTestSession() as db:
        pid = db.scalar(select(Place.id).where(Place.owner_user_id == owner.id))
    r = client.post(f"{API}/places/{pid}/suggest")
    assert r.status_code == 201 and r.json() == {"suggested": True, "already": False}
    assert client.post(f"{API}/places/{pid}/suggest").json() == {"suggested": True, "already": True}
    with _ApiTestSession() as db:
        tasks = [t for t in db.scalars(select(ReviewTask).where(ReviewTask.entity_type == "app_place")) if t.payload.get("place_id") == pid]
        assert len(tasks) == 1 and tasks[0].task_type == "new_entity" and tasks[0].status == "open"
        p = tasks[0].payload
        assert (p["name"], p["source"], p["kind"], p["origin"]) == ("Sadar Hospital", "poi", "hospital", "traveller")
        assert str(owner.id) not in str(p)                              # where it came from, not who
    assert client.post(f"{API}/places/{w['sights'][0]}/suggest").status_code == 404      # Vromon's own place
    act_as(other)
    assert client.post(f"{API}/places/{pid}/suggest").status_code == 404


def test_export_lists_your_private_places(client, act_as):
    me = _user("psexport")
    act_as(me)
    w = _world()
    tid, day, _ = _trip(client, w)
    _add(client, tid, day, {"pin": {"lat": w["lat"] + 0.002, "lon": w["lon"], "name": "Office"}})
    out = client.get(f"{API}/me/export")
    assert out.status_code == 200, out.text
    assert [(p["name"], p["source"]) for p in out.json()["private_places"]] == [("Office", "pin")]


def test_the_destination_files_never_touch_a_private_stop():
    """The app's destination files sync their own rows; a traveller's place with a source ref isn't one."""
    w = _world()
    with _ApiTestSession() as db:
        dest = db.get(Destination, w["dest_id"])
        mine = Place(name="My poi", destination_id=dest.id, destination_name=dest.name, category="Other", latitude=w["lat"],
                     longitude=w["lon"], source="poi", source_ref="poi:xyz", listed=False)
        listed = Place(name="Old file place", destination_id=dest.id, destination_name=dest.name, category="Other", latitude=w["lat"],
                       longitude=w["lon"], source_ref="file:old")
        db.add_all([mine, listed])
        db.flush()
        _sync(db, Place, dest, [], lambda row, r: None)
        assert mine.is_active is True and listed.is_active is False
        db.rollback()


def test_road_data_for_a_new_stop_is_asked_for_before_anything_is_written(client, act_as, monkeypatch):
    """The road cache is saved on a connection of its own. On SQLite, if this request had already written
    the new place, that save waited 5 s for the request's lock and failed, and the stop's legs stayed
    straight-line estimates (found on the phone, step 6). So the roads come first, then the place."""
    from tests.test_trip_planner_step5 import FakeRoads

    act_as(_user("psroads"))
    w = _world()
    tid, day, _ = _trip(client, w, stops=[w["sights"][0]])
    asked: list[tuple[bool, tuple]] = []
    real = place_search.prepare_day

    def check(db, trip, d, point):
        asked.append((bool(db.new or db.dirty), point))
        return real(db, trip, d, point)

    monkeypatch.setattr(place_search, "prepare_day", check)
    fake = FakeRoads()
    ROADS.reset(provider=fake)
    _add(client, tid, day, {"poi_id": w["poi"]["Sadar Hospital"]})
    assert asked and asked[0][0] is False                       # nothing written yet
    museum = next(i for i in _day(client, tid, day)["items"] if i["title"] == "Divisional Museum")
    assert museum["travel_source"] == "road"                     # the leg to the hospital is by road


def test_no_address_search_for_a_word_still_being_typed_nor_far_away(client, act_as, no_network):
    act_as(_user("psshort"))
    w = _world()
    tid, day, _ = _trip(client, w)
    assert _search(client, tid, day, "kd")["addresses_wanted"] is False
    assert _search(client, tid, day, "kda")["addresses_wanted"] is True
    no_network["answers"]["azmiri"] = [_address("Azmiri", w["lat"] + 0.43, w["lon"], "venue"),        # ~48 km: too far
                                       _address("Azmiri Lane", w["lat"] + 0.01, w["lon"], "street")]
    res = _search(client, tid, day, "Azmiri", part="addresses")
    assert _names(res, "addresses") == ["Azmiri Lane"]
    no_network["answers"]["azmiri gate"] = [_address("Azmiri Gate", w["lat"] + 0.01, w["lon"] + 0.01, "venue")]
    place_search._last_call.clear()
    assert _results(_search(client, tid, day, "Azmiri Gate", part="addresses"), "addresses")[0]["kind"] == "other"


def test_your_own_stop_is_never_sent_to_the_language_model(client, act_as):
    act_as(_user("psrag"))
    w = _world()
    tid, day, _ = _trip(client, w)
    _add(client, tid, day, {"pin": {"lat": w["lat"] + 0.002, "lon": w["lon"], "name": "Aunt's office"}})
    with _ApiTestSession() as db:
        item = db.scalar(select(ItineraryItem).join(Itinerary).where(Itinerary.trip_id == tid, ItineraryItem.title == "Aunt's office"))
    r = client.post(f"{API}/rag/trips/{tid}/items/{item.id}/explanation")
    assert r.status_code == 422 and "your own stop" in r.json()["detail"]


def test_the_days_line_names_vromon_places_and_says_personal_for_your_own(client, act_as):
    """Found in step 8: a pin made the day's line "Nature morning, culture afternoon, other evening" (and
    "সন্ধ্যায় other" in Bangla): your own stops have no category the line can name."""
    act_as(_user("psline"))
    w = _world()
    tid, day, _ = _trip(client, w, stops=[w["sights"][0]])
    _add(client, tid, day, {"pin": {"lat": w["lat"] + 0.002, "lon": w["lon"], "name": "Cousin's office"}})

    def lines() -> list[list]:
        days = client.get(f"{API}/trips/{tid}/itinerary").json()["days"]
        return [[(p["part"], p.get("what")) for p in d["summary"]] for d in days]

    assert lines()[0] == [("morning", "historical")]          # the pin shares the morning with the museum
    day2 = client.get(f"{API}/trips/{tid}/itinerary").json()["days"][1]["id"]
    _add(client, tid, day2, {"pin": {"lat": w["lat"] - 0.002, "lon": w["lon"], "name": "Aunt's house"}})
    assert lines()[1] == [("morning", "own")]                 # "personal morning": a day of your own stops

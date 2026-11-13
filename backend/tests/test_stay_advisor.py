"""
The stay advisor (docs/trip-upgrades, step 4; D4, D5): "sleep somewhere else for nights a-b?", with the
numbers, only when it clearly wins; the traveller's answers; Switch; the budget's ways to save.

A small made-up Khulna: two sights in town and the Sundarbans gate (Karamjal) and Mongla port
about 40 km south, a hotel in town and one in Mongla. Road times are the planner's estimate
(straight line at 30 km/h; no road data in the tests).
"""

from __future__ import annotations

import uuid
from datetime import date, timedelta

import pytest
from fastapi import Depends
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.db import get_db
from app.main import app
from app.models.models import Destination, Hotel, Itinerary, ItineraryItem, Place, StaySuggestion, Trip, TripMember, User
from app.services import friends as social
from app.services import rooms, stay_advisor, stays
from app.services.budget.service import _leg
from app.services.routing import ROADS
from app.services.routing import modes as M
from tests.conftest import _ApiTestSession
from tests.test_trip_stays import API, _user

# Khulna's shape (the town, Mongla about 38 km south), moved where no seeded hotel is; each test's
# world 60 km east of the last, so they don't see each other's hotels
LAT = 2.0
TOWN_SIGHTS = [("Divisional Museum", 22.815, 89.565), ("Shahid Hadis Park", 22.822, 89.552)]
KARAMJAL = ("Karamjal Sundarbans gate", 22.433, 89.592)
MONGLA_PORT = ("Mongla Port", 22.470, 89.603)
MONGLA_GHAT = ("Mongla ghat", 22.455, 89.620)
CITY = (22.810, 89.560)
MONGLA = (22.468, 89.598)
_worlds = iter(range(1000))
START = date.today() + timedelta(days=30)


@pytest.fixture(autouse=True)
def no_roads():
    """Only the straight-line estimate, so the numbers can be worked out by hand."""
    ROADS.reset(None)
    yield
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


def _world(city_price=3500.0, mongla_price=1800.0, next_door: float | None = None, rated_next_door=4.2) -> dict:
    """A destination with its sights and hotels; returns their ids."""
    tag = uuid.uuid4().hex[:6]
    lon = 0.6 * next(_worlds)
    at = lambda la, lo: (la + LAT, lo + lon)  # noqa: E731
    with _ApiTestSession() as db:
        dest = Destination(name=f"Khulnatest{tag}", country="Bangladesh", latitude=22.82 + LAT, longitude=89.55 + lon)
        south = Destination(name=f"Bagerhattest{tag}", country="Bangladesh", latitude=22.66 + LAT, longitude=89.79 + lon)
        db.add_all([dest, south])
        db.flush()

        def place(name, la, lo, d=dest):
            lat, lng = at(la, lo)
            p = Place(name=name, destination_id=d.id, destination_name=d.name, category="Nature", latitude=lat, longitude=lng,
                      opening_time="07:00", closing_time="19:00", average_visit_duration=1.5, estimated_cost=0)
            db.add(p)
            return p

        def hotel(name, la, lo, price, d=dest, rating=4.0, rating_known=True, known=True):
            lat, lng = at(la, lo)
            h = Hotel(name=name, destination_id=d.id, destination_name=d.name, category="Standard", price_per_night=price,
                      price_known=known, rating=rating, rating_known=rating_known, latitude=lat, longitude=lng, is_active=True)
            db.add(h)
            return h

        sights = [place(n, la, lo) for n, la, lo in TOWN_SIGHTS]
        south_sights = [place(n, la, lo) for n, la, lo in (KARAMJAL, MONGLA_PORT, MONGLA_GHAT)]
        city = hotel("Hotel City Inn", *CITY, city_price)
        mongla = hotel("Hotel Pashur", *MONGLA, mongla_price, d=south, rating=3.5, rating_known=False)
        out = {"dest": dest.name, "city": city, "mongla": mongla, "sights": sights, "south": south_sights}
        if next_door is not None:
            out["next_door"] = hotel("Hotel Next Door", CITY[0] + 0.001, CITY[1] + 0.001, next_door, rating=rated_next_door)
        db.commit()
        return {k: ([x.id for x in v] if isinstance(v, list) else v.id if hasattr(v, "id") else v) for k, v in out.items()}


def _trip(client, w: dict, days: list[list[int]], hotel_id: int, start: date = START, travellers: int = 2) -> int:
    """A planned trip with these stops each day (place ids), sleeping at `hotel_id` every night."""
    end = start + timedelta(days=len(days) - 1)
    r = client.post(f"{API}/trips", json={
        "destination": w["dest"], "start_date": str(start), "end_date": str(end), "num_travelers": travellers,
        "total_budget": 50000, "preference": {"interests": ["Nature"], "accommodation_preference": "Standard"},
        "stay": {"kind": "hotel", "hotel_id": hotel_id},
    })
    assert r.status_code == 201, r.text
    tid = r.json()["id"]
    with _ApiTestSession() as db:
        trip = db.get(Trip, tid)
        for n, stops in enumerate(days, start=1):
            day = Itinerary(trip_id=tid, day_number=n, day_date=start + timedelta(days=n - 1), theme="Test", total_cost=0, total_travel_time=0)
            t = 9 * 60 + 30
            for k, pid in enumerate(stops):
                p = db.get(Place, pid)
                day.items.append(ItineraryItem(item_type="activity", place_id=pid, title=p.name, start_time=f"{t // 60:02d}:{t % 60:02d}",
                                               end_time=f"{(t + 90) // 60:02d}:{(t + 90) % 60:02d}", duration_minutes=90, cost=0,
                                               travel_time_to_next=0, distance_to_next=0, recommendation_score=0.5, order_index=k))
                t += 120
            db.add(day)
        trip.status = "generated"
        db.commit()
    return tid


def _suggestions(client, tid: int) -> list[dict]:
    r = client.get(f"{API}/trips/{tid}/stay-suggestions")
    assert r.status_code == 200, r.text
    return r.json()["suggestions"]


def _hours(km: float) -> int:
    """The planner's estimate without road data: straight line at 30 km/h, in whole minutes (as start_leg rounds)."""
    return round(km / M.STRAIGHT_KMH * 60)


def _fare(a: tuple, b: tuple, travellers: int = 2) -> float:
    """A ride's fare as the budget counts it (the mode a local would pick for the road estimate)."""
    from app.services.budget.service import ESTIMATE_DETOUR, vehicles
    from app.services.routing.roads import haversine_km
    km = haversine_km(a, b) * ESTIMATE_DETOUR
    mode = M.default_mode(km)
    return M.fare(mode, km) * vehicles(mode, travellers)


def _points(w: dict) -> dict:
    with _ApiTestSession() as db:
        get = lambda model, i: (db.get(model, i).latitude, db.get(model, i).longitude)  # noqa: E731
        return {"city": get(Hotel, w["city"]), "mongla": get(Hotel, w["mongla"]),
                "town": [get(Place, i) for i in w["sights"]], "south": [get(Place, i) for i in w["south"]]}


def _sundarbans_trip(client, act_as, name: str, **prices) -> tuple[int, dict]:
    """Days 1-2 in town, day 3 the Sundarbans gate and Mongla port, day 4 Mongla ghat; every night in town."""
    me = _user(name)
    act_as(me)
    w = _world(**prices)
    town, south = w["sights"], w["south"]
    return _trip(client, w, [town, town[::-1], south[:2], south[2:]], w["city"]), w


# ---------------------------------------------------------------------------
# What's suggested
# ---------------------------------------------------------------------------

def test_a_sundarbans_day_far_from_the_town_hotel_suggests_a_night_in_mongla(client, act_as):
    tid, w = _sundarbans_trip(client, act_as, "samongla", city_price=2500, mongla_price=2800)
    found = _suggestions(client, tid)
    assert len(found) == 1
    s = found[0]
    assert (s["first_night"], s["last_night"], s["hotel"]["name"]) == (3, 3, "Hotel Pashur")
    assert s["current"]["name"] == "Hotel City Inn" and s["extra_moves"] == 1
    # dearer by Tk 300, but it saves two long rides each way and a lot of road time
    assert s["money_saved"] > 1000 and s["minutes_saved"] >= 90
    assert s["parts"]["days"] == [3, 4] and s["parts"]["hassle_minutes"] == 45
    assert s["hotel"]["rating_known"] is False   # a rating nobody gave doesn't keep it out (it's said)


def test_the_numbers_match_a_hand_calculation(client, act_as):
    tid, w = _sundarbans_trip(client, act_as, "sahand", city_price=2500, mongla_price=2800)
    s = _suggestions(client, tid)[0]
    p = _points(w)
    from app.services.routing.roads import haversine_km as km
    city, mongla, (gate, port), ghat = p["city"], p["mongla"], p["south"][:2], p["south"][2]
    # Night 3 in Mongla: day 3 ends there instead of in town; day 4 starts and (the last day) ends there
    road_now = _hours(km(port, city)) + _hours(km(city, ghat)) + _hours(km(ghat, city))
    road_then = _hours(km(port, mongla)) + _hours(km(mongla, ghat)) + _hours(km(ghat, mongla))
    # (day 3 starts in town either way: the same in both, so it's left out of both sums here)
    transfer = km(city, mongla) / M.STRAIGHT_KMH * 60
    minutes = round(road_now - road_then - transfer - 45)
    assert s["minutes_saved"] == minutes
    fares_now = _fare(port, city) + _fare(city, ghat) + _fare(ghat, city)
    fares_then = _fare(port, mongla) + _fare(mongla, ghat) + _fare(ghat, mongla)
    money = (2500 - 2800) * 1 * 1 - _fare(city, mongla) + (fares_now - fares_then)   # 1 night, 1 room for 2
    assert s["money_saved"] == round(money)
    assert s["parts"]["transfer_cost"] == round(_fare(city, mongla))
    print(f"\nWorked example 1 (Mongla): minutes {minutes} = {road_now} - {road_then} - {round(transfer)} - 45; "
          f"money {round(money)} = -300 - {round(_fare(city, mongla))} + ({round(fares_now)} - {round(fares_then)})")


def test_a_cheaper_hotel_next_door_is_suggested_for_money(client, act_as):
    me = _user("sanext")
    act_as(me)
    w = _world(city_price=3500, next_door=1500)
    tid = _trip(client, w, [w["sights"], w["sights"][::-1], w["sights"]], w["city"])
    found = _suggestions(client, tid)
    assert len(found) == 1
    s = found[0]
    # all the nights, from the first: no move at all, so no hassle
    assert (s["first_night"], s["last_night"], s["hotel"]["name"], s["extra_moves"]) == (1, 2, "Hotel Next Door", 0)
    assert s["money_saved"] == pytest.approx((3500 - 1500) * 2, abs=60)   # the rides from next door barely differ
    assert abs(s["minutes_saved"]) <= 5   # next door: a few minutes either way
    print(f"\nWorked example 2 (next door): money {s['money_saved']} = (3500 - 1500) x 2 nights x 1 room "
          f"+ rides ({s['parts']['fares_now']} - {s['parts']['fares_then']}); minutes {s['minutes_saved']}")


def test_a_tiny_saving_is_not_suggested(client, act_as):
    me = _user("satiny")
    act_as(me)
    w = _world(city_price=3500, next_door=3300)
    tid = _trip(client, w, [w["sights"], w["sights"][::-1], w["sights"]], w["city"])
    assert _suggestions(client, tid) == []   # Tk 400 for 2 nights: under Tk 1,000


def test_a_badly_rated_hotel_is_never_suggested(client, act_as):
    me = _user("sabad")
    act_as(me)
    w = _world(city_price=3500, next_door=1000, rated_next_door=2.9)
    tid = _trip(client, w, [w["sights"], w["sights"][::-1], w["sights"]], w["city"])
    assert _suggestions(client, tid) == []


def test_no_hopping_every_night(client, act_as):
    """A one-night stay between two moves only for 2 h a night or more."""
    tid, w = _sundarbans_trip(client, act_as, "sahop", city_price=2500, mongla_price=2800)
    with _ApiTestSession() as db:
        trip = db.get(Trip, tid)
        blocks = stays.blocks_of(db, trip)
        # 5 days: nights 1-4 in town; only night 3 would be in Mongla between two nights in town
        o = stay_advisor.evaluate(db, trip, blocks, 2, 2, db.get(Hotel, w["mongla"]))
        assert o.extra_moves == 2 and o.parts["hopping"] is True
        assert not stay_advisor.worth_it(o) or o.minutes_saved >= 120
        for opt in stay_advisor.options(db, trip):
            assert not (opt.parts["hopping"] and opt.minutes_saved < 120 * opt.nights)


def test_nights_already_started_are_left_alone(client, act_as):
    me = _user("sastarted")
    act_as(me)
    w = _world(city_price=3500, next_door=1500)
    tid = _trip(client, w, [w["sights"], w["sights"][::-1], w["sights"]], w["city"], start=date.today() - timedelta(days=1))
    # the trip started yesterday: night 1 has; tonight (night 2) has too
    assert _suggestions(client, tid) == []
    with _ApiTestSession() as db:
        assert stay_advisor.first_open_night(db.get(Trip, tid)) == 3


# ---------------------------------------------------------------------------
# Answers, Switch, Undo
# ---------------------------------------------------------------------------

def test_dont_suggest_this_stays_dismissed_until_the_saving_grows_by_a_quarter(client, act_as):
    tid, w = _sundarbans_trip(client, act_as, "sadismiss", city_price=2500, mongla_price=2800)
    s = _suggestions(client, tid)[0]
    r = client.post(f"{API}/trips/{tid}/stay-suggestions/{s['id']}/dismiss")
    assert r.status_code == 200 and r.json()["suggestions"] == []
    assert _suggestions(client, tid) == []
    with _ApiTestSession() as db:          # Tk 100 cheaper: a little more saved, not 25%
        db.get(Hotel, w["mongla"]).price_per_night = 2700
        db.commit()
    assert _suggestions(client, tid) == []
    with _ApiTestSession() as db:          # Tk 1,500 cheaper: much more saved
        db.get(Hotel, w["mongla"]).price_per_night = 1300
        db.commit()
    back = _suggestions(client, tid)
    # back, for Mongla (now for nights 2-3 too, it's that much cheaper), saving far more than before
    assert len(back) == 1 and back[0]["hotel"]["name"] == "Hotel Pashur" and back[0]["money_saved"] > s["money_saved"] * 1.25
    assert back[0]["first_night"] <= 3 <= back[0]["last_night"]


def test_not_now_returns_after_the_plan_changes(client, act_as):
    tid, w = _sundarbans_trip(client, act_as, "sanotnow", city_price=2500, mongla_price=2800)
    s = _suggestions(client, tid)[0]
    assert client.post(f"{API}/trips/{tid}/stay-suggestions/{s['id']}/not-now").json()["suggestions"] == []
    assert _suggestions(client, tid) == []   # the same plan: still hidden
    with _ApiTestSession() as db:            # a stop moves: the plan changed
        item = next(i for d in db.get(Trip, tid).itinerary_days if d.day_number == 1 for i in d.items)
        item.start_time, item.end_time = "10:00", "11:30"
        db.commit()
    assert [x["id"] for x in _suggestions(client, tid)] == [s["id"]]


def test_switch_moves_the_night_keeps_the_stops_and_undo_puts_it_back(client, act_as):
    tid, w = _sundarbans_trip(client, act_as, "saswitch", city_price=2500, mongla_price=2800)
    with _ApiTestSession() as db:            # a pinned stop on day 3
        day3 = next(d for d in db.get(Trip, tid).itinerary_days if d.day_number == 3)
        pinned = day3.items[0]
        pinned.pinned = True
        pinned_id, pinned_at = pinned.id, pinned.start_time
        db.commit()
    before = client.get(f"{API}/trips/{tid}/itinerary").json()
    s = _suggestions(client, tid)[0]
    r = client.post(f"{API}/trips/{tid}/stay-suggestions/{s['id']}/accept")
    assert r.status_code == 200, r.text
    out = r.json()
    assert [(x["first_night"], x["last_night"], x["hotel"]["name"]) for x in out["stays"]] == [
        (1, 2, "Hotel City Inn"), (3, 3, "Hotel Pashur")]
    assert [d["day_number"] for d in out["days"]] == [3, 4]
    assert out["budget"]["change"] < 0 and out["message"] == "Staying at Hotel Pashur."
    after = client.get(f"{API}/trips/{tid}/itinerary").json()
    assert after["days"][2]["end_base"]["name"] == "Hotel Pashur" and after["days"][3]["start_base"]["name"] == "Hotel Pashur"
    # every stop keeps its time, the pinned one too
    times = lambda it: [(i["id"], i["start_time"]) for d in it["days"] for i in d["items"]]  # noqa: E731
    assert times(after) == times(before)
    assert next(i for i in after["days"][2]["items"] if i["id"] == pinned_id)["start_time"] == pinned_at
    # taken: no longer suggested
    assert _suggestions(client, tid) == []
    # Undo: the stays as they were (PUT /stays)
    r = client.put(f"{API}/trips/{tid}/stays", json={"stays": out["undo"]["stays"]})
    assert r.status_code == 200
    assert [(x["first_night"], x["last_night"]) for x in r.json()["stays"]] == [(1, 3)]
    # and it's offered again (the stays are as before)
    assert [x["id"] for x in _suggestions(client, tid)] == [s["id"]]


def test_a_dinner_where_you_stay_follows_the_new_stay(client, act_as):
    tid, w = _sundarbans_trip(client, act_as, "sameal", city_price=2500, mongla_price=2800)
    r = client.put(f"{API}/trips/{tid}/meals", json={"Breakfast": "stay", "Lunch": "restaurant", "Dinner": "stay"})
    assert r.status_code == 200, r.text
    s = _suggestions(client, tid)[0]
    out = client.post(f"{API}/trips/{tid}/stay-suggestions/{s['id']}/accept").json()
    day3 = next(d for d in out["days"] if d["day_number"] == 3)
    dinner = next(i for i in day3["items"] if i["meal_source"] == "stay" and i["title"].startswith("Dinner"))
    last = max(i["end_time"] for i in day3["items"] if i["item_type"] == "activity")
    back = day3["return_leg"]["minutes"]
    h, m = map(int, last.split(":"))
    assert dinner["start_time"] >= f"{(h * 60 + m + back) // 60:02d}:{(h * 60 + m + back) % 60:02d}" or dinner["start_time"] == "19:00"


def test_the_budget_lists_it_in_ways_to_save_and_applies_it(client, act_as):
    tid, w = _sundarbans_trip(client, act_as, "sabudget", city_price=2500, mongla_price=2800)
    b = client.get(f"{API}/trips/{tid}/budget").json()
    stay = [x for x in b["saves"] if x["key"] == "stay"]
    assert len(stay) == 1 and stay[0]["detail"]["hotel"]["name"] == "Hotel Pashur"
    assert not [x for x in b["saves"] if x["key"] == "hotel"]   # one source of truth
    r = client.post(f"{API}/trips/{tid}/budget/save", json={"action": stay[0]["action"]})
    assert r.status_code == 200, r.text
    assert r.json()["undo"]["kind"] == "stays"
    assert r.json()["budget"]["total"] == pytest.approx(b["total"] - stay[0]["saving"], abs=20)


# ---------------------------------------------------------------------------
# Only the owner
# ---------------------------------------------------------------------------

def test_only_the_owner_sees_and_answers_stay_suggestions(client, act_as):
    owner, friend, member, stranger = (_user(n) for n in ("saown", "safriend", "samember", "sastranger"))
    with _ApiTestSession() as db:
        social.befriend(db, owner.id, friend.id)
        social.befriend(db, owner.id, member.id)
        db.commit()
    act_as(owner)
    w = _world(city_price=2500, mongla_price=2800)
    town, south = w["sights"], w["south"]
    tid = _trip(client, w, [town, town[::-1], south[:2], south[2:]], w["city"])
    sid = _suggestions(client, tid)[0]["id"]
    with _ApiTestSession() as db:
        db.add(TripMember(trip_id=tid, user_id=member.id, status="invited", invited_by=owner.id))
        db.flush()
        rooms.join(db, db.get(Trip, tid), db.get(User, member.id))
        db.commit()
    for other in (friend, member, stranger):
        act_as(other)
        assert client.get(f"{API}/trips/{tid}/stay-suggestions").status_code == 404
        for verb in ("accept", "not-now", "dismiss"):
            assert client.post(f"{API}/trips/{tid}/stay-suggestions/{sid}/{verb}").status_code == 404
        b = client.get(f"{API}/trips/{tid}/budget")
        if b.status_code == 200:   # a friend reads the budget, without the owner's stay suggestions
            assert not [x for x in b.json()["saves"] if x["key"] == "stay"]
    with _ApiTestSession() as db:
        assert db.query(StaySuggestion).filter(StaySuggestion.trip_id == tid).count() >= 1


def test_not_now_quiets_those_nights_for_any_hotel_and_dont_suggest_only_that_hotel(client, act_as):
    me = _user("saquiet")
    act_as(me)
    w = _world(city_price=3500, next_door=1500)
    with _ApiTestSession() as db:   # a second cheaper hotel next door
        city = db.get(Hotel, w["city"])
        db.add(Hotel(name="Hotel Second Door", destination_id=city.destination_id, destination_name=city.destination_name, category="Standard",
                     price_per_night=2000, price_known=True, rating=4.0, rating_known=True,
                     latitude=city.latitude - 0.001, longitude=city.longitude - 0.001, is_active=True))
        db.commit()
    tid = _trip(client, w, [w["sights"], w["sights"][::-1], w["sights"]], w["city"])
    first = _suggestions(client, tid)[0]
    assert first["hotel"]["name"] == "Hotel Next Door"
    # Not now: nothing else for those nights either, until the plan changes
    assert client.post(f"{API}/trips/{tid}/stay-suggestions/{first['id']}/not-now").json()["suggestions"] == []
    with _ApiTestSession() as db:
        item = next(i for d in db.get(Trip, tid).itinerary_days if d.day_number == 1 for i in d.items)
        item.start_time, item.end_time = "10:00", "11:30"
        db.commit()
    assert _suggestions(client, tid)[0]["id"] == first["id"]
    # Don't suggest this: that hotel is gone, the next one may be offered
    left = client.post(f"{API}/trips/{tid}/stay-suggestions/{first['id']}/dismiss").json()["suggestions"]
    assert [x["hotel"]["name"] for x in left] == ["Hotel Second Door"]

"""
What you spent (docs/ui-refresh step 19, D18):
  - the owner notes amounts (list newest first, add, change, delete) within the day before the trip to the
    day after it, more than 0, one of seven parts, a note of 80 characters at most;
  - the day's plan as things to pay for: meals and paid stops (price × travellers) and rides (the budget's
    own fares), none already noted, nothing whose price isn't known;
  - the budget's spent, to_come and projected before, on and after the trip, and none without notes;
  - a removed stop keeps its note (one by one, and when the whole plan is made again);
  - spending is private: a friend who can read the trip gets 404 and no numbers;
  - the data export and the account deletion include the notes.
"""

from __future__ import annotations

import uuid
from datetime import date, timedelta

import pytest
from fastapi import Depends
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.v1.endpoints.trips import _clear_itinerary
from app.core.auth import get_current_user
from app.db import get_db
from app.main import app
from app.models.models import Hotel, Itinerary, ItineraryItem, Place, Restaurant, Trip, TripExpense, TripStay, User
from app.services import expenses
from app.services import friends as social
from tests.conftest import _ApiTestSession
from tests.test_trip_stays import API, _user

TODAY = date.today()


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


@pytest.fixture(autouse=True)
def prices_back():
    """The seed's "price known" flags as they were (places and restaurants are shared by every test)."""
    with _ApiTestSession() as db:
        places = {p.id: p.cost_known for p in db.query(Place)}
        food = {r.id: r.cost_known for r in db.query(Restaurant)}
    yield
    with _ApiTestSession() as db:
        for p in db.query(Place):
            p.cost_known = places.get(p.id, p.cost_known)
        for r in db.query(Restaurant):
            r.cost_known = food.get(r.id, r.cost_known)
        db.commit()


def _trip(owner: User, start: date) -> dict:
    """
    Three days at Cox's Bazar for two, a hotel both nights. Day 1: a paid stop (৳100 each), lunch at a
    restaurant (৳450 each), a free stop by CNG from the first, packed food that costs nothing. Day 2: a paid
    stop (৳50 each). Day 3: nothing planned.
    """
    with _ApiTestSession() as db:
        places = db.scalars(select(Place).where(Place.destination_name == "Cox's Bazar", Place.is_active.is_(True),
                                                Place.latitude.is_not(None)).order_by(Place.id).limit(3)).all()
        food = db.scalar(select(Restaurant).where(Restaurant.destination_name == "Cox's Bazar").order_by(Restaurant.id))
        hotel = db.scalar(select(Hotel).where(Hotel.destination_name == "Cox's Bazar", Hotel.price_per_night > 0,
                                              Hotel.latitude.is_not(None)).order_by(Hotel.id))
        for p in places:
            p.cost_known = True
        food.cost_known = True
        trip = Trip(user_id=owner.id, title=f"Spent {uuid.uuid4().hex[:4]}", destination="Cox's Bazar", start_date=start,
                    end_date=start + timedelta(days=2), num_travelers=2, total_budget=25000, status="generated")
        db.add(trip)
        db.flush()

        def visit(p: Place, k: int, at: str, cost: float, mode=None) -> ItineraryItem:
            return ItineraryItem(item_type="activity", place_id=p.id, title=p.name, start_time=at, end_time=at, duration_minutes=60,
                                 cost=cost, travel_time_to_next=0, distance_to_next=0, recommendation_score=0.5, order_index=k,
                                 travel_mode=mode)

        day1 = Itinerary(trip_id=trip.id, day_number=1, day_date=start, theme="Beach", total_cost=0, total_travel_time=0)
        day1.items = [
            visit(places[0], 0, "09:00", 100, mode="cng"),
            ItineraryItem(item_type="meal", restaurant_id=food.id, title=f"Lunch at {food.name}", start_time="12:30", end_time="13:30",
                          duration_minutes=60, cost=450, travel_time_to_next=0, distance_to_next=0, recommendation_score=0, order_index=1,
                          meal_source="restaurant"),
            visit(places[1], 2, "14:00", 0),
            ItineraryItem(item_type="meal", title="Packed snack", start_time="16:00", end_time="16:30", duration_minutes=30, cost=0,
                          travel_time_to_next=0, distance_to_next=0, recommendation_score=0, order_index=3, meal_source="own"),
        ]
        day2 = Itinerary(trip_id=trip.id, day_number=2, day_date=start + timedelta(days=1), theme="Sights", total_cost=0, total_travel_time=0)
        day2.items = [visit(places[2], 0, "10:00", 50)]
        day3 = Itinerary(trip_id=trip.id, day_number=3, day_date=start + timedelta(days=2), theme="Home", total_cost=0, total_travel_time=0)
        db.add_all([day1, day2, day3, TripStay(trip_id=trip.id, first_night=1, last_night=2, kind="hotel", hotel_id=hotel.id)])
        db.commit()
        return {"id": trip.id, "start": start, "items": [i.id for i in day1.items], "day2": [i.id for i in day2.items],
                "food": food.id, "places": [p.name for p in places]}


def _add(client, tid: int, status: int = 201, **body) -> dict:
    r = client.post(f"{API}/trips/{tid}/expenses", json={"note": "", **body})
    assert r.status_code == status, r.text
    return r.json()


def _budget(client, tid: int) -> dict:
    r = client.get(f"{API}/trips/{tid}/budget", params={"today": TODAY.isoformat()})
    assert r.status_code == 200, r.text
    return r.json()


def _suggest(client, tid: int, day: date) -> list[dict]:
    r = client.get(f"{API}/trips/{tid}/expenses/suggestions", params={"day": day.isoformat()})
    assert r.status_code == 200, r.text
    return r.json()


# ---------------------------------------------------------------------------
# Notes and their limits
# ---------------------------------------------------------------------------

def test_add_list_change_and_delete(client, act_as):
    owner = _user("spadd")
    act_as(owner)
    w = _trip(owner, TODAY - timedelta(days=1))
    a = _add(client, w["id"], day=w["start"].isoformat(), amount=650, part="food", note="  Breakfast · Handi  ")
    b = _add(client, w["id"], day=TODAY.isoformat(), amount=300, part="local", note="CNG to the beach")
    c = _add(client, w["id"], day=TODAY.isoformat(), amount=1200.5, part="shopping")
    assert (a["note"], a["item_id"], a["ride"]) == ("Breakfast · Handi", None, None)
    assert c["amount"] == 1200.5 and c["note"] == "" and c["created_at"].endswith("+00:00")
    # the newest day first, then the latest noted
    assert [e["id"] for e in client.get(f"{API}/trips/{w['id']}/expenses").json()] == [c["id"], b["id"], a["id"]]

    r = client.patch(f"{API}/trips/{w['id']}/expenses/{b['id']}", json={"amount": 320, "part": "other", "note": "Tip"})
    assert r.status_code == 200 and (r.json()["amount"], r.json()["part"], r.json()["note"], r.json()["day"]) == (320, "other", "Tip", TODAY.isoformat())
    assert client.patch(f"{API}/trips/{w['id']}/expenses/{b['id']}", json={"amount": None}).status_code == 422

    assert client.delete(f"{API}/trips/{w['id']}/expenses/{b['id']}").status_code == 204
    assert [e["id"] for e in client.get(f"{API}/trips/{w['id']}/expenses").json()] == [c["id"], a["id"]]
    assert client.delete(f"{API}/trips/{w['id']}/expenses/{b['id']}").status_code == 404
    # a note of another trip isn't reachable through this one
    other = _trip(owner, TODAY - timedelta(days=1))
    assert client.patch(f"{API}/trips/{other['id']}/expenses/{a['id']}", json={"amount": 1}).status_code == 404
    assert client.delete(f"{API}/trips/{other['id']}/expenses/{a['id']}").status_code == 404


def test_limits(client, act_as):
    owner = _user("splimits")
    act_as(owner)
    w = _trip(owner, TODAY - timedelta(days=1))
    first, last = w["start"] - timedelta(days=1), w["start"] + timedelta(days=3)
    _add(client, w["id"], day=first.isoformat(), amount=4800, part="getting_there", note="Bus tickets")
    _add(client, w["id"], day=last.isoformat(), amount=200, part="local")
    for day in (first - timedelta(days=1), last + timedelta(days=1)):
        _add(client, w["id"], 422, day=day.isoformat(), amount=100, part="food")
    for amount in (0, -50):
        _add(client, w["id"], 422, day=TODAY.isoformat(), amount=amount, part="food")
    _add(client, w["id"], 422, day=TODAY.isoformat(), amount=100, part="souvenirs")
    _add(client, w["id"], 201, day=TODAY.isoformat(), amount=100, part="food", note="x" * 80)
    _add(client, w["id"], 422, day=TODAY.isoformat(), amount=100, part="food", note="x" * 81)
    # what a note pays for: a stop of this trip; a ride "to" needs its stop; the way back and a move don't take one
    other = _trip(owner, TODAY - timedelta(days=1))
    _add(client, w["id"], 422, day=TODAY.isoformat(), amount=100, part="food", item_id=other["items"][1])
    _add(client, w["id"], 422, day=TODAY.isoformat(), amount=100, part="local", ride="to")
    _add(client, w["id"], 422, day=TODAY.isoformat(), amount=100, part="local", ride="back", item_id=w["items"][0])
    _add(client, w["id"], 422, day=TODAY.isoformat(), amount=100, part="local", ride="sideways")
    # a day changed by hand leaves its stop behind; one kept keeps it
    linked = _add(client, w["id"], day=w["start"].isoformat(), amount=900, part="food", item_id=w["items"][1])
    kept = client.patch(f"{API}/trips/{w['id']}/expenses/{linked['id']}", json={"amount": 950}).json()
    assert kept["item_id"] == w["items"][1]
    moved = client.patch(f"{API}/trips/{w['id']}/expenses/{linked['id']}", json={"day": TODAY.isoformat()}).json()
    assert (moved["item_id"], moved["ride"]) == (None, None)
    # a trip that didn't happen takes no notes
    with _ApiTestSession() as db:
        db.get(Trip, w["id"]).not_taken = db.get(Trip, w["id"]).created_at
        db.commit()
    _add(client, w["id"], 409, day=TODAY.isoformat(), amount=100, part="food")


# ---------------------------------------------------------------------------
# From the day's plan
# ---------------------------------------------------------------------------

def test_suggestions_are_the_days_plan_not_yet_noted(client, act_as):
    owner = _user("spsuggest")
    act_as(owner)
    w = _trip(owner, TODAY - timedelta(days=1))
    paid, lunch, free, packed = w["items"]
    rows = _suggest(client, w["id"], w["start"])
    by_key = {r["key"]: r for r in rows}
    # the paid stop and lunch at their prices for two; the free stop and the packed food that costs nothing aren't there
    assert (by_key[f"stop:{paid}"]["part"], by_key[f"stop:{paid}"]["amount"], by_key[f"stop:{paid}"]["estimate"]) == ("tickets", 200, False)
    assert (by_key[f"stop:{lunch}"]["part"], by_key[f"stop:{lunch}"]["amount"], by_key[f"stop:{lunch}"]["kind"]) == ("food", 900, "meal")
    assert f"stop:{free}" not in by_key and f"stop:{packed}" not in by_key
    # rides: the budget's own legs (fare × vehicles), each before the stop it goes to, the way back last
    rides = [r for r in rows if r["kind"] == "ride"]
    assert rides and all(r["part"] == "local" and r["amount"] > 0 and r["estimate"] and r["mode"] for r in rides)
    assert f"to:{free}" in by_key and by_key[f"to:{free}"]["mode"] == "cng"
    keys = [r["key"] for r in rows]
    assert keys.index(f"stop:{paid}") < keys.index(f"stop:{lunch}") < keys.index(f"to:{free}")
    if f"to:{paid}" in by_key:                                    # from the hotel to the first stop
        assert keys.index(f"to:{paid}") < keys.index(f"stop:{paid}")
    if "back" in by_key:
        assert keys[-1] == "back" and by_key["back"]["place"]
    day1_local = next(d for d in _budget(client, w["id"])["by_day"] if d["day_number"] == 1)["local"]
    assert abs(sum(r["amount"] for r in rides) - day1_local) <= 10 * len(rides)

    # noted from a suggestion, it's gone (the meal, a ride to a stop, the way back)
    _add(client, w["id"], day=w["start"].isoformat(), amount=900, part="food", item_id=lunch)
    _add(client, w["id"], day=w["start"].isoformat(), amount=by_key[f"to:{free}"]["amount"], part="local", item_id=free, ride="to")
    if "back" in by_key:
        _add(client, w["id"], day=w["start"].isoformat(), amount=by_key["back"]["amount"], part="local", ride="back")
    left = {r["key"] for r in _suggest(client, w["id"], w["start"])}
    assert f"stop:{lunch}" not in left and f"to:{free}" not in left and "back" not in left and f"stop:{paid}" in left
    # a note made by hand on that day takes nothing away
    _add(client, w["id"], day=w["start"].isoformat(), amount=200, part="tickets")
    assert f"stop:{paid}" in {r["key"] for r in _suggest(client, w["id"], w["start"])}

    # nothing whose price isn't known (a restaurant's, an entry price); nothing for a day off the plan, or one
    # with nothing planned
    other = _trip(owner, TODAY - timedelta(days=1))
    with _ApiTestSession() as db:
        db.get(Restaurant, other["food"]).cost_known = False
        db.get(Place, db.get(ItineraryItem, other["items"][0]).place_id).cost_known = False
        db.commit()
    unknown = {r["key"] for r in _suggest(client, other["id"], other["start"])}
    assert f"stop:{other['items'][1]}" not in unknown and f"stop:{other['items'][0]}" not in unknown
    assert _suggest(client, w["id"], w["start"] - timedelta(days=1)) == []
    assert _suggest(client, w["id"], w["start"] + timedelta(days=2)) == []


# ---------------------------------------------------------------------------
# The budget: spent, still to come, where it would end
# ---------------------------------------------------------------------------

def _part(b: dict, key: str) -> float:
    p = next(p for p in b["parts"] if p["key"] == key)
    return p["amount"] if p["known"] else 0


def test_no_notes_no_numbers(client, act_as):
    owner = _user("spnone")
    act_as(owner)
    w = _trip(owner, TODAY - timedelta(days=1))
    b = _budget(client, w["id"])
    assert (b["spent"], b["to_come"], b["projected"]) == (None, None, None)
    assert b["total"] > 0 and b["status"] in ("ok", "close", "over")       # the plan's numbers as before


def test_sums_and_whats_still_to_come_on_the_trip(client, act_as):
    owner = _user("spon")
    act_as(owner)
    w = _trip(owner, TODAY - timedelta(days=1))                  # today is day 2 of 3
    yesterday = w["start"]
    _add(client, w["id"], day=(yesterday - timedelta(days=1)).isoformat(), amount=2400, part="getting_there")
    _add(client, w["id"], day=yesterday.isoformat(), amount=4000, part="stay")
    _add(client, w["id"], day=yesterday.isoformat(), amount=650, part="food")
    _add(client, w["id"], day=yesterday.isoformat(), amount=350, part="shopping")
    _add(client, w["id"], day=TODAY.isoformat(), amount=40, part="tickets")
    _add(client, w["id"], day=TODAY.isoformat(), amount=60, part="other")
    b = _budget(client, w["id"])
    s = b["spent"]
    assert (s["total"], s["count"], s["today"]) == (7500, 6, 100)
    assert s["by_part"] == {"getting_there": 2400, "stay": 4000, "food": 650, "tickets": 40, "local": 0, "shopping": 350, "other": 60}
    # by day: not getting there or the stay (the trip's costs, not a day's)
    assert s["by_day"] == [{"date": yesterday.isoformat(), "amount": 1000}, {"date": TODAY.isoformat(), "amount": 100}]
    plan = {d["date"]: d["amount"] for d in b["by_day"]}
    today_left = max(0, plan[TODAY.isoformat()] - 40)            # the shopping and "other" aren't in today's plan
    expected = (max(0, _part(b, "getting_there") - 2400) + max(0, _part(b, "stay") - 4000)
                + today_left + plan[(TODAY + timedelta(days=1)).isoformat()])
    assert b["to_come"] == round(expected)
    assert b["projected"] == 7500 + b["to_come"]
    # more noted than planned for a part: nothing more to come for it, never below 0
    _add(client, w["id"], day=yesterday.isoformat(), amount=_part(b, "stay") + 500, part="stay")
    assert _budget(client, w["id"])["to_come"] == round(expected - max(0, _part(b, "stay") - 4000))


def test_before_and_after_the_trip(client, act_as):
    owner = _user("spphase")
    act_as(owner)
    soon = _trip(owner, TODAY + timedelta(days=5))
    _add(client, soon["id"], day=(soon["start"] - timedelta(days=1)).isoformat(), amount=1000, part="getting_there")
    b = _budget(client, soon["id"])
    # before it: the whole plan is still to come, less what's noted for getting there
    days = sum(d["amount"] for d in b["by_day"])
    assert b["to_come"] == round(max(0, _part(b, "getting_there") - 1000) + _part(b, "stay") + days)
    assert b["projected"] == 1000 + b["to_come"]

    done = _trip(owner, TODAY - timedelta(days=5))
    _add(client, done["id"], day=done["start"].isoformat(), amount=500, part="food")
    b = _budget(client, done["id"])
    # after it: no day is still to come; only what getting there and the stay planned beyond the notes
    assert b["to_come"] == round(_part(b, "getting_there") + _part(b, "stay"))
    assert b["spent"]["today"] == 0 and b["spent"]["total"] == 500


# ---------------------------------------------------------------------------
# A removed stop, privacy, the account
# ---------------------------------------------------------------------------

def test_a_removed_stop_keeps_its_note(client, act_as):
    owner = _user("spremoved")
    act_as(owner)
    w = _trip(owner, TODAY - timedelta(days=1))
    paid, lunch, free = w["items"][0], w["items"][1], w["items"][2]
    noted = _add(client, w["id"], day=w["start"].isoformat(), amount=200, part="tickets", note="Two tickets", item_id=paid)
    ride = _add(client, w["id"], day=w["start"].isoformat(), amount=120, part="local", item_id=paid, ride="to")
    r = client.delete(f"{API}/trips/{w['id']}/items/{paid}")
    assert r.status_code == 200, r.text
    rows = {e["id"]: e for e in client.get(f"{API}/trips/{w['id']}/expenses").json()}
    assert (rows[noted["id"]]["item_id"], rows[noted["id"]]["note"], rows[noted["id"]]["amount"]) == (None, "Two tickets", 200)
    assert rows[ride["id"]]["item_id"] is None and rows[ride["id"]]["amount"] == 120

    # the whole plan made again (one bulk delete): the notes stay, their stops are let go
    meal = _add(client, w["id"], day=w["start"].isoformat(), amount=900, part="food", item_id=lunch)
    to_free = _add(client, w["id"], day=w["start"].isoformat(), amount=80, part="local", item_id=free, ride="to")
    with _ApiTestSession() as db:
        _clear_itinerary(db, db.get(Trip, w["id"]))
        db.commit()
        rows = {e.id: e for e in db.scalars(select(TripExpense).where(TripExpense.trip_id == w["id"]))}
        assert {i: (rows[i].item_id, rows[i].amount) for i in (meal["id"], to_free["id"])} == {meal["id"]: (None, 900), to_free["id"]: (None, 80)}
        assert db.query(Itinerary).filter(Itinerary.trip_id == w["id"]).count() == 0


def test_a_friend_sees_none_of_it(client, act_as):
    owner, friend = _user("spowner"), _user("spfriend")
    with _ApiTestSession() as db:
        social.befriend(db, owner.id, friend.id)
        db.commit()
    act_as(owner)
    w = _trip(owner, TODAY - timedelta(days=1))
    e = _add(client, w["id"], day=TODAY.isoformat(), amount=500, part="food")
    act_as(friend)
    assert client.get(f"{API}/trips/{w['id']}").status_code == 200              # the trip itself is theirs to read
    assert client.get(f"{API}/trips/{w['id']}/expenses").status_code == 404
    assert client.get(f"{API}/trips/{w['id']}/expenses/suggestions", params={"day": TODAY.isoformat()}).status_code == 404
    assert client.post(f"{API}/trips/{w['id']}/expenses", json={"day": TODAY.isoformat(), "amount": 1, "part": "food"}).status_code == 404
    assert client.patch(f"{API}/trips/{w['id']}/expenses/{e['id']}", json={"amount": 1}).status_code == 404
    assert client.delete(f"{API}/trips/{w['id']}/expenses/{e['id']}").status_code == 404
    b = client.get(f"{API}/trips/{w['id']}/budget").json()
    assert (b["spent"], b["to_come"], b["projected"]) == (None, None, None)
    with _ApiTestSession() as db:
        assert db.get(TripExpense, e["id"]).amount == 500


def test_export_and_deleting(client, act_as):
    owner = _user("spexport")
    act_as(owner)
    w = _trip(owner, TODAY - timedelta(days=1))
    _add(client, w["id"], day=TODAY.isoformat(), amount=650, part="food", note="Breakfast")
    out = client.get(f"{API}/me/export").json()["trip_expenses"]
    assert [(e["trip_id"], e["day"], e["amount"], e["part"], e["note"]) for e in out] == [(w["id"], TODAY.isoformat(), 650, "food", "Breakfast")]
    # with the account (the service the account deletion calls), and with the trip
    with _ApiTestSession() as db:
        expenses.delete_for(db, db.get(User, owner.id))
        db.commit()
        assert db.query(TripExpense).filter(TripExpense.user_id == owner.id).count() == 0
    _add(client, w["id"], day=TODAY.isoformat(), amount=100, part="local")
    assert client.delete(f"{API}/trips/{w['id']}").status_code in (200, 204)
    with _ApiTestSession() as db:
        assert db.query(TripExpense).filter(TripExpense.trip_id == w["id"]).count() == 0

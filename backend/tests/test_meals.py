"""
Meals (docs/trip-upgrades, step 3; D6): per meal a restaurant (default), your own food or where you
stay, for the trip with a per-day override; both planners, the edits, the budget and the API.
"""

from __future__ import annotations

import pytest
from fastapi import Depends
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.db import get_db
from app.main import app
from app.models.models import Block, Trip, TripMember, User
from app.services import friends as social
from app.services import meals, rooms
from tests.conftest import _ApiTestSession
from tests.test_trip_stays import API, CHAKARIA, _itinerary, _m, _trip, _user

BOTH = ("heuristic", "cpsat")
OWN_LUNCH = {"Breakfast": "restaurant", "Lunch": "own", "Dinner": "restaurant"}
AT_STAY = {"Breakfast": "stay", "Lunch": "restaurant", "Dinner": "stay"}


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


def _meals_of(day: dict) -> dict[str, dict]:
    return {meals_slot(i): i for i in day["items"] if i["item_type"] == "meal"}


def meals_slot(item: dict) -> str:
    t = item["title"]
    return next(s for s in meals.SLOTS if t.startswith(s) or t.lower().startswith(f"packed {s.lower()}"))


def _shape(it: dict) -> list:
    """What the traveller sees of a plan: each day's items with their times and places."""
    return [[(i["item_type"], i["title"], i["start_time"], i["end_time"], i["place_id"], i["restaurant_id"]) for i in d["items"]]
            for d in it["days"]]


def _violations(it: dict, *codes: str) -> list:
    return [v for v in it["validation"]["violations"] if v["code"] in codes]


def _food(client, tid: int) -> dict:
    return next(p for p in client.get(f"{API}/trips/{tid}/budget").json()["parts"] if p["key"] == "food")


# ---------------------------------------------------------------------------
# The plan
# ---------------------------------------------------------------------------

def test_the_plan_is_checked():
    assert meals.normalize(None) is None
    assert meals.normalize({"Lunch": "own"}) == {**meals.default_plan(), "Lunch": "own"}
    with pytest.raises(meals.MealPlanError):
        meals.normalize({"Lunch": "stay"})
    with pytest.raises(meals.MealPlanError):
        meals.normalize({"Dinner": "fridge"})
    with pytest.raises(meals.MealPlanError):
        meals.normalize({"own_cost_per_person": -5})


@pytest.mark.parametrize("algorithm", BOTH)
def test_a_trip_that_leaves_meals_alone_plans_exactly_as_before(client, algorithm):
    """No plan, or one with every meal at a restaurant: the same days, to the minute."""
    plain = _trip(client, days=2, algorithm=algorithm)
    explicit = _trip(client, days=2, algorithm=algorithm, meals={"Breakfast": "restaurant", "Lunch": "restaurant", "Dinner": "restaurant"})
    a, b = _itinerary(client, plain), _itinerary(client, explicit)
    assert _shape(a) == _shape(b)
    assert client.get(f"{API}/trips/{explicit}").json()["preference"]["meals"] is None
    for d in a["days"]:
        assert all(i["meal_source"] == "restaurant" for i in d["items"] if i["item_type"] == "meal")
        assert all(i["meal_source"] is None for i in d["items"] if i["item_type"] != "meal")
        assert d["meals"] is None and d["meal_plan"]["Lunch"] == "restaurant"


@pytest.mark.parametrize("algorithm", BOTH)
def test_your_own_lunch_is_a_short_break_at_a_stop_with_no_restaurant_and_no_leg(client, algorithm):
    tid = _trip(client, days=2, algorithm=algorithm, meals={**OWN_LUNCH, "own_cost_per_person": 150})
    it = _itinerary(client, tid)
    for d in it["days"]:
        items = d["items"]
        lunch = _meals_of(d)["Lunch"]
        assert lunch["title"] == "Packed lunch" and lunch["meal_source"] == "own"
        assert lunch["restaurant_id"] is None and lunch["restaurant"] is None and lunch["place_id"] is None
        assert lunch["duration_minutes"] == 30 and lunch["cost"] == 150
        assert 12 * 60 <= _m(lunch["start_time"]) <= 14 * 60 + 30
        # Eaten where the traveller is: right after a stop, named in the note
        k = items.index(lunch)
        before = [i for i in items[:k] if i["item_type"] == "activity"]
        assert before and lunch["notes"] == f"At {before[-1]['title']}"
        assert _m(lunch["start_time"]) >= _m(before[-1]["end_time"])
        # No leg to a restaurant: the stop before goes straight on to the next stop
        after = [i for i in items[k + 1:] if i["item_type"] == "activity"]
        if after:
            assert before[-1]["travel_time_to_next"] > 0 or before[-1]["distance_to_next"] == 0
    assert not _violations(it, "PLACEHOLDER_MEAL_COST")


@pytest.mark.parametrize("algorithm", BOTH)
def test_your_own_breakfast_and_dinner_come_before_the_first_and_after_the_last_stop(client, algorithm):
    tid = _trip(client, days=2, algorithm=algorithm, meals={"Breakfast": "own", "Lunch": "restaurant", "Dinner": "own"})
    it = _itinerary(client, tid)
    for d in it["days"]:
        items, m = d["items"], _meals_of(d)
        visits = [i for i in items if i["item_type"] == "activity"]
        assert m["Breakfast"]["title"] == "Packed breakfast" and items[0] is m["Breakfast"] or items[0] == m["Breakfast"]
        assert _m(m["Breakfast"]["end_time"]) <= _m(visits[0]["start_time"])
        assert m["Dinner"]["title"] == "Packed dinner" and items[-1] == m["Dinner"]
        assert _m(m["Dinner"]["start_time"]) >= _m(visits[-1]["end_time"])
        assert m["Dinner"]["notes"] == f"At {visits[-1]['title']}"
    # Back where you stay by "finish by", the packed dinner included
    assert not _violations(it, "BACK_LATE", "AFTER_PREFERRED_END")


@pytest.mark.parametrize("algorithm", BOTH)
def test_where_you_stay_breakfast_is_before_leaving_and_dinner_after_the_way_back(client, algorithm):
    tid = _trip(client, days=3, algorithm=algorithm, meals=AT_STAY)
    it = _itinerary(client, tid)
    days = it["days"]
    for d in days:
        items, m = d["items"], _meals_of(d)
        others = [i for i in items if i["meal_source"] != "stay"]
        b = m["Breakfast"]
        assert b["title"] == "Breakfast where you stay" and b["cost"] == 0 and b["restaurant_id"] is None
        assert items[0] == b
        # it ends when you leave: the first stop less the way there from the stay
        leave = _m(others[0]["start_time"]) - (d["start_leg"]["minutes"] if d["start_leg"] else 0)
        assert _m(b["end_time"]) == leave
        if d["day_number"] < len(days):
            dinner = m["Dinner"]
            assert dinner["title"] == "Dinner where you stay" and dinner["cost"] == 0 and items[-1] == dinner
            back = _m(others[-1]["end_time"]) + d["return_leg"]["minutes"]
            assert _m(dinner["start_time"]) >= back
        else:
            assert "Dinner" not in m  # the last day has no night there
    # Outside the day on purpose: no window warnings for them, and nothing at a restaurant for them
    assert not _violations(it, "BEFORE_PREFERRED_START", "AFTER_PREFERRED_END", "BACK_LATE", "PLACEHOLDER_MEAL_COST")


def test_the_budget_counts_meals_by_where_they_are_eaten(client):
    tid = _trip(client, days=2, meals={"Breakfast": "stay", "Lunch": "own", "Dinner": "restaurant", "own_cost_per_person": 120})
    food = _food(client, tid)
    it = _itinerary(client, tid)
    counts = {s: sum(1 for d in it["days"] for i in d["items"] if i.get("meal_source") == s) for s in meals.SOURCES}
    assert food["detail"]["by_source"] == counts
    assert counts["own"] == 2 and counts["stay"] == 2 and counts["restaurant"] == 2  # breakfast at the stay both days
    assert food["detail"]["own_cost_per_person"] == 120
    # restaurant meals at their price, own food at 120 each, where you stay nothing; for the 2 travellers
    restaurant = sum(i["cost"] for d in it["days"] for i in d["items"] if i.get("meal_source") == "restaurant")
    assert food["amount"] == pytest.approx(round((restaurant + 2 * 120) * 2 / 10) * 10, abs=10)


def test_your_own_food_costs_nothing_when_no_amount_is_given(client):
    tid = _trip(client, days=2, meals={"Breakfast": "own", "Lunch": "own", "Dinner": "own"})
    assert _food(client, tid)["amount"] == 0


# ---------------------------------------------------------------------------
# Changing meals on a planned trip
# ---------------------------------------------------------------------------

def test_changing_the_trips_meals_rebuilds_only_the_meals(client):
    tid = _trip(client, days=2)
    before = _itinerary(client, tid)
    stops = [[(i["place_id"]) for i in d["items"] if i["item_type"] == "activity"] for d in before["days"]]
    r = client.put(f"{API}/trips/{tid}/meals", json={**OWN_LUNCH, "own_cost_per_person": 0})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["meals"]["Lunch"] == "own" and len(body["days"]) == 2
    assert body["budget"]["change"] < 0  # no restaurant lunch to pay for
    after = _itinerary(client, tid)
    assert [[i["place_id"] for i in d["items"] if i["item_type"] == "activity"] for d in after["days"]] == stops
    for d_before, d_after in zip(before["days"], after["days"]):
        mb, ma = _meals_of(d_before), _meals_of(d_after)
        assert ma["Lunch"]["meal_source"] == "own" and ma["Lunch"]["duration_minutes"] == 30
        assert ma["Lunch"]["start_time"] == mb["Lunch"]["start_time"]  # in the restaurant lunch's place
        assert ma["Breakfast"] == mb["Breakfast"] | {"order_index": ma["Breakfast"]["order_index"]}
    # and back again
    r = client.put(f"{API}/trips/{tid}/meals", json={"Breakfast": "restaurant", "Lunch": "restaurant", "Dinner": "restaurant"})
    assert r.status_code == 200
    assert client.get(f"{API}/trips/{tid}").json()["preference"]["meals"] is None
    assert all(_meals_of(d)["Lunch"]["meal_source"] == "restaurant" for d in _itinerary(client, tid)["days"])


def test_a_days_own_meals_win_over_the_trips_and_survive_a_new_plan(client):
    tid = _trip(client, days=3)
    days = _itinerary(client, tid)["days"]
    day2 = days[1]["id"]
    r = client.put(f"{API}/trips/{tid}/days/{day2}/meals", json={"meals": AT_STAY})
    assert r.status_code == 200, r.text
    assert [d["day_number"] for d in r.json()["days"]] == [2]
    it = _itinerary(client, tid)
    assert it["days"][1]["meals"]["Breakfast"] == "stay" and it["days"][1]["meal_plan"]["Dinner"] == "stay"
    assert _meals_of(it["days"][1])["Breakfast"]["meal_source"] == "stay"
    assert _meals_of(it["days"][0])["Breakfast"]["meal_source"] == "restaurant"
    # The trip's plan changes: day 2 keeps its own
    client.put(f"{API}/trips/{tid}/meals", json=OWN_LUNCH)
    it = _itinerary(client, tid)
    assert _meals_of(it["days"][0])["Lunch"]["meal_source"] == "own"
    assert _meals_of(it["days"][1])["Lunch"]["meal_source"] == "restaurant"
    assert _meals_of(it["days"][1])["Dinner"]["meal_source"] == "stay"
    # A whole new plan keeps day 2's choice
    assert client.post(f"{API}/trips/{tid}/generate", params={"algorithm": "heuristic"}).status_code == 200
    it = _itinerary(client, tid)
    assert it["days"][1]["meals"]["Dinner"] == "stay"
    assert _meals_of(it["days"][1])["Dinner"]["meal_source"] == "stay"
    assert _meals_of(it["days"][2])["Lunch"]["meal_source"] == "own"
    # Cleared: day 2 follows the trip again
    day2 = it["days"][1]["id"]
    assert client.put(f"{API}/trips/{tid}/days/{day2}/meals", json={"meals": None}).status_code == 200
    it = _itinerary(client, tid)
    assert it["days"][1]["meals"] is None
    assert {i["meal_source"] for i in it["days"][1]["items"] if i["item_type"] == "meal"} == {"restaurant", "own"}


def test_where_you_stay_meals_follow_the_day_when_it_changes(client):
    tid = _trip(client, days=2, meals=AT_STAY, stay={"kind": "home", "lat": CHAKARIA[0], "lon": CHAKARIA[1]})
    d = _itinerary(client, tid)["days"][0]
    dinner = _meals_of(d)["Dinner"]
    # Running 40 min late moves the rest of the day; dinner at home follows the way back
    last = [i for i in d["items"] if i["item_type"] == "activity"][-1]
    now = d["items"][1]["start_time"]
    r = client.post(f"{API}/trips/{tid}/days/{d['id']}/late", json={"now": now, "minutes": 40, "apply": True})
    assert r.status_code == 200, r.text
    d2 = _itinerary(client, tid)["days"][0]
    dinner2 = _meals_of(d2).get("Dinner")
    others = [i for i in d2["items"] if i["meal_source"] != "stay"]
    if dinner2 is not None and others:
        assert _m(dinner2["start_time"]) >= _m(others[-1]["end_time"]) + (d2["return_leg"]["minutes"] if d2["return_leg"] else 0)
        assert dinner2["start_time"] >= dinner["start_time"] or _m(last["end_time"]) < 19 * 60


def test_lunch_where_you_stay_is_refused(client):
    tid = _trip(client, days=2, generate=False)
    assert client.put(f"{API}/trips/{tid}/meals", json={"Lunch": "stay"}).status_code == 422
    r = client.post(f"{API}/trips", json={
        "destination": "Cox's Bazar", "start_date": "2026-12-01", "end_date": "2026-12-02", "total_budget": 10000,
        "meals": {"Lunch": "stay"}})
    assert r.status_code == 422


def test_a_draft_trip_keeps_its_meal_plan_for_later(client):
    tid = _trip(client, days=2, generate=False)
    r = client.put(f"{API}/trips/{tid}/meals", json={"Breakfast": "stay", "own_cost_per_person": 80})
    assert r.status_code == 200 and r.json()["days"] == []
    assert client.get(f"{API}/trips/{tid}").json()["preference"]["meals"]["Breakfast"] == "stay"
    assert client.post(f"{API}/trips/{tid}/generate").status_code == 200
    assert _meals_of(_itinerary(client, tid)["days"][1])["Breakfast"]["meal_source"] == "stay"


# ---------------------------------------------------------------------------
# Who can change them
# ---------------------------------------------------------------------------

def test_only_the_owner_changes_meals(client, act_as):
    owner, friend, member, stranger, blocked = (_user(n) for n in ("mlown", "mlfriend", "mlmember", "mlstranger", "mlblocked"))
    with _ApiTestSession() as db:
        social.befriend(db, owner.id, friend.id)
        social.befriend(db, owner.id, blocked.id)
        db.add(Block(blocker_id=owner.id, blocked_id=blocked.id))
        db.commit()
    act_as(owner)
    tid = _trip(client, days=2, meals=OWN_LUNCH)
    day_id = _itinerary(client, tid)["days"][0]["id"]
    assert client.put(f"{API}/trips/{tid}/meals", json=AT_STAY).status_code == 200
    with _ApiTestSession() as db:
        # invited to the trip's room by the owner, and joined
        social.befriend(db, owner.id, member.id)
        db.add(TripMember(trip_id=tid, user_id=member.id, status="invited", invited_by=owner.id))
        db.flush()
        rooms.join(db, db.get(Trip, tid), db.get(User, member.id))
        db.commit()

    for reader in (friend, member):
        act_as(reader)
        it = _itinerary(client, tid)  # they see the plan, meals included…
        assert _meals_of(it["days"][0])["Breakfast"]["meal_source"] == "stay"
        # …and can't change it
        assert client.put(f"{API}/trips/{tid}/meals", json=OWN_LUNCH).status_code == 404
        assert client.put(f"{API}/trips/{tid}/days/{day_id}/meals", json={"meals": None}).status_code == 404
    for outsider in (stranger, blocked):
        act_as(outsider)
        assert client.get(f"{API}/trips/{tid}/itinerary").status_code == 404
        assert client.put(f"{API}/trips/{tid}/meals", json=OWN_LUNCH).status_code == 404


def test_places_to_eat_nearby_from_a_packed_lunch_and_eating_there_after_all(client, act_as):
    owner, friend = _user("mleat"), _user("mleatfriend")
    with _ApiTestSession() as db:
        social.befriend(db, owner.id, friend.id)
        db.commit()
    act_as(owner)
    tid = _trip(client, days=2, meals=OWN_LUNCH)
    day = _itinerary(client, tid)["days"][0]
    lunch = _meals_of(day)["Lunch"]
    r = client.get(f"{API}/trips/{tid}/items/{lunch['id']}/places-to-eat")
    assert r.status_code == 200, r.text
    found = r.json()["restaurants"]
    assert found and all(x["restaurant"]["destination_name"] == "Cox's Bazar" for x in found)
    kms = [x["km"] for x in found]
    assert kms == sorted(kms)  # nearest first
    start = _m(lunch["start_time"])
    assert all(_m(x["restaurant"]["opening_time"]) <= start and start + 60 <= _m(x["restaurant"]["closing_time"]) for x in found)
    # a friend can look, not change
    act_as(friend)
    assert client.get(f"{API}/trips/{tid}/items/{lunch['id']}/places-to-eat").status_code == 200
    pick = found[0]["restaurant"]["id"]
    assert client.put(f"{API}/trips/{tid}/items/{lunch['id']}/restaurant", json={"restaurant_id": pick}).status_code == 404
    act_as(owner)
    r = client.put(f"{API}/trips/{tid}/items/{lunch['id']}/restaurant", json={"restaurant_id": pick})
    assert r.status_code == 200, r.text
    new = _meals_of(r.json()["day"])["Lunch"]
    assert new["meal_source"] == "restaurant" and new["restaurant_id"] == pick and new["duration_minutes"] == 60
    assert new["start_time"] == lunch["start_time"]
    # the stops are all still there, in order, and don't overlap the longer lunch
    stops = [i["place_id"] for i in day["items"] if i["item_type"] == "activity"]
    assert [i["place_id"] for i in r.json()["day"]["items"] if i["item_type"] == "activity"] == stops
    assert not [v for v in r.json()["validation"]["violations"] if v["code"] == "TIME_OVERLAP"]

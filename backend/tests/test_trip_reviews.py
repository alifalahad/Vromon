"""
"How was your trip?" (docs/trip-upgrades, step 7; decisions D7-D9): five stars and a comment, things one by
one (good or bad, with a comment), from the trip's first day, for everyone who went, private to each.

Each test builds an ongoing Cox's Bazar trip (yesterday to tomorrow) in the database: Dhaka → Cox's Bazar by
bus, two sights, a lunch at a restaurant and a packed lunch on day 1, a sight on day 2, a hotel for night 1
and family for night 2.
"""

from __future__ import annotations

import uuid
from datetime import date, timedelta

import pytest
from fastapi import Depends
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.db.geo_seed import seed_geo
from app.db import get_db
from app.main import app
from app.models.models import (
    Hotel, Itinerary, ItineraryItem, Place, Restaurant, ReviewItem, Trip, TripMember, TripReview, TripStay, TripStop, User,
)
from app.services import friends as social
from app.services import reviews, rooms
from tests.conftest import _ApiTestSession
from tests.test_trip_stays import API, _user

DHAKA, COX = 1185241, 1336134      # GeoNames ids (seeded)
TODAY = date.today()


@pytest.fixture(scope="module", autouse=True)
def cities():
    """Dhaka and Cox's Bazar for "getting there" (the geography isn't in every test session)."""
    with _ApiTestSession() as db:
        seed_geo(db)
        db.commit()


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


def _trip(owner: User, start: date = TODAY - timedelta(days=1)) -> dict:
    """An ongoing trip with things of every kind; returns the ids the tests need."""
    with _ApiTestSession() as db:
        places = db.scalars(select(Place).where(Place.destination_name == "Cox's Bazar", Place.is_active.is_(True)).order_by(Place.id).limit(3)).all()
        food = db.scalar(select(Restaurant).where(Restaurant.destination_name == "Cox's Bazar").order_by(Restaurant.id))
        hotel = db.scalar(select(Hotel).where(Hotel.destination_name == "Cox's Bazar").order_by(Hotel.id))
        trip = Trip(user_id=owner.id, title=f"Review test {uuid.uuid4().hex[:4]}", destination="Cox's Bazar", start_date=start,
                    end_date=start + timedelta(days=2), num_travelers=2, total_budget=20000, status="generated")
        db.add(trip)
        db.flush()
        db.add_all([TripStop(trip_id=trip.id, position=0, city_geonameid=DHAKA, country_iso2="BD"),
                    TripStop(trip_id=trip.id, position=1, city_geonameid=COX, country_iso2="BD", transport_mode="bus",
                             arrive_on=start, depart_on=start + timedelta(days=2))])
        day1 = Itinerary(trip_id=trip.id, day_number=1, day_date=start, theme="Beach", total_cost=0, total_travel_time=0)
        day2 = Itinerary(trip_id=trip.id, day_number=2, day_date=start + timedelta(days=1), theme="Sights", total_cost=0, total_travel_time=0)

        def visit(p: Place, k: int, at: str) -> ItineraryItem:
            return ItineraryItem(item_type="activity", place_id=p.id, title=p.name, start_time=at, end_time=at, duration_minutes=60,
                                 cost=0, travel_time_to_next=0, distance_to_next=0, recommendation_score=0.5, order_index=k)

        day1.items = [
            visit(places[0], 0, "09:00"),
            ItineraryItem(item_type="meal", restaurant_id=food.id, title=f"Lunch at {food.name}", start_time="12:30", end_time="13:30",
                          duration_minutes=60, cost=300, travel_time_to_next=0, distance_to_next=0, recommendation_score=0, order_index=1,
                          meal_source="restaurant"),
            visit(places[1], 2, "14:00"),
            ItineraryItem(item_type="meal", title="Packed lunch", start_time="16:00", end_time="16:30", duration_minutes=30, cost=0,
                          travel_time_to_next=0, distance_to_next=0, recommendation_score=0, order_index=3, meal_source="own"),
        ]
        day2.items = [visit(places[2], 0, "10:00")]
        db.add_all([day1, day2,
                    TripStay(trip_id=trip.id, first_night=1, last_night=1, kind="hotel", hotel_id=hotel.id),
                    TripStay(trip_id=trip.id, first_night=2, last_night=2, kind="home", label="Uncle's house", lat=21.43, lon=92.0)])
        db.commit()
        home = db.scalar(select(TripStay.id).where(TripStay.trip_id == trip.id, TripStay.kind == "home"))
        return {"id": trip.id, "places": [p.id for p in places], "place_names": [p.name for p in places], "food": food.id,
                "food_name": food.name, "hotel": hotel.id, "hotel_name": hotel.name, "home": home,
                "items": [i.id for i in day1.items] + [i.id for i in day2.items]}


def _get(client, tid: int, status: int = 200) -> dict:
    r = client.get(f"{API}/trips/{tid}/review")
    assert r.status_code == status, r.text
    return r.json()


def _put(client, tid: int, body: dict, status: int = 200) -> dict:
    r = client.put(f"{API}/trips/{tid}/review", json=body)
    assert r.status_code == status, r.text
    return r.json()


def _thing(res: dict, target_type: str, target_id=None) -> dict:
    return next(t for t in res["items"] if t["target_type"] == target_type and (target_id is None or t["target_id"] == target_id))


def _ref(t: dict, verdict, comment=None) -> dict:
    return {"target_type": t["target_type"], "target_id": t["target_id"], "item_id": t["item_id"], "verdict": verdict, "comment": comment}


# ---------------------------------------------------------------------------
# The things to rate, and one tap
# ---------------------------------------------------------------------------

def test_the_things_to_rate_come_from_the_plan(client, act_as):
    owner = _user("rvthings")
    act_as(owner)
    w = _trip(owner)
    res = _get(client, w["id"])
    assert res["review"] is None and res["opens_on"] == (TODAY - timedelta(days=1)).isoformat()
    kinds = [(t["target_type"], t["name"], t["day"]) for t in res["items"]]
    assert kinds == [
        ("journey", "Dhaka → Cox's Bazar", None),
        ("place", w["place_names"][0], 1),
        ("restaurant", w["food_name"], 1),          # the packed lunch isn't a thing to rate
        ("place", w["place_names"][1], 1),
        ("place", w["place_names"][2], 2),
        ("stay_home", "Uncle's house", None),
        ("hotel", w["hotel_name"], None),
    ]
    assert _thing(res, "journey")["mode"] == "bus"
    assert _thing(res, "restaurant")["meal"] == "Lunch" and _thing(res, "restaurant")["item_id"] == w["items"][1]
    assert (_thing(res, "hotel")["first_night"], _thing(res, "hotel")["last_night"]) == (1, 1)
    assert all(t["verdict"] is None for t in res["items"])


def test_one_tap_rates_the_trip_and_it_can_change(client, act_as):
    owner = _user("rvtap")
    act_as(owner)
    w = _trip(owner)
    assert _put(client, w["id"], {"rating": 4})["review"]["rating"] == 4
    res = _put(client, w["id"], {"rating": 5, "comment": "  Lovely   sea  "})
    assert (res["review"]["rating"], res["review"]["comment"]) == (5, "Lovely sea")
    # the comment alone, then clearing it: the stars stay
    assert _put(client, w["id"], {"comment": None})["review"] == {**res["review"], "comment": None, "updated_at": _get(client, w["id"])["review"]["updated_at"]}
    assert _get(client, w["id"])["review"]["rating"] == 5


def test_things_one_by_one_partial_updates_and_clearing(client, act_as):
    owner = _user("rvitems")
    act_as(owner)
    w = _trip(owner)
    res = _get(client, w["id"])
    beach, lunch, hotel, bus = _thing(res, "place", w["places"][0]), _thing(res, "restaurant"), _thing(res, "hotel"), _thing(res, "journey")
    # "Mark all good", then two bad with a comment
    res = _put(client, w["id"], {"items": [_ref(t, "good") for t in res["items"]]})
    assert {t["verdict"] for t in res["items"]} == {"good"}
    res = _put(client, w["id"], {"items": [_ref(bus, "bad", "The bus was late and overcrowded"), _ref(lunch, "bad", "Cold food")]})
    got = {t["key"]: (t["verdict"], t["comment"]) for t in res["items"]}
    assert got[bus["key"]] == ("bad", "The bus was late and overcrowded") and got[lunch["key"]] == ("bad", "Cold food")
    assert got[beach["key"]] == ("good", None) and got[hotel["key"]] == ("good", None)     # untouched
    assert res["review"]["rating"] is None                                                   # no stars yet: that's fine
    # the stars alone leave the things alone
    res = _put(client, w["id"], {"rating": 3})
    assert {t["key"]: (t["verdict"], t["comment"]) for t in res["items"]} == got
    # clearing one: its verdict and its comment go
    res = _put(client, w["id"], {"items": [_ref(lunch, None)]})
    assert (_thing(res, "restaurant")["verdict"], _thing(res, "restaurant")["comment"]) == (None, None)
    assert _thing(res, "journey")["verdict"] == "bad"
    with _ApiTestSession() as db:
        review = db.scalar(select(TripReview).where(TripReview.trip_id == w["id"]))
        assert len(db.scalars(select(ReviewItem).where(ReviewItem.review_id == review.id)).all()) == 6


def test_a_verdict_follows_its_place_when_the_day_is_replanned(client, act_as):
    owner = _user("rvreplan")
    act_as(owner)
    w = _trip(owner)
    beach = _thing(_get(client, w["id"]), "place", w["places"][0])
    _put(client, w["id"], {"items": [_ref(beach, "bad", "Too crowded")]})
    with _ApiTestSession() as db:     # the day re-planned: the same place, a new itinerary item
        old = db.get(ItineraryItem, beach["item_id"])
        day = db.get(Itinerary, old.itinerary_id)
        new = ItineraryItem(item_type="activity", place_id=old.place_id, title=old.title, start_time="11:00", end_time="12:00",
                            duration_minutes=60, cost=0, travel_time_to_next=0, distance_to_next=0, recommendation_score=0.5, order_index=9)
        day.items.remove(old)
        day.items.append(new)
        db.commit()
    again = _thing(_get(client, w["id"]), "place", w["places"][0])
    assert again["item_id"] != beach["item_id"] and (again["verdict"], again["comment"]) == ("bad", "Too crowded")


# ---------------------------------------------------------------------------
# Rules
# ---------------------------------------------------------------------------

def test_from_the_trips_first_day(client, act_as):
    owner = _user("rvearly")
    act_as(owner)
    w = _trip(owner, start=TODAY + timedelta(days=3))
    r = client.get(f"{API}/trips/{w['id']}/review")
    assert r.status_code == 409 and "from its first day" in r.json()["detail"]
    assert client.put(f"{API}/trips/{w['id']}/review", json={"rating": 5}).status_code == 409
    # the phone's date counts (time zones), within a day of the server's
    w2 = _trip(owner, start=TODAY + timedelta(days=1))
    assert client.get(f"{API}/trips/{w2['id']}/review", params={"today": str(TODAY + timedelta(days=1))}).status_code == 200
    assert client.get(f"{API}/trips/{w2['id']}/review", params={"today": str(TODAY + timedelta(days=9))}).status_code == 409
    # the first day itself, and long after the end
    assert _get(client, _trip(owner, start=TODAY)["id"])["review"] is None
    assert _get(client, _trip(owner, start=TODAY - timedelta(days=60))["id"])["review"] is None


def test_validation(client, act_as):
    owner = _user("rvvalid")
    act_as(owner)
    w = _trip(owner)
    hotel = _thing(_get(client, w["id"]), "hotel")
    for bad in ({"rating": 0}, {"rating": 6}, {"comment": "x" * 281}, {"items": [_ref(hotel, "great")]},
                {"items": [_ref(hotel, "good", "x" * 281)]}, {"items": [{**_ref(hotel, "good"), "target_type": "beach"}]}):
        _put(client, w["id"], bad, 422)
    # something that isn't part of this trip
    assert "isn't part of this trip" in _put(client, w["id"], {"items": [{**_ref(hotel, "good"), "target_id": 999999}]}, 422)["detail"]
    # 280 characters is fine
    assert _put(client, w["id"], {"comment": "y" * 280})["review"]["comment"] == "y" * 280
    assert _get(client, w["id"])["review"]["rating"] is None


# ---------------------------------------------------------------------------
# Everyone who went, each their own, private (D8, D9)
# ---------------------------------------------------------------------------

def test_privacy_and_a_members_own_review(client, act_as):
    owner, member, invited, friend, stranger = (_user(n) for n in ("rvown", "rvmember", "rvinvited", "rvfriend", "rvstranger"))
    with _ApiTestSession() as db:
        for u in (member, invited, friend):
            social.befriend(db, owner.id, u.id)
        db.commit()
    w = _trip(owner)
    with _ApiTestSession() as db:
        trip = db.get(Trip, w["id"])
        db.add_all([TripMember(trip_id=trip.id, user_id=member.id, status="invited", invited_by=owner.id),
                    TripMember(trip_id=trip.id, user_id=invited.id, status="invited", invited_by=owner.id)])
        db.flush()
        rooms.join(db, trip, db.get(User, member.id))
        db.commit()
    act_as(owner)
    _put(client, w["id"], {"rating": 5, "comment": "Wonderful", "items": [_ref(_thing(_get(client, w["id"]), "hotel"), "good", "Clean")]})
    # the member rates on their own, and never sees the owner's review
    act_as(member)
    mine = _get(client, w["id"])
    assert mine["review"] is None and all(t["verdict"] is None for t in mine["items"])
    assert _thing(mine, "stay_home")["name"] == ""          # the owner's family home isn't named to others (D2)
    _put(client, w["id"], {"rating": 2, "items": [_ref(_thing(mine, "hotel"), "bad", "Noisy")]})
    act_as(owner)
    theirs = _get(client, w["id"])
    assert (theirs["review"]["rating"], theirs["review"]["comment"]) == (5, "Wonderful")
    assert (_thing(theirs, "hotel")["verdict"], _thing(theirs, "hotel")["comment"]) == ("good", "Clean")
    act_as(member)
    assert (_get(client, w["id"])["review"]["rating"], _thing(_get(client, w["id"]), "hotel")["comment"]) == (2, "Noisy")
    # nobody else: an invited friend who hasn't joined, a friend who can see the trip, a stranger
    for other in (invited, friend, stranger):
        act_as(other)
        assert client.get(f"{API}/trips/{w['id']}/review").status_code == 404
        assert client.put(f"{API}/trips/{w['id']}/review", json={"rating": 1}).status_code == 404
    with _ApiTestSession() as db:
        assert db.query(TripReview).filter(TripReview.trip_id == w["id"]).count() == 2


def test_export_and_deleting(client, act_as):
    owner = _user("rvexport")
    act_as(owner)
    w = _trip(owner)
    _put(client, w["id"], {"rating": 4, "items": [_ref(_thing(_get(client, w["id"]), "journey"), "bad", "Late")]})
    out = client.get(f"{API}/me/export").json()["trip_reviews"]
    assert [(r["trip_id"], r["rating"], [(i["target_type"], i["verdict"], i["comment"]) for i in r["items"]]) for r in out] == \
        [(w["id"], 4, [("journey", "bad", "Late")])]
    # with the account (the service the account deletion calls), and with the trip
    with _ApiTestSession() as db:
        reviews.delete_for(db, db.get(User, owner.id))
        db.commit()
        assert db.query(TripReview).filter(TripReview.user_id == owner.id).count() == 0
        assert db.query(ReviewItem).count() == db.query(ReviewItem).join(TripReview).count()        # no orphans
    _put(client, w["id"], {"rating": 3})
    assert client.delete(f"{API}/trips/{w['id']}").status_code in (200, 204)
    with _ApiTestSession() as db:
        assert db.query(TripReview).filter(TripReview.trip_id == w["id"]).count() == 0


def test_deleting_a_trip_leaves_nothing_behind(client, act_as):
    """SQLite doesn't enforce ON DELETE CASCADE here: the ORM deletes a trip's reviews (and their items) and
    its stay suggestions (step 4 left those behind before)."""
    from app.models.models import StaySuggestion

    owner = _user("rvcascade")
    act_as(owner)
    w = _trip(owner)
    _put(client, w["id"], {"rating": 4, "items": [_ref(_thing(_get(client, w["id"]), "hotel"), "good")]})
    with _ApiTestSession() as db:
        db.add(StaySuggestion(trip_id=w["id"], first_night=1, last_night=1, hotel_id=w["hotel"], minutes_saved=10, extra_moves=0,
                              status="open", fingerprint="x"))
        db.commit()
        review_id = db.scalar(select(TripReview.id).where(TripReview.trip_id == w["id"]))
    assert client.delete(f"{API}/trips/{w['id']}").status_code in (200, 204)
    with _ApiTestSession() as db:
        assert db.query(TripReview).filter(TripReview.trip_id == w["id"]).count() == 0
        assert db.query(ReviewItem).filter(ReviewItem.review_id == review_id).count() == 0
        assert db.query(StaySuggestion).filter(StaySuggestion.trip_id == w["id"]).count() == 0

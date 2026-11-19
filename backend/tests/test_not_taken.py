"""
After the trip (docs/ui-refresh step 16): "This trip didn't happen" (D19) and "Plan it again" (D21).

- A trip its owner says didn't happen (PATCH not_taken, only once its last day has passed on the phone's
  date) is left out of "Your trips so far", isn't offered for rating or for the map (409), and keeps
  what it was rated, unseen, until it's said to have happened after all.
- "Plan it again" copies a trip for new dates: its route's days move with it, and must-dos and busy
  times on a day the copy doesn't have lose that day or are left out.
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
from app.models.models import Place, Trip, TripMember, User
from app.services import friends as social
from app.services import rooms
from app.services.stats.trips import summarize
from tests.conftest import _ApiTestSession

API = "/api/v1"
COX = 1336134  # GeoNames: Cox's Bazar
DHAKA = 1185241
TODAY = date.today()


@pytest.fixture(scope="module", autouse=True)
def geo_data():
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
        "num_travelers": 2, "total_budget": 20000, "preference": {"interests": ["Beach"]}, "constraints": {}, **extra,
    }
    resp = client.post(f"{API}/trips", json=body)
    assert resp.status_code in (200, 201), resp.text
    return resp.json()


def _not_taken(client, tid: int, value: bool, today: date = TODAY, status: int = 200) -> dict:
    resp = client.patch(f"{API}/trips/{tid}", params={"today": str(today)}, json={"not_taken": value})
    assert resp.status_code == status, resp.text
    return resp.json()


def _stats(client) -> dict:
    return client.get(f"{API}/me/trips/stats", params={"today": str(TODAY)}).json()


# ---------------------------------------------------------------------------
# "This trip didn't happen"
# ---------------------------------------------------------------------------

@dataclass
class _Trip:
    start_date: date
    end_date: date
    id: int = 1
    stops: list = field(default_factory=list)
    title: str | None = None
    destination: str = "Somewhere"
    not_taken: object = None


def test_summarize_leaves_out_a_trip_that_didnt_happen():
    taken = _Trip(date(2026, 10, 1), date(2026, 10, 3), id=1)
    not_taken = _Trip(date(2026, 9, 1), date(2026, 9, 10), id=2, not_taken=object())
    s = summarize([taken, not_taken], date(2026, 11, 1), {})
    assert (s.trips, s.total_days, s.finished, s.longest_trip["trip_id"]) == (1, 3, [1], 1)
    assert s.per_year == [{"year": 2026, "trips": 1, "days": 3, "trip_ids": [1]}]


def test_your_trips_so_far_with_and_without_it(client, act_as):
    act_as(_user("nt-stats"))
    old = _trip(client, TODAY - timedelta(days=20), days=3, origin={"city_geonameid": DHAKA})
    recent = _trip(client, TODAY - timedelta(days=5), days=2)
    before = _stats(client)
    assert (before["trips"], before["total_days"]) == (2, 5)
    assert sorted(before["finished"]) == sorted([old["id"], recent["id"]])

    marked = _not_taken(client, old["id"], True)
    assert marked["not_taken"] is not None
    after = _stats(client)
    assert (after["trips"], after["total_days"], after["finished"]) == (1, 2, [recent["id"]])
    assert after["places"]["cities"][0]["trip_ids"] == [recent["id"]]
    assert [y["trip_ids"] for y in after["per_year"]] == [[recent["id"]]]

    # "It did happen": back in the numbers
    assert _not_taken(client, old["id"], False)["not_taken"] is None
    assert _stats(client)["trips"] == 2


def test_only_once_its_last_day_has_passed(client, act_as):
    act_as(_user("nt-when"))
    upcoming = _trip(client, TODAY + timedelta(days=3))
    ongoing = _trip(client, TODAY - timedelta(days=1), days=2)          # its last day is today
    _not_taken(client, upcoming["id"], True, status=409)
    _not_taken(client, ongoing["id"], True, status=409)
    # The phone's date is trusted within a day of the server's: tomorrow there, the trip is over
    assert _not_taken(client, ongoing["id"], True, today=TODAY + timedelta(days=1))["not_taken"] is not None
    # Saying it again keeps when it was first said
    first = client.get(f"{API}/trips/{ongoing['id']}").json()["not_taken"]
    assert _not_taken(client, ongoing["id"], True, today=TODAY + timedelta(days=1))["not_taken"] == first


def test_only_the_owner_says_so(client, act_as):
    owner, member = _user("nt-owner"), _user("nt-member")
    with _ApiTestSession() as db:
        social.befriend(db, owner.id, member.id)
        db.commit()
    act_as(owner)
    trip = _trip(client, TODAY - timedelta(days=6), days=2)
    with _ApiTestSession() as db:
        t = db.get(Trip, trip["id"])
        db.add(TripMember(trip_id=t.id, user_id=member.id, status="invited", invited_by=owner.id))
        db.flush()
        rooms.join(db, t, db.get(User, member.id))
        db.commit()
    act_as(member)
    _not_taken(client, trip["id"], True, status=404)


def test_not_offered_for_rating_or_the_map_and_its_rating_comes_back(client, act_as):
    act_as(_user("nt-rate"))
    trip = _trip(client, TODAY - timedelta(days=8), days=3, origin={"city_geonameid": DHAKA})
    tid = trip["id"]
    rated = client.put(f"{API}/trips/{tid}/review", params={"today": str(TODAY)}, json={"rating": 4, "comment": "Lovely"})
    assert rated.status_code == 200, rated.text

    _not_taken(client, tid, True)
    assert client.get(f"{API}/trips/{tid}/review", params={"today": str(TODAY)}).status_code == 409
    assert client.put(f"{API}/trips/{tid}/review", params={"today": str(TODAY)}, json={"rating": 2}).status_code == 409
    assert client.post(f"{API}/trips/{tid}/mark-visited", json={"mark": True}).status_code == 409
    assert client.get(f"{API}/trips/{tid}").json()["visited_prompt"] is None      # still unanswered

    # Undone: the rating it had is there again, and the map offer can be answered
    _not_taken(client, tid, False)
    review = client.get(f"{API}/trips/{tid}/review", params={"today": str(TODAY)}).json()["review"]
    assert (review["rating"], review["comment"]) == (4, "Lovely")
    assert client.post(f"{API}/trips/{tid}/mark-visited", json={"mark": False}).json()["visited_prompt"] == "dismissed"


def test_in_the_trip_the_list_and_the_export(client, act_as):
    act_as(_user("nt-out"))
    trip = _trip(client, TODAY - timedelta(days=4), days=2)
    assert trip["not_taken"] is None
    _not_taken(client, trip["id"], True)
    assert client.get(f"{API}/trips/{trip['id']}").json()["not_taken"]
    listed = next(t for t in client.get(f"{API}/trips").json() if t["id"] == trip["id"])
    assert listed["not_taken"]
    exported = next(t for t in client.get(f"{API}/me/export").json()["trips"] if t["id"] == trip["id"])
    assert exported["not_taken"]


def test_other_changes_still_work_with_it(client, act_as):
    act_as(_user("nt-mixed"))
    trip = _trip(client, TODAY - timedelta(days=4), days=2)
    resp = client.patch(f"{API}/trips/{trip['id']}", params={"today": str(TODAY)}, json={"not_taken": True, "title": "Never went"})
    assert resp.status_code == 200, resp.text
    assert (resp.json()["title"], bool(resp.json()["not_taken"])) == ("Never went", True)
    # A change without it leaves it alone
    assert client.patch(f"{API}/trips/{trip['id']}", json={"title": "Still never went"}).json()["not_taken"]


# ---------------------------------------------------------------------------
# "Plan it again": a copy for new dates
# ---------------------------------------------------------------------------

def _places(n: int) -> list[int]:
    with _ApiTestSession() as db:
        return list(db.scalars(select(Place.id).where(Place.destination_name == "Cox's Bazar", Place.is_active.is_(True),
                                                      Place.listed.is_(True)).order_by(Place.id).limit(n)))


def test_plan_it_again_for_new_dates(client, act_as):
    act_as(_user("again"))
    a, b = _places(2)
    start = TODAY - timedelta(days=30)
    trip = _trip(client, start, days=3, origin={"city_geonameid": DHAKA}, transport_mode="bus",
                 constraints={"must_sees": [{"place_id": a, "day": 2}, {"place_id": b, "day": 3, "when": "morning"}],
                              "busy": [{"day": 1, "start": "09:00", "end": "10:00"}, {"day": 3, "start": "15:00", "end": "16:00"}]})
    new_start = TODAY + timedelta(days=7)
    resp = client.post(f"{API}/trips/{trip['id']}/duplicate", params={"today": str(TODAY)},
                       json={"start_date": str(new_start), "end_date": str(new_start + timedelta(days=1))})
    assert resp.status_code == 201, resp.text
    copy = resp.json()
    assert (copy["start_date"], copy["end_date"], copy["num_days"]) == (str(new_start), str(new_start + timedelta(days=1)), 2)
    assert (copy["status"], copy["title"], copy["visited_prompt"], copy["not_taken"]) == ("draft", trip["title"], None, None)
    assert copy["itinerary_days"] == []                     # built later, for its own days
    # The route moves with it and stays within the copy's days
    cox = next(s for s in copy["stops"] if s["city_geonameid"] == COX)
    assert (cox["arrive_on"], cox["depart_on"]) == (str(new_start), str(new_start + timedelta(days=1)))
    # Must-dos keep their place; one on a day the copy doesn't have keeps its time of day, any day
    assert copy["constraints"]["must_sees"] == [{"place_id": a, "day": 2, "when": None, "at": None},
                                                {"place_id": b, "day": None, "when": "morning", "at": None}]
    assert copy["constraints"]["busy"] == [{"day": 1, "start": "09:00", "end": "10:00", "label": None}]


def test_plan_it_again_keeps_the_name_a_duplicate_says_copy(client, act_as):
    act_as(_user("again-name"))
    trip = _trip(client, TODAY - timedelta(days=10), days=2)
    assert client.patch(f"{API}/trips/{trip['id']}", json={"title": "Beach with Mum"}).status_code == 200
    same = client.post(f"{API}/trips/{trip['id']}/duplicate").json()
    assert (same["title"], same["start_date"]) == ("Beach with Mum (Copy)", trip["start_date"])
    again = client.post(f"{API}/trips/{trip['id']}/duplicate", params={"today": str(TODAY)},
                        json={"start_date": str(TODAY), "end_date": str(TODAY + timedelta(days=1))}).json()
    assert again["title"] == "Beach with Mum"


@pytest.mark.parametrize("dates", [
    (-1, 1),       # starts before today
    (5, 4),        # ends before it starts
    (1, 31),       # 31 days
])
def test_plan_it_again_needs_good_dates(client, act_as, dates):
    act_as(_user("again-bad"))
    trip = _trip(client, TODAY - timedelta(days=10), days=2)
    first, last = (TODAY + timedelta(days=d) for d in dates)
    resp = client.post(f"{API}/trips/{trip['id']}/duplicate", params={"today": str(TODAY)},
                       json={"start_date": str(first), "end_date": str(last)})
    assert resp.status_code == 422, resp.text


def test_a_trip_you_went_on_with_a_friend_planned_again(client, act_as):
    owner, member = _user("again-owner"), _user("again-member")
    with _ApiTestSession() as db:
        social.befriend(db, owner.id, member.id)
        db.commit()
    act_as(owner)
    trip = _trip(client, TODAY - timedelta(days=12), days=2)
    act_as(member)
    new_start = TODAY + timedelta(days=20)
    copy = client.post(f"{API}/trips/{trip['id']}/copy", params={"today": str(TODAY)},
                       json={"start_date": str(new_start), "end_date": str(new_start + timedelta(days=2))}).json()
    assert (copy["start_date"], copy["num_days"]) == (str(new_start), 3)
    # A copy in the future is one you'll take: its map offer waits for it to end, as any trip's
    assert copy["visited_prompt"] is None
    # Without dates a friend's finished trip is copied as it was, not as a trip you went on
    assert client.post(f"{API}/trips/{trip['id']}/copy").json()["visited_prompt"] == "dismissed"

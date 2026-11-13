"""
Where the traveller stays, night by night (docs/trip-upgrades, step 1; decisions D1–D3, D11):
the stays cover the nights once, each day starts and ends at them, the way back counts inside
"finish by", a home costs nothing and stays private to the owner, and old app versions still get
the trip's hotel.
"""

from __future__ import annotations

import uuid
from datetime import date, timedelta
from types import SimpleNamespace

import pytest
from fastapi import Depends
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.auth import get_current_user, new_friend_code
from app.db import get_db
from app.main import app
from app.models.models import Block, Hotel, User
from app.services import friends as social
from app.services import stays
from tests.conftest import _ApiTestSession

API = "/api/v1"
COX = "Cox's Bazar"
# About 37 km north of Cox's Bazar: a relative's home well away from the sights
CHAKARIA = (21.765, 92.075)


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


def _hotels() -> list[Hotel]:
    """Cox's Bazar's active hotels with a price, cheapest first."""
    with _ApiTestSession() as db:
        rows = db.query(Hotel).filter(Hotel.destination_name == COX, Hotel.is_active == True,  # noqa: E712
                                      Hotel.price_known == True).order_by(Hotel.price_per_night).all()  # noqa: E712
        for h in rows:
            db.expunge(h)
        return rows


def _trip(client, days: int = 3, generate: bool = True, algorithm: str = "heuristic", **extra) -> int:
    start = date(2026, 12, 1)
    payload = {
        "destination": COX, "start_date": str(start), "end_date": str(start + timedelta(days=days - 1)),
        "num_travelers": 2, "total_budget": 40000,
        "preference": {"interests": ["Beach", "Nature"], "accommodation_preference": "Standard"}, **extra,
    }
    r = client.post(f"{API}/trips", json=payload)
    assert r.status_code == 201, r.text
    tid = r.json()["id"]
    if generate:
        g = client.post(f"{API}/trips/{tid}/generate", params={"algorithm": algorithm})
        assert g.status_code == 200, g.text
    return tid


def _put(client, tid: int, stays_: list[dict]):
    return client.put(f"{API}/trips/{tid}/stays", json={"stays": stays_})


def _itinerary(client, tid: int) -> dict:
    r = client.get(f"{API}/trips/{tid}/itinerary")
    assert r.status_code == 200, r.text
    return r.json()


def _stay_part(client, tid: int) -> dict:
    b = client.get(f"{API}/trips/{tid}/budget").json()
    return next(p for p in b["parts"] if p["key"] == "stay")


def _m(t: str) -> int:
    h, m = t.split(":")
    return int(h) * 60 + int(m)


# ---------------------------------------------------------------------------
# Picking a hotel (D11)
# ---------------------------------------------------------------------------

def test_a_name_that_is_only_places_is_not_a_hotel():
    assert not stays.looks_like_a_hotel("বয়রা,খুলনা", "Khulna")
    assert not stays.looks_like_a_hotel("Khulna", "Khulna")
    assert stays.looks_like_a_hotel("Hotel jalico", "Khulna")
    assert stays.looks_like_a_hotel("Western Inn International", "Khulna")
    assert stays.looks_like_a_hotel("Royal Castle", "Khulna")


def test_a_priced_real_hotel_first_then_the_best_rated_real_one():
    place = f"Testpur{uuid.uuid4().hex[:4]}"
    with _ApiTestSession() as db:
        from app.models.models import Destination
        dest = Destination(name=place, country="Bangladesh", latitude=23.0, longitude=90.0)
        db.add(dest)
        db.flush()
        common = dict(destination_id=dest.id, destination_name=place, latitude=23.0, longitude=90.0, is_active=True)
        area = Hotel(name=f"Bazar,{place}", category="Standard", price_known=False, rating=4.9, **common)
        plain = Hotel(name="Hotel Plain", category="Standard", price_known=False, rating=3.0, **common)
        good = Hotel(name="Hotel Good", category="Standard", price_known=False, rating=4.5, **common)
        cheap = Hotel(name="Guest House Cheap", category="Budget", price_known=True, price_per_night=900, **common)
        db.add_all([area, plain, good, cheap])
        db.commit()
        trip = SimpleNamespace(destination=place, preference=SimpleNamespace(hotel_id=None, accommodation_preference="Standard"))
        # No Standard hotel has a price: the priced one a level away wins
        assert stays.pick_hotel(db, trip).name == "Guest House Cheap"
        cheap.price_known = False
        db.commit()
        # None priced: the best-rated real-named one (never the area name)
        assert stays.pick_hotel(db, trip).name == "Hotel Good"


def test_the_hotel_list_says_which_prices_and_ratings_are_known(client):
    """The stays sheet lists priced hotels first and says "Price not known" for the rest (step 2)."""
    place = f"Testpur{uuid.uuid4().hex[:4]}"
    with _ApiTestSession() as db:
        from app.models.models import Destination
        dest = Destination(name=place, country="Bangladesh", latitude=23.0, longitude=90.0)
        db.add(dest)
        db.flush()
        common = dict(destination_id=dest.id, destination_name=place, latitude=23.0, longitude=90.0, is_active=True, category="Standard")
        db.add_all([Hotel(name="Hotel Priced", price_known=True, price_per_night=2500, rating_known=True, rating=4.2, **common),
                    Hotel(name="Hotel Unknown", price_known=False, price_per_night=0, rating_known=False, **common)])
        db.commit()
        dest_id = dest.id
    rows = {h["name"]: h for h in client.get(f"{API}/destinations/{dest_id}/hotels").json()}
    assert (rows["Hotel Priced"]["price_known"], rows["Hotel Priced"]["rating_known"]) == (True, True)
    assert (rows["Hotel Unknown"]["price_known"], rows["Hotel Unknown"]["rating_known"]) == (False, False)


# ---------------------------------------------------------------------------
# The stays
# ---------------------------------------------------------------------------

def test_a_planned_trip_writes_down_its_hotel(client):
    tid = _trip(client)
    out = client.get(f"{API}/trips/{tid}/stays").json()
    assert out["nights"] == 2 and out["chosen"] is True
    assert [(s["first_night"], s["last_night"], s["kind"]) for s in out["stays"]] == [(1, 2, "hotel")]
    hotel = out["stays"][0]["hotel"]
    assert stays.looks_like_a_hotel(hotel["name"], COX)
    # Old app versions read the trip's one hotel: still there
    assert _itinerary(client, tid)["hotel"]["id"] == hotel["id"]


def test_stays_must_cover_the_nights_once(client):
    tid = _trip(client, days=4)
    h = _hotels()[0]
    good = [{"first_night": 1, "last_night": 3, "kind": "hotel", "hotel_id": h.id}]
    assert _put(client, tid, [{"first_night": 1, "last_night": 2, "kind": "hotel", "hotel_id": h.id}]).status_code == 422  # night 3 missing
    assert _put(client, tid, [{"first_night": 1, "last_night": 2, "kind": "hotel", "hotel_id": h.id},
                              {"first_night": 2, "last_night": 3, "kind": "none"}]).status_code == 422  # overlap
    assert _put(client, tid, [{"first_night": 2, "last_night": 3, "kind": "none"}]).status_code == 422  # gap at the start
    assert _put(client, tid, [{"first_night": 1, "last_night": 3, "kind": "tent"}]).status_code == 422
    assert _put(client, tid, [{"first_night": 1, "last_night": 3, "kind": "home"}]).status_code == 422  # where?
    assert _put(client, tid, [{"first_night": 1, "last_night": 3, "kind": "hotel", "hotel_id": 999999}]).status_code == 404
    assert _put(client, tid, [{"first_night": 1, "last_night": 3, "kind": "home", "lat": CHAKARIA[0], "lon": CHAKARIA[1],
                               "label": "x" * 81}]).status_code == 422
    assert _put(client, tid, good).status_code == 200


def test_a_home_night_costs_nothing_and_a_move_day_ends_at_the_new_stay(client):
    tid = _trip(client)
    h = _hotels()[0]
    r = _put(client, tid, [
        {"first_night": 1, "last_night": 1, "kind": "hotel", "hotel_id": h.id},
        {"first_night": 2, "last_night": 2, "kind": "home", "lat": CHAKARIA[0], "lon": CHAKARIA[1], "label": "Uncle's house"},
    ])
    assert r.status_code == 200, r.text
    out = r.json()
    assert [s["kind"] for s in out["stays"]] == ["hotel", "home"]
    assert out["budget"]["change"] != 0 and out["days"]                     # days 2 and 3 now end or start elsewhere

    stay = _stay_part(client, tid)
    assert stay["known"] and stay["amount"] == round(h.price_per_night * 1 * 1 / 10) * 10   # one hotel night, one room for 2
    lines = stay["detail"]["blocks"]
    assert lines[1]["kind"] == "home" and lines[1]["amount"] == 0 and lines[1]["label"] == "Uncle's house"

    days = _itinerary(client, tid)["days"]
    d1, d2, d3 = days
    assert d1["start_base"]["kind"] == "hotel" and d1["end_base"]["kind"] == "hotel"
    assert d2["start_base"]["hotel_id"] == h.id and d2["end_base"]["kind"] == "home"      # the move day
    assert d3["start_base"]["kind"] == "home" and d3["end_base"]["name"] == "Uncle's house"  # the last day leaves from there
    assert d2["return_leg"]["minutes"] > 20 and d2["return_leg"]["km"] > 10


@pytest.mark.parametrize("algorithm", ["heuristic", "cpsat"])
def test_back_where_you_stay_by_finish_by(client, algorithm):
    """D3: "finish by" (20:00) means back at the stay, even far from the sights."""
    tid = _trip(client, days=2, generate=False, stay={"kind": "home", "lat": CHAKARIA[0], "lon": CHAKARIA[1]})
    assert client.post(f"{API}/trips/{tid}/generate", params={"algorithm": algorithm}).status_code == 200
    it = _itinerary(client, tid)
    for day in it["days"]:
        last = max(day["items"], key=lambda i: i["order_index"])
        back = _m(last["end_time"]) + day["return_leg"]["minutes"]
        assert back <= 20 * 60 + 5, (day["day_number"], last["title"], last["end_time"], day["return_leg"])
    codes = [v["code"] for v in (it["validation"] or {}).get("violations", [])]
    assert "BACK_LATE" not in codes


def test_the_way_back_and_the_route_show_on_the_map(client):
    tid = _trip(client, days=2)
    day = _itinerary(client, tid)["days"][0]
    route = client.get(f"{API}/trips/{tid}/days/{day['id']}/route").json()
    kinds = [leg.get("kind") for leg in route["legs"]]
    assert kinds[0] == "from_base" and kinds[-1] == "to_base"
    assert day["return_leg"] is not None and day["total_travel_time"] >= day["return_leg"]["minutes"] - 1
    first = min(day["items"], key=lambda i: i["order_index"])
    assert day["start_leg"]["to_item_id"] == first["id"] and day["start_leg"]["minutes"] >= 0


def test_a_new_trip_can_say_where_it_stays(client):
    tid = _trip(client, days=3, stay={"kind": "home", "lat": CHAKARIA[0], "lon": CHAKARIA[1], "label": "Aunt's"})
    out = client.get(f"{API}/trips/{tid}/stays").json()
    assert [(s["first_night"], s["last_night"], s["kind"], s["label"]) for s in out["stays"]] == [(1, 2, "home", "Aunt's")]
    stay = _stay_part(client, tid)
    assert stay["known"] and stay["amount"] == 0
    # A bad choice is refused and leaves no trip half-made
    r = client.post(f"{API}/trips", json={
        "destination": COX, "start_date": "2026-12-01", "end_date": "2026-12-03", "num_travelers": 2, "total_budget": 40000,
        "stay": {"kind": "hotel", "hotel_id": 999999},
    })
    assert r.status_code == 404


def test_a_day_trip_costs_nothing_and_starts_from_where_you_start(client):
    tid = _trip(client, days=2, generate=False, origin_point={"lat": 21.45, "lon": 91.97, "label": "Home"}, stay={"kind": "none"})
    client.post(f"{API}/trips/{tid}/generate")
    day = _itinerary(client, tid)["days"][0]
    assert day["start_base"]["kind"] == "none" and day["start_base"]["latitude"] == 21.45
    assert _stay_part(client, tid)["amount"] == 0


# ---------------------------------------------------------------------------
# Privacy (D2)
# ---------------------------------------------------------------------------

def test_only_the_owner_learns_where_a_home_is(client, act_as):
    owner, friend, stranger, blocked = _user("stown"), _user("stfriend"), _user("ststranger"), _user("stblocked")
    with _ApiTestSession() as db:
        social.befriend(db, owner.id, friend.id)
        social.befriend(db, owner.id, blocked.id)
        db.add(Block(blocker_id=owner.id, blocked_id=blocked.id))
        db.commit()
    act_as(owner)
    tid = _trip(client, days=2, stay={"kind": "home", "lat": CHAKARIA[0], "lon": CHAKARIA[1], "label": "Uncle's house"})
    day_id = _itinerary(client, tid)["days"][0]["id"]
    assert client.get(f"{API}/trips/{tid}/stays").json()["stays"][0]["label"] == "Uncle's house"

    act_as(friend)
    s = client.get(f"{API}/trips/{tid}/stays")
    assert s.status_code == 200
    assert s.json()["stays"][0] | {"hotel": None} == s.json()["stays"][0] and s.json()["stays"][0]["kind"] == "home"
    assert s.json()["stays"][0]["label"] is None and s.json()["stays"][0]["lat"] is None
    it = _itinerary(client, tid)
    for d in it["days"]:
        assert d["end_base"] == {"kind": "home", "name": None, "latitude": None, "longitude": None, "hotel_id": None, "estimate": False}
        assert d["return_leg"] is None and d["start_leg"] is None
    route = client.get(f"{API}/trips/{tid}/days/{day_id}/route").json()
    assert not any(leg.get("kind") in ("from_base", "to_base") for leg in route["legs"])
    trip = client.get(f"{API}/trips/{tid}").json()
    assert all(d["end_base"]["latitude"] is None for d in trip["itinerary_days"])
    stay = next(p for p in client.get(f"{API}/trips/{tid}/budget").json()["parts"] if p["key"] == "stay")
    assert all(ln["label"] is None for ln in stay["detail"]["blocks"])
    assert _put(client, tid, [{"first_night": 1, "last_night": 1, "kind": "none"}]).status_code == 404  # only the owner changes it

    act_as(stranger)
    assert client.get(f"{API}/trips/{tid}/stays").status_code == 404
    act_as(blocked)
    assert client.get(f"{API}/trips/{tid}/stays").status_code == 404


def test_the_stays_are_in_the_export_and_go_with_the_account(client, act_as):
    me = _user("stexport")
    act_as(me)
    tid = _trip(client, days=2, stay={"kind": "home", "lat": CHAKARIA[0], "lon": CHAKARIA[1], "label": "Home base"})
    export = client.get(f"{API}/me/export").json()
    trip = next(t for t in export["trips"] if t["id"] == tid)
    assert trip["stays"][0]["label"] == "Home base"
    assert client.delete(f"{API}/me").status_code in (200, 204)
    with _ApiTestSession() as db:
        from app.models.models import TripStay
        assert db.query(TripStay).filter(TripStay.trip_id == tid).count() == 0

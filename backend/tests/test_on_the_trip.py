"""
On the trip (docs/friends-chat-plan.md, step 8): "I'm here" snapped to the day's plan,
"running late", and live location (members only, trip days only, deleted on Stop,
expiry or leaving).
"""

from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import select

from app.models.models import Destination, LiveLocation, Message, Place
from tests.conftest import _ApiTestSession
from tests.test_trip_rooms import API, _befriend, _invite, _join, _messages, _user, act_as, client  # noqa: F401 (fixtures)

TODAY = date.today()


def _trip_today(client, owner, act_as, starts: int = 0) -> dict:
    """A planned two-day trip that started today (or starts `starts` days from today)."""
    act_as(owner)
    start = TODAY + timedelta(days=starts)
    r = client.post(f"{API}/trips", json={
        "destination": "Cox's Bazar", "start_date": str(start), "end_date": str(start + timedelta(days=1)),
        "num_travelers": 2, "total_budget": 30000,
        "preference": {"interests": ["Beach", "Nature"], "travel_style": "Balanced", "preferred_start_time": "09:00", "preferred_end_time": "20:00"},
        "constraints": {"max_activities_per_day": 3, "must_visit": [], "excluded_places": [], "max_daily_budget": 0},
    })
    assert r.status_code == 201, r.text
    trip = r.json()
    assert client.post(f"{API}/trips/{trip['id']}/generate").status_code == 200
    return trip


def _room_today(client, act_as, starts: int = 0):
    ana, bob = _user("ana"), _user("bob")
    _befriend((ana, bob))
    trip = _trip_today(client, ana, act_as, starts)
    _invite(client, ana, act_as, trip, bob)
    room = _join(client, bob, act_as, trip)
    return ana, bob, trip, room


def _first_stop(client, owner, act_as, trip) -> tuple[dict, Place]:
    act_as(owner)
    day = client.get(f"{API}/trips/{trip['id']}/itinerary").json()["days"][0]
    item = next(i for i in sorted(day["items"], key=lambda i: i["order_index"]) if i["item_type"] == "activity")
    with _ApiTestSession() as db:
        return item, db.get(Place, item["place_id"])


def _card(client, who, act_as, room, kind, payload) -> tuple[int, dict]:
    act_as(who)
    r = client.post(f"{API}/conversations/{room}/messages", json={"client_id": str(uuid.uuid4()), "kind": kind, "payload": payload})
    return r.status_code, r.json()


def _plus(hhmm: str, minutes: int) -> str:
    h, m = map(int, hhmm.split(":"))
    total = h * 60 + m + minutes
    return f"{total // 60:02d}:{total % 60:02d}"


class TestCheckIn:
    def test_snaps_to_the_nearest_stop_within_300_m_and_says_how_late(self, client, act_as):
        ana, bob, trip, room = _room_today(client, act_as)
        item, place = _first_stop(client, ana, act_as, trip)
        # About 110 m north of the stop, ten minutes after it was planned
        status, card = _card(client, bob, act_as, room, "checkin", {
            "lat": place.latitude + 0.001, "lon": place.longitude, "date": str(TODAY), "time": _plus(item["start_time"], 10),
        })
        assert status == 201, card
        assert card["payload"] == {
            "day": 1, "time": _plus(item["start_time"], 10), "stop": place.name, "place_id": place.id, "planned": item["start_time"], "late_by": 10,
        }
        # The reading itself is never kept, nor shown to anyone
        with _ApiTestSession() as db:
            stored = db.get(Message, card["id"]).payload
        assert "lat" not in stored and "lon" not in stored
        assert "lat" not in _messages(client, ana, act_as, room)[-1]["payload"]

    def test_further_away_it_says_near_the_destination_and_far_away_nothing(self, client, act_as):
        ana, bob, trip, room = _room_today(client, act_as)
        with _ApiTestSession() as db:
            cox = db.scalar(select(Destination).where(Destination.name == "Cox's Bazar"))
        # 2 km off the town centre is no stop, but near Cox's Bazar
        _, near = _card(client, bob, act_as, room, "checkin", {"lat": cox.latitude + 0.02, "lon": cox.longitude + 0.01, "date": str(TODAY), "time": "10:00"})
        assert near["payload"] == {"day": 1, "time": "10:00", "near": "Cox's Bazar"}
        # Dhaka is 300 km away: no place named
        _, far = _card(client, bob, act_as, room, "checkin", {"lat": 23.81, "lon": 90.41, "date": str(TODAY), "time": "10:00"})
        assert far["payload"] == {"day": 1, "time": "10:00", "near": None}

    def test_only_in_a_trip_room_on_the_trips_days(self, client, act_as):
        ana, bob, trip, room = _room_today(client, act_as)
        status, out = _card(client, bob, act_as, room, "checkin", {"lat": 21.4, "lon": 92.0, "date": str(TODAY + timedelta(days=5)), "time": "10:00"})
        assert status == 422, out
        act_as(bob)
        direct = client.post(f"{API}/conversations/direct", json={"user_id": str(ana.id)}).json()["id"]
        status, _ = _card(client, bob, act_as, direct, "checkin", {"lat": 21.4, "lon": 92.0, "date": str(TODAY), "time": "10:00"})
        assert status == 422
        status, _ = _card(client, _user("stranger"), act_as, room, "checkin", {"lat": 21.4, "lon": 92.0, "date": str(TODAY), "time": "10:00"})
        assert status == 404


class TestRunningLate:
    def test_says_by_how_much_and_for_which_stop_and_where_it_came_from(self, client, act_as):
        ana, bob, trip, room = _room_today(client, act_as)
        item, place = _first_stop(client, ana, act_as, trip)
        status, card = _card(client, ana, act_as, room, "late", {"minutes": 20, "source": "today", "date": str(TODAY), "time": _plus(item["start_time"], -30)})
        assert status == 201, card
        assert card["payload"] == {"day": 1, "time": _plus(item["start_time"], -30), "minutes": 20, "stop": place.name, "source": "today"}
        assert _messages(client, bob, act_as, room)[-1]["payload"]["minutes"] == 20
        status, _ = _card(client, ana, act_as, room, "late", {"minutes": 2, "date": str(TODAY), "time": "10:00"})
        assert status == 422  # at least 5 minutes


def _start(client, who, act_as, room, *, minutes=15, day=TODAY, lat=21.43, lon=92.0, client_id=None):
    act_as(who)
    until = (datetime.now(timezone.utc) + timedelta(minutes=minutes)).isoformat()
    return client.post(f"{API}/conversations/{room}/live", json={
        "client_id": client_id or str(uuid.uuid4()), "lat": lat, "lon": lon, "accuracy_m": 12, "date": str(day), "until": until,
    })


class TestLiveLocation:
    def test_members_see_the_latest_point_and_stop_deletes_it(self, client, act_as):
        ana, bob, trip, room = _room_today(client, act_as)
        r = _start(client, bob, act_as, room)
        assert r.status_code == 201, r.text
        card = r.json()
        assert card["kind"] == "live" and card["payload"]["active"] is True and card["payload"]["lat"] == 21.43
        seen = next(m for m in _messages(client, ana, act_as, room) if m["id"] == card["id"])
        assert seen["payload"]["active"] is True and seen["payload"]["lon"] == 92.0

        act_as(bob)
        r = client.put(f"{API}/conversations/{room}/live", json={"lat": 21.44, "lon": 92.01, "date": str(TODAY)})
        assert r.status_code == 200 and r.json()["payload"]["lat"] == 21.44
        with _ApiTestSession() as db:
            assert len(db.scalars(select(LiveLocation)).all()) >= 1  # one row: no history

        assert client.delete(f"{API}/conversations/{room}/live").status_code == 204
        with _ApiTestSession() as db:
            assert db.get(LiveLocation, (room, bob.id)) is None
        ended = next(m for m in _messages(client, ana, act_as, room) if m["id"] == card["id"])["payload"]
        assert ended["active"] is False and "lat" not in ended
        act_as(bob)
        assert client.put(f"{API}/conversations/{room}/live", json={"lat": 21.44, "lon": 92.01, "date": str(TODAY)}).status_code == 404

    def test_members_only_trip_rooms_only_trip_days_only_up_to_a_day(self, client, act_as):
        ana, bob, trip, room = _room_today(client, act_as)
        assert _start(client, _user("stranger"), act_as, room).status_code == 404
        act_as(bob)
        direct = client.post(f"{API}/conversations/direct", json={"user_id": str(ana.id)}).json()["id"]
        assert _start(client, bob, act_as, direct).status_code == 422
        assert _start(client, bob, act_as, room, day=TODAY + timedelta(days=5)).status_code == 422
        assert _start(client, bob, act_as, room, minutes=25 * 60).status_code == 422
        assert _start(client, bob, act_as, room, minutes=-1).status_code == 422
        # A point from a day outside the trip is refused, and nothing is kept from it
        assert _start(client, bob, act_as, room).status_code == 201
        act_as(bob)
        r = client.put(f"{API}/conversations/{room}/live", json={"lat": 1, "lon": 1, "date": str(TODAY + timedelta(days=5))})
        assert r.status_code == 422
        with _ApiTestSession() as db:
            assert db.get(LiveLocation, (room, bob.id)).lat == 21.43

    def test_it_runs_out_and_is_deleted(self, client, act_as):
        ana, bob, trip, room = _room_today(client, act_as)
        card = _start(client, bob, act_as, room).json()
        with _ApiTestSession() as db:
            db.get(LiveLocation, (room, bob.id)).expires_at = datetime.utcnow() - timedelta(seconds=1)
            db.commit()
        ended = next(m for m in _messages(client, ana, act_as, room) if m["id"] == card["id"])["payload"]
        assert ended["active"] is False and "lat" not in ended
        with _ApiTestSession() as db:
            assert db.get(LiveLocation, (room, bob.id)) is None

    def test_leaving_the_room_deletes_it_and_sharing_again_ends_the_last_card(self, client, act_as):
        ana, bob, trip, room = _room_today(client, act_as)
        first = _start(client, bob, act_as, room).json()
        second = _start(client, bob, act_as, room).json()
        msgs = {m["id"]: m["payload"] for m in _messages(client, ana, act_as, room)}
        assert msgs[first["id"]]["active"] is False and msgs[second["id"]]["active"] is True
        act_as(bob)
        assert client.delete(f"{API}/trips/{trip['id']}/members/{bob.id}").status_code == 204
        with _ApiTestSession() as db:
            assert db.get(LiveLocation, (room, bob.id)) is None
        assert next(m for m in _messages(client, ana, act_as, room) if m["id"] == second["id"])["payload"]["active"] is False

    def test_not_before_the_trip_starts(self, client, act_as):
        """Today is a plausible date, but the trip starts tomorrow: no live location, no check-in."""
        ana, bob, trip, room = _room_today(client, act_as, starts=1)
        assert _start(client, bob, act_as, room).status_code == 422
        status, _ = _card(client, bob, act_as, room, "checkin", {"lat": 21.4, "lon": 92.0, "date": str(TODAY), "time": "10:00"})
        assert status == 422

    def test_a_retried_start_returns_the_first_card(self, client, act_as):
        """A retry (the same client_id) is the same share, as with messages; not a 500 (step 10)."""
        ana, bob, trip, room = _room_today(client, act_as)
        same = str(uuid.uuid4())
        first = _start(client, bob, act_as, room, client_id=same)
        assert first.status_code == 201, first.text
        again = _start(client, bob, act_as, room, client_id=same)
        assert again.status_code == 200 and again.json()["id"] == first.json()["id"]
        with _ApiTestSession() as db:
            assert len(db.scalars(select(LiveLocation).where(LiveLocation.conversation_id == room)).all()) == 1
        # A message's client_id can't start a share
        act_as(bob)
        used = str(uuid.uuid4())
        sent = client.post(f"{API}/conversations/{room}/messages", json={"client_id": used, "body": "On my way"})
        assert sent.status_code == 201
        assert _start(client, bob, act_as, room, client_id=used).status_code == 409

    def test_live_cards_cant_be_sent_as_messages(self, client, act_as):
        ana, bob, trip, room = _room_today(client, act_as)
        status, _ = _card(client, bob, act_as, room, "live", {"until": "2099-01-01T00:00:00Z"})
        assert status == 422

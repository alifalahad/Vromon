"""
On the road (docs/friends-chat-plan.md, step 6): friends on a trip today or leaving
within 14 days, and the setting that hides your trips from friends everywhere
(decisions C3 and C7).
"""

from __future__ import annotations

import uuid
from datetime import date, timedelta

import pytest
from fastapi import Depends
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.auth import get_current_user, new_friend_code
from app.db import get_db
from app.main import app
from app.models.models import Block, Trip, User
from app.services import friends as social
from tests.conftest import _ApiTestSession

API = "/api/v1"
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


def _user(name: str) -> User:
    with _ApiTestSession() as db:
        u = User(auth_subject=f"{name}-{uuid.uuid4()}", friend_code=new_friend_code(), username=f"{name}{uuid.uuid4().hex[:6]}", display_name=name.title())
        db.add(u)
        db.commit()
        db.refresh(u)
        return u


def _befriend(a: User, b: User) -> None:
    with _ApiTestSession() as db:
        social.befriend(db, a.id, b.id)
        db.commit()


def _trip(owner: User, destination: str, start: int, days: int) -> int:
    """A trip starting `start` days from today (negative: already started), `days` long."""
    with _ApiTestSession() as db:
        s = TODAY + timedelta(days=start)
        trip = Trip(user_id=owner.id, destination=destination, start_date=s, end_date=s + timedelta(days=days - 1), total_budget=10000)
        db.add(trip)
        db.commit()
        return trip.id


def _road(client, viewer: User, act_as) -> dict[str, dict]:
    act_as(viewer)
    r = client.get(f"{API}/me/friends/on-the-road", params={"today": TODAY.isoformat()})
    assert r.status_code == 200
    return {row["friend"]["id"]: row["trip"] for row in r.json()}


def _hide_trips(client, user: User, act_as, hide: bool = True) -> None:
    act_as(user)
    r = client.put(f"{API}/me/settings", json={"share_trips_with_friends": not hide})
    assert r.status_code == 200 and r.json()["share_trips_with_friends"] is (not hide)


class TestTheStrip:
    def test_on_a_trip_today_shows_day_n_of_m(self, client, act_as):
        me, rafi = _user("me"), _user("rafi")
        _befriend(me, rafi)
        trip_id = _trip(rafi, "Sylhet", start=-1, days=3)
        trip = _road(client, me, act_as)[str(rafi.id)]
        assert trip == {
            "trip_id": trip_id, "destination": "Sylhet",
            "start_date": (TODAY - timedelta(days=1)).isoformat(), "end_date": (TODAY + timedelta(days=1)).isoformat(),
            "day": 2, "days": 3, "starts_in": 0,
        }

    def test_a_trip_within_14_days_shows_when_it_starts(self, client, act_as):
        me, tanvir, mim, later = _user("me"), _user("tanvir"), _user("mim"), _user("later")
        for f in (tanvir, mim, later):
            _befriend(me, f)
        _trip(tanvir, "Bandarban", start=3, days=2)
        _trip(mim, "Cox's Bazar", start=14, days=4)
        _trip(later, "Khulna", start=15, days=2)
        road = _road(client, me, act_as)
        assert road[str(tanvir.id)]["day"] is None and road[str(tanvir.id)]["starts_in"] == 3
        assert road[str(mim.id)]["starts_in"] == 14
        assert str(later.id) not in road  # 15 days away

    def test_a_trip_that_ended_yesterday_is_gone_and_one_ending_today_stays(self, client, act_as):
        me, done, last = _user("me"), _user("done"), _user("last")
        _befriend(me, done)
        _befriend(me, last)
        _trip(done, "Rangpur", start=-3, days=3)
        _trip(last, "Barishal", start=-2, days=3)
        road = _road(client, me, act_as)
        assert str(done.id) not in road
        assert road[str(last.id)]["day"] == 3 and road[str(last.id)]["days"] == 3

    def test_the_trip_they_are_on_beats_their_next_one(self, client, act_as):
        me, rafi = _user("me"), _user("rafi")
        _befriend(me, rafi)
        _trip(rafi, "Bandarban", start=2, days=2)
        now = _trip(rafi, "Sylhet", start=0, days=2)
        assert _road(client, me, act_as)[str(rafi.id)]["trip_id"] == now

    def test_on_a_trip_first_then_by_when_they_leave(self, client, act_as):
        me, soon, now, sooner = _user("me"), _user("soon"), _user("now"), _user("sooner")
        for f in (soon, now, sooner):
            _befriend(me, f)
        _trip(soon, "A", start=9, days=1)
        _trip(now, "B", start=0, days=1)
        _trip(sooner, "C", start=2, days=1)
        act_as(me)
        order = [row["friend"]["id"] for row in client.get(f"{API}/me/friends/on-the-road", params={"today": TODAY.isoformat()}).json()]
        assert order == [str(now.id), str(sooner.id), str(soon.id)]

    def test_today_is_the_phones_date_within_a_day_of_the_servers(self, client, act_as):
        me, rafi = _user("me"), _user("rafi")
        _befriend(me, rafi)
        _trip(rafi, "Sylhet", start=1, days=2)
        act_as(me)
        tomorrow = client.get(f"{API}/me/friends/on-the-road", params={"today": (TODAY + timedelta(days=1)).isoformat()}).json()
        assert tomorrow[0]["trip"]["day"] == 1
        # A date far off isn't believed: the server's date is used
        far = client.get(f"{API}/me/friends/on-the-road", params={"today": (TODAY + timedelta(days=30)).isoformat()}).json()
        assert far[0]["trip"]["starts_in"] == 1

    def test_your_own_trips_are_not_in_your_strip(self, client, act_as):
        me = _user("me")
        _trip(me, "Sylhet", start=0, days=2)
        assert _road(client, me, act_as) == {}


class TestPrivacy:
    def test_strangers_ex_friends_and_blocked_people_get_nothing(self, client, act_as):
        me, stranger, ex, blocker = _user("me"), _user("stranger"), _user("ex"), _user("blocker")
        for f in (ex, blocker):
            _befriend(me, f)
        for f in (stranger, ex, blocker):
            _trip(f, "Sylhet", start=0, days=2)
        with _ApiTestSession() as db:
            social.unfriend(db, me.id, ex.id)
            # A block left behind alongside a friendship (blocking normally ends it): still nothing
            db.add(Block(blocker_id=blocker.id, blocked_id=me.id))
            db.commit()
        assert _road(client, me, act_as) == {}
        act_as(me)
        for other in (stranger, ex):
            assert client.get(f"{API}/users/{other.id}/trips").status_code == 404
            assert client.get(f"{API}/users/{other.id}/profile").status_code == 404

    def test_hiding_your_trips_hides_them_from_the_strip_the_profile_and_your_trip_list(self, client, act_as):
        me, rafi = _user("me"), _user("rafi")
        _befriend(me, rafi)
        _trip(rafi, "Sylhet", start=0, days=2)
        _trip(rafi, "Khulna", start=-60, days=3)
        act_as(me)
        assert client.get(f"{API}/users/{rafi.id}/profile").json()["shares_trips"] is True
        assert len(client.get(f"{API}/users/{rafi.id}/trips").json()) == 2

        _hide_trips(client, rafi, act_as)
        assert str(rafi.id) not in _road(client, me, act_as)
        act_as(me)
        assert client.get(f"{API}/users/{rafi.id}/profile").json()["shares_trips"] is False
        assert client.get(f"{API}/users/{rafi.id}/trips").json() == []
        stats = client.get(f"{API}/users/{rafi.id}/trips/stats", params={"today": TODAY.isoformat()}).json()
        assert stats["trips"] == 0

        # Rafi still sees his own
        act_as(rafi)
        assert len(client.get(f"{API}/users/{rafi.id}/trips").json()) == 2

        _hide_trips(client, rafi, act_as, hide=False)
        assert str(rafi.id) in _road(client, me, act_as)

    def test_a_hidden_trip_opens_only_for_a_friend_they_sent_it_to(self, client, act_as):
        """
        Trip ids count up, so a hidden trip mustn't open by its id (step 10). One they chose
        to send you in a chat does, until they unsend it.
        """
        me, rafi, nadia = _user("me"), _user("rafi"), _user("nadia")
        _befriend(me, rafi)
        _befriend(nadia, rafi)
        trip_id = _trip(rafi, "Sylhet", start=0, days=2)
        _hide_trips(client, rafi, act_as)
        act_as(me)
        for path in ("", "/itinerary", "/conditions", "/budget"):
            assert client.get(f"{API}/trips/{trip_id}{path}").status_code == 404, path
        assert client.post(f"{API}/trips/{trip_id}/copy").status_code == 404

        # Rafi sends it to me: it opens for me, and only for me
        act_as(rafi)
        chat_id = client.post(f"{API}/conversations/direct", json={"user_id": str(me.id)}).json()["id"]
        sent = client.post(
            f"{API}/conversations/{chat_id}/messages", json={"client_id": str(uuid.uuid4()), "kind": "trip", "payload": {"trip_id": trip_id}}
        )
        assert sent.status_code == 201, sent.text
        act_as(me)
        assert client.get(f"{API}/trips/{trip_id}").status_code == 200
        card = client.get(f"{API}/conversations/{chat_id}/messages").json()["messages"][-1]
        assert card["payload"]["trip_id"] == trip_id and card["payload"].get("available", True) is True
        act_as(nadia)
        assert client.get(f"{API}/trips/{trip_id}").status_code == 404

        # Unsent: hidden from me again
        act_as(rafi)
        assert client.delete(f"{API}/conversations/{chat_id}/messages/{sent.json()['id']}").status_code == 204
        act_as(me)
        assert client.get(f"{API}/trips/{trip_id}").status_code == 404

    def test_a_friend_cant_pass_on_a_hidden_trip(self, client, act_as):
        """Rafi sent me his hidden trip; Nadia is his friend too, but he didn't send it to her."""
        me, rafi, nadia = _user("me"), _user("rafi"), _user("nadia")
        _befriend(me, rafi)
        _befriend(nadia, rafi)
        _befriend(me, nadia)
        trip_id = _trip(rafi, "Sylhet", start=0, days=2)
        _hide_trips(client, rafi, act_as)
        act_as(rafi)
        to_me = client.post(f"{API}/conversations/direct", json={"user_id": str(me.id)}).json()["id"]
        card = {"kind": "trip", "payload": {"trip_id": trip_id}}
        assert client.post(f"{API}/conversations/{to_me}/messages", json={"client_id": str(uuid.uuid4()), **card}).status_code == 201
        act_as(me)
        to_nadia = client.post(f"{API}/conversations/direct", json={"user_id": str(nadia.id)}).json()["id"]
        r = client.post(f"{API}/conversations/{to_nadia}/messages", json={"client_id": str(uuid.uuid4()), **card})
        assert r.status_code == 403 and "hasn't shared it" in r.json()["detail"]

    def test_the_setting_is_on_by_default(self, client, act_as):
        me = _user("me")
        act_as(me)
        assert client.get(f"{API}/me/settings").json()["share_trips_with_friends"] is True

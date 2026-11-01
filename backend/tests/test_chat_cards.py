"""
Cards in chat (docs/friends-chat-plan.md, step 4): trip, place, trip idea and poll
cards; their payload checks and server-built snapshots; who may see a trip card,
checked again every time it's shown; votes; and copying a trip you can see.
"""

from __future__ import annotations

import uuid
from contextlib import contextmanager
from datetime import date, timedelta

import pytest
from fastapi import Depends
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.v1.endpoints import live as live_api
from app.core.auth import get_current_user, new_friend_code
from app.db import get_db
from app.main import app
from app.models.models import City, Country, Destination, Itinerary, ItineraryItem, Place, PollVote, Region, Trip, User
from app.services import friends as social
from tests.conftest import _ApiTestSession

API = "/api/v1"


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


@pytest.fixture(autouse=True)
def fake_token_check():
    """The live socket signs in with "<user id>" instead of a real token."""
    def check(db: Session, token):
        try:
            user = db.get(User, uuid.UUID(token))
        except (TypeError, ValueError):
            return None
        return (user, None) if user else None

    app.dependency_overrides[live_api.ws_authenticator] = lambda: check
    yield
    app.dependency_overrides.pop(live_api.ws_authenticator, None)


def _user(name: str) -> User:
    with _ApiTestSession() as db:
        u = User(auth_subject=f"{name}-{uuid.uuid4()}", friend_code=new_friend_code(), username=f"{name}{uuid.uuid4().hex[:6]}", display_name=name.title())
        db.add(u)
        db.commit()
        db.refresh(u)
        return u


def _friends(a: User, b: User) -> None:
    with _ApiTestSession() as db:
        social.befriend(db, a.id, b.id)
        db.commit()


def _unfriend(a: User, b: User) -> None:
    with _ApiTestSession() as db:
        social.unfriend(db, a.id, b.id)
        db.commit()


def _pair(prefix: str) -> tuple[User, User]:
    a, b = _user(f"{prefix}a"), _user(f"{prefix}b")
    _friends(a, b)
    return a, b


def _chat(client, act_as, me: User, other: User) -> int:
    act_as(me)
    r = client.post(f"{API}/conversations/direct", json={"user_id": str(other.id)})
    assert r.status_code == 200, r.text
    return r.json()["id"]


def _card(client, conversation_id: int, kind: str, payload: dict, client_id: uuid.UUID | None = None):
    return client.post(
        f"{API}/conversations/{conversation_id}/messages",
        json={"client_id": str(client_id or uuid.uuid4()), "kind": kind, "payload": payload},
    )


def _messages(client, conversation_id: int) -> list[dict]:
    r = client.get(f"{API}/conversations/{conversation_id}/messages")
    assert r.status_code == 200, r.text
    return r.json()["messages"]


def _vote(client, conversation_id: int, message_id: int, option_ids: list[int]):
    return client.put(f"{API}/conversations/{conversation_id}/messages/{message_id}/vote", json={"option_ids": option_ids})


def _place(destination: str = "Cox's Bazar") -> Place:
    with _ApiTestSession() as db:
        return db.scalars(select(Place).where(Place.destination_name == destination, Place.is_active.is_(True))).first()


def _destination(name: str = "Cox's Bazar") -> Destination:
    with _ApiTestSession() as db:
        return db.scalar(select(Destination).where(Destination.name == name))


def _trip(client, act_as, owner: User, *, start: date | None = None, busy: bool = False) -> dict:
    """A trip of the owner's: Cox's Bazar for two days, with a must-see (and a busy time)."""
    act_as(owner)
    start = start or date.today() + timedelta(days=30)
    constraints: dict = {"must_sees": [{"place_id": _place().id}]}
    if busy:
        constraints["busy"] = [{"day": 1, "start": "10:00", "end": "11:00", "label": "Doctor"}]
    r = client.post(f"{API}/trips", json={
        "destination": "Cox's Bazar", "start_date": str(start), "end_date": str(start + timedelta(days=1)),
        "num_travelers": 2, "total_budget": 40000, "preference": {"interests": ["Beach"]}, "constraints": constraints,
    })
    assert r.status_code == 201, r.text
    return r.json()


def _plan(trip_id: int, activities: int) -> None:
    """A made-up plan with this many activities (and a meal, which isn't a stop)."""
    place = _place()
    with _ApiTestSession() as db:
        day = Itinerary(trip_id=trip_id, day_number=1)
        db.add(day)
        db.flush()
        for i in range(activities):
            db.add(ItineraryItem(itinerary_id=day.id, item_type="activity", place_id=place.id, title=place.name,
                                 start_time=f"{9 + i:02d}:00", end_time=f"{9 + i:02d}:30"))
        db.add(ItineraryItem(itinerary_id=day.id, item_type="meal", title="Lunch", start_time="13:00", end_time="14:00"))
        db.commit()


@pytest.fixture
def geo():
    """A made-up country, division and city (the test database has no map data)."""
    with _ApiTestSession() as db:
        # One at a time: PostgreSQL checks each row's country and division (TEST_API_POSTGRES_URL)
        db.add(Country(iso2="ZZ", name="Testland", name_bn="টেস্টল্যান্ড", label_lat=23.0, label_lon=90.0))
        db.flush()
        db.add(Region(code="ZZ-1", country_iso2="ZZ", name="Northdiv", name_bn="উত্তর", lat=24.0, lon=91.0))
        db.flush()
        db.add(City(geonameid=999_999_001, country_iso2="ZZ", region_code="ZZ-1", name="Hilltown", lat=24.1, lon=91.1, population=20000))
        db.commit()
    yield
    with _ApiTestSession() as db:
        for row in (db.get(City, 999_999_001), db.get(Region, "ZZ-1"), db.get(Country, "ZZ")):
            if row is not None:
                db.delete(row)
                db.commit()


POLL = {"question": "Which weekend?", "options": ["3–5 Dec", "10–12 Dec"]}


# ---------------------------------------------------------------------------
# What a card may contain
# ---------------------------------------------------------------------------

class TestPayloads:
    @pytest.mark.parametrize(
        "body",
        [
            {"kind": "text", "body": "Hi", "payload": {"trip_id": 1}},              # text with a card
            {"kind": "poll", "body": "Hi", "payload": POLL},                         # a card with text
            {"kind": "poll"},                                                        # a card without its payload
            {"kind": "photo", "payload": {}},                                        # not a card (yet)
            {"kind": "trip", "payload": {"trip_id": 1, "title": "Free trip!"}},      # the snapshot is the server's
            {"kind": "trip", "payload": {"trip_id": 0}},
            {"kind": "place", "payload": {"type": "museum", "ref": "1"}},
            {"kind": "place", "payload": {"type": "attraction", "ref": ""}},
            {"kind": "poll", "payload": {"question": "Where?", "options": ["Only one"]}},
            {"kind": "poll", "payload": {"question": "Where?", "options": [str(i) for i in range(7)]}},
            {"kind": "poll", "payload": {"question": "Where?", "options": ["Sylhet", " sylhet "]}},
            {"kind": "poll", "payload": {"question": "   ", "options": ["A", "B"]}},
            {"kind": "poll", "payload": {"question": "Q", "options": ["A", "x" * 81]}},
            {"kind": "poll", "payload": {"question": "Q" * 201, "options": ["A", "B"]}},
            {"kind": "idea", "payload": {"destination_id": 1, "month": "December"}},
            {"kind": "idea", "payload": {"destination_id": 1, "part": "early"}},      # early in which month?
            {"kind": "idea", "payload": {"destination_id": 1, "days": 0}},
            {"kind": "idea", "payload": {"destination_id": 1, "note": "n" * 121}},
        ],
    )
    def test_bad_cards_are_refused_and_nothing_is_saved(self, client, act_as, body):
        a, b = _pair("pay")
        cid = _chat(client, act_as, a, b)
        r = client.post(f"{API}/conversations/{cid}/messages", json={"client_id": str(uuid.uuid4()), **body})
        assert r.status_code == 422, r.text
        assert _messages(client, cid) == []

    def test_a_poll_is_tidied_and_numbered(self, client, act_as):
        a, b = _pair("poll")
        cid = _chat(client, act_as, a, b)
        r = _card(client, cid, "poll", {"question": "  Which\r\nweekend? ", "options": ["  3–5   Dec ", "চা বাগান"], "multiple": True})
        assert r.status_code == 201, r.text
        m = r.json()
        assert m["kind"] == "poll" and m["body"] is None
        assert m["payload"] == {
            "question": "Which\nweekend?",
            "options": [{"id": 1, "text": "3–5 Dec"}, {"id": 2, "text": "চা বাগান"}],
            "multiple": True,
        }
        assert m["votes"] == {}

    def test_an_idea_keeps_the_destination_from_the_catalogue(self, client, act_as):
        a, b = _pair("idea")
        cid = _chat(client, act_as, a, b)
        dest = _destination()
        month = (date.today() + timedelta(days=40)).strftime("%Y-%m")
        r = _card(client, cid, "idea", {"destination_id": dest.id, "month": month, "part": "early", "days": 3, "note": " tea gardens "})
        assert r.status_code == 201, r.text
        p = r.json()["payload"]
        assert p["destination_id"] == dest.id and p["destination"] == "Cox's Bazar"
        assert (p["month"], p["part"], p["days"], p["note"]) == (month, "early", 3, "tea gardens")
        assert r.json()["votes"] == {}

    def test_an_idea_for_a_month_gone_by_or_nowhere_is_refused(self, client, act_as):
        a, b = _pair("ideax")
        cid = _chat(client, act_as, a, b)
        assert _card(client, cid, "idea", {"destination_id": _destination().id, "month": "2020-01"}).status_code == 422
        assert _card(client, cid, "idea", {"destination_id": 999_999}).status_code == 404

    def test_place_cards_come_from_the_catalogue_and_the_map(self, client, act_as, geo):
        a, b = _pair("plc")
        cid = _chat(client, act_as, a, b)
        place, dest = _place(), _destination()
        attraction = _card(client, cid, "place", {"type": "attraction", "ref": str(place.id)}).json()["payload"]
        assert attraction["name"] == place.name and attraction["category"] == place.category
        assert attraction["destination"] == "Cox's Bazar" and attraction["destination_id"] == dest.id
        assert attraction["hours"] == place.average_visit_duration
        destination = _card(client, cid, "place", {"type": "destination", "ref": str(dest.id)}).json()["payload"]
        assert destination["name"] == "Cox's Bazar" and destination["places"] > 0
        region = _card(client, cid, "place", {"type": "region", "ref": "ZZ-1"}).json()["payload"]
        assert region == {"type": "region", "code": "ZZ-1", "name": "Northdiv", "name_bn": "উত্তর", "country": "ZZ",
                          "region": "ZZ-1", "lat": 24.0, "lon": 91.0}
        city = _card(client, cid, "place", {"type": "city", "ref": "999999001"}).json()["payload"]
        assert city["name"] == "Hilltown" and city["region"] == "ZZ-1"
        country = _card(client, cid, "place", {"type": "country", "ref": "zz"}).json()["payload"]
        assert country["code"] == "ZZ" and country["name_bn"] == "টেস্টল্যান্ড"
        for missing in ({"type": "attraction", "ref": "999999"}, {"type": "region", "ref": "ZZ-9"}, {"type": "city", "ref": "abc"}):
            assert _card(client, cid, "place", missing).status_code == 404

    def test_sending_the_same_card_again_returns_the_first(self, client, act_as):
        a, b = _pair("again")
        cid = _chat(client, act_as, a, b)
        key = uuid.uuid4()
        first = _card(client, cid, "poll", POLL, key)
        again = _card(client, cid, "poll", POLL, key)
        assert (first.status_code, again.status_code) == (201, 200)
        assert again.json()["id"] == first.json()["id"]
        assert len(_messages(client, cid)) == 1


# ---------------------------------------------------------------------------
# Trip cards: only for trips everyone in the chat can see
# ---------------------------------------------------------------------------

class TestTripCards:
    def test_your_own_trip_with_its_plan_at_the_time(self, client, act_as):
        a, b = _pair("trip")
        trip = _trip(client, act_as, a)
        _plan(trip["id"], 3)
        cid = _chat(client, act_as, a, b)
        r = _card(client, cid, "trip", {"trip_id": trip["id"]})
        assert r.status_code == 201, r.text
        p = r.json()["payload"]
        assert p["trip_id"] == trip["id"] and p["owner_id"] == str(a.id) and p["owner_name"] == a.display_name
        assert (p["title"], p["destination"], p["days"], p["travelers"], p["stops"]) == ("Cox's Bazar Trip", "Cox's Bazar", 2, 2, 3)
        assert p["start_date"] == trip["start_date"] and p["end_date"] == trip["end_date"]
        act_as(b)
        assert _messages(client, cid)[0]["payload"] == p  # the friend sees the same card

    def test_a_friends_trip_only_to_someone_who_can_see_it(self, client, act_as):
        a, b = _pair("fwd")
        carol = _user("fwdcarol")
        _friends(a, carol)
        trip = _trip(client, act_as, carol)
        cid = _chat(client, act_as, a, b)
        r = _card(client, cid, "trip", {"trip_id": trip["id"]})
        assert r.status_code == 403  # b isn't Carol's friend
        assert "can't see this trip" in r.json()["detail"]
        _friends(b, carol)
        act_as(a)
        assert _card(client, cid, "trip", {"trip_id": trip["id"]}).status_code == 201
        act_as(b)
        assert _messages(client, cid)[0]["payload"]["owner_name"] == carol.display_name

    def test_a_trip_you_cant_see_is_as_if_it_didnt_exist(self, client, act_as):
        a, b = _pair("hid")
        stranger = _user("hidstranger")
        trip = _trip(client, act_as, stranger)
        cid = _chat(client, act_as, a, b)
        assert _card(client, cid, "trip", {"trip_id": trip["id"]}).status_code == 404
        assert _card(client, cid, "trip", {"trip_id": 999_999}).status_code == 404

    def test_unfriending_the_owner_hides_the_card_everywhere(self, client, act_as):
        a, b = _pair("gone")
        trip = _trip(client, act_as, a)
        cid = _chat(client, act_as, a, b)
        assert _card(client, cid, "trip", {"trip_id": trip["id"]}).status_code == 201
        _unfriend(a, b)
        act_as(b)
        card = _messages(client, cid)[0]
        assert card["kind"] == "trip" and card["payload"] == {"available": False}  # no title, dates or owner
        listed = next(c for c in client.get(f"{API}/conversations").json() if c["id"] == cid)
        assert listed["last_message"]["payload"] == {"available": False}
        act_as(a)
        assert _messages(client, cid)[0]["payload"]["trip_id"] == trip["id"]  # the owner still sees it

    def test_a_deleted_trip_is_no_longer_available_to_anyone(self, client, act_as):
        a, b = _pair("del")
        trip = _trip(client, act_as, a)
        cid = _chat(client, act_as, a, b)
        _card(client, cid, "trip", {"trip_id": trip["id"]})
        act_as(a)
        assert client.delete(f"{API}/trips/{trip['id']}").status_code in (200, 204)
        for who in (a, b):
            act_as(who)
            assert _messages(client, cid)[0]["payload"] == {"available": False}

    def test_a_place_taken_out_of_the_catalogue_is_no_longer_available(self, client, act_as):
        a, b = _pair("off")
        cid = _chat(client, act_as, a, b)
        with _ApiTestSession() as db:
            dest = db.scalar(select(Destination).where(Destination.name == "Cox's Bazar"))
            place = Place(name="Pop-up stall", destination_id=dest.id, destination_name=dest.name, category="Food",
                          latitude=21.4, longitude=92.0)
            db.add(place)
            db.commit()
            place_id = place.id
        assert _card(client, cid, "place", {"type": "attraction", "ref": str(place_id)}).status_code == 201
        with _ApiTestSession() as db:
            db.get(Place, place_id).is_active = False
            db.commit()
        act_as(b)
        assert _messages(client, cid)[0]["payload"] == {"available": False}
        act_as(a)
        assert _card(client, cid, "place", {"type": "attraction", "ref": str(place_id)}).status_code == 404


# ---------------------------------------------------------------------------
# Votes
# ---------------------------------------------------------------------------

class TestVotes:
    def test_one_answer_each_replaced_or_taken_back(self, client, act_as):
        a, b = _pair("vote")
        cid = _chat(client, act_as, a, b)
        poll = _card(client, cid, "poll", POLL).json()
        act_as(b)
        assert _vote(client, cid, poll["id"], [1]).json()["votes"] == {"1": [str(b.id)]}
        assert _vote(client, cid, poll["id"], [2]).json()["votes"] == {"2": [str(b.id)]}
        act_as(a)
        assert _vote(client, cid, poll["id"], [2]).json()["votes"] == {"2": [str(b.id), str(a.id)]}
        assert _vote(client, cid, poll["id"], [1, 2]).status_code == 422  # one answer only
        assert _vote(client, cid, poll["id"], [9]).status_code == 422
        assert _vote(client, cid, poll["id"], []).json()["votes"] == {"2": [str(b.id)]}
        assert _messages(client, cid)[0]["votes"] == {"2": [str(b.id)]}

    def test_several_answers_when_the_poll_allows_it(self, client, act_as):
        a, b = _pair("multi")
        cid = _chat(client, act_as, a, b)
        poll = _card(client, cid, "poll", {**POLL, "options": ["A", "B", "C"], "multiple": True}).json()
        act_as(b)
        assert _vote(client, cid, poll["id"], [1, 3]).json()["votes"] == {"1": [str(b.id)], "3": [str(b.id)]}

    def test_a_trip_idea_takes_in_maybe_or_cant(self, client, act_as):
        a, b = _pair("ans")
        cid = _chat(client, act_as, a, b)
        idea = _card(client, cid, "idea", {"destination_id": _destination().id}).json()
        act_as(b)
        assert _vote(client, cid, idea["id"], [1]).json()["votes"] == {"1": [str(b.id)]}  # I'm in
        assert _vote(client, cid, idea["id"], [3]).json()["votes"] == {"3": [str(b.id)]}  # can't
        assert _vote(client, cid, idea["id"], [4]).status_code == 422
        assert _vote(client, cid, idea["id"], [1, 2]).status_code == 422

    def test_only_polls_and_ideas_in_a_chat_you_can_write_in(self, client, act_as):
        a, b = _pair("vrule")
        stranger = _user("vrulestranger")
        cid = _chat(client, act_as, a, b)
        text = client.post(f"{API}/conversations/{cid}/messages", json={"client_id": str(uuid.uuid4()), "body": "Hi"}).json()
        poll = _card(client, cid, "poll", POLL).json()
        assert _vote(client, cid, text["id"], [1]).status_code == 422
        assert _vote(client, cid, 999_999, [1]).status_code == 404
        act_as(stranger)
        assert _vote(client, cid, poll["id"], [1]).status_code == 404
        _unfriend(a, b)
        act_as(b)
        assert _vote(client, cid, poll["id"], [1]).status_code == 403  # read-only now

    def test_an_unsent_poll_keeps_no_answers(self, client, act_as):
        a, b = _pair("unsend")
        cid = _chat(client, act_as, a, b)
        poll = _card(client, cid, "poll", POLL).json()
        act_as(b)
        _vote(client, cid, poll["id"], [1])
        act_as(a)
        assert client.delete(f"{API}/conversations/{cid}/messages/{poll['id']}").status_code == 204
        m = _messages(client, cid)[0]
        assert m["deleted"] is True and m["payload"] is None and m["votes"] is None
        act_as(b)
        assert _vote(client, cid, poll["id"], [2]).status_code == 409
        with _ApiTestSession() as db:
            assert db.scalars(select(PollVote).where(PollVote.message_id == poll["id"])).all() == []

    def test_a_cleared_poll_cant_be_answered(self, client, act_as):
        a, b = _pair("clr")
        cid = _chat(client, act_as, a, b)
        poll = _card(client, cid, "poll", POLL).json()
        act_as(b)
        assert client.patch(f"{API}/conversations/{cid}/me", json={"cleared_up_to_id": poll["id"]}).status_code == 200
        assert _vote(client, cid, poll["id"], [1]).status_code == 404


# ---------------------------------------------------------------------------
# Live
# ---------------------------------------------------------------------------

@contextmanager
def _socket(client, user: User):
    with client.websocket_connect(f"{API}/ws") as ws:
        ws.send_json({"type": "auth", "token": str(user.id)})
        assert ws.receive_json()["type"] == "ready"
        yield ws


def _next(ws) -> dict:
    while True:
        event = ws.receive_json()
        if event != {"type": "ping"}:
            return event


class TestLive:
    def test_cards_and_answers_arrive_live(self, client, act_as):
        a, b = _pair("lv")
        cid = _chat(client, act_as, a, b)
        with _socket(client, a) as ws:
            act_as(b)
            poll = _card(client, cid, "poll", POLL).json()
            created = _next(ws)
            assert created["type"] == "message.created" and created["message"]["payload"]["question"] == "Which weekend?"
            assert created["message"]["votes"] == {}
            _vote(client, cid, poll["id"], [2])
            updated = _next(ws)
            assert updated["type"] == "message.updated" and updated["message"]["votes"] == {"2": [str(b.id)]}

    def test_a_trip_card_arrives_as_each_person_may_see_it(self, client, act_as):
        a, b = _pair("lvt")
        trip = _trip(client, act_as, a)
        cid = _chat(client, act_as, a, b)
        with _socket(client, b) as ws:
            act_as(a)
            _card(client, cid, "trip", {"trip_id": trip["id"]})
            assert _next(ws)["message"]["payload"]["trip_id"] == trip["id"]


# ---------------------------------------------------------------------------
# Copy to my trips
# ---------------------------------------------------------------------------

class TestCopy:
    def test_a_friend_copies_your_trip_as_their_own_draft(self, client, act_as):
        a, b = _pair("copy")
        trip = _trip(client, act_as, a, busy=True)
        _plan(trip["id"], 2)
        act_as(b)
        r = client.post(f"{API}/trips/{trip['id']}/copy")
        assert r.status_code == 201, r.text
        copy = r.json()
        assert copy["id"] != trip["id"] and copy["status"] == "draft"
        assert (copy["destination"], copy["start_date"], copy["end_date"], copy["title"]) == (
            "Cox's Bazar", trip["start_date"], trip["end_date"], "Cox's Bazar Trip")
        assert [m["place_id"] for m in copy["constraints"]["must_sees"]] == [_place().id]
        assert copy["constraints"]["busy"] == []  # the friend's own schedule stays theirs
        assert copy["preference"]["interests"] == ["Beach"]
        with _ApiTestSession() as db:
            stored = db.get(Trip, copy["id"])
            assert stored.user_id == b.id and stored.itinerary_days == []  # no plan: they build their own
        assert client.get(f"{API}/trips/{copy['id']}").status_code == 200

    def test_your_own_copy_keeps_your_busy_times(self, client, act_as):
        a = _user("owncopy")
        trip = _trip(client, act_as, a, busy=True)
        copy = client.post(f"{API}/trips/{trip['id']}/copy").json()
        assert copy["title"] == "Cox's Bazar Trip (Copy)" and len(copy["constraints"]["busy"]) == 1

    def test_a_copy_of_a_trip_already_over_doesnt_ask_if_you_went(self, client, act_as):
        a, b = _pair("past")
        trip = _trip(client, act_as, a, start=date.today() - timedelta(days=20))
        act_as(b)
        copy = client.post(f"{API}/trips/{trip['id']}/copy").json()
        with _ApiTestSession() as db:
            assert db.get(Trip, copy["id"]).visited_prompt == "dismissed"

    def test_only_someone_who_can_see_the_trip_can_copy_it(self, client, act_as):
        a, b = _pair("nocopy")
        stranger = _user("nocopystranger")
        trip = _trip(client, act_as, a)
        act_as(stranger)
        assert client.post(f"{API}/trips/{trip['id']}/copy").status_code == 404
        act_as(a)
        assert client.post(f"{API}/blocks", json={"user_id": str(b.id)}).status_code == 204
        act_as(b)
        assert client.post(f"{API}/trips/{trip['id']}/copy").status_code == 404
        assert client.post(f"{API}/trips/999999/copy").status_code == 404

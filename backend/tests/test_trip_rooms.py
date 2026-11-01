"""
Trip rooms (docs/friends-chat-plan.md, step 7): invites, joining and leaving, what
members may read and do, suggestions the owner adds to a day, and the room's lines.
"""

from __future__ import annotations

import uuid
from datetime import date, timedelta

import pytest
from fastapi import Depends
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.auth import get_current_user, new_friend_code
from app.db import get_db
from app.main import app
from app.models.models import Block, Conversation, ItineraryItem, Place, TripMember, TripSuggestion, User
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


def _user(name: str) -> User:
    with _ApiTestSession() as db:
        u = User(auth_subject=f"{name}-{uuid.uuid4()}", friend_code=new_friend_code(), username=f"{name}{uuid.uuid4().hex[:6]}", display_name=name.title())
        db.add(u)
        db.commit()
        db.refresh(u)
        return u


def _befriend(*pairs: tuple[User, User]) -> None:
    with _ApiTestSession() as db:
        for a, b in pairs:
            social.befriend(db, a.id, b.id)
        db.commit()


def _unfriend(a: User, b: User) -> None:
    with _ApiTestSession() as db:
        social.unfriend(db, a.id, b.id)
        db.commit()


def _trip(client, owner: User, act_as, generate: bool = True) -> dict:
    act_as(owner)
    start = date.today() + timedelta(days=30)
    r = client.post(f"{API}/trips", json={
        "destination": "Cox's Bazar", "start_date": str(start), "end_date": str(start + timedelta(days=1)),
        "num_travelers": 2, "total_budget": 30000,
        "preference": {"interests": ["Beach", "Nature"], "travel_style": "Balanced", "preferred_start_time": "09:00", "preferred_end_time": "20:00"},
        "constraints": {"max_activities_per_day": 3, "must_visit": [], "excluded_places": [], "max_daily_budget": 0},
    })
    assert r.status_code == 201, r.text
    trip = r.json()
    if generate:
        assert client.post(f"{API}/trips/{trip['id']}/generate").status_code == 200
    return trip


def _invite(client, owner: User, act_as, trip: dict, *people: User, note: str | None = None):
    act_as(owner)
    return client.post(f"{API}/trips/{trip['id']}/members", json={"user_ids": [str(p.id) for p in people], "note": note})


def _join(client, person: User, act_as, trip: dict) -> int:
    act_as(person)
    r = client.post(f"{API}/trips/{trip['id']}/members/me/join")
    assert r.status_code == 200, r.text
    return r.json()["conversation_id"]


def _room(client, owner: User, act_as, *members: User) -> tuple[dict, int]:
    """A planned trip with these friends in its room."""
    _befriend(*[(owner, m) for m in members])
    trip = _trip(client, owner, act_as)
    assert _invite(client, owner, act_as, trip, *members).status_code == 200
    room = 0
    for m in members:
        room = _join(client, m, act_as, trip)
    return trip, room


def _messages(client, viewer: User, act_as, conversation_id: int) -> list[dict]:
    act_as(viewer)
    r = client.get(f"{API}/conversations/{conversation_id}/messages")
    assert r.status_code == 200, r.text
    return r.json()["messages"]


def _direct(client, viewer: User, act_as, other: User) -> int:
    act_as(viewer)
    return client.post(f"{API}/conversations/direct", json={"user_id": str(other.id)}).json()["id"]


def _suggest(client, member: User, act_as, room: int, place: Place | None = None) -> dict:
    with _ApiTestSession() as db:
        place = place or db.scalars(select(Place).where(Place.destination_name == "Cox's Bazar", Place.is_active.is_(True))).all()[-1]
    act_as(member)
    r = client.post(f"{API}/conversations/{room}/messages", json={
        "client_id": str(uuid.uuid4()), "kind": "place", "payload": {"type": "attraction", "ref": str(place.id)},
    })
    assert r.status_code == 201, r.text
    return r.json()


class TestInvites:
    def test_the_owner_invites_a_friend_with_a_card_in_their_chat_and_a_line_in_the_room(self, client, act_as):
        ana, bob = _user("ana"), _user("bob")
        _befriend((ana, bob))
        trip = _trip(client, ana, act_as, generate=False)
        r = _invite(client, ana, act_as, trip, bob, note=" Join\x00 us!\r\n")  # cleaned as a message is (step 10)
        assert r.status_code == 200, r.text
        out = r.json()
        assert [(m["user"]["id"], m["status"]) for m in out["members"]] == [(str(ana.id), "owner"), (str(bob.id), "invited")]
        room = out["conversation_id"]

        # Bob's chat with Ana: the invite card, then the note
        chat = _messages(client, bob, act_as, _direct(client, bob, act_as, ana))
        card, note = chat[-2], chat[-1]
        assert card["kind"] == "invite" and card["payload"]["trip_id"] == trip["id"]
        assert card["payload"]["room"] == {"status": "invited", "conversation_id": None}
        assert note["body"] == "Join us!"
        # Not in the room until he joins
        act_as(bob)
        assert client.get(f"{API}/conversations/{room}").status_code == 404
        # The room's first line
        line = _messages(client, ana, act_as, room)[-1]
        assert line["kind"] == "system" and line["payload"]["event"] == "invited"
        assert line["payload"]["actor"]["id"] == str(ana.id) and line["payload"]["targets"] == [{"id": str(bob.id), "name": "Bob"}]

    def test_only_the_owners_friends_and_only_by_the_owner(self, client, act_as):
        ana, bob, stranger = _user("ana"), _user("bob"), _user("stranger")
        _befriend((ana, bob))
        trip = _trip(client, ana, act_as, generate=False)
        assert _invite(client, ana, act_as, trip, bob, stranger).status_code == 403
        act_as(ana)
        assert client.get(f"{API}/trips/{trip['id']}/members").json()["members"] == [
            {"user": {"id": str(ana.id), "username": ana.username, "display_name": "Ana", "avatar_url": None}, "status": "owner"}
        ]
        # A friend can't invite people to Ana's trip; to them it isn't there
        assert _invite(client, bob, act_as, trip, ana).status_code == 404

    def test_inviting_again_changes_nothing(self, client, act_as):
        ana, bob = _user("ana"), _user("bob")
        _befriend((ana, bob))
        trip = _trip(client, ana, act_as, generate=False)
        _invite(client, ana, act_as, trip, bob)
        _invite(client, ana, act_as, trip, bob)
        chat = _messages(client, bob, act_as, _direct(client, bob, act_as, ana))
        assert [m["kind"] for m in chat].count("invite") == 1


class TestJoining:
    def test_joining_opens_the_room_with_the_trip_and_its_members(self, client, act_as):
        ana, bob = _user("ana"), _user("bob")
        trip, room = _room(client, ana, act_as, bob)
        act_as(bob)
        convo = client.get(f"{API}/conversations/{room}").json()
        assert convo["kind"] == "trip" and convo["trip_id"] == trip["id"] and convo["can_send"] is True
        assert convo["trip"]["destination"] == "Cox's Bazar" and convo["trip"]["owner_id"] == str(ana.id)
        assert convo["trip"]["stops"] > 0 and convo["trip"]["preview"][0]["day"] == 1
        assert [m["id"] for m in convo["members"]] == [str(ana.id), str(bob.id)]
        assert _messages(client, bob, act_as, room)[-1]["payload"]["event"] == "joined"
        # The invite card now opens the room
        card = next(m for m in _messages(client, bob, act_as, _direct(client, bob, act_as, ana)) if m["kind"] == "invite")
        assert card["payload"]["room"] == {"status": "joined", "conversation_id": room}
        # Joining again changes nothing
        assert _join(client, bob, act_as, trip) == room
        assert [m["payload"]["event"] for m in _messages(client, bob, act_as, room) if m["kind"] == "system"].count("joined") == 1
        # And it's in his trips "with friends"
        assert [t["id"] for t in client.get(f"{API}/me/trips/joined").json()] == [trip["id"]]

    def test_you_cant_join_without_an_invite_or_once_you_arent_friends_any_more(self, client, act_as):
        ana, bob, cara = _user("ana"), _user("bob"), _user("cara")
        _befriend((ana, bob), (ana, cara))
        trip = _trip(client, ana, act_as, generate=False)
        act_as(cara)
        assert client.post(f"{API}/trips/{trip['id']}/members/me/join").status_code == 404
        _invite(client, ana, act_as, trip, bob)
        _unfriend(ana, bob)
        act_as(bob)
        assert client.post(f"{API}/trips/{trip['id']}/members/me/join").status_code == 404


class TestPrivacy:
    def test_members_read_the_trip_and_its_plan_but_cant_change_it(self, client, act_as):
        ana, bob = _user("ana"), _user("bob")
        trip, _ = _room(client, ana, act_as, bob)
        _unfriend(ana, bob)  # membership, not friendship, lets him in now
        act_as(bob)
        assert client.get(f"{API}/trips/{trip['id']}").status_code == 200
        days = client.get(f"{API}/trips/{trip['id']}/itinerary").json()["days"]
        assert days
        assert client.patch(f"{API}/trips/{trip['id']}", json={"title": "Mine now"}).status_code == 404
        assert client.delete(f"{API}/trips/{trip['id']}").status_code == 404
        with _ApiTestSession() as db:
            place = db.scalars(select(Place).where(Place.destination_name == "Cox's Bazar")).first()
        assert client.post(f"{API}/trips/{trip['id']}/days/{days[0]['id']}/items", json={"place_id": place.id}).status_code == 404

    def test_strangers_get_404_and_ex_members_lose_everything(self, client, act_as):
        ana, bob, stranger = _user("ana"), _user("bob"), _user("stranger")
        trip, room = _room(client, ana, act_as, bob)
        act_as(stranger)
        for path in (f"/conversations/{room}", f"/conversations/{room}/messages", f"/trips/{trip['id']}", f"/trips/{trip['id']}/members"):
            assert client.get(f"{API}{path}").status_code == 404, path
        assert client.post(f"{API}/conversations/{room}/messages", json={"client_id": str(uuid.uuid4()), "body": "hi"}).status_code == 404

        _unfriend(ana, bob)
        act_as(bob)
        assert client.delete(f"{API}/trips/{trip['id']}/members/{bob.id}").status_code == 204
        for path in (f"/conversations/{room}", f"/conversations/{room}/messages", f"/trips/{trip['id']}", f"/trips/{trip['id']}/members"):
            assert client.get(f"{API}{path}").status_code == 404, path
        assert client.get(f"{API}/me/trips/joined").json() == []
        assert _messages(client, ana, act_as, room)[-1]["payload"]["event"] == "left"

    def test_the_owner_removes_a_member_and_members_cant_remove_each_other(self, client, act_as):
        ana, bob, cara = _user("ana"), _user("bob"), _user("cara")
        trip, room = _room(client, ana, act_as, bob, cara)
        act_as(bob)
        assert client.delete(f"{API}/trips/{trip['id']}/members/{cara.id}").status_code == 403
        act_as(ana)
        assert client.delete(f"{API}/trips/{trip['id']}/members/{ana.id}").status_code == 422
        assert client.delete(f"{API}/trips/{trip['id']}/members/{cara.id}").status_code == 204
        line = _messages(client, ana, act_as, room)[-1]["payload"]
        assert line["event"] == "removed" and line["target"]["id"] == str(cara.id) and line["actor"]["id"] == str(ana.id)
        act_as(cara)
        assert client.get(f"{API}/conversations/{room}").status_code == 404

    def test_members_who_arent_friends_see_each_others_names_and_a_blocked_persons_messages_are_hidden(self, client, act_as):
        ana, bob, cara = _user("ana"), _user("bob"), _user("cara")
        trip, room = _room(client, ana, act_as, bob, cara)
        act_as(bob)
        assert {m["display_name"] for m in client.get(f"{API}/conversations/{room}").json()["members"]} == {"Ana", "Bob", "Cara"}
        client.post(f"{API}/conversations/{room}/messages", json={"client_id": str(uuid.uuid4()), "body": "from bob"})
        assert any(m["body"] == "from bob" for m in _messages(client, cara, act_as, room))
        with _ApiTestSession() as db:
            db.add(Block(blocker_id=cara.id, blocked_id=bob.id))
            db.commit()
        assert not any(m["body"] == "from bob" for m in _messages(client, cara, act_as, room))
        assert any(m["body"] == "from bob" for m in _messages(client, ana, act_as, room))

    def test_deleting_the_trip_deletes_its_room(self, client, act_as):
        ana, bob = _user("ana"), _user("bob")
        trip, room = _room(client, ana, act_as, bob)
        act_as(ana)
        assert client.delete(f"{API}/trips/{trip['id']}").status_code == 204
        with _ApiTestSession() as db:
            assert db.get(Conversation, room) is None
            assert db.scalars(select(TripMember).where(TripMember.trip_id == trip["id"])).all() == []
        act_as(bob)
        assert client.get(f"{API}/conversations/{room}").status_code == 404

    def test_a_deleted_account_leaves_the_rooms_it_was_in_and_its_own_rooms_go(self, client, act_as):
        ana, bob = _user("ana"), _user("bob")
        trip, room = _room(client, ana, act_as, bob)
        card = _suggest(client, bob, act_as, room)
        act_as(ana)
        added = client.post(f"{API}/trips/{trip['id']}/suggestions/{card['id']}/accept", json={"day": 2})
        assert added.status_code == 200, added.text
        with _ApiTestSession() as db:
            item_id = db.get(TripSuggestion, card["id"]).item_id
        act_as(bob)
        assert client.delete(f"{API}/me").status_code == 204
        with _ApiTestSession() as db:
            # His suggestion's record goes with his message; the stop stays in Ana's plan
            assert db.get(TripSuggestion, card["id"]) is None
            assert db.get(ItineraryItem, item_id) is not None
        act_as(ana)
        assert [m["status"] for m in client.get(f"{API}/trips/{trip['id']}/members").json()["members"]] == ["owner"]
        assert client.delete(f"{API}/me").status_code == 204
        with _ApiTestSession() as db:
            assert db.get(Conversation, room) is None


class TestSuggestions:
    def test_the_owner_adds_a_members_suggestion_to_the_chosen_day(self, client, act_as):
        ana, bob = _user("ana"), _user("bob")
        trip, room = _room(client, ana, act_as, bob)
        card = _suggest(client, bob, act_as, room)
        assert card["payload"]["suggestion"] == {"status": "open", "day": None}

        # Bob can't add it himself (C1); a stranger can't even see it
        act_as(bob)
        assert client.post(f"{API}/trips/{trip['id']}/suggestions/{card['id']}/accept", json={"day": 2}).status_code == 403
        act_as(_user("stranger"))
        assert client.post(f"{API}/trips/{trip['id']}/suggestions/{card['id']}/accept", json={"day": 2}).status_code == 404

        act_as(ana)
        assert client.post(f"{API}/trips/{trip['id']}/suggestions/{card['id']}/accept", json={"day": 9}).status_code == 422
        r = client.post(f"{API}/trips/{trip['id']}/suggestions/{card['id']}/accept", json={"day": 2})
        assert r.status_code == 200, r.text
        assert r.json()["payload"]["suggestion"] == {"status": "added", "day": 2}
        days = client.get(f"{API}/trips/{trip['id']}/itinerary").json()["days"]
        assert card["payload"]["id"] in [i["place_id"] for i in days[1]["items"]]
        line = _messages(client, bob, act_as, room)[-1]["payload"]
        assert line == {"event": "added", "actor": {"id": str(ana.id), "name": "Ana"}, "place": card["payload"]["name"], "day": 2}
        # Bob sees it decided too, and it can't be added twice
        assert next(m for m in _messages(client, bob, act_as, room) if m["id"] == card["id"])["payload"]["suggestion"]["status"] == "added"
        act_as(ana)
        assert client.post(f"{API}/trips/{trip['id']}/suggestions/{card['id']}/accept", json={"day": 1}).status_code == 409

    def test_not_this_time_leaves_the_plan_as_it_was(self, client, act_as):
        ana, bob = _user("ana"), _user("bob")
        trip, room = _room(client, ana, act_as, bob)
        act_as(ana)
        before = client.get(f"{API}/trips/{trip['id']}/itinerary").json()
        card = _suggest(client, bob, act_as, room)
        act_as(bob)
        assert client.post(f"{API}/trips/{trip['id']}/suggestions/{card['id']}/decline").status_code == 403
        act_as(ana)
        r = client.post(f"{API}/trips/{trip['id']}/suggestions/{card['id']}/decline")
        assert r.status_code == 200 and r.json()["payload"]["suggestion"] == {"status": "declined", "day": None}
        assert client.get(f"{API}/trips/{trip['id']}/itinerary").json() == before

    def test_only_a_catalogue_place_in_this_rooms_chat_can_be_added(self, client, act_as):
        ana, bob = _user("ana"), _user("bob")
        trip, room = _room(client, ana, act_as, bob)
        act_as(bob)
        text = client.post(f"{API}/conversations/{room}/messages", json={"client_id": str(uuid.uuid4()), "body": "Himchari?"}).json()
        act_as(ana)
        assert client.post(f"{API}/trips/{trip['id']}/suggestions/{text['id']}/accept", json={"day": 1}).status_code == 422
        # A place card in a direct chat isn't a suggestion for the trip
        direct = _direct(client, bob, act_as, ana)
        with _ApiTestSession() as db:
            place = db.scalars(select(Place).where(Place.destination_name == "Cox's Bazar")).first()
        act_as(bob)
        elsewhere = client.post(f"{API}/conversations/{direct}/messages", json={
            "client_id": str(uuid.uuid4()), "kind": "place", "payload": {"type": "attraction", "ref": str(place.id)},
        }).json()
        assert "suggestion" not in elsewhere["payload"]
        act_as(ana)
        assert client.post(f"{API}/trips/{trip['id']}/suggestions/{elsewhere['id']}/accept", json={"day": 1}).status_code == 404

    def test_before_the_plan_is_built_the_owner_is_told_to_build_it(self, client, act_as):
        ana, bob = _user("ana"), _user("bob")
        _befriend((ana, bob))
        trip = _trip(client, ana, act_as, generate=False)
        _invite(client, ana, act_as, trip, bob)
        room = _join(client, bob, act_as, trip)
        card = _suggest(client, bob, act_as, room)
        act_as(ana)
        assert client.post(f"{API}/trips/{trip['id']}/suggestions/{card['id']}/accept", json={"day": 1}).status_code == 409

    def test_a_trip_card_of_the_rooms_trip_shows_to_every_member(self, client, act_as):
        ana, bob, cara = _user("ana"), _user("bob"), _user("cara")
        trip, room = _room(client, ana, act_as, bob, cara)
        _unfriend(ana, cara)  # not a friend of the owner any more, still in the room
        act_as(bob)
        r = client.post(f"{API}/conversations/{room}/messages", json={"client_id": str(uuid.uuid4()), "kind": "trip", "payload": {"trip_id": trip["id"]}})
        assert r.status_code == 201, r.text
        shown = next(m for m in _messages(client, cara, act_as, room) if m["id"] == r.json()["id"])
        assert shown["payload"]["trip_id"] == trip["id"]

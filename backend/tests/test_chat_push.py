"""
Push for chats and trip rooms (docs/friends-chat-plan.md, step 9): who gets one, what
it says (previews on or off, English or Bangla), mute, blocks, the settings, one
notification per chat, and what never sends one.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import pytest

from app.core.config import settings
from app.models.models import Block
from app.services import push as push_service
from tests.conftest import _ApiTestSession
from tests.test_on_the_trip import _room_today, _start
from tests.test_trip_rooms import API, _befriend, _messages, _room, _suggest, _user, act_as, client  # noqa: F401 (fixtures)


@pytest.fixture
def pushes(monkeypatch):
    sent: list[dict] = []
    monkeypatch.setattr(settings, "push_enabled", True)
    monkeypatch.setattr(push_service, "_send", lambda messages: sent.extend(messages) or [{"status": "ok"} for _ in messages])
    return sent


def _device(client, act_as, user) -> str:
    token = f"ExponentPushToken[{user.id.hex}]"
    act_as(user)
    assert client.post(f"{API}/me/devices", json={"expo_push_token": token, "platform": "android"}).status_code == 204
    return token


def _direct(client, act_as, a, b) -> int:
    act_as(a)
    return client.post(f"{API}/conversations/direct", json={"user_id": str(b.id)}).json()["id"]


def _say(client, act_as, who, cid, text="Shall we go on Friday?"):
    act_as(who)
    r = client.post(f"{API}/conversations/{cid}/messages", json={"client_id": str(uuid.uuid4()), "body": text})
    assert r.status_code == 201, r.text
    return r.json()


def _settings(client, act_as, who, **change):
    act_as(who)
    saved = client.get(f"{API}/me/settings").json()
    saved.pop("updated_at", None)
    assert client.put(f"{API}/me/settings", json={**saved, **change}).status_code == 200


class TestMessages:
    def test_the_other_person_gets_who_wrote_and_what_one_per_chat_never_the_sender(self, client, act_as, pushes):
        ana, bob = _user("ana"), _user("bob")
        _befriend((ana, bob))
        _device(client, act_as, ana)
        bob_token = _device(client, act_as, bob)
        cid = _direct(client, act_as, ana, bob)
        _say(client, act_as, ana, cid, "Shall   we go\\non Friday?")
        assert pushes == [{
            "to": bob_token, "title": "Ana", "body": "Shall we go\\non Friday?", "data": {"url": f"/chat/{cid}"},
            "channelId": "messages", "sound": "default", "tag": f"chat-{cid}", "collapseId": f"chat-{cid}",
        }]

    def test_previews_off_says_only_who_wrote(self, client, act_as, pushes):
        ana, bob = _user("ana"), _user("bob")
        _befriend((ana, bob))
        _device(client, act_as, bob)
        _settings(client, act_as, bob, notification_previews=False)
        cid = _direct(client, act_as, ana, bob)
        _say(client, act_as, ana, cid, "A secret plan")
        assert [(p["title"], p["body"]) for p in pushes] == [("Ana", "New message")]

    def test_in_bangla_for_someone_who_chose_bangla(self, client, act_as, pushes):
        ana, bob = _user("ana"), _user("bob")
        _befriend((ana, bob))
        _device(client, act_as, bob)
        _settings(client, act_as, bob, language="bn", notification_previews=False)
        cid = _direct(client, act_as, ana, bob)
        _say(client, act_as, ana, cid)
        assert pushes[0]["body"] == "নতুন মেসেজ"

    def test_messages_off_mute_and_blocks_send_nothing(self, client, act_as, pushes):
        ana, bob = _user("ana"), _user("bob")
        _befriend((ana, bob))
        _device(client, act_as, bob)
        cid = _direct(client, act_as, ana, bob)
        _settings(client, act_as, bob, notify_messages=False)
        _say(client, act_as, ana, cid)
        assert pushes == []
        _settings(client, act_as, bob, notify_messages=True)
        # Muted for an hour: nothing; once it's over: a notification again
        act_as(bob)
        until = (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()
        client.patch(f"{API}/conversations/{cid}/me", json={"muted_until": until})
        _say(client, act_as, ana, cid)
        assert pushes == []
        act_as(bob)
        client.patch(f"{API}/conversations/{cid}/me", json={"muted_until": (datetime.now(timezone.utc) - timedelta(minutes=1)).isoformat()})
        _say(client, act_as, ana, cid)
        assert len(pushes) == 1

    def test_reactions_answers_and_unsends_dont_notify(self, client, act_as, pushes):
        ana, bob = _user("ana"), _user("bob")
        _befriend((ana, bob))
        _device(client, act_as, ana)
        cid = _direct(client, act_as, ana, bob)
        message = _say(client, act_as, ana, cid)
        act_as(bob)
        client.put(f"{API}/conversations/{cid}/messages/{message['id']}/reaction", json={"reaction": "heart"})
        act_as(ana)
        client.delete(f"{API}/conversations/{cid}/messages/{message['id']}")
        assert pushes == []


class TestTripRooms:
    def test_room_messages_follow_the_trip_rooms_switch_and_name_the_room(self, client, act_as, pushes):
        ana, bob = _user("ana"), _user("bob")
        trip, room = _room(client, ana, act_as, bob)
        _device(client, act_as, bob)
        pushes.clear()
        _say(client, act_as, ana, room, "Bus at 7")
        assert [(p["title"], p["body"]) for p in pushes] == [("Ana · Cox's Bazar Trip", "Bus at 7")]
        _settings(client, act_as, bob, notify_trip_rooms=False)
        _say(client, act_as, ana, room, "Or 8?")
        assert len(pushes) == 1

    def test_a_suggestion_says_what_and_its_owner_tells_whoever_suggested_it(self, client, act_as, pushes):
        ana, bob = _user("ana"), _user("bob")
        trip, room = _room(client, ana, act_as, bob)
        _device(client, act_as, ana)
        _device(client, act_as, bob)
        pushes.clear()
        card = _suggest(client, bob, act_as, room)
        assert [(p["to"][-33:-1], p["body"]) for p in pushes] == [(ana.id.hex, f"Suggested {card['payload']['name']} for the plan")]
        pushes.clear()
        act_as(ana)
        assert client.post(f"{API}/trips/{trip['id']}/suggestions/{card['id']}/accept", json={"day": 2}).status_code == 200
        assert [(p["to"][-33:-1], p["title"], p["body"]) for p in pushes] == [(bob.id.hex, "Cox's Bazar Trip", f"Ana added {card['payload']['name']} to Day 2")]

    def test_an_invite_follows_the_trip_rooms_switch(self, client, act_as, pushes):
        ana, bob = _user("ana"), _user("bob")
        _befriend((ana, bob))
        _device(client, act_as, bob)
        from tests.test_trip_rooms import _invite, _trip
        trip = _trip(client, ana, act_as, generate=False)
        _invite(client, ana, act_as, trip, bob, note="Come!")
        assert [(p["title"], p["body"]) for p in pushes] == [("Ana", "Invited you to plan the Cox's Bazar trip together")]

    def test_a_blocked_members_messages_dont_notify_the_blocker(self, client, act_as, pushes):
        ana, bob, cara = _user("ana"), _user("bob"), _user("cara")
        trip, room = _room(client, ana, act_as, bob, cara)
        _device(client, act_as, cara)
        with _ApiTestSession() as db:
            db.add(Block(blocker_id=cara.id, blocked_id=bob.id))
            db.commit()
        pushes.clear()
        _say(client, act_as, bob, room)
        assert pushes == []

    def test_live_location_notifies_when_it_starts_not_for_each_point(self, client, act_as, pushes):
        ana, bob, trip, room = _room_today(client, act_as)
        _device(client, act_as, ana)
        pushes.clear()
        assert _start(client, bob, act_as, room).status_code == 201
        assert [p["body"] for p in pushes] == ["Is sharing their live location"]
        act_as(bob)
        client.put(f"{API}/conversations/{room}/live", json={"lat": 21.44, "lon": 92.01, "date": str(datetime.now().date())})
        assert len(pushes) == 1

"""
Chat between friends (docs/friends-chat-plan.md, step 1): conversations, text
messages, unsend, read state, and the privacy matrix (section 3.4).
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import pytest
from fastapi import Depends
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.auth import get_current_user, new_friend_code
from app.core.rate_limit import limiter
from app.db import get_db
from app.main import app
from app.models.models import Conversation, ConversationMember, Message, User
from app.services import chat
from app.services import friends as social
from tests.conftest import _ApiTestSession

API = "/api/v1"


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def act_as():
    """Switch the signed-in user for the next requests."""
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


def _friends(a: User, b: User) -> None:
    with _ApiTestSession() as db:
        social.befriend(db, a.id, b.id)
        db.commit()


def _pair(prefix: str) -> tuple[User, User]:
    a, b = _user(f"{prefix}a"), _user(f"{prefix}b")
    _friends(a, b)
    return a, b


def _open(client, act_as, me: User, other: User) -> dict:
    act_as(me)
    r = client.post(f"{API}/conversations/direct", json={"user_id": str(other.id)})
    assert r.status_code == 200, r.text
    return r.json()


def _send(client, conversation_id: int, text: str = "Hello", client_id: uuid.UUID | None = None):
    return client.post(f"{API}/conversations/{conversation_id}/messages", json={"client_id": str(client_id or uuid.uuid4()), "body": text})


def _messages(client, conversation_id: int, **params) -> dict:
    r = client.get(f"{API}/conversations/{conversation_id}/messages", params=params)
    assert r.status_code == 200, r.text
    return r.json()


# ---------------------------------------------------------------------------
# Opening a chat and sending
# ---------------------------------------------------------------------------

class TestOpeningAndSending:
    def test_two_friends_share_one_chat(self, client, act_as):
        a, b = _pair("one")
        mine = _open(client, act_as, a, b)
        theirs = _open(client, act_as, b, a)
        assert mine["id"] == theirs["id"]
        assert mine["kind"] == "direct" and mine["can_send"] is True and mine["read_only_reason"] is None
        assert mine["other"]["id"] == str(b.id) and theirs["other"]["id"] == str(a.id)
        with _ApiTestSession() as db:
            assert db.scalar(select(func.count()).select_from(Conversation).where(Conversation.direct_key == chat.direct_key(a.id, b.id))) == 1

    def test_a_message_reaches_the_friend_as_unread_until_read(self, client, act_as):
        a, b = _pair("unread")
        cid = _open(client, act_as, a, b)["id"]
        first = _send(client, cid, "Are you free in December?").json()
        _send(client, cid, "Sreemangal?")
        act_as(b)
        [listed] = client.get(f"{API}/conversations").json()
        assert listed["id"] == cid and listed["unread_count"] == 2
        assert listed["last_message"]["body"] == "Sreemangal?"
        page = _messages(client, cid)
        assert [m["body"] for m in page["messages"]] == ["Are you free in December?", "Sreemangal?"]
        assert page["messages"][0]["sender_id"] == str(a.id)
        assert page["messages"][0]["client_id"] is None  # only the sender sees their client id
        assert client.post(f"{API}/conversations/{cid}/read", json={"message_id": page["messages"][-1]["id"]}).status_code == 204
        assert client.get(f"{API}/conversations/{cid}").json()["unread_count"] == 0
        act_as(a)
        assert client.get(f"{API}/conversations/{cid}").json()["unread_count"] == 0  # your own messages are never unread
        assert first["client_id"] is not None

    def test_an_empty_chat_waits_for_a_message_before_it_is_listed(self, client, act_as):
        a, b = _pair("empty")
        cid = _open(client, act_as, a, b)["id"]
        assert client.get(f"{API}/conversations").json() == []
        act_as(b)
        assert client.get(f"{API}/conversations").json() == []
        act_as(a)
        _send(client, cid)
        assert [c["id"] for c in client.get(f"{API}/conversations").json()] == [cid]

    def test_chats_are_listed_newest_first(self, client, act_as):
        me, x, y = _user("order"), _user("orderx"), _user("ordery")
        _friends(me, x)
        _friends(me, y)
        with_x = _open(client, act_as, me, x)["id"]
        with_y = _open(client, act_as, me, y)["id"]
        _send(client, with_x)
        _send(client, with_y)
        assert [c["id"] for c in client.get(f"{API}/conversations").json()] == [with_y, with_x]
        _send(client, with_x)
        assert [c["id"] for c in client.get(f"{API}/conversations").json()] == [with_x, with_y]

    def test_a_retry_with_the_same_client_id_returns_the_first_message(self, client, act_as):
        a, b = _pair("retry")
        cid = _open(client, act_as, a, b)["id"]
        key = uuid.uuid4()
        first = _send(client, cid, "Once", client_id=key)
        again = _send(client, cid, "Once", client_id=key)
        assert first.status_code == 201 and again.status_code == 200
        assert first.json()["id"] == again.json()["id"]
        assert len(_messages(client, cid)["messages"]) == 1
        c = _user("retryc")
        _friends(a, c)
        other = _open(client, act_as, a, c)["id"]
        assert _send(client, other, "Once", client_id=key).status_code == 409

    def test_text_is_cleaned_and_limited_to_2000_characters(self, client, act_as):
        a, b = _pair("text")
        cid = _open(client, act_as, a, b)["id"]
        assert _send(client, cid, "   \n ").status_code == 422
        assert _send(client, cid, "x" * 2001).status_code == 422
        assert _send(client, cid, "x" * 2000).status_code == 201
        assert _send(client, cid, "  hi\r\nthere \x00 ").json()["body"] == "hi\nthere"
        assert _send(client, cid, "চলো এবার বান্দরবান যাই!").json()["body"] == "চলো এবার বান্দরবান যাই!"

    def test_times_carry_their_utc_offset(self, client, act_as):
        a, b = _pair("utc")
        cid = _open(client, act_as, a, b)["id"]
        sent = _send(client, cid).json()
        assert sent["created_at"].endswith("+00:00")
        assert abs(datetime.fromisoformat(sent["created_at"]) - datetime.now(timezone.utc)) < timedelta(minutes=1)


# ---------------------------------------------------------------------------
# Privacy matrix (plan, section 3.4)
# ---------------------------------------------------------------------------

class TestPrivacy:
    def test_only_friends_can_open_a_chat(self, client, act_as):
        me, stranger = _user("strangera"), _user("strangerb")
        act_as(me)
        for target in (stranger.id, me.id, uuid.uuid4()):
            assert client.post(f"{API}/conversations/direct", json={"user_id": str(target)}).status_code == 404

    def test_anyone_outside_the_chat_gets_404(self, client, act_as):
        a, b = _pair("outside")
        outsider = _user("outsidec")
        _friends(a, outsider)  # a friend of one member, still not in their chat
        cid = _open(client, act_as, a, b)["id"]
        mid = _send(client, cid).json()["id"]
        act_as(outsider)
        assert client.get(f"{API}/conversations/{cid}").status_code == 404
        assert client.get(f"{API}/conversations/{cid}/messages").status_code == 404
        assert _send(client, cid).status_code == 404
        assert client.post(f"{API}/conversations/{cid}/read", json={"message_id": mid}).status_code == 404
        assert client.patch(f"{API}/conversations/{cid}/me", json={"cleared_up_to_id": mid}).status_code == 404
        assert client.delete(f"{API}/conversations/{cid}/messages/{mid}").status_code == 404
        assert client.get(f"{API}/conversations").json() == []
        assert client.get(f"{API}/conversations/999999").status_code == 404

    def test_after_unfriending_the_chat_is_read_only_for_both(self, client, act_as):
        a, b = _pair("unfriend")
        cid = _open(client, act_as, a, b)["id"]
        mid = _send(client, cid, "Before").json()["id"]
        assert client.delete(f"{API}/friends/{b.id}").status_code == 204
        for me in (a, b):
            act_as(me)
            view = client.get(f"{API}/conversations/{cid}").json()
            assert view["can_send"] is False and view["read_only_reason"] == "not_friends"
            assert [m["body"] for m in _messages(client, cid)["messages"]] == ["Before"]
            assert _send(client, cid, "After").status_code == 403
            assert client.post(f"{API}/conversations/{cid}/read", json={"message_id": mid}).status_code == 204
        assert client.post(f"{API}/conversations/direct", json={"user_id": str(a.id)}).status_code == 404

    def test_blocking_hides_the_chat_from_the_blocker_and_doesnt_tell_the_other(self, client, act_as):
        a, b = _pair("block")
        cid = _open(client, act_as, a, b)["id"]
        _send(client, cid, "Hi")
        assert client.post(f"{API}/blocks", json={"user_id": str(b.id)}).status_code == 204
        assert client.get(f"{API}/conversations/{cid}").status_code == 404
        assert client.get(f"{API}/conversations/{cid}/messages").status_code == 404
        assert client.get(f"{API}/conversations").json() == []
        act_as(b)
        view = client.get(f"{API}/conversations/{cid}").json()
        assert view["can_send"] is False and view["read_only_reason"] == "not_friends"  # not "blocked"
        assert _send(client, cid, "Why?").status_code == 403
        act_as(a)
        assert client.delete(f"{API}/blocks/{b.id}").status_code == 204
        assert client.get(f"{API}/conversations/{cid}").json()["read_only_reason"] == "not_friends"  # unblocked, still not friends

    def test_a_deleted_account_leaves_a_read_only_chat_without_its_messages(self, client, act_as):
        a, b = _pair("gone")
        cid = _open(client, act_as, a, b)["id"]
        _send(client, cid, "From a")
        act_as(b)
        _send(client, cid, "From b")
        assert client.delete(f"{API}/me").status_code == 204
        act_as(a)
        view = client.get(f"{API}/conversations/{cid}").json()
        assert view["other"] is None and view["read_only_reason"] == "account_deleted" and view["can_send"] is False
        assert [m["body"] for m in _messages(client, cid)["messages"]] == ["From a"]
        assert _send(client, cid).status_code == 403
        assert client.delete(f"{API}/me").status_code == 204
        with _ApiTestSession() as db:
            assert db.get(Conversation, cid) is None  # nobody left in it
            assert db.scalar(select(func.count()).select_from(Message).where(Message.conversation_id == cid)) == 0


# ---------------------------------------------------------------------------
# Unsend (decision C2: within an hour)
# ---------------------------------------------------------------------------

class TestUnsend:
    def test_your_own_message_within_an_hour_becomes_message_removed(self, client, act_as):
        a, b = _pair("unsend")
        cid = _open(client, act_as, a, b)["id"]
        mid = _send(client, cid, "Oops").json()["id"]
        assert client.delete(f"{API}/conversations/{cid}/messages/{mid}").status_code == 204
        assert client.delete(f"{API}/conversations/{cid}/messages/{mid}").status_code == 204  # again: still fine
        act_as(b)
        [gone] = _messages(client, cid)["messages"]
        assert gone["deleted"] is True and gone["body"] is None and gone["payload"] is None
        listed = client.get(f"{API}/conversations/{cid}").json()
        assert listed["unread_count"] == 0 and listed["last_message"]["deleted"] is True

    def test_someone_elses_message_cannot_be_unsent(self, client, act_as):
        a, b = _pair("notmine")
        cid = _open(client, act_as, a, b)["id"]
        mid = _send(client, cid).json()["id"]
        act_as(b)
        assert client.delete(f"{API}/conversations/{cid}/messages/{mid}").status_code == 403

    def test_after_an_hour_a_message_stays(self, client, act_as):
        a, b = _pair("late")
        cid = _open(client, act_as, a, b)["id"]
        mid = _send(client, cid).json()["id"]
        with _ApiTestSession() as db:
            db.get(Message, mid).created_at = datetime.utcnow() - timedelta(minutes=61)
            db.commit()
        assert client.delete(f"{API}/conversations/{cid}/messages/{mid}").status_code == 403
        assert client.delete(f"{API}/conversations/{cid}/messages/999999").status_code == 404


# ---------------------------------------------------------------------------
# Your own state in a chat: read, cleared, muted
# ---------------------------------------------------------------------------

class TestOwnState:
    def test_clearing_hides_the_chat_for_you_only(self, client, act_as):
        a, b = _pair("clear")
        cid = _open(client, act_as, a, b)["id"]
        last = _send(client, cid, "Old").json()["id"]
        cleared = client.patch(f"{API}/conversations/{cid}/me", json={"cleared_up_to_id": last}).json()
        assert cleared["last_message"] is None
        assert _messages(client, cid)["messages"] == []
        assert client.get(f"{API}/conversations").json() == []
        act_as(b)
        assert [m["body"] for m in _messages(client, cid)["messages"]] == ["Old"]
        _send(client, cid, "New")
        act_as(a)
        [listed] = client.get(f"{API}/conversations").json()
        assert listed["unread_count"] == 1
        assert [m["body"] for m in _messages(client, cid)["messages"]] == ["New"]

    def test_clearing_only_moves_forward_and_not_past_the_newest(self, client, act_as):
        a, b = _pair("clear2")
        cid = _open(client, act_as, a, b)["id"]
        first = _send(client, cid).json()["id"]
        second = _send(client, cid).json()["id"]
        assert client.patch(f"{API}/conversations/{cid}/me", json={"cleared_up_to_id": second + 1}).status_code == 422
        client.patch(f"{API}/conversations/{cid}/me", json={"cleared_up_to_id": second})
        client.patch(f"{API}/conversations/{cid}/me", json={"cleared_up_to_id": first})
        with _ApiTestSession() as db:
            assert db.get(ConversationMember, (cid, a.id)).cleared_up_to_id == second

    def test_mute_and_unmute(self, client, act_as):
        a, b = _pair("mute")
        cid = _open(client, act_as, a, b)["id"]
        until = datetime.now(timezone.utc) + timedelta(hours=8)
        muted = client.patch(f"{API}/conversations/{cid}/me", json={"muted_until": until.isoformat()}).json()
        assert datetime.fromisoformat(muted["muted_until"]) == until
        assert client.patch(f"{API}/conversations/{cid}/me", json={}).json()["muted_until"] is not None  # nothing sent: unchanged
        assert client.patch(f"{API}/conversations/{cid}/me", json={"muted_until": None}).json()["muted_until"] is None
        assert client.patch(f"{API}/conversations/{cid}/me", json={"muted": True}).status_code == 422

    def test_reading_only_moves_forward_and_stops_at_the_newest(self, client, act_as):
        a, b = _pair("read")
        cid = _open(client, act_as, a, b)["id"]
        ids = [_send(client, cid).json()["id"] for _ in range(3)]
        act_as(b)
        client.post(f"{API}/conversations/{cid}/read", json={"message_id": ids[1]})
        client.post(f"{API}/conversations/{cid}/read", json={"message_id": ids[0]})
        assert client.get(f"{API}/conversations/{cid}").json()["last_read_message_id"] == ids[1]
        client.post(f"{API}/conversations/{cid}/read", json={"message_id": ids[2] + 1000})
        assert client.get(f"{API}/conversations/{cid}").json()["last_read_message_id"] == ids[2]


class TestReadReceipts:
    def test_read_receipts_are_mutual(self, client, act_as):
        a, b = _pair("receipts")
        cid = _open(client, act_as, a, b)["id"]
        mid = _send(client, cid).json()["id"]
        act_as(b)
        client.post(f"{API}/conversations/{cid}/read", json={"message_id": mid})
        act_as(a)
        assert client.get(f"{API}/conversations/{cid}").json()["other_read_up_to"] == mid
        assert client.put(f"{API}/me/settings", json={"read_receipts": False}).json()["read_receipts"] is False
        assert client.get(f"{API}/conversations/{cid}").json()["other_read_up_to"] is None  # off for you: you don't see theirs
        act_as(b)
        assert client.get(f"{API}/conversations/{cid}").json()["other_read_up_to"] is None  # and they don't see yours


# ---------------------------------------------------------------------------
# Paging
# ---------------------------------------------------------------------------

class TestPaging:
    def test_pages_go_back_and_catch_up(self, client, act_as):
        a, b = _pair("paging")
        cid = _open(client, act_as, a, b)["id"]
        ids = [_send(client, cid, f"m{i}").json()["id"] for i in range(7)]
        newest = _messages(client, cid, limit=3)
        assert [m["id"] for m in newest["messages"]] == ids[4:] and newest["has_more"] is True
        older = _messages(client, cid, limit=3, before=ids[4])
        assert [m["id"] for m in older["messages"]] == ids[1:4] and older["has_more"] is True
        oldest = _messages(client, cid, limit=3, before=ids[1])
        assert [m["id"] for m in oldest["messages"]] == ids[:1] and oldest["has_more"] is False
        caught_up = _messages(client, cid, limit=3, after=ids[2])
        assert [m["id"] for m in caught_up["messages"]] == ids[3:6] and caught_up["has_more"] is True
        assert client.get(f"{API}/conversations/{cid}/messages", params={"before": ids[3], "after": ids[1]}).status_code == 422


class TestSystemMessages:
    def test_a_line_from_vromon_has_no_sender_and_is_never_unread(self, client, act_as):
        a, b = _pair("system")
        cid = _open(client, act_as, a, b)["id"]
        with _ApiTestSession() as db:
            line = chat.post_system_message(db, db.get(Conversation, cid), "member_joined", {"user_id": str(b.id)})
            db.commit()
            line_id = line.id
        act_as(b)
        [shown] = _messages(client, cid)["messages"]
        assert shown["kind"] == "system" and shown["sender_id"] is None
        assert shown["payload"] == {"event": "member_joined", "user_id": str(b.id)}
        assert client.get(f"{API}/conversations/{cid}").json()["unread_count"] == 0
        assert client.delete(f"{API}/conversations/{cid}/messages/{line_id}").status_code == 403


class TestRateLimit:
    def test_sending_is_limited_per_user_not_per_address(self, client, act_as):
        a, b = _pair("limit")
        cid = _open(client, act_as, a, b)["id"]
        limiter.enabled = True
        limiter.reset()
        codes = [_send(client, cid).status_code for _ in range(31)]
        assert codes[:30] == [201] * 30 and codes[30] == 429
        act_as(b)  # same address (the test client), another person
        assert _send(client, cid).status_code == 201


class TestYourData:
    def test_export_lists_your_chats_and_only_what_you_sent(self, client, act_as):
        a, b = _pair("export")
        cid = _open(client, act_as, a, b)["id"]
        _send(client, cid, "Mine")
        act_as(b)
        _send(client, cid, "Theirs")
        act_as(a)
        [exported] = client.get(f"{API}/me/export").json()["chats"]
        assert exported["kind"] == "direct" and exported["with"] == [b.username]
        assert [m["text"] for m in exported["messages_you_sent"]] == ["Mine"]

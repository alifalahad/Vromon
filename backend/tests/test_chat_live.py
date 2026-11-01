"""
Live chat events over a WebSocket (docs/friends-chat-plan.md, step 2).

Only the token check is replaced: the fake takes "<user id>" or "<user id>|<expires
at>" as the token. The hub, the events after each commit and the privacy rules are real.
To show that nothing arrived, a test sends {"type": "ping"} and expects the very next
message to be the pong: events reach a socket in order.
"""

from __future__ import annotations

import asyncio
import time
import uuid
from contextlib import contextmanager

import pytest
from fastapi import Depends
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session
from starlette.websockets import WebSocketDisconnect

from app.api.v1.endpoints import live as live_api
from app.core.auth import get_current_user, new_friend_code
from app.db import get_db
from app.main import app
from app.models.models import Message, User
from app.services import friends as social
from app.services import live
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
    def check(db: Session, token):
        if not token:
            return None
        user_id, _, expires = token.partition("|")
        try:
            user = db.get(User, uuid.UUID(user_id))
        except ValueError:
            return None
        return (user, float(expires) if expires else None) if user else None

    app.dependency_overrides[live_api.ws_authenticator] = lambda: check
    yield
    app.dependency_overrides.pop(live_api.ws_authenticator, None)


def _user(name: str) -> User:
    with _ApiTestSession() as db:
        u = User(auth_subject=f"{name}-{uuid.uuid4()}", friend_code=new_friend_code(), username=f"{name}{uuid.uuid4().hex[:6]}")
        db.add(u)
        db.commit()
        db.refresh(u)
        return u


def _pair(prefix: str) -> tuple[User, User]:
    a, b = _user(f"{prefix}a"), _user(f"{prefix}b")
    with _ApiTestSession() as db:
        social.befriend(db, a.id, b.id)
        db.commit()
    return a, b


def _chat(client, act_as, a: User, b: User) -> int:
    act_as(a)
    return client.post(f"{API}/conversations/direct", json={"user_id": str(b.id)}).json()["id"]


def _send(client, act_as, sender: User, conversation_id: int, text: str = "Hi") -> dict:
    act_as(sender)
    r = client.post(f"{API}/conversations/{conversation_id}/messages", json={"client_id": str(uuid.uuid4()), "body": text})
    assert r.status_code == 201, r.text
    return r.json()


@contextmanager
def _socket(client, user: User, token: str | None = None):
    with client.websocket_connect(f"{API}/ws") as ws:
        ws.send_json({"type": "auth", "token": token or str(user.id)})
        assert ws.receive_json() == {"type": "ready", "user_id": str(user.id)}
        yield ws


def _next(ws) -> dict:
    """The next event, skipping keepalive pings."""
    while True:
        event = ws.receive_json()
        if event != {"type": "ping"}:
            return event


def _nothing_else(ws) -> None:
    """Nothing was queued for this socket before now."""
    ws.send_json({"type": "ping"})
    assert _next(ws) == {"type": "pong"}


def _closed_with(ws) -> int:
    with pytest.raises(WebSocketDisconnect) as closed:
        while True:
            ws.receive_json()
    return closed.value.code


# ---------------------------------------------------------------------------
# Signing in
# ---------------------------------------------------------------------------

class TestSigningIn:
    def test_the_token_must_come_first_and_be_valid(self, client, monkeypatch):
        monkeypatch.setattr(live_api, "AUTH_TIMEOUT", 0.2)
        with client.websocket_connect(f"{API}/ws") as ws:  # says nothing
            assert _closed_with(ws) == live.UNAUTHORIZED
        with client.websocket_connect(f"{API}/ws") as ws:
            ws.send_json({"type": "typing", "conversation_id": 1})  # not an auth message
            assert _closed_with(ws) == live.UNAUTHORIZED
        with client.websocket_connect(f"{API}/ws") as ws:
            ws.send_json({"type": "auth", "token": str(uuid.uuid4())})  # nobody
            assert _closed_with(ws) == live.UNAUTHORIZED
        with client.websocket_connect(f"{API}/ws") as ws:
            ws.send_text("not json")
            assert _closed_with(ws) == live.UNAUTHORIZED

    def test_when_sign_in_cant_be_checked_the_app_is_told_to_try_again(self, client):
        def unavailable(db, token):
            raise live_api.SignInUnavailable()

        app.dependency_overrides[live_api.ws_authenticator] = lambda: unavailable
        with client.websocket_connect(f"{API}/ws") as ws:
            ws.send_json({"type": "auth", "token": "anything"})
            assert _closed_with(ws) == live.TRY_AGAIN  # not 4401: the app mustn't sign out

    def test_the_socket_closes_when_the_token_expires(self, client):
        me = _user("expiry")
        with _socket(client, me, token=f"{me.id}|{time.time() + 0.3}") as ws:
            assert _closed_with(ws) == live.UNAUTHORIZED

    def test_pings_both_ways(self, client, monkeypatch):
        monkeypatch.setattr(live_api, "PING_EVERY", 0.05)
        me = _user("pings")
        with _socket(client, me) as ws:
            assert ws.receive_json() == {"type": "ping"}
            ws.send_json({"type": "ping"})
            assert _next(ws) == {"type": "pong"}

    def test_a_huge_message_closes_the_socket(self, client):
        me = _user("huge")
        with _socket(client, me) as ws:
            ws.send_text("x" * (live_api.MAX_INCOMING + 1))
            assert _closed_with(ws) == live.TOO_BIG

    def test_a_socket_that_sends_far_too_much_is_closed(self, client, monkeypatch):
        """Each typing hint costs the server a lookup; the app sends one every 3 s at most (step 10)."""
        monkeypatch.setattr(live_api, "INCOMING_LIMIT", 5)
        me = _user("chatty")
        with _socket(client, me) as ws:
            for conversation_id in range(1, 7):  # a different chat each time gets past the typing limit
                ws.send_json({"type": "typing", "conversation_id": conversation_id})
            assert _closed_with(ws) == live.TOO_CHATTY

    def test_a_person_has_a_few_sockets_at_most_and_a_new_one_closes_the_oldest(self, client, monkeypatch):
        monkeypatch.setattr(live, "MAX_SOCKETS_PER_USER", 2)
        me = _user("many")
        with _socket(client, me) as first, _socket(client, me), _socket(client, me) as third:
            assert _closed_with(first) == live.TRY_AGAIN  # the app reconnects; most likely it was dead anyway
            _nothing_else(third)


# ---------------------------------------------------------------------------
# Events reach members only
# ---------------------------------------------------------------------------

class TestEvents:
    def test_a_message_reaches_both_members_live_and_nobody_else(self, client, act_as):
        a, b = _pair("live")
        outsider = _user("liveout")
        with _ApiTestSession() as db:
            social.befriend(db, a.id, outsider.id)  # a friend of a member, not in their chat
            db.commit()
        cid = _chat(client, act_as, a, b)
        with _socket(client, a) as wa, _socket(client, b) as wb, _socket(client, outsider) as wo:
            sent = _send(client, act_as, a, cid, "চলো সিলেট যাই")
            to_b = _next(wb)
            assert to_b["type"] == "message.created" and to_b["conversation_id"] == cid
            assert to_b["message"]["id"] == sent["id"] and to_b["message"]["body"] == "চলো সিলেট যাই"
            assert to_b["message"]["client_id"] is None  # only the sender's apps get it back
            to_a = _next(wa)
            assert to_a["message"]["client_id"] == sent["client_id"]  # the sender's other apps
            assert to_a["message"]["created_at"].endswith("+00:00")
            _nothing_else(wo)

    def test_unsend_and_reads_are_live_and_read_ticks_stay_mutual(self, client, act_as):
        a, b = _pair("upd")
        cid = _chat(client, act_as, a, b)
        with _socket(client, a) as wa, _socket(client, b) as wb:
            first = _send(client, act_as, a, cid, "Oops")
            assert _next(wa)["type"] == _next(wb)["type"] == "message.created"
            assert client.delete(f"{API}/conversations/{cid}/messages/{first['id']}").status_code == 204
            for ws in (wa, wb):
                updated = _next(ws)
                assert updated["type"] == "message.updated" and updated["message"]["deleted"] is True and updated["message"]["body"] is None

            act_as(b)
            client.post(f"{API}/conversations/{cid}/read", json={"message_id": first["id"]})
            read = {"type": "conversation.read", "conversation_id": cid, "user_id": str(b.id), "last_read_message_id": first["id"]}
            assert _next(wa) == read  # both have read receipts on
            assert _next(wb) == read  # b's own other apps
            client.post(f"{API}/conversations/{cid}/read", json={"message_id": first["id"]})  # nothing new: no event
            _nothing_else(wa)
            _nothing_else(wb)

            act_as(a)
            client.put(f"{API}/me/settings", json={"read_receipts": False})
            second = _send(client, act_as, a, cid, "Again")
            assert _next(wa)["type"] == _next(wb)["type"] == "message.created"
            act_as(b)
            client.post(f"{API}/conversations/{cid}/read", json={"message_id": second["id"]})
            assert _next(wb)["type"] == "conversation.read"  # b's own apps still sync
            _nothing_else(wa)  # a turned receipts off: a doesn't see b's

    def test_typing_reaches_the_others_is_limited_and_never_stored(self, client, act_as):
        a, b = _pair("typing")
        cid = _chat(client, act_as, a, b)
        with _ApiTestSession() as db:
            before = db.scalar(select(func.count()).select_from(Message))
        with _socket(client, a) as wa, _socket(client, b) as wb:
            wa.send_json({"type": "typing", "conversation_id": cid})
            assert _next(wb) == {"type": "typing", "conversation_id": cid, "user_id": str(a.id)}
            wa.send_json({"type": "typing", "conversation_id": cid})  # within 3 s: dropped
            wa.send_json({"type": "typing", "conversation_id": 999999})  # not their chat
            wa.send_json({"type": "typing", "conversation_id": True})  # not an id
            _nothing_else(wa)  # a's socket has handled all three
            _nothing_else(wb)
        with _ApiTestSession() as db:
            assert db.scalar(select(func.count()).select_from(Message)) == before

    def test_a_blocked_user_gets_nothing(self, client, act_as):
        a, b = _pair("blocked")
        cid = _chat(client, act_as, a, b)
        first = _send(client, act_as, a, cid)
        with _socket(client, a) as wa, _socket(client, b) as wb:
            act_as(a)
            assert client.post(f"{API}/blocks", json={"user_id": str(b.id)}).status_code == 204
            # Both apps refresh the chat: gone for a, read-only ("not friends") for b
            assert _next(wa) == _next(wb) == {"type": "conversation.updated", "conversation_id": cid}
            wa.send_json({"type": "typing", "conversation_id": cid})
            wb.send_json({"type": "typing", "conversation_id": cid})
            act_as(b)
            client.post(f"{API}/conversations/{cid}/read", json={"message_id": first["id"]})
            assert _next(wb)["type"] == "conversation.read"  # b's own apps only
            _nothing_else(wa)
            _nothing_else(wb)

    def test_friendship_changes_tell_both_apps_to_refresh_the_chat(self, client, act_as):
        a, b = _pair("friendship")
        cid = _chat(client, act_as, a, b)
        with _socket(client, a) as wa, _socket(client, b) as wb:
            act_as(a)
            assert client.delete(f"{API}/friends/{b.id}").status_code == 204
            assert _next(wa) == _next(wb) == {"type": "conversation.updated", "conversation_id": cid}
            request = client.post(f"{API}/friend-requests", json={"user_id": str(b.id)}).json()
            act_as(b)
            assert client.post(f"{API}/friend-requests/{request['id']}/accept").status_code == 200
            assert _next(wa) == _next(wb) == {"type": "conversation.updated", "conversation_id": cid}

    def test_muting_or_clearing_updates_your_other_apps_only(self, client, act_as):
        a, b = _pair("ownstate")
        cid = _chat(client, act_as, a, b)
        with _socket(client, a) as wa, _socket(client, b) as wb:
            act_as(a)
            client.patch(f"{API}/conversations/{cid}/me", json={"muted_until": None})
            assert _next(wa) == {"type": "conversation.updated", "conversation_id": cid}
            _nothing_else(wb)

    def test_deleting_an_account_closes_its_sockets_and_updates_its_chats(self, client, act_as):
        a, b = _pair("deleted")
        cid = _chat(client, act_as, a, b)
        _send(client, act_as, b, cid, "Bye")
        with _socket(client, a) as wa, _socket(client, b) as wb:
            act_as(b)
            assert client.delete(f"{API}/me").status_code == 204
            assert _next(wa) == {"type": "conversation.updated", "conversation_id": cid}
            assert _closed_with(wb) == live.UNAUTHORIZED

    def test_after_a_reconnect_the_app_catches_up_with_after(self, client, act_as):
        a, b = _pair("catchup")
        cid = _chat(client, act_as, a, b)
        with _socket(client, b) as wb:
            seen = _send(client, act_as, a, cid, "Seen")
            assert _next(wb)["message"]["id"] == seen["id"]
        # b is offline for these
        missed = [_send(client, act_as, a, cid, f"Missed {i}")["id"] for i in range(2)]
        with _socket(client, b):
            act_as(b)
            page = client.get(f"{API}/conversations/{cid}/messages", params={"after": seen["id"]}).json()
            assert [m["id"] for m in page["messages"]] == missed and page["has_more"] is False


# ---------------------------------------------------------------------------
# The hub
# ---------------------------------------------------------------------------

class TestHub:
    def test_a_socket_that_falls_behind_is_closed_not_queued_forever(self, monkeypatch):
        monkeypatch.setattr(live, "QUEUE_LIMIT", 3)

        async def run():
            conn = live.Connection(websocket=None, user_id=uuid.uuid4(), loop=asyncio.get_running_loop())
            for i in range(4):
                conn.offer({"n": i})
            return conn

        conn = asyncio.run(run())
        assert conn.close_code == live.TRY_AGAIN  # the app reconnects and catches up

    def test_closed_sockets_leave_the_hub(self, client):
        me = _user("leaves")
        with _socket(client, me):
            assert live.hub.connections(me.id) == 1
        deadline = time.time() + 2
        while live.hub.connections(me.id) and time.time() < deadline:
            time.sleep(0.01)
        assert live.hub.connections(me.id) == 0

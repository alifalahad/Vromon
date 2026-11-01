"""
Chat safety (docs/friends-chat-plan.md, step 5): reactions, replies, reports and
the admin list, "delete all my chats", and the chat settings.
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
from app.core.config import settings
from app.db import get_db
from app.main import app
from app.models.models import Message, MessageReaction, MessageReport, Place, User
from app.services import chat
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


def _pair(prefix: str) -> tuple[User, User]:
    a, b = _user(f"{prefix}a"), _user(f"{prefix}b")
    with _ApiTestSession() as db:
        social.befriend(db, a.id, b.id)
        db.commit()
    return a, b


def _unfriend(a: User, b: User) -> None:
    with _ApiTestSession() as db:
        social.unfriend(db, a.id, b.id)
        db.commit()


def _chat(client, act_as, me: User, other: User) -> int:
    act_as(me)
    return client.post(f"{API}/conversations/direct", json={"user_id": str(other.id)}).json()["id"]


def _send(client, cid: int, text: str = "Hello", **extra):
    return client.post(f"{API}/conversations/{cid}/messages", json={"client_id": str(uuid.uuid4()), "body": text, **extra})


def _card(client, cid: int, kind: str, payload: dict):
    return client.post(f"{API}/conversations/{cid}/messages", json={"client_id": str(uuid.uuid4()), "kind": kind, "payload": payload})


def _messages(client, cid: int) -> list[dict]:
    return client.get(f"{API}/conversations/{cid}/messages").json()["messages"]


def _react(client, cid: int, mid: int, reaction: str):
    return client.put(f"{API}/conversations/{cid}/messages/{mid}/reaction", json={"reaction": reaction})


def _place_id() -> int:
    with _ApiTestSession() as db:
        return db.scalars(select(Place.id).where(Place.destination_name == "Cox's Bazar", Place.is_active.is_(True))).first()


# ---------------------------------------------------------------------------
# Reactions
# ---------------------------------------------------------------------------

class TestReactions:
    def test_one_reaction_each_replaced_or_taken_back(self, client, act_as):
        a, b = _pair("rx")
        cid = _chat(client, act_as, a, b)
        mid = _send(client, cid).json()["id"]
        act_as(b)
        assert _react(client, cid, mid, "heart").json()["reactions"] == {"heart": [str(b.id)]}
        assert _react(client, cid, mid, "laugh").json()["reactions"] == {"laugh": [str(b.id)]}  # replaced
        act_as(a)
        assert _react(client, cid, mid, "laugh").json()["reactions"] == {"laugh": [str(b.id), str(a.id)]}
        assert _messages(client, cid)[0]["reactions"] == {"laugh": [str(b.id), str(a.id)]}
        assert client.delete(f"{API}/conversations/{cid}/messages/{mid}/reaction").json()["reactions"] == {"laugh": [str(b.id)]}
        with _ApiTestSession() as db:
            assert len(db.scalars(select(MessageReaction).where(MessageReaction.message_id == mid)).all()) == 1

    def test_want_is_for_places_and_trip_ideas(self, client, act_as):
        a, b = _pair("want")
        cid = _chat(client, act_as, a, b)
        text = _send(client, cid).json()["id"]
        place = _card(client, cid, "place", {"type": "attraction", "ref": str(_place_id())}).json()["id"]
        act_as(b)
        assert _react(client, cid, text, "want").status_code == 422
        assert _react(client, cid, place, "want").json()["reactions"] == {"want": [str(b.id)]}
        assert _react(client, cid, place, "angry").status_code == 422

    def test_only_in_a_chat_you_can_write_in_and_not_on_unsent_ones(self, client, act_as):
        a, b = _pair("rxr")
        stranger = _user("rxrstranger")
        cid = _chat(client, act_as, a, b)
        mid = _send(client, cid).json()["id"]
        gone = _send(client, cid, "Oops").json()["id"]
        assert client.delete(f"{API}/conversations/{cid}/messages/{gone}").status_code == 204
        act_as(b)
        assert _react(client, cid, gone, "wow").status_code == 409
        assert _react(client, cid, 999_999, "wow").status_code == 404
        act_as(stranger)
        assert _react(client, cid, mid, "wow").status_code == 404
        _unfriend(a, b)
        act_as(b)
        assert _react(client, cid, mid, "wow").status_code == 403

    def test_unsending_takes_the_reactions_with_it(self, client, act_as):
        a, b = _pair("rxu")
        cid = _chat(client, act_as, a, b)
        mid = _send(client, cid).json()["id"]
        act_as(b)
        _react(client, cid, mid, "heart")
        act_as(a)
        assert client.delete(f"{API}/conversations/{cid}/messages/{mid}").status_code == 204
        assert _messages(client, cid)[0]["reactions"] == {}
        with _ApiTestSession() as db:
            assert db.scalars(select(MessageReaction).where(MessageReaction.message_id == mid)).all() == []

    def test_reactions_arrive_live(self, client, act_as):
        a, b = _pair("rxl")
        cid = _chat(client, act_as, a, b)
        mid = _send(client, cid).json()["id"]
        with _socket(client, a) as ws:
            act_as(b)
            _react(client, cid, mid, "thumbs_up")
            event = _next(ws)
            assert event["type"] == "message.updated" and event["message"]["reactions"] == {"thumbs_up": [str(b.id)]}


# ---------------------------------------------------------------------------
# Replies
# ---------------------------------------------------------------------------

class TestReplies:
    def test_a_reply_quotes_the_message(self, client, act_as):
        a, b = _pair("rp")
        cid = _chat(client, act_as, a, b)
        first = _send(client, cid, "Sylhet in December?").json()["id"]
        act_as(b)
        r = _send(client, cid, "Yes!", reply_to_id=first)
        assert r.status_code == 201, r.text
        assert r.json()["reply_to"] == {"id": first, "sender_id": str(a.id), "kind": "text", "body": "Sylhet in December?", "payload": None, "deleted": False}
        act_as(a)
        assert _messages(client, cid)[-1]["reply_to"]["body"] == "Sylhet in December?"

    def test_only_a_message_of_this_chat_that_is_still_there(self, client, act_as):
        a, b = _pair("rpx")
        c, d = _pair("rpy")
        cid = _chat(client, act_as, a, b)
        other = _send(client, _chat(client, act_as, c, d), "Elsewhere").json()["id"]
        act_as(a)
        assert _send(client, cid, "Hi", reply_to_id=other).status_code == 404
        gone = _send(client, cid, "Oops").json()["id"]
        client.delete(f"{API}/conversations/{cid}/messages/{gone}")
        assert _send(client, cid, "Hi", reply_to_id=gone).status_code == 409
        assert _messages(client, cid)[-1]["id"] == gone  # nothing was sent

    def test_a_quoted_message_unsent_later_shows_as_removed(self, client, act_as):
        a, b = _pair("rpu")
        cid = _chat(client, act_as, a, b)
        first = _send(client, cid, "Secret plan").json()["id"]
        act_as(b)
        _send(client, cid, "Ha", reply_to_id=first)
        act_as(a)
        client.delete(f"{API}/conversations/{cid}/messages/{first}")
        act_as(b)
        quote = _messages(client, cid)[-1]["reply_to"]
        assert quote["deleted"] is True and quote["body"] is None

    def test_a_quoted_trip_card_is_checked_like_the_card(self, client, act_as):
        a, b = _pair("rpt")
        act_as(a)
        start = date.today() + timedelta(days=30)
        trip = client.post(f"{API}/trips", json={
            "destination": "Cox's Bazar", "start_date": str(start), "end_date": str(start + timedelta(days=1)),
            "num_travelers": 2, "total_budget": 40000, "preference": {"interests": ["Beach"]}, "constraints": {},
        }).json()
        cid = _chat(client, act_as, a, b)
        card = _card(client, cid, "trip", {"trip_id": trip["id"]}).json()["id"]
        act_as(b)
        assert _send(client, cid, "Nice", reply_to_id=card).json()["reply_to"]["payload"]["trip_id"] == trip["id"]
        _unfriend(a, b)
        quote = _messages(client, cid)[-1]["reply_to"]
        assert quote["payload"] == {"available": False}  # nothing about the trip


# ---------------------------------------------------------------------------
# Reports
# ---------------------------------------------------------------------------

class TestReports:
    def test_report_keeps_what_was_said_even_after_unsend(self, client, act_as):
        a, b = _pair("rep")
        cid = _chat(client, act_as, a, b)
        mid = _send(client, cid, "Send me your password").json()["id"]
        act_as(b)
        r = client.post(f"{API}/messages/{mid}/report", json={"reason": "scam", "note": "  Asked for my password "})
        assert r.status_code == 201, r.text
        again = client.post(f"{API}/messages/{mid}/report", json={"reason": "spam"})
        assert again.status_code == 200 and again.json()["id"] == r.json()["id"]
        act_as(a)
        client.delete(f"{API}/conversations/{cid}/messages/{mid}")
        with _ApiTestSession() as db:
            report = db.get(MessageReport, r.json()["id"])
            assert (report.reason, report.note, report.reported_user_id, report.status) == ("scam", "Asked for my password", a.id, "open")
            assert report.snapshot["body"] == "Send me your password"

    def test_only_other_peoples_messages_in_your_chats(self, client, act_as):
        a, b = _pair("repx")
        stranger = _user("repxstranger")
        cid = _chat(client, act_as, a, b)
        mid = _send(client, cid).json()["id"]
        assert client.post(f"{API}/messages/{mid}/report", json={"reason": "spam"}).status_code == 422  # your own
        act_as(stranger)
        assert client.post(f"{API}/messages/{mid}/report", json={"reason": "spam"}).status_code == 404
        act_as(b)
        assert client.post(f"{API}/messages/{mid}/report", json={"reason": "rude"}).status_code == 422
        assert client.post(f"{API}/messages/999999/report", json={"reason": "spam"}).status_code == 404
        _unfriend(a, b)
        assert client.post(f"{API}/messages/{mid}/report", json={"reason": "harassment"}).status_code == 201  # read-only too

    def test_the_admin_list_needs_the_token(self, client, act_as, monkeypatch):
        a, b = _pair("adm")
        cid = _chat(client, act_as, a, b)
        mid = _send(client, cid, "Buy followers").json()["id"]
        act_as(b)
        report_id = client.post(f"{API}/messages/{mid}/report", json={"reason": "spam"}).json()["id"]
        monkeypatch.setattr(settings, "admin_token", "s3cret")
        assert client.get(f"{API}/admin/reports").status_code == 401
        assert client.get(f"{API}/admin/reports", headers={"X-Admin-Token": "wrong"}).status_code == 401
        listed = client.get(f"{API}/admin/reports", headers={"X-Admin-Token": "s3cret"}).json()
        mine = next(r for r in listed if r["id"] == report_id)
        assert mine["snapshot"]["body"] == "Buy followers" and mine["reason"] == "spam"

    def test_deleting_an_account_deletes_its_reports_and_those_about_it(self, client, act_as):
        a, b = _pair("repdel")
        cid = _chat(client, act_as, a, b)
        mid = _send(client, cid, "Rude words").json()["id"]
        act_as(b)
        report_id = client.post(f"{API}/messages/{mid}/report", json={"reason": "harassment"}).json()["id"]
        with _ApiTestSession() as db:
            chat.delete_chat_data(db, a.id)
            db.commit()
            assert db.get(MessageReport, report_id) is None


# ---------------------------------------------------------------------------
# Delete all my chats, and the settings
# ---------------------------------------------------------------------------

def test_delete_all_my_chats_clears_them_for_me_only(client, act_as):
    a, b = _pair("clr")
    c = _user("clrc")
    with _ApiTestSession() as db:
        social.befriend(db, a.id, c.id)
        db.commit()
    one, two = _chat(client, act_as, a, b), _chat(client, act_as, a, c)
    _send(client, one)
    _send(client, two)
    assert client.post(f"{API}/me/chats/clear").json() == {"cleared": 2}
    assert _messages(client, one) == [] and _messages(client, two) == []
    assert [x["id"] for x in client.get(f"{API}/conversations").json() if x["id"] in (one, two)] == []
    act_as(b)
    assert len(_messages(client, one)) == 1  # theirs is untouched
    with _ApiTestSession() as db:
        assert db.scalar(select(Message).where(Message.conversation_id == one)) is not None


def test_chat_settings_round_trip(client, act_as):
    me = _user("cset")
    act_as(me)
    got = client.get(f"{API}/me/settings").json()
    assert (got["notify_messages"], got["notify_trip_rooms"], got["notification_previews"]) == (True, True, True)
    body = {**got, "notify_messages": False, "notification_previews": False}
    body.pop("updated_at", None)
    saved = client.put(f"{API}/me/settings", json=body)
    assert saved.status_code == 200, saved.text
    assert (saved.json()["notify_messages"], saved.json()["notify_trip_rooms"], saved.json()["notification_previews"]) == (False, True, False)


# ---------------------------------------------------------------------------
# Live helpers
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

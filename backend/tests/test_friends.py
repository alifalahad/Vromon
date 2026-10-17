"""
Android Phase 5: friends, requests, blocks, push tokens, and the privacy matrix
(prompt §6.3 and §8: owner ✓, friend ✓ read-only, stranger → 404, blocked → 404,
after unfriend → 404, write by a friend → 404).
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
from app.core.config import settings
from app.db import get_db
from app.db.geo_seed import seed_geo
from app.main import app
from app.models.models import Block, Device, FriendRequest, Friendship, User
from app.services import push as push_service
from tests.conftest import _ApiTestSession


@pytest.fixture(scope="module", autouse=True)
def geo_data():
    with _ApiTestSession() as db:
        assert seed_geo(db)


@pytest.fixture
def client():
    return TestClient(app)


def _user(name: str, *, discoverable: bool = True) -> User:
    with _ApiTestSession() as db:
        u = User(
            auth_subject=f"{name}-{uuid.uuid4()}",
            friend_code=new_friend_code(),
            username=f"{name}{uuid.uuid4().hex[:6]}",
            display_name=name.title(),
            discoverable=discoverable,
        )
        db.add(u)
        db.commit()
        db.refresh(u)
        return u


@pytest.fixture
def act_as():
    """Switch the signed-in user for the next requests."""
    def _as(user: User):
        def current_user(db: Session = Depends(get_db)) -> User:
            return db.get(User, user.id)

        app.dependency_overrides[get_current_user] = current_user
    yield _as


@pytest.fixture
def pushes(monkeypatch):
    """Captures what would be sent to the Expo Push API."""
    sent: list[dict] = []
    monkeypatch.setattr(settings, "push_enabled", True)
    monkeypatch.setattr(push_service, "_send", lambda messages: sent.extend(messages) or [{"status": "ok"} for _ in messages])
    return sent


def _befriend(client, act_as, a: User, b: User) -> None:
    act_as(a)
    req = client.post("/api/v1/friend-requests", json={"user_id": str(b.id)}).json()
    act_as(b)
    assert client.post(f"/api/v1/friend-requests/{req['id']}/accept").json()["status"] == "accepted"


def _trip_payload() -> dict:
    start = date.today() + timedelta(days=30)
    return {
        "destination": "Cox's Bazar", "start_date": str(start), "end_date": str(start + timedelta(days=1)),
        "num_travelers": 2, "total_budget": 40000, "preference": {"interests": ["Beach"]}, "constraints": {},
    }


# ---------------------------------------------------------------------------
# Finding people
# ---------------------------------------------------------------------------

class TestSearch:
    def test_prefix_search_over_discoverable_people_only(self, client, act_as):
        me, findable, hidden = _user("srch"), _user("srchable"), _user("srchhidden", discoverable=False)
        act_as(me)
        found = {p["id"] for p in client.get("/api/v1/users/search", params={"q": "@SRCH"}).json()}
        assert str(findable.id) in found
        assert str(hidden.id) not in found
        assert str(me.id) not in found  # not yourself

    def test_results_show_only_public_fields_and_the_button_state(self, client, act_as):
        me, other = _user("fields"), _user("fieldsother")
        act_as(me)
        [hit] = [p for p in client.get("/api/v1/users/search", params={"q": other.username}).json()]
        assert set(hit) == {"id", "username", "display_name", "avatar_url", "relation", "request_id"}  # decision D3
        assert hit["relation"] == "none"
        client.post("/api/v1/friend-requests", json={"user_id": str(other.id)})
        assert client.get("/api/v1/users/search", params={"q": other.username}).json()[0]["relation"] == "requested"

    def test_short_queries_and_wildcards_match_nothing(self, client, act_as):
        act_as(_user("wild"))
        assert client.get("/api/v1/users/search", params={"q": "w"}).json() == []
        assert client.get("/api/v1/users/search", params={"q": "%%"}).json() == []
        assert client.get("/api/v1/users/search", params={"q": "__"}).json() == []

    def test_blocking_hides_both_ways(self, client, act_as):
        a, b = _user("blka"), _user("blkb")
        act_as(a)
        assert client.post("/api/v1/blocks", json={"user_id": str(b.id)}).status_code == 204
        assert client.get("/api/v1/users/search", params={"q": b.username}).json() == []
        act_as(b)
        assert client.get("/api/v1/users/search", params={"q": a.username}).json() == []


class TestFriendCodes:
    def test_lookup_works_for_undiscoverable_people_and_ignores_case(self, client, act_as):
        me, private = _user("codeme"), _user("codepriv", discoverable=False)
        act_as(me)
        resp = client.get(f"/api/v1/friend-codes/{private.friend_code.lower()}")
        assert resp.status_code == 200
        assert resp.json()["username"] == private.username
        assert client.get(f"/api/v1/friend-codes/{me.friend_code}").json()["relation"] == "self"

    def test_unknown_or_malformed_codes_are_404(self, client, act_as):
        act_as(_user("codebad"))
        assert client.get("/api/v1/friend-codes/AAAAAAAA").status_code == 404
        assert client.get("/api/v1/friend-codes/not-a-code").status_code == 404

    def test_rotating_retires_the_old_code(self, client, act_as):
        owner, other = _user("rot"), _user("rotother")
        old = owner.friend_code
        act_as(owner)
        new = client.post("/api/v1/me/friend-code/rotate").json()["friend_code"]
        assert new != old and len(new) == 8
        act_as(other)
        assert client.get(f"/api/v1/friend-codes/{old}").status_code == 404
        assert client.get(f"/api/v1/friend-codes/{new}").status_code == 200

    def test_a_blocked_person_cannot_use_your_code(self, client, act_as):
        a, b = _user("cblka"), _user("cblkb")
        act_as(a)
        client.post("/api/v1/blocks", json={"user_id": str(b.id)})
        act_as(b)
        assert client.get(f"/api/v1/friend-codes/{a.friend_code}").status_code == 404
        assert client.post("/api/v1/friend-requests", json={"friend_code": a.friend_code}).status_code == 404


# ---------------------------------------------------------------------------
# Requests
# ---------------------------------------------------------------------------

class TestRequests:
    def test_request_accept_makes_friends(self, client, act_as, pushes):
        a, b = _user("reqa"), _user("reqb")
        act_as(a)
        sent = client.post("/api/v1/friend-requests", json={"user_id": str(b.id)}).json()
        assert sent["status"] == "pending" and sent["direction"] == "out" and sent["user"]["id"] == str(b.id)
        assert [r["id"] for r in client.get("/api/v1/friend-requests", params={"direction": "out"}).json()] == [sent["id"]]

        act_as(b)
        [incoming] = client.get("/api/v1/friend-requests").json()
        assert incoming["direction"] == "in" and incoming["user"]["username"] == a.username
        assert client.post(f"/api/v1/friend-requests/{sent['id']}/accept").json()["status"] == "accepted"
        assert client.get("/api/v1/friend-requests").json() == []
        assert [f["id"] for f in client.get("/api/v1/friends").json()] == [str(a.id)]
        act_as(a)
        [friend] = client.get("/api/v1/friends").json()
        assert friend["id"] == str(b.id) and friend["countries"] == 0

    def test_sending_twice_returns_the_same_request(self, client, act_as):
        a, b = _user("twia"), _user("twib")
        act_as(a)
        first = client.post("/api/v1/friend-requests", json={"user_id": str(b.id)}).json()
        second = client.post("/api/v1/friend-requests", json={"friend_code": b.friend_code}).json()
        assert first["id"] == second["id"]

    def test_asking_someone_who_already_asked_you_accepts(self, client, act_as):
        a, b = _user("muta"), _user("mutb")
        act_as(a)
        client.post("/api/v1/friend-requests", json={"user_id": str(b.id)})
        act_as(b)
        assert client.post("/api/v1/friend-requests", json={"user_id": str(a.id)}).json()["status"] == "accepted"
        assert len(client.get("/api/v1/friends").json()) == 1

    def test_decline_and_cancel(self, client, act_as):
        a, b, c = _user("deca"), _user("decb"), _user("decc")
        act_as(a)
        to_b = client.post("/api/v1/friend-requests", json={"user_id": str(b.id)}).json()
        to_c = client.post("/api/v1/friend-requests", json={"user_id": str(c.id)}).json()
        # Only the recipient can decline, only the sender can cancel
        assert client.post(f"/api/v1/friend-requests/{to_b['id']}/decline").status_code == 404
        assert client.post(f"/api/v1/friend-requests/{to_c['id']}/cancel").json()["status"] == "cancelled"
        act_as(b)
        assert client.post(f"/api/v1/friend-requests/{to_b['id']}/cancel").status_code == 404
        assert client.post(f"/api/v1/friend-requests/{to_b['id']}/decline").json()["status"] == "declined"
        assert client.post(f"/api/v1/friend-requests/{to_b['id']}/accept").status_code == 404  # no longer pending
        assert client.get("/api/v1/friends").json() == []

    def test_a_third_person_cannot_accept(self, client, act_as):
        a, b, c = _user("thra"), _user("thrb"), _user("thrc")
        act_as(a)
        req = client.post("/api/v1/friend-requests", json={"user_id": str(b.id)}).json()
        act_as(c)
        assert client.post(f"/api/v1/friend-requests/{req['id']}/accept").status_code == 404

    def test_undiscoverable_people_need_their_code(self, client, act_as):
        a, private = _user("nda"), _user("ndb", discoverable=False)
        act_as(a)
        assert client.post("/api/v1/friend-requests", json={"user_id": str(private.id)}).status_code == 404
        assert client.post("/api/v1/friend-requests", json={"friend_code": private.friend_code}).json()["status"] == "pending"

    def test_yourself_already_friends_and_bad_payloads(self, client, act_as):
        a, b = _user("misa"), _user("misb")
        act_as(a)
        assert client.post("/api/v1/friend-requests", json={"friend_code": a.friend_code}).status_code == 400
        assert client.post("/api/v1/friend-requests", json={}).status_code == 422
        assert client.post("/api/v1/friend-requests", json={"user_id": str(b.id), "friend_code": b.friend_code}).status_code == 422
        assert client.post("/api/v1/friend-requests", json={"user_id": str(uuid.uuid4())}).status_code == 404
        _befriend(client, act_as, a, b)
        act_as(a)
        assert client.post("/api/v1/friend-requests", json={"user_id": str(b.id)}).status_code == 409


# ---------------------------------------------------------------------------
# Privacy matrix (prompt §8)
# ---------------------------------------------------------------------------

USER_ROUTES = ("visits", "stats", "trips", "profile", "compare")


class TestPrivacyMatrix:
    @pytest.fixture
    def alice_with_data(self, client, act_as):
        alice = _user("pma")
        act_as(alice)
        client.put("/api/v1/me/visits", json={"visits": [{"place_type": "country", "place_code": "NP", "status": "visited"}]})
        trip = client.post("/api/v1/trips", json=_trip_payload()).json()
        return alice, trip["id"]

    def _can_read(self, client, alice: User, trip_id: int) -> dict[str, int]:
        codes = {r: client.get(f"/api/v1/users/{alice.id}/{r}").status_code for r in USER_ROUTES}
        codes["trip"] = client.get(f"/api/v1/trips/{trip_id}").status_code
        codes["itinerary"] = client.get(f"/api/v1/trips/{trip_id}/itinerary").status_code
        codes["budget"] = client.get(f"/api/v1/trips/{trip_id}/budget").status_code
        return codes

    def test_owner_sees_everything(self, client, act_as, alice_with_data):
        alice, trip_id = alice_with_data
        assert set(self._can_read(client, alice, trip_id).values()) == {200}

    def test_strangers_get_404_everywhere(self, client, act_as, alice_with_data):
        alice, trip_id = alice_with_data
        act_as(_user("pmstranger"))
        assert set(self._can_read(client, alice, trip_id).values()) == {404}

    def test_friends_read_but_cannot_write(self, client, act_as, alice_with_data):
        alice, trip_id = alice_with_data
        bob = _user("pmfriend")
        _befriend(client, act_as, alice, bob)
        act_as(bob)
        assert set(self._can_read(client, alice, trip_id).values()) == {200}
        assert client.get(f"/api/v1/users/{alice.id}/visits").json()[0]["place_code"] == "NP"
        profile = client.get(f"/api/v1/users/{alice.id}/profile").json()
        assert profile["is_self"] is False and profile["friends_since"]
        # Writes to a friend's trip are 404, as if it didn't exist
        assert client.patch(f"/api/v1/trips/{trip_id}", json={"total_budget": 1}).status_code == 404
        assert client.delete(f"/api/v1/trips/{trip_id}").status_code == 404
        assert client.post(f"/api/v1/trips/{trip_id}/generate").status_code == 404
        assert client.post(f"/api/v1/trips/{trip_id}/feedback", json={"rating": 1}).status_code == 404
        # Bob's visit edits only ever touch Bob's map
        client.delete("/api/v1/me/visits/country/NP")
        act_as(alice)
        assert len(client.get(f"/api/v1/users/{alice.id}/visits").json()) == 1

    def test_unfriending_revokes_access_immediately(self, client, act_as, alice_with_data):
        alice, trip_id = alice_with_data
        bob = _user("pmex")
        _befriend(client, act_as, alice, bob)
        act_as(bob)
        assert client.delete(f"/api/v1/friends/{alice.id}").status_code == 204
        assert set(self._can_read(client, alice, trip_id).values()) == {404}
        assert client.delete(f"/api/v1/friends/{alice.id}").status_code == 404  # not friends any more

    def test_blocking_ends_the_friendship_and_access(self, client, act_as, alice_with_data):
        alice, trip_id = alice_with_data
        bob = _user("pmblk")
        _befriend(client, act_as, alice, bob)
        act_as(alice)
        client.post("/api/v1/blocks", json={"user_id": str(bob.id)})
        act_as(bob)
        assert set(self._can_read(client, alice, trip_id).values()) == {404}
        assert client.post("/api/v1/friend-requests", json={"user_id": str(alice.id)}).status_code == 404
        act_as(alice)
        assert [b["id"] for b in client.get("/api/v1/blocks").json()] == [str(bob.id)]
        assert client.delete(f"/api/v1/blocks/{bob.id}").status_code == 204
        # Unblocking doesn't restore the friendship
        act_as(bob)
        assert client.get(f"/api/v1/users/{alice.id}/visits").status_code == 404

    def test_a_block_also_blocks_a_leftover_friendship_row(self, client, act_as, alice_with_data):
        """Defence in depth: even if a friendship row survived a block, access stays closed."""
        alice, trip_id = alice_with_data
        bob = _user("pmrow")
        _befriend(client, act_as, alice, bob)
        with _ApiTestSession() as db:
            db.add(Block(blocker_id=alice.id, blocked_id=bob.id))
            db.commit()
        act_as(bob)
        assert set(self._can_read(client, alice, trip_id).values()) == {404}

    def test_pending_requests_grant_nothing(self, client, act_as, alice_with_data):
        alice, trip_id = alice_with_data
        bob = _user("pmpend")
        act_as(bob)
        client.post("/api/v1/friend-requests", json={"user_id": str(alice.id)})
        assert set(self._can_read(client, alice, trip_id).values()) == {404}


# ---------------------------------------------------------------------------
# Compare
# ---------------------------------------------------------------------------

def test_compare_maps_by_view(client, act_as):
    a, b = _user("cmpa"), _user("cmpb")
    act_as(a)
    client.put("/api/v1/me/visits", json={"visits": [
        {"place_type": "country", "place_code": "BD", "status": "visited"},
        {"place_type": "country", "place_code": "NP", "status": "lived"},
        {"place_type": "country", "place_code": "IN", "status": "want"},  # wishes don't count
    ]})
    act_as(b)
    client.put("/api/v1/me/visits", json={"visits": [
        {"place_type": "country", "place_code": "BD", "status": "visited"},
        {"place_type": "country", "place_code": "FR", "status": "visited"},
        {"place_type": "country", "place_code": "IN", "status": "visited"},
    ]})
    _befriend(client, act_as, a, b)
    act_as(a)
    c = client.get(f"/api/v1/users/{b.id}/compare").json()["countries"]
    codes = {k: [p["code"] for p in v] for k, v in c.items()}
    assert codes == {"in_common": ["BD"], "only_me": ["NP"], "only_them": ["FR", "IN"]}
    assert c["in_common"][0]["name"] == "Bangladesh"


# ---------------------------------------------------------------------------
# Push tokens and notifications
# ---------------------------------------------------------------------------

TOKEN = "ExponentPushToken[abc123]"


class TestPush:
    def test_register_moves_token_to_whoever_signed_in_last(self, client, act_as):
        a, b = _user("deva"), _user("devb")
        token = f"ExponentPushToken[{uuid.uuid4().hex}]"
        act_as(a)
        assert client.post("/api/v1/me/devices", json={"expo_push_token": token, "platform": "android"}).status_code == 204
        act_as(b)
        client.post("/api/v1/me/devices", json={"expo_push_token": token, "platform": "android"})
        with _ApiTestSession() as db:
            assert db.scalar(select(Device.user_id).where(Device.expo_push_token == token)) == b.id
        # Someone else can't unregister it
        act_as(a)
        client.delete(f"/api/v1/me/devices/{token}")
        with _ApiTestSession() as db:
            assert db.scalar(select(Device).where(Device.expo_push_token == token)) is not None
        assert client.post("/api/v1/me/devices", json={"expo_push_token": "not-a-token", "platform": "android"}).status_code == 422

    def test_request_and_acceptance_notify_the_other_person(self, client, act_as, pushes):
        a, b = _user("pusha"), _user("pushb")
        for user in (a, b):
            act_as(user)
            client.post("/api/v1/me/devices", json={"expo_push_token": f"ExponentPushToken[{user.id.hex}]", "platform": "android"})
        _befriend(client, act_as, a, b)
        assert [(m["to"], m["title"], m["data"]["url"]) for m in pushes] == [
            (f"ExponentPushToken[{b.id.hex}]", "New friend request", "/friends"),
            (f"ExponentPushToken[{a.id.hex}]", "Friend request accepted", f"/friends/{b.id}"),
        ]

    def test_respects_the_notification_settings(self, client, act_as, pushes):
        a, b = _user("prefa"), _user("prefb")
        act_as(b)
        client.post("/api/v1/me/devices", json={"expo_push_token": f"ExponentPushToken[{b.id.hex}]", "platform": "android"})
        client.put("/api/v1/me/settings", json={"notify_friend_requests": False})
        act_as(a)
        client.post("/api/v1/friend-requests", json={"user_id": str(b.id)})
        assert pushes == []

    def test_tokens_expo_no_longer_knows_are_removed(self, monkeypatch):
        u = _user("gone")
        token = f"ExponentPushToken[{u.id.hex}]"
        with _ApiTestSession() as db:
            db.add(Device(user_id=u.id, expo_push_token=token, platform="android"))
            db.commit()
        monkeypatch.setattr(push_service, "SessionLocal", _ApiTestSession)
        monkeypatch.setattr(push_service, "_send", lambda m: [{"status": "error", "details": {"error": "DeviceNotRegistered"}}])
        push_service.deliver([token], push_service.Push("t", "b", "/friends", "notify_friend_requests"))
        with _ApiTestSession() as db:
            assert db.scalar(select(Device).where(Device.expo_push_token == token)) is None

    def test_a_failing_push_service_never_raises(self, monkeypatch):
        def boom(_):
            raise RuntimeError("expo down")
        monkeypatch.setattr(push_service, "_send", boom)
        push_service.deliver([TOKEN], push_service.Push("t", "b", "/friends", "notify_friend_requests"))


# ---------------------------------------------------------------------------
# Export and deletion
# ---------------------------------------------------------------------------

def test_export_lists_friends_and_deletion_removes_social_data(client, act_as):
    a, b, c = _user("expa"), _user("expb"), _user("expc")
    _befriend(client, act_as, a, b)
    act_as(a)
    client.post("/api/v1/friend-requests", json={"user_id": str(c.id)})
    client.post("/api/v1/me/devices", json={"expo_push_token": f"ExponentPushToken[{a.id.hex}]", "platform": "android"})
    act_as(c)
    client.post("/api/v1/blocks", json={"user_id": str(a.id)})

    act_as(a)
    export = client.get("/api/v1/me/export").json()
    assert [f["username"] for f in export["friends"]] == [b.username]
    assert export["devices"][0]["platform"] == "android"
    assert client.delete("/api/v1/me").status_code == 204
    with _ApiTestSession() as db:
        for model, column in ((Friendship, Friendship.user_a_id), (Friendship, Friendship.user_b_id),
                              (FriendRequest, FriendRequest.from_user_id), (Block, Block.blocked_id), (Device, Device.user_id)):
            assert db.scalar(select(model).where(column == a.id)) is None
    act_as(b)
    assert client.get("/api/v1/friends").json() == []


def test_notification_settings_round_trip(client, act_as):
    act_as(_user("notif"))
    saved = client.put("/api/v1/me/settings", json={"notify_friend_requests": False, "notify_friend_accepted": True}).json()
    assert saved["notify_friend_requests"] is False and saved["notify_friend_accepted"] is True

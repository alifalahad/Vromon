"""
Android Phase 2: accounts and privacy.

These tests use real token verification: Supabase-style ES256 access tokens are
signed with a local key, and the app's key resolver is pointed at its public key.
Two accounts (A and B) prove that one user's trips are invisible to another
(404, never 403) on every trip route.
"""

from __future__ import annotations

import time
import uuid
from datetime import date, timedelta

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.api.v1.endpoints import me as me_api
from app.core import auth
from app.core.auth import get_current_user
from app.core.config import Settings, settings
from app.core.rate_limit import limiter
from app.main import app
from app.models.models import Trip, User, UserSettings
from tests.conftest import _ApiTestSession

ISSUER_BASE = "https://testproject.supabase.co"
_KEY = ec.generate_private_key(ec.SECP256R1())
_OTHER_KEY = ec.generate_private_key(ec.SECP256R1())


def token(sub: str, *, email: str | None = None, key=_KEY, alg="ES256", exp_in=3600, iss=None, aud="authenticated") -> str:
    now = int(time.time())
    claims = {"sub": sub, "aud": aud, "iss": iss or f"{ISSUER_BASE}/auth/v1", "iat": now, "exp": now + exp_in, "role": "authenticated"}
    if email:
        claims["email"] = email
    return jwt.encode(claims, key, algorithm=alg, headers={"kid": "test-key"})


def bearer(t: str) -> dict:
    return {"Authorization": f"Bearer {t}"}


@pytest.fixture(autouse=True)
def real_auth(monkeypatch):
    """Undo the conftest test-user override and verify tokens against the local key."""
    app.dependency_overrides.pop(get_current_user, None)
    monkeypatch.setattr(settings, "supabase_url", ISSUER_BASE)
    monkeypatch.setattr(settings, "supabase_service_role_key", "")
    monkeypatch.setattr(settings, "dev_auth_bypass", False)
    monkeypatch.setattr(settings, "app_env", "development")
    monkeypatch.setattr(auth, "signing_key_resolver", lambda _t: _KEY.public_key())


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def alice(client):
    return _account(client, "alice")


@pytest.fixture
def bob(client):
    return _account(client, "bob")


def _account(client, name: str) -> dict:
    """A fresh signed-in account with a claimed username."""
    sub = str(uuid.uuid4())
    headers = bearer(token(sub, email=f"{name}-{sub[:6]}@example.com"))
    me = client.get("/api/v1/me", headers=headers).json()
    username = f"{name}_{sub[:6]}"
    assert client.patch("/api/v1/me", json={"username": username}, headers=headers).status_code == 200
    return {"headers": headers, "id": me["id"], "username": username, "sub": sub}


def _trip_payload(days=2) -> dict:
    start = date.today() + timedelta(days=30)
    return {
        "destination": "Cox's Bazar",
        "start_date": str(start),
        "end_date": str(start + timedelta(days=days - 1)),
        "num_travelers": 2,
        "total_budget": 40000,
        "preference": {"interests": ["Beach", "Nature"]},
        "constraints": {},
    }


def _create_trip(client, account) -> int:
    resp = client.post("/api/v1/trips", json=_trip_payload(), headers=account["headers"])
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


# ---------------------------------------------------------------------------
# Token verification
# ---------------------------------------------------------------------------

class TestTokens:
    def test_missing_token_is_401(self, client):
        resp = client.get("/api/v1/me")
        assert resp.status_code == 401
        assert resp.headers["www-authenticate"] == "Bearer"

    @pytest.mark.parametrize(
        "make",
        [
            lambda: "not-a-jwt",
            lambda: token(str(uuid.uuid4()), exp_in=-60),  # expired
            lambda: token(str(uuid.uuid4()), iss="https://evil.supabase.co/auth/v1"),
            lambda: token(str(uuid.uuid4()), aud="anon"),
            lambda: token(str(uuid.uuid4()), key=_OTHER_KEY),  # signed by someone else
            lambda: jwt.encode(
                {"sub": "x", "aud": "authenticated", "iss": f"{ISSUER_BASE}/auth/v1", "exp": int(time.time()) + 60},
                "a-legacy-shared-secret-of-32-bytes!",
                algorithm="HS256",
            ),
        ],
        ids=["garbage", "expired", "wrong-issuer", "wrong-audience", "wrong-key", "hs256"],
    )
    def test_invalid_tokens_are_rejected(self, client, make):
        assert client.get("/api/v1/me", headers=bearer(make())).status_code == 401

    def test_valid_token_creates_the_account_once(self, client):
        sub = str(uuid.uuid4())
        headers = bearer(token(sub, email="new@example.com"))
        first = client.get("/api/v1/me", headers=headers).json()
        second = client.get("/api/v1/me", headers=headers).json()
        assert first["id"] == second["id"]
        assert first["needs_onboarding"] is True
        assert first["email"] == "new@example.com"
        assert len(first["friend_code"]) == 8 and str(first["friend_code"]).isalnum()

    def test_unreachable_key_server_is_503_not_401(self, client, monkeypatch):
        # A 401 would make the app sign the user out over a server-side problem
        def unreachable(_t):
            raise jwt.PyJWKClientConnectionError("network down")

        monkeypatch.setattr(auth, "signing_key_resolver", unreachable)
        assert client.get("/api/v1/me", headers=bearer(token(str(uuid.uuid4())))).status_code == 503

    def test_unconfigured_auth_is_503(self, client, monkeypatch):
        monkeypatch.setattr(settings, "supabase_url", "")
        assert client.get("/api/v1/me", headers=bearer(token("x"))).status_code == 503


class TestDevBypass:
    def test_off_by_default(self, client):
        assert client.get("/api/v1/trips").status_code == 401

    def test_development_requests_without_token_use_the_dev_user(self, client, monkeypatch):
        monkeypatch.setattr(settings, "dev_auth_bypass", True)
        resp = client.get("/api/v1/me")
        assert resp.status_code == 200

    def test_refused_outside_development(self):
        with pytest.raises(ValidationError):
            Settings(app_env="production", dev_auth_bypass=True)


# ---------------------------------------------------------------------------
# Profile and usernames
# ---------------------------------------------------------------------------

class TestProfile:
    def test_claim_username_is_lowercased_and_ends_onboarding(self, client):
        sub = str(uuid.uuid4())
        headers = bearer(token(sub))
        resp = client.patch("/api/v1/me", json={"username": f"Ali.{sub[:6]}"}, headers=headers)
        assert resp.status_code == 200
        assert resp.json()["username"] == f"ali.{sub[:6]}"
        assert resp.json()["needs_onboarding"] is False

    @pytest.mark.parametrize("name", ["ab", "a" * 21, "has space", "émoji", ".dot", "dot.", "a..b", "admin"])
    def test_invalid_usernames_are_422(self, client, alice, name):
        assert client.patch("/api/v1/me", json={"username": name}, headers=alice["headers"]).status_code == 422

    def test_taken_username_is_409_case_insensitively(self, client, alice, bob):
        resp = client.patch("/api/v1/me", json={"username": alice["username"].upper()}, headers=bob["headers"])
        assert resp.status_code == 409

    def test_availability(self, client, alice, bob):
        url = "/api/v1/usernames/{}/available"
        assert client.get(url.format(alice["username"]), headers=bob["headers"]).json()["available"] is False
        assert client.get(url.format(alice["username"]), headers=alice["headers"]).json()["available"] is True  # own name
        assert client.get(url.format(f"free_{uuid.uuid4().hex[:8]}"), headers=bob["headers"]).json()["available"] is True
        bad = client.get(url.format("no"), headers=bob["headers"]).json()
        assert bad["available"] is False and bad["reason"]

    def test_profile_fields(self, client, alice):
        resp = client.patch(
            "/api/v1/me",
            json={"display_name": "  Alif   Al Ahad ", "home_country_iso2": "bd", "discoverable": False},
            headers=alice["headers"],
        ).json()
        assert resp["display_name"] == "Alif Al Ahad"
        assert resp["home_country_iso2"] == "BD"
        assert resp["discoverable"] is False
        assert client.patch("/api/v1/me", json={"home_country_iso2": "BGD"}, headers=alice["headers"]).status_code == 422
        assert client.patch("/api/v1/me", json={"friend_code": "HACKED00"}, headers=alice["headers"]).status_code == 422


class TestSettings:
    def test_defaults_then_round_trip(self, client, alice):
        assert client.get("/api/v1/me/settings", headers=alice["headers"]).json()["appearance"] == "system"
        theme = {"v": 1, "themeId": "rustic", "styleId": "theme:rustic", "colorsId": "theme:rustic", "compareId": "rustic"}
        body = {"language": "bn", "appearance": "dark", "haptics": False, "units": "mi", "map_theme": theme}
        saved = client.put("/api/v1/me/settings", json=body, headers=alice["headers"]).json()
        assert {k: saved[k] for k in body} == body
        assert client.get("/api/v1/me/settings", headers=alice["headers"]).json()["units"] == "mi"

    def test_validation(self, client, alice):
        assert client.put("/api/v1/me/settings", json={"appearance": "sepia"}, headers=alice["headers"]).status_code == 422
        huge = {"map_theme": {"x": "y" * 5000}}
        assert client.put("/api/v1/me/settings", json=huge, headers=alice["headers"]).status_code == 422

    def test_map_theme_selection(self, client, alice):
        put = lambda theme: client.put("/api/v1/me/settings", json={"map_theme": theme}, headers=alice["headers"])
        # A Custom selection (no preset) is three parts; a preset alone is enough
        custom = {"v": 1, "styleId": "pencil", "colorsId": "wonder", "compareId": "midnight"}
        assert put(custom).json()["map_theme"] == custom
        assert put({"themeId": "serenity"}).json()["map_theme"] == {"v": 1, "themeId": "serenity"}
        assert put(None).json()["map_theme"] is None
        for bad in (
            {"styleId": "pencil"},  # incomplete
            {"themeId": "Rustic"},  # ids are lowercase
            {"themeId": "rustic", "extra": 1},  # unknown field
            {"v": 2, "themeId": "rustic"},  # unknown version
            {"styleId": "theme:../x", "colorsId": "a", "compareId": "b"},
            {"styleId": "x" * 40, "colorsId": "a", "compareId": "b"},
        ):
            assert put(bad).status_code == 422, bad

    def test_old_stored_theme_still_loads(self, client, alice):
        """Rows saved before the strict schema (any dict) are returned as stored."""
        client.put("/api/v1/me/settings", json={"units": "mi"}, headers=alice["headers"])
        db = _ApiTestSession()
        row = db.query(UserSettings).filter(UserSettings.user_id == uuid.UUID(alice["id"])).one()
        row.map_theme = {"legacy": True}
        db.commit()
        db.close()
        assert client.get("/api/v1/me/settings", headers=alice["headers"]).json()["map_theme"] == {"legacy": True}


# ---------------------------------------------------------------------------
# Privacy matrix: B can never see or change A's data
# ---------------------------------------------------------------------------

class TestPrivacy:
    def test_trip_lists_are_per_user(self, client, alice, bob):
        trip_id = _create_trip(client, alice)
        assert trip_id in [t["id"] for t in client.get("/api/v1/trips", headers=alice["headers"]).json()]
        assert trip_id not in [t["id"] for t in client.get("/api/v1/trips", headers=bob["headers"]).json()]

    @pytest.mark.parametrize(
        "method,path,body",
        [
            ("get", "/api/v1/trips/{id}", None),
            ("patch", "/api/v1/trips/{id}", {"title": "mine now"}),
            ("delete", "/api/v1/trips/{id}", None),
            ("post", "/api/v1/trips/{id}/duplicate", None),
            ("post", "/api/v1/trips/{id}/generate", None),
            ("post", "/api/v1/trips/{id}/regenerate", None),
            ("get", "/api/v1/trips/{id}/itinerary", None),
            ("get", "/api/v1/trips/{id}/budget", None),
            ("get", "/api/v1/trips/{id}/feedback", None),
            ("post", "/api/v1/trips/{id}/feedback", {"rating": 1, "tags": [], "comment": "x"}),
            ("post", "/api/v1/trips/{id}/adapt", {"adaptation_type": "relax"}),
            ("delete", "/api/v1/trips/{id}/items/{item}", None),
            ("get", "/api/v1/trips/{id}/items/{item}/alternatives", None),
            ("post", "/api/v1/trips/{id}/days/{day}/regenerate", None),
            ("post", "/api/v1/rag/trips/{id}/items/{item}/explanation", None),
        ],
    )
    def test_another_users_trip_is_404_on_every_route(self, client, alice, bob, method, path, body):
        trip_id = _create_trip(client, alice)
        itinerary = client.post(f"/api/v1/trips/{trip_id}/generate", headers=alice["headers"]).json()
        day = itinerary["days"][0] if "days" in itinerary else None
        day_id = day["id"] if day else 1
        item_id = day["items"][0]["id"] if day and day["items"] else 1
        url = path.format(id=trip_id, item=item_id, day=day_id)

        resp = getattr(client, method)(url, headers=bob["headers"], **({"json": body} if body else {}))
        assert resp.status_code == 404, (url, resp.status_code, resp.text)
        # ...and A's trip is untouched
        assert client.get(f"/api/v1/trips/{trip_id}", headers=alice["headers"]).status_code == 200

    def test_user_routes_owner_ok_stranger_404(self, client, alice, bob):
        _create_trip(client, alice)
        assert client.get(f"/api/v1/users/{alice['id']}/trips", headers=alice["headers"]).status_code == 200
        stranger = client.get(f"/api/v1/users/{alice['id']}/trips", headers=bob["headers"])
        missing = client.get(f"/api/v1/users/{uuid.uuid4()}/trips", headers=bob["headers"])
        assert stranger.status_code == missing.status_code == 404
        assert stranger.json() == missing.json()  # doesn't reveal that the account exists


# ---------------------------------------------------------------------------
# Export and deletion
# ---------------------------------------------------------------------------

class TestExportAndDelete:
    def test_export_contains_only_own_data(self, client, alice, bob):
        mine = _create_trip(client, alice)
        theirs = _create_trip(client, bob)
        data = client.get("/api/v1/me/export", headers=alice["headers"]).json()
        assert data["profile"]["username"] == alice["username"]
        ids = [t["id"] for t in data["trips"]]
        assert mine in ids and theirs not in ids

    def test_delete_removes_account_and_trips_and_sign_in(self, client, alice, monkeypatch):
        trip_id = _create_trip(client, alice)
        removed = []
        monkeypatch.setattr(settings, "supabase_service_role_key", "service-key")
        monkeypatch.setattr(me_api, "_delete_auth_identity", removed.append)

        assert client.delete("/api/v1/me", headers=alice["headers"]).status_code == 204
        assert removed == [alice["sub"]]
        with _ApiTestSession() as db:
            assert db.get(Trip, trip_id) is None
            assert db.query(User).filter(User.auth_subject == alice["sub"]).first() is None

    def test_sign_in_removal_failure_is_reported_after_data_is_gone(self, client, alice, monkeypatch):
        trip_id = _create_trip(client, alice)
        monkeypatch.setattr(settings, "supabase_service_role_key", "service-key")

        def fail(_sub):
            raise RuntimeError("supabase down")

        monkeypatch.setattr(me_api, "_delete_auth_identity", fail)
        resp = client.delete("/api/v1/me", headers=alice["headers"])
        assert resp.status_code == 502
        with _ApiTestSession() as db:
            assert db.get(Trip, trip_id) is None

    def test_production_without_service_key_refuses_and_keeps_data(self, client, alice, monkeypatch):
        trip_id = _create_trip(client, alice)
        monkeypatch.setattr(settings, "app_env", "production")
        assert client.delete("/api/v1/me", headers=alice["headers"]).status_code == 503
        with _ApiTestSession() as db:
            assert db.get(Trip, trip_id) is not None


# ---------------------------------------------------------------------------
# Decision D4: trips created before accounts
# ---------------------------------------------------------------------------

class TestPreAccountTrips:
    def _ownerless_trip(self) -> int:
        with _ApiTestSession() as db:
            trip = Trip(destination="Cox's Bazar", start_date=date.today(), end_date=date.today(), total_budget=1000)
            db.add(trip)
            db.commit()
            return trip.id

    def test_first_account_in_development_adopts_them(self):
        trip_id = self._ownerless_trip()
        with _ApiTestSession() as db:
            db.query(User).delete()  # make the next account the first one
            db.commit()
            user = auth.get_or_create_user(db, f"first-{uuid.uuid4()}", None)
            assert db.get(Trip, trip_id).user_id == user.id

    def test_first_real_account_inherits_the_dev_bypass_users_trips(self):
        trip_id = self._ownerless_trip()
        with _ApiTestSession() as db:
            db.query(User).delete()
            db.commit()
            dev = auth.get_or_create_user(db, auth.DEV_BYPASS_SUBJECT, None)
            assert db.get(Trip, trip_id).user_id == dev.id  # the stand-in adopts first
            real = auth.get_or_create_user(db, f"real-{uuid.uuid4()}", "me@example.com")
            db.expire_all()
            assert db.get(Trip, trip_id).user_id == real.id  # then hands over to the real account

    def test_later_accounts_and_production_do_not(self, monkeypatch):
        with _ApiTestSession() as db:
            auth.get_or_create_user(db, f"existing-{uuid.uuid4()}", None)  # not the first account
            trip_id = self._ownerless_trip()
            auth.get_or_create_user(db, f"second-{uuid.uuid4()}", None)
            db.expire_all()
            assert db.get(Trip, trip_id).user_id is None

            monkeypatch.setattr(settings, "app_env", "production")
            db.query(User).delete()
            db.commit()
            auth.get_or_create_user(db, f"prod-first-{uuid.uuid4()}", None)
            db.expire_all()
            assert db.get(Trip, trip_id).user_id is None


# ---------------------------------------------------------------------------
# Rate limits
# ---------------------------------------------------------------------------

def test_username_checks_are_rate_limited(client, alice):
    limiter.enabled = True
    limiter.reset()
    codes = [client.get("/api/v1/usernames/someone_x/available", headers=alice["headers"]).status_code for _ in range(31)]
    assert codes[:30] == [200] * 30
    assert codes[30] == 429

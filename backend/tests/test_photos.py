"""
Android Phase 6: photos. Processing (EXIF and GPS removed, orientation, sizes),
uploads, signed URLs that expire, and the privacy matrix (owner ✓, friend ✓
read-only, stranger / blocked / ex-friend → 404, even with a copied URL).
"""

from __future__ import annotations

import io
import json
import time
import uuid
from datetime import date, timedelta

import httpx
import pytest
from fastapi import Depends
from fastapi.testclient import TestClient
from PIL import ExifTags, Image
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.auth import get_current_user, new_friend_code
from app.core.config import settings
from app.db import get_db
from app.db.geo_seed import seed_geo
from app.main import app
from app.models.models import Photo, User
from app.services.photos import processing
from app.services.photos.processing import PhotoRejected, process_photo
from app.services.photos.storage import StorageError, SupabaseStore
from tests.conftest import TEST_USER_ID, _ApiTestSession

API = "/api/v1"
GPS_MARKERS = (b"GPS", b"Exif", b"23.7", b"xmpmeta", b"secret note")


@pytest.fixture(scope="module", autouse=True)
def geo_data():
    with _ApiTestSession() as db:
        assert seed_geo(db)


@pytest.fixture
def client():
    return TestClient(app)


def _user(name: str) -> User:
    with _ApiTestSession() as db:
        u = User(auth_subject=f"{name}-{uuid.uuid4()}", friend_code=new_friend_code(),
                 username=f"{name}{uuid.uuid4().hex[:6]}", display_name=name.title())
        db.add(u)
        db.commit()
        db.refresh(u)
        return u


@pytest.fixture
def act_as():
    def _as(user: User):
        def current_user(db: Session = Depends(get_db)) -> User:
            return db.get(User, user.id)

        app.dependency_overrides[get_current_user] = current_user
    yield _as


def _befriend(client, act_as, a: User, b: User) -> None:
    act_as(a)
    req = client.post(f"{API}/friend-requests", json={"user_id": str(b.id)}).json()
    act_as(b)
    assert client.post(f"{API}/friend-requests/{req['id']}/accept").json()["status"] == "accepted"


def _jpeg_with_gps(size=(400, 200), orientation: int | None = 6) -> bytes:
    """A JPEG carrying GPS, a capture date, an orientation flag, XMP and a comment."""
    img = Image.new("RGB", size, (200, 30, 30))
    img.paste((30, 30, 200), (0, 0, size[0] // 2, size[1]))  # left half blue: shows the rotation
    exif = Image.Exif()
    exif[ExifTags.Base.Make] = "TestCam"
    if orientation:
        exif[ExifTags.Base.Orientation] = orientation
    exif.get_ifd(ExifTags.IFD.Exif)[ExifTags.Base.DateTimeOriginal] = "2025:12:24 10:30:00"
    exif.get_ifd(ExifTags.IFD.GPSInfo).update({
        ExifTags.GPS.GPSLatitudeRef: "N", ExifTags.GPS.GPSLatitude: (23.0, 42.0, 0.0),
        ExifTags.GPS.GPSLongitudeRef: "E", ExifTags.GPS.GPSLongitude: (90.0, 21.0, 0.0),
    })
    buf = io.BytesIO()
    img.save(buf, "JPEG", exif=exif, comment=b"secret note",
             xmp=b'<x:xmpmeta xmlns:x="adobe:ns:meta/"><exif:GPSLatitude>23.7</exif:GPSLatitude></x:xmpmeta>')
    data = buf.getvalue()
    assert b"GPS" in data and b"xmpmeta" in data  # the fixture really carries them
    return data


def _upload(client, data: bytes | None = None, **fields):
    form = {k: str(v) for k, v in fields.items()}
    return client.post(f"{API}/me/photos", files={"file": ("photo.jpg", data or _jpeg_with_gps(), "image/jpeg")}, data=form)


def _trip(client) -> int:
    start = date.today() + timedelta(days=30)
    return client.post(f"{API}/trips", json={
        "destination": "Cox's Bazar", "start_date": str(start), "end_date": str(start + timedelta(days=1)),
        "num_travelers": 1, "total_budget": 20000, "preference": {"interests": ["Beach"]}, "constraints": {},
    }).json()["id"]


def _no_metadata(data: bytes) -> None:
    for marker in GPS_MARKERS:
        assert marker not in data, marker
    img = Image.open(io.BytesIO(data))
    assert img.format == "JPEG"
    assert not img.getexif()
    assert "xmp" not in img.info and "comment" not in img.info and "icc_profile" not in img.info


# ---------------------------------------------------------------------------
# Processing
# ---------------------------------------------------------------------------

class TestProcessing:
    def test_gps_exif_xmp_and_comments_are_removed(self):
        out = process_photo(_jpeg_with_gps())
        _no_metadata(out.full)
        _no_metadata(out.thumb)

    def test_orientation_is_applied_to_the_pixels_and_the_date_kept(self):
        out = process_photo(_jpeg_with_gps(size=(400, 200), orientation=6))
        assert (out.width, out.height) == (200, 400)  # rotated 90°, flag gone
        img = Image.open(io.BytesIO(out.full)).convert("RGB")
        top, bottom = img.getpixel((100, 20)), img.getpixel((100, 380))
        assert top[2] > top[0] and bottom[0] > bottom[2]  # blue half now on top
        assert out.taken_on == date(2025, 12, 24)

    def test_large_photos_are_resized_with_a_small_thumbnail(self):
        buf = io.BytesIO()
        Image.new("RGB", (4000, 3000), "green").save(buf, "JPEG")
        out = process_photo(buf.getvalue())
        assert (out.width, out.height) == (2048, 1536)
        assert (out.thumb_width, out.thumb_height) == (480, 360)
        assert len(out.thumb) < len(out.full)

    def test_transparent_png_is_flattened_onto_white(self):
        buf = io.BytesIO()
        Image.new("RGBA", (50, 50), (0, 0, 0, 0)).save(buf, "PNG")
        out = process_photo(buf.getvalue())
        assert Image.open(io.BytesIO(out.full)).convert("RGB").getpixel((25, 25)) > (240, 240, 240)

    @pytest.mark.parametrize("data", [b"not an image", b"\xff\xd8\xff\xe0 truncated jpeg", b""])
    def test_garbage_is_rejected(self, data):
        with pytest.raises(PhotoRejected):
            process_photo(data)

    def test_other_formats_are_rejected(self):
        buf = io.BytesIO()
        Image.new("RGB", (10, 10)).save(buf, "GIF")
        with pytest.raises(PhotoRejected, match="JPEG, PNG and WebP"):
            process_photo(buf.getvalue())

    def test_huge_pixel_counts_are_refused_before_decoding(self, monkeypatch):
        monkeypatch.setattr(processing, "MAX_PIXELS", 1000)
        with pytest.raises(PhotoRejected, match="too large"):
            process_photo(_jpeg_with_gps(size=(100, 100)))


# ---------------------------------------------------------------------------
# Uploading and reading your own photos
# ---------------------------------------------------------------------------

class TestOwnPhotos:
    def test_upload_returns_signed_urls_to_clean_files(self, client):
        resp = _upload(client, place_type="country", place_code="BD")
        assert resp.status_code == 201, resp.text
        photo = resp.json()
        assert photo["place_name"] == "Bangladesh" and photo["country_iso2"] == "BD"
        assert photo["taken_on"] == "2025-12-24"
        assert (photo["width"], photo["height"]) == (200, 400)
        for url in (photo["url"], photo["thumb_url"]):
            file = client.get(url)
            assert file.status_code == 200 and file.headers["content-type"] == "image/jpeg"
            _no_metadata(file.content)
        assert str(TEST_USER_ID) not in photo["url"]  # keys aren't tied to the owner

    def test_the_phones_date_wins_but_not_a_future_one(self, client):
        assert _upload(client, place_type="country", place_code="BD", taken_on="2024-03-01").json()["taken_on"] == "2024-03-01"
        future = str(date.today() + timedelta(days=5))
        assert _upload(client, place_type="country", place_code="BD", taken_on=future).json()["taken_on"] == "2025-12-24"

    def test_a_country_lists_the_photos_of_its_regions_and_cities(self, client):
        me = str(TEST_USER_ID)
        ids = {key: _upload(client, place_type=kind, place_code=code).json()["id"]
               for key, kind, code in (("nepal", "country", "NP"), ("dhaka_div", "region", "BD-C"),
                                       ("dhaka", "city", "1185241"), ("chattogram", "city", "1205733"))}
        bd = {p["id"] for p in client.get(f"{API}/users/{me}/photos", params={"place_type": "country", "place_code": "BD"}).json()}
        assert {ids["dhaka_div"], ids["dhaka"], ids["chattogram"]} <= bd and ids["nepal"] not in bd
        dhaka_division = {p["id"] for p in client.get(f"{API}/users/{me}/photos", params={"place_type": "region", "place_code": "BD-C"}).json()}
        assert ids["dhaka_div"] in dhaka_division and ids["dhaka"] in dhaka_division and ids["chattogram"] not in dhaka_division
        city = client.get(f"{API}/users/{me}/photos", params={"place_type": "city", "place_code": "1185241"}).json()
        assert [p["place_name"] for p in city] and {p["place_name"] for p in city} == {"Dhaka"}

    def test_trip_photos(self, client):
        trip_id = _trip(client)
        photo = _upload(client, trip_id=trip_id).json()
        listed = client.get(f"{API}/users/{TEST_USER_ID}/photos", params={"trip_id": trip_id}).json()
        assert [p["id"] for p in listed] == [photo["id"]]

    @pytest.mark.parametrize("fields, status", [
        ({}, 422),  # neither a place nor a trip
        ({"place_type": "country"}, 422),
        ({"place_type": "country", "place_code": "XX"}, 422),
        ({"place_type": "city", "place_code": "dhaka"}, 422),
        ({"place_type": "planet", "place_code": "BD"}, 422),
        ({"trip_id": 999999}, 404),
    ])
    def test_bad_uploads(self, client, fields, status):
        assert _upload(client, **fields).status_code == status

    def test_not_an_image(self, client):
        resp = _upload(client, b"<?php echo 1; ?>", place_type="country", place_code="BD")
        assert resp.status_code == 422 and "isn't a photo" in resp.json()["detail"]

    def test_too_big(self, client, monkeypatch):
        monkeypatch.setattr(settings, "photo_max_upload_mb", 0)
        assert _upload(client, place_type="country", place_code="BD").status_code == 413

    def test_delete_removes_the_files_at_once(self, client, local_photo_store):
        photo = _upload(client, place_type="country", place_code="BD").json()
        assert client.delete(f"{API}/me/photos/{photo['id']}").status_code == 204
        assert client.get(photo["url"]).status_code == 404  # an unexpired URL stops working too
        assert not any(local_photo_store.root.rglob(f"{uuid.UUID(photo['id']).hex}*"))
        assert client.delete(f"{API}/me/photos/{photo['id']}").status_code == 404

    def test_photos_switched_off(self, client, monkeypatch):
        from app.services.photos import storage

        monkeypatch.setattr(storage, "_configured_store", lambda: None)
        assert _upload(client, place_type="country", place_code="BD").status_code == 503


# ---------------------------------------------------------------------------
# Signed URLs
# ---------------------------------------------------------------------------

class TestSignedUrls:
    def test_an_expired_url_fails(self, client, monkeypatch):
        url = _upload(client, place_type="country", place_code="BD").json()["url"]
        assert client.get(url).status_code == 200
        later = time.time() + settings.photo_url_ttl_seconds + 1
        monkeypatch.setattr("app.services.photos.storage.time.time", lambda: later)
        assert client.get(url).status_code == 404

    def test_urls_last_at_most_15_minutes(self, client):
        photo = _upload(client, place_type="country", place_code="BD").json()
        expires = int(httpx.URL(photo["url"]).params["expires"])
        assert expires - time.time() <= 900
        assert settings.photo_url_ttl_seconds <= 900

    def test_a_tampered_url_fails(self, client):
        photo = _upload(client, place_type="country", place_code="BD").json()
        url = httpx.URL(photo["url"])
        later = str(int(url.params["expires"]) + 3600)
        assert client.get(str(url.copy_set_param("expires", later))).status_code == 404
        # The thumbnail's signature doesn't open the full photo
        thumb_sig = httpx.URL(photo["thumb_url"]).params["sig"]
        assert client.get(str(url.copy_set_param("sig", thumb_sig))).status_code == 404
        assert client.get(f"{API}/photo-files/..%2F..%2Fetc/passwd?expires=9999999999&sig=x").status_code == 404

    def test_the_ttl_ceiling_is_enforced_by_settings(self):
        from app.core.config import Settings

        with pytest.raises(ValueError, match="15 minutes"):
            Settings(photo_url_ttl_seconds=3600)
        with pytest.raises(ValueError, match="production"):
            Settings(photo_storage="local", app_env="production")


# ---------------------------------------------------------------------------
# Privacy matrix
# ---------------------------------------------------------------------------

@pytest.fixture
def alice_photo(client, act_as):
    alice = _user("alice")
    act_as(alice)
    photo = _upload(client, place_type="country", place_code="BD").json()
    return alice, photo


class TestPrivacy:
    def _list(self, client, owner: User):
        return client.get(f"{API}/users/{owner.id}/photos")

    def test_a_friend_sees_photos_read_only(self, client, act_as, alice_photo):
        alice, photo = alice_photo
        bob = _user("bob")
        _befriend(client, act_as, alice, bob)
        act_as(bob)
        listed = self._list(client, alice)
        assert listed.status_code == 200 and [p["id"] for p in listed.json()] == [photo["id"]]
        assert client.get(listed.json()[0]["url"]).status_code == 200
        assert client.delete(f"{API}/me/photos/{photo['id']}").status_code == 404  # a friend can't delete
        files = {"file": ("x.jpg", _jpeg_with_gps(), "image/jpeg")}
        assert client.post(f"{API}/users/{alice.id}/photos", files=files).status_code == 405

    def test_strangers_get_404(self, client, act_as, alice_photo):
        alice, _ = alice_photo
        act_as(_user("mallory"))
        assert self._list(client, alice).status_code == 404
        assert client.get(f"{API}/users/{uuid.uuid4()}/photos").status_code == 404  # same as a real user

    def test_after_unfriending_404_and_old_urls_expire(self, client, act_as, alice_photo, monkeypatch):
        alice, _ = alice_photo
        bob = _user("bob")
        _befriend(client, act_as, alice, bob)
        act_as(bob)
        copied = self._list(client, alice).json()[0]["url"]
        assert client.delete(f"{API}/friends/{alice.id}").status_code == 204
        assert self._list(client, alice).status_code == 404
        later = time.time() + settings.photo_url_ttl_seconds + 1
        monkeypatch.setattr("app.services.photos.storage.time.time", lambda: later)
        assert client.get(copied).status_code == 404

    def test_blocked_404(self, client, act_as, alice_photo):
        alice, _ = alice_photo
        bob = _user("bob")
        _befriend(client, act_as, alice, bob)
        act_as(alice)
        assert client.post(f"{API}/blocks", json={"user_id": str(bob.id)}).status_code in (200, 201, 204)
        act_as(bob)
        assert self._list(client, alice).status_code == 404

    def test_you_cannot_attach_a_photo_to_someone_elses_trip(self, client, act_as):
        alice, bob = _user("alice"), _user("bob")
        _befriend(client, act_as, alice, bob)
        act_as(alice)
        trip_id = _trip(client)
        act_as(bob)  # even a friend, who may read the trip
        assert _upload(client, trip_id=trip_id).status_code == 404


# ---------------------------------------------------------------------------
# Trips, export and account deletion
# ---------------------------------------------------------------------------

class TestLifecycle:
    def test_deleting_a_trip_keeps_photos_of_places(self, client, act_as, local_photo_store):
        act_as(_user("carol"))
        trip_id = _trip(client)
        only_trip = _upload(client, trip_id=trip_id).json()
        with_place = _upload(client, trip_id=trip_id, place_type="country", place_code="BD").json()
        assert client.delete(f"{API}/trips/{trip_id}").status_code == 204
        with _ApiTestSession() as db:
            assert db.get(Photo, uuid.UUID(only_trip["id"])) is None
            kept = db.get(Photo, uuid.UUID(with_place["id"]))
            assert kept is not None and kept.trip_id is None
        assert client.get(only_trip["url"]).status_code == 404
        assert client.get(with_place["url"]).status_code == 200

    def test_export_lists_photos(self, client, act_as):
        act_as(_user("dana"))
        photo = _upload(client, place_type="country", place_code="BD").json()
        exported = client.get(f"{API}/me/export").json()
        assert [p["id"] for p in exported["photos"]] == [photo["id"]]
        json.dumps(exported)

    def test_account_deletion_removes_files_first(self, client, act_as, local_photo_store, monkeypatch):
        erin = _user("erin")
        act_as(erin)
        photo = _upload(client, place_type="country", place_code="BD").json()
        monkeypatch.setattr(settings, "supabase_service_role_key", "")

        def failing(keys):
            raise StorageError("bucket down")

        monkeypatch.setattr(local_photo_store, "delete", failing)
        assert client.delete(f"{API}/me").status_code == 502
        with _ApiTestSession() as db:  # nothing was deleted, so the user can retry
            assert db.get(User, erin.id) is not None and db.get(Photo, uuid.UUID(photo["id"])) is not None

        monkeypatch.undo()
        monkeypatch.setattr(settings, "supabase_service_role_key", "")
        assert client.delete(f"{API}/me").status_code == 204
        with _ApiTestSession() as db:
            assert db.get(User, erin.id) is None
            assert db.scalars(select(Photo).where(Photo.user_id == erin.id)).first() is None
        assert client.get(photo["url"]).status_code == 404

    def test_account_deletion_works_where_photos_are_off(self, client, act_as, monkeypatch):
        from app.services.photos import storage

        frank = _user("frank")
        act_as(frank)
        monkeypatch.setattr(storage, "_configured_store", lambda: None)
        monkeypatch.setattr(settings, "supabase_service_role_key", "")
        assert client.delete(f"{API}/me").status_code == 204


# ---------------------------------------------------------------------------
# Supabase Storage client (request shapes, no network)
# ---------------------------------------------------------------------------

class TestSupabaseStore:
    def _store(self, handler) -> SupabaseStore:
        client = httpx.Client(transport=httpx.MockTransport(handler), headers={"apikey": "k", "Authorization": "Bearer k"})
        return SupabaseStore("https://proj.supabase.co", "k", "photos", client=client)

    def test_creates_a_private_bucket_then_uploads(self):
        calls = []

        def handler(req: httpx.Request):
            calls.append((req.method, req.url.path, req.content))
            if req.url.path == "/storage/v1/bucket/photos":
                return httpx.Response(404, json={"error": "not found"})
            return httpx.Response(200, json={})

        self._store(handler).put("ab" * 16 + "/full.jpg", b"jpeg")
        assert calls[1][:2] == ("POST", "/storage/v1/bucket")
        assert json.loads(calls[1][2])["public"] is False
        assert calls[2][:2] == ("POST", f"/storage/v1/object/photos/{'ab' * 16}/full.jpg")

    def test_refuses_a_public_bucket(self):
        store = self._store(lambda req: httpx.Response(200, json={"id": "photos", "public": True}))
        with pytest.raises(StorageError, match="public"):
            store.put("ab" * 16 + "/full.jpg", b"jpeg")

    def test_signs_in_one_call_and_skips_missing_files(self):
        def handler(req: httpx.Request):
            body = json.loads(req.content)
            assert req.url.path == "/storage/v1/object/sign/photos" and body["expiresIn"] == 600
            return httpx.Response(200, json=[
                {"path": "a/full.jpg", "signedURL": "/object/sign/photos/a/full.jpg?token=t", "error": None},
                {"path": "b/full.jpg", "signedURL": None, "error": "Either the object does not exist or you do not have access to it"},
            ])

        urls = self._store(handler).signed_urls(["a/full.jpg", "b/full.jpg"], 600, "")
        assert urls == {"a/full.jpg": "https://proj.supabase.co/storage/v1/object/sign/photos/a/full.jpg?token=t"}

    def test_failures_raise(self):
        store = self._store(lambda req: httpx.Response(500, text="boom"))
        with pytest.raises(StorageError):
            store.signed_urls(["a/full.jpg"], 600, "")
        with pytest.raises(StorageError):
            store.delete(["a/full.jpg"])

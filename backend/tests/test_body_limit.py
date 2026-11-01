"""
The cap on request bodies (app/core/body_limit.py, docs/friends-chat-plan.md step 10):
too big is 413 before the endpoint runs, with or without Content-Length; real requests pass.
"""

from __future__ import annotations

import uuid

import pytest
from fastapi import Depends
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.auth import get_current_user, new_friend_code
from app.core.body_limit import MAX_JSON_BYTES
from app.db import get_db
from app.main import app
from app.models.models import User
from app.services import friends as social
from tests.conftest import _ApiTestSession

API = "/api/v1"


@pytest.fixture
def client():
    return TestClient(app)


def _user(name: str) -> User:
    with _ApiTestSession() as db:
        u = User(auth_subject=f"{name}-{uuid.uuid4()}", friend_code=new_friend_code(), username=f"{name}{uuid.uuid4().hex[:6]}")
        db.add(u)
        db.commit()
        db.refresh(u)
        return u


def _act_as(user: User) -> None:
    def current_user(db: Session = Depends(get_db)) -> User:
        return db.get(User, user.id)

    app.dependency_overrides[get_current_user] = current_user


def _too_much() -> bytes:
    return b'{"client_id": "' + str(uuid.uuid4()).encode() + b'", "body": "' + b"x" * MAX_JSON_BYTES + b'"}'


def test_a_body_over_the_cap_is_refused_before_anything_reads_it(client):
    r = client.post(f"{API}/conversations/1/messages", content=_too_much(), headers={"content-type": "application/json"})
    assert r.status_code == 413 and r.json()["detail"] == "This request is too large"


def test_a_body_without_content_length_is_cut_off_at_the_cap(client):
    def chunks():
        body = _too_much()
        for i in range(0, len(body), 64 * 1024):
            yield body[i:i + 64 * 1024]

    r = client.post(f"{API}/conversations/1/messages", content=chunks(), headers={"content-type": "application/json"})
    assert r.status_code == 413


def test_a_photo_upload_has_its_own_larger_cap(client):
    body = b"--b\r\nContent-Disposition: form-data; name=\"file\"; filename=\"x.jpg\"\r\n\r\n" + b"x" * (2 * MAX_JSON_BYTES) + b"\r\n--b--\r\n"
    r = client.post(f"{API}/me/photos", content=body, headers={"content-type": "multipart/form-data; boundary=b"})
    assert r.status_code != 413  # 2 MB is fine for a photo (it fails later for other reasons)


def test_real_messages_still_go_through(client):
    a, b = _user("capa"), _user("capb")
    with _ApiTestSession() as db:
        social.befriend(db, a.id, b.id)
        db.commit()
    _act_as(a)
    try:
        chat_id = client.post(f"{API}/conversations/direct", json={"user_id": str(b.id)}).json()["id"]
        r = client.post(f"{API}/conversations/{chat_id}/messages", json={"client_id": str(uuid.uuid4()), "body": "x" * 2000})
        assert r.status_code == 201
    finally:
        app.dependency_overrides.pop(get_current_user, None)

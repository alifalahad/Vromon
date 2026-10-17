"""
Vromon Backend — push notifications through the Expo Push API.

Recipients and their preferences are read in the request; the send happens
after the response (FastAPI background tasks), so a slow or failing push service
never delays or breaks a friend request. Tokens Expo reports as
`DeviceNotRegistered` (app uninstalled, sign-in moved) are removed.
"""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass

import httpx
from fastapi import BackgroundTasks
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.base import SessionLocal
from app.models.models import Device, UserSettings

logger = logging.getLogger("vromon.push")

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"
CHANNEL = "friends"  # Android channel, created by the app


@dataclass(frozen=True)
class Push:
    title: str
    body: str
    # Opens this path in the app when tapped, e.g. "/friends"
    url: str
    # UserSettings flag that must be on, e.g. "notify_friend_requests"
    preference: str


def _send(messages: list[dict]) -> list[dict]:
    headers = {"Accept": "application/json", "Content-Type": "application/json"}
    if settings.expo_access_token:
        headers["Authorization"] = f"Bearer {settings.expo_access_token}"
    resp = httpx.post(EXPO_PUSH_URL, json=messages, headers=headers, timeout=10)
    resp.raise_for_status()
    return resp.json().get("data", [])


def queue_push(background: BackgroundTasks, db: Session, user_id: uuid.UUID, push: Push) -> None:
    """Notify every device of `user_id` after the response, if they allow this kind of notification."""
    if not settings.push_enabled:
        return
    prefs = db.get(UserSettings, user_id)
    if prefs is not None and not getattr(prefs, push.preference):
        return
    tokens = list(db.scalars(select(Device.expo_push_token).where(Device.user_id == user_id)).all())
    if tokens:
        background.add_task(deliver, tokens, push)


def deliver(tokens: list[str], push: Push) -> None:
    """Send to the Expo Push API and forget tokens that no longer exist. Never raises."""
    messages = [
        {"to": t, "title": push.title, "body": push.body, "data": {"url": push.url}, "channelId": CHANNEL, "sound": "default"}
        for t in tokens
    ]
    try:
        tickets = _send(messages)
    except Exception as exc:  # a push is best effort
        logger.warning("Push failed: %s", exc)
        return
    gone = [
        t for t, ticket in zip(tokens, tickets)
        if ticket.get("status") == "error" and (ticket.get("details") or {}).get("error") == "DeviceNotRegistered"
    ]
    if gone:
        with SessionLocal() as db:
            db.execute(delete(Device).where(Device.expo_push_token.in_(gone)))
            db.commit()

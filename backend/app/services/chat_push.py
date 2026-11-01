"""
Vromon Backend — push for chats and trip rooms (docs/friends-chat-plan.md, step 9).

Who gets one: everyone else in the chat who can see it, unless they muted it, blocked
the sender, or turned that kind off in Chats and privacy (messages for direct chats,
trip rooms for rooms and room invites). With message previews off, a notification says
only who wrote. One notification per chat: a new one replaces the last (Android `tag`).

What sends one: a new message (text or a card, a check-in, running late, a live location
starting), a trip-room invite, and a suggestion of yours added to the plan. Reactions,
answers, live location points and lines from Vromon don't.

The text is in the recipient's language (English unless they chose Bangla). Tapping
opens the chat ("/chat/<id>", which the app checks before opening).
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from fastapi import BackgroundTasks
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.models import Block, Conversation, ConversationMember, Message, Trip, User, UserSettings
from app.services import chat
from app.services.push import MESSAGES_CHANNEL, Push, queue_push

PREVIEW_LENGTH = 120

TEXT = {
    "en": {
        "new": "New message",
        "room_update": "New in the trip room",
        "trip": "Shared a trip: {x}",
        "place": "Shared a place: {x}",
        "suggested": "Suggested {x} for the plan",
        "idea": "Trip idea: {x}",
        "poll": "Poll: {x}",
        "invite": "Invited you to plan the {x} trip together",
        "checkin_stop": "I'm here: {x}",
        "checkin": "Checked in",
        "late": "Running about {n} min late",
        "late_stop": "Running about {n} min late for {x}",
        "live": "Is sharing their live location",
        "added": "{actor} added {x} to Day {n}",
        "room": "{x} trip",
    },
    "bn": {
        "new": "নতুন মেসেজ",
        "room_update": "ট্রিপ রুমে নতুন কিছু",
        "trip": "একটি ভ্রমণ শেয়ার করেছেন: {x}",
        "place": "একটি জায়গা শেয়ার করেছেন: {x}",
        "suggested": "পরিকল্পনার জন্য {x} প্রস্তাব করেছেন",
        "idea": "ভ্রমণের ভাবনা: {x}",
        "poll": "পোল: {x}",
        "invite": "{x} ভ্রমণ একসাথে পরিকল্পনা করতে আমন্ত্রণ জানিয়েছেন",
        "checkin_stop": "আমি এখানে: {x}",
        "checkin": "চেক-ইন করেছেন",
        "late": "প্রায় {n} মিনিট দেরি হচ্ছে",
        "late_stop": "{x}-এর জন্য প্রায় {n} মিনিট দেরি হচ্ছে",
        "live": "লাইভ লোকেশন শেয়ার করছেন",
        "added": "{actor} {x} দিন {n}-এ যোগ করেছেন",
        "room": "{x} ভ্রমণ",
    },
}


def _name(user: Optional[User]) -> str:
    return (user.display_name or user.username or "") if user is not None else ""


def _settings(db: Session, user_id: uuid.UUID) -> UserSettings:
    # No row yet: every switch on, previews on, English
    return db.get(UserSettings, user_id) or UserSettings(
        user_id=user_id, notify_messages=True, notify_trip_rooms=True, notification_previews=True, language=None,
    )


def _say(lang: Optional[str], key: str, **kw) -> str:
    return TEXT["bn" if lang == "bn" else "en"][key].format(**kw)


def preview(message: Message, lang: Optional[str], in_room: bool) -> str:
    """The notification's text with previews on: the message, or what a card is."""
    p = message.payload or {}
    kind = message.kind
    if kind == "text":
        body = " ".join((message.body or "").split())
        return body if len(body) <= PREVIEW_LENGTH else body[: PREVIEW_LENGTH - 1] + "…"
    if kind == "trip":
        return _say(lang, "trip", x=p.get("destination", ""))
    if kind == "place":
        name = p.get("name", "")
        return _say(lang, "suggested" if in_room and p.get("type") == "attraction" else "place", x=name)
    if kind == "idea":
        return _say(lang, "idea", x=p.get("destination", ""))
    if kind == "poll":
        return _say(lang, "poll", x=p.get("question", ""))
    if kind == "invite":
        return _say(lang, "invite", x=p.get("destination", ""))
    if kind == "checkin":
        where = p.get("stop") or p.get("near")
        return _say(lang, "checkin_stop", x=where) if where else _say(lang, "checkin")
    if kind == "late":
        return _say(lang, "late_stop", n=p.get("minutes"), x=p["stop"]) if p.get("stop") else _say(lang, "late", n=p.get("minutes"))
    if kind == "live":
        return _say(lang, "live")
    return _say(lang, "new")


def _room_name(trip: Trip, lang: Optional[str]) -> str:
    return trip.title or _say(lang, "room", x=trip.destination)


def _muted(member: Optional[ConversationMember], now: datetime) -> bool:
    return member is not None and member.muted_until is not None and member.muted_until > now


def _recipients(db: Session, conversation: Conversation, sender_id: Optional[uuid.UUID]) -> list[uuid.UUID]:
    """Everyone else who can see the chat now, hasn't muted it, and hasn't blocked the sender."""
    now = datetime.utcnow()
    out = []
    for member in db.scalars(select(ConversationMember).where(ConversationMember.conversation_id == conversation.id)):
        uid = member.user_id
        if uid == sender_id or _muted(member, now):
            continue
        user = db.get(User, uid)
        if user is None or chat.seat(db, conversation.id, user) is None:
            continue
        if sender_id is not None and db.get(Block, (uid, sender_id)) is not None:
            continue
        out.append(uid)
    return out


def notify_message(background: BackgroundTasks, db: Session, message: Message) -> None:
    """A new message: a notification for everyone else in the chat who wants one."""
    if message.kind == "system" or message.sender_id is None or message.deleted_at is not None:
        return
    conversation = db.get(Conversation, message.conversation_id)
    sender = db.get(User, message.sender_id)
    trip = db.get(Trip, conversation.trip_id) if conversation.kind == "trip" else None
    # Trip rooms, and invites to one, follow the "Trip rooms" switch; the rest "Messages"
    preference = "notify_trip_rooms" if trip is not None or message.kind == "invite" else "notify_messages"
    for uid in _recipients(db, conversation, message.sender_id):
        prefs = _settings(db, uid)
        lang = prefs.language
        if trip is not None:
            title = f"{_name(sender)} · {_room_name(trip, lang)}"
        else:
            title = _name(sender)
        body = preview(message, lang, trip is not None) if prefs.notification_previews else _say(lang, "new")
        queue_push(background, db, uid, Push(
            title=title, body=body, url=f"/chat/{conversation.id}", preference=preference,
            channel=MESSAGES_CHANNEL, tag=f"chat-{conversation.id}",
        ))


def notify_added(background: BackgroundTasks, db: Session, suggestion: Message, owner: User, trip: Trip, place: str, day: int) -> None:
    """Your suggestion went into the plan: tell whoever suggested it (not the owner adding their own)."""
    uid = suggestion.sender_id
    if uid is None or uid == owner.id:
        return
    conversation = db.get(Conversation, suggestion.conversation_id)
    member = db.get(ConversationMember, (conversation.id, uid))
    if member is None or _muted(member, datetime.utcnow()):
        return
    prefs = _settings(db, uid)
    lang = prefs.language
    body = _say(lang, "added", actor=_name(owner), x=place, n=day) if prefs.notification_previews else _say(lang, "room_update")
    queue_push(background, db, uid, Push(
        title=_room_name(trip, lang), body=body, url=f"/chat/{conversation.id}", preference="notify_trip_rooms",
        channel=MESSAGES_CHANNEL, tag=f"chat-{conversation.id}",
    ))

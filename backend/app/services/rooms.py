"""
Vromon Backend — trip rooms (docs/friends-chat-plan.md, step 7): planning a trip together.

- A trip's room is its `trip` conversation, made the first time the owner invites someone.
  The owner is in it from the start; an invited friend is in it once they join.
- Joined members read the trip and its plan, and suggest places; only the owner changes
  the plan (decision C1), including adding a suggested place to a day.
- Whoever leaves, or is removed, loses the room and the trip at once (404, like a stranger).
- The room's history says what happened in lines from Vromon ("Ana invited Rafi",
  "Ana added Madhabpur Lake to Day 2"); each line keeps the names as they were.

SQLite doesn't enforce ON DELETE, so a deleted trip's room is deleted here.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import delete, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.models.models import (
    Conversation, ConversationMember, Itinerary, LiveLocation, Message, MessageReaction, MessageReport, PollVote, Trip, TripMember,
    TripSuggestion, User,
)
from app.services import chat
from app.services.on_the_road import shares_trips
from app.services.privacy import viewer_can_see


def _name(user: Optional[User]) -> str:
    if user is None:
        return ""
    return user.display_name or user.username or ""


def person(user: Optional[User]) -> Optional[dict]:
    """A user as a system line keeps them: their id and their name at the time."""
    return {"id": str(user.id), "name": _name(user)} if user is not None else None


def membership(db: Session, trip_id: int, user_id: uuid.UUID) -> Optional[TripMember]:
    return db.get(TripMember, (trip_id, user_id))


def is_joined(db: Session, trip_id: int, user_id: uuid.UUID) -> bool:
    m = membership(db, trip_id, user_id)
    return m is not None and m.status == "joined"


def can_read_trip(db: Session, viewer: User, trip: Trip) -> bool:
    """
    The owner, the trip room's joined members, and the owner's friends: all of the owner's
    trips while they show their trips to friends, otherwise only one the owner sent them
    in a chat (decision C7). Trip ids are counted up, so a hidden trip must not open by its id.
    """
    if trip.user_id is None:
        return False
    if trip.user_id == viewer.id or is_joined(db, trip.id, viewer.id):
        return True
    owner = db.get(User, trip.user_id)
    if owner is None or not viewer_can_see(db, viewer, owner):
        return False
    return shares_trips(db, owner.id) or sent_to(db, trip, viewer.id)


def sent_to(db: Session, trip: Trip, viewer_id: uuid.UUID) -> bool:
    """The owner sent this trip (a trip card or an invite) in a chat the viewer is in, and hasn't unsent it."""
    theirs = select(ConversationMember.conversation_id).where(ConversationMember.user_id == viewer_id)
    payloads = db.scalars(
        select(Message.payload).where(
            Message.conversation_id.in_(theirs), Message.sender_id == trip.user_id,
            Message.kind.in_(("trip", "invite")), Message.deleted_at.is_(None),
        )
    )
    return any((p or {}).get("trip_id") == trip.id for p in payloads)


def room_of(db: Session, trip_id: int) -> Optional[Conversation]:
    return db.scalar(select(Conversation).where(Conversation.trip_id == trip_id))


def ensure_room(db: Session, trip: Trip) -> Conversation:
    """The trip's room, made (with the owner in it) the first time it's needed. Flushes."""
    room = room_of(db, trip.id)
    if room is not None:
        return room
    room = Conversation(kind="trip", trip_id=trip.id)
    try:
        with db.begin_nested():
            db.add(room)
            db.flush()
            db.add(ConversationMember(conversation_id=room.id, user_id=trip.user_id, role="owner"))
            db.flush()
    except IntegrityError:  # made at the same moment by another request
        room = room_of(db, trip.id)
        if room is None:
            raise
    return room


def system_line(db: Session, room: Conversation, event: str, actor: Optional[User], target: Optional[User] = None, **data) -> Message:
    """A line from Vromon in the room. Doesn't commit."""
    payload = {"actor": person(actor), **({"target": person(target)} if target is not None else {}), **data}
    return chat.post_system_message(db, room, event, payload)


def join(db: Session, trip: Trip, user: User) -> Conversation:
    """An invited friend joins the room. Doesn't commit."""
    m = membership(db, trip.id, user.id)
    m.status = "joined"
    m.joined_at = datetime.utcnow()
    room = ensure_room(db, trip)
    if db.get(ConversationMember, (room.id, user.id)) is None:
        db.add(ConversationMember(conversation_id=room.id, user_id=user.id, role="member"))
    return room


def drop(db: Session, trip: Trip, user_id: uuid.UUID) -> bool:
    """Out of the trip and its room (left, removed, or the invite taken back). Doesn't commit."""
    m = membership(db, trip.id, user_id)
    if m is None:
        return False
    db.delete(m)
    room = room_of(db, trip.id)
    if room is not None:
        db.execute(delete(ConversationMember).where(ConversationMember.conversation_id == room.id, ConversationMember.user_id == user_id))
        # Their live location goes with them (step 8)
        db.execute(delete(LiveLocation).where(LiveLocation.conversation_id == room.id, LiveLocation.user_id == user_id))
    return True


def joined_ids(db: Session, trip_id: int) -> list[uuid.UUID]:
    return list(db.scalars(select(TripMember.user_id).where(TripMember.trip_id == trip_id, TripMember.status == "joined")))


def room_audience(db: Session, trip: Trip) -> list[uuid.UUID]:
    """The owner and the joined members."""
    return [trip.user_id, *joined_ids(db, trip.id)]


def delete_room(db: Session, trip_id: int) -> list[uuid.UUID]:
    """Everything about a trip's room, before the trip is deleted. Returns who was in it."""
    members = list(db.scalars(select(TripMember.user_id).where(TripMember.trip_id == trip_id)))
    db.execute(delete(TripSuggestion).where(TripSuggestion.trip_id == trip_id))
    db.execute(delete(TripMember).where(TripMember.trip_id == trip_id))
    room = room_of(db, trip_id)
    if room is None:
        return members
    in_room = list(db.scalars(select(ConversationMember.user_id).where(ConversationMember.conversation_id == room.id)))
    db.execute(delete(LiveLocation).where(LiveLocation.conversation_id == room.id))
    ids = select(Message.id).where(Message.conversation_id == room.id).scalar_subquery()
    db.execute(delete(MessageReaction).where(MessageReaction.message_id.in_(ids)))
    db.execute(delete(PollVote).where(PollVote.message_id.in_(ids)))
    db.execute(update(MessageReport).where(MessageReport.conversation_id == room.id).values(conversation_id=None, message_id=None))
    db.execute(update(Message).where(Message.reply_to_id.in_(ids)).values(reply_to_id=None))
    db.execute(delete(Message).where(Message.conversation_id == room.id))
    db.execute(delete(ConversationMember).where(ConversationMember.conversation_id == room.id))
    db.delete(room)
    return list({*members, *in_room})


def delete_user_rooms(db: Session, user_id: uuid.UUID) -> None:
    """Account deletion: their memberships and the rooms of the trips they own."""
    for trip_id in db.scalars(select(Trip.id).where(Trip.user_id == user_id)).all():
        delete_room(db, trip_id)
    db.execute(delete(TripMember).where(TripMember.user_id == user_id))


def room_trip(db: Session, trip: Trip) -> dict:
    """The trip as its room shows it: dates, how many stops, and the first ones by day."""
    days = db.scalars(
        select(Itinerary).where(Itinerary.trip_id == trip.id).options(selectinload(Itinerary.items)).order_by(Itinerary.day_number)
    ).all()
    stops, preview = 0, []
    for day in days:
        names = [i.title for i in sorted(day.items, key=lambda i: i.order_index) if i.item_type == "activity"]
        stops += len(names)
        if names and len(preview) < 3:
            preview.append({"day": day.day_number, "places": names[:2]})
    return {
        "id": trip.id, "title": trip.title, "destination": trip.destination, "start_date": trip.start_date,
        "end_date": trip.end_date, "owner_id": trip.user_id, "stops": stops,
        "preview": preview,
    }


def room_people(db: Session, trip: Trip) -> list[User]:
    """The owner, then the joined members in the order they joined."""
    owner = db.get(User, trip.user_id)
    joined = db.scalars(
        select(User).join(TripMember, TripMember.user_id == User.id)
        .where(TripMember.trip_id == trip.id, TripMember.status == "joined").order_by(TripMember.joined_at)
    ).all()
    return [u for u in (owner, *joined) if u is not None]

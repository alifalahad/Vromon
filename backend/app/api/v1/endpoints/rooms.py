"""
Vromon API v1 — trip rooms: planning a trip together (docs/friends-chat-plan.md, step 7).

GET/POST /trips/{id}/members · POST /trips/{id}/members/me/join ·
DELETE /trips/{id}/members/{user_id} · POST /trips/{id}/suggestions/{message_id}/accept|decline ·
GET /me/trips/joined · POST/PUT/DELETE /conversations/{id}/live (step 8)

- Only the owner invites, and only their own friends. Each invite is a card in the
  owner's direct chat with that friend; joining puts them in the trip's room.
- Members read the trip and suggest places; only the owner changes the plan (decision C1),
  so only the owner adds a suggestion to a day or says "not this time".
- Anyone who isn't in the room (a stranger, an ex-member) gets 404 here, as in chat.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import List, Literal, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.api.v1.endpoints.chat import _sender
from app.api.v1.endpoints.friends import _public
from app.api.v1.endpoints.trips import _hotel, _load_trip, _trip_summary_out
from app.core.auth import get_current_user
from app.core.rate_limit import CHAT_VOTE_LIMIT, LIVE_POINT_LIMIT, ROOM_INVITE_LIMIT, limiter, user_or_ip
from app.db import get_db
from app.models.models import Conversation, LiveLocation, Message, Place, Trip, TripMember, TripSuggestion, User
from app.schemas.chat import MAX_TEXT, LivePointIn, LiveStartIn, MessageOut, clean_text
from app.schemas.friends import PublicProfile
from app.schemas.schemas import TripSummaryOut
from app.services import cards, chat, chat_push, live, ontrip, rooms
from app.services import friends as social
from app.services.itinerary import editing_service as edits
from app.services.itinerary.editing_service import EditError

router = APIRouter(tags=["trip rooms"])

NOT_FOUND = HTTPException(status_code=404, detail="Not found")
MAX_INVITES = 20


class InviteIn(BaseModel):
    user_ids: List[uuid.UUID] = Field(min_length=1, max_length=MAX_INVITES)
    # Sent after the invite card, in each friend's chat (cleaned as a message is)
    note: Optional[str] = Field(None, max_length=MAX_TEXT)

    @field_validator("note")
    @classmethod
    def _clean(cls, v: Optional[str]) -> Optional[str]:
        return clean_text(v or "") or None


class MemberOut(BaseModel):
    user: PublicProfile
    status: Literal["owner", "invited", "joined"]


class RoomOut(BaseModel):
    trip_id: int
    # Null until someone is invited
    conversation_id: Optional[int] = None
    members: List[MemberOut]


class AcceptIn(BaseModel):
    day: int = Field(ge=1)


def _trip(db: Session, trip_id: int) -> Trip:
    trip = db.get(Trip, trip_id)
    if trip is None or trip.user_id is None:
        raise NOT_FOUND
    return trip


def _room_out(db: Session, trip: Trip) -> RoomOut:
    room = rooms.room_of(db, trip.id)
    owner = db.get(User, trip.user_id)
    rows = db.execute(
        select(TripMember, User).join(User, User.id == TripMember.user_id).where(TripMember.trip_id == trip.id).order_by(TripMember.created_at)
    ).all()
    return RoomOut(
        trip_id=trip.id,
        conversation_id=room.id if room is not None else None,
        members=[MemberOut(user=_public(owner), status="owner"), *(MemberOut(user=_public(u), status=m.status) for m, u in rows)],
    )


def _invite_cards(db: Session, trip: Trip, owner_id: uuid.UUID, user_id: uuid.UUID) -> list[Message]:
    """The invite cards for this trip in the owner's chat with someone."""
    direct = db.scalar(select(Conversation).where(Conversation.direct_key == chat.direct_key(owner_id, user_id)))
    if direct is None:
        return []
    found = db.scalars(select(Message).where(Message.conversation_id == direct.id, Message.kind == "invite")).all()
    return [m for m in found if (m.payload or {}).get("trip_id") == trip.id]


# ---------------------------------------------------------------------------
# Members
# ---------------------------------------------------------------------------

@router.get("/trips/{trip_id}/members", response_model=RoomOut)
def list_members(trip_id: int, viewer: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Who's in the trip room and who's invited: for the owner and joined members."""
    trip = _trip(db, trip_id)
    if trip.user_id != viewer.id and not rooms.is_joined(db, trip.id, viewer.id):
        raise NOT_FOUND
    return _room_out(db, trip)


@router.post("/trips/{trip_id}/members", response_model=RoomOut)
@limiter.limit(ROOM_INVITE_LIMIT, key_func=user_or_ip)
def invite(
    request: Request, background: BackgroundTasks, trip_id: int, payload: InviteIn, viewer: User = Depends(_sender), db: Session = Depends(get_db),
):
    """
    The owner invites friends to plan together: an invite card (and the note) in each
    friend's chat, and a line in the room. Someone already invited or in the room is
    left as they are. Anyone who isn't the owner's friend: 403, and nobody is invited.
    """
    trip = _load_trip(db, trip_id, viewer)  # the owner's own trip, or 404
    people = []
    for uid in dict.fromkeys(payload.user_ids):
        friend = db.get(User, uid)
        if (
            friend is None or friend.id == viewer.id
            or social.friendship(db, viewer.id, friend.id) is None or social.blocked_either_way(db, viewer.id, friend.id)
        ):
            raise HTTPException(status_code=403, detail="You can only invite your friends")
        people.append(friend)
    room = rooms.ensure_room(db, trip)
    snapshot = cards.trip_payload(db, trip, viewer)
    invited, sent = [], []
    for friend in people:
        if rooms.membership(db, trip.id, friend.id) is not None:
            continue
        db.add(TripMember(trip_id=trip.id, user_id=friend.id, status="invited", invited_by=viewer.id))
        direct = chat.open_direct(db, viewer.id, friend.id)
        card = Message(conversation_id=direct.id, sender_id=viewer.id, kind="invite", payload=snapshot)
        db.add(card)
        sent.append(card)
        if payload.note:
            note = Message(conversation_id=direct.id, sender_id=viewer.id, kind="text", body=payload.note)
            db.add(note)
            sent.append(note)
        invited.append(friend)
    line = rooms.system_line(db, room, "invited", viewer, targets=[rooms.person(u) for u in invited]) if invited else None
    db.commit()
    for message in [*sent, *([line] if line is not None else [])]:
        db.refresh(message)
        live.message_created(db, message)
        if message.kind == "invite":
            chat_push.notify_message(background, db, message)  # one per friend; the note shares its notification
    return _room_out(db, trip)


@router.post("/trips/{trip_id}/members/me/join", response_model=RoomOut)
def join(trip_id: int, viewer: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Join a trip room you were invited to. Joining again changes nothing."""
    trip = _trip(db, trip_id)
    m = rooms.membership(db, trip.id, viewer.id)
    owner = db.get(User, trip.user_id)
    # The invite lapses if you're no longer friends with the owner
    if m is None or owner is None or social.friendship(db, viewer.id, owner.id) is None or social.blocked_either_way(db, viewer.id, owner.id):
        raise NOT_FOUND
    if m.status == "joined":
        return _room_out(db, trip)
    room = rooms.join(db, trip, viewer)
    line = rooms.system_line(db, room, "joined", viewer)
    db.commit()
    db.refresh(line)
    live.message_created(db, line)
    live.conversation_updated([viewer.id], room.id)
    for card in _invite_cards(db, trip, owner.id, viewer.id):
        live.message_updated(db, card)  # the card now opens the room
    return _room_out(db, trip)


@router.delete("/trips/{trip_id}/members/{user_id}", status_code=204)
def remove(trip_id: int, user_id: uuid.UUID, viewer: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """
    Leave (your own id, also to turn an invite down), or, for the owner, remove someone
    or take an invite back. They lose the room and the trip at once.
    """
    trip = _trip(db, trip_id)
    is_owner = trip.user_id == viewer.id
    if user_id != viewer.id and not is_owner:
        # A member can't remove others; a stranger learns nothing
        if rooms.is_joined(db, trip.id, viewer.id):
            raise HTTPException(status_code=403, detail="Only the trip's owner can remove people")
        raise NOT_FOUND
    if is_owner and user_id == viewer.id:
        raise HTTPException(status_code=422, detail="The owner can't leave their own trip")
    m = rooms.membership(db, trip.id, user_id)
    if m is None:
        raise NOT_FOUND
    was_joined = m.status == "joined"
    target = db.get(User, user_id)
    room = rooms.room_of(db, trip.id)
    rooms.drop(db, trip, user_id)
    line = None
    if was_joined and room is not None:
        line = rooms.system_line(db, room, "left", target) if user_id == viewer.id else rooms.system_line(db, room, "removed", viewer, target)
    db.commit()
    if line is not None:
        db.refresh(line)
        live.message_created(db, line)
    if room is not None:
        live.conversation_updated([user_id], room.id)  # gone for them
    for card in _invite_cards(db, trip, trip.user_id, user_id):
        live.message_updated(db, card)
    return Response(status_code=204)


@router.get("/me/trips/joined", response_model=List[TripSummaryOut])
def joined_trips(viewer: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Friends' trips you joined ("With friends" in the Trips tab), soonest first."""
    trips = db.scalars(
        select(Trip).join(TripMember, TripMember.trip_id == Trip.id)
        .where(TripMember.user_id == viewer.id, TripMember.status == "joined")
        .options(selectinload(Trip.stops)).order_by(Trip.start_date)
    ).all()
    return [_trip_summary_out(t) for t in trips]


# ---------------------------------------------------------------------------
# Suggestions
# ---------------------------------------------------------------------------

def _suggestion(db: Session, trip_id: int, message_id: int, viewer: User) -> tuple[Trip, Message]:
    """The owner's trip and a place suggested in its room, not yet decided."""
    trip = _trip(db, trip_id)
    if trip.user_id != viewer.id:
        # Members suggest; only the owner changes the plan (C1). Strangers get 404
        if rooms.is_joined(db, trip.id, viewer.id):
            raise HTTPException(status_code=403, detail="Only the trip's owner adds places to the plan")
        raise NOT_FOUND
    room = rooms.room_of(db, trip.id)
    message = db.get(Message, message_id)
    if room is None or message is None or message.conversation_id != room.id:
        raise NOT_FOUND
    if not cards.suggestable(message):
        raise HTTPException(status_code=422, detail="Only a place from the catalogue can go into the plan")
    if db.get(TripSuggestion, message.id) is not None:
        raise HTTPException(status_code=409, detail="This suggestion was already decided")
    return trip, message


@router.post("/trips/{trip_id}/suggestions/{message_id}/accept", response_model=MessageOut)
@limiter.limit(CHAT_VOTE_LIMIT, key_func=user_or_ip)
def accept(
    request: Request,
    background: BackgroundTasks,
    trip_id: int,
    message_id: int,
    payload: AcceptIn,
    viewer: User = Depends(_sender),
    db: Session = Depends(get_db),
):
    """The owner adds a suggested place to a day of the plan (as adding a stop does), and the room is told."""
    _, message = _suggestion(db, trip_id, message_id, viewer)
    trip = _load_trip(db, trip_id, viewer)
    day = next((d for d in trip.itinerary_days if d.day_number == payload.day), None)
    if day is None:
        if not trip.itinerary_days:
            raise HTTPException(status_code=409, detail="Build the plan first, then add places to its days")
        raise HTTPException(status_code=422, detail="This trip has no such day")
    place = db.get(Place, (message.payload or {}).get("id"))
    if place is None or not place.is_active:
        raise HTTPException(status_code=404, detail="Place not found")
    try:
        item, _ = edits.add_place(db, trip, day, place, None, _hotel(db, trip))
    except EditError as exc:
        db.rollback()
        raise HTTPException(status_code=exc.status, detail=exc.message)
    db.flush()
    db.add(TripSuggestion(message_id=message.id, trip_id=trip.id, status="added", day_number=day.day_number, item_id=item.id))
    line = rooms.system_line(db, rooms.room_of(db, trip.id), "added", viewer, place=place.name, day=day.day_number)
    db.commit()
    db.refresh(line)
    live.message_updated(db, message)
    live.message_created(db, line)
    chat_push.notify_added(background, db, message, viewer, trip, place.name, day.day_number)
    return cards.render(db, [message], viewer.id)[0]


@router.post("/trips/{trip_id}/suggestions/{message_id}/decline", response_model=MessageOut)
@limiter.limit(CHAT_VOTE_LIMIT, key_func=user_or_ip)
def decline(request: Request, trip_id: int, message_id: int, viewer: User = Depends(_sender), db: Session = Depends(get_db)):
    """The owner says "not this time": the card says so, and the plan doesn't change."""
    trip, message = _suggestion(db, trip_id, message_id, viewer)
    db.add(TripSuggestion(message_id=message.id, trip_id=trip.id, status="declined"))
    db.commit()
    live.message_updated(db, message)
    return cards.render(db, [message], viewer.id)[0]


# ---------------------------------------------------------------------------
# Live location (step 8, decision C4)
# ---------------------------------------------------------------------------

def _room_seat(db: Session, conversation_id: int, viewer: User) -> tuple[chat.Seat, Trip]:
    s = chat.seat(db, conversation_id, viewer)
    if s is None:
        raise NOT_FOUND
    trip = db.get(Trip, s.conversation.trip_id) if s.conversation.kind == "trip" else None
    if trip is None:
        raise HTTPException(status_code=422, detail="Live location is only for trip rooms")
    return s, trip


def _on_trip(trip: Trip, day) -> None:
    try:
        ontrip.require_trip_day(trip, day)
    except ontrip.OnTripError as exc:
        raise HTTPException(status_code=exc.status, detail=exc.detail) from None


def _naive_utc(value: datetime) -> datetime:
    return value.astimezone(timezone.utc).replace(tzinfo=None) if value.tzinfo else value


def _sent_with(db: Session, viewer: User, client_id: str) -> Optional[Message]:
    return db.scalar(select(Message).where(Message.sender_id == viewer.id, Message.client_id == client_id))


@router.post("/conversations/{conversation_id}/live", response_model=MessageOut, status_code=201)
@limiter.limit(CHAT_VOTE_LIMIT, key_func=user_or_ip)
def start_live(
    request: Request,
    response: Response,
    background: BackgroundTasks,
    conversation_id: int,
    payload: LiveStartIn,
    viewer: User = Depends(_sender),
    db: Session = Depends(get_db),
):
    """
    Start sharing your live location with the room until a set time (at most a day),
    only on the trip's days. Starting again replaces the last share: its card says it ended.
    A retry with the same client_id returns the first card (200), as sending a message does.
    """
    live.purge_expired_live(db)
    s, trip = _room_seat(db, conversation_id, viewer)
    client_id = str(payload.client_id)
    retried = _sent_with(db, viewer, client_id)
    if retried is not None:
        if retried.conversation_id != conversation_id or retried.kind != "live":
            raise HTTPException(status_code=409, detail="That client_id was already used for another message")
        response.status_code = 200
        return cards.render(db, [retried], viewer.id)[0]
    _on_trip(trip, payload.date)
    now = datetime.utcnow()
    until = _naive_utc(payload.until)
    if until <= now or until - now > ontrip.LIVE_MAX:
        raise HTTPException(status_code=422, detail="Share for up to a day from now")
    earlier = ontrip.stop_sharing(db, conversation_id, viewer.id)
    card = Message(
        conversation_id=conversation_id, sender_id=viewer.id, client_id=client_id, kind="live",
        payload={"until": until.isoformat() + "Z", "date": payload.date.isoformat()},
    )
    try:
        db.add(card)
        db.flush()
        db.add(LiveLocation(
            conversation_id=conversation_id, user_id=viewer.id, message_id=card.id, lat=payload.lat, lon=payload.lon,
            accuracy_m=payload.accuracy_m, updated_at=now, expires_at=until,
        ))
        db.commit()
    except IntegrityError:  # the same start twice at once (a double tap or a retry)
        db.rollback()
        retried = _sent_with(db, viewer, client_id)
        if retried is None or retried.conversation_id != conversation_id:
            raise HTTPException(status_code=409, detail="You just started sharing here") from None
        response.status_code = 200
        return cards.render(db, [retried], viewer.id)[0]
    db.refresh(card)
    if earlier is not None and (old := db.get(Message, earlier)) is not None:
        live.message_updated(db, old)
    live.message_created(db, card)
    chat_push.notify_message(background, db, card)
    return cards.render(db, [card], viewer.id)[0]


@router.put("/conversations/{conversation_id}/live", response_model=MessageOut)
@limiter.limit(LIVE_POINT_LIMIT, key_func=user_or_ip)
def update_live(request: Request, conversation_id: int, payload: LivePointIn, viewer: User = Depends(_sender), db: Session = Depends(get_db)):
    """The latest point while sharing; it replaces the last one. Outside the trip's days: 422, and nothing is kept."""
    live.purge_expired_live(db)
    _, trip = _room_seat(db, conversation_id, viewer)
    row = ontrip.live_of(db, conversation_id, viewer.id)
    if row is None:
        raise HTTPException(status_code=404, detail="You're not sharing your location here")
    _on_trip(trip, payload.date)
    row.lat, row.lon, row.accuracy_m, row.updated_at = payload.lat, payload.lon, payload.accuracy_m, datetime.utcnow()
    db.commit()
    card = db.get(Message, row.message_id)
    live.message_updated(db, card)
    return cards.render(db, [card], viewer.id)[0]


@router.delete("/conversations/{conversation_id}/live", status_code=204)
def stop_live(conversation_id: int, viewer: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Stop sharing: the point is deleted at once. Stopping when you aren't sharing changes nothing."""
    live.purge_expired_live(db)
    s = chat.seat(db, conversation_id, viewer)
    if s is None:
        raise NOT_FOUND
    message_id = ontrip.stop_sharing(db, conversation_id, viewer.id)
    db.commit()
    if message_id is not None and (card := db.get(Message, message_id)) is not None:
        live.message_updated(db, card)
    return Response(status_code=204)

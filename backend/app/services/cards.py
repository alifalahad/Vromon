"""
Vromon Backend — cards in chat: a trip, a place, a trip idea, a poll
(docs/friends-chat-plan.md, step 4; section 3.1).

- The app sends only what a card points at; `snapshot` builds the rest from the
  database (title, dates, counts at the time of sending), so a card can't claim
  what isn't true.
- A trip card can be sent only for a trip the sender can see, into a chat where
  everyone can see it too. Every time a card is shown, `render` checks again:
  someone who can't see the trip any more (unfriended its owner, or it was
  deleted) gets `{"available": false}` and nothing else, in the message list, the
  chat list and the live events alike. A place that's gone is shown the same way.
- Polls and trip ideas take votes (`poll_votes`); a trip idea's answers are fixed:
  1 in, 2 maybe, 3 can't.
- Every message can carry one reaction per person (step 5); "want" is for places and
  trip ideas. A reply quotes another message, and the quote follows the same rules as
  the message itself (a trip card someone can't see is unavailable in the quote too).

`render` is the one place a message becomes what a person sees.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta
from typing import Optional, Sequence

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.models.models import (
    City, Conversation, Country, Destination, Itinerary, ItineraryItem, Message, MessageReaction, Place, PollVote, Region, Trip,
    TripSuggestion, User,
)
from app.schemas.chat import CardIn, IdeaCardIn, MessageOut, PlaceCardIn, PollCardIn, ReplyPreview, TripCardIn
from app.services import ontrip, rooms
from app.services.privacy import viewer_can_see

# "invite" is made by the server only (POST /trips/{id}/members): a trip card with Join
# Step 8: "checkin" and "late" (built here from what the phone sends), "live" (made by POST …/live)
CARD_KINDS = frozenset({"trip", "place", "idea", "poll", "invite", "checkin", "late", "live"})
TRIP_KINDS = frozenset({"trip", "invite"})
VOTED_KINDS = frozenset({"idea", "poll"})
IDEA_OPTIONS = {1: "in", 2: "maybe", 3: "out"}
# "Want" puts a place on your Want list, so only messages about a place take it
WANT_KINDS = frozenset({"place", "idea"})
QUOTE_LENGTH = 200
UNAVAILABLE = {"available": False}


class CardError(Exception):
    def __init__(self, status: int, detail: str):
        super().__init__(detail)
        self.status = status
        self.detail = detail


def _name(user: User) -> str:
    return user.display_name or user.username or "They"


def _where(destination: Optional[Destination]) -> dict:
    """Where a destination is, for the card's locator map (0, 0 means unknown)."""
    if destination is None or (not destination.latitude and not destination.longitude):
        return {"region": destination.region_code if destination else None}
    return {"region": destination.region_code, "lat": destination.latitude, "lon": destination.longitude}


def _int(ref: str, what: str) -> int:
    try:
        return int(ref)
    except ValueError:
        raise CardError(404, f"{what} not found") from None


# ---------------------------------------------------------------------------
# Snapshots, built when a card is sent
# ---------------------------------------------------------------------------

def snapshot(db: Session, sender: User, others: Sequence[User], kind: str, card: CardIn, room_trip: Optional[Trip] = None) -> dict:
    """
    The card as stored. `others`: everyone else in the chat (a trip must be visible to them
    all). `room_trip`: a trip room's trip (check-ins and running late only go there).
    """
    if kind in ("checkin", "late"):
        if room_trip is None:
            raise CardError(422, "That's only for a trip room")
        try:
            if kind == "checkin":
                return ontrip.checkin(db, room_trip, day=card.date, time=card.time, lat=card.lat, lon=card.lon)  # type: ignore[union-attr]
            return ontrip.late(db, room_trip, day=card.date, time=card.time, minutes=card.minutes, source=card.source)  # type: ignore[union-attr]
        except ontrip.OnTripError as exc:
            raise CardError(exc.status, exc.detail) from None
    if kind == "trip":
        return _trip(db, sender, others, card)  # type: ignore[arg-type]
    if kind == "place":
        return _place(db, card)  # type: ignore[arg-type]
    if kind == "idea":
        return _idea(db, card)  # type: ignore[arg-type]
    if kind == "poll":
        return _poll(card)  # type: ignore[arg-type]
    raise CardError(422, "Unknown card")


def _trip(db: Session, sender: User, others: Sequence[User], card: TripCardIn) -> dict:
    trip = db.get(Trip, card.trip_id)
    owner = db.get(User, trip.user_id) if trip is not None and trip.user_id is not None else None
    # Someone else's trip you can't see: as if it didn't exist
    if owner is None or not rooms.can_read_trip(db, sender, trip):
        raise CardError(404, "Trip not found")
    for person in others:
        # The owner may send a friend any of their trips, also one they hide from friends:
        # that one then opens for them (C7)
        if not (rooms.can_read_trip(db, person, trip) or (sender.id == owner.id and viewer_can_see(db, person, owner))):
            raise CardError(403, f"{_name(person)} can't see this trip: its owner hasn't shared it with them")
    return trip_payload(db, trip, owner)


def trip_payload(db: Session, trip: Trip, owner: User) -> dict:
    """What a trip card (or an invite) stores about the trip."""
    stops = db.scalar(
        select(func.count(ItineraryItem.id))
        .join(Itinerary, Itinerary.id == ItineraryItem.itinerary_id)
        .where(Itinerary.trip_id == trip.id, ItineraryItem.item_type == "activity")
    )
    destination = db.scalar(select(Destination).where(Destination.name == trip.destination))
    return {
        "trip_id": trip.id,
        "owner_id": str(owner.id),
        "owner_name": _name(owner),
        "title": trip.title,
        "destination": trip.destination,
        "start_date": trip.start_date.isoformat(),
        "end_date": trip.end_date.isoformat(),
        "days": trip.num_days,
        "travelers": trip.num_travelers,
        # Planned activities; 0 while the trip has no plan yet
        "stops": stops or 0,
        **_where(destination),
    }


def _place(db: Session, card: PlaceCardIn) -> dict:
    kind = card.type
    if kind == "attraction":
        place = db.get(Place, _int(card.ref, "Place"))
        if place is None or not place.is_active or not place.listed:   # a private stop is never sent (step 6)
            raise CardError(404, "Place not found")
        destination = db.get(Destination, place.destination_id)
        return {
            "type": kind,
            "id": place.id,
            "name": place.name,
            "category": place.category,
            "destination": place.destination_name,
            "destination_id": place.destination_id,
            # About how long people spend there, in hours
            "hours": place.average_visit_duration,
            "region": destination.region_code if destination else None,
            "lat": place.latitude,
            "lon": place.longitude,
        }
    if kind == "destination":
        destination = db.get(Destination, _int(card.ref, "Destination"))
        if destination is None or not destination.is_active:
            raise CardError(404, "Destination not found")
        places = db.scalar(
            select(func.count(Place.id)).where(Place.destination_id == destination.id, Place.is_active.is_(True), Place.listed.is_(True))
        )
        return {"type": kind, "id": destination.id, "name": destination.name, "places": places or 0, **_where(destination)}
    if kind == "country":
        country = db.get(Country, card.ref.upper())
        if country is None:
            raise CardError(404, "Country not found")
        return {
            "type": kind, "code": country.iso2, "name": country.name, "name_bn": country.name_bn,
            "lat": country.label_lat, "lon": country.label_lon,
        }
    if kind == "region":
        region = db.get(Region, card.ref)
        if region is None:
            raise CardError(404, "Division not found")
        return {
            "type": kind, "code": region.code, "name": region.name, "name_bn": region.name_bn,
            "country": region.country_iso2, "region": region.code, "lat": region.lat, "lon": region.lon,
        }
    city = db.get(City, _int(card.ref, "City"))
    if city is None:
        raise CardError(404, "City not found")
    return {
        "type": kind, "code": str(city.geonameid), "name": city.name,
        "country": city.country_iso2, "region": city.region_code, "lat": city.lat, "lon": city.lon,
    }


def _idea(db: Session, card: IdeaCardIn) -> dict:
    destination = db.get(Destination, card.destination_id)
    if destination is None or not destination.is_active:
        raise CardError(404, "Destination not found")
    # A day's grace: the sender's month can be behind UTC's at the turn of a month
    if card.month is not None and card.month < (datetime.utcnow() - timedelta(days=1)).strftime("%Y-%m"):
        raise CardError(422, "That month has passed")
    return {
        "destination_id": destination.id,
        "destination": destination.name,
        **_where(destination),
        "month": card.month,
        "part": card.part,
        "days": card.days,
        "note": card.note,
    }


def _poll(card: PollCardIn) -> dict:
    return {
        "question": card.question,
        "options": [{"id": i + 1, "text": text} for i, text in enumerate(card.options)],
        "multiple": card.multiple,
    }


# ---------------------------------------------------------------------------
# Showing cards: access is checked again for every viewer, every time
# ---------------------------------------------------------------------------

class _Access:
    """What one viewer may see, remembered for one page of messages."""

    def __init__(self, db: Session, viewer: Optional[User]):
        self.db = db
        self.viewer = viewer
        self.trips: dict[int, bool] = {}
        self.places: dict[tuple[str, str], bool] = {}

    def trip(self, trip_id: object) -> bool:
        if not isinstance(trip_id, int):
            return False
        if trip_id not in self.trips:
            trip = self.db.get(Trip, trip_id)
            # The owner, their friends, and the trip room's members (step 7)
            self.trips[trip_id] = trip is not None and self.viewer is not None and rooms.can_read_trip(self.db, self.viewer, trip)
        return self.trips[trip_id]

    def invite(self, payload: dict) -> dict:
        """An invite as this viewer sees it: the trip, and where they stand with its room."""
        trip_id = payload.get("trip_id")
        trip = self.db.get(Trip, trip_id) if isinstance(trip_id, int) else None
        if trip is None or self.viewer is None:
            return dict(UNAVAILABLE)
        room = rooms.room_of(self.db, trip.id)
        if trip.user_id == self.viewer.id:
            status = "owner"
        else:
            m = rooms.membership(self.db, trip.id, self.viewer.id)
            # Left, removed, or the invite taken back: the card stays, without a way in
            status = m.status if m is not None else "none"
        if status == "none" and not self.trip(trip.id):
            return dict(UNAVAILABLE)
        in_room = status in ("owner", "joined") and room is not None
        return {**payload, "room": {"status": status, "conversation_id": room.id if in_room else None}}

    def place(self, payload: dict) -> bool:
        kind, ref = str(payload.get("type")), str(payload.get("id", payload.get("code")))
        if (kind, ref) not in self.places:
            if kind == "attraction":
                found = self.db.get(Place, int(ref)) if ref.isdigit() else None
                ok = found is not None and found.is_active and found.listed
            elif kind == "destination":
                found = self.db.get(Destination, int(ref)) if ref.isdigit() else None
                ok = found is not None and found.is_active
            elif kind == "country":
                ok = self.db.get(Country, ref) is not None
            elif kind == "region":
                ok = self.db.get(Region, ref) is not None
            elif kind == "city":
                ok = ref.isdigit() and self.db.get(City, int(ref)) is not None
            else:
                ok = False
            self.places[(kind, ref)] = ok
        return self.places[(kind, ref)]

    def card(self, message: Message) -> dict:
        payload = message.payload or {}
        if message.kind == "invite":
            return self.invite(payload)
        if message.kind == "live":
            row = ontrip.live_of(self.db, message.conversation_id, message.sender_id) if message.sender_id else None
            if row is not None and row.message_id != message.id:
                row = None  # an older card of someone sharing again
            room = self.db.get(Conversation, message.conversation_id)
            trip = self.db.get(Trip, room.trip_id) if room is not None and room.trip_id else None
            return ontrip.live_payload(self.db, payload, row, trip)
        if message.kind == "trip" and not self.trip(payload.get("trip_id")):
            return dict(UNAVAILABLE)
        if message.kind == "place" and not self.place(payload):
            return dict(UNAVAILABLE)
        return payload


def _votes(db: Session, message_ids: list[int]) -> dict[int, dict[str, list[uuid.UUID]]]:
    out: dict[int, dict[str, list[uuid.UUID]]] = {mid: {} for mid in message_ids}
    if message_ids:
        rows = db.execute(
            select(PollVote.message_id, PollVote.option_id, PollVote.user_id)
            .where(PollVote.message_id.in_(message_ids))
            .order_by(PollVote.created_at)
        ).all()
        for mid, option, uid in rows:
            out[mid].setdefault(str(option), []).append(uid)
    return out


def _reactions(db: Session, message_ids: list[int]) -> dict[int, dict[str, list[uuid.UUID]]]:
    out: dict[int, dict[str, list[uuid.UUID]]] = {}
    if message_ids:
        rows = db.execute(
            select(MessageReaction.message_id, MessageReaction.reaction, MessageReaction.user_id)
            .where(MessageReaction.message_id.in_(message_ids))
            .order_by(MessageReaction.created_at)
        ).all()
        for mid, reaction, uid in rows:
            out.setdefault(mid, {}).setdefault(reaction, []).append(uid)
    return out


def _quote(access: _Access, quoted: Optional[Message]) -> Optional[ReplyPreview]:
    if quoted is None:
        return None
    if quoted.deleted_at is not None:
        return ReplyPreview(id=quoted.id, sender_id=quoted.sender_id, kind=quoted.kind, deleted=True)
    body = quoted.body[:QUOTE_LENGTH] if quoted.body else None
    payload = access.card(quoted) if quoted.kind in CARD_KINDS else None
    return ReplyPreview(id=quoted.id, sender_id=quoted.sender_id, kind=quoted.kind, body=body, payload=payload)


def suggestable(message: Message) -> bool:
    """A place card that can go into a trip's plan: an attraction from the catalogue."""
    return message.kind == "place" and message.deleted_at is None and (message.payload or {}).get("type") == "attraction"


def _suggestions(db: Session, places: Sequence[Message]) -> dict[int, dict]:
    """Attractions suggested in trip rooms (step 7): open, added to a day, or declined."""
    in_rooms = {
        cid for cid in db.scalars(
            select(Conversation.id).where(Conversation.id.in_({m.conversation_id for m in places}), Conversation.kind == "trip")
        )
    } if places else set()
    ids = [m.id for m in places if m.conversation_id in in_rooms and suggestable(m)]
    if not ids:
        return {}
    decided = {s.message_id: s for s in db.scalars(select(TripSuggestion).where(TripSuggestion.message_id.in_(ids)))}
    out = {}
    for mid in ids:
        s = decided.get(mid)
        out[mid] = {"status": s.status if s else "open", "day": s.day_number if s else None}
    return out


def render(db: Session, messages: Sequence[Message], viewer_id: uuid.UUID) -> list[MessageOut]:
    """
    Messages as one person sees them: cards they may no longer see are unavailable;
    polls and ideas carry votes; every message its reactions and the message it quotes.
    """
    access = _Access(db, db.get(User, viewer_id))
    live_ids = [m.id for m in messages if m.deleted_at is None]
    votes = _votes(db, [m.id for m in messages if m.kind in VOTED_KINDS and m.deleted_at is None])
    reactions = _reactions(db, live_ids)
    quoted_ids = {m.reply_to_id for m in messages if m.reply_to_id is not None and m.deleted_at is None}
    quoted = {q.id: q for q in db.scalars(select(Message).where(Message.id.in_(quoted_ids)))} if quoted_ids else {}
    suggestions = _suggestions(db, [m for m in messages if m.kind == "place" and m.deleted_at is None])
    out = []
    for m in messages:
        live = m.deleted_at is None
        payload = access.card(m) if live and m.kind in CARD_KINDS else None
        if payload is not None and m.id in suggestions and payload.get("available") is not False:
            payload = {**payload, "suggestion": suggestions[m.id]}
        out.append(
            MessageOut.of(
                m,
                viewer_id,
                payload=payload,
                votes=votes.get(m.id) if live and m.kind in VOTED_KINDS else None,
                reactions=reactions.get(m.id),
                reply_to=_quote(access, quoted.get(m.reply_to_id)) if live and m.reply_to_id is not None else None,
            )
        )
    return out


# ---------------------------------------------------------------------------
# Votes
# ---------------------------------------------------------------------------

def vote(db: Session, message: Message, user: User, option_ids: list[int]) -> None:
    """Replace the user's answer to a poll or a trip idea (an empty list takes it back). Doesn't commit."""
    if message.kind not in VOTED_KINDS:
        raise CardError(422, "Only polls and trip ideas take answers")
    if message.deleted_at is not None:
        raise CardError(409, "This was unsent")
    payload = message.payload or {}
    if message.kind == "idea":
        valid, multiple = set(IDEA_OPTIONS), False
    else:
        valid, multiple = {o["id"] for o in payload.get("options", [])}, bool(payload.get("multiple"))
    if any(o not in valid for o in option_ids):
        raise CardError(422, "There's no such answer")
    if len(option_ids) > 1 and not multiple:
        raise CardError(422, "Choose one answer")
    db.execute(delete(PollVote).where(PollVote.message_id == message.id, PollVote.user_id == user.id))
    db.add_all([PollVote(message_id=message.id, user_id=user.id, option_id=o) for o in option_ids])


def forget_votes(db: Session, message: Message) -> None:
    """An unsent message keeps no answers or reactions. Doesn't commit."""
    if message.kind in VOTED_KINDS:
        db.execute(delete(PollVote).where(PollVote.message_id == message.id))
    db.execute(delete(MessageReaction).where(MessageReaction.message_id == message.id))


# ---------------------------------------------------------------------------
# Reactions and replies (step 5)
# ---------------------------------------------------------------------------

def react(db: Session, message: Message, user: User, reaction: Optional[str]) -> None:
    """Set the user's one reaction to a message (None takes it back). Doesn't commit."""
    if reaction is not None:
        if message.kind == "system":
            raise CardError(422, "Lines from Vromon don't take reactions")
        if message.deleted_at is not None:
            raise CardError(409, "This was unsent")
        if reaction == "want" and message.kind not in WANT_KINDS:
            raise CardError(422, "Want is for places and trip ideas")
    db.execute(delete(MessageReaction).where(MessageReaction.message_id == message.id, MessageReaction.user_id == user.id))
    if reaction is not None:
        db.add(MessageReaction(message_id=message.id, user_id=user.id, reaction=reaction))


def check_reply(db: Session, conversation_id: int, cleared_up_to: int, reply_to_id: int) -> None:
    """A reply quotes a message in the same chat that the sender can see, and that's still there."""
    quoted = db.get(Message, reply_to_id)
    if quoted is None or quoted.conversation_id != conversation_id or quoted.id <= cleared_up_to:
        raise CardError(404, "The message you're replying to isn't in this chat")
    if quoted.kind == "system":
        raise CardError(422, "Lines from Vromon can't be replied to")
    if quoted.deleted_at is not None:
        raise CardError(409, "That message was unsent")

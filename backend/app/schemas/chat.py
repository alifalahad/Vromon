"""
Vromon Backend — chat schemas (docs/friends-chat-plan.md, steps 1 and 4).

A message is text or a card: a trip, a place, a trip idea or a poll. The app sends
only what a card points at (ids and the sender's own words); the server builds the
card's snapshot (services/cards.py), so a card can't claim what isn't true.
Times go out with their UTC offset: stored times are naive UTC, and a phone would
otherwise read "03:35" as local time.
"""

from __future__ import annotations

import re
import uuid
from datetime import date, datetime, timezone
from typing import Annotated, Dict, List, Literal, Optional, Union

from pydantic import BaseModel, ConfigDict, Field, PlainSerializer, ValidationError, field_validator, model_validator

from app.schemas.friends import PublicProfile

MAX_TEXT = 2000
MAX_NOTE = 120
MAX_REPORT_NOTE = 500
MAX_QUESTION = 200
MAX_OPTION = 80

CardKind = Literal["trip", "place", "idea", "poll", "checkin", "late"]
Reaction = Literal["heart", "thumbs_up", "laugh", "wow", "want"]
ReportReason = Literal["spam", "harassment", "inappropriate", "scam", "other"]


def _utc(value: datetime) -> str:
    return (value if value.tzinfo else value.replace(tzinfo=timezone.utc)).astimezone(timezone.utc).isoformat()


UtcTime = Annotated[datetime, PlainSerializer(_utc, return_type=str)]


def clean_text(value: str) -> str:
    """PostgreSQL rejects NUL in text; one kind of line break; no space around it."""
    return value.replace("\x00", "").replace("\r\n", "\n").replace("\r", "\n").strip()


class DirectIn(BaseModel):
    """Open the chat with a friend (it's made the first time either of you opens it)."""
    user_id: uuid.UUID


# ---------------------------------------------------------------------------
# Cards, as the app sends them (the server adds the rest)
# ---------------------------------------------------------------------------

class TripCardIn(BaseModel):
    """A trip the sender can see; everyone in the chat must be able to see it too."""
    model_config = ConfigDict(extra="forbid")
    trip_id: int = Field(ge=1)


class PlaceCardIn(BaseModel):
    """
    A place: an attraction or a destination from Vromon's catalogue (by id), or a
    country (ISO alpha-2), division (region code) or city (GeoNames id) from the map.
    """
    model_config = ConfigDict(extra="forbid")
    type: Literal["attraction", "destination", "country", "region", "city"]
    ref: str = Field(min_length=1, max_length=20)


class IdeaCardIn(BaseModel):
    """"Let's go to …": a destination, roughly when and for how long, and a short note. Answers: in, maybe, can't."""
    model_config = ConfigDict(extra="forbid")
    destination_id: int = Field(ge=1)
    # "2026-12": the month; `part` says early, mid or late in it
    month: Optional[str] = None
    part: Optional[Literal["early", "mid", "late"]] = None
    days: Optional[int] = Field(None, ge=1, le=30)
    note: Optional[str] = Field(None, max_length=4 * MAX_NOTE)

    @field_validator("month")
    @classmethod
    def _month(cls, value: Optional[str]) -> Optional[str]:
        if value is not None and not re.fullmatch(r"20\d\d-(0[1-9]|1[0-2])", value):
            raise ValueError("The month is YYYY-MM")
        return value

    @field_validator("note")
    @classmethod
    def _note(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        text = clean_text(value)
        if len(text) > MAX_NOTE:
            raise ValueError(f"The note can be at most {MAX_NOTE} characters")
        return text or None

    @model_validator(mode="after")
    def _part_needs_month(self) -> "IdeaCardIn":
        if self.part is not None and self.month is None:
            raise ValueError("Early, mid or late needs a month")
        return self


class PollCardIn(BaseModel):
    """A question with 2–6 answers; one answer each unless `multiple`."""
    model_config = ConfigDict(extra="forbid")
    question: str = Field(max_length=4 * MAX_QUESTION)
    options: List[str] = Field(min_length=2, max_length=6)
    multiple: bool = False

    @field_validator("question")
    @classmethod
    def _question(cls, value: str) -> str:
        text = clean_text(value)
        if not text:
            raise ValueError("Write the question first")
        if len(text) > MAX_QUESTION:
            raise ValueError(f"The question can be at most {MAX_QUESTION} characters")
        return text

    @field_validator("options")
    @classmethod
    def _options(cls, value: List[str]) -> List[str]:
        options = [" ".join(clean_text(o).split()) for o in value]
        if any(not o for o in options):
            raise ValueError("Every answer needs some text")
        if any(len(o) > MAX_OPTION for o in options):
            raise ValueError(f"An answer can be at most {MAX_OPTION} characters")
        if len({o.casefold() for o in options}) != len(options):
            raise ValueError("Each answer must be different")
        return options


LOCAL_TIME = r"([01]\d|2[0-3]):[0-5]\d"


class _OnTheTrip(BaseModel):
    """Step 8: the phone's own date and time, to place this on the trip's plan."""
    model_config = ConfigDict(extra="forbid")
    date: date
    time: str = Field(pattern=f"^{LOCAL_TIME}$")


class CheckinCardIn(_OnTheTrip):
    """"I'm here": one reading. The server snaps it to a stop and keeps only the stop, never the point."""
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)


class LateCardIn(_OnTheTrip):
    """"Running late": by how much, and whether it was sent from Today mode."""
    minutes: int = Field(ge=5, le=180)
    source: Literal["today", "room"] = "room"


CARD_INPUTS: Dict[str, type[BaseModel]] = {
    "trip": TripCardIn, "place": PlaceCardIn, "idea": IdeaCardIn, "poll": PollCardIn, "checkin": CheckinCardIn, "late": LateCardIn,
}

CardIn = Union[TripCardIn, PlaceCardIn, IdeaCardIn, PollCardIn, CheckinCardIn, LateCardIn]


class LiveStartIn(BaseModel):
    """Start sharing your live location with a trip room (step 8): where you are, and until when."""
    model_config = ConfigDict(extra="forbid")
    client_id: uuid.UUID
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)
    accuracy_m: Optional[float] = Field(None, ge=0, le=100_000)
    # The phone's date: the trip must be on it
    date: date
    # 15 minutes, an hour, or the end of the phone's day (at most 24 hours ahead)
    until: datetime


class LivePointIn(BaseModel):
    """The latest point while sharing (the app sends one a minute while it's open)."""
    model_config = ConfigDict(extra="forbid")
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)
    accuracy_m: Optional[float] = Field(None, ge=0, le=100_000)
    date: date


class MessageIn(BaseModel):
    """Text in `body`, or a card in `payload` (its fields depend on `kind`)."""
    # The app's own id for the message: sending it again (a retry) returns the first one
    client_id: uuid.UUID
    kind: Literal["text", "trip", "place", "idea", "poll", "checkin", "late"] = "text"
    # A loose cap before cleaning; the real limit is checked on the cleaned text
    body: Optional[str] = Field(None, max_length=4 * MAX_TEXT)
    payload: Optional[dict] = None
    # A reply quotes this message (step 5)
    reply_to_id: Optional[int] = Field(None, ge=1)

    @field_validator("body")
    @classmethod
    def _clean(cls, value: Optional[str]) -> Optional[str]:
        return None if value is None else clean_text(value)

    @model_validator(mode="after")
    def _text_or_card(self) -> "MessageIn":
        if self.kind == "text":
            if self.payload is not None:
                raise ValueError("A text message has no payload")
            if not self.body:
                raise ValueError("Write something first")
            if len(self.body) > MAX_TEXT:
                raise ValueError(f"A message can be at most {MAX_TEXT} characters")
            return self
        if self.body:
            raise ValueError("A card has no text: send a note as its own message")
        if self.payload is None:
            raise ValueError("A card needs its payload")
        try:
            card = CARD_INPUTS[self.kind].model_validate(self.payload)
        except ValidationError as exc:
            first = exc.errors(include_url=False, include_context=False)[0]
            where = ".".join(str(p) for p in first["loc"])
            raise ValueError(f"payload.{where}: {first['msg']}" if where else first["msg"]) from None
        self.body = None
        self.payload = card.model_dump()
        return self

    def card(self) -> CardIn:
        """The payload, checked against its kind (cards only)."""
        return CARD_INPUTS[self.kind].model_validate(self.payload)


class ReactionIn(BaseModel):
    """Your one reaction to a message; another replaces it. "want" is for places and trip ideas."""
    model_config = ConfigDict(extra="forbid")
    reaction: Reaction


class ReportIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    reason: ReportReason
    note: Optional[str] = Field(None, max_length=4 * MAX_REPORT_NOTE)

    @field_validator("note")
    @classmethod
    def _note(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        text = clean_text(value)
        if len(text) > MAX_REPORT_NOTE:
            raise ValueError(f"The note can be at most {MAX_REPORT_NOTE} characters")
        return text or None


class ReportOut(BaseModel):
    """A report, for the admin list."""
    id: int
    message_id: Optional[int] = None
    conversation_id: Optional[int] = None
    reporter_id: uuid.UUID
    reported_user_id: Optional[uuid.UUID] = None
    reason: str
    note: Optional[str] = None
    # What was reported, kept even if it's unsent later
    snapshot: dict
    status: str
    created_at: UtcTime

    model_config = ConfigDict(from_attributes=True)


class VoteIn(BaseModel):
    """Your answer to a poll or a trip idea; an empty list takes your vote back."""
    model_config = ConfigDict(extra="forbid")
    option_ids: List[int] = Field(max_length=6)

    @field_validator("option_ids")
    @classmethod
    def _unique(cls, value: List[int]) -> List[int]:
        if len(set(value)) != len(value):
            raise ValueError("Each answer once")
        return value


class ReadIn(BaseModel):
    """Read up to this message (it only moves forward)."""
    message_id: int = Field(ge=0)


class MemberStateIn(BaseModel):
    """Your own settings for one chat. Send only what changes; `"muted_until": null` unmutes."""
    model_config = ConfigDict(extra="forbid")

    muted_until: Optional[datetime] = None
    # "Delete chat" for you only: hide every message up to this id (it only moves forward)
    cleared_up_to_id: Optional[int] = Field(None, ge=0)


class ReplyPreview(BaseModel):
    """The message a reply quotes, as the viewer may see it."""
    id: int
    sender_id: Optional[uuid.UUID] = None
    kind: str
    body: Optional[str] = None
    payload: Optional[dict] = None
    deleted: bool = False


class MessageOut(BaseModel):
    id: int
    conversation_id: int
    # None for a line from Vromon itself ("Nusrat joined")
    sender_id: Optional[uuid.UUID] = None
    kind: str
    # Both empty once the sender unsends it (`deleted`)
    body: Optional[str] = None
    payload: Optional[dict] = None
    reply_to_id: Optional[int] = None
    # Only on your own messages: the id your app sent it with
    client_id: Optional[str] = None
    created_at: UtcTime
    deleted: bool = False
    # Polls and trip ideas: who chose each answer, by option id ("1": [user ids])
    votes: Optional[Dict[str, List[uuid.UUID]]] = None
    # Who reacted with what ("heart": [user ids]); only reactions someone chose
    reactions: Dict[str, List[uuid.UUID]] = Field(default_factory=dict)
    # The message this one replies to
    reply_to: Optional[ReplyPreview] = None

    @classmethod
    def of(
        cls,
        m,
        viewer_id: Optional[uuid.UUID],
        *,
        payload: Optional[dict] = None,
        votes: Optional[Dict[str, List[uuid.UUID]]] = None,
        reactions: Optional[Dict[str, List[uuid.UUID]]] = None,
        reply_to: Optional[ReplyPreview] = None,
    ) -> "MessageOut":
        """
        A stored message as one person sees it: unsent ones are empty, and only the
        sender gets the client id. Messages go through services/cards.render, which
        passes the card `payload` this person may see, the `votes`, the `reactions`
        and the quoted message.
        """
        gone = m.deleted_at is not None
        return cls(
            id=m.id,
            conversation_id=m.conversation_id,
            sender_id=m.sender_id,
            kind=m.kind,
            body=None if gone else m.body,
            payload=None if gone else (payload if payload is not None else m.payload),
            reply_to_id=m.reply_to_id,
            client_id=m.client_id if m.sender_id is not None and m.sender_id == viewer_id else None,
            created_at=m.created_at,
            deleted=gone,
            votes=None if gone else votes,
            reactions={} if gone else (reactions or {}),
            reply_to=None if gone else reply_to,
        )


class MessagePageOut(BaseModel):
    # Oldest first
    messages: List[MessageOut]
    # More beyond this page, in the direction asked: older ones, or newer ones with `after`
    has_more: bool


class PlanDayPreview(BaseModel):
    day: int
    places: List[str]


class RoomTripOut(BaseModel):
    """A trip room's trip, for its header and the pinned plan bar (step 7)."""
    id: int
    title: Optional[str] = None
    destination: str
    start_date: date
    end_date: date
    owner_id: uuid.UUID
    # Planned activities, and the first two of up to three days for the plan bar ("Day 1 Lawachara, …")
    stops: int
    preview: List[PlanDayPreview] = []


class ConversationOut(BaseModel):
    id: int
    kind: Literal["direct", "trip"]
    # A direct chat's other person; None when their account was deleted
    other: Optional[PublicProfile] = None
    trip_id: Optional[int] = None
    # A trip room's trip and everyone in it, the owner first
    trip: Optional[RoomTripOut] = None
    members: List[PublicProfile] = []
    can_send: bool
    # Why you can't send. "not_friends" also covers being blocked, which isn't revealed
    read_only_reason: Optional[Literal["not_friends", "account_deleted"]] = None
    last_message: Optional[MessageOut] = None
    unread_count: int
    last_read_message_id: int
    # How far the other person has read; only when both of you have read receipts on
    other_read_up_to: Optional[int] = None
    muted_until: Optional[UtcTime] = None
    created_at: UtcTime

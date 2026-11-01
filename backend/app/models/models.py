"""
Vromon Backend — SQLAlchemy ORM Models.

All entities for the travel planning system. Evolved from demo models
with improved typing, relationships, and PostgreSQL compatibility.
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime, date
from typing import Optional, List

from sqlalchemy import (
    Integer, String, Float, Boolean, DateTime, Date,
    Text, ForeignKey, Index, Numeric, JSON, Uuid, UniqueConstraint, CheckConstraint, text, true as sa_true, false as sa_false,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


# ---------------------------------------------------------------------------
# JSON helpers for SQLite compatibility (list/dict stored as JSON text)
# ---------------------------------------------------------------------------

def _json_get(value: str | None) -> list:
    if value is None:
        return []
    try:
        return json.loads(value)
    except Exception:
        return []


def _json_set(value) -> str:
    if value is None:
        return "[]"
    return json.dumps(value, ensure_ascii=False)


# ---------------------------------------------------------------------------
# Destination
# ---------------------------------------------------------------------------

class Destination(Base):
    """A travel destination (e.g., Cox's Bazar)."""
    __tablename__ = "destinations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False, unique=True)
    country: Mapped[str] = mapped_column(String(100), nullable=False, default="Bangladesh")
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    latitude: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    longitude: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    image_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    # Imported destinations (step 10): where the data comes from, and whether a person has checked it
    attribution: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    sources_json: Mapped[str] = mapped_column(Text, default="[]", server_default="[]")
    checked: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1")
    data_version: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)  # hash of the loaded data file
    # Where it is on the travel map (map home step 4): filled at startup from the nearest city
    country_iso2: Mapped[Optional[str]] = mapped_column(String(2), nullable=True, index=True)
    region_code: Mapped[Optional[str]] = mapped_column(String(20), nullable=True, index=True)

    @property
    def sources(self) -> list:
        return _json_get(self.sources_json)

    # Relationships
    places: Mapped[List["Place"]] = relationship("Place", back_populates="destination_rel", cascade="all, delete-orphan")
    restaurants: Mapped[List["Restaurant"]] = relationship("Restaurant", back_populates="destination_rel", cascade="all, delete-orphan")
    hotels: Mapped[List["Hotel"]] = relationship("Hotel", back_populates="destination_rel", cascade="all, delete-orphan")


# ---------------------------------------------------------------------------
# Place
# ---------------------------------------------------------------------------

class Place(Base):
    """An attraction or activity within a destination."""
    __tablename__ = "places"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    destination_id: Mapped[int] = mapped_column(Integer, ForeignKey("destinations.id"), nullable=False)
    destination_name: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    category: Mapped[str] = mapped_column(String(50), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)
    rating: Mapped[float] = mapped_column(Float, default=4.0)
    review_count: Mapped[int] = mapped_column(Integer, default=0)
    average_visit_duration: Mapped[float] = mapped_column(Float, default=1.5)  # hours
    estimated_cost: Mapped[float] = mapped_column(Float, default=0.0)  # BDT per person
    currency: Mapped[str] = mapped_column(String(10), default="BDT")
    opening_time: Mapped[str] = mapped_column(String(10), default="08:00")
    closing_time: Mapped[str] = mapped_column(String(10), default="18:00")
    best_time: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    crowd_level: Mapped[str] = mapped_column(String(20), default="Medium")  # Low / Medium / High
    activity_level: Mapped[str] = mapped_column(String(20), default="Medium")
    tags_json: Mapped[str] = mapped_column(Text, default="[]")
    image_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    # Unknown stays unknown (step 10): when a source doesn't say, the field holds a planning default
    # and is shown as unknown ("Price unknown", "Hours not checked"); a rating that's unknown isn't shown
    cost_known: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1")
    hours_known: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1")
    rating_known: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1")
    source: Mapped[str] = mapped_column(String(20), default="curated", server_default="curated")  # curated / wikivoyage / wikidata
    source_ref: Mapped[Optional[str]] = mapped_column(String(160), nullable=True, index=True)
    url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    checked: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1")

    # Relationships
    destination_rel: Mapped["Destination"] = relationship("Destination", back_populates="places")

    __table_args__ = (
        Index("ix_places_destination_category", "destination_name", "category"),
    )

    @property
    def tags(self) -> list:
        return _json_get(self.tags_json)

    @tags.setter
    def tags(self, value):
        self.tags_json = _json_set(value)


# ---------------------------------------------------------------------------
# Restaurant
# ---------------------------------------------------------------------------

class Restaurant(Base):
    """A dining option within a destination."""
    __tablename__ = "restaurants"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    destination_id: Mapped[int] = mapped_column(Integer, ForeignKey("destinations.id"), nullable=False)
    destination_name: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    cuisine: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    price_level: Mapped[str] = mapped_column(String(20), default="Medium")  # Budget / Medium / Premium
    rating: Mapped[float] = mapped_column(Float, default=4.0)
    review_count: Mapped[int] = mapped_column(Integer, default=0)
    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)
    average_meal_cost: Mapped[float] = mapped_column(Float, default=300.0)  # BDT per person
    currency: Mapped[str] = mapped_column(String(10), default="BDT")
    opening_time: Mapped[str] = mapped_column(String(10), default="07:00")
    closing_time: Mapped[str] = mapped_column(String(10), default="22:00")
    tags_json: Mapped[str] = mapped_column(Text, default="[]")
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    cost_known: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1")
    hours_known: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1")
    rating_known: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1")
    source: Mapped[str] = mapped_column(String(20), default="curated", server_default="curated")
    source_ref: Mapped[Optional[str]] = mapped_column(String(160), nullable=True, index=True)
    checked: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1")

    # Relationships
    destination_rel: Mapped["Destination"] = relationship("Destination", back_populates="restaurants")

    @property
    def tags(self) -> list:
        return _json_get(self.tags_json)

    @tags.setter
    def tags(self, value):
        self.tags_json = _json_set(value)


# ---------------------------------------------------------------------------
# Hotel
# ---------------------------------------------------------------------------

class Hotel(Base):
    """An accommodation option within a destination."""
    __tablename__ = "hotels"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    destination_id: Mapped[int] = mapped_column(Integer, ForeignKey("destinations.id"), nullable=False)
    destination_name: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    category: Mapped[str] = mapped_column(String(50), default="Standard")  # Budget / Standard / Luxury
    price_per_night: Mapped[float] = mapped_column(Float, default=2000.0)  # BDT
    currency: Mapped[str] = mapped_column(String(10), default="BDT")
    rating: Mapped[float] = mapped_column(Float, default=4.0)
    review_count: Mapped[int] = mapped_column(Integer, default=0)
    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    amenities_json: Mapped[str] = mapped_column(Text, default="[]")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    price_known: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1")
    rating_known: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1")
    source: Mapped[str] = mapped_column(String(20), default="curated", server_default="curated")
    source_ref: Mapped[Optional[str]] = mapped_column(String(160), nullable=True, index=True)
    checked: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1")

    # Relationships
    destination_rel: Mapped["Destination"] = relationship("Destination", back_populates="hotels")

    @property
    def amenities(self) -> list:
        return _json_get(self.amenities_json)

    @amenities.setter
    def amenities(self, value):
        self.amenities_json = _json_set(value)


# ---------------------------------------------------------------------------
# Users (Android Phase 2: accounts and privacy)
# ---------------------------------------------------------------------------

class User(Base):
    """An app account. Identity lives in Supabase Auth; `auth_subject` is its JWT `sub`."""
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    auth_subject: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    # Informational copy from the token. Not unique: Supabase owns email identity.
    email: Mapped[Optional[str]] = mapped_column(String(320), nullable=True, index=True)
    # Stored lowercase (allowed characters a-z 0-9 . _), so uniqueness is case-insensitive.
    username: Mapped[Optional[str]] = mapped_column(String(20), unique=True, nullable=True)
    display_name: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    avatar_key: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    home_country_iso2: Mapped[Optional[str]] = mapped_column(String(2), nullable=True)
    discoverable: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    # Opaque, rotatable code for QR / invite links; never the internal id.
    friend_code: Mapped[str] = mapped_column(String(16), unique=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    settings: Mapped[Optional["UserSettings"]] = relationship(
        "UserSettings", back_populates="user", uselist=False, cascade="all, delete-orphan"
    )


class UserSettings(Base):
    """Account-level preferences synced across devices."""
    __tablename__ = "user_settings"

    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    language: Mapped[Optional[str]] = mapped_column(String(5), nullable=True)  # null = follow the device
    appearance: Mapped[str] = mapped_column(String(10), default="system", nullable=False)
    haptics: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    units: Mapped[str] = mapped_column(String(2), default="km", nullable=False)
    map_theme: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    # Push notifications (Phase 5)
    notify_friend_requests: Mapped[bool] = mapped_column(Boolean, default=True, server_default=sa_true(), nullable=False)
    notify_friend_accepted: Mapped[bool] = mapped_column(Boolean, default=True, server_default=sa_true(), nullable=False)
    # Chat: read ticks are mutual, so turning yours off also hides your friends' from you
    read_receipts: Mapped[bool] = mapped_column(Boolean, default=True, server_default=sa_true(), nullable=False)
    # Chat notifications (step 5; sent once push exists, step 9). Previews off: a notification only says who wrote
    notify_messages: Mapped[bool] = mapped_column(Boolean, default=True, server_default=sa_true(), nullable=False)
    notify_trip_rooms: Mapped[bool] = mapped_column(Boolean, default=True, server_default=sa_true(), nullable=False)
    notification_previews: Mapped[bool] = mapped_column(Boolean, default=True, server_default=sa_true(), nullable=False)
    # Friends see your current and coming trips (On the road, the chat header, your profile); off hides them all (C3, C7)
    share_trips_with_friends: Mapped[bool] = mapped_column(Boolean, default=True, server_default=sa_true(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    user: Mapped["User"] = relationship("User", back_populates="settings")


# ---------------------------------------------------------------------------
# Friends (Android Phase 5)
# ---------------------------------------------------------------------------

class FriendRequest(Base):
    """A request from one user to another. At most one pending request per direction."""
    __tablename__ = "friend_requests"
    __table_args__ = (
        Index(
            "uq_friend_requests_pending", "from_user_id", "to_user_id", unique=True,
            sqlite_where=text("status = 'pending'"), postgresql_where=text("status = 'pending'"),
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    from_user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    to_user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(10), default="pending", nullable=False)  # pending / accepted / declined / cancelled
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    responded_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)


class Friendship(Base):
    """An accepted friendship, stored once with the smaller user id first."""
    __tablename__ = "friendships"
    __table_args__ = (CheckConstraint("user_a_id < user_b_id", name="ck_friendships_ordered"),)

    user_a_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    user_b_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)


class Block(Base):
    """`blocker` blocked `blocked`: hidden from each other's search, requests rejected."""
    __tablename__ = "blocks"

    blocker_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    blocked_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)


class Device(Base):
    """A signed-in install that can receive push notifications (Expo push token)."""
    __tablename__ = "devices"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    expo_push_token: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    platform: Mapped[str] = mapped_column(String(10), nullable=False)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)


# ---------------------------------------------------------------------------
# Chat (docs/friends-chat-plan.md). SQLite doesn't enforce the ON DELETE rules,
# so app.services.chat deletes chat data explicitly.
# ---------------------------------------------------------------------------

class Conversation(Base):
    """A chat: one per pair of friends (`direct`), or one per trip (`trip`, step 7)."""
    __tablename__ = "conversations"
    __table_args__ = (
        CheckConstraint("kind IN ('direct', 'trip')", name="ck_conversations_kind"),
        CheckConstraint("(kind = 'direct') = (direct_key IS NOT NULL)", name="ck_conversations_direct_key"),
        CheckConstraint("(kind = 'trip') = (trip_id IS NOT NULL)", name="ck_conversations_trip"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    kind: Mapped[str] = mapped_column(String(10), nullable=False)
    # The two user ids as friendships store them ("smaller hex:larger hex"), so a pair has one chat
    direct_key: Mapped[Optional[str]] = mapped_column(String(65), unique=True, nullable=True)
    trip_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("trips.id", ondelete="CASCADE"), unique=True, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)


class ConversationMember(Base):
    """A member of a chat, with their own state in it. Message ids only grow, so positions are ids."""
    __tablename__ = "conversation_members"

    conversation_id: Mapped[int] = mapped_column(Integer, ForeignKey("conversations.id", ondelete="CASCADE"), primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True, index=True)
    role: Mapped[str] = mapped_column(String(10), default="member", nullable=False)  # owner / member
    last_read_message_id: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    # "Delete chat" for this member only: messages up to this id are hidden from them
    cleared_up_to_id: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    muted_until: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    joined_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)


class Message(Base):
    """
    One message; `id` orders a chat. A system line ("Nusrat joined") has no sender.
    Unsending clears `body` and `payload` and sets `deleted_at`.
    """
    __tablename__ = "messages"
    __table_args__ = (
        Index("ix_messages_conversation_id_id", "conversation_id", "id"),
        # The app's id for a message it sends: a retry returns the first message instead of a copy
        UniqueConstraint("sender_id", "client_id", name="uq_messages_sender_client"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    conversation_id: Mapped[int] = mapped_column(Integer, ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False)
    sender_id: Mapped[Optional[uuid.UUID]] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=True)
    client_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    kind: Mapped[str] = mapped_column(String(16), default="text", nullable=False)  # text, system; cards from step 4
    body: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    payload: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    reply_to_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("messages.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    deleted_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)


class MessageReaction(Base):
    """One reaction per person per message (step 5)."""
    __tablename__ = "message_reactions"

    message_id: Mapped[int] = mapped_column(Integer, ForeignKey("messages.id", ondelete="CASCADE"), primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True, index=True)
    reaction: Mapped[str] = mapped_column(String(16), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)


class LiveLocation(Base):
    """
    Someone sharing their live location with a trip room (step 8): only the latest point,
    never a history. Deleted on Stop, when it runs out, or when they leave the room.
    """
    __tablename__ = "live_locations"

    conversation_id: Mapped[int] = mapped_column(Integer, ForeignKey("conversations.id", ondelete="CASCADE"), primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True, index=True)
    # The card in the room that shows it
    message_id: Mapped[int] = mapped_column(Integer, ForeignKey("messages.id", ondelete="CASCADE"), nullable=False, unique=True)
    lat: Mapped[float] = mapped_column(Float, nullable=False)
    lon: Mapped[float] = mapped_column(Float, nullable=False)
    accuracy_m: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, index=True)


class TripMember(Base):
    """
    Someone the owner invited to plan a trip together (step 7): `invited` until they
    join the trip's room, then `joined`. The owner isn't a row here (Trip.user_id is).
    Joined members read the trip and its plan; only the owner changes it (decision C1).
    """
    __tablename__ = "trip_members"
    __table_args__ = (CheckConstraint("status IN ('invited', 'joined')", name="ck_trip_members_status"),)

    trip_id: Mapped[int] = mapped_column(Integer, ForeignKey("trips.id", ondelete="CASCADE"), primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True, index=True)
    status: Mapped[str] = mapped_column(String(10), default="invited", nullable=False)
    invited_by: Mapped[Optional[uuid.UUID]] = mapped_column(Uuid, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    joined_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)


class TripSuggestion(Base):
    """
    What the owner did with a place suggested in a trip room (step 7). No row: still open.
    `added` keeps the day it went to and the stop it became.
    """
    __tablename__ = "trip_suggestions"
    __table_args__ = (CheckConstraint("status IN ('added', 'declined')", name="ck_trip_suggestions_status"),)

    message_id: Mapped[int] = mapped_column(Integer, ForeignKey("messages.id", ondelete="CASCADE"), primary_key=True)
    trip_id: Mapped[int] = mapped_column(Integer, ForeignKey("trips.id", ondelete="CASCADE"), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(10), nullable=False)
    day_number: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    item_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("itinerary_items.id", ondelete="SET NULL"), nullable=True)
    decided_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)


class MessageReport(Base):
    """
    Someone reported a message (step 5). The snapshot keeps what was reported even if
    it's unsent later; the message link goes when the message does.
    """
    __tablename__ = "message_reports"
    __table_args__ = (UniqueConstraint("message_id", "reporter_id", name="uq_message_reports_once"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    message_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("messages.id", ondelete="SET NULL"), nullable=True, index=True)
    conversation_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("conversations.id", ondelete="SET NULL"), nullable=True)
    reporter_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    reported_user_id: Mapped[Optional[uuid.UUID]] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True)
    reason: Mapped[str] = mapped_column(String(20), nullable=False)  # spam / harassment / inappropriate / scam / other
    note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    snapshot: Mapped[dict] = mapped_column(JSON, nullable=False)
    status: Mapped[str] = mapped_column(String(10), default="open", server_default="open", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)


class PollVote(Base):
    """A vote in a poll, or an answer to a trip idea (step 4)."""
    __tablename__ = "poll_votes"

    message_id: Mapped[int] = mapped_column(Integer, ForeignKey("messages.id", ondelete="CASCADE"), primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True, index=True)
    option_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)


# ---------------------------------------------------------------------------
# Geography reference data (Android Phase 3) and visits
# Seeded from data/geo/*.json (Natural Earth, Bangladesh point of view; GeoNames).
# ---------------------------------------------------------------------------

class Country(Base):
    __tablename__ = "countries"

    iso2: Mapped[str] = mapped_column(String(2), primary_key=True)
    iso3: Mapped[Optional[str]] = mapped_column(String(3), nullable=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    name_bn: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    continent: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    type: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    # Decision D6: the 193 UN members + 2 observers make up "the world" (195)
    counts_toward_world: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    label_lat: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    label_lon: Mapped[Optional[float]] = mapped_column(Float, nullable=True)


class Region(Base):
    """Admin-1 division (state, province, division). Code: ISO 3166-2, else Natural Earth adm1_code."""
    __tablename__ = "regions"

    code: Mapped[str] = mapped_column(String(20), primary_key=True)
    country_iso2: Mapped[str] = mapped_column(String(2), ForeignKey("countries.iso2"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    name_bn: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    type: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
    lat: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    lon: Mapped[Optional[float]] = mapped_column(Float, nullable=True)


class City(Base):
    """GeoNames populated place with at least 15,000 people."""
    __tablename__ = "cities"

    geonameid: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=False)
    country_iso2: Mapped[str] = mapped_column(String(2), ForeignKey("countries.iso2"), nullable=False, index=True)
    region_code: Mapped[Optional[str]] = mapped_column(String(20), ForeignKey("regions.code"), nullable=True, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False, index=True)
    lat: Mapped[float] = mapped_column(Float, nullable=False)
    lon: Mapped[float] = mapped_column(Float, nullable=False)
    population: Mapped[int] = mapped_column(Integer, default=0, nullable=False)


class Visit(Base):
    """A user's status for one place. `place_code`: ISO alpha-2, region code, or GeoNames id."""
    __tablename__ = "visits"
    __table_args__ = (
        UniqueConstraint("user_id", "place_type", "place_code", name="uq_visits_user_place"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    place_type: Mapped[str] = mapped_column(String(10), nullable=False)  # country / region / city
    place_code: Mapped[str] = mapped_column(String(20), nullable=False)
    status: Mapped[str] = mapped_column(String(10), nullable=False)  # visited / want / lived
    first_visited_on: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    last_visited_on: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class Photo(Base):
    """
    A user's photo of a place and/or a trip. The files live in the private bucket
    under random keys (`app/services/photos/storage.py`); EXIF is gone before upload.
    The API requires a place or a trip (no CHECK: it would fight the trip FK's SET NULL).
    """

    __tablename__ = "photos"
    __table_args__ = (
        Index("ix_photos_user_place", "user_id", "place_type", "place_code"),
        CheckConstraint("(place_type IS NULL) = (place_code IS NULL)", name="ck_photos_place_pair"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    storage_key: Mapped[str] = mapped_column(String(100), nullable=False)
    thumb_key: Mapped[str] = mapped_column(String(100), nullable=False)
    width: Mapped[int] = mapped_column(Integer, nullable=False)
    height: Mapped[int] = mapped_column(Integer, nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    taken_on: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    place_type: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)  # country / region / city
    place_code: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    trip_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("trips.id", ondelete="SET NULL"), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)


# ---------------------------------------------------------------------------
# Trip
# ---------------------------------------------------------------------------

class Trip(Base):
    """A user's planned trip."""
    __tablename__ = "trips"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    # Owner. Nullable only until pre-account trips are claimed or removed (decision D4);
    # the API never returns a trip without an owner.
    user_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True
    )
    title: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    destination: Mapped[str] = mapped_column(String(100), nullable=False)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    num_travelers: Mapped[int] = mapped_column(Integer, default=1)
    total_budget: Mapped[float] = mapped_column(Float, nullable=False)  # Total BDT
    currency: Mapped[str] = mapped_column(String(10), default="BDT")
    status: Mapped[str] = mapped_column(String(30), default="draft")  # draft / generated / saved
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    # The "mark these places as visited?" offer after the trip ends: None (not answered), "marked", "dismissed"
    visited_prompt: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)

    # Relationships
    stops: Mapped[List["TripStop"]] = relationship(
        "TripStop", back_populates="trip", cascade="all, delete-orphan", order_by="TripStop.position"
    )
    preference: Mapped[Optional["TripPreference"]] = relationship(
        "TripPreference", back_populates="trip", uselist=False, cascade="all, delete-orphan"
    )
    constraints: Mapped[Optional["TripConstraint"]] = relationship(
        "TripConstraint", back_populates="trip", uselist=False, cascade="all, delete-orphan"
    )
    itinerary_days: Mapped[List["Itinerary"]] = relationship(
        "Itinerary", back_populates="trip", cascade="all, delete-orphan",
        order_by="Itinerary.day_number"
    )
    feedback: Mapped[Optional["Feedback"]] = relationship(
        "Feedback", back_populates="trip", uselist=False, cascade="all, delete-orphan"
    )

    @property
    def num_days(self) -> int:
        return (self.end_date - self.start_date).days + 1


class TripStop(Base):
    """
    One stop of a trip, in order (decision D7). `transport_mode` is how the traveller
    gets to this stop. A stop names a GeoNames city, or only a country.
    """

    __tablename__ = "trip_stops"
    __table_args__ = (UniqueConstraint("trip_id", "position", name="uq_trip_stops_position"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    trip_id: Mapped[int] = mapped_column(Integer, ForeignKey("trips.id", ondelete="CASCADE"), nullable=False, index=True)
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    city_geonameid: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("cities.geonameid"), nullable=True)
    country_iso2: Mapped[str] = mapped_column(String(2), ForeignKey("countries.iso2"), nullable=False)
    transport_mode: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)  # plane / bus / train / car / boat / walk
    arrive_on: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    depart_on: Mapped[Optional[date]] = mapped_column(Date, nullable=True)

    trip: Mapped["Trip"] = relationship("Trip", back_populates="stops")
    city: Mapped[Optional["City"]] = relationship("City", lazy="joined")
    country: Mapped["Country"] = relationship("Country", lazy="joined")


# ---------------------------------------------------------------------------
# TripPreference
# ---------------------------------------------------------------------------

class TripPreference(Base):
    """User preferences tied to a trip."""
    __tablename__ = "trip_preferences"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    trip_id: Mapped[int] = mapped_column(Integer, ForeignKey("trips.id"), nullable=False)
    interests_json: Mapped[str] = mapped_column(Text, default="[]")
    travel_style: Mapped[str] = mapped_column(String(30), default="Balanced")  # Relaxed / Balanced / Packed
    activity_level: Mapped[str] = mapped_column(String(20), default="Medium")  # Low / Medium / High
    accommodation_preference: Mapped[str] = mapped_column(String(30), default="Standard")
    preferred_start_time: Mapped[str] = mapped_column(String(10), default="09:00")
    preferred_end_time: Mapped[str] = mapped_column(String(10), default="20:00")
    # The first day starts when you arrive and the last day ends when you leave (None = the usual times)
    arrive_time: Mapped[Optional[str]] = mapped_column(String(5), nullable=True)
    leave_time: Mapped[Optional[str]] = mapped_column(String(5), nullable=True)
    # The hotel the traveller chose (None = the best one at their accommodation level)
    hotel_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("hotels.id", ondelete="SET NULL"), nullable=True)

    trip: Mapped["Trip"] = relationship("Trip", back_populates="preference")

    @property
    def interests(self) -> list:
        return _json_get(self.interests_json)

    @interests.setter
    def interests(self, value):
        self.interests_json = _json_set(value)


# ---------------------------------------------------------------------------
# TripConstraint
# ---------------------------------------------------------------------------

class TripConstraint(Base):
    """Hard constraints for a trip."""
    __tablename__ = "trip_constraints"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    trip_id: Mapped[int] = mapped_column(Integer, ForeignKey("trips.id"), nullable=False)
    max_activities_per_day: Mapped[int] = mapped_column(Integer, default=4)
    max_daily_budget: Mapped[float] = mapped_column(Float, default=0.0)  # 0 = no cap
    # Must-sees: [{"place_id", "day" (1-based or null), "when" (morning/afternoon/sunset/evening or null),
    # "at" ("HH:MM" or null)}], in the order the traveller added them
    must_sees_json: Mapped[str] = mapped_column(Text, default="[]", server_default="[]")
    # Busy times: [{"day", "start", "end", "label"}]; nothing is planned then
    busy_json: Mapped[str] = mapped_column(Text, default="[]", server_default="[]")
    excluded_places_json: Mapped[str] = mapped_column(Text, default="[]")
    avoid_crowded: Mapped[bool] = mapped_column(Boolean, default=False)
    avoid_high_activity: Mapped[bool] = mapped_column(Boolean, default=False)

    trip: Mapped["Trip"] = relationship("Trip", back_populates="constraints")

    @property
    def must_sees(self) -> list:
        return _json_get(self.must_sees_json)

    @must_sees.setter
    def must_sees(self, value):
        rows = [v.model_dump() if hasattr(v, "model_dump") else dict(v) for v in (value or [])]
        self.must_sees_json = _json_set([
            {"place_id": r["place_id"], "day": r.get("day"), "when": r.get("when"), "at": r.get("at")} for r in rows
        ])

    @property
    def must_visit(self) -> list:
        """The must-see place ids (the plain list older clients use)."""
        return [m["place_id"] for m in self.must_sees]

    @must_visit.setter
    def must_visit(self, value):
        """Set the must-sees by id; places already listed keep their day and time."""
        current = {m["place_id"]: m for m in self.must_sees}
        self.must_sees = [current.get(pid, {"place_id": pid}) for pid in dict.fromkeys(value or [])]

    @property
    def busy(self) -> list:
        return _json_get(self.busy_json)

    @busy.setter
    def busy(self, value):
        rows = [v.model_dump() if hasattr(v, "model_dump") else dict(v) for v in (value or [])]
        self.busy_json = _json_set([
            {"day": r["day"], "start": r["start"], "end": r["end"], "label": r.get("label")} for r in rows
        ])

    @property
    def excluded_places(self) -> list:
        return _json_get(self.excluded_places_json)

    @excluded_places.setter
    def excluded_places(self, value):
        self.excluded_places_json = _json_set(value)


# ---------------------------------------------------------------------------
# Itinerary (one per day)
# ---------------------------------------------------------------------------

class Itinerary(Base):
    """Day-level itinerary container."""
    __tablename__ = "itineraries"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    trip_id: Mapped[int] = mapped_column(Integer, ForeignKey("trips.id"), nullable=False)
    day_number: Mapped[int] = mapped_column(Integer, nullable=False)
    day_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    theme: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    total_cost: Mapped[float] = mapped_column(Float, default=0.0)
    total_travel_time: Mapped[float] = mapped_column(Float, default=0.0)  # minutes

    trip: Mapped["Trip"] = relationship("Trip", back_populates="itinerary_days")
    items: Mapped[List["ItineraryItem"]] = relationship(
        "ItineraryItem", back_populates="itinerary", cascade="all, delete-orphan",
        order_by="ItineraryItem.start_time"
    )


# ---------------------------------------------------------------------------
# ItineraryItem
# ---------------------------------------------------------------------------

class ItineraryItem(Base):
    """A single scheduled activity slot."""
    __tablename__ = "itinerary_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    itinerary_id: Mapped[int] = mapped_column(Integer, ForeignKey("itineraries.id"), nullable=False)
    item_type: Mapped[str] = mapped_column(String(30), default="activity")  # activity / meal / transport / break
    place_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("places.id"), nullable=True)
    restaurant_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("restaurants.id"), nullable=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    start_time: Mapped[str] = mapped_column(String(10), nullable=False)  # "HH:MM"
    end_time: Mapped[str] = mapped_column(String(10), nullable=False)
    duration_minutes: Mapped[int] = mapped_column(Integer, default=60)
    cost: Mapped[float] = mapped_column(Float, default=0.0)
    travel_time_to_next: Mapped[float] = mapped_column(Float, default=0.0)  # minutes
    distance_to_next: Mapped[float] = mapped_column(Float, default=0.0)  # km
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    recommendation_score: Mapped[float] = mapped_column(Float, default=0.0)
    recommendation_reasons_json: Mapped[str] = mapped_column(Text, default="[]")
    order_index: Mapped[int] = mapped_column(Integer, default=0)
    # "Keep this time": refreshing the day or changing the whole plan leaves it where it is
    pinned: Mapped[bool] = mapped_column(Boolean, default=False, server_default=sa_false())
    # How the traveller goes from here to the next stop (walk / rickshaw / cng / car); None = chosen for them
    travel_mode: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    # Condition warnings the traveller chose to keep the stop despite ("Keep"): JSON list of warning keys
    kept_warnings_json: Mapped[str] = mapped_column(Text, default="[]", server_default="[]")

    @property
    def kept_warnings(self) -> list:
        return _json_get(self.kept_warnings_json)

    @kept_warnings.setter
    def kept_warnings(self, value):
        self.kept_warnings_json = _json_set(list(dict.fromkeys(value or [])))

    itinerary: Mapped["Itinerary"] = relationship("Itinerary", back_populates="items")
    place: Mapped[Optional["Place"]] = relationship("Place")
    restaurant: Mapped[Optional["Restaurant"]] = relationship("Restaurant")

    @property
    def recommendation_reasons(self) -> list:
        return _json_get(self.recommendation_reasons_json)

    @recommendation_reasons.setter
    def recommendation_reasons(self, value):
        self.recommendation_reasons_json = _json_set(value)


# ---------------------------------------------------------------------------
# Feedback
# ---------------------------------------------------------------------------

class Feedback(Base):
    """User rating and feedback for a trip."""
    __tablename__ = "feedback"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    trip_id: Mapped[int] = mapped_column(Integer, ForeignKey("trips.id"), nullable=False)
    rating: Mapped[int] = mapped_column(Integer, default=0)  # 1–5
    tags_json: Mapped[str] = mapped_column(Text, default="[]")
    comment: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    trip: Mapped["Trip"] = relationship("Trip", back_populates="feedback")

    @property
    def tags(self) -> list:
        return _json_get(self.tags_json)

    @tags.setter
    def tags(self, value):
        self.tags_json = _json_set(value)


# ---------------------------------------------------------------------------
# DocumentChunk (for RAG)
# ---------------------------------------------------------------------------

class SourceDocument(Base):
    """A source document for RAG ingestion."""
    __tablename__ = "source_documents"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    source_type: Mapped[str] = mapped_column(String(50), nullable=False)  # guide / review / article
    url: Mapped[Optional[str]] = mapped_column(String(1000), nullable=True)
    destination_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True, index=True)
    content_hash: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    ingested_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    chunks: Mapped[List["DocumentChunk"]] = relationship(
        "DocumentChunk", back_populates="source", cascade="all, delete-orphan"
    )


class DocumentChunk(Base):
    """A chunk of a source document with embedding metadata."""
    __tablename__ = "document_chunks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    source_id: Mapped[int] = mapped_column(Integer, ForeignKey("source_documents.id"), nullable=False)
    chunk_index: Mapped[int] = mapped_column(Integer, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    metadata_json: Mapped[str] = mapped_column(Text, default="{}")
    embedding_model: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    # Note: actual vector column added via pgvector when PostgreSQL is used
    # For SQLite development, embeddings stored as JSON text
    embedding_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    source: Mapped["SourceDocument"] = relationship("SourceDocument", back_populates="chunks")

    __table_args__ = (
        Index("ix_chunks_source_index", "source_id", "chunk_index"),
    )


# ---------------------------------------------------------------------------
# Road distances and times (trip planner step 5)
# ---------------------------------------------------------------------------

class RouteCache(Base):
    """
    A road distance and driving time between two points, from the routing service,
    kept so each is asked for once. `geometry` (a JSON list of [lon, lat]) is filled
    when the road line itself was fetched. Points are rounded to 5 decimals (about 1 m).
    """
    __tablename__ = "route_cache"
    __table_args__ = (
        UniqueConstraint("profile", "from_lat", "from_lon", "to_lat", "to_lon", name="uq_route_cache_pair"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    provider: Mapped[str] = mapped_column(String(20), nullable=False)
    profile: Mapped[str] = mapped_column(String(20), nullable=False)       # driving-car
    from_lat: Mapped[float] = mapped_column(Float, nullable=False)
    from_lon: Mapped[float] = mapped_column(Float, nullable=False)
    to_lat: Mapped[float] = mapped_column(Float, nullable=False)
    to_lon: Mapped[float] = mapped_column(Float, nullable=False)
    distance_km: Mapped[Optional[float]] = mapped_column(Float, nullable=True)   # None: no road between them
    duration_min: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    geometry_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


# ---------------------------------------------------------------------------
# Live conditions (trip planner step 6)
# ---------------------------------------------------------------------------

class ConditionsCache(Base):
    """
    The last weather or sea forecast fetched for a spot (`kind`: forecast / marine), kept so
    it's asked for at most every 30 minutes and still shown (with its age) when a refresh fails.
    Spots are rounded to 2 decimals (about 1 km).
    """
    __tablename__ = "conditions_cache"
    __table_args__ = (UniqueConstraint("kind", "lat", "lon", name="uq_conditions_cache_spot"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    kind: Mapped[str] = mapped_column(String(20), nullable=False)
    lat: Mapped[float] = mapped_column(Float, nullable=False)
    lon: Mapped[float] = mapped_column(Float, nullable=False)
    payload_json: Mapped[str] = mapped_column(Text, nullable=False)
    fetched_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)

"""
Vromon Backend — SQLAlchemy ORM Models.

All entities for the travel planning system. Evolved from demo models
with improved typing, relationships, and PostgreSQL compatibility.
"""

from __future__ import annotations

import json
from datetime import datetime, date
from typing import Optional, List

from sqlalchemy import (
    Integer, String, Float, Boolean, DateTime, Date,
    Text, ForeignKey, Index, Numeric,
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

    # Relationships
    destination_rel: Mapped["Destination"] = relationship("Destination", back_populates="hotels")

    @property
    def amenities(self) -> list:
        return _json_get(self.amenities_json)

    @amenities.setter
    def amenities(self, value):
        self.amenities_json = _json_set(value)


# ---------------------------------------------------------------------------
# Trip
# ---------------------------------------------------------------------------

class Trip(Base):
    """A user's planned trip."""
    __tablename__ = "trips"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
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

    # Relationships
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
    must_visit_json: Mapped[str] = mapped_column(Text, default="[]")
    excluded_places_json: Mapped[str] = mapped_column(Text, default="[]")
    avoid_crowded: Mapped[bool] = mapped_column(Boolean, default=False)
    avoid_high_activity: Mapped[bool] = mapped_column(Boolean, default=False)

    trip: Mapped["Trip"] = relationship("Trip", back_populates="constraints")

    @property
    def must_visit(self) -> list:
        return _json_get(self.must_visit_json)

    @must_visit.setter
    def must_visit(self, value):
        self.must_visit_json = _json_set(value)

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

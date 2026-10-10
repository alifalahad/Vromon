"""
SQLAlchemy ORM models for Vromon.

Entities:
  Place        – Attractions / activities
  Restaurant   – Dining options
  Hotel        – Accommodation options
  Trip         – A user's planned trip
  TripPreference – Preferences tied to a trip
  TripConstraint – Hard constraints for a trip
  Itinerary    – Day-level container
  ItineraryItem – A single scheduled activity slot
  Feedback     – User rating + tags for a trip
"""

import json
from datetime import datetime, date
from sqlalchemy import (
    Column, Integer, String, Float, Boolean,
    DateTime, Date, Text, ForeignKey
)
from sqlalchemy.orm import relationship
from app.database.database import Base


# ---------------------------------------------------------------------------
# Helper: store list/dict fields as JSON text in SQLite
# ---------------------------------------------------------------------------
class JSONColumn(Text):
    """Custom type that transparently serialises/deserialises JSON."""


def _json_get(value: str | None):
    if value is None:
        return []
    try:
        return json.loads(value)
    except Exception:
        return []


def _json_set(value):
    if value is None:
        return "[]"
    return json.dumps(value)


# ---------------------------------------------------------------------------
# Place
# ---------------------------------------------------------------------------
class Place(Base):
    __tablename__ = "places"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    destination = Column(String(100), nullable=False, index=True)
    category = Column(String(50), nullable=False)
    description = Column(Text)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    rating = Column(Float, default=4.0)
    review_count = Column(Integer, default=0)
    average_visit_duration = Column(Float, default=1.5)   # hours
    estimated_cost = Column(Float, default=0.0)            # BDT per person
    opening_time = Column(String(10), default="08:00")
    closing_time = Column(String(10), default="18:00")
    best_time = Column(String(100))
    crowd_level = Column(String(20), default="Medium")     # Low / Medium / High
    activity_level = Column(String(20), default="Medium")  # Low / Medium / High
    tags_json = Column(Text, default="[]")                 # JSON list
    image_url = Column(String(500))
    is_active = Column(Boolean, default=True)

    @property
    def tags(self):
        return _json_get(self.tags_json)

    @tags.setter
    def tags(self, value):
        self.tags_json = _json_set(value)


# ---------------------------------------------------------------------------
# Restaurant
# ---------------------------------------------------------------------------
class Restaurant(Base):
    __tablename__ = "restaurants"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    destination = Column(String(100), nullable=False, index=True)
    cuisine = Column(String(100))
    price_level = Column(String(20), default="Medium")     # Budget / Medium / Premium
    rating = Column(Float, default=4.0)
    review_count = Column(Integer, default=0)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    average_meal_cost = Column(Float, default=300.0)       # BDT per person
    opening_time = Column(String(10), default="07:00")
    closing_time = Column(String(10), default="22:00")
    tags_json = Column(Text, default="[]")
    description = Column(Text)
    is_active = Column(Boolean, default=True)

    @property
    def tags(self):
        return _json_get(self.tags_json)

    @tags.setter
    def tags(self, value):
        self.tags_json = _json_set(value)


# ---------------------------------------------------------------------------
# Hotel
# ---------------------------------------------------------------------------
class Hotel(Base):
    __tablename__ = "hotels"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    destination = Column(String(100), nullable=False, index=True)
    category = Column(String(50), default="Standard")    # Budget / Standard / Luxury
    price_per_night = Column(Float, default=2000.0)      # BDT
    rating = Column(Float, default=4.0)
    review_count = Column(Integer, default=0)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    description = Column(Text)
    amenities_json = Column(Text, default="[]")
    is_active = Column(Boolean, default=True)

    @property
    def amenities(self):
        return _json_get(self.amenities_json)

    @amenities.setter
    def amenities(self, value):
        self.amenities_json = _json_set(value)


# ---------------------------------------------------------------------------
# Trip
# ---------------------------------------------------------------------------
class Trip(Base):
    __tablename__ = "trips"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(200))
    destination = Column(String(100), nullable=False)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    num_travelers = Column(Integer, default=1)
    total_budget = Column(Float, nullable=False)          # BDT total
    status = Column(String(30), default="draft")          # draft / generated / saved
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    preference = relationship("TripPreference", back_populates="trip", uselist=False, cascade="all, delete-orphan")
    constraints = relationship("TripConstraint", back_populates="trip", uselist=False, cascade="all, delete-orphan")
    itinerary_days = relationship("Itinerary", back_populates="trip", cascade="all, delete-orphan", order_by="Itinerary.day_number")
    feedback = relationship("Feedback", back_populates="trip", uselist=False, cascade="all, delete-orphan")

    @property
    def num_days(self):
        return (self.end_date - self.start_date).days + 1


# ---------------------------------------------------------------------------
# TripPreference
# ---------------------------------------------------------------------------
class TripPreference(Base):
    __tablename__ = "trip_preferences"

    id = Column(Integer, primary_key=True, index=True)
    trip_id = Column(Integer, ForeignKey("trips.id"), nullable=False)
    interests_json = Column(Text, default="[]")          # e.g. ["Beach","Nature"]
    travel_style = Column(String(30), default="Balanced") # Relaxed / Balanced / Packed
    activity_level = Column(String(20), default="Medium") # Low / Medium / High
    accommodation_preference = Column(String(30), default="Standard")
    preferred_start_time = Column(String(10), default="09:00")
    preferred_end_time = Column(String(10), default="20:00")

    trip = relationship("Trip", back_populates="preference")

    @property
    def interests(self):
        return _json_get(self.interests_json)

    @interests.setter
    def interests(self, value):
        self.interests_json = _json_set(value)


# ---------------------------------------------------------------------------
# TripConstraint
# ---------------------------------------------------------------------------
class TripConstraint(Base):
    __tablename__ = "trip_constraints"

    id = Column(Integer, primary_key=True, index=True)
    trip_id = Column(Integer, ForeignKey("trips.id"), nullable=False)
    max_activities_per_day = Column(Integer, default=4)
    max_daily_budget = Column(Float, default=0.0)        # 0 = no hard cap
    must_visit_json = Column(Text, default="[]")         # list of place IDs
    excluded_places_json = Column(Text, default="[]")    # list of place IDs
    avoid_crowded = Column(Boolean, default=False)
    avoid_high_activity = Column(Boolean, default=False)

    trip = relationship("Trip", back_populates="constraints")

    @property
    def must_visit(self):
        return _json_get(self.must_visit_json)

    @must_visit.setter
    def must_visit(self, value):
        self.must_visit_json = _json_set(value)

    @property
    def excluded_places(self):
        return _json_get(self.excluded_places_json)

    @excluded_places.setter
    def excluded_places(self, value):
        self.excluded_places_json = _json_set(value)


# ---------------------------------------------------------------------------
# Itinerary (one per day)
# ---------------------------------------------------------------------------
class Itinerary(Base):
    __tablename__ = "itineraries"

    id = Column(Integer, primary_key=True, index=True)
    trip_id = Column(Integer, ForeignKey("trips.id"), nullable=False)
    day_number = Column(Integer, nullable=False)
    day_date = Column(Date)
    theme = Column(String(200))
    total_cost = Column(Float, default=0.0)
    total_travel_time = Column(Float, default=0.0)       # minutes

    trip = relationship("Trip", back_populates="itinerary_days")
    items = relationship("ItineraryItem", back_populates="itinerary", cascade="all, delete-orphan", order_by="ItineraryItem.start_time")


# ---------------------------------------------------------------------------
# ItineraryItem
# ---------------------------------------------------------------------------
class ItineraryItem(Base):
    __tablename__ = "itinerary_items"

    id = Column(Integer, primary_key=True, index=True)
    itinerary_id = Column(Integer, ForeignKey("itineraries.id"), nullable=False)
    item_type = Column(String(30), default="activity")   # activity / meal / transport / break
    place_id = Column(Integer, ForeignKey("places.id"), nullable=True)
    restaurant_id = Column(Integer, ForeignKey("restaurants.id"), nullable=True)
    title = Column(String(200), nullable=False)
    start_time = Column(String(10), nullable=False)      # "HH:MM"
    end_time = Column(String(10), nullable=False)
    duration_minutes = Column(Integer, default=60)
    cost = Column(Float, default=0.0)
    travel_time_to_next = Column(Float, default=0.0)     # minutes
    distance_to_next = Column(Float, default=0.0)        # km
    notes = Column(Text)
    recommendation_score = Column(Float, default=0.0)
    recommendation_reasons_json = Column(Text, default="[]")
    order_index = Column(Integer, default=0)

    itinerary = relationship("Itinerary", back_populates="items")
    place = relationship("Place")
    restaurant = relationship("Restaurant")

    @property
    def recommendation_reasons(self):
        return _json_get(self.recommendation_reasons_json)

    @recommendation_reasons.setter
    def recommendation_reasons(self, value):
        self.recommendation_reasons_json = _json_set(value)


# ---------------------------------------------------------------------------
# Feedback
# ---------------------------------------------------------------------------
class Feedback(Base):
    __tablename__ = "feedback"

    id = Column(Integer, primary_key=True, index=True)
    trip_id = Column(Integer, ForeignKey("trips.id"), nullable=False)
    rating = Column(Integer, default=0)                  # 1–5
    tags_json = Column(Text, default="[]")               # ["Too expensive", ...]
    comment = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)

    trip = relationship("Trip", back_populates="feedback")

    @property
    def tags(self):
        return _json_get(self.tags_json)

    @tags.setter
    def tags(self, value):
        self.tags_json = _json_set(value)

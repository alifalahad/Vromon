"""
Vromon Backend — Pydantic schemas for request/response validation.

All API input/output is validated and serialized through these schemas.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import List, Optional
from pydantic import BaseModel, Field, field_validator


# ---------------------------------------------------------------------------
# Destination schemas
# ---------------------------------------------------------------------------

class DestinationOut(BaseModel):
    id: int
    name: str
    country: str
    description: Optional[str] = None
    latitude: float
    longitude: float
    image_url: Optional[str] = None
    place_count: int = 0

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Place schemas
# ---------------------------------------------------------------------------

class PlaceBase(BaseModel):
    name: str
    category: str
    description: Optional[str] = None
    latitude: float
    longitude: float
    rating: float = 4.0
    review_count: int = 0
    average_visit_duration: float = 1.5
    estimated_cost: float = 0.0
    currency: str = "BDT"
    opening_time: str = "08:00"
    closing_time: str = "18:00"
    best_time: Optional[str] = None
    crowd_level: str = "Medium"
    activity_level: str = "Medium"
    tags: List[str] = []
    image_url: Optional[str] = None


class PlaceOut(PlaceBase):
    id: int
    destination_name: str

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Restaurant schemas
# ---------------------------------------------------------------------------

class RestaurantOut(BaseModel):
    id: int
    name: str
    destination_name: str
    cuisine: Optional[str] = None
    price_level: str = "Medium"
    rating: float = 4.0
    review_count: int = 0
    latitude: float = 0.0
    longitude: float = 0.0
    average_meal_cost: float = 300.0
    currency: str = "BDT"
    opening_time: str = "07:00"
    closing_time: str = "22:00"
    tags: List[str] = []
    description: Optional[str] = None

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Hotel schemas
# ---------------------------------------------------------------------------

class HotelOut(BaseModel):
    id: int
    name: str
    destination_name: str
    category: str = "Standard"
    price_per_night: float = 2000.0
    currency: str = "BDT"
    rating: float = 4.0
    review_count: int = 0
    latitude: float = 0.0
    longitude: float = 0.0
    description: Optional[str] = None
    amenities: List[str] = []

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Trip creation schemas
# ---------------------------------------------------------------------------

class TripPreferenceCreate(BaseModel):
    interests: List[str] = []
    travel_style: str = "Balanced"
    activity_level: str = "Medium"
    accommodation_preference: str = "Standard"
    preferred_start_time: str = "09:00"
    preferred_end_time: str = "20:00"

    @field_validator("travel_style")
    @classmethod
    def valid_style(cls, v):
        allowed = {"Relaxed", "Balanced", "Packed"}
        if v not in allowed:
            raise ValueError(f"travel_style must be one of {allowed}")
        return v

    @field_validator("activity_level")
    @classmethod
    def valid_activity(cls, v):
        allowed = {"Low", "Medium", "High"}
        if v not in allowed:
            raise ValueError(f"activity_level must be one of {allowed}")
        return v


class TripConstraintCreate(BaseModel):
    max_activities_per_day: int = Field(default=4, ge=1, le=10)
    max_daily_budget: float = Field(default=0.0, ge=0)
    must_visit: List[int] = []
    excluded_places: List[int] = []
    avoid_crowded: bool = False
    avoid_high_activity: bool = False


class TripCreate(BaseModel):
    destination: str
    start_date: date
    end_date: date
    num_travelers: int = Field(default=1, ge=1, le=50)
    total_budget: float = Field(gt=0)
    preference: TripPreferenceCreate = TripPreferenceCreate()
    constraints: TripConstraintCreate = TripConstraintCreate()

    @field_validator("end_date")
    @classmethod
    def end_after_start(cls, v, info):
        if "start_date" in info.data and v < info.data["start_date"]:
            raise ValueError("end_date must be on or after start_date")
        return v


class TripUpdate(BaseModel):
    title: Optional[str] = None
    status: Optional[str] = None
    preference: Optional[TripPreferenceCreate] = None
    constraints: Optional[TripConstraintCreate] = None


# ---------------------------------------------------------------------------
# ItineraryItem output
# ---------------------------------------------------------------------------

class ItineraryItemOut(BaseModel):
    id: int
    item_type: str
    place_id: Optional[int] = None
    restaurant_id: Optional[int] = None
    title: str
    start_time: str
    end_time: str
    duration_minutes: int
    cost: float
    travel_time_to_next: float
    distance_to_next: float
    notes: Optional[str] = None
    recommendation_score: float
    recommendation_reasons: List[str] = []
    order_index: int
    place: Optional[PlaceOut] = None
    restaurant: Optional[RestaurantOut] = None

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Itinerary day output
# ---------------------------------------------------------------------------

class ItineraryDayOut(BaseModel):
    id: int
    trip_id: int
    day_number: int
    day_date: Optional[date] = None
    theme: Optional[str] = None
    total_cost: float
    total_travel_time: float
    items: List[ItineraryItemOut] = []

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Trip output
# ---------------------------------------------------------------------------

class TripPreferenceOut(BaseModel):
    id: int
    interests: List[str] = []
    travel_style: str
    activity_level: str
    accommodation_preference: str
    preferred_start_time: str
    preferred_end_time: str

    model_config = {"from_attributes": True}


class TripConstraintOut(BaseModel):
    id: int
    max_activities_per_day: int
    max_daily_budget: float
    must_visit: List[int] = []
    excluded_places: List[int] = []
    avoid_crowded: bool
    avoid_high_activity: bool

    model_config = {"from_attributes": True}


class TripOut(BaseModel):
    id: int
    title: Optional[str] = None
    destination: str
    start_date: date
    end_date: date
    num_travelers: int
    total_budget: float
    currency: str = "BDT"
    status: str
    created_at: datetime
    updated_at: datetime
    num_days: int
    preference: Optional[TripPreferenceOut] = None
    constraints: Optional[TripConstraintOut] = None
    itinerary_days: List[ItineraryDayOut] = []
    feedback: Optional["FeedbackOut"] = None

    model_config = {"from_attributes": True}


class TripSummaryOut(BaseModel):
    id: int
    title: Optional[str] = None
    destination: str
    start_date: date
    end_date: date
    num_travelers: int
    total_budget: float
    currency: str = "BDT"
    status: str
    num_days: int
    created_at: datetime

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Feedback
# ---------------------------------------------------------------------------

class FeedbackCreate(BaseModel):
    rating: int = Field(ge=1, le=5)
    tags: List[str] = []
    comment: Optional[str] = None


class FeedbackOut(BaseModel):
    id: int
    trip_id: int
    rating: int
    tags: List[str] = []
    comment: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Adaptation request
# ---------------------------------------------------------------------------

class AdaptRequest(BaseModel):
    adaptation_type: str  # "relax" | "reduce_budget" | "avoid_crowds" | "energise"
    parameters: dict = {}

    @field_validator("adaptation_type")
    @classmethod
    def valid_type(cls, v):
        allowed = {"relax", "reduce_budget", "avoid_crowds", "energise"}
        if v not in allowed:
            raise ValueError(f"adaptation_type must be one of {allowed}")
        return v


# ---------------------------------------------------------------------------
# Recommendation request/response
# ---------------------------------------------------------------------------

class RecommendationRequest(BaseModel):
    destination: str
    interests: List[str] = []
    travel_style: str = "Balanced"
    activity_level: str = "Medium"
    daily_budget: float = 5000.0
    avoid_crowded: bool = False
    exclude_ids: List[int] = []
    limit: int = Field(default=10, ge=1, le=50)


class ScoredPlace(BaseModel):
    place: PlaceOut
    score: float
    reasons: List[str]


class RecommendationResponse(BaseModel):
    recommendations: List[ScoredPlace]
    total_considered: int
    algorithm: str = "weighted_scoring_v1"


# ---------------------------------------------------------------------------
# Generation meta
# ---------------------------------------------------------------------------

class GenerationMeta(BaseModel):
    total_places_considered: int
    places_matched: int
    places_selected: int
    constraint_violations: int
    estimated_total_cost: float
    algorithm: str = "heuristic_v1"
    warnings: List[str] = []

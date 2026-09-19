"""
Pydantic schemas for request/response validation.
"""

from __future__ import annotations
from datetime import date, datetime
from typing import List, Optional, Any
from pydantic import BaseModel, field_validator, model_validator


# ---------------------------------------------------------------------------
# Place schemas
# ---------------------------------------------------------------------------
class PlaceBase(BaseModel):
    name: str
    destination: str
    category: str
    description: Optional[str] = None
    latitude: float
    longitude: float
    rating: float = 4.0
    review_count: int = 0
    average_visit_duration: float = 1.5
    estimated_cost: float = 0.0
    opening_time: str = "08:00"
    closing_time: str = "18:00"
    best_time: Optional[str] = None
    crowd_level: str = "Medium"
    activity_level: str = "Medium"
    tags: List[str] = []
    image_url: Optional[str] = None


class PlaceOut(PlaceBase):
    id: int

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Restaurant schemas
# ---------------------------------------------------------------------------
class RestaurantOut(BaseModel):
    id: int
    name: str
    destination: str
    cuisine: Optional[str]
    price_level: str
    rating: float
    review_count: int
    latitude: float
    longitude: float
    average_meal_cost: float
    opening_time: str
    closing_time: str
    tags: List[str] = []
    description: Optional[str]

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Hotel schemas
# ---------------------------------------------------------------------------
class HotelOut(BaseModel):
    id: int
    name: str
    destination: str
    category: str
    price_per_night: float
    rating: float
    review_count: int
    latitude: float
    longitude: float
    description: Optional[str]
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


class TripConstraintCreate(BaseModel):
    max_activities_per_day: int = 4
    max_daily_budget: float = 0.0
    must_visit: List[int] = []      # place IDs
    excluded_places: List[int] = []  # place IDs
    avoid_crowded: bool = False
    avoid_high_activity: bool = False


class TripCreate(BaseModel):
    destination: str
    start_date: date
    end_date: date
    num_travelers: int = 1
    total_budget: float
    preference: TripPreferenceCreate = TripPreferenceCreate()
    constraints: TripConstraintCreate = TripConstraintCreate()

    @field_validator("end_date")
    @classmethod
    def end_after_start(cls, v, info):
        if "start_date" in info.data and v < info.data["start_date"]:
            raise ValueError("end_date must be on or after start_date")
        return v

    @field_validator("total_budget")
    @classmethod
    def positive_budget(cls, v):
        if v <= 0:
            raise ValueError("total_budget must be positive")
        return v

    @field_validator("num_travelers")
    @classmethod
    def positive_travelers(cls, v):
        if v <= 0:
            raise ValueError("num_travelers must be at least 1")
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
    place_id: Optional[int]
    restaurant_id: Optional[int]
    title: str
    start_time: str
    end_time: str
    duration_minutes: int
    cost: float
    travel_time_to_next: float
    distance_to_next: float
    notes: Optional[str]
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
    day_date: Optional[date]
    theme: Optional[str]
    total_cost: float
    total_travel_time: float
    items: List[ItineraryItemOut] = []

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Trip output (full)
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
    title: Optional[str]
    destination: str
    start_date: date
    end_date: date
    num_travelers: int
    total_budget: float
    status: str
    created_at: datetime
    updated_at: datetime
    num_days: int
    preference: Optional[TripPreferenceOut] = None
    constraints: Optional[TripConstraintOut] = None
    itinerary_days: List[ItineraryDayOut] = []

    model_config = {"from_attributes": True}


class TripSummaryOut(BaseModel):
    id: int
    title: Optional[str]
    destination: str
    start_date: date
    end_date: date
    num_travelers: int
    total_budget: float
    status: str
    num_days: int
    created_at: datetime

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Feedback
# ---------------------------------------------------------------------------
class FeedbackCreate(BaseModel):
    rating: int
    tags: List[str] = []
    comment: Optional[str] = None

    @field_validator("rating")
    @classmethod
    def valid_rating(cls, v):
        if v < 1 or v > 5:
            raise ValueError("rating must be between 1 and 5")
        return v


class FeedbackOut(BaseModel):
    id: int
    trip_id: int
    rating: int
    tags: List[str] = []
    comment: Optional[str]
    created_at: datetime

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Adaptation request
# ---------------------------------------------------------------------------
class AdaptRequest(BaseModel):
    adaptation_type: str   # "relax" | "reduce_budget" | "avoid_crowds" | "energise"
    parameters: dict = {}


# ---------------------------------------------------------------------------
# Recommendation request
# ---------------------------------------------------------------------------
class RecommendationRequest(BaseModel):
    destination: str
    interests: List[str]
    travel_style: str = "Balanced"
    activity_level: str = "Medium"
    daily_budget: float = 5000.0
    avoid_crowded: bool = False
    exclude_ids: List[int] = []
    limit: int = 10


class ScoredPlace(BaseModel):
    place: PlaceOut
    score: float
    reasons: List[str]


class RecommendationResponse(BaseModel):
    recommendations: List[ScoredPlace]
    total_considered: int
    algorithm: str = "weighted_scoring_v1"


# ---------------------------------------------------------------------------
# Generation meta (returned alongside itinerary)
# ---------------------------------------------------------------------------
class GenerationMeta(BaseModel):
    total_places_considered: int
    places_matched: int
    places_selected: int
    constraint_violations: int
    estimated_total_cost: float
    algorithm: str = "heuristic_v1"

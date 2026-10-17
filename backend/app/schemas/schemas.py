"""
Vromon Backend — Pydantic schemas for request/response validation.

All API input/output is validated and serialized through these schemas.
"""

from __future__ import annotations

from datetime import date, datetime
import re
import uuid
from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, Field, field_validator, model_validator

TIME_PATTERN = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")
MAX_TRIP_DAYS = 30


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

    @field_validator("preferred_start_time", "preferred_end_time")
    @classmethod
    def valid_time(cls, v):
        if not TIME_PATTERN.match(v):
            raise ValueError("time must be HH:MM in 24-hour format (00:00-23:59)")
        return v

    @field_validator("travel_style")
    @classmethod
    def valid_style(cls, v):
        allowed = {"Relaxed", "Balanced", "Packed", "Active"}
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
    must_visit: List[int] = Field(default_factory=list, max_length=50)
    excluded_places: List[int] = Field(default_factory=list, max_length=200)
    avoid_crowded: bool = False
    avoid_high_activity: bool = False

    @field_validator("must_visit", "excluded_places")
    @classmethod
    def positive_ids(cls, v):
        if any(i < 1 for i in v):
            raise ValueError("place IDs must be positive integers")
        return list(dict.fromkeys(v))  # drop duplicates, keep order


# ---------------------------------------------------------------------------
# Trip stops (decision D7)
# ---------------------------------------------------------------------------

TransportMode = Literal["plane", "bus", "train", "car", "boat", "walk"]
MAX_STOPS = 20


class TripStopIn(BaseModel):
    """A city (GeoNames id) or, failing that, just a country. The mode is how you get there."""
    city_geonameid: Optional[int] = None
    country_iso2: Optional[str] = Field(None, min_length=2, max_length=2)
    transport_mode: Optional[TransportMode] = None
    arrive_on: Optional[date] = None
    depart_on: Optional[date] = None

    @model_validator(mode="after")
    def place_and_dates(self):
        if self.city_geonameid is None and self.country_iso2 is None:
            raise ValueError("a stop needs a city or a country")
        if self.country_iso2:
            self.country_iso2 = self.country_iso2.upper()
        if self.arrive_on and self.depart_on and self.depart_on < self.arrive_on:
            raise ValueError("depart_on must be on or after arrive_on")
        return self


class TripStopsIn(BaseModel):
    stops: List[TripStopIn] = Field(min_length=1, max_length=MAX_STOPS)


class TripStopOut(BaseModel):
    position: int
    city_geonameid: Optional[int] = None
    city_name: Optional[str] = None
    country_iso2: str
    country_name: str
    transport_mode: Optional[str] = None
    arrive_on: Optional[date] = None
    depart_on: Optional[date] = None


class TripCreate(BaseModel):
    destination: str
    start_date: date
    end_date: date
    num_travelers: int = Field(default=1, ge=1, le=50)
    total_budget: float = Field(gt=0)
    preference: TripPreferenceCreate = TripPreferenceCreate()
    constraints: TripConstraintCreate = TripConstraintCreate()
    # Where the trip starts (optional) and how you get to the destination
    origin: Optional[TripStopIn] = None
    transport_mode: Optional[TransportMode] = None

    @field_validator("end_date")
    @classmethod
    def end_after_start(cls, v, info):
        if "start_date" in info.data and v < info.data["start_date"]:
            raise ValueError("end_date must be on or after start_date")
        return v

    @model_validator(mode="after")
    def trip_length(self):
        if (self.end_date - self.start_date).days + 1 > MAX_TRIP_DAYS:
            raise ValueError(f"trips can be at most {MAX_TRIP_DAYS} days long")
        return self


class TripUpdate(BaseModel):
    """Partial update: only fields present in the request are changed."""
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    status: Optional[Literal["draft", "generated", "saved"]] = None
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
    category: Optional[str] = None          # place category, or "Meal"
    currency: str = "BDT"
    # "data": cost comes from a place/restaurant record; "placeholder": no record, estimate only
    cost_source: Literal["data", "placeholder"] = "data"
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
# Validation and generation output
# ---------------------------------------------------------------------------

class ViolationOut(BaseModel):
    severity: Literal["hard", "soft", "info"]  # info = data limitation, not a violation
    code: str
    message: str
    day_number: Optional[int] = None
    item_id: Optional[int] = None


class ValidationReportOut(BaseModel):
    trip_id: int
    valid: bool
    hard_violation_count: int
    soft_violation_count: int
    violations: List[ViolationOut] = []


# valid: no problems · valid_with_warnings: only preference (soft) warnings · invalid: hard violations
GenerationStatus = Literal["valid", "valid_with_warnings", "invalid"]


class GenerateMeta(BaseModel):
    total_places_selected: int
    estimated_total_activity_cost: float      # per person, activities only
    estimated_total_cost_per_person: float    # per person, activities + meals
    algorithm: Literal["heuristic_v1", "cpsat_v1"]
    hard_violations: int
    soft_violations: int
    solver: Optional[Dict[str, Any]] = None   # CP-SAT status, bounds and diagnostics


class GenerateResponse(BaseModel):
    trip_id: int
    status: GenerationStatus
    replaced_previous: bool                   # an earlier itinerary for this trip was replaced
    days_generated: int
    valid: bool
    warnings: List[str]
    meta: GenerateMeta
    validation: ValidationReportOut
    itinerary: List[ItineraryDayOut]


class ItineraryResponse(BaseModel):
    trip_id: int
    destination: str
    start_date: str
    end_date: str
    num_days: int
    currency: str
    trip_status: str
    status: Optional[GenerationStatus] = None  # None when nothing has been generated
    total_budget: float
    estimated_cost: float
    hotel: Optional[Dict[str, Any]] = None
    days: List[ItineraryDayOut]
    validation: Optional[ValidationReportOut] = None


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
    user_id: Optional[uuid.UUID] = None
    stops: List[TripStopOut] = []
    visited_prompt: Optional[str] = None

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
    user_id: Optional[uuid.UUID] = None
    stops: List[TripStopOut] = []
    visited_prompt: Optional[str] = None

    model_config = {"from_attributes": True}


class MarkVisitedIn(BaseModel):
    mark: bool


class MarkVisitedOut(BaseModel):
    visited_prompt: str
    places_marked: int


class TripStatsOut(BaseModel):
    """Completed trips only (end date before `today`)."""
    trips: int
    total_days: int
    weeks: float
    months: float
    years: float
    average_days: float
    continents: int
    countries: int
    cities: int
    continent_names: List[str] = []
    longest_trip: Optional[Dict[str, Any]] = None
    most_visited_country: Optional[Dict[str, Any]] = None
    per_year: List[Dict[str, Any]] = []
    transport_modes: List[Dict[str, Any]] = []
    upcoming: int = 0
    ongoing: int = 0


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

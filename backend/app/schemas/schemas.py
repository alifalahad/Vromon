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
    # Imported destinations (step 10): where the data comes from, and whether a person has checked it
    attribution: Optional[str] = None
    sources: List[Dict[str, Any]] = []
    checked: bool = True

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
    cost_known: bool = True
    hours_known: bool = True
    rating_known: bool = True
    source: str = "curated"
    url: Optional[str] = None
    checked: bool = True

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
    cost_known: bool = True
    hours_known: bool = True
    rating_known: bool = True

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
    price_known: bool = True
    rating_known: bool = True

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
    # The first day starts at the arrival time and the last day ends at the leaving time (None = usual times)
    arrive_time: Optional[str] = None
    leave_time: Optional[str] = None

    @field_validator("preferred_start_time", "preferred_end_time", "arrive_time", "leave_time")
    @classmethod
    def valid_time(cls, v):
        if v is not None and not TIME_PATTERN.match(v):
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


MustSeeWhen = Literal["morning", "afternoon", "sunset", "evening"]


class MustSeeIn(BaseModel):
    """A place the traveller must see, optionally on a day and at a time of day or an exact time."""
    place_id: int = Field(ge=1)
    day: Optional[int] = Field(None, ge=1, le=MAX_TRIP_DAYS)
    when: Optional[MustSeeWhen] = None
    at: Optional[str] = None        # "HH:MM", an exact start (instead of `when`)

    @field_validator("at")
    @classmethod
    def valid_at(cls, v):
        if v is not None and not TIME_PATTERN.match(v):
            raise ValueError("at must be HH:MM in 24-hour format (00:00-23:59)")
        return v

    @model_validator(mode="after")
    def one_time(self):
        if self.when and self.at:
            raise ValueError("give either a time of day (when) or an exact time (at), not both")
        return self


class BusyIn(BaseModel):
    """A time on a day when the traveller is busy: nothing is planned then."""
    day: int = Field(ge=1, le=MAX_TRIP_DAYS)
    start: str
    end: str
    label: Optional[str] = Field(None, max_length=60)

    @field_validator("start", "end")
    @classmethod
    def valid_time(cls, v):
        if not TIME_PATTERN.match(v):
            raise ValueError("time must be HH:MM in 24-hour format (00:00-23:59)")
        return v

    @field_validator("label")
    @classmethod
    def clean_label(cls, v):
        return (v or "").strip() or None

    @model_validator(mode="after")
    def ends_after_start(self):
        if self.end <= self.start:
            raise ValueError("a busy time must end after it starts")
        return self


class TripConstraintCreate(BaseModel):
    # Omitted: follows the pace (Relaxed 3, Balanced 4, Packed 6 stops a day)
    max_activities_per_day: int = Field(default=4, ge=1, le=10)
    max_daily_budget: float = Field(default=0.0, ge=0)
    must_sees: List[MustSeeIn] = Field(default_factory=list, max_length=50)
    # The plain id list older clients send; ids not in must_sees become must-sees with no day or time
    must_visit: List[int] = Field(default_factory=list, max_length=50)
    busy: List[BusyIn] = Field(default_factory=list, max_length=30)
    excluded_places: List[int] = Field(default_factory=list, max_length=200)
    avoid_crowded: bool = False
    avoid_high_activity: bool = False

    @field_validator("must_visit", "excluded_places")
    @classmethod
    def positive_ids(cls, v):
        if any(i < 1 for i in v):
            raise ValueError("place IDs must be positive integers")
        return list(dict.fromkeys(v))  # drop duplicates, keep order

    @field_validator("must_sees")
    @classmethod
    def one_per_place(cls, v):
        seen, out = set(), []
        for m in v:
            if m.place_id not in seen:
                seen.add(m.place_id)
                out.append(m)
        return out

    @model_validator(mode="after")
    def merge_must_visit(self):
        listed = {m.place_id for m in self.must_sees}
        merged = self.must_sees + [MustSeeIn(place_id=pid) for pid in self.must_visit if pid not in listed]
        # Not through __setattr__: a partial update must still see which of the two the client sent
        object.__setattr__(self, "must_sees", merged)
        object.__setattr__(self, "must_visit", [m.place_id for m in merged])
        return self


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
    # The leg to the next activity (trip planner step 5): how, from road data or estimated, and
    # the fare per vehicle (an estimate). None on the last activity and on meals.
    travel_mode: Optional[str] = None
    travel_mode_chosen: bool = False
    travel_source: Optional[Literal["road", "estimate"]] = None
    travel_fare: Optional[float] = None
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
    # The day in a line, as parts the app puts into words (step 7)
    summary: List[Dict[str, Any]] = []
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


class UnplacedSuggestion(BaseModel):
    day: int
    at: str


class UnplacedOut(BaseModel):
    """A must-see that isn't in the plan: why, and the nearest change that would fit."""
    place_id: int
    name: str
    day: Optional[int] = None
    when: Optional[str] = None
    at: Optional[str] = None
    # code: closes_before | opens_after | day_ends | day_starts | arrive | leave | busy | clash | budget | full,
    # with what explains it (closes, opens, sunset, wanted, end, start, arrive, leave, label, other)
    reason: Dict[str, Any]
    message: str
    suggestion: Optional[UnplacedSuggestion] = None


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
    unplaced: List[UnplacedOut] = []


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
    unplaced: List[UnplacedOut] = []
    # From the trip's starting city, by its mode: {from, to, mode, km, minutes, fare, fare_per, source}
    getting_there: Optional[Dict[str, Any]] = None


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
    arrive_time: Optional[str] = None
    leave_time: Optional[str] = None

    model_config = {"from_attributes": True}


class MustSeeOut(BaseModel):
    place_id: int
    day: Optional[int] = None
    when: Optional[str] = None
    at: Optional[str] = None


class BusyOut(BaseModel):
    day: int
    start: str
    end: str
    label: Optional[str] = None


class TripConstraintOut(BaseModel):
    id: int
    max_activities_per_day: int
    max_daily_budget: float
    must_sees: List[MustSeeOut] = []
    must_visit: List[int] = []
    busy: List[BusyOut] = []
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

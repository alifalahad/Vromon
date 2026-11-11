"""Schemas for the data-platform catalog (read-only API)."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel


class FieldSource(BaseModel):
    """Where one field's value comes from (guideline §6.2): shown so the app can label
    verified, imported and unknown values differently."""
    status: str                       # verified / imported / needs_review / unknown
    source: Optional[str] = None      # source name
    license: Optional[str] = None
    reliability: Optional[str] = None
    retrieved_at: Optional[str] = None
    verified_at: Optional[str] = None
    verification_method: Optional[str] = None


class AdminUnitOut(BaseModel):
    slug: str
    level: str
    name_en: Optional[str] = None
    name_bn: Optional[str] = None
    parent_slug: Optional[str] = None
    centroid_lat: Optional[float] = None
    centroid_lon: Optional[float] = None
    area_km2: Optional[float] = None


class AdminUnitDetail(AdminUnitOut):
    neighbors: List[AdminUnitOut] = []
    children_count: int = 0
    fields: Dict[str, FieldSource] = {}
    geometry: Optional[Dict[str, Any]] = None


class CategoryOut(BaseModel):
    code: str
    name_en: str
    name_bn: Optional[str] = None


class PhotoOut(BaseModel):
    """A photo with the credit the licence requires; shown only for approved licences."""
    url: Optional[str] = None
    thumb_url: Optional[str] = None
    page_url: str
    width: Optional[int] = None
    height: Optional[int] = None
    license: Optional[str] = None
    license_url: Optional[str] = None
    attribution: Optional[str] = None


class AttractionOut(BaseModel):
    slug: str
    name_en: Optional[str] = None
    name_bn: Optional[str] = None
    category: Optional[str] = None
    district_slug: Optional[str] = None
    subdistrict_slug: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    short_description_en: Optional[str] = None
    short_description_bn: Optional[str] = None


class AttractionDetail(AttractionOut):
    division_slug: Optional[str] = None
    location_precision: Optional[str] = None
    description_en: Optional[str] = None
    description_bn: Optional[str] = None
    official_website: Optional[str] = None
    heritage_designation: Optional[str] = None
    entry_fee_amount: Optional[float] = None
    entry_fee_currency: Optional[str] = None
    entry_fee_description: Optional[str] = None
    opening_hours: Optional[str] = None
    best_visit_months: Optional[List[int]] = None
    recommended_visit_duration: Optional[float] = None
    fields: Dict[str, FieldSource] = {}
    photos: List[PhotoOut] = []
    attribution: List[str] = []
    updated_at: Optional[datetime] = None


class SourceOut(BaseModel):
    source_id: str
    source_name: str
    organization: str
    license_name: Optional[str] = None
    license_url: Optional[str] = None
    attribution_text: Optional[str] = None
    reliability_class: str
    last_successful_fetch: Optional[datetime] = None


class HubOut(BaseModel):
    slug: str
    hub_type: str
    name_en: Optional[str] = None
    name_bn: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    district_slug: Optional[str] = None
    iata_code: Optional[str] = None
    source: Optional[str] = None
    reliability: Optional[str] = None


class TrainServiceOut(BaseModel):
    train_number: str
    train_name_bn: Optional[str] = None
    origin: Optional[str] = None
    destination: Optional[str] = None
    origin_hub_slug: Optional[str] = None
    destination_hub_slug: Optional[str] = None
    departure_time: Optional[str] = None
    arrival_time: Optional[str] = None
    arrives_next_day: Optional[bool] = None
    off_day: Optional[str] = None
    runs_daily: Optional[bool] = None
    timetable: str
    effective_from: Optional[str] = None
    timezone: str = "Asia/Dhaka"
    source_url: Optional[str] = None


class FareOut(BaseModel):
    """A fare with its kind (official, regulated, operator, estimated …) and when it was checked."""
    mode: str
    origin: str
    destination: str
    fare_class: str
    fare_class_label: Optional[str] = None
    amount: float
    currency: str
    base_amount: Optional[float] = None
    vat_amount: Optional[float] = None
    fare_type: str
    official_distance_km: Optional[float] = None
    effective_from: Optional[str] = None
    last_checked_at: datetime
    source_url: Optional[str] = None
    notes: Optional[str] = None


class RoadLeg(BaseModel):
    distance_km: Optional[float] = None
    duration_min: Optional[float] = None
    kind: str = "calculated"          # never an official distance
    engine: str
    profile: str
    network_version: str
    calculated_at: datetime


class JourneyPlan(BaseModel):
    """District to district (guideline §10.2): what is known per mode, each with its kind and source, and what isn't."""
    origin: AdminUnitOut
    destination: AdminUnitOut
    road: Optional[RoadLeg] = None
    trains: List[TrainServiceOut] = []
    airports_origin: List[HubOut] = []
    airports_destination: List[HubOut] = []
    fares: List[FareOut] = []
    missing: List[str] = []


class FoodOut(BaseModel):
    name_bn: str
    name_en: Optional[str] = None
    district_slug: Optional[str] = None
    is_food: bool
    gi_registration_no: Optional[str] = None
    gi_application_date: Optional[str] = None
    district_evidence: Optional[str] = None
    source_url: Optional[str] = None


class ServicePlaceOut(BaseModel):
    """A hotel or restaurant. `official_star_rating` comes from the ministry's list; `trust` says what the
    rest is: a business listing (not checked by Vromon) or an official record."""
    slug: str
    kind: str
    category: Optional[str] = None
    name_en: Optional[str] = None
    name_bn: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    district_slug: Optional[str] = None
    address: Optional[str] = None
    website: Optional[str] = None
    phone: Optional[str] = None
    official_star_rating: Optional[int] = None
    trust: str                       # official / business_listing
    source: Optional[str] = None
    price: Optional["RoomPrice"] = None   # None until a source states one: shown as "Price not known"


class RoomPrice(BaseModel):
    """The lowest room rate a hotel publishes on its own website, as read on `checked_at`: a rack rate
    (it may have changed; confirm when booking), never a quote or a booking price."""
    from_amount: float
    currency: str
    room: Optional[str] = None       # the room type it is for, as printed
    kind: str = "rack_rate"
    rates_found: int = 1
    source_url: Optional[str] = None
    checked_at: datetime


class MarketPriceOut(BaseModel):
    """A retail market price as an official survey prints it (TCB, Dhaka): lowest and highest, per unit, on a date."""
    item: str
    unit: Optional[str] = None
    low: float
    high: Optional[float] = None
    currency: str
    date: str
    area: Optional[str] = None
    week_before_low: Optional[float] = None
    week_before_high: Optional[float] = None
    source: Optional[str] = None
    source_url: Optional[str] = None
    notes: Optional[str] = None


ServicePlaceOut.model_rebuild()

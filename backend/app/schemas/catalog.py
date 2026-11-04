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

"""The curated entity types the pipeline writes, and which of their columns come from claims."""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from typing import Any, Callable

from app.models import catalog


def _identity(_field: str, value: Any) -> Any:
    return value


def _uuid_fields(*names: str) -> Callable[[str, Any], Any]:
    def coerce(f: str, value: Any) -> Any:
        if f in names and isinstance(value, str):
            return uuid.UUID(value)
        return value
    return coerce


@dataclass(frozen=True)
class EntitySpec:
    model: type
    resolved_fields: tuple[str, ...]
    coerce: Callable[[str, Any], Any] = field(default=_identity)


ENTITY_TYPES: dict[str, EntitySpec] = {
    "admin_unit": EntitySpec(
        catalog.AdminUnit,
        ("name_en", "name_bn", "parent_id", "centroid_lat", "centroid_lon", "area_km2"),
        _uuid_fields("parent_id"),
    ),
    "attraction": EntitySpec(
        catalog.Attraction,
        ("canonical_name_en", "canonical_name_bn", "category_code", "latitude", "longitude", "location_precision",
         "division_id", "district_id", "subdistrict_id", "short_description_en", "short_description_bn",
         "description_en", "description_bn", "official_website", "heritage_designation",
         "entry_fee_amount", "entry_fee_currency", "entry_fee_description", "opening_hours", "best_visit_months",
         "recommended_visit_duration"),
        _uuid_fields("division_id", "district_id", "subdistrict_id"),
    ),
}


def register(name: str, spec: EntitySpec) -> None:
    ENTITY_TYPES[name] = spec

"""
A point named for people (docs/ui-refresh step 5): where "Use my current location" put the traveller,
as "Near Shahid Hadis Park, Khulna", "Tejgaon, Dhaka" or "Cox's Bazar Sadar", never "Your location".

Only Vromon's own data names it, so the phone's position never leaves the server:
  1. the nearest of Vromon's places or transport hubs within NEAR_KM (curated names: the places index
     from Overture is too noisy to name a place by: shops, paint dealers listed as markets);
  2. else the subdistrict and district the point lies in (boundary polygons);
  3. else, outside Bangladesh, the nearest GeoNames city ("Near Kolkata").
Nothing is stored here: the point is kept only if the traveller builds a trip from it.
"""

from __future__ import annotations

import json
import re
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.catalog import AdminBoundary, AdminUnit, TransportHub
from app.models.models import City, Place
from app.services.journey import district_of
from app.services.routing.roads import haversine_km

NEAR_KM = 0.7
CITY_KM = 60.0
_BOX = 0.012            # degrees searched around the point for landmarks (≈ 1.3 km)
_BENGALI = re.compile(r"[ঀ-৿]")
_SUBDISTRICTS: list | None = None


def subdistrict_of(db: Session, lat: float, lon: float) -> Optional[AdminUnit]:
    """The subdistrict (upazila / thana) a point lies in, else None."""
    global _SUBDISTRICTS
    from app.api.v1.endpoints.explore import _inside
    if _SUBDISTRICTS is None:
        rows = db.execute(select(AdminUnit.id, AdminBoundary)
                          .join(AdminBoundary, AdminBoundary.admin_unit_id == AdminUnit.id)
                          .where(AdminUnit.level == "subdistrict", AdminBoundary.is_current.is_(True))).all()
        _SUBDISTRICTS = [(uid, (b.min_lon, b.min_lat, b.max_lon, b.max_lat), json.loads(b.geometry_geojson)) for uid, b in rows]
    for uid, (x0, y0, x1, y1), g in _SUBDISTRICTS:
        if x0 <= lon <= x1 and y0 <= lat <= y1 and _inside(g, lon, lat):
            return db.get(AdminUnit, uid)
    return None


def _usable(name: Optional[str], lang: str) -> Optional[str]:
    """A name as it reads in a sentence: up to its first comma; in English, only one written in Latin letters."""
    if not name:
        return None
    name = name.split(",")[0].split("।")[0].strip()
    if not name or (lang != "bn" and _BENGALI.search(name)):
        return None
    return name


def landmark(db: Session, lat: float, lon: float, lang: str = "en") -> Optional[str]:
    """The nearest of Vromon's places and transport hubs within NEAR_KM, by name."""
    found: list[tuple[float, str]] = []
    places = db.scalars(select(Place).where(Place.is_active.is_(True),
                                            Place.latitude.between(lat - _BOX, lat + _BOX),
                                            Place.longitude.between(lon - _BOX, lon + _BOX))).all()
    for p in places:
        name = _usable(p.name, lang)
        if name:
            found.append((haversine_km((lat, lon), (p.latitude, p.longitude)), name))
    hubs = db.scalars(select(TransportHub).where(TransportHub.latitude.between(lat - _BOX, lat + _BOX),
                                                 TransportHub.longitude.between(lon - _BOX, lon + _BOX))).all()
    for h in hubs:
        name = _usable((h.name_bn if lang == "bn" and h.name_bn else None) or h.name_en, lang)
        if name:
            found.append((haversine_km((lat, lon), (h.latitude, h.longitude)), name))
    near = [f for f in found if f[0] <= NEAR_KM]
    return min(near)[1] if near else None


def _unit_name(unit: Optional[AdminUnit], lang: str) -> Optional[str]:
    if unit is None:
        return None
    return unit.name_bn if lang == "bn" and unit.name_bn else unit.name_en


def name_point(db: Session, lat: float, lon: float, lang: str = "en") -> dict:
    """{label, near, area, district}: `label` is what the app shows; None when nothing names the point."""
    lang = "bn" if lang == "bn" else "en"
    district = _unit_name(district_of(db, lat, lon), lang)
    area = _unit_name(subdistrict_of(db, lat, lon), lang)
    near = landmark(db, lat, lon, lang)
    if near:
        # "Khulna Railway Station" already says Khulna
        tail = f", {district}" if district and district.lower() not in near.lower() else ""
        label = f"{near}-এর কাছে{tail}" if lang == "bn" else f"Near {near}{tail}"
    elif area and district:
        # "Khulna Sadar" already says Khulna
        label = area if area.lower().startswith(district.lower()) else f"{area}, {district}"
    elif district:
        label = district
    else:
        box = 0.6
        cities = db.scalars(select(City).where(City.lat.between(lat - box, lat + box), City.lon.between(lon - box, lon + box))).all()
        city = min(cities, key=lambda c: haversine_km((lat, lon), (c.lat, c.lon)), default=None)
        if city is not None and haversine_km((lat, lon), (city.lat, city.lon)) <= CITY_KM:
            label = f"{city.name}-এর কাছে" if lang == "bn" else f"Near {city.name}"
        else:
            label = None
    return {"label": label, "near": near, "area": area, "district": district}

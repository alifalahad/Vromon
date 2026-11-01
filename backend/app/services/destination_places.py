"""
Where each destination is on the travel map (map home step 4): its country
(ISO 3166-1, from the country name) and region (ISO 3166-2, from the nearest
city with a known region). The app matches places on the user's Want list to
destinations with these, to suggest "Plan a trip here".

The backend keeps no region shapes, only cities with their region, so the nearest
city decides. Further than MAX_KM from any city, the region stays unknown.
"""

from __future__ import annotations

import math

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.models import City, Country, Destination

MAX_KM = 75.0


def _km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 6371.0 * 2 * math.asin(math.sqrt(a))


def region_near(db: Session, country_iso2: str, lat: float, lon: float) -> str | None:
    cities = db.execute(
        select(City.lat, City.lon, City.region_code).where(City.country_iso2 == country_iso2, City.region_code.is_not(None))
    ).all()
    best = min(cities, key=lambda c: _km(lat, lon, c.lat, c.lon), default=None)
    return best.region_code if best is not None and _km(lat, lon, best.lat, best.lon) <= MAX_KM else None


def fill_destination_places(db: Session) -> int:
    """Fill country and region where missing. Returns how many destinations changed."""
    if not db.scalar(select(func.count()).select_from(Country)):
        return 0  # reference tables not seeded yet
    changed = 0
    for dest in db.scalars(select(Destination).where(Destination.region_code.is_(None))).all():
        iso2 = dest.country_iso2 or db.scalar(select(Country.iso2).where(func.lower(Country.name) == dest.country.lower()))
        if not iso2:
            continue
        region = region_near(db, iso2, dest.latitude, dest.longitude) if (dest.latitude or dest.longitude) else None
        if iso2 != dest.country_iso2 or region:
            dest.country_iso2, dest.region_code = iso2, region
            changed += 1
    if changed:
        db.commit()
    return changed

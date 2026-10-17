"""
Travel statistics from a user's visits.

Rules (prompt §6.5, decision D6):
- "Lived" counts as visited; "want to visit" does not.
- Counts follow what the user marked: a visited city doesn't silently add its
  country (the app offers to mark the country, and the user decides).
- "% of world" = visited countries that count toward the world / the world size
  (194: UN members + observers, as drawn by the Bangladesh point of view).
"""

from __future__ import annotations

import uuid
from dataclasses import asdict, dataclass, field

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.models import City, Country, Region, Visit

VISITED = ("visited", "lived")


@dataclass
class TravelStats:
    countries: int
    regions: int
    cities: int
    continents: int
    world_countries: int
    world_total: int
    world_percent: float
    want_to_visit: int
    continent_names: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return asdict(self)


def world_total(db: Session) -> int:
    return db.scalar(select(func.count()).select_from(Country).where(Country.counts_toward_world.is_(True))) or 0


def travel_stats(db: Session, user_id: uuid.UUID) -> TravelStats:
    visits = db.execute(select(Visit.place_type, Visit.place_code, Visit.status).where(Visit.user_id == user_id)).all()
    visited = {(t, c) for t, c, s in visits if s in VISITED}
    country_codes = {c for t, c in visited if t == "country"}

    rows = db.execute(
        select(Country.iso2, Country.continent, Country.counts_toward_world).where(Country.iso2.in_(country_codes))
    ).all() if country_codes else []
    continents = sorted({cont for _, cont, _ in rows if cont and not cont.startswith("Seven seas")})
    in_world = sum(1 for _, _, counts in rows if counts)
    total = world_total(db)

    return TravelStats(
        countries=len(country_codes),
        regions=sum(1 for t, _ in visited if t == "region"),
        cities=sum(1 for t, _ in visited if t == "city"),
        continents=len(continents),
        world_countries=in_world,
        world_total=total,
        world_percent=round(100 * in_world / total, 1) if total else 0.0,
        want_to_visit=sum(1 for _, _, s in visits if s == "want"),
        continent_names=continents,
    )


def visits_with_country(db: Session, visits: list[Visit]) -> list[dict]:
    """Visits as dicts with `country_iso2` filled in for regions and cities."""
    region_codes = {v.place_code for v in visits if v.place_type == "region"}
    city_ids = {int(v.place_code) for v in visits if v.place_type == "city" and v.place_code.isdigit()}
    region_country = dict(db.execute(select(Region.code, Region.country_iso2).where(Region.code.in_(region_codes))).all()) if region_codes else {}
    city_country = {str(k): c for k, c in db.execute(select(City.geonameid, City.country_iso2).where(City.geonameid.in_(city_ids))).all()} if city_ids else {}
    out = []
    for v in visits:
        country = v.place_code if v.place_type == "country" else (region_country if v.place_type == "region" else city_country).get(v.place_code)
        out.append({
            "place_type": v.place_type, "place_code": v.place_code, "status": v.status,
            "first_visited_on": v.first_visited_on, "last_visited_on": v.last_visited_on,
            "note": v.note, "updated_at": v.updated_at, "country_iso2": country,
        })
    return out

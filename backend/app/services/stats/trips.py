"""
Trip statistics: "Your trips so far" (prompt §6.8; redrawn in docs/ui-refresh step 9).

Rules:
- Only finished trips count: the end date is before today. Upcoming and ongoing
  trips are counted separately and never added to the totals.
- Duration = end − start + 1 days (12–31 Oct = 20 days).
- Average = total days / finished trips, to one decimal.
- Where you went comes from the finished trips' stops, without where a trip starts:
  the first stop of a trip with more stops, when it has no arrival day and no way
  of getting there, is the start (the app saves "from Dhaka" that way, D7).
- Every number comes with the trips behind it (`finished`, each place's and each
  year's `trip_ids`), so the app shows the same trips it counts.
"""

from __future__ import annotations

import unicodedata
import uuid
from dataclasses import asdict, dataclass, field
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models.models import City, Country, Trip


def trip_days(start: date, end: date) -> int:
    return (end - start).days + 1


def trip_phase(start: date, end: date, today: date) -> str:
    """"upcoming", "ongoing" or "past"."""
    if end < today:
        return "past"
    return "upcoming" if start > today else "ongoing"


def visited_stops(stops: list) -> list:
    """A trip's stops without where it starts (see the rules above)."""
    ordered = sorted(stops, key=lambda s: getattr(s, "position", 0))
    if len(ordered) > 1:
        first = ordered[0]
        if getattr(first, "arrive_on", None) is None and not getattr(first, "transport_mode", None):
            return ordered[1:]
    return ordered


def plain_name(name: str) -> str:
    """A GeoNames name as people write it: "Cox’s Bāzār" → "Cox's Bazar"."""
    text = unicodedata.normalize("NFKD", name.replace("’", "'"))
    return "".join(c for c in text if not unicodedata.combining(c))


@dataclass
class TripStats:
    trips: int
    total_days: int
    average_days: float
    countries: int
    cities: int
    # The finished trips, the last to end first
    finished: list[int] = field(default_factory=list)
    longest_trip: dict | None = None
    # {"countries": [{iso2, name, name_bn, trip_ids}], "cities": [{geonameid, name, country_iso2, trip_ids}]}
    places: dict = field(default_factory=lambda: {"countries": [], "cities": []})
    # Newest year first: {year, trips, days, trip_ids}
    per_year: list[dict] = field(default_factory=list)
    upcoming: int = 0
    ongoing: int = 0

    def to_dict(self) -> dict:
        return asdict(self)


def summarize(
    trips: list[Trip],
    today: date,
    countries: dict[str, tuple[str, str | None]],
    cities: dict[int, str] | None = None,
) -> TripStats:
    """
    `countries`: iso2 → (name, Bangla name) and `cities`: geonameid → name, for the places
    on the trips' stops. Pure: no database access, so the maths is easy to test.
    """
    cities = cities or {}
    done = sorted(
        (t for t in trips if trip_phase(t.start_date, t.end_date, today) == "past"),
        key=lambda t: (t.end_date, t.start_date, t.id),
        reverse=True,
    )
    phases = [trip_phase(t.start_date, t.end_date, today) for t in trips]
    days = {t.id: trip_days(t.start_date, t.end_date) for t in done}
    total = sum(days.values())

    by_country: dict[str, list[int]] = {}
    by_city: dict[int, tuple[str, list[int]]] = {}
    for t in done:
        for s in visited_stops(list(t.stops)):
            ids = by_country.setdefault(s.country_iso2, [])
            if t.id not in ids:
                ids.append(t.id)
            if s.city_geonameid:
                _, city_ids = by_city.setdefault(s.city_geonameid, (s.country_iso2, []))
                if t.id not in city_ids:
                    city_ids.append(t.id)

    def country_name(iso: str) -> tuple[str, str | None]:
        return countries.get(iso, (iso, None))

    place_countries = sorted(
        ({"iso2": iso, "name": country_name(iso)[0], "name_bn": country_name(iso)[1], "trip_ids": ids} for iso, ids in by_country.items()),
        key=lambda p: (-len(p["trip_ids"]), p["name"]),
    )
    place_cities = sorted(
        ({"geonameid": gid, "name": plain_name(cities.get(gid, str(gid))), "country_iso2": iso, "trip_ids": ids}
         for gid, (iso, ids) in by_city.items()),
        key=lambda p: (-len(p["trip_ids"]), p["name"]),
    )

    longest = max(done, key=lambda t: (days[t.id], t.end_date), default=None)
    per_year: dict[int, dict] = {}
    for t in done:
        row = per_year.setdefault(t.start_date.year, {"year": t.start_date.year, "trips": 0, "days": 0, "trip_ids": []})
        row["trips"] += 1
        row["days"] += days[t.id]
        row["trip_ids"].append(t.id)

    return TripStats(
        trips=len(done),
        total_days=total,
        average_days=round(total / len(done), 1) if done else 0.0,
        countries=len(place_countries),
        cities=len(place_cities),
        finished=[t.id for t in done],
        longest_trip={"trip_id": longest.id, "title": longest.title or longest.destination, "days": days[longest.id]} if longest else None,
        places={"countries": place_countries, "cities": place_cities},
        per_year=[per_year[y] for y in sorted(per_year, reverse=True)],
        upcoming=phases.count("upcoming"),
        ongoing=phases.count("ongoing"),
    )


def viewer_today(requested: date | None) -> date:
    """The phone's local date if it is within a day of the server's (time zones), else the server's."""
    today = date.today()
    if requested is not None and abs((requested - today).days) <= 1:
        return requested
    return today


def trip_stats(db: Session, user_id: uuid.UUID, today: date) -> TripStats:
    trips = list(db.scalars(select(Trip).where(Trip.user_id == user_id).options(selectinload(Trip.stops))))
    codes = {s.country_iso2 for t in trips for s in t.stops}
    city_ids = {s.city_geonameid for t in trips for s in t.stops if s.city_geonameid}
    countries = {iso: (name, name_bn) for iso, name, name_bn in db.execute(
        select(Country.iso2, Country.name, Country.name_bn).where(Country.iso2.in_(codes))
    )} if codes else {}
    cities = dict(db.execute(select(City.geonameid, City.name).where(City.geonameid.in_(city_ids))).tuples().all()) if city_ids else {}
    return summarize(trips, today, countries, cities)

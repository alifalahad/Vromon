"""
Trip statistics (prompt §6.8).

Rules:
- Only completed trips count: the end date is before today. Upcoming and ongoing
  trips are counted separately and never added to the totals.
- Duration = end − start + 1 days (12–31 Oct = 20 days).
- Weeks = days / 7, months = days / 30.44, years = days / 365.25.
- Average trip time = total days / completed trips.
- Continents, countries and cities come from the completed trips' stops.
"""

from __future__ import annotations

import uuid
from collections import Counter
from dataclasses import asdict, dataclass, field
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models.models import Country, Trip

DAYS_PER_WEEK = 7
DAYS_PER_MONTH = 30.44
DAYS_PER_YEAR = 365.25


def trip_days(start: date, end: date) -> int:
    return (end - start).days + 1


def trip_phase(start: date, end: date, today: date) -> str:
    """"upcoming", "ongoing" or "past"."""
    if end < today:
        return "past"
    return "upcoming" if start > today else "ongoing"


@dataclass
class TripStats:
    trips: int
    total_days: int
    weeks: float
    months: float
    years: float
    average_days: float
    continents: int
    countries: int
    cities: int
    continent_names: list[str] = field(default_factory=list)
    longest_trip: dict | None = None
    most_visited_country: dict | None = None
    per_year: list[dict] = field(default_factory=list)
    transport_modes: list[dict] = field(default_factory=list)
    upcoming: int = 0
    ongoing: int = 0

    def to_dict(self) -> dict:
        return asdict(self)


def summarize(trips: list[Trip], today: date, countries: dict[str, tuple[str, str | None]]) -> TripStats:
    """
    `countries`: iso2 → (name, continent) for every country on the trips' stops.
    Pure: no database access, so the maths is easy to test.
    """
    done = [t for t in trips if trip_phase(t.start_date, t.end_date, today) == "past"]
    phases = Counter(trip_phase(t.start_date, t.end_date, today) for t in trips)
    days = [trip_days(t.start_date, t.end_date) for t in done]
    total = sum(days)

    stop_countries = [{s.country_iso2 for s in t.stops} for t in done]
    country_codes = set().union(*stop_countries) if stop_countries else set()
    city_ids = {s.city_geonameid for t in done for s in t.stops if s.city_geonameid}
    continents = sorted({c for iso in country_codes if (c := countries.get(iso, ("", None))[1]) and not c.startswith("Seven seas")})

    longest = max(done, key=lambda t: (trip_days(t.start_date, t.end_date), t.end_date), default=None)
    per_country = Counter(iso for codes in stop_countries for iso in codes)
    top = per_country.most_common(1)[0] if per_country else None
    per_year: dict[int, dict] = {}
    for t, d in zip(done, days):
        row = per_year.setdefault(t.start_date.year, {"year": t.start_date.year, "trips": 0, "days": 0})
        row["trips"] += 1
        row["days"] += d
    modes = Counter(s.transport_mode for t in done for s in t.stops if s.transport_mode)

    return TripStats(
        trips=len(done),
        total_days=total,
        weeks=round(total / DAYS_PER_WEEK, 2),
        months=round(total / DAYS_PER_MONTH, 2),
        years=round(total / DAYS_PER_YEAR, 2),
        average_days=round(total / len(done), 1) if done else 0.0,
        continents=len(continents),
        countries=len(country_codes),
        cities=len(city_ids),
        continent_names=continents,
        longest_trip={"trip_id": longest.id, "title": longest.title or longest.destination,
                      "days": trip_days(longest.start_date, longest.end_date)} if longest else None,
        most_visited_country={"iso2": top[0], "name": countries.get(top[0], (top[0], None))[0], "trips": top[1]} if top else None,
        per_year=[per_year[y] for y in sorted(per_year)],
        transport_modes=[{"mode": m, "count": n} for m, n in modes.most_common()],
        upcoming=phases["upcoming"],
        ongoing=phases["ongoing"],
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
    countries = {iso: (name, cont) for iso, name, cont in db.execute(
        select(Country.iso2, Country.name, Country.continent).where(Country.iso2.in_(codes))
    )} if codes else {}
    return summarize(trips, today, countries)

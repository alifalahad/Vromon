"""
Vromon Backend — trip stops (decision D7): resolving places, the destination
stop for new trips, serialising, and marking a finished trip's places visited.
"""

from __future__ import annotations

from datetime import date, datetime

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.models import City, Country, Destination, Trip, TripStop, Visit
from app.schemas.schemas import TripStopIn

NEAREST_CITY_BOX = 0.5  # degrees around the destination's coordinates


def _resolve(db: Session, stop: TripStopIn) -> tuple[int | None, str]:
    if stop.city_geonameid is not None:
        city = db.get(City, stop.city_geonameid)
        if city is None:
            raise HTTPException(status_code=422, detail=f"Unknown city: {stop.city_geonameid}")
        if stop.country_iso2 and stop.country_iso2 != city.country_iso2:
            raise HTTPException(status_code=422, detail=f"{city.name} is not in {stop.country_iso2}")
        return city.geonameid, city.country_iso2
    if db.get(Country, stop.country_iso2) is None:
        raise HTTPException(status_code=422, detail=f"Unknown country: {stop.country_iso2}")
    return None, stop.country_iso2


def destination_place(db: Session, destination: str) -> tuple[int | None, str] | None:
    """A planner destination as (nearest GeoNames city, country), or None if unknown."""
    dest = db.scalar(select(Destination).where(Destination.name == destination))
    if dest is None:
        return None
    iso2 = db.scalar(select(Country.iso2).where(Country.name == dest.country))
    if iso2 is None:
        return None
    candidates = db.execute(
        select(City.geonameid, City.lat, City.lon).where(
            City.country_iso2 == iso2,
            City.lat.between(dest.latitude - NEAREST_CITY_BOX, dest.latitude + NEAREST_CITY_BOX),
            City.lon.between(dest.longitude - NEAREST_CITY_BOX, dest.longitude + NEAREST_CITY_BOX),
        )
    ).all()
    nearest = min(candidates, key=lambda c: (c.lat - dest.latitude) ** 2 + (c.lon - dest.longitude) ** 2, default=None)
    return (nearest.geonameid if nearest else None), iso2


def set_stops(db: Session, trip: Trip, stops: list[TripStopIn]) -> None:
    """Replace the trip's stops, in the order given."""
    resolved = [_resolve(db, s) for s in stops]
    trip.stops.clear()
    db.flush()  # free the (trip_id, position) slots before inserting
    for position, (stop, (city_id, iso2)) in enumerate(zip(stops, resolved)):
        trip.stops.append(TripStop(
            position=position, city_geonameid=city_id, country_iso2=iso2, transport_mode=stop.transport_mode,
            arrive_on=stop.arrive_on, depart_on=stop.depart_on,
        ))


def initial_stops(db: Session, trip: Trip, origin: TripStopIn | None, transport_mode: str | None) -> None:
    """A new trip: an optional origin, then the destination (decision D7)."""
    stops: list[TripStopIn] = []
    if origin is not None:
        stops.append(origin)
    place = destination_place(db, trip.destination)
    if place is not None:
        city_id, iso2 = place
        stops.append(TripStopIn(city_geonameid=city_id, country_iso2=iso2, transport_mode=transport_mode,
                                arrive_on=trip.start_date, depart_on=trip.end_date))
    if stops:
        set_stops(db, trip, stops)


def stop_out(stop: TripStop) -> dict:
    return {
        "position": stop.position,
        "city_geonameid": stop.city_geonameid,
        "city_name": stop.city.name if stop.city else None,
        "country_iso2": stop.country_iso2,
        "country_name": stop.country.name if stop.country else stop.country_iso2,
        "transport_mode": stop.transport_mode,
        "arrive_on": stop.arrive_on.isoformat() if stop.arrive_on else None,
        "depart_on": stop.depart_on.isoformat() if stop.depart_on else None,
    }


def mark_trip_visited(db: Session, trip: Trip) -> int:
    """
    Mark each stop's city and country visited. Never downgrades: "lived" and
    "visited" stay, "want to visit" becomes "visited". Missing visit dates are
    filled from the stop (or the trip). Returns how many places changed.
    """
    existing = {(v.place_type, v.place_code): v for v in db.scalars(select(Visit).where(Visit.user_id == trip.user_id))}
    now = datetime.utcnow()
    changed = 0
    wanted: dict[tuple[str, str], tuple[date, date]] = {}
    for stop in trip.stops:
        first, last = stop.arrive_on or trip.start_date, stop.depart_on or trip.end_date
        keys = [("country", stop.country_iso2)] + ([("city", str(stop.city_geonameid))] if stop.city_geonameid else [])
        for key in keys:
            lo, hi = wanted.get(key, (first, last))
            wanted[key] = (min(lo, first), max(hi, last))
    for (place_type, code), (first, last) in wanted.items():
        visit = existing.get((place_type, code))
        if visit is None:
            db.add(Visit(user_id=trip.user_id, place_type=place_type, place_code=code, status="visited",
                         first_visited_on=first, last_visited_on=last, created_at=now, updated_at=now))
            changed += 1
            continue
        touched = False
        if visit.status == "want":
            visit.status, touched = "visited", True
        if visit.first_visited_on is None:
            visit.first_visited_on, touched = first, True
        if visit.last_visited_on is None or visit.last_visited_on < last:
            visit.last_visited_on, touched = last, True
        if touched:
            visit.updated_at = now
            changed += 1
    return changed

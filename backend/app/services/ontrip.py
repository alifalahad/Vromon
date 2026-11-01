"""
Vromon Backend — on the trip, in its room (docs/friends-chat-plan.md, step 8; mockup 11).

- "I'm here": one reading from the phone, snapped to the nearest stop of the day's
  plan within 300 m; otherwise "near <destination>" within 50 km of it; otherwise just
  "checked in". The reading itself is never stored or shown, only what it snapped to,
  and how early or late that was against the plan.
- "Running late": by how much, for which next stop, and whether it came from Today mode.
- Live location (decision C4, section 3.4 rule 7): only in a trip room, only on the
  trip's days, only after you start it, for a set time; only the latest point is kept,
  and it's deleted on Stop, when it runs out, or when you leave the room.

Dates and times are the phone's own: a trip day is a local date, and the plan's times
are local. The server believes the phone's date only within a day of its own.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta
from typing import Optional, Sequence

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models.models import Destination, Itinerary, ItineraryItem, LiveLocation, Place, Trip
from app.services.routing.roads import haversine_km
from app.services.stats.trips import viewer_today

# A check-in snaps to a stop this close
SNAP_KM = 0.3
# Further than this from the destination, a check-in names no place at all
NEAR_DESTINATION_KM = 50
# Live location runs for at most this long at a time
LIVE_MAX = timedelta(hours=24)


class OnTripError(Exception):
    def __init__(self, status: int, detail: str):
        super().__init__(detail)
        self.status = status
        self.detail = detail


def _minutes(hhmm: str) -> int:
    h, m = hhmm.split(":")[:2]
    return int(h) * 60 + int(m)


def require_trip_day(trip: Trip, day: date) -> int:
    """The trip's day number for the phone's date; 422 if the trip isn't on that day (or the date is implausible)."""
    if viewer_today(day) != day:
        raise OnTripError(422, "Your phone's date is too far from today")
    if not trip.start_date <= day <= trip.end_date:
        raise OnTripError(422, "This is only for the days of the trip")
    return (day - trip.start_date).days + 1


def _stops(db: Session, trip: Trip, day_number: int) -> Sequence[tuple[ItineraryItem, Place]]:
    """The day's planned activities with their places, in order."""
    return db.execute(
        select(ItineraryItem, Place)
        .join(Itinerary, Itinerary.id == ItineraryItem.itinerary_id)
        .join(Place, Place.id == ItineraryItem.place_id)
        .where(Itinerary.trip_id == trip.id, Itinerary.day_number == day_number, ItineraryItem.item_type == "activity")
        .order_by(ItineraryItem.order_index)
    ).all()


def _nearest(db: Session, trip: Trip, day_number: int, lat: float, lon: float) -> tuple[Optional[ItineraryItem], Optional[Place]]:
    best, best_km = (None, None), SNAP_KM
    for item, place in _stops(db, trip, day_number):
        km = haversine_km((lat, lon), (place.latitude, place.longitude))
        if km <= best_km:
            best, best_km = (item, place), km
    return best


def _near_destination(db: Session, trip: Trip, lat: float, lon: float) -> Optional[str]:
    destination = db.scalar(select(Destination).where(Destination.name == trip.destination))
    if destination is None:
        return None
    if haversine_km((lat, lon), (destination.latitude, destination.longitude)) > NEAR_DESTINATION_KM:
        return None
    return destination.name


def checkin(db: Session, trip: Trip, *, day: date, time: str, lat: float, lon: float) -> dict:
    """What an "I'm here" card shows: the stop (and early or late), or roughly where; never the point."""
    day_number = require_trip_day(trip, day)
    item, place = _nearest(db, trip, day_number, lat, lon)
    if item is not None and place is not None:
        return {
            "day": day_number, "time": time, "stop": place.name, "place_id": place.id,
            "planned": item.start_time, "late_by": _minutes(time) - _minutes(item.start_time),
        }
    return {"day": day_number, "time": time, "near": _near_destination(db, trip, lat, lon)}


def late(db: Session, trip: Trip, *, day: date, time: str, minutes: int, source: str) -> dict:
    """What a "running late" card says: by how much, and for the next stop of the day."""
    day_number = require_trip_day(trip, day)
    now = _minutes(time)
    upcoming = [p.name for item, p in _stops(db, trip, day_number) if _minutes(item.start_time) >= now]
    return {"day": day_number, "time": time, "minutes": minutes, "stop": upcoming[0] if upcoming else None, "source": source}


def near_stop(db: Session, trip: Trip, day: date, lat: float, lon: float) -> Optional[str]:
    """For a live location: the stop of the day it's at, if any."""
    _, place = _nearest(db, trip, (day - trip.start_date).days + 1, lat, lon)
    return place.name if place is not None else None


# ---------------------------------------------------------------------------
# Live location
# ---------------------------------------------------------------------------

def live_of(db: Session, conversation_id: int, user_id: uuid.UUID) -> Optional[LiveLocation]:
    return db.get(LiveLocation, (conversation_id, user_id))


def purge_expired(db: Session, now: Optional[datetime] = None) -> list[LiveLocation]:
    """Delete live locations that ran out. Returns them (their cards change). Doesn't commit."""
    now = now or datetime.utcnow()
    gone = list(db.scalars(select(LiveLocation).where(LiveLocation.expires_at <= now)))
    for row in gone:
        db.delete(row)
    return gone


def stop_sharing(db: Session, conversation_id: int, user_id: uuid.UUID) -> Optional[int]:
    """Stop (or leave the room): the point is deleted. Returns the card's message id. Doesn't commit."""
    row = live_of(db, conversation_id, user_id)
    if row is None:
        return None
    db.delete(row)
    return row.message_id


def delete_user_live(db: Session, user_id: uuid.UUID) -> None:
    db.execute(delete(LiveLocation).where(LiveLocation.user_id == user_id))


def live_payload(db: Session, message_payload: dict, row: Optional[LiveLocation], trip: Optional[Trip], now: Optional[datetime] = None) -> dict:
    """A live location card as members see it: the point and time left while it runs, then only that it ended."""
    now = now or datetime.utcnow()
    if row is None or row.expires_at <= now:
        return {"active": False, "until": message_payload.get("until")}
    started = message_payload.get("date")
    near = near_stop(db, trip, date.fromisoformat(started), row.lat, row.lon) if trip is not None and started else None
    return {
        "active": True, "until": message_payload.get("until"), "lat": row.lat, "lon": row.lon, "accuracy_m": row.accuracy_m,
        "updated_at": row.updated_at.isoformat() + "Z", "near": near,
    }

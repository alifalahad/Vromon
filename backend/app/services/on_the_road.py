"""
Vromon Backend — "On the road" (docs/friends-chat-plan.md, step 6): which of your
friends are on a trip today, or leave within the next 14 days.

A person's trips reach their friends only while `share_trips_with_friends` is on
(decisions C3 and C7): the On the road strip, the chat header, the profile chip and
the profile's trip list all go through `shares_trips`. A trip they send into a chat
themselves still opens, because they chose to share that one.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.models import Trip, UserSettings

# How far ahead a coming trip shows
AHEAD = timedelta(days=14)


def shares_trips(db: Session, user_id: uuid.UUID) -> bool:
    row = db.get(UserSettings, user_id)
    return row.share_trips_with_friends if row is not None else True


@dataclass(frozen=True)
class RoadTrip:
    trip: Trip
    # Day N of `days` while the trip is on; None before it starts
    day: Optional[int]
    days: int
    # Days until it starts (0 once it has)
    starts_in: int


def road_trip(db: Session, user_id: uuid.UUID, today: date) -> Optional[RoadTrip]:
    """The trip `user_id` is on today, or else the next one starting within 14 days."""
    trips = db.scalars(
        select(Trip)
        .where(Trip.user_id == user_id, Trip.end_date >= today, Trip.start_date <= today + AHEAD)
        .order_by(Trip.start_date, Trip.id)
    ).all()
    if not trips:
        return None
    # On one now beats a coming one; of two at once, the one that started last
    current = [t for t in trips if t.start_date <= today]
    trip = max(current, key=lambda t: (t.start_date, t.id)) if current else trips[0]
    days = (trip.end_date - trip.start_date).days + 1
    if trip.start_date <= today:
        return RoadTrip(trip, (today - trip.start_date).days + 1, days, 0)
    return RoadTrip(trip, None, days, (trip.start_date - today).days)

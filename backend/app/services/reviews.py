"""
"How was your trip?" (docs/trip-upgrades, step 7; decisions D7-D9).

- **When:** from the trip's first day, and any time after (D7). Before it, 409.
- **Who:** the trip's owner and each joined member of its trip room, each with their own review (D8).
  Anyone else gets 404. No endpoint returns someone else's review (D9).
- **What:** five stars and an optional comment for the whole trip, and, optionally, things one by one,
  each good or bad with an optional comment (D9). The things come from the plan: getting there, each
  day's places and meals at restaurants, and where the traveller stayed (hotels; a stay with family or
  friends, named only for the owner, as D2).
- **Saving:** partial. The rating and the comment change only when sent; each thing sent is set (good /
  bad, with its comment) or cleared (verdict null); things not sent are left alone.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import TYPE_CHECKING, Any, Optional

from sqlalchemy import select

from app.models.models import ReviewItem, TripReview
from app.services import meals as meals_service
from app.services import rooms
from app.services import stays as stays_service

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

    from app.models.models import Trip, User

TARGETS = ("place", "restaurant", "hotel", "stay_home", "journey")
VERDICTS = ("good", "bad")
COMMENT_MAX = 280


class ReviewError(Exception):
    def __init__(self, message: str, status: int = 422):
        super().__init__(message)
        self.message, self.status = message, status


def can_review(db: "Session", trip: "Trip", user: "User") -> bool:
    """Everyone who went (D8): the owner and the trip room's joined members."""
    return trip.user_id == user.id or rooms.is_joined(db, trip.id, user.id)


def check_open(trip: "Trip", today: date) -> None:
    """From the trip's first day (D7)."""
    if today < trip.start_date:
        raise ReviewError(f"You can rate this trip from its first day, {trip.start_date.day} {trip.start_date:%b}.", 409)


def review_of(db: "Session", trip: "Trip", user: "User") -> Optional[TripReview]:
    return db.scalar(select(TripReview).where(TripReview.trip_id == trip.id, TripReview.user_id == user.id))


# ---------------------------------------------------------------------------
# The things to rate, from the plan
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class Thing:
    target_type: str
    target_id: Optional[int]
    item_id: Optional[int]
    name: str
    day: Optional[int] = None            # the day it's on (None: getting there, where you stayed)
    time: Optional[str] = None           # a stop's or a meal's start
    meal: Optional[str] = None           # Breakfast / Lunch / Dinner
    first_night: Optional[int] = None    # a stay's nights
    last_night: Optional[int] = None
    mode: Optional[str] = None           # how you got there (bus / train / plane / car / boat)

    @property
    def key(self) -> str:
        return f"{self.target_type}:{self.target_id if self.target_id is not None else ''}:{self.item_id if self.item_id is not None else ''}"


def things(db: "Session", trip: "Trip", viewer: "User") -> list[Thing]:
    """Getting there, then each day's places and meals at restaurants, then where you stayed."""
    out: list[Thing] = []
    stops = sorted(trip.stops, key=lambda s: s.position)
    if len(stops) >= 2 and stops[-1].transport_mode:
        a, b = stops[0], stops[-1]
        start = a.city.name if a.city is not None else a.country_iso2
        # The arrival by the trip's own name ("Cox's Bazar", not GeoNames' "Cox’s Bāzār")
        out.append(Thing("journey", b.id, None, f"{start} → {trip.destination}", mode=b.transport_mode))
    for day in sorted(trip.itinerary_days, key=lambda d: d.day_number):
        for item in sorted(day.items, key=lambda i: i.order_index):
            if item.item_type == "activity" and item.place is not None:
                out.append(Thing("place", item.place_id, item.id, item.place.name, day=day.day_number, time=item.start_time))
            elif item.item_type == "meal" and item.restaurant is not None and meals_service.source_of(item) == "restaurant":
                out.append(Thing("restaurant", item.restaurant_id, item.id, item.restaurant.name, day=day.day_number,
                                 time=item.start_time, meal=meals_service.slot_of(item)))
    owner = trip.user_id == viewer.id
    hotels: dict[int, Thing] = {}
    for b in stays_service.blocks_of(db, trip):
        if b.kind == "hotel" and b.hotel is not None:
            seen = hotels.get(b.hotel.id)
            first = min(b.first_night, seen.first_night) if seen else b.first_night
            last = max(b.last_night, seen.last_night) if seen else b.last_night
            hotels[b.hotel.id] = Thing("hotel", b.hotel.id, None, b.hotel.name, first_night=first, last_night=last)
        elif b.kind == "home":
            # Each stay with family or friends is its own thing (its trip_stays row). Its name is the
            # owner's to see (D2): others rate it as "with family or friends" (the app says so)
            row = next((s for s in trip.stays if s.first_night == b.first_night and s.kind == "home"), None)
            out.append(Thing("stay_home", row.id if row is not None else None, None, (b.label or "") if owner else "",
                             first_night=b.first_night, last_night=b.last_night))
    out.extend(sorted(hotels.values(), key=lambda t: t.first_night or 0))
    return out


def _thing_out(t: Thing, saved: Optional[ReviewItem]) -> dict[str, Any]:
    return {
        "key": t.key,
        "target_type": t.target_type,
        "target_id": t.target_id,
        "item_id": t.item_id,
        "name": t.name,
        "day": t.day,
        "time": t.time,
        "meal": t.meal,
        "first_night": t.first_night,
        "last_night": t.last_night,
        "mode": t.mode,
        "verdict": saved.verdict if saved is not None else None,
        "comment": saved.comment if saved is not None else None,
    }


def _match(things_: list[Thing], saved: list[ReviewItem]) -> dict[str, ReviewItem]:
    """Each thing's saved verdict: the same thing (type, target, itinerary item); a verdict whose itinerary
    item is gone (the day was re-planned) goes to the same place or restaurant, once."""
    by_exact = {(r.target_type, r.target_id, r.item_id): r for r in saved}
    out: dict[str, ReviewItem] = {}
    used: set[int] = set()
    for t in things_:
        r = by_exact.get((t.target_type, t.target_id, t.item_id))
        if r is not None:
            out[t.key] = r
            used.add(r.id)
    keys = {(t.target_type, t.target_id, t.item_id) for t in things_}
    for r in saved:
        if r.id in used or (r.target_type, r.target_id, r.item_id) in keys:
            continue
        t = next((t for t in things_ if t.key not in out and t.target_type == r.target_type and t.target_id == r.target_id), None)
        if t is not None:
            out[t.key] = r
            used.add(r.id)
    return out


def out(db: "Session", trip: "Trip", viewer: "User", today: date) -> dict[str, Any]:
    review = review_of(db, trip, viewer)
    list_ = things(db, trip, viewer)
    saved = _match(list_, list(review.items) if review is not None else [])
    return {
        "trip_id": trip.id,
        "opens_on": trip.start_date.isoformat(),
        "review": None if review is None else {
            "rating": review.rating, "comment": review.comment,
            "created_at": review.created_at.isoformat(), "updated_at": review.updated_at.isoformat(),
        },
        "items": [_thing_out(t, saved.get(t.key)) for t in list_],
    }


# ---------------------------------------------------------------------------
# Saving
# ---------------------------------------------------------------------------

def _comment(value: Optional[str]) -> Optional[str]:
    text = " ".join((value or "").split())
    if len(text) > COMMENT_MAX:
        raise ReviewError(f"A comment can be at most {COMMENT_MAX} characters.")
    return text or None


def save(db: "Session", trip: "Trip", viewer: "User", sent: set[str], rating: Optional[int], comment: Optional[str],
         items: list[dict]) -> TripReview:
    """Create or update the viewer's review. `sent`: which of rating / comment were in the request (left out:
    unchanged; sent as null: cleared). Each item: target_type, target_id, item_id, verdict (good / bad, or
    None to clear) and comment. Doesn't commit."""
    if rating is not None and not 1 <= rating <= 5:
        raise ReviewError("The rating is 1 to 5 stars.")
    review = review_of(db, trip, viewer)
    if review is None:
        review = TripReview(trip_id=trip.id, user_id=viewer.id)
        db.add(review)
    if "rating" in sent:
        review.rating = rating
    if "comment" in sent:
        review.comment = _comment(comment)
    if items:
        list_ = things(db, trip, viewer)
        known = {(t.target_type, t.target_id, t.item_id) for t in list_}
        saved = _match(list_, list(review.items))
        by_thing = {t.key: t for t in list_}
        for it in items:
            if it["target_type"] not in TARGETS:
                raise ReviewError("That can't be rated.")
            if it.get("verdict") is not None and it["verdict"] not in VERDICTS:
                raise ReviewError("A thing is good or bad.")
            triple = (it["target_type"], it.get("target_id"), it.get("item_id"))
            if triple not in known:
                raise ReviewError("That isn't part of this trip.")
            key = next(k for k, t in by_thing.items() if (t.target_type, t.target_id, t.item_id) == triple)
            row = saved.get(key)
            if it.get("verdict") is None:            # cleared: the verdict and its comment go
                if row is not None:
                    review.items.remove(row)
                    saved.pop(key, None)
                continue
            if row is None:
                row = ReviewItem(target_type=triple[0], target_id=triple[1], item_id=triple[2], verdict=it["verdict"])
                review.items.append(row)
                saved[key] = row
            row.target_id, row.item_id = triple[1], triple[2]
            row.verdict = it["verdict"]
            row.comment = _comment(it.get("comment"))
    db.flush()
    return review


def export(db: "Session", user: "User") -> list[dict[str, Any]]:
    """The user's reviews, for /me/export."""
    rows = db.scalars(select(TripReview).where(TripReview.user_id == user.id).order_by(TripReview.id)).all()
    return [
        {"trip_id": r.trip_id, "rating": r.rating, "comment": r.comment, "created_at": r.created_at.isoformat(),
         "updated_at": r.updated_at.isoformat(),
         "items": [{"target_type": i.target_type, "target_id": i.target_id, "item_id": i.item_id, "verdict": i.verdict,
                    "comment": i.comment} for i in r.items]}
        for r in rows
    ]


def delete_for(db: "Session", user: "User") -> None:
    """With the account: the user's reviews (on their own trips and in friends' trip rooms) and their items."""
    for r in db.scalars(select(TripReview).where(TripReview.user_id == user.id)).all():
        db.delete(r)

"""
Vromon — Itinerary editing (Phase 10).

Shared rules for every post-generation edit (remove, replace, fill a gap,
adapt, regenerate a day), so edits keep the itinerary consistent:

  - recompute_day(): re-sorts items and recalculates order, travel legs and
    day totals after any change (no stale travel times to deleted places)
  - fit_in_slot(): a place fits a gap only if its opening hours, visit
    duration and estimated travel from/to neighbouring activities allow it
  - must-visit places are never removed implicitly; removing one explicitly
    is refused with a clear message

Every edit is followed by the independent ConstraintValidator at the API layer.
Travel is the same straight-line estimate the schedulers use (haversine @ 30 km/h).
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import TYPE_CHECKING, Optional

from app.services.recommendation.recommendation_service import per_person_daily_budget
from app.models.models import Itinerary, ItineraryItem, Place, Trip
from app.services.itinerary.itinerary_service import (
    ItineraryService,
    _minutes_to_time,
    _time_to_minutes,
    _travel_minutes,
)

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

logger = logging.getLogger("vromon.editing")


class EditError(Exception):
    """An edit that cannot be applied. `status` is the HTTP status to report."""

    def __init__(self, message: str, status: int = 409):
        super().__init__(message)
        self.message = message
        self.status = status


@dataclass
class SlotFit:
    place: Place
    score: float
    reasons: list[str]
    start_min: int
    end_min: int
    travel_in_min: float
    distance_in_km: float


# ---------------------------------------------------------------------------
# Day bookkeeping
# ---------------------------------------------------------------------------

def sorted_items(day: Itinerary) -> list[ItineraryItem]:
    return sorted(day.items, key=lambda i: (_time_to_minutes(i.start_time), i.order_index))


def recompute_day(day: Itinerary, hotel=None) -> None:
    """Recalculate order, travel legs between consecutive activities and day totals."""
    items = sorted_items(day)
    activities = [i for i in items if i.item_type == "activity" and i.place is not None]
    for i, item in enumerate(items):
        item.order_index = i
        if item.item_type == "activity":
            item.travel_time_to_next = 0.0
            item.distance_to_next = 0.0

    total_travel = 0.0
    if activities and hotel is not None:
        total_travel += _travel_minutes(hotel, activities[0].place)[0]
    for prev, nxt in zip(activities, activities[1:]):
        minutes, km = _travel_minutes(prev.place, nxt.place)
        prev.travel_time_to_next = round(minutes, 1)
        prev.distance_to_next = round(km, 1)
        total_travel += minutes

    day.total_cost = round(sum(i.cost or 0.0 for i in items), 2)
    day.total_travel_time = round(total_travel, 1)


def used_place_ids(trip: Trip, ignore_item_id: Optional[int] = None) -> set[int]:
    return {
        i.place_id
        for d in trip.itinerary_days
        for i in d.items
        if i.item_type == "activity" and i.place_id and i.id != ignore_item_id
    }


def must_visit_ids(trip: Trip) -> set[int]:
    return set(trip.constraints.must_visit) if trip.constraints else set()


def is_must_visit(trip: Trip, item: ItineraryItem) -> bool:
    return bool(item.place_id) and item.place_id in must_visit_ids(trip)


def day_window(trip: Trip) -> tuple[int, int]:
    pref = trip.preference
    return (
        _time_to_minutes(pref.preferred_start_time if pref else "09:00"),
        _time_to_minutes(pref.preferred_end_time if pref else "20:00"),
    )


# ---------------------------------------------------------------------------
# Slot fitting
# ---------------------------------------------------------------------------

def _neighbour_activity(items: list[ItineraryItem], index: int, step: int) -> Optional[ItineraryItem]:
    j = index + step
    while 0 <= j < len(items):
        if items[j].item_type == "activity" and items[j].place is not None:
            return items[j]
        j += step
    return None


def fit_in_slot(
    place: Place,
    slot_start: int,
    slot_end: int,
    prev_activity: Optional[ItineraryItem],
    next_activity: Optional[ItineraryItem],
    next_item_start: int,
) -> Optional[tuple[int, int, float, float]]:
    """
    Earliest feasible (start, end, travel_in, km_in) for `place` inside [slot_start, slot_end],
    or None. Travel to the next activity must also fit before it starts.
    """
    duration = int(place.average_visit_duration * 60)
    travel_in, km_in = (0.0, 0.0)
    if prev_activity is not None:
        travel_in, km_in = _travel_minutes(prev_activity.place, place)
    start = max(slot_start + int(round(travel_in)), _time_to_minutes(place.opening_time))
    end = start + duration
    latest_end = min(slot_end, _time_to_minutes(place.closing_time))
    if next_activity is not None:
        latest_end = min(latest_end, next_item_start - int(round(_travel_minutes(place, next_activity.place)[0])))
    if end > latest_end:
        return None
    return start, end, travel_in, km_in


def ranked_places(db: "Session", trip: Trip) -> list[tuple[Place, float, list[str]]]:
    pref, cons = trip.preference, trip.constraints
    return ItineraryService().recommender.recommend(
        db=db,
        destination=trip.destination,
        interests=pref.interests if pref else [],
        travel_style=pref.travel_style if pref else "Balanced",
        activity_level=pref.activity_level if pref else "Medium",
        daily_budget=per_person_daily_budget(trip.total_budget, trip.num_days, trip.num_travelers),
        avoid_crowded=cons.avoid_crowded if cons else False,
        exclude_ids=cons.excluded_places if cons else [],
        limit=50,
    )


def _within_daily_cap(trip: Trip, day: Itinerary, added_cost: float, removed_cost: float = 0.0) -> bool:
    cap = trip.constraints.max_daily_budget if trip.constraints else 0.0
    if not cap:
        return True
    current = sum(i.cost or 0.0 for i in day.items)
    return current - removed_cost + added_cost <= cap + 1e-6


def alternatives_for_item(db: "Session", trip: Trip, item: ItineraryItem, limit: int = 5) -> list[SlotFit]:
    """Unused, non-excluded places that fit the time slot of `item` (best ranked first)."""
    day = item.itinerary
    items = sorted_items(day)
    idx = items.index(item)
    day_start, day_end = day_window(trip)
    slot_start = _time_to_minutes(items[idx - 1].end_time) if idx > 0 else day_start
    next_start = _time_to_minutes(items[idx + 1].start_time) if idx + 1 < len(items) else day_end
    prev_act = _neighbour_activity(items, idx, -1)
    next_act = _neighbour_activity(items, idx, +1)
    # only the immediately following activity constrains travel-out
    next_act_for_travel = next_act if (idx + 1 < len(items) and items[idx + 1] is next_act) else None

    excluded = set(trip.constraints.excluded_places) if trip.constraints else set()
    used = used_place_ids(trip, ignore_item_id=item.id)
    fits: list[SlotFit] = []
    for place, score, reasons in ranked_places(db, trip):
        if place.id in used or place.id in excluded or place.id == item.place_id:
            continue
        fit = fit_in_slot(place, slot_start, min(next_start, day_end), prev_act, next_act_for_travel, next_start)
        if fit is None or not _within_daily_cap(trip, day, place.estimated_cost, item.cost or 0.0):
            continue
        start, end, travel_in, km_in = fit
        fits.append(SlotFit(place, score, reasons, start, end, travel_in, km_in))
        if len(fits) >= limit:
            break
    return fits


# ---------------------------------------------------------------------------
# Edits
# ---------------------------------------------------------------------------

def _new_activity_item(day: Itinerary, fit: SlotFit, note: str) -> ItineraryItem:
    item = ItineraryItem(
        itinerary_id=day.id,
        item_type="activity",
        place_id=fit.place.id,
        title=fit.place.name,
        start_time=_minutes_to_time(fit.start_min),
        end_time=_minutes_to_time(fit.end_min),
        duration_minutes=fit.end_min - fit.start_min,
        cost=fit.place.estimated_cost,
        travel_time_to_next=0.0,
        distance_to_next=0.0,
        notes=fit.place.best_time,
        recommendation_score=round(fit.score, 3),
        order_index=0,
    )
    item.recommendation_reasons = list(fit.reasons) + [note]
    item.place = fit.place
    return item


def remove_activity(db: "Session", trip: Trip, item: ItineraryItem, hotel=None) -> Itinerary:
    if item.item_type != "activity":
        raise EditError("Only activities can be removed; meals are part of the day structure.", 422)
    if is_must_visit(trip, item):
        raise EditError(
            f"'{item.title}' is a must-visit place. Remove it from your must-visit list first.", 409
        )
    day = item.itinerary
    day.items.remove(item)
    db.delete(item)
    db.flush()
    recompute_day(day, hotel)
    return day


def replace_activity(
    db: "Session", trip: Trip, item: ItineraryItem, place_id: Optional[int] = None, hotel=None
) -> ItineraryItem:
    if item.item_type != "activity":
        raise EditError("Only activities can be replaced.", 422)
    if is_must_visit(trip, item):
        raise EditError(f"'{item.title}' is a must-visit place and cannot be replaced.", 409)

    options = alternatives_for_item(db, trip, item, limit=50)
    if place_id is not None:
        chosen = next((f for f in options if f.place.id == place_id), None)
        if chosen is None:
            raise EditError(
                "That place cannot be used here: it is excluded, already in the trip, closed during "
                "this time slot, too long for the gap, or over the daily budget cap.", 422
            )
    else:
        if not options:
            raise EditError("No other place fits this time slot.", 409)
        chosen = options[0]

    day = item.itinerary
    day.items.remove(item)
    db.delete(item)
    db.flush()
    new_item = _new_activity_item(day, chosen, f"Replaced '{item.title}' at your request")
    day.items.append(new_item)
    db.flush()
    recompute_day(day, hotel)
    return new_item


def _largest_gaps(trip: Trip, day: Itinerary) -> list[tuple[int, int, int]]:
    """Free gaps (start, end, index of following item) inside the day window, largest first."""
    items = sorted_items(day)
    day_start, day_end = day_window(trip)
    gaps = []
    cursor = day_start
    for idx, it in enumerate(items):
        s = _time_to_minutes(it.start_time)
        if s - cursor > 0:
            gaps.append((cursor, min(s, day_end), idx))
        cursor = max(cursor, _time_to_minutes(it.end_time))
    if day_end > cursor:
        gaps.append((cursor, day_end, len(items)))
    return sorted(gaps, key=lambda g: g[1] - g[0], reverse=True)


def add_best_activity(db: "Session", trip: Trip, day: Itinerary, hotel=None) -> Optional[ItineraryItem]:
    """Add the best-ranked unused place that fits any free gap (respecting the daily limit)."""
    max_per_day = trip.constraints.max_activities_per_day if trip.constraints else 4
    if sum(1 for i in day.items if i.item_type == "activity") >= max_per_day:
        return None
    excluded = set(trip.constraints.excluded_places) if trip.constraints else set()
    used = used_place_ids(trip)
    items = sorted_items(day)
    ranked = [r for r in ranked_places(db, trip) if r[0].id not in used and r[0].id not in excluded]
    for gap_start, gap_end, next_idx in _largest_gaps(trip, day):
        prev_act = _neighbour_activity(items, next_idx, -1)
        next_item = items[next_idx] if next_idx < len(items) else None
        next_act = next_item if next_item is not None and next_item.item_type == "activity" else None
        for place, score, reasons in ranked:
            fit = fit_in_slot(place, gap_start, gap_end, prev_act, next_act, gap_end)
            if fit is None or not _within_daily_cap(trip, day, place.estimated_cost):
                continue
            start, end, t_in, km_in = fit
            new_item = _new_activity_item(
                day, SlotFit(place, score, reasons, start, end, t_in, km_in), "Added to make the day more active"
            )
            day.items.append(new_item)
            db.flush()
            recompute_day(day, hotel)
            return new_item
    return None

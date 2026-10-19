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
from app.services.itinerary.trip_rules import Block, MustSee, TripRules, in_window, load_rules, place_timed, rules_for
from app.services.conditions.service import planning_weather

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
        minutes, km = _travel_minutes(prev.place, nxt.place, prev.travel_mode)
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


def copy_item(src: ItineraryItem) -> ItineraryItem:
    item = ItineraryItem(
        item_type=src.item_type, place_id=src.place_id, restaurant_id=src.restaurant_id,
        title=src.title, start_time=src.start_time, end_time=src.end_time,
        duration_minutes=src.duration_minutes, cost=src.cost, travel_time_to_next=0.0,
        distance_to_next=0.0, notes=src.notes, recommendation_score=src.recommendation_score,
        order_index=src.order_index, pinned=bool(src.pinned),
    )
    item.recommendation_reasons = src.recommendation_reasons
    return item


def must_visit_ids(trip: Trip) -> set[int]:
    return set(trip.constraints.must_visit) if trip.constraints else set()


def is_must_visit(trip: Trip, item: ItineraryItem) -> bool:
    return bool(item.place_id) and item.place_id in must_visit_ids(trip)


def day_window(trip: Trip, day_number: Optional[int] = None) -> tuple[int, int]:
    """The day's start and end; the first and last day follow the arrival and leaving times."""
    rules = rules_for(trip)
    return rules.window(day_number) if day_number else (rules.start, rules.end)


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
    day_start, day_end = day_window(trip, day.day_number)
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
    day_start, day_end = day_window(trip, day.day_number)
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


# ---------------------------------------------------------------------------
# Rearranging (trip planner step 3): reorder, move to another day, change how
# long you stay, add a place. Each re-times the day with apply_order().
# ---------------------------------------------------------------------------

# Meals don't start before their usual time when moved around the day
MEAL_EARLIEST = {"Lunch": 12 * 60, "Dinner": 19 * 60}


def _opening_min(item: ItineraryItem) -> int:
    point = item.place if item.item_type == "activity" else item.restaurant
    return _time_to_minutes(point.opening_time) if point is not None and point.opening_time else 0


def day_start_of(day: Itinerary, trip: Trip) -> int:
    """
    When the day begins: the preferred start, or the first stop if it starts earlier.
    (Not just the first stop: after lunch is moved first, the morning must not be lost.)
    """
    starts = [_time_to_minutes(i.start_time) for i in day.items if i.start_time]
    return min([day_window(trip, day.day_number)[0], *starts])


def busy_of(trip: Trip, day: Itinerary) -> list[tuple[int, int]]:
    return [(b.start, b.end) for b in rules_for(trip).busy_on(day.day_number)]


def apply_order(
    day: Itinerary, ordered: list[ItineraryItem], day_start: int, hotel=None, from_index: int = 0,
    busy: list[tuple[int, int]] = (),
) -> list[str]:
    """
    Give the day's items times in this order. Items before `from_index` keep their
    times; from there each starts after the one before plus travel between
    activities (the same straight-line estimate as the planner), never before
    the place or restaurant opens or before the meal's usual time, and never during
    a busy time (it waits until the busy time ends). A pinned item keeps its start
    unless the items before it now run past it.
    Returns notes about pinned items that had to move.
    """
    notes: list[str] = []
    from_index = max(0, min(from_index, len(ordered)))
    cursor = day_start
    prev_activity: Optional[ItineraryItem] = None
    for item in ordered[:from_index]:
        cursor = _time_to_minutes(item.end_time)
        if item.item_type == "activity" and item.place is not None:
            prev_activity = item
    for idx, item in enumerate(ordered):
        item.order_index = idx
        if idx < from_index:
            continue
        earliest = cursor
        if item.item_type == "activity" and item.place is not None and prev_activity is not None:
            # Travel starts when the previous visit ends (a meal in between happens on the way)
            earliest = max(cursor, _time_to_minutes(prev_activity.end_time) + travel_minutes(prev_activity, item, prev_activity.travel_mode))
        start = max(earliest, _opening_min(item))
        if item.item_type == "meal":
            start = max(start, MEAL_EARLIEST.get(item.title.split(" at ")[0], 0))
        start = after_busy(start, item.duration_minutes, busy)
        if item.pinned:
            kept = _time_to_minutes(item.start_time)
            if start > kept:
                notes.append(f"'{item.title}' had to move to {_minutes_to_time(start)}.")
            start = max(start, kept)
        item.start_time = _minutes_to_time(start)
        item.end_time = _minutes_to_time(start + item.duration_minutes)
        cursor = start + item.duration_minutes
        if item.item_type == "activity" and item.place is not None:
            prev_activity = item
    recompute_day(day, hotel)
    return notes


def after_busy(start: int, duration: int, busy: list[tuple[int, int]]) -> int:
    """The first start at or after `start` that doesn't overlap a busy time."""
    for b0, b1 in sorted(busy):
        if start < b1 and b0 < start + duration:
            start = b1
    return start


def first_difference(old: list[ItineraryItem], new: list[ItineraryItem]) -> int:
    for i, (a, b) in enumerate(zip(old, new)):
        if a.id != b.id:
            return i
    return min(len(old), len(new))


def reorder_day(day: Itinerary, trip: Trip, item_ids: list[int], hotel=None) -> list[str]:
    current = sorted_items(day)
    if sorted(item_ids) != sorted(i.id for i in current):
        raise EditError("The new order must list every stop of this day exactly once.", 422)
    by_id = {i.id: i for i in current}
    ordered = [by_id[i] for i in item_ids]
    return apply_order(day, ordered, day_start_of(day, trip), hotel, first_difference(current, ordered), busy_of(trip, day))


def move_to_day(db: "Session", trip: Trip, item: ItineraryItem, target: Itinerary, position: Optional[int], hotel=None) -> list[str]:
    source = item.itinerary
    if target.id == source.id:
        raise EditError("The stop is already on that day.", 422)
    src_before = sorted_items(source)
    src_start, dst_start = day_start_of(source, trip), day_start_of(target, trip)
    removed_at = src_before.index(item)
    dst_order = sorted_items(target)
    pos = len(dst_order) if position is None else max(0, min(position, len(dst_order)))
    source.items.remove(item)
    target.items.append(item)
    item.pinned = False  # its time belonged to the other day
    db.flush()
    dst_order.insert(pos, item)
    notes = apply_order(source, [i for i in src_before if i.id != item.id], src_start, hotel, removed_at, busy_of(trip, source))
    notes += apply_order(target, dst_order, dst_start, hotel, pos, busy_of(trip, target))
    return notes


def set_duration(day: Itinerary, trip: Trip, item: ItineraryItem, minutes: int, hotel=None) -> list[str]:
    ordered = sorted_items(day)
    item.duration_minutes = minutes
    # Its own start stays; everything after it moves
    idx = ordered.index(item)
    item.end_time = _minutes_to_time(_time_to_minutes(item.start_time) + minutes)
    return apply_order(day, ordered, day_start_of(day, trip), hotel, idx + 1, busy_of(trip, day))


def add_place(db: "Session", trip: Trip, day: Itinerary, place: Place, position: Optional[int], hotel=None) -> tuple[ItineraryItem, list[str]]:
    if place.destination_name != trip.destination:
        raise EditError(f"'{place.name}' isn't in {trip.destination}.", 422)
    if trip.constraints and place.id in set(trip.constraints.excluded_places):
        raise EditError(f"You excluded '{place.name}' from this trip.", 409)
    if place.id in used_place_ids(trip):
        raise EditError(f"'{place.name}' is already in your trip.", 409)
    ranked = {p.id: (s, r) for p, s, r in ranked_places(db, trip)}
    score, reasons = ranked.get(place.id, (0.0, []))
    ordered = sorted_items(day)
    pos = len(ordered) if position is None else max(0, min(position, len(ordered)))
    start = day_start_of(day, trip)
    minutes = int(round(place.average_visit_duration * 60))
    item = ItineraryItem(
        itinerary_id=day.id,
        item_type="activity",
        place_id=place.id,
        title=place.name,
        start_time=_minutes_to_time(start),
        end_time=_minutes_to_time(start + minutes),
        duration_minutes=minutes,
        cost=place.estimated_cost,
        travel_time_to_next=0.0,
        distance_to_next=0.0,
        notes=place.best_time,
        recommendation_score=round(score, 3),
        order_index=pos,
    )
    item.recommendation_reasons = list(reasons) + ["Added by you"]
    item.place = place
    day.items.append(item)
    db.flush()
    ordered.insert(pos, item)
    return item, apply_order(day, ordered, start, hotel, pos, busy_of(trip, day))


def suggestions_for_day(db: "Session", trip: Trip, near: Optional[ItineraryItem], query: Optional[str], limit: int = 8):
    """Unused, non-excluded places to add, best first; near a stop, closer places rank higher."""
    excluded = set(trip.constraints.excluded_places) if trip.constraints else set()
    used = used_place_ids(trip)
    anchor = None
    if near is not None:
        anchor = near.place if near.item_type == "activity" else near.restaurant
    out = []
    for place, score, reasons in ranked_places(db, trip):
        if place.id in used or place.id in excluded:
            continue
        if query and query.strip().lower() not in place.name.lower():
            continue
        km = None
        if anchor is not None and anchor.latitude is not None and place.latitude is not None:
            km = _travel_minutes(anchor, place)[1]
        out.append((place, score, reasons, km))
    if anchor is not None:
        out.sort(key=lambda x: x[1] - (0.03 * x[3] if x[3] is not None else 0.0), reverse=True)
    return out[:limit]


# ---------------------------------------------------------------------------
# Re-planning one day around the traveller's must-dos (trip planner step 4)
# ---------------------------------------------------------------------------

def breaks_rules(trip: Trip, rules: TripRules, item: ItineraryItem, day_number: int) -> bool:
    """True when the item is somewhere the traveller's rules don't allow any more."""
    s, e = _time_to_minutes(item.start_time), _time_to_minutes(item.end_time)
    window = rules.window(day_number)
    if (day_number == 1 and rules.arrive is not None and s < window[0] == rules.arrive) or (
        day_number == rules.num_days and rules.leave is not None and e > window[1] == rules.leave
    ):
        return True
    if any(s < b.end and b.start < e for b in rules.busy_on(day_number)):
        return True
    if item.item_type == "activity" and item.place_id:
        if trip.constraints and item.place_id in set(trip.constraints.excluded_places):
            return True
        m = rules.must_for(item.place_id)
        if m is not None and (m.day or m.timed) and not in_window(rules, m, item, day_number):
            return True
    return False


def plan_day(
    db: "Session", trip: Trip, day: Itinerary, hotel=None, avoid: frozenset = frozenset(), rules: Optional[TripRules] = None,
) -> tuple[Itinerary, list[ItineraryItem]]:
    """
    A new plan for one day (not saved): its pinned stops stay, the must-sees that belong on
    it are placed first, and the best other places fill the rest. Places on other days and
    `avoid` aren't used. Returns the new day and the items that stay.
    """
    rules = rules or load_rules(db, trip)
    svc = ItineraryService()
    n = day.day_number
    keep = [i for i in day.items if i.pinned and not breaks_rules(trip, rules, i, n)]
    other_days = {i.place_id for d in trip.itinerary_days if d.id != day.id for i in d.items if i.place_id}
    candidates = svc.ranked(db, trip, rules)
    places = {p.id: p for p, _, _ in candidates}
    kept_ids = {i.place_id for i in keep if i.place_id}
    # Must-sees with a time that aren't on another day may go here
    timed = [
        MustSee(m.place_id, n, m.when, m.at) for m in rules.must_sees
        if m.timed and m.day in (None, n) and m.place_id not in other_days and m.place_id not in kept_ids
        and m.place_id in places
    ]
    from dataclasses import replace
    day_rules = replace(rules, must_sees=timed)
    blocks = {n: [Block(_time_to_minutes(k.start_time), _time_to_minutes(k.end_time), k.place or k.restaurant, "kept") for k in keep]}
    anchors = place_timed(day_rules, places, hotel, blocks)
    used = set(other_days) | set(kept_ids) | (set(avoid) - rules.must_ids())
    wet = planning_weather(db, trip).get(n, frozenset())
    anchors += svc.sunset_stops(trip, rules, candidates, anchors, hotel, {n: wet}, days=[n], fixed=blocks, taken=used)
    new_day = svc._build_day(
        db=db, trip=trip, day_number=n, day_date=day.day_date, candidates=candidates,
        used_place_ids=used, hotel=hotel, rules=rules, anchors=anchors, keep=keep, wet=wet,
    )
    return new_day, keep


def apply_day(db: "Session", day: Itinerary, new_day: Itinerary, keep: list[ItineraryItem], hotel=None) -> None:
    """Replace the day's items with the new plan's (the kept ones stay)."""
    kept = {id(k) for k in keep}
    for item in list(day.items):
        if id(item) in kept:
            continue
        day.items.remove(item)
        db.delete(item)
    db.flush()
    day.theme = new_day.theme
    # Copied, so the throwaway day object never enters the session (it would become an extra day row)
    for generated in new_day.items:
        day.items.append(copy_item(generated))
    if new_day in db:
        db.expunge(new_day)
    db.flush()
    recompute_day(day, hotel)


def replan_for_rules(db: "Session", trip: Trip, changed_days: set[int], hotel=None) -> list[int]:
    """
    After the must-dos change: re-plan only the days that need it, that is the days whose
    rules changed, the days with a stop the rules no longer allow, and the days a missing
    must-see should go to. Returns the day numbers re-planned.
    """
    rules = load_rules(db, trip)
    days = sorted(trip.itinerary_days, key=lambda d: d.day_number)
    affected = {n for n in changed_days if 1 <= n <= len(days)}
    # A must-see in the wrong place leaves it first, so its new day can take it
    for day in days:
        for item in list(day.items):
            if breaks_rules(trip, rules, item, day.day_number):
                affected.add(day.day_number)
                m = rules.must_for(item.place_id) if item.place_id else None
                if m is not None:
                    day.items.remove(item)
                    db.delete(item)
    db.flush()
    in_plan = {i.place_id for d in days for i in d.items if i.place_id}
    for m in rules.must_sees:
        if m.place_id in in_plan:
            continue
        if m.day:
            affected.add(m.day)
        else:
            # the day with the fewest stops (the earliest of those)
            affected.add(min(days, key=lambda d: (sum(1 for i in d.items if i.item_type == "activity"), d.day_number)).day_number)
    for day in days:
        if day.day_number in affected:
            new_day, keep = plan_day(db, trip, day, hotel, rules=rules)
            apply_day(db, day, new_day, keep, hotel)
    return sorted(affected)


# ---------------------------------------------------------------------------
# How you get from one stop to the next (trip planner step 5)
# ---------------------------------------------------------------------------

def _next_activity(ordered: list[ItineraryItem], idx: int) -> Optional[ItineraryItem]:
    return next((i for i in ordered[idx + 1:] if i.item_type == "activity" and i.place is not None), None)


def _pushed(ordered: list[ItineraryItem], idx: int, leg_mode: Optional[str], busy: list[tuple[int, int]]) -> dict[int, int]:
    """
    New starts of the stops after ordered[idx] when the leg leaving it uses `leg_mode`:
    a stop moves later only if it would otherwise start before you can get there
    (nothing moves earlier, so free time is kept). Returns {item id: new start} for those that move.
    """
    moved: dict[int, int] = {}
    item = ordered[idx]
    cursor = _time_to_minutes(item.end_time)
    prev = item if item.item_type == "activity" and item.place is not None else None
    prev_mode = leg_mode if prev is item else None
    if prev is None:
        prev = next((i for i in reversed(ordered[:idx]) if i.item_type == "activity" and i.place is not None), None)
        prev_mode = prev.travel_mode if prev is not None else None
    prev_end = _time_to_minutes(prev.end_time) if prev is not None else cursor
    for j in ordered[idx + 1:]:
        old = _time_to_minutes(j.start_time)
        earliest = cursor
        if j.item_type == "activity" and j.place is not None and prev is not None:
            # Travel starts when the previous visit ends (a meal in between happens on the way)
            earliest = max(earliest, prev_end + travel_minutes(prev, j, prev_mode))
        start = after_busy(max(old, earliest), j.duration_minutes, busy)
        if start != old:
            moved[j.id] = start
        cursor = start + j.duration_minutes
        if j.item_type == "activity" and j.place is not None:
            prev, prev_mode, prev_end = j, j.travel_mode, cursor
    return moved


def travel_minutes(a: ItineraryItem, b: ItineraryItem, mode: Optional[str]) -> int:
    """Whole minutes from one visit to the next (what times are planned with)."""
    return int(round(_travel_minutes(a.place, b.place, mode)[0]))


def leg_options(trip: Trip, day: Itinerary, item: ItineraryItem) -> dict:
    """The ways to get from this stop to the next one: time, fare and what each does to the day."""
    from app.services.routing import ROADS, point_of
    from app.services.routing import modes as M

    ordered = sorted_items(day)
    idx = ordered.index(item)
    nxt = _next_activity(ordered, idx)
    if item.item_type != "activity" or item.place is None or nxt is None:
        raise EditError("There's no next stop to travel to from here.", 422)
    road = ROADS.pair(point_of(item.place), point_of(nxt.place))
    busy = busy_of(trip, day)
    # You leave when the visit ends (a meal in between happens on the way)
    leave = _time_to_minutes(item.end_time)
    current = item.travel_mode or (M.default_mode(road.km) if road.source == "road" else None)
    options = []
    for mode in M.offered(road.km):
        travel = ROADS.travel(point_of(item.place), point_of(nxt.place), mode)
        moved = _pushed(ordered, idx, mode, busy)
        by_id = {i.id: i for i in ordered}
        options.append({
            "mode": mode,
            "minutes": round(travel.minutes),
            "fare": M.fare(mode, road.km),
            "arrive": _minutes_to_time(max(leave + round(travel.minutes), _time_to_minutes(ordered[ordered.index(nxt) - 1].end_time))),
            "recommended": road.source == "road" and mode == M.default_mode(road.km),
            "moves": [
                {
                    "item_id": iid,
                    "item_type": by_id[iid].item_type,
                    "title": by_id[iid].title,
                    "minutes_later": start - _time_to_minutes(by_id[iid].start_time),
                }
                for iid, start in sorted(moved.items(), key=lambda kv: _time_to_minutes(by_id[kv[0]].start_time))
            ],
        })
    return {
        "item_id": item.id,
        "from": item.title,
        "to": nxt.title,
        "to_item_id": nxt.id,
        "km": round(road.km, 1),
        "source": road.source,
        "leave": _minutes_to_time(leave),
        "mode": current,
        "chosen": item.travel_mode is not None,
        "options": options,
    }


def set_travel_mode(trip: Trip, day: Itinerary, item: ItineraryItem, mode: Optional[str], hotel=None) -> list[str]:
    """Choose how to get to the next stop (None: let the app choose); later stops move only if they must."""
    ordered = sorted_items(day)
    idx = ordered.index(item)
    if item.item_type != "activity" or _next_activity(ordered, idx) is None:
        raise EditError("There's no next stop to travel to from here.", 422)
    item.travel_mode = mode
    notes = []
    for iid, start in _pushed(ordered, idx, mode, busy_of(trip, day)).items():
        it = next(i for i in ordered if i.id == iid)
        if it.pinned:
            notes.append(f"'{it.title}' had to move to {_minutes_to_time(start)}.")
        it.start_time = _minutes_to_time(start)
        it.end_time = _minutes_to_time(start + it.duration_minutes)
    recompute_day(day, hotel)
    return notes

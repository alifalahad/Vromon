"""
Running late (trip planner step 9, Today mode): push the rest of today back.

The first stop that hasn't started yet starts `minutes` later; the ones after it
move only if they must (free time absorbs the delay, as when a slower ride is
chosen). Must-sees and pinned stops never move. A stop that would then run past
its closing time, the end of your day, or into a must-see or pinned stop is
dropped, and the answer says which and why. Applying returns an `undo` that puts
every time back and the dropped stops back where they were.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Optional

from app.services.itinerary.editing_service import (
    after_busy, busy_of, day_window, is_must_visit, recompute_day, sorted_items, travel_minutes,
)
from app.services.itinerary.trip_rules import m2t, t2m

if TYPE_CHECKING:
    from sqlalchemy.orm import Session
    from app.models.models import Itinerary, ItineraryItem, Trip

MEALS = ("Breakfast", "Lunch", "Dinner")


class LateError(Exception):
    def __init__(self, message: str, status: int = 422):
        super().__init__(message)
        self.message = message
        self.status = status


def _protected(trip: "Trip", item: "ItineraryItem") -> bool:
    return bool(item.pinned) or (item.item_type == "activity" and is_must_visit(trip, item))


def _visit(item: "ItineraryItem") -> bool:
    return item.item_type == "activity" and item.place is not None


def push_back(trip: "Trip", day: "Itinerary", now: int, minutes: int) -> dict:
    """
    What pushing the rest of the day back would do (nothing is changed):
    {"moved": [{item_id, title, from, to}], "dropped": [{item_id, title, reason}], "kept": [{item_id, title, at}]}.
    """
    ordered = sorted_items(day)
    later = [i for i in ordered if t2m(i.start_time) >= now]
    out: dict = {"moved": [], "dropped": [], "kept": [], "_times": {}}
    if not later:
        return out
    busy = busy_of(trip, day)
    day_end = day_window(trip, day.day_number)[1]
    started = ordered[: len(ordered) - len(later)]
    prev = next((i for i in reversed(started) if _visit(i)), None)
    prev_end = t2m(prev.end_time) + minutes if prev is not None else None
    cursor = t2m(later[0].start_time) + minutes

    for idx, j in enumerate(later):
        old = t2m(j.start_time)
        if _protected(trip, j):
            out["kept"].append({"item_id": j.id, "title": j.title, "at": j.start_time})
            cursor = max(cursor, t2m(j.end_time))
            if _visit(j):
                prev, prev_end = j, t2m(j.end_time)
            continue
        earliest = cursor
        if _visit(j) and prev is not None:
            # Travel starts when the previous visit ends (a meal in between happens on the way)
            earliest = max(earliest, prev_end + travel_minutes(prev, j, prev.travel_mode))
        start = after_busy(max(old, earliest), j.duration_minutes, busy)
        end = start + j.duration_minutes

        # Where it must end by: the day, its closing time, and the next stop that can't move
        reason: Optional[dict] = None
        if end > day_end:
            reason = {"code": "day_ends", "end": m2t(day_end)}
        elif _visit(j) and j.place.closing_time and end > t2m(j.place.closing_time):
            reason = {"code": "closes", "closes": j.place.closing_time}
        else:
            nf = next((k for k in later[idx + 1:] if _protected(trip, k)), None)
            if nf is not None:
                need = travel_minutes(j, nf, j.travel_mode) if _visit(j) and _visit(nf) else 0
                if end + need > t2m(nf.start_time):
                    reason = {"code": "before", "place": nf.title, "at": nf.start_time}
        if reason is not None:
            out["dropped"].append({"item_id": j.id, "title": j.title, "reason": reason})
            continue
        if start != old:
            out["moved"].append({"item_id": j.id, "title": j.title, "from": j.start_time, "to": m2t(start)})
        out["_times"][j.id] = start
        cursor = end
        if _visit(j):
            prev, prev_end = j, end
    return out


def public(plan: dict) -> dict:
    return {k: v for k, v in plan.items() if not k.startswith("_")}


def apply(db: "Session", trip: "Trip", day: "Itinerary", plan: dict, hotel=None) -> dict:
    """Make the change; returns the undo (the old times, and the dropped stops to put back)."""
    items = {i.id: i for i in day.items}
    undo: dict = {"times": {}, "restore": []}
    for m in plan["moved"]:
        it = items[m["item_id"]]
        undo["times"][str(it.id)] = [it.start_time, it.end_time]
        start = plan["_times"][it.id]
        it.start_time, it.end_time = m2t(start), m2t(start + it.duration_minutes)
    for d in plan["dropped"]:
        it = items[d["item_id"]]
        if it.item_type == "meal":
            undo["restore"].append({"kind": "meal", "meal": it.title.split(" at ")[0], "restaurant_id": it.restaurant_id,
                                    "start": it.start_time})
        else:
            undo["restore"].append({"kind": "activity", "place_id": it.place_id, "start": it.start_time})
        day.items.remove(it)
        db.delete(it)
    db.flush()
    recompute_day(day, hotel)
    return undo


def undo(db: "Session", trip: "Trip", day: "Itinerary", data: dict, hotel=None) -> None:
    """Put the times back and the dropped stops back (only this day's own stops, only places of this trip's destination)."""
    from app.models.models import Place, Restaurant
    from app.services.itinerary.editing_service import ranked_places, used_place_ids
    from app.services.itinerary.itinerary_service import ItineraryService

    items = {i.id: i for i in day.items}
    for key, (start, end) in (data.get("times") or {}).items():
        it = items.get(int(key))
        if it is None:
            raise LateError("That change can't be undone any more: the day has changed since.", 409)
        t2m(start), t2m(end)  # valid times only
        it.start_time, it.end_time = start, end
    svc = ItineraryService()
    taken = used_place_ids(trip)
    ranked = {p.id: (sc, rs) for p, sc, rs in ranked_places(db, trip)} if data.get("restore") else {}
    for r in data.get("restore") or []:
        start = t2m(r["start"])
        if r.get("kind") == "meal":
            if r.get("meal") not in MEALS:
                raise LateError("Unknown meal.")
            rest = db.get(Restaurant, r["restaurant_id"]) if r.get("restaurant_id") else None
            if rest is not None and rest.destination_name != trip.destination:
                raise LateError("That restaurant isn't in this trip's destination.")
            day.items.append(svc._make_meal_item(r["meal"], rest, start))
        else:
            place = db.get(Place, r.get("place_id"))
            if place is None or place.destination_name != trip.destination:
                raise LateError("That place isn't in this trip's destination.")
            if place.id in taken:
                raise LateError(f"'{place.name}' is in your trip again already.", 409)
            score, reasons = ranked.get(place.id, (0.0, []))
            item = svc._activity_item(place, start, score, list(reasons))
            day.items.append(item)
    db.flush()
    recompute_day(day, hotel)

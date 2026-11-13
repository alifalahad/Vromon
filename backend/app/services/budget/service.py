"""
The whole trip's cost (trip planner step 7): getting there, the stay, food,
tickets and local travel, each with a range, by day, and the ways to save that
actually apply to this plan, each applied (and undone) in one tap.

  - Getting there: both ways by the trip's mode, from the rough estimate in
    `routing.modes` (per seat, or per car).
  - Stay: night by night (the trip's stays): a hotel's price × its nights × rooms (2 travellers
    a room); a family or friend's home, or a day trip, costs nothing.
  - Food and tickets: the plan's prices × travellers. Meals without a restaurant
    record have a placeholder price, so food is then an estimate.
  - Local travel: every leg of every day, from where the day starts to the first stop and
    from its last stop or meal back to where the traveller sleeps included, by the leg's mode,
    its fare × the vehicles needed. Legs without road data use the straight line × 1.3.

Estimates carry a range (`low`–`high`) and are marked; known prices have none.
Nothing unknown is guessed: a part without data is `known: false` and isn't
counted.
"""

from __future__ import annotations

from math import ceil
from typing import TYPE_CHECKING, Optional

from app.services.routing import ROADS, point_of
from app.services.routing import modes as M

if TYPE_CHECKING:
    from sqlalchemy.orm import Session
    from app.models.models import Hotel, Itinerary, ItineraryItem, Trip

SEATS = {"rickshaw": 2, "cng": 3, "car": 4}          # travellers per vehicle
SPREAD = {"getting_there": (0.85, 1.25), "local": (0.8, 1.3), "food": (0.8, 1.3)}
ESTIMATE_DETOUR = 1.3                                 # roads are rarely straight
CLOSE = 0.9                                           # "only ৳… left" from here on
SHORT_KM = 3.0                                        # a leg short enough for a rickshaw
MIN_SAVING = 50


class SaveError(Exception):
    def __init__(self, message: str, status: int = 422):
        super().__init__(message)
        self.message = message
        self.status = status


def _r10(x: float) -> int:
    return int(x / 10 + 0.5) * 10


def vehicles(mode: Optional[str], travellers: int) -> int:
    return ceil(travellers / SEATS[mode]) if mode in SEATS else 0


def rooms_for(travellers: int) -> int:
    return -(-travellers // 2)


# ---------------------------------------------------------------------------
# Legs
# ---------------------------------------------------------------------------

def _activities(day: "Itinerary") -> list["ItineraryItem"]:
    return [i for i in sorted(day.items, key=lambda x: x.order_index) if i.item_type == "activity" and i.place is not None]


def _leg(a, b, mode: Optional[str], travellers: int) -> dict:
    """One leg's fare for the group: by the mode given, else the one a local would pick."""
    road = ROADS.pair(point_of(a), point_of(b))
    km = road.km if road.source == "road" else road.km * ESTIMATE_DETOUR
    m = mode or M.default_mode(km)
    return {"mode": m, "km": km, "cost": M.fare(m, km) * vehicles(m, travellers), "road": road.source == "road"}


def move_legs(day: "Itinerary", hotel, travellers: int) -> list[dict]:
    """
    Moving to another stay that day (trip upgrades step 4): one ride with the bags from last night's
    stay to tonight's, by the mode a local would pick. None when the day starts and ends at the same stay.
    """
    from app.services.stays import TripBases
    if not isinstance(hotel, TripBases):
        return []
    n = day.day_number
    if n < 2 or n > hotel.nights:
        return []
    a, b = hotel.end(n - 1), hotel.end(n)
    if a is None or b is None or point_of(a) is None or point_of(b) is None:
        return []
    if (a.kind, a.latitude, a.longitude) == (b.kind, b.latitude, b.longitude):
        return []
    return [{**_leg(a, b, None, travellers), "move": True}]


def day_legs(day: "Itinerary", hotel, travellers: int) -> list[dict]:
    """
    The day's legs: from where it starts (the stay) to the first stop, between the stops (each by
    its chosen mode), and from its last stop or meal back to where the traveller sleeps.
    `hotel` is the trip's bases (stays.bases), or one hotel from older callers.
    """
    from app.services.stays import end_of, last_point, start_of
    acts = _activities(day)
    start, end = start_of(hotel, day.day_number), end_of(hotel, day.day_number)
    legs = []
    if start is not None and point_of(start) is not None and acts:
        legs.append(_leg(start, acts[0].place, None, travellers))
    for a, b in zip(acts, acts[1:]):
        legs.append({**_leg(a.place, b.place, a.travel_mode, travellers), "item_id": a.id})
    if end is not None and point_of(end) is not None and acts:
        _item, last = last_point(day)
        legs.append(_leg(last or acts[-1].place, end, None, travellers))
    return legs


# ---------------------------------------------------------------------------
# The budget
# ---------------------------------------------------------------------------

def _part(key: str, amount: Optional[float], estimate: bool, detail: dict) -> dict:
    if amount is None:
        return {"key": key, "known": False, "amount": None, "low": None, "high": None, "estimate": False, "detail": detail}
    lo, hi = SPREAD.get(key, (1.0, 1.0)) if estimate else (1.0, 1.0)
    return {
        "key": key, "known": True, "amount": _r10(amount), "low": _r10(amount * lo), "high": _r10(amount * hi),
        "estimate": estimate, "detail": detail,
    }


def full_budget(db: "Session", trip: "Trip", hotel, getting_there: Optional[dict], private: bool = False,
                advice: Optional[list] = None) -> dict:
    """
    The parts, the total with its range, the days, and the ways to save. Prices in the trip's
    currency only. `hotel` is the trip's bases (stays.bases); `private`: the viewer isn't the
    owner, so a home's name is left out (D2).
    """
    n = trip.num_travelers
    currency = trip.currency
    days = sorted(trip.itinerary_days, key=lambda d: d.day_number)
    nights = max(trip.num_days - 1, 0)
    rooms = rooms_for(n)

    # Getting there, both ways
    if getting_there and currency == "BDT":
        per = getting_there["fare_per"]
        count = n if per == "person" else vehicles("car", n)
        gt = _part("getting_there", getting_there["fare"] * count * 2, True, {
            "mode": getting_there["mode"], "from": getting_there["from"], "to": getting_there["to"],
            "fare_per": per, "count": count, "both_ways": True,
        })
    else:
        gt = _part("getting_there", None, False, {"reason": "no_origin"})

    # The stay, night by night
    stay = stay_part(hotel, nights, rooms, currency, private)

    # Food, tickets and local travel, day by day
    by_day = []
    food_total = tickets_total = local_total = 0.0
    meals = placeholder = paid = free = unknown = legs_count = 0
    by_source = {"restaurant": 0, "own": 0, "stay": 0}   # step 3: where each meal is eaten
    own_total = 0.0                                      # what the food you bring costs the group
    local_modes: set[str] = set()
    for d in days:
        food = tickets = 0.0
        day_estimate = False
        for i in d.items:
            source = i.place or i.restaurant
            if source is not None and (source.currency or "BDT") != currency:
                continue
            if i.item_type == "meal":
                meals += 1
                kind = i.meal_source or "restaurant"
                by_source[kind] = by_source.get(kind, 0) + 1
                # Your own food costs what you said it does (0 when unset); where you stay, nothing
                food += (i.cost or 0.0) * n
                if kind == "own":
                    own_total += (i.cost or 0.0) * n
                if i.restaurant_id is None and kind == "restaurant":
                    placeholder += 1
                    day_estimate = True
            elif i.item_type == "activity":
                if i.place is not None and not i.place.cost_known:
                    unknown += 1  # an entry price nobody has given: not counted, said
                    continue
                tickets += (i.cost or 0.0) * n
                if i.cost:
                    paid += 1
                else:
                    free += 1
        legs = day_legs(d, hotel, n) + move_legs(d, hotel, n)
        local = sum(leg["cost"] for leg in legs)
        legs_count += sum(1 for leg in legs if leg["mode"] != "walk")
        local_modes |= {leg["mode"] for leg in legs if leg["mode"] != "walk"}
        food_total += food
        tickets_total += tickets
        local_total += local
        amount = food + tickets + local
        by_day.append({
            "day_number": d.day_number, "date": d.day_date.isoformat() if d.day_date else None,
            "amount": _r10(amount), "food": _r10(food), "tickets": _r10(tickets), "local": _r10(local),
            "estimate": day_estimate or local > 0,
        })
    from app.services import meals as meal_plan
    food_part = _part("food", food_total, placeholder > 0, {
        "meals": meals, "placeholder_meals": placeholder, "days": len(days), "travellers": n,
        "by_source": by_source, "own_cost_per_person": meal_plan.trip_plan(trip).get("own_cost_per_person"),
        # A day can set its own amount, so the trip's amount alone doesn't say what the plan counts
        "own_total": round(own_total),
    })
    tickets_part = _part("tickets", tickets_total, False, {"paid": paid, "free": free, "unknown": unknown})
    local_part = _part("local", local_total, local_total > 0, {"legs": legs_count, "modes": sorted(local_modes)})

    parts = [gt, stay, food_part, tickets_part, local_part]
    known = [p for p in parts if p["known"]]
    total = sum(p["amount"] for p in known)
    low = sum(p["low"] for p in known)
    high = sum(p["high"] for p in known)
    budget = trip.total_budget
    status = "over" if total > budget else "close" if total >= budget * CLOSE or high > budget else "ok"
    return {
        "total": total, "low": low, "high": high, "left": round(budget - total), "status": status,
        "parts": parts, "by_day": by_day,
        "saves": ways_to_save(db, trip, hotel, nights, rooms, advice),
    }


def stay_part(bases, nights: int, rooms: int, currency: str, private: bool = False) -> dict:
    """
    The stay's part of the budget, from the trip's stays. One hotel for all nights keeps the shape
    the app has always had (hotel, nights, per night, rooms); `blocks` has each stay.
    """
    from app.services.stays import TripBases, stay_cost
    if nights < 1:
        return _part("stay", 0.0, False, {"nights": 0, "rooms": rooms, "blocks": []})
    if not isinstance(bases, TripBases) or not bases.blocks:
        return _part("stay", None, False, {"reason": "no_hotel"})
    cost = stay_cost(bases.blocks, rooms, currency)
    lines = [{**ln, "label": None} if private and ln["kind"] == "home" else ln for ln in cost["lines"]]
    if not cost["known"]:
        return _part("stay", None, False, {**cost["unknown"], "blocks": lines})
    detail: dict = {"nights": nights, "rooms": rooms, "blocks": lines}
    only = bases.blocks[0] if len(bases.blocks) == 1 else None
    if only is not None and only.kind == "hotel" and only.hotel is not None:
        h = only.hotel
        detail.update(hotel=h.name, hotel_id=h.id, rating=h.rating, per_night=h.price_per_night)
    return _part("stay", cost["amount"], False, detail)


# ---------------------------------------------------------------------------
# Ways to save
# ---------------------------------------------------------------------------

def ways_to_save(db: "Session", trip: "Trip", hotel: Optional["Hotel"], nights: int, rooms: int,
                 advice: Optional[list] = None) -> list[dict]:
    """
    The savings that apply to this plan, biggest first: a better place to sleep for some nights (the
    stay advisor's open suggestions, `advice`; step 4: one source of truth for hotels), a paid stop to
    skip, rickshaws.
    """
    from app.services.itinerary.editing_service import is_must_visit

    n = trip.num_travelers
    out = []

    # Sleeping somewhere else for some nights: the stay advisor's open suggestions (owner only)
    for s in advice or []:
        out.append({
            "key": "stay", "saving": _r10(s["money_saved"] or 0), "estimate": True,
            "detail": s,
            "action": {"kind": "stay_advice", "suggestion_id": s["id"]},
        })

    # The priciest stop you could skip (not a must-see, not one you pinned)
    days = sorted(trip.itinerary_days, key=lambda d: d.day_number)
    stops = [
        (d, i) for d in days for i in d.items
        if i.item_type == "activity" and i.cost and not i.pinned and not is_must_visit(trip, i)
        and (i.place is None or (i.place.currency or "BDT") == trip.currency)
    ]
    if stops:
        d, i = max(stops, key=lambda x: (x[1].cost, -x[0].day_number))
        out.append({
            "key": "skip", "saving": _r10(i.cost * n), "estimate": False,
            "detail": {"title": i.title, "day_number": d.day_number, "item_id": i.id},
            "action": {"kind": "skip", "item_id": i.id},
        })

    # Rickshaw instead of CNG for the short legs the app chose (not the ones you chose)
    modes: dict[str, str] = {}
    saving = extra = 0.0
    for d in days:
        acts = _activities(d)
        for a, b in zip(acts, acts[1:]):
            if a.travel_mode is not None:
                continue
            road = ROADS.pair(point_of(a.place), point_of(b.place))
            if road.source != "road" or road.km > SHORT_KM or M.default_mode(road.km) != "cng":
                continue
            diff = M.fare("cng", road.km) * vehicles("cng", n) - M.fare("rickshaw", road.km) * vehicles("rickshaw", n)
            if diff <= 0:
                continue
            modes[str(a.id)] = "rickshaw"
            saving += diff
            extra += M.minutes("rickshaw", road.km, road.drive_min) - M.minutes("cng", road.km, road.drive_min)
    if modes:
        out.append({
            "key": "rickshaw", "saving": _r10(saving), "estimate": True,
            "detail": {"legs": len(modes), "extra_min": max(1, round(extra))},
            "action": {"kind": "modes", "modes": modes},
        })

    return sorted([s for s in out if s["saving"] >= MIN_SAVING], key=lambda s: -s["saving"])


def apply_save(db: "Session", trip: "Trip", action: dict, hotel_of) -> tuple[str, Optional[dict]]:
    """
    Apply a way to save (or undo one): returns (what happened, the action that undoes it).
    `hotel_of(trip)` gives the trip's hotel now. Doesn't commit.
    """
    from app.models.models import Hotel, Place
    from app.services.itinerary import editing_service as edits

    kind = action.get("kind")
    days = {d.id: d for d in trip.itinerary_days}
    items = {i.id: i for d in trip.itinerary_days for i in d.items}

    if kind == "stay_advice":
        # Switch to a stay the advisor suggested (step 4); Undo puts the stays back
        from app.services import stay_advisor
        try:
            row, before = stay_advisor.accept(db, trip, action.get("suggestion_id"))
        except stay_advisor.AdviceError as exc:
            raise SaveError(exc.message, exc.status)
        new = hotel_of(trip)
        for d in trip.itinerary_days:
            edits.recompute_day(d, new)
        return f"Staying at {row.hotel.name}.", {"kind": "stays", "stays": before}

    if kind in ("hotel", "stays"):
        from app.services import stays
        before = stays.as_items(stays.blocks_of(db, trip))
        if kind == "stays":
            wanted = action.get("stays") or []
        else:
            h = db.get(Hotel, action.get("hotel_id")) if action.get("hotel_id") is not None else None
            if h is None or not h.is_active:
                raise SaveError("That hotel isn't available for this trip.", 404)
            first, last = action.get("first_night"), action.get("last_night")
            wanted = [
                {**b, "kind": "hotel", "hotel_id": h.id, "label": None, "lat": None, "lon": None}
                if b["kind"] == "hotel" and (first is None or (b["first_night"] == first and b["last_night"] == last)) else b
                for b in before
            ]
        try:
            stays.replace(db, trip, stays.validate(db, trip, wanted))
        except stays.StayError as exc:
            raise SaveError(exc.message, exc.status)
        new = hotel_of(trip)
        for d in trip.itinerary_days:
            edits.recompute_day(d, new)
        if kind == "stays":
            return "Your stays are back as they were.", {"kind": "stays", "stays": before}
        return f"Staying at {h.name}.", {"kind": "stays", "stays": before}

    if kind == "skip":
        item = items.get(action.get("item_id"))
        if item is None:
            raise SaveError("That stop isn't in this trip any more.", 404)
        day = item.itinerary
        position = edits.sorted_items(day).index(item)
        undo = {"kind": "restore", "day_id": day.id, "place_id": item.place_id, "position": position}
        try:
            edits.remove_activity(db, trip, item, hotel_of(trip))
        except edits.EditError as exc:
            raise SaveError(exc.message, exc.status)
        return f"Skipped '{item.title}'.", undo

    if kind == "restore":
        day = days.get(action.get("day_id"))
        place = db.get(Place, action.get("place_id"))
        if day is None or place is None:
            raise SaveError("That stop can't be put back.", 404)
        try:
            item, _notes = edits.add_place(db, trip, day, place, action.get("position"), hotel_of(trip))
        except edits.EditError as exc:
            raise SaveError(exc.message, exc.status)
        db.flush()
        return f"'{place.name}' is back.", {"kind": "skip", "item_id": item.id}

    if kind == "modes":
        wanted = action.get("modes") or {}
        targets = []
        for key, mode in wanted.items():
            item = items.get(int(key))
            if item is None:
                raise SaveError("A stop in this change isn't in the trip any more.", 404)
            if mode is not None and mode not in M.MODES:
                raise SaveError(f"Unknown way to travel: {mode}.")
            targets.append((item, mode))
        # Undo puts back the modes and the times exactly (a slower ride may have moved later stops)
        touched = {item.itinerary_id for item, _ in targets}
        undo = {
            "kind": "modes",
            "modes": {str(item.id): item.travel_mode for item, _ in targets},
            "times": {str(i.id): [i.start_time, i.end_time] for d in trip.itinerary_days if d.id in touched for i in d.items},
        }
        hotel = hotel_of(trip)
        for item, mode in targets:
            try:
                edits.set_travel_mode(trip, item.itinerary, item, mode, hotel)
            except edits.EditError as exc:
                raise SaveError(exc.message, exc.status)
        for key, (start, end) in (action.get("times") or {}).items():
            item = items.get(int(key))
            if item is not None:
                item.start_time, item.end_time = start, end
        for day_id in touched:
            edits.recompute_day(days[day_id], hotel)
        n = len(targets)
        return (f"Rickshaw on {n} short ride{'s' if n != 1 else ''}." if all(m == "rickshaw" for _, m in targets)
                else "Travel changed back."), undo

    raise SaveError(f"Unknown change: {kind}.")

"""
The whole trip's cost (trip planner step 7): getting there, the stay, food,
tickets and local travel, each with a range, by day, and the ways to save that
actually apply to this plan, each applied (and undone) in one tap.

  - Getting there: both ways by the trip's mode, from the rough estimate in
    `routing.modes` (per seat, or per car).
  - Stay: the trip's hotel × nights × rooms (2 travellers a room), from its price.
  - Food and tickets: the plan's prices × travellers. Meals without a restaurant
    record have a placeholder price, so food is then an estimate.
  - Local travel: every leg of every day, hotel to the first stop and the last
    stop back included, by the leg's mode, its fare × the vehicles needed. Legs
    without road data use the straight line × 1.3.

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


def day_legs(day: "Itinerary", hotel, travellers: int) -> list[dict]:
    """The day's legs: from the hotel, between the stops (each by its chosen mode), back to the hotel."""
    acts = _activities(day)
    legs = []
    if hotel is not None and acts:
        legs.append(_leg(hotel, acts[0].place, None, travellers))
    for a, b in zip(acts, acts[1:]):
        legs.append({**_leg(a.place, b.place, a.travel_mode, travellers), "item_id": a.id})
    if hotel is not None and acts:
        legs.append(_leg(acts[-1].place, hotel, None, travellers))
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


def full_budget(db: "Session", trip: "Trip", hotel: Optional["Hotel"], getting_there: Optional[dict]) -> dict:
    """The parts, the total with its range, the days, and the ways to save. Prices in the trip's currency only."""
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

    # The stay
    if hotel is None:
        stay = _part("stay", None, False, {"reason": "no_hotel"})
    elif (hotel.currency or "BDT") != currency:
        stay = _part("stay", None, False, {"reason": "currency", "currency": hotel.currency})
    elif not hotel.price_known:
        stay = _part("stay", None, False, {"reason": "no_price", "hotel": hotel.name, "nights": nights})
    else:
        stay = _part("stay", hotel.price_per_night * nights * rooms, False, {
            "hotel": hotel.name, "hotel_id": hotel.id, "rating": hotel.rating, "nights": nights, "rooms": rooms,
            "per_night": hotel.price_per_night,
        })

    # Food, tickets and local travel, day by day
    by_day = []
    food_total = tickets_total = local_total = 0.0
    meals = placeholder = paid = free = unknown = legs_count = 0
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
                food += (i.cost or 0.0) * n
                if i.restaurant_id is None:
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
        legs = day_legs(d, hotel, n)
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
    food_part = _part("food", food_total, placeholder > 0, {"meals": meals, "placeholder_meals": placeholder, "days": len(days), "travellers": n})
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
        "saves": ways_to_save(db, trip, hotel, nights, rooms),
    }


# ---------------------------------------------------------------------------
# Ways to save
# ---------------------------------------------------------------------------

def ways_to_save(db: "Session", trip: "Trip", hotel: Optional["Hotel"], nights: int, rooms: int) -> list[dict]:
    """The savings that apply to this plan, biggest first: a cheaper hotel, a paid stop to skip, rickshaws."""
    from app.models.models import Hotel
    from app.services.itinerary.editing_service import is_must_visit

    n = trip.num_travelers
    out = []

    # A cheaper hotel: the cheapest one that's still well rated
    if hotel is not None and nights > 0 and hotel.price_known:
        cheaper = (
            db.query(Hotel)
            .filter(Hotel.destination_name == trip.destination, Hotel.is_active == True,  # noqa: E712
                    Hotel.price_known == True, Hotel.rating_known == True,  # noqa: E712
                    Hotel.price_per_night < hotel.price_per_night, Hotel.rating >= 3.5, Hotel.currency == hotel.currency)
            .order_by(Hotel.price_per_night, Hotel.rating.desc())
            .first()
        )
        if cheaper is not None:
            # Net of the rides: a cheaper hotel further away costs more to get around from
            days = trip.itinerary_days
            rides = sum(leg["cost"] for d in days for leg in day_legs(d, cheaper, n)) - sum(
                leg["cost"] for d in days for leg in day_legs(d, hotel, n)
            )
            saving = (hotel.price_per_night - cheaper.price_per_night) * nights * rooms - rides
            out.append({
                "key": "hotel", "saving": _r10(saving), "estimate": False,
                "detail": {"from": hotel.name, "from_rating": hotel.rating, "to": cheaper.name, "to_rating": cheaper.rating,
                           "per_night": cheaper.price_per_night},
                "action": {"kind": "hotel", "hotel_id": cheaper.id},
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

    if kind == "hotel":
        pref = trip.preference
        if pref is None:
            raise SaveError("This trip has no preferences to change.")
        hotel_id = action.get("hotel_id")
        if hotel_id is not None:
            h = db.get(Hotel, hotel_id)
            if h is None or not h.is_active or h.destination_name != trip.destination:
                raise SaveError("That hotel isn't available for this trip.", 404)
        before = pref.hotel_id
        pref.hotel_id = hotel_id
        db.flush()
        new = hotel_of(trip)
        for d in trip.itinerary_days:
            edits.recompute_day(d, new)
        return f"Staying at {new.name}." if new else "Hotel changed.", {"kind": "hotel", "hotel_id": before}

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

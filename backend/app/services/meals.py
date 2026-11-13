"""
Meals (docs/trip-upgrades, step 3; decision D6): per meal, the best places to eat (the default),
your own food, or where you stay (breakfast and dinner only), for the whole trip with a per-day
override.

- restaurant: as before, a restaurant open then (the planners pick it).
- own: a 30-min "Packed lunch" break where the traveller is: breakfast before the first stop,
  lunch at the stop they're at around midday, dinner after the last stop. No restaurant, so no
  leg to one. It costs `own_cost_per_person` (0 when unset).
- stay: breakfast where the day starts, before leaving; dinner where it ends, after the way back
  (so outside "finish by"). No cost.

A trip with no plan (`trip_preferences.meals_json` NULL) has every meal at a restaurant and plans
exactly as before. The planners read the plan through `TripRules.meals` (trip_rules.py).
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Iterable, Optional

if TYPE_CHECKING:
    from app.models.models import Itinerary, ItineraryItem, Trip

SLOTS = ("Breakfast", "Lunch", "Dinner")
SOURCES = ("restaurant", "own", "stay")
RESTAURANT_MINUTES = 60
OWN_MINUTES = 30
STAY_MINUTES = 45
# A packed meal isn't eaten too early; dinner where you stay waits until the evening
OWN_EARLIEST = {"Breakfast": 0, "Lunch": 12 * 60, "Dinner": 17 * 60 + 30}
STAY_DINNER_EARLIEST = 19 * 60
MAX_OWN_COST = 100_000


class MealPlanError(ValueError):
    pass


def default_plan() -> dict:
    return {"Breakfast": "restaurant", "Lunch": "restaurant", "Dinner": "restaurant", "own_cost_per_person": None}


def normalize(plan: Optional[dict]) -> Optional[dict]:
    """A plan as stored: every meal named, sources checked (lunch can't be "stay"). None stays None."""
    if plan is None:
        return None
    if not isinstance(plan, dict):
        raise MealPlanError("A meal plan is an object with Breakfast, Lunch and Dinner.")
    out = default_plan()
    for slot in SLOTS:
        source = plan.get(slot, "restaurant")
        if source not in SOURCES:
            raise MealPlanError(f"{slot}: choose restaurant, own or stay.")
        if slot == "Lunch" and source == "stay":
            raise MealPlanError("Lunch can't be where you stay: you're out for the day.")
        out[slot] = source
    cost = plan.get("own_cost_per_person")
    if cost is not None:
        try:
            cost = float(cost)
        except (TypeError, ValueError):
            raise MealPlanError("The amount for your own food must be a number.") from None
        if cost < 0 or cost > MAX_OWN_COST:
            raise MealPlanError("The amount for your own food must be between 0 and 100,000.")
    out["own_cost_per_person"] = cost
    return out


def trip_plan(trip: "Trip") -> dict:
    pref = trip.preference
    return normalize(pref.meals if pref is not None and pref.meals else None) or default_plan()


def day_overrides(trip: "Trip") -> dict[int, dict]:
    """Each day's own plan, by day number (read before a re-plan replaces the days)."""
    out = {}
    for day in trip.itinerary_days or []:
        if day.meals:
            try:
                out[day.day_number] = normalize(day.meals)
            except MealPlanError:
                continue
    return out


def plans_by_day(trip: "Trip", overrides: Optional[dict[int, dict]] = None) -> dict[int, dict]:
    """The plan of every day: its override, else the trip's. The own-food amount is the trip's unless a day sets one."""
    base = trip_plan(trip)
    overrides = day_overrides(trip) if overrides is None else overrides
    out = {}
    for n in range(1, (trip.num_days or 0) + 1):
        o = overrides.get(n)
        if o is None:
            out[n] = base
        else:
            out[n] = {**o, "own_cost_per_person": o.get("own_cost_per_person") if o.get("own_cost_per_person") is not None
                      else base.get("own_cost_per_person")}
    return out


def is_default(plan: Optional[dict]) -> bool:
    return plan is None or all(plan.get(s, "restaurant") == "restaurant" for s in SLOTS)


def minutes(source: str) -> int:
    return {"own": OWN_MINUTES, "stay": STAY_MINUTES}.get(source, RESTAURANT_MINUTES)


# ---------------------------------------------------------------------------
# Meal items
# ---------------------------------------------------------------------------

def slot_of(item: "ItineraryItem") -> Optional[str]:
    """Breakfast / Lunch / Dinner for a meal item ("Lunch at X", "Packed lunch", "Dinner where you stay")."""
    if item.item_type != "meal" or not item.title:
        return None
    title = item.title.strip()
    for slot in SLOTS:
        if title.startswith(slot) or title.lower().startswith(f"packed {slot.lower()}"):
            return slot
    return None


def source_of(item: "ItineraryItem") -> Optional[str]:
    if item.item_type != "meal":
        return None
    return item.meal_source or "restaurant"


def is_stay(item: "ItineraryItem") -> bool:
    return item.item_type == "meal" and item.meal_source == "stay"


def title(slot: str, source: str) -> str:
    if source == "own":
        return f"Packed {slot.lower()}"
    if source == "stay":
        return f"{slot} where you stay"
    return slot


def own_item(slot: str, start_min: int, cost_per_person: Optional[float], at=None) -> "ItineraryItem":
    """A packed meal where the traveller is (`at`: the stop it's eaten at, for the note)."""
    from app.models.models import ItineraryItem
    item = ItineraryItem(
        item_type="meal",
        meal_source="own",
        title=title(slot, "own"),
        start_time=_m2t(start_min),
        end_time=_m2t(start_min + OWN_MINUTES),
        duration_minutes=OWN_MINUTES,
        cost=float(cost_per_person or 0.0),
        travel_time_to_next=0.0,
        distance_to_next=0.0,
        notes=f"At {at.name}" if at is not None and getattr(at, "name", None) else None,
        recommendation_score=0.0,
        order_index=0,
    )
    item.recommendation_reasons = ["Your own food"]
    return item


def stay_item(slot: str, start_min: int, base=None) -> "ItineraryItem":
    """Breakfast or dinner where the traveller stays (`base`: the day's start or end, for the note)."""
    from app.models.models import ItineraryItem
    name = getattr(base, "name", None) if base is not None and getattr(base, "kind", None) != "home" else None
    item = ItineraryItem(
        item_type="meal",
        meal_source="stay",
        title=title(slot, "stay"),
        start_time=_m2t(start_min),
        end_time=_m2t(start_min + STAY_MINUTES),
        duration_minutes=STAY_MINUTES,
        cost=0.0,
        travel_time_to_next=0.0,
        distance_to_next=0.0,
        notes=f"At {name}" if name else None,
        recommendation_score=0.0,
        order_index=0,
    )
    item.recommendation_reasons = ["Where you stay"]
    return item


def _m2t(m: int) -> str:
    m = max(0, min(int(m), 24 * 60 - 1))
    return f"{m // 60:02d}:{m % 60:02d}"


def _t2m(t: str) -> int:
    h, m = map(int, t.split(":"))
    return h * 60 + m


def _point(item: "ItineraryItem"):
    p = item.place if item.item_type == "activity" else getattr(item, "restaurant", None) if item.item_type == "meal" else None
    return p if p is not None and getattr(p, "latitude", None) is not None else None


def leaving_at(items: Iterable["ItineraryItem"], start_base) -> Optional[int]:
    """When the traveller leaves where they stay: the first stop's (or meal's) start, less the way there."""
    from app.services.routing import ROADS, point_of
    timed = sorted((i for i in items if i.start_time and not is_stay(i)), key=lambda i: (_t2m(i.start_time), i.order_index))
    if not timed:
        return None
    first = timed[0]
    point = next((_point(i) for i in timed if _point(i) is not None), None)
    travel = 0
    if point is not None and start_base is not None and point_of(start_base) is not None:
        travel = round(ROADS.travel(point_of(start_base), point_of(point)).minutes)
    return _t2m(first.start_time) - travel


def back_at(items: Iterable["ItineraryItem"], end_base) -> Optional[int]:
    """
    When the traveller is back where they stay: after the day's last stop or meal (a packed dinner
    after the last stop counts: it's eaten there), plus the way back from the last place with a point.
    """
    from app.services.routing import ROADS, point_of
    timed = [i for i in items if i.start_time and i.end_time and not is_stay(i)]
    with_point = sorted((i for i in timed if _point(i) is not None), key=lambda i: (i.order_index, _t2m(i.end_time)))
    last = with_point[-1] if with_point else None
    if last is None:
        return None
    # Leave after the last place, or after a packed meal eaten there afterwards
    depart = max([_t2m(last.end_time)] + [_t2m(i.end_time) for i in timed if source_of(i) == "own"])
    travel = 0
    if last is not None and end_base is not None and point_of(end_base) is not None:
        travel = round(ROADS.travel(point_of(_point(last)), point_of(end_base)).minutes)
    return depart + travel


def stay_days(rules, day: int) -> tuple[bool, bool]:
    """
    Whether the day can have breakfast and dinner where you stay: no breakfast there on the day you
    arrive at a set time (you're on the way), none when the day has no breakfast at all, and no dinner
    there on the last day (there's no night there).
    """
    return rules.has_breakfast(day) and not (day == 1 and rules.arrive is not None), day < rules.num_days


def place_stay_meals(items: list, plan: dict, start_base, end_base, breakfast: bool = True, dinner: bool = True) -> list:
    """
    Breakfast before leaving the stay and dinner after getting back, for the meals the plan has
    "where you stay". `items` is the day's other items (timed). Returns the new meal items.
    """
    out = []
    if breakfast and plan.get("Breakfast") == "stay":
        leave = leaving_at(items, start_base)
        if leave is not None:
            out.append(stay_item("Breakfast", max(0, leave - STAY_MINUTES), start_base))
    if dinner and plan.get("Dinner") == "stay":
        back = back_at(items, end_base)
        if back is not None:
            out.append(stay_item("Dinner", min(max(back, STAY_DINNER_EARLIEST), 24 * 60 - 1 - STAY_MINUTES), end_base))
    return out


def counts(items: Iterable["ItineraryItem"]) -> dict[str, int]:
    """Meals by source: {"restaurant": 4, "own": 2, "stay": 2}."""
    out = {s: 0 for s in SOURCES}
    for i in items:
        if i.item_type == "meal":
            out[source_of(i)] = out.get(source_of(i), 0) + 1
    return out


def sync_stay_meals(day: "Itinerary", start_base, end_base) -> None:
    """
    Keep the day's meals where you stay right after an edit: breakfast just before leaving, dinner
    just after getting back, added or removed as the plan says. Nothing to do on most days.
    """
    trip = day.trip
    if trip is None:
        return
    plan = plans_by_day(trip).get(day.day_number) or {}
    current = {slot_of(i): i for i in day.items if is_stay(i)}
    if not current and "stay" not in (plan.get("Breakfast"), plan.get("Dinner")):
        return
    from app.services.itinerary.trip_rules import rules_for
    can_breakfast, can_dine = stay_days(rules_for(trip), day.day_number)
    others = [i for i in day.items if not is_stay(i)]
    wanted = {slot_of(m): m for m in place_stay_meals(others, plan, start_base, end_base, can_breakfast, can_dine)}
    for slot, item in current.items():
        if slot not in wanted:
            day.items.remove(item)
    for slot, new in wanted.items():
        old = current.get(slot)
        if old is None:
            day.items.append(new)
        else:
            old.start_time, old.end_time, old.notes = new.start_time, new.end_time, new.notes

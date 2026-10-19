"""
ItineraryService — Heuristic day-by-day trip scheduler (Version 2).

Ported from demo v1, adapted for new model structure.
Algorithm:
  1. Use RecommendationService to rank all candidate places.
  2. For each day, greedily pick top-scoring places that fit:
     - Opening/closing hours
     - Time window (preferred_start – preferred_end)
     - Max activities per day
     - Per-day budget (if set)
  3. Insert meal breaks between activities.
  4. Calculate travel time using Haversine distance + estimated speed.
  5. Return structured Itinerary + ItineraryItems.
"""

from __future__ import annotations

import math
import random
import logging
from dataclasses import replace
from datetime import date, timedelta
from typing import Iterable, List, Tuple, Optional
from sqlalchemy.orm import Session

from app.services.recommendation.recommendation_service import per_person_daily_budget
from app.models.models import (
    Place, Restaurant, Hotel,
    Trip, TripPreference, TripConstraint,
    Itinerary, ItineraryItem,
)
from app.services.recommendation.recommendation_service import RecommendationService
from app.services.routing import ROADS, point_of
from app.services.conditions.service import outdoor_place, planning_weather, wet_during
from app.services.itinerary.trip_rules import (
    LUNCH_RANGE, LUNCH_STRETCH, Block, MustSee, Placement, TripRules, load_rules, meal_starts, place_timed, travel_min,
)

logger = logging.getLogger("vromon.itinerary")

# Average travel speed (km/h) — approximate heuristic
AVERAGE_TRAVEL_SPEED_KMH = 30.0

DAY_THEMES = {
    0: ["Beach", "Relaxation", "Photography"],
    1: ["Nature", "Adventure", "Scenic"],
    2: ["Culture", "History", "Food", "Shopping"],
    3: ["Adventure", "Island", "Nature"],
    4: ["Relaxation", "Beach", "Sunset"],
}

# Where to be at sunset when you like photography: views and beaches, or a place known for its sunset
SUNSET_CATEGORIES = {"scenic", "photography", "beach"}

MEAL_SLOTS = {
    "Breakfast": ("08:00", "09:00", 60),
    "Lunch": ("12:30", "13:30", 60),
    "Dinner": ("19:00", "20:00", 60),
}


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Return great-circle distance in km between two lat/lon points."""
    R = 6371.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _time_to_minutes(t: str) -> int:
    h, m = map(int, t.split(":"))
    return h * 60 + m


def _minutes_to_time(minutes: int) -> str:
    h = minutes // 60
    m = minutes % 60
    return f"{h:02d}:{m:02d}"


def restaurant_open(restaurant, start_min: int, duration: int) -> bool:
    """True when the restaurant is open for the whole meal."""
    return _time_to_minutes(restaurant.opening_time) <= start_min and start_min + duration <= _time_to_minutes(restaurant.closing_time)


def _meal_cost(restaurant) -> float:
    """Per-person meal cost; 300 BDT placeholder only when no restaurant data exists."""
    return restaurant.average_meal_cost if restaurant else 300.0


def _meal_seed(trip: Trip, day_number: int) -> str:
    """Seed derived from trip inputs, so identical requests get identical meals."""
    pref = trip.preference
    interests = ",".join(sorted(pref.interests)) if pref else ""
    return f"{trip.destination}|{trip.start_date}|{trip.num_days}|{interests}|day{day_number}"


def _may_go_today(rules: TripRules, place_id: int, day_number: int) -> bool:
    """A must-see given a day only goes on that day; one with a time only where it was fixed."""
    m = rules.must_for(place_id)
    if m is None:
        return True
    return not m.timed and (m.day is None or m.day == day_number)


def _must_note(rules: TripRules, a: Placement, day_number: int) -> str:
    if a.note:
        return a.note
    if a.must.when == "sunset":
        return f"Your must-see, at sunset (about {_minutes_to_time(rules.sunset(day_number))})"
    if a.must.when:
        return f"Your must-see, in the {a.must.when}"
    if a.must.at is not None:
        return f"Your must-see, at {_minutes_to_time(a.must.at)}"
    return "Your must-see"


def day_summary(day: Itinerary) -> list[dict]:
    """
    The day in a line, as parts the app puts into words (a fixed template, in both
    languages): [{"part": "morning" | "afternoon" | "evening", "what": category},
    {"part": "sunset", "place": name}], at most three. [] is a free day.
    """
    from app.services.itinerary.trip_rules import sunset_min

    acts = [i for i in sorted(day.items, key=lambda x: x.order_index) if i.item_type == "activity" and i.place is not None]
    if not acts:
        return []
    ss = sunset_min(acts[0].place.latitude, acts[0].place.longitude, day.day_date) if day.day_date else 17 * 60 + 45
    at_sunset = next((
        a for a in acts if _time_to_minutes(a.start_time) <= ss - 10 and _time_to_minutes(a.end_time) >= ss
    ), None)
    parts: list[dict] = []
    for name, lo, hi in (("morning", 0, 12 * 60), ("afternoon", 12 * 60, 17 * 60), ("evening", 17 * 60, 24 * 60)):
        here = [a for a in acts if a is not at_sunset and lo <= _time_to_minutes(a.start_time) < hi]
        if at_sunset is not None and name == "evening":
            parts.append({"part": "sunset", "place": at_sunset.title})
        if here:
            cats = [(a.place.category or "").lower() for a in here]
            parts.append({"part": name, "what": max(cats, key=lambda c: (cats.count(c), -cats.index(c)))})
    return parts[:3]


def _sunset_place(place) -> bool:
    return (place.category or "").lower() in SUNSET_CATEGORIES or "sunset" in (place.best_time or "").lower()


def _travel_minutes(p1, p2, mode: Optional[str] = None) -> Tuple[float, float]:
    """
    Returns (travel_minutes, distance_km): by road when road data is known (by `mode`, or
    the mode a local would pick), otherwise the straight-line estimate.
    """
    t = ROADS.travel(point_of(p1), point_of(p2), mode)
    return t.minutes, t.km


class ItineraryService:
    """
    Generates a multi-day itinerary for a trip.
    Uses greedy heuristic scheduling (baseline).
    """

    def __init__(self):
        self.recommender = RecommendationService()

    def generate(self, db: Session, trip: Trip) -> List[Itinerary]:
        """Generate and persist day-by-day itineraries."""
        rules = load_rules(db, trip)
        candidates = self.ranked(db, trip, rules)
        hotel = self._pick_hotel(db, trip)
        # Must-sees with a time are fixed first; the days are built around them
        anchors = place_timed(rules, {p.id: p for p, _, _ in candidates if p.id in rules.must_ids()}, hotel)
        wet = planning_weather(db, trip)
        anchors += self.sunset_stops(trip, rules, candidates, anchors, hotel, wet)

        days: List[Itinerary] = []
        used_place_ids: set = {a.place.id for a in anchors}
        for day_num in range(1, trip.num_days + 1):
            day_date = trip.start_date + timedelta(days=day_num - 1)
            itinerary_day = self._build_day(
                db=db,
                trip=trip,
                day_number=day_num,
                day_date=day_date,
                candidates=candidates,
                used_place_ids=used_place_ids,
                hotel=hotel,
                rules=rules,
                anchors=[a for a in anchors if a.day == day_num],
                wet=wet.get(day_num, frozenset()),
            )
            db.add(itinerary_day)
            db.flush()
            days.append(itinerary_day)

        db.commit()
        for d in days:
            db.refresh(d)

        logger.info(f"Generated {len(days)}-day itinerary for trip {trip.id}")
        return days

    def ranked(self, db: Session, trip: Trip, rules: Optional[TripRules] = None, must_ids: Optional[list] = None) -> list:
        """Candidate places, best first (must-sees first of all)."""
        pref: TripPreference = trip.preference
        cons: TripConstraint = trip.constraints
        rules = rules or load_rules(db, trip)
        return self.recommender.recommend(
            db=db,
            destination=trip.destination,
            interests=pref.interests if pref else [],
            travel_style=pref.travel_style if pref else "Balanced",
            activity_level=pref.activity_level if pref else "Medium",
            daily_budget=per_person_daily_budget(trip.total_budget, trip.num_days, trip.num_travelers),
            avoid_crowded=cons.avoid_crowded if cons else False,
            exclude_ids=cons.excluded_places if cons else [],
            must_visit_ids=sorted(rules.must_ids()) if must_ids is None else must_ids,
            limit=50,
        )

    def sunset_stops(
        self, trip: Trip, rules: TripRules, candidates: list, anchors: list, hotel,
        wet: dict[int, frozenset[int]], days: Optional[Iterable[int]] = None,
        fixed: Optional[dict[int, list[Block]]] = None, taken: Iterable[int] = (),
    ) -> list[Placement]:
        """
        For travellers who like photography: on each day, the best view or beach that fits
        at sunset, unless a must-see is there at sunset already or rain is likely then.
        They're placed like must-sees with a time, but aren't must-sees (the day can drop them).
        `fixed` are other fixed parts by day (pinned stops), `taken` places already used.
        """
        interests = {i.lower() for i in (trip.preference.interests if trip.preference else [])}
        if "photography" not in interests:
            return []
        placed: list[Placement] = []
        used = {a.place.id for a in anchors} | set(taken)
        must_ids = rules.must_ids()
        for d in days or range(1, rules.num_days + 1):
            if any(a.day == d and a.must.when == "sunset" for a in anchors):
                continue
            ss = rules.sunset(d)
            if wet_during(wet.get(d, frozenset()), ss - 60, ss + 15):
                continue
            blocks = {d: (fixed or {}).get(d, []) + [Block(a.start, a.end, a.place, "must") for a in anchors + placed if a.day == d]}
            for place, _score, _reasons in candidates:
                if place.id in used or place.id in must_ids or not _sunset_place(place):
                    continue
                if not _may_go_today(rules, place.id, d):
                    continue
                spot = place_timed(replace(rules, must_sees=[MustSee(place.id, d, "sunset")]), {place.id: place}, hotel, blocks)
                if spot:
                    note = f"Here at sunset (about {_minutes_to_time(ss)}), for your photos"
                    placed.append(replace(spot[0], note=note))
                    used.add(place.id)
                    break
        return placed

    def _build_day(
        self,
        db: Session,
        trip: Trip,
        day_number: int,
        day_date: date,
        candidates: list,
        used_place_ids: set,
        hotel,
        rules: Optional[TripRules] = None,
        anchors: Iterable[Placement] = (),
        keep: Iterable[ItineraryItem] = (),
        wet: frozenset[int] = frozenset(),
    ) -> Itinerary:
        """
        One day: the fixed parts first (busy times, `keep` items such as pinned stops,
        must-sees with a time), then meals around them, then the best places that fit
        each gap in turn. `keep` items stay where they are and are not part of the result.
        `wet` are the hours rain is likely (from the forecast): an outdoor place goes there
        only when nothing else fits.
        """
        cons: TripConstraint = trip.constraints
        rules = rules or load_rules(db, trip)
        day_start, day_end = rules.window(day_number)
        max_activities = rules.stops_per_day
        daily_budget_cap = cons.max_daily_budget if cons else 0.0
        keep = list(keep)
        anchors = [a for a in anchors]

        # Theme the day
        theme_interests = self._day_theme_interests(trip, day_number)
        theme_label = self._theme_label(theme_interests, day_number)

        # The fixed parts of the day
        blocks: List[Block] = rules.busy_blocks(day_number)
        blocks += [Block(_time_to_minutes(k.start_time), _time_to_minutes(k.end_time), k.place or k.restaurant, "kept") for k in keep]
        blocks += [Block(a.start, a.end, a.place, "must") for a in anchors]

        # Meals: at their usual times, around the fixed parts; a meal that's kept isn't planned again
        kept_meals = {k.title.split(" at ")[0] for k in keep if k.item_type == "meal"}
        starts = {m: s for m, s in meal_starts(rules, day_number, blocks).items() if s is not None and m not in kept_meals}
        seed = _meal_seed(trip, day_number)
        rests = {m: self._pick_meal(db, trip.destination, m, seed, s) for m, s in starts.items()}
        # With a daily cap, the meals must fit within it: pick cheaper ones (an equal share each)
        if daily_budget_cap > 0 and rests and sum(_meal_cost(r) for r in rests.values()) > daily_budget_cap:
            share = daily_budget_cap / len(rests)
            rests = {m: self._pick_meal(db, trip.destination, m, seed, starts[m], max_cost=share) for m in starts}
        # Lunch moves with the day (it follows the morning's visits, 12:00-14:30), unless a
        # must-see, busy time or kept stop is around midday: then it keeps its free slot
        lunch_moves = "Lunch" in starts and not any(
            b.start < LUNCH_STRETCH[1] + MEAL_SLOTS["Lunch"][2] and LUNCH_STRETCH[0] < b.end for b in blocks
        )
        items: List[ItineraryItem] = [
            self._make_meal_item(m, rests[m], starts[m]) for m in starts if not (m == "Lunch" and lunch_moves)
        ]
        day_cost = sum(i.cost for i in items) + sum(k.cost or 0.0 for k in keep)
        if lunch_moves:
            day_cost += _meal_cost(rests["Lunch"])
        activity_count = sum(1 for k in keep if k.item_type == "activity")

        # Must-sees with a time, unless the daily cap can't take them (then they're reported, not forced)
        for a in anchors:
            if activity_count >= max_activities:
                break
            if daily_budget_cap > 0 and day_cost + a.place.estimated_cost > daily_budget_cap + 1e-6:
                blocks = [b for b in blocks if not (b.kind == "must" and b.point is a.place)]
                continue
            reasons = [r for r in self._reasons_for(candidates, a.place)] + [_must_note(rules, a, day_number)]
            score = 1.0 if a.note is None else next((sc for p, sc, _ in candidates if p.id == a.place.id), 0.0)
            items.append(self._activity_item(a.place, a.start, score, reasons))
            used_place_ids.add(a.place.id)
            day_cost += a.place.estimated_cost
            activity_count += 1
        blocks += [
            Block(starts[m], starts[m] + MEAL_SLOTS[m][2], None, "meal") for m in starts if not (m == "Lunch" and lunch_moves)
        ]

        # Bias toward day theme. The bonus only orders the candidates; the stored score
        # stays the ranking score that the reasons explain (so it never exceeds 100%).
        must_ids = rules.must_ids()
        themed = [
            (p, s + 0.15 if any(t.lower() in [x.lower() for x in p.tags] for t in theme_interests) else s, r, s)
            for p, s, r in candidates
            if p.id not in used_place_ids and _may_go_today(rules, p.id, day_number)
        ]
        # Must-see places are tried first (the theme bonus must not push them out of the day)
        themed.sort(key=lambda x: (x[0].id in must_ids, x[1]), reverse=True)

        # Fill each gap between the fixed parts, in time order, with the best places that fit
        cursor = day_start
        last_point = hotel
        for block in sorted(blocks, key=lambda b: b.start) + [Block(day_end, day_end, None, "end")]:
            gap_end = min(block.start, day_end)
            while True:
                lunch_at = max(cursor, LUNCH_RANGE[0])
                lunch_fits = lunch_moves and lunch_at <= LUNCH_STRETCH[1] and lunch_at + MEAL_SLOTS["Lunch"][2] <= gap_end
                if lunch_fits and cursor >= LUNCH_RANGE[0]:
                    cursor = self._add_lunch(db, trip, items, rests["Lunch"], lunch_at, seed)
                    lunch_moves = False
                    continue
                if activity_count >= max_activities:
                    if lunch_fits:
                        cursor = self._add_lunch(db, trip, items, rests["Lunch"], lunch_at, seed)
                        lunch_moves = False
                    break
                chosen = None
                rained_out = None   # the best outdoor place that fits, but in the rain
                for place, _order, reasons, score in themed:
                    if place.id in used_place_ids:
                        continue
                    open_min = _time_to_minutes(place.opening_time)
                    close_min = _time_to_minutes(place.closing_time)
                    visit_min = int(place.average_visit_duration * 60)
                    arrive_min = max(cursor + travel_min(last_point, place), open_min)
                    finish_min = arrive_min + visit_min
                    limit = min(close_min, gap_end - (travel_min(place, block.point) if block.point is not None else 0))
                    if lunch_moves and arrive_min < LUNCH_RANGE[0]:
                        # a morning visit must leave time for lunch by 14:30
                        limit = min(limit, LUNCH_STRETCH[1], gap_end - MEAL_SLOTS["Lunch"][2])
                    elif lunch_moves:
                        continue  # lunch comes first
                    if finish_min > limit:
                        continue
                    if daily_budget_cap > 0 and day_cost + place.estimated_cost > daily_budget_cap + 1e-6:
                        continue
                    if wet and outdoor_place(place) and wet_during(wet, arrive_min, finish_min):
                        rained_out = rained_out or (place, arrive_min, finish_min, reasons, score)
                        continue
                    if rained_out is not None:
                        reasons = list(reasons) + ["Indoors while rain is likely"]
                    chosen = (place, arrive_min, finish_min, reasons, score)
                    break
                if chosen is None and rained_out is not None:
                    chosen = rained_out
                if chosen is None:
                    if lunch_fits:
                        cursor = self._add_lunch(db, trip, items, rests["Lunch"], lunch_at, seed)
                        lunch_moves = False
                        continue
                    break
                place, arrive_min, finish_min, reasons, score = chosen
                items.append(self._activity_item(place, arrive_min, score, reasons))
                used_place_ids.add(place.id)
                day_cost += place.estimated_cost
                cursor = finish_min
                last_point = place
                activity_count += 1
            if block.kind == "end":
                break
            cursor = max(cursor, block.end)
            if block.point is not None:
                last_point = block.point

        # Order and travel legs (between consecutive activities; the first leg from the hotel)
        items.sort(key=lambda x: _time_to_minutes(x.start_time))
        total_travel = 0.0
        last_activity: Optional[ItineraryItem] = None
        for i, item in enumerate(items):
            item.order_index = i
            if item.item_type != "activity":
                continue
            if last_activity is None:
                total_travel += _travel_minutes(hotel, item.place)[0] if hotel is not None else 0.0
            else:
                minutes, km = _travel_minutes(last_activity.place, item.place)
                total_travel += minutes
                last_activity.travel_time_to_next = round(minutes, 1)
                last_activity.distance_to_next = round(km, 1)
            last_activity = item

        itinerary = Itinerary(
            trip_id=trip.id,
            day_number=day_number,
            day_date=day_date,
            theme=theme_label,
            total_cost=round(day_cost, 2),
            total_travel_time=round(total_travel, 1),
        )
        itinerary.items = items
        return itinerary

    def _add_lunch(self, db: Session, trip: Trip, items: list, restaurant, start_min: int, seed: str) -> int:
        """Lunch at its real start (a restaurant open then); returns when it ends."""
        lunch = self._meal_item_at(db, trip.destination, "Lunch", restaurant, start_min, seed)
        items.append(lunch)
        return _time_to_minutes(lunch.end_time)

    @staticmethod
    def _reasons_for(candidates: list, place) -> list:
        return next((list(r) for p, _, r in candidates if p.id == place.id), [])

    @staticmethod
    def _activity_item(place: Place, start_min: int, score: float, reasons: list) -> ItineraryItem:
        visit_min = int(place.average_visit_duration * 60)
        item = ItineraryItem(
            item_type="activity",
            place_id=place.id,
            title=place.name,
            start_time=_minutes_to_time(start_min),
            end_time=_minutes_to_time(start_min + visit_min),
            duration_minutes=visit_min,
            cost=place.estimated_cost,
            travel_time_to_next=0.0,
            distance_to_next=0.0,
            notes=place.best_time,
            recommendation_score=round(score, 3),
            order_index=0,
        )
        item.place = place
        item.recommendation_reasons = list(reasons)
        return item

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _pick_hotel(self, db: Session, trip: Trip) -> Optional[Hotel]:
        """The hotel the traveller chose, else the best-known one at their accommodation level."""
        pref = trip.preference
        if pref is not None and pref.hotel_id is not None:
            chosen = db.get(Hotel, pref.hotel_id)
            if chosen is not None and chosen.is_active and chosen.destination_name == trip.destination:
                return chosen
        cat = pref.accommodation_preference if pref else "Standard"
        # One whose price is known first (imported hotels often have none), then the first listed
        order = (Hotel.price_known.desc(), Hotel.id)
        hotel = (
            db.query(Hotel)
            .filter(Hotel.destination_name == trip.destination, Hotel.category == cat, Hotel.is_active == True)
            .order_by(*order)
            .first()
        )
        if not hotel:
            hotel = db.query(Hotel).filter(Hotel.destination_name == trip.destination, Hotel.is_active == True).order_by(*order).first()
        return hotel

    def _pick_meal(
        self,
        db: Session,
        destination: str,
        meal_type: str,
        seed: str = "",
        start_min: Optional[int] = None,
        max_cost: Optional[float] = None,
    ) -> Optional[Restaurant]:
        """
        Pick a restaurant that is open for the whole meal (deterministic for the same seed).
        `start_min` is when the meal starts; without it, the meal's usual slot is used.
        With `max_cost`, one that costs no more is preferred, else the cheapest open one.
        No restaurant open then → None (a placeholder meal, labelled as such).
        """
        slot_start, _, duration = MEAL_SLOTS[meal_type]
        start = start_min if start_min is not None else _time_to_minutes(slot_start)
        restaurants = [
            r
            for r in (
                db.query(Restaurant)
                .filter(Restaurant.destination_name == destination, Restaurant.is_active == True)
                .order_by(Restaurant.id)
                .all()
            )
            if restaurant_open(r, start, duration)
        ]
        if not restaurants:
            return None
        if max_cost is not None:
            affordable = [r for r in restaurants if r.average_meal_cost <= max_cost + 1e-6]
            if not affordable:
                return min(restaurants, key=lambda r: (r.average_meal_cost, r.id))
            restaurants = affordable
        return random.Random(f"{seed}|{meal_type}").choice(restaurants)

    def _meal_item_at(self, db: Session, destination: str, meal_name: str, restaurant, start_min: int, seed: str) -> ItineraryItem:
        """The meal at its real start time: the chosen restaurant if it's open then, otherwise one that is."""
        if restaurant is not None and not restaurant_open(restaurant, start_min, MEAL_SLOTS[meal_name][2]):
            # Stay within the cost already reserved for this meal (the daily cap counted on it)
            restaurant = self._pick_meal(db, destination, meal_name, seed, start_min, max_cost=restaurant.average_meal_cost)
        return self._make_meal_item(meal_name, restaurant, start_min)

    def _make_meal_item(self, meal_name: str, restaurant, start_min: int) -> ItineraryItem:
        duration = 60
        cost = _meal_cost(restaurant)
        item = ItineraryItem(
            item_type="meal",
            restaurant_id=restaurant.id if restaurant else None,
            title=f"{meal_name}" + (f" at {restaurant.name}" if restaurant else ""),
            start_time=_minutes_to_time(start_min),
            end_time=_minutes_to_time(start_min + duration),
            duration_minutes=duration,
            cost=cost,
            travel_time_to_next=0.0,
            distance_to_next=0.0,
            recommendation_score=0.0,
            order_index=0,
        )
        item.recommendation_reasons = [f"Meal break \u2014 {meal_name}"]
        return item

    def _day_theme_interests(self, trip: Trip, day_number: int) -> List[str]:
        """Return a list of interests to prioritise for this day."""
        pref = trip.preference
        user_interests = pref.interests if pref else []
        if user_interests:
            idx = (day_number - 1) % max(len(user_interests), 1)
            primary = user_interests[idx % len(user_interests)]
            secondary = user_interests[(idx + 1) % len(user_interests)] if len(user_interests) > 1 else primary
            return [primary, secondary]
        else:
            return DAY_THEMES.get((day_number - 1) % len(DAY_THEMES), ["Beach"])

    def _theme_label(self, interests: List[str], day_number: int) -> str:
        if not interests:
            return f"Day {day_number}"
        return " & ".join(dict.fromkeys(interests[:2]))  # one interest → "Culture", not "Culture & Culture"

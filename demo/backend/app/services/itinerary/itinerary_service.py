"""
ItineraryService — Heuristic day-by-day trip scheduler (Version 1).

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

Future enhancement: Replace greedy selection with OptimizationService
(OR-Tools / CP-SAT) for globally optimal scheduling.
"""

from __future__ import annotations
import math
from datetime import date, timedelta
from typing import List, Tuple, Optional
from sqlalchemy.orm import Session

from app.models.models import (
    Place, Restaurant, Hotel,
    Trip, TripPreference, TripConstraint,
    Itinerary, ItineraryItem,
)
from app.services.recommendation.recommendation_service import RecommendationService

# Average travel speed (km/h) — approximate, clearly a heuristic
AVERAGE_TRAVEL_SPEED_KMH = 30.0

DAY_THEMES = {
    0: ["Beach", "Relaxation", "Photography"],
    1: ["Nature", "Adventure", "Scenic"],
    2: ["Culture", "History", "Food", "Shopping"],
    3: ["Adventure", "Island", "Nature"],
    4: ["Relaxation", "Beach", "Sunset"],
}

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


def _travel_minutes(p1: Place, p2: Place) -> Tuple[float, float]:
    """Returns (travel_minutes, distance_km)."""
    dist = _haversine_km(p1.latitude, p1.longitude, p2.latitude, p2.longitude)
    travel_min = (dist / AVERAGE_TRAVEL_SPEED_KMH) * 60
    return travel_min, dist


class ItineraryService:
    """
    Generates a multi-day itinerary for a trip.
    Designed with clean interfaces so OptimizationService can be
    plugged in to replace the greedy scheduling step.
    """

    def __init__(self):
        self.recommender = RecommendationService()

    # ------------------------------------------------------------------
    # Main entry point
    # ------------------------------------------------------------------

    def generate(self, db: Session, trip: Trip) -> List[Itinerary]:
        """
        Generate and persist day-by-day itineraries.
        Returns the list of Itinerary objects.
        """
        pref: TripPreference = trip.preference
        cons: TripConstraint = trip.constraints

        # Get ranked candidate places
        candidates = self.recommender.recommend(
            db=db,
            destination=trip.destination,
            interests=pref.interests if pref else [],
            travel_style=pref.travel_style if pref else "Balanced",
            activity_level=pref.activity_level if pref else "Medium",
            daily_budget=trip.total_budget / max(trip.num_days, 1),
            avoid_crowded=cons.avoid_crowded if cons else False,
            exclude_ids=cons.excluded_places if cons else [],
            must_visit_ids=cons.must_visit if cons else [],
            limit=50,
        )

        # Fetch a reference hotel (for map display)
        hotel = self._pick_hotel(db, trip)

        # Build itinerary for each day
        days: List[Itinerary] = []
        used_place_ids: set = set()

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
            )
            db.add(itinerary_day)
            db.flush()
            days.append(itinerary_day)

        db.commit()
        for d in days:
            db.refresh(d)
        return days

    # ------------------------------------------------------------------
    # Day builder
    # ------------------------------------------------------------------

    def _build_day(
        self,
        db: Session,
        trip: Trip,
        day_number: int,
        day_date: date,
        candidates: list,
        used_place_ids: set,
        hotel,
    ) -> Itinerary:
        pref: TripPreference = trip.preference
        cons: TripConstraint = trip.constraints

        start_min = _time_to_minutes(pref.preferred_start_time if pref else "09:00")
        end_min = _time_to_minutes(pref.preferred_end_time if pref else "20:00")
        max_activities = cons.max_activities_per_day if cons else 4
        daily_budget_cap = cons.max_daily_budget if cons else 0.0

        # Theme the day
        theme_interests = self._day_theme_interests(trip, day_number)
        theme_label = self._theme_label(theme_interests, day_number)

        # Filter to fresh, day-compatible candidates
        available = [
            (place, score, reasons)
            for place, score, reasons in candidates
            if place.id not in used_place_ids
        ]

        # Bias toward day theme
        themed = [
            (p, s + 0.15 if any(t.lower() in [x.lower() for x in p.tags] for t in theme_interests) else s, r)
            for p, s, r in available
        ]
        themed.sort(key=lambda x: x[1], reverse=True)

        # Greedily schedule activities
        current_time = start_min
        activity_count = 0
        day_cost = 0.0
        total_travel = 0.0
        items: List[ItineraryItem] = []
        last_place: Optional[Place] = None

        # Breakfast slot
        breakfast_rest = self._pick_meal(db, trip.destination, "Breakfast")
        breakfast_item = self._make_meal_item(
            meal_name="Breakfast",
            restaurant=breakfast_rest,
            start_min=start_min,
        )
        current_time = _time_to_minutes(breakfast_item.end_time)
        items.append(breakfast_item)
        day_cost += breakfast_item.cost

        # Activity slots
        lunch_inserted = False
        for place, score, reasons in themed:
            if activity_count >= max_activities:
                break

            open_min = _time_to_minutes(place.opening_time)
            close_min = _time_to_minutes(place.closing_time)
            visit_min = int(place.average_visit_duration * 60)

            # Travel time from last place
            travel_min = 0.0
            dist_km = 0.0
            if last_place:
                travel_min, dist_km = _travel_minutes(last_place, place)
            elif hotel:
                travel_min, dist_km = _travel_minutes_hotel(hotel, place)

            arrive_min = int(current_time + travel_min)
            finish_min = arrive_min + visit_min

            # Skip if place closes before we can visit, or exceeds end time
            if arrive_min < open_min:
                arrive_min = open_min
                finish_min = arrive_min + visit_min
            if arrive_min >= close_min or finish_min > end_min + 60:
                continue

            # Budget check
            if daily_budget_cap > 0 and day_cost + place.estimated_cost > daily_budget_cap:
                continue

            # Insert lunch break before afternoon activities
            if not lunch_inserted and arrive_min >= _time_to_minutes("12:00"):
                # Schedule lunch at max(12:30, current_time) to avoid overlap
                lunch_start = max(_time_to_minutes("12:30"), current_time)
                lunch_rest = self._pick_meal(db, trip.destination, "Lunch")
                lunch_item = self._make_meal_item(
                    meal_name="Lunch",
                    restaurant=lunch_rest,
                    start_min=lunch_start,
                )
                items.append(lunch_item)
                day_cost += lunch_item.cost
                current_time = _time_to_minutes(lunch_item.end_time)
                lunch_inserted = True
                # Recalculate arrival after lunch
                arrive_min = int(current_time + travel_min)
                finish_min = arrive_min + visit_min
                if arrive_min >= close_min or finish_min > end_min + 60:
                    continue

            # Update travel info on previous item
            if items and last_place:
                items[-1].travel_time_to_next = round(travel_min, 1)
                items[-1].distance_to_next = round(dist_km, 1)

            item = ItineraryItem(
                item_type="activity",
                place_id=place.id,
                title=place.name,
                start_time=_minutes_to_time(arrive_min),
                end_time=_minutes_to_time(finish_min),
                duration_minutes=visit_min,
                cost=place.estimated_cost,
                travel_time_to_next=0.0,
                distance_to_next=0.0,
                notes=place.best_time,
                recommendation_score=round(score, 3),
                order_index=len(items),
            )
            item.recommendation_reasons = reasons
            items.append(item)

            used_place_ids.add(place.id)
            day_cost += place.estimated_cost
            total_travel += travel_min
            current_time = finish_min
            last_place = place
            activity_count += 1

        # Lunch if not yet inserted
        if not lunch_inserted:
            lunch_start = max(_time_to_minutes("12:30"), current_time)
            lunch_rest = self._pick_meal(db, trip.destination, "Lunch")
            lunch_item = self._make_meal_item(
                meal_name="Lunch",
                restaurant=lunch_rest,
                start_min=lunch_start,
            )
            items.append(lunch_item)
            day_cost += lunch_item.cost
            current_time = _time_to_minutes(lunch_item.end_time)

        # Dinner — schedule at max(19:00, current_time) to never overlap
        dinner_start = max(_time_to_minutes("19:00"), current_time)
        dinner_rest = self._pick_meal(db, trip.destination, "Dinner")
        dinner_item = self._make_meal_item(
            meal_name="Dinner",
            restaurant=dinner_rest,
            start_min=dinner_start,
        )
        items.append(dinner_item)
        day_cost += dinner_item.cost

        # Sort items by start time
        items.sort(key=lambda x: _time_to_minutes(x.start_time))
        for i, item in enumerate(items):
            item.order_index = i

        # Build Itinerary row
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

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _pick_hotel(self, db: Session, trip: Trip) -> Optional[Hotel]:
        pref = trip.preference
        cat = pref.accommodation_preference if pref else "Standard"
        hotel = (
            db.query(Hotel)
            .filter(Hotel.destination == trip.destination, Hotel.category == cat, Hotel.is_active == True)
            .first()
        )
        if not hotel:
            hotel = db.query(Hotel).filter(Hotel.destination == trip.destination, Hotel.is_active == True).first()
        return hotel

    def _pick_meal(self, db: Session, destination: str, meal_type: str) -> Optional[Restaurant]:
        """Pick a restaurant for the given meal type."""
        import random
        restaurants = (
            db.query(Restaurant)
            .filter(Restaurant.destination == destination, Restaurant.is_active == True)
            .all()
        )
        if not restaurants:
            return None
        # Pick a random one for variety; could be improved with scoring
        return random.choice(restaurants)

    def _make_meal_item(
        self,
        meal_name: str,
        restaurant,
        start_min: int,
    ) -> ItineraryItem:
        duration = 60
        cost = restaurant.average_meal_cost if restaurant else 300.0
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
        item.recommendation_reasons = [f"Meal break — {meal_name}"]
        return item

    def _day_theme_interests(self, trip: Trip, day_number: int) -> List[str]:
        """Return a list of interests to prioritise for this day."""
        pref = trip.preference
        user_interests = pref.interests if pref else []
        # Rotate through user interests, or fallback to day themes
        if user_interests:
            idx = (day_number - 1) % max(len(user_interests), 1)
            # Give each day a different primary interest + secondary
            primary = user_interests[idx % len(user_interests)]
            secondary = user_interests[(idx + 1) % len(user_interests)] if len(user_interests) > 1 else primary
            return [primary, secondary]
        else:
            return DAY_THEMES.get((day_number - 1) % len(DAY_THEMES), ["Beach"])

    def _theme_label(self, interests: List[str], day_number: int) -> str:
        if not interests:
            return f"Day {day_number}"
        return " & ".join(interests[:2])


def _travel_minutes_hotel(hotel: Hotel, place: Place) -> Tuple[float, float]:
    dist = _haversine_km(hotel.latitude, hotel.longitude, place.latitude, place.longitude)
    travel_min = (dist / AVERAGE_TRAVEL_SPEED_KMH) * 60
    return travel_min, dist

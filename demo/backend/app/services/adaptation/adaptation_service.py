"""
AdaptationService — Rule-based itinerary adaptation (Version 1).

Handles user commands such as:
  - "make_trip_relaxed"  → reduce activity count, remove lowest-priority
  - "reduce_budget"       → replace expensive activities with cheaper ones
  - "avoid_crowds"        → re-run excluding high-crowd places
  - "energise"            → add higher-activity places

Future: Replace rule-based logic with a feedback-learning model
(e.g., preference-vector updates, bandit algorithms, or RL).
"""

from __future__ import annotations
from typing import List, Optional
from sqlalchemy.orm import Session

from app.models.models import (
    Trip, Itinerary, ItineraryItem, Place, TripConstraint
)
from app.services.recommendation.recommendation_service import RecommendationService


class AdaptationService:
    """
    Rule-based adaptation engine.

    adapt_trip() is the main entry point. It modifies the existing
    itinerary based on the adaptation_type and returns updated days.
    """

    def adapt_trip(
        self,
        db: Session,
        trip: Trip,
        adaptation_type: str,
        parameters: dict = None,
    ) -> List[Itinerary]:
        """
        Apply adaptation to all itinerary days.

        adaptation_type options:
          "relax"          — remove 1 lowest-score activity per day
          "reduce_budget"  — remove most expensive activity per day
          "avoid_crowds"   — remove high-crowd activities
          "energise"       — no-op currently (return as-is)
        """
        parameters = parameters or {}
        days = trip.itinerary_days

        for day in days:
            if adaptation_type == "relax":
                self._remove_lowest_priority(db, day)
            elif adaptation_type == "reduce_budget":
                self._remove_most_expensive(db, day)
            elif adaptation_type == "avoid_crowds":
                self._remove_crowded(db, day)
            elif adaptation_type == "energise":
                pass  # Placeholder — future: add high-activity alternatives
            self._recalculate_day(day)

        db.commit()
        for day in days:
            db.refresh(day)
        return list(days)

    # ------------------------------------------------------------------
    # Adaptation strategies
    # ------------------------------------------------------------------

    def _remove_lowest_priority(self, db: Session, day: Itinerary):
        """Remove the activity with the lowest recommendation score."""
        activities = [i for i in day.items if i.item_type == "activity"]
        if len(activities) <= 1:
            return
        lowest = min(activities, key=lambda x: x.recommendation_score)
        db.delete(lowest)
        db.flush()

    def _remove_most_expensive(self, db: Session, day: Itinerary):
        """Remove the most expensive activity."""
        activities = [i for i in day.items if i.item_type == "activity"]
        if not activities:
            return
        priciest = max(activities, key=lambda x: x.cost)
        db.delete(priciest)
        db.flush()

    def _remove_crowded(self, db: Session, day: Itinerary):
        """Remove activities that are at high-crowd places."""
        for item in list(day.items):
            if item.item_type == "activity" and item.place:
                if item.place.crowd_level == "High":
                    db.delete(item)
        db.flush()

    def _recalculate_day(self, day: Itinerary):
        """Recalculate day totals after items change."""
        # Refresh items list
        items = [i for i in day.items if i not in []]
        day.total_cost = round(sum(i.cost for i in items), 2)
        day.total_travel_time = round(sum(i.travel_time_to_next for i in items), 1)

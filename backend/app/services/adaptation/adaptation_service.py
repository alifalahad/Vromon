"""
AdaptationService — Rule-based itinerary adaptation (Version 2).

Handles user commands: relax, reduce_budget, avoid_crowds, energise.
Ported from demo v1.
"""

from __future__ import annotations

import logging
from typing import List
from sqlalchemy.orm import Session

from app.models.models import Trip, Itinerary, ItineraryItem

logger = logging.getLogger("vromon.adaptation")


class AdaptationService:
    """Rule-based adaptation engine."""

    def adapt_trip(
        self,
        db: Session,
        trip: Trip,
        adaptation_type: str,
        parameters: dict = None,
    ) -> List[Itinerary]:
        """Apply adaptation to all itinerary days."""
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
                pass  # Placeholder
            self._recalculate_day(day)

        db.commit()
        for day in days:
            db.refresh(day)

        logger.info(f"Applied '{adaptation_type}' adaptation to trip {trip.id}")
        return list(days)

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
        items = list(day.items)
        day.total_cost = round(sum(i.cost for i in items), 2)
        day.total_travel_time = round(sum(i.travel_time_to_next for i in items), 1)

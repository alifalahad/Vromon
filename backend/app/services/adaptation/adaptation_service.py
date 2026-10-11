"""
AdaptationService — Rule-based itinerary adaptation (Version 3, Phase 10).

Commands (applied to every day of the trip):
  relax          remove the lowest-scoring activity per day (keeps at least one)
  reduce_budget  remove the most expensive paid activity per day
  avoid_crowds   remove activities at places whose crowd level is "High"
  energise       add the best-ranked unused place that fits a free gap per day

Rules shared by all commands:
  - must-visit places are never removed
  - days are recomputed after every change (order, travel legs, totals)
  - the result lists exactly what changed; "no change" is reported, never faked
The API layer re-validates the adapted itinerary with the ConstraintValidator.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import List

from sqlalchemy.orm import Session

from app.models.models import Itinerary, ItineraryItem, Trip
from app.services.itinerary import editing_service as edits

logger = logging.getLogger("vromon.adaptation")


@dataclass
class AdaptationResult:
    days: List[Itinerary]
    changes: List[dict] = field(default_factory=list)


class AdaptationService:
    """Rule-based adaptation engine."""

    def adapt_trip(
        self,
        db: Session,
        trip: Trip,
        adaptation_type: str,
        parameters: dict | None = None,
        hotel=None,
    ) -> AdaptationResult:
        days = sorted(trip.itinerary_days, key=lambda d: d.day_number)
        result = AdaptationResult(days=days)

        for day in days:
            if adaptation_type == "energise":
                added = edits.add_best_activity(db, trip, day, hotel)
                if added is not None:
                    result.changes.append(self._change("added", day, added))
                continue

            victims = self._select_removals(trip, day, adaptation_type)
            for item in victims:
                result.changes.append(self._change("removed", day, item))
                day.items.remove(item)
                db.delete(item)
            if victims:
                db.flush()
                edits.recompute_day(day, hotel)

        db.commit()
        for day in days:
            db.refresh(day)
        logger.info(f"Adaptation '{adaptation_type}' on trip {trip.id}: {len(result.changes)} change(s)")
        return result

    @staticmethod
    def _select_removals(trip: Trip, day: Itinerary, adaptation_type: str) -> List[ItineraryItem]:
        protected = edits.must_visit_ids(trip)
        activities = [i for i in day.items if i.item_type == "activity"]
        removable = [i for i in activities if i.place_id not in protected]

        if adaptation_type == "relax":
            if len(activities) <= 1 or not removable:
                return []
            return [min(removable, key=lambda i: (i.recommendation_score, -i.id))]
        if adaptation_type == "reduce_budget":
            paid = [i for i in removable if (i.cost or 0) > 0]
            return [max(paid, key=lambda i: (i.cost, i.id))] if paid else []
        if adaptation_type == "avoid_crowds":
            return [i for i in removable if i.place is not None and i.place.crowd_level == "High"]
        return []

    @staticmethod
    def _change(action: str, day: Itinerary, item: ItineraryItem) -> dict:
        return {
            "action": action,
            "day_number": day.day_number,
            "title": item.title,
            "place_id": item.place_id,
            "start_time": item.start_time,
            "cost": item.cost,
        }

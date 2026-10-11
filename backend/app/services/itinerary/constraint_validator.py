"""
Vromon Backend — Itinerary Constraint Validator.

Independent validator that checks itineraries for:
- Time overlaps between activities
- Daily boundary violations (start/end times)
- Excluded place violations
- Must-visit place satisfaction
- Daily activity count limit violations
- Missing must-visit places
- Activities outside the place's opening hours
- The same place scheduled more than once
- Daily budget cap exceeded (when a cap is set)

This validator is intentionally separate from the scheduler so it can
catch problems introduced by any generator, including future OR-Tools.

Usage:
    validator = ConstraintValidator()
    report = validator.validate(trip, days)
    if report.has_hard_violations:
        raise ...
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import List, Optional

from app.models.models import Trip, TripPreference, TripConstraint, Itinerary, ItineraryItem

logger = logging.getLogger("vromon.validator")


# ---------------------------------------------------------------------------
# Validation result types
# ---------------------------------------------------------------------------

@dataclass
class Violation:
    severity: str          # "hard" | "soft" | "info" (info = data limitation, never a violation)
    code: str              # machine-readable code
    message: str
    day_number: Optional[int] = None
    item_id: Optional[int] = None


@dataclass
class ValidationReport:
    trip_id: int
    violations: List[Violation] = field(default_factory=list)

    @property
    def hard_violations(self) -> List[Violation]:
        return [v for v in self.violations if v.severity == "hard"]

    @property
    def soft_violations(self) -> List[Violation]:
        return [v for v in self.violations if v.severity == "soft"]

    @property
    def has_hard_violations(self) -> bool:
        return len(self.hard_violations) > 0

    @property
    def warnings(self) -> List[str]:
        return [v.message for v in self.violations if v.severity in ("hard", "soft")]

    def to_dict(self) -> dict:
        return {
            "trip_id": self.trip_id,
            "valid": not self.has_hard_violations,
            "hard_violation_count": len(self.hard_violations),
            "soft_violation_count": len(self.soft_violations),
            "violations": [
                {
                    "severity": v.severity,
                    "code": v.code,
                    "message": v.message,
                    "day_number": v.day_number,
                    "item_id": v.item_id,
                }
                for v in self.violations
            ],
        }


# ---------------------------------------------------------------------------
# Validator
# ---------------------------------------------------------------------------

def _t2m(t: str) -> int:
    """Convert HH:MM to minutes since midnight."""
    try:
        h, m = map(int, t.split(":"))
        return h * 60 + m
    except Exception:
        return 0


class ConstraintValidator:
    """
    Validates a generated itinerary against trip constraints.
    Does not modify any data — pure read-only analysis.
    """

    def validate(self, trip: Trip, days: List[Itinerary]) -> ValidationReport:
        report = ValidationReport(trip_id=trip.id)
        pref: Optional[TripPreference] = trip.preference
        cons: Optional[TripConstraint] = trip.constraints

        start_min = _t2m(pref.preferred_start_time if pref else "09:00")
        end_min = _t2m(pref.preferred_end_time if pref else "20:00")
        max_activities = cons.max_activities_per_day if cons else 4
        excluded_ids: List[int] = list(cons.excluded_places) if cons else []
        must_visit_ids: List[int] = list(cons.must_visit) if cons else []

        daily_budget_cap = cons.max_daily_budget if cons else 0.0
        visited_place_ids: set = set()

        for day in days:
            day_num = day.day_number
            activity_items = [i for i in day.items if i.item_type == "activity"]

            # 0a. Opening hours (uses the place record, not the generator's claims)
            for item in activity_items:
                place = item.place
                if place is None or not item.start_time or not item.end_time:
                    continue
                if _t2m(item.start_time) < _t2m(place.opening_time) or _t2m(item.end_time) > _t2m(place.closing_time):
                    report.violations.append(Violation(
                        severity="hard",
                        code="OUTSIDE_OPENING_HOURS",
                        message=(
                            f"Day {day_num}: '{item.title}' is scheduled {item.start_time}-{item.end_time} "
                            f"but is open {place.opening_time}-{place.closing_time}."
                        ),
                        day_number=day_num,
                        item_id=item.id,
                    ))

            # 0b. Same place visited more than once in the trip
            for item in activity_items:
                if item.place_id and item.place_id in visited_place_ids:
                    report.violations.append(Violation(
                        severity="hard",
                        code="DUPLICATE_PLACE",
                        message=f"Day {day_num}: '{item.title}' is already scheduled earlier in the trip.",
                        day_number=day_num,
                        item_id=item.id,
                    ))
                if item.place_id:
                    visited_place_ids.add(item.place_id)

            # 0c. Daily budget cap (all items, including meals)
            if daily_budget_cap and daily_budget_cap > 0:
                day_total = sum(i.cost or 0.0 for i in day.items)
                if day_total > daily_budget_cap + 1e-6:
                    report.violations.append(Violation(
                        severity="hard",
                        code="DAILY_BUDGET_EXCEEDED",
                        message=f"Day {day_num}: estimated cost {day_total:.0f} exceeds the daily cap {daily_budget_cap:.0f}.",
                        day_number=day_num,
                    ))

            # 1. Activity count limit
            if len(activity_items) > max_activities:
                report.violations.append(Violation(
                    severity="hard",
                    code="ACTIVITY_LIMIT_EXCEEDED",
                    message=(
                        f"Day {day_num}: {len(activity_items)} activities scheduled, "
                        f"max is {max_activities}."
                    ),
                    day_number=day_num,
                ))

            # 2. Excluded places
            for item in activity_items:
                if item.place_id and item.place_id in excluded_ids:
                    report.violations.append(Violation(
                        severity="hard",
                        code="EXCLUDED_PLACE_SCHEDULED",
                        message=(
                            f"Day {day_num}: Place ID {item.place_id} "
                            f"({item.title!r}) is in the excluded list."
                        ),
                        day_number=day_num,
                        item_id=item.id,
                    ))

            # 3. Time overlaps between activities (sorted by start time)
            sorted_items = sorted(
                [i for i in day.items if i.start_time and i.end_time],
                key=lambda x: _t2m(x.start_time),
            )
            for idx in range(len(sorted_items) - 1):
                a = sorted_items[idx]
                b = sorted_items[idx + 1]
                if _t2m(a.end_time) > _t2m(b.start_time):
                    report.violations.append(Violation(
                        severity="hard",
                        code="TIME_OVERLAP",
                        message=(
                            f"Day {day_num}: '{a.title}' (ends {a.end_time}) overlaps "
                            f"'{b.title}' (starts {b.start_time})."
                        ),
                        day_number=day_num,
                    ))

            # 4. Daily boundary check
            for item in day.items:
                if not item.start_time or not item.end_time:
                    continue
                item_start = _t2m(item.start_time)
                item_end = _t2m(item.end_time)
                if item_start < start_min:
                    report.violations.append(Violation(
                        severity="soft",
                        code="BEFORE_PREFERRED_START",
                        message=(
                            f"Day {day_num}: '{item.title}' starts at {item.start_time}, "
                            f"before preferred start {pref.preferred_start_time if pref else '09:00'}."
                        ),
                        day_number=day_num,
                        item_id=item.id,
                    ))
                # Activities must end by the preferred end; meals get a 90-min grace for dinner
                grace = 0 if item.item_type == "activity" else 90
                if item_end > end_min + grace:
                    report.violations.append(Violation(
                        severity="soft",
                        code="AFTER_PREFERRED_END",
                        message=(
                            f"Day {day_num}: '{item.title}' ends at {item.end_time}, "
                            f"after your preferred end {pref.preferred_end_time if pref else '20:00'}."
                        ),
                        day_number=day_num,
                        item_id=item.id,
                    ))

            # 5. A day with no activities at all (e.g. every eligible place is used up)
            if not activity_items:
                report.violations.append(Violation(
                    severity="soft",
                    code="NO_ACTIVITIES",
                    message=f"Day {day_num}: no activities were scheduled; no remaining eligible place fits this day.",
                    day_number=day_num,
                ))

        # 6. Must-visit satisfaction (global, not per-day)
        for pid in must_visit_ids:
            if pid not in visited_place_ids:
                report.violations.append(Violation(
                    severity="hard",
                    code="MUST_VISIT_MISSING",
                    message=f"Must-visit place ID {pid} was not scheduled in any day.",
                ))

        self._data_notes(trip, days, report)

        if report.has_hard_violations:
            logger.warning(
                f"Trip {trip.id} itinerary has {len(report.hard_violations)} hard violations."
            )
        else:
            logger.info(
                f"Trip {trip.id} itinerary validated OK "
                f"({len(report.soft_violations)} soft warnings)."
            )

        return report

    @staticmethod
    def _data_notes(trip: Trip, days: List[Itinerary], report: ValidationReport) -> None:
        """
        Missing-data and estimate disclosures (severity "info"). They never make a
        plan invalid; they tell the user which numbers are not real data.
        """
        currency = trip.currency or "BDT"
        has_travel = False
        for day in days:
            for item in day.items:
                has_travel = has_travel or (item.travel_time_to_next or 0) > 0
                if item.item_type == "meal" and item.restaurant_id is None:
                    report.violations.append(Violation(
                        severity="info",
                        code="PLACEHOLDER_MEAL_COST",
                        message=(
                            f"Day {day.day_number}: no restaurant data for '{item.title}'; "
                            f"its cost ({item.cost:.0f}) is a placeholder estimate, not a real price."
                        ),
                        day_number=day.day_number,
                        item_id=item.id,
                    ))
                source = item.place or item.restaurant
                if source is not None and source.currency and source.currency != currency:
                    report.violations.append(Violation(
                        severity="info",
                        code="CURRENCY_MISMATCH",
                        message=(
                            f"Day {day.day_number}: '{item.title}' is priced in {source.currency}, not {currency}; "
                            f"it is left out of totals (no conversion rate)."
                        ),
                        day_number=day.day_number,
                        item_id=item.id,
                    ))
        if has_travel:
            report.violations.append(Violation(
                severity="info",
                code="ESTIMATED_TRAVEL_TIME",
                message="Travel times are straight-line distance estimates, not road routes or traffic.",
            ))

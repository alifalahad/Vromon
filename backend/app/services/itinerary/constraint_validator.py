"""
Vromon Backend — Itinerary Constraint Validator.

Independent validator that checks itineraries for:
- Time overlaps between activities
- Daily boundary violations (start/end times)
- Excluded place violations
- Must-visit place satisfaction
- Daily activity count limit violations
- Missing must-visit places
- Activities outside the place's opening hours, and meals outside the restaurant's
- The same place scheduled more than once
- Daily budget cap exceeded (when a cap is set)
- The traveller's must-dos: nothing before they arrive or after they leave, nothing
  during a busy time, and each must-see on its day and at its time

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

from sqlalchemy.orm import object_session

from app.models.models import Destination, Place, Trip, TripPreference, TripConstraint, Itinerary, ItineraryItem
from app.services.itinerary.trip_rules import TripRules, in_window, m2t, rules_for

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

        rules = self._rules(trip)
        max_activities = cons.max_activities_per_day if cons else 4
        excluded_ids: List[int] = list(cons.excluded_places) if cons else []
        must_visit_ids: List[int] = list(cons.must_visit) if cons else []

        daily_budget_cap = cons.max_daily_budget if cons else 0.0
        visited_place_ids: set = set()

        for day in days:
            day_num = day.day_number
            activity_items = [i for i in day.items if i.item_type == "activity"]
            start_min, end_min = rules.window(day_num)
            self._must_dos(rules, day, report)

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

            # 0a'. Meals: the restaurant must be open for the whole meal
            for item in day.items:
                rest = item.restaurant if item.item_type == "meal" else None
                if rest is None or not item.start_time or not item.end_time:
                    continue
                if _t2m(item.start_time) < _t2m(rest.opening_time) or _t2m(item.end_time) > _t2m(rest.closing_time):
                    report.violations.append(Violation(
                        severity="hard",
                        code="OUTSIDE_OPENING_HOURS",
                        message=(
                            f"Day {day_num}: '{item.title}' is at {item.start_time}-{item.end_time} "
                            f"but the restaurant is open {rest.opening_time}-{rest.closing_time}."
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
                if day_num == 1 and rules.arrive is not None and item_start < start_min and start_min == rules.arrive:
                    continue  # reported as BEFORE_ARRIVAL
                if day_num == rules.num_days and rules.leave is not None and item_end > end_min and end_min == rules.leave:
                    continue  # reported as AFTER_LEAVING
                if item_start < start_min:
                    report.violations.append(Violation(
                        severity="soft",
                        code="BEFORE_PREFERRED_START",
                        message=(
                            f"Day {day_num}: '{item.title}' starts at {item.start_time}, "
                            f"before preferred start {m2t(start_min)}."
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
                            f"after your preferred end {m2t(end_min)}."
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
        session = object_session(trip)
        for pid in must_visit_ids:
            if pid not in visited_place_ids:
                place = session.get(Place, pid) if session else None
                report.violations.append(Violation(
                    severity="hard",
                    code="MUST_VISIT_MISSING",
                    message=(
                        f"Your must-see '{place.name}' isn't in the plan." if place
                        else f"Must-visit place ID {pid} was not scheduled in any day."
                    ),
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
    def _rules(trip: Trip) -> TripRules:
        """The trip's rules; sunset needs the destination's coordinates, read when the trip is in a session."""
        session = object_session(trip)
        dest = session.query(Destination).filter(Destination.name == trip.destination).first() if session else None
        return rules_for(trip, dest)

    @staticmethod
    def _must_dos(rules: TripRules, day: Itinerary, report: ValidationReport) -> None:
        """Arrival and leaving times, busy times and must-sees with a day or a time (all hard)."""
        n = day.day_number
        timed = [i for i in day.items if i.start_time and i.end_time]
        for item in timed:
            s, e = _t2m(item.start_time), _t2m(item.end_time)
            if n == 1 and rules.arrive is not None and s < rules.window(1)[0] == rules.arrive:
                report.violations.append(Violation(
                    "hard", "BEFORE_ARRIVAL",
                    f"Day 1: '{item.title}' starts at {item.start_time}, before you arrive ({m2t(rules.arrive)}).",
                    n, item.id,
                ))
            if n == rules.num_days and rules.leave is not None and e > rules.window(n)[1] == rules.leave:
                report.violations.append(Violation(
                    "hard", "AFTER_LEAVING",
                    f"Day {n}: '{item.title}' ends at {item.end_time}, after you leave ({m2t(rules.leave)}).",
                    n, item.id,
                ))
            for b in rules.busy_on(n):
                if s < b.end and b.start < e:
                    what = f" ({b.label})" if b.label else ""
                    report.violations.append(Violation(
                        "hard", "DURING_BUSY_TIME",
                        f"Day {n}: '{item.title}' ({item.start_time}-{item.end_time}) is during your busy time "
                        f"{m2t(b.start)}-{m2t(b.end)}{what}.",
                        n, item.id,
                    ))
        for item in day.items:
            m = rules.must_for(item.place_id) if item.item_type == "activity" and item.place_id else None
            if m is None or (not m.day and not m.timed) or in_window(rules, m, item, n):
                continue
            wanted = f"day {m.day}" if m.day and m.day != n else (
                f"at sunset (about {m2t(rules.sunset(n))})" if m.when == "sunset"
                else f"at {m2t(m.at)}" if m.at is not None else f"in the {m.when}"
            )
            report.violations.append(Violation(
                "hard", "MUST_SEE_TIME",
                f"Day {n}: your must-see '{item.title}' is at {item.start_time}, not {wanted}.",
                n, item.id,
            ))

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
            from app.services.routing import ROADS, point_of
            estimated = False
            for day in days:
                acts = [i for i in sorted(day.items, key=lambda x: x.order_index) if i.item_type == "activity" and i.place]
                for a, b in zip(acts, acts[1:]):
                    if ROADS.pair(point_of(a.place), point_of(b.place)).source == "estimate":
                        estimated = True
            if estimated:
                report.violations.append(Violation(
                    severity="info",
                    code="ESTIMATED_TRAVEL_TIME",
                    message="Travel times are straight-line distance estimates, not road routes or traffic.",
                ))
            else:
                report.violations.append(Violation(
                    severity="info",
                    code="ROAD_TRAVEL_TIME",
                    message="Travel times use road distances; rickshaw and CNG times and all fares are estimates, without traffic.",
                ))

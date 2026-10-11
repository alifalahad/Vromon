"""
Vromon API v1 — Trips endpoints.

CRUD + generate/regenerate/adapt/feedback operations.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime
from typing import List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.services.recommendation.recommendation_service import per_person_daily_budget
from app.db import get_db
from app.models.models import (
    Destination,
    Trip, TripPreference, TripConstraint,
    Itinerary, ItineraryItem, Feedback, Place, Restaurant, Hotel,
)
from app.schemas.schemas import (
    TripCreate, TripUpdate, TripOut, TripSummaryOut,
    FeedbackCreate, FeedbackOut, AdaptRequest,
    GenerateResponse, ItineraryResponse,
)
from app.services.itinerary.itinerary_service import ItineraryService
from app.services.itinerary.constraint_validator import ConstraintValidator
from app.services.itinerary.cpsat_scheduler import CpSatItineraryService
from app.services.adaptation.adaptation_service import AdaptationService
from app.services.itinerary import editing_service as edits
from app.services.itinerary.editing_service import EditError

logger = logging.getLogger("vromon.api.trips")

router = APIRouter(prefix="/trips", tags=["trips"])
itinerary_service = ItineraryService()
adaptation_service = AdaptationService()
constraint_validator = ConstraintValidator()


# ---------------------------------------------------------------------------
# CRUD
# ---------------------------------------------------------------------------

@router.post("", response_model=TripOut, status_code=201)
def create_trip(payload: TripCreate, db: Session = Depends(get_db)):
    """Create a new trip with preferences and constraints."""
    _validate_trip_settings(
        db, payload.destination,
        payload.preference.preferred_start_time, payload.preference.preferred_end_time,
        payload.constraints.must_visit, payload.constraints.excluded_places,
    )
    trip = Trip(
        destination=payload.destination,
        start_date=payload.start_date,
        end_date=payload.end_date,
        num_travelers=payload.num_travelers,
        total_budget=payload.total_budget,
        title=f"{payload.destination} Trip",
        status="draft",
    )
    db.add(trip)
    db.flush()

    pref = TripPreference(
        trip_id=trip.id,
        travel_style=payload.preference.travel_style,
        activity_level=payload.preference.activity_level,
        accommodation_preference=payload.preference.accommodation_preference,
        preferred_start_time=payload.preference.preferred_start_time,
        preferred_end_time=payload.preference.preferred_end_time,
    )
    pref.interests = payload.preference.interests
    db.add(pref)

    cons = TripConstraint(
        trip_id=trip.id,
        max_activities_per_day=payload.constraints.max_activities_per_day,
        max_daily_budget=payload.constraints.max_daily_budget,
        avoid_crowded=payload.constraints.avoid_crowded,
        avoid_high_activity=payload.constraints.avoid_high_activity,
    )
    cons.must_visit = payload.constraints.must_visit
    cons.excluded_places = payload.constraints.excluded_places
    db.add(cons)

    db.commit()
    db.refresh(trip)
    logger.info(f"Created trip {trip.id}: {trip.destination}")
    return _trip_out(db, trip)


@router.get("", response_model=List[TripSummaryOut])
def list_trips(db: Session = Depends(get_db)):
    """List all trips (most recent first)."""
    trips = db.query(Trip).order_by(Trip.created_at.desc()).all()
    return [_trip_summary_out(t) for t in trips]


@router.get("/{trip_id}", response_model=TripOut)
def get_trip(trip_id: int, db: Session = Depends(get_db)):
    """Get a trip with full details including itinerary."""
    trip = _load_trip(db, trip_id)
    return _trip_out(db, trip)


@router.patch("/{trip_id}", response_model=TripOut)
def update_trip(trip_id: int, payload: TripUpdate, db: Session = Depends(get_db)):
    """Update trip title, status, preferences, or constraints (only the fields sent)."""
    trip = _load_trip(db, trip_id)
    if payload.title is not None:
        trip.title = payload.title
    if payload.status is not None:
        trip.status = payload.status
    if payload.preference and trip.preference:
        for field in payload.preference.model_fields_set:
            setattr(trip.preference, field, getattr(payload.preference, field))
    if payload.constraints and trip.constraints:
        for field in payload.constraints.model_fields_set:
            setattr(trip.constraints, field, getattr(payload.constraints, field))
    try:
        _validate_trip_settings(
            db, trip.destination,
            trip.preference.preferred_start_time if trip.preference else "09:00",
            trip.preference.preferred_end_time if trip.preference else "20:00",
            trip.constraints.must_visit if trip.constraints else [],
            trip.constraints.excluded_places if trip.constraints else [],
        )
    except HTTPException:
        db.rollback()
        raise
    trip.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(trip)
    return _trip_out(db, trip)


@router.delete("/{trip_id}", status_code=204)
def delete_trip(trip_id: int, db: Session = Depends(get_db)):
    """Delete a trip and all associated data."""
    trip = _load_trip(db, trip_id)
    db.delete(trip)
    db.commit()


# ---------------------------------------------------------------------------
# Duplicate trip
# ---------------------------------------------------------------------------

@router.post("/{trip_id}/duplicate", response_model=TripOut, status_code=201)
def duplicate_trip(trip_id: int, db: Session = Depends(get_db)):
    """Create a copy of an existing trip with its preferences and constraints."""
    original = _load_trip(db, trip_id)

    new_trip = Trip(
        destination=original.destination,
        start_date=original.start_date,
        end_date=original.end_date,
        num_travelers=original.num_travelers,
        total_budget=original.total_budget,
        title=f"{original.title or original.destination + ' Trip'} (Copy)",
        status="draft",
    )
    db.add(new_trip)
    db.flush()

    if original.preference:
        pref = TripPreference(
            trip_id=new_trip.id,
            travel_style=original.preference.travel_style,
            activity_level=original.preference.activity_level,
            accommodation_preference=original.preference.accommodation_preference,
            preferred_start_time=original.preference.preferred_start_time,
            preferred_end_time=original.preference.preferred_end_time,
        )
        pref.interests = original.preference.interests
        db.add(pref)

    if original.constraints:
        cons = TripConstraint(
            trip_id=new_trip.id,
            max_activities_per_day=original.constraints.max_activities_per_day,
            max_daily_budget=original.constraints.max_daily_budget,
            avoid_crowded=original.constraints.avoid_crowded,
            avoid_high_activity=original.constraints.avoid_high_activity,
        )
        cons.must_visit = original.constraints.must_visit
        cons.excluded_places = original.constraints.excluded_places
        db.add(cons)

    db.commit()
    db.refresh(new_trip)
    return _trip_out(db, new_trip)


# ---------------------------------------------------------------------------
# Itinerary generation
# ---------------------------------------------------------------------------

Algorithm = Literal["heuristic", "cpsat"]


@router.post("/{trip_id}/generate", response_model=GenerateResponse)
def generate_itinerary(
    trip_id: int,
    db: Session = Depends(get_db),
    algorithm: Algorithm = Query("heuristic", description="heuristic (greedy baseline) or cpsat (OR-Tools)"),
):
    """
    Generate a complete itinerary for the trip.

    - `heuristic`: the deterministic greedy baseline (default).
    - `cpsat`: OR-Tools CP-SAT optimization. If the solver finds no feasible
      schedule, returns 422 with the solver status and diagnostics and leaves
      any existing itinerary unchanged.

    A trip has one current itinerary: generating again replaces it
    (`replaced_previous` says whether one existed). Overlapping requests for the same
    trip are serialised, and a failure before the commit leaves the saved itinerary
    untouched. The result is always re-checked by the independent validator and
    saved with its `status` (`valid`, `valid_with_warnings` or `invalid`).
    """
    # Serialise generations of the same trip: row lock on PostgreSQL; SQLite allows one writer.
    db.query(Trip.id).filter(Trip.id == trip_id).with_for_update().first()
    trip = _load_trip(db, trip_id)
    _require_eligible_places(db, trip)

    solver_meta = None
    if algorithm == "cpsat":
        # Solve first (read-only) so a failure does not destroy the saved itinerary
        cpsat = CpSatItineraryService()
        result, context = cpsat.solve_for_trip(db, trip)
        if not result.succeeded:
            raise HTTPException(
                status_code=422,
                detail={
                    "message": "No itinerary satisfies all hard constraints.",
                    "algorithm": "cpsat_v1",
                    "solver": result.meta(),
                },
            )
        solver_meta = result.meta()

    replaced = _clear_itinerary(db, trip)

    if algorithm == "cpsat":
        days = cpsat.persist(db, trip, result, context)
    else:
        days = itinerary_service.generate(db, trip)
    trip.status = "generated"
    trip.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(trip)

    # Independent validation
    report = constraint_validator.validate(trip, days)

    activity_items = [i for d in days for i in d.items if i.item_type == "activity"]

    return {
        "trip_id": trip_id,
        "status": _generation_status(report),
        "replaced_previous": replaced,
        "days_generated": len(days),
        "valid": not report.has_hard_violations,
        "warnings": report.warnings,
        "meta": {
            "total_places_selected": len(activity_items),
            "estimated_total_activity_cost": round(sum(i.cost for i in activity_items), 2),
            "estimated_total_cost_per_person": round(sum(d.total_cost for d in days), 2),
            "algorithm": "cpsat_v1" if algorithm == "cpsat" else "heuristic_v1",
            "hard_violations": len(report.hard_violations),
            "soft_violations": len(report.soft_violations),
            "solver": solver_meta,
        },
        "validation": report.to_dict(),
        "itinerary": [_day_out(db, d) for d in days],
    }


@router.post("/{trip_id}/regenerate", response_model=GenerateResponse)
def regenerate_itinerary(
    trip_id: int,
    db: Session = Depends(get_db),
    algorithm: Algorithm = Query("heuristic", description="heuristic (greedy baseline) or cpsat (OR-Tools)"),
):
    """Regenerate the entire itinerary (alias for generate)."""
    return generate_itinerary(trip_id, db, algorithm)


# ---------------------------------------------------------------------------
# Itinerary retrieval
# ---------------------------------------------------------------------------

@router.get("/{trip_id}/itinerary", response_model=ItineraryResponse)
def get_itinerary(trip_id: int, db: Session = Depends(get_db)):
    """Get the current itinerary for a trip, re-validated against the trip's current constraints."""
    trip = _load_trip(db, trip_id)
    days = sorted(trip.itinerary_days, key=lambda d: d.day_number)
    total_cost = sum(d.total_cost for d in days)
    hotel = _get_hotel_info(db, trip)
    report = constraint_validator.validate(trip, days) if days else None
    return {
        "trip_id": trip_id,
        "destination": trip.destination,
        "start_date": str(trip.start_date),
        "end_date": str(trip.end_date),
        "num_days": trip.num_days,
        "currency": trip.currency,
        "trip_status": trip.status,
        "status": _generation_status(report) if report else None,
        "total_budget": trip.total_budget,
        "estimated_cost": total_cost,
        "hotel": hotel,
        "days": [_day_out(db, d) for d in days],
        "validation": report.to_dict() if report else None,
    }


# ---------------------------------------------------------------------------
# Item editing
# ---------------------------------------------------------------------------

@router.delete("/{trip_id}/items/{item_id}", status_code=200)
def remove_item(trip_id: int, item_id: int, db: Session = Depends(get_db)):
    """Remove an activity, recompute the day and re-validate the trip."""
    trip = _load_trip(db, trip_id)
    item = _load_item(trip, item_id)
    title = item.title
    try:
        day = edits.remove_activity(db, trip, item, _hotel(db, trip))
    except EditError as exc:
        raise HTTPException(status_code=exc.status, detail=exc.message)
    db.commit()
    return _edit_response(db, trip_id, day, f"Removed '{title}'")


@router.get("/{trip_id}/items/{item_id}/alternatives")
def item_alternatives(trip_id: int, item_id: int, db: Session = Depends(get_db)):
    """Places that could replace this activity in the same time slot (best ranked first)."""
    trip = _load_trip(db, trip_id)
    item = _load_item(trip, item_id)
    if item.item_type != "activity":
        raise HTTPException(status_code=422, detail="Only activities have alternatives.")
    fits = edits.alternatives_for_item(db, trip, item, limit=5)
    return {
        "item_id": item_id,
        "is_must_visit": edits.is_must_visit(trip, item),
        "alternatives": [
            {
                "place": _place_out(f.place),
                "recommendation_score": round(f.score, 3),
                "recommendation_reasons": f.reasons,
                "start_time": edits._minutes_to_time(f.start_min),
                "end_time": edits._minutes_to_time(f.end_min),
                "travel_from_previous_min": round(f.travel_in_min, 1),
            }
            for f in fits
        ],
    }


class ReplaceRequest(BaseModel):
    place_id: Optional[int] = Field(None, description="Place to use; omit to pick the best-ranked fit")


@router.post("/{trip_id}/items/{item_id}/replace")
def replace_item(trip_id: int, item_id: int, payload: ReplaceRequest, db: Session = Depends(get_db)):
    """Replace an activity with another place that fits the same slot; re-validates the trip."""
    trip = _load_trip(db, trip_id)
    item = _load_item(trip, item_id)
    old_title = item.title
    try:
        new_item = edits.replace_activity(db, trip, item, payload.place_id, _hotel(db, trip))
    except EditError as exc:
        db.rollback()
        raise HTTPException(status_code=exc.status, detail=exc.message)
    db.commit()
    return _edit_response(db, trip_id, new_item.itinerary, f"Replaced '{old_title}' with '{new_item.title}'")


@router.post("/{trip_id}/days/{day_id}/regenerate")
def regenerate_day(trip_id: int, day_id: int, db: Session = Depends(get_db)):
    """
    Rebuild one day with fresh alternatives (heuristic scheduler).

    Places currently on the day are avoided so the result actually changes,
    except must-visit places, which are kept. If no alternatives remain, the
    day's current places are allowed again. Other days are never touched.
    """
    trip = _load_trip(db, trip_id)
    day = next((d for d in trip.itinerary_days if d.id == day_id), None)
    if day is None:
        raise HTTPException(status_code=404, detail="Day not found")

    must = edits.must_visit_ids(trip)
    other_days_ids = {
        i.place_id for d in trip.itinerary_days if d.id != day_id for i in d.items if i.place_id
    }
    this_day_ids = {i.place_id for i in day.items if i.place_id}
    keep_must = sorted(this_day_ids & must)

    svc = ItineraryService()
    pref, cons = trip.preference, trip.constraints
    candidates = svc.recommender.recommend(
        db=db,
        destination=trip.destination,
        interests=pref.interests if pref else [],
        travel_style=pref.travel_style if pref else "Balanced",
        activity_level=pref.activity_level if pref else "Medium",
        daily_budget=per_person_daily_budget(trip.total_budget, trip.num_days, trip.num_travelers),
        avoid_crowded=cons.avoid_crowded if cons else False,
        exclude_ids=cons.excluded_places if cons else [],
        must_visit_ids=keep_must,
        limit=50,
    )
    hotel = svc._pick_hotel(db, trip)

    def build(avoid: set):
        return svc._build_day(
            db=db, trip=trip, day_number=day.day_number, day_date=day.day_date,
            candidates=candidates, used_place_ids=set(other_days_ids | avoid), hotel=hotel,
        )

    new_day = build(this_day_ids - must)
    note = "Regenerated with different places"
    if not any(i.item_type == "activity" for i in new_day.items if i.place_id not in must):
        new_day = build(set())
        note = "No unused alternatives fit this day; regenerated from all available places"

    for item in list(day.items):
        day.items.remove(item)
        db.delete(item)
    db.flush()
    day.theme = new_day.theme
    # Copy the generated items onto the existing day; the throwaway day object must
    # never enter the session (it would be persisted as an extra day row).
    for generated in new_day.items:
        day.items.append(_copy_item(generated))
    if new_day in db:
        db.expunge(new_day)
    db.flush()
    edits.recompute_day(day, hotel)
    db.commit()
    return _edit_response(db, trip_id, day, note)


# ---------------------------------------------------------------------------
# Feedback
# ---------------------------------------------------------------------------

@router.post("/{trip_id}/feedback", response_model=FeedbackOut, status_code=201)
def submit_feedback(trip_id: int, payload: FeedbackCreate, db: Session = Depends(get_db)):
    """Submit or update feedback for a trip."""
    trip = _load_trip(db, trip_id)
    existing = trip.feedback
    if existing:
        existing.rating = payload.rating
        existing.tags = payload.tags
        existing.comment = payload.comment
        db.commit()
        db.refresh(existing)
        fb = existing
    else:
        fb = Feedback(trip_id=trip_id, rating=payload.rating, comment=payload.comment)
        fb.tags = payload.tags
        db.add(fb)
        db.commit()
        db.refresh(fb)
    return _feedback_out(fb)


@router.get("/{trip_id}/feedback", response_model=Optional[FeedbackOut])
def get_feedback(trip_id: int, db: Session = Depends(get_db)):
    """Get feedback for a trip."""
    trip = _load_trip(db, trip_id)
    if not trip.feedback:
        return None
    return _feedback_out(trip.feedback)


# ---------------------------------------------------------------------------
# Adaptation
# ---------------------------------------------------------------------------

@router.post("/{trip_id}/adapt")
def adapt_trip(trip_id: int, payload: AdaptRequest, db: Session = Depends(get_db)):
    """Adapt the itinerary based on user request."""
    trip = _load_trip(db, trip_id)
    if not trip.itinerary_days:
        raise HTTPException(status_code=409, detail="Generate an itinerary before adapting it.")
    result = adaptation_service.adapt_trip(
        db=db,
        trip=trip,
        adaptation_type=payload.adaptation_type,
        parameters=payload.parameters,
        hotel=_hotel(db, trip),
    )
    trip = _load_trip(db, trip_id)
    return {
        "trip_id": trip_id,
        "adaptation_applied": payload.adaptation_type,
        "changed": bool(result.changes),
        "changes": result.changes,
        "message": (
            f"{len(result.changes)} change(s) applied."
            if result.changes else "No change: nothing in the itinerary matched this adaptation."
        ),
        "days": [_day_out(db, d) for d in trip.itinerary_days],
        "validation": constraint_validator.validate(trip, trip.itinerary_days).to_dict(),
    }


# ---------------------------------------------------------------------------
# Budget
# ---------------------------------------------------------------------------

@router.get("/{trip_id}/budget")
def budget_breakdown(trip_id: int, db: Session = Depends(get_db)):
    """
    Cost breakdown computed from the saved itinerary and seed price data.

    Activity and meal costs in the data are per person and are multiplied by the
    number of travellers. Hotel cost = price per night × nights × rooms, assuming
    2 travellers per room. Only costs from real records in the trip's currency
    count towards `known_total`. Placeholder meal prices (no restaurant data) are
    kept separate in `placeholder_total`; items in another currency are left out
    (no conversion rate). Local transport is not estimated (no data).
    `estimated_total` = known + placeholder, and `incomplete_reasons` lists every gap.
    """
    trip = _load_trip(db, trip_id)
    days = sorted(trip.itinerary_days, key=lambda d: d.day_number)
    n = trip.num_travelers
    currency = trip.currency
    nights = max(trip.num_days - 1, 0)
    rooms = -(-n // 2)
    hotel = _get_hotel_info(db, trip)
    hotel_ok = bool(hotel) and hotel.get("currency", currency) == currency
    hotel_total = hotel["price_per_night"] * nights * rooms if hotel_ok else 0.0

    per_day = []
    placeholder_meals = 0
    other_currency: dict[str, int] = {}
    for d in days:
        act = meal = placeholder = 0.0
        for i in d.items:
            if _cost_source(i) == "placeholder":
                placeholder += i.cost
                placeholder_meals += 1
                continue
            item_currency = _item_currency(i)
            if item_currency != currency:
                other_currency[item_currency] = other_currency.get(item_currency, 0) + 1
                continue
            if i.item_type == "activity":
                act += i.cost
            elif i.item_type == "meal":
                meal += i.cost
        per_day.append({
            "day_number": d.day_number,
            "activities_per_person": round(act, 2),
            "meals_per_person": round(meal, 2),
            "placeholder_per_person": round(placeholder, 2),
            "total_for_group": round((act + meal) * n, 2),
            "daily_cap_per_person": trip.constraints.max_daily_budget if trip.constraints else 0.0,
        })
    activities = sum(p["activities_per_person"] for p in per_day) * n
    meals = sum(p["meals_per_person"] for p in per_day) * n
    placeholder_total = sum(p["placeholder_per_person"] for p in per_day) * n
    free_activities = sum(
        1 for d in days for i in d.items if i.item_type == "activity" and not i.cost
    )
    known_total = activities + meals + hotel_total
    total = known_total + placeholder_total

    incomplete = ["Local transport is not included (no price data available)."]
    if not hotel:
        incomplete.append("Accommodation is not included (no hotel data for this destination).")
    elif not hotel_ok:
        incomplete.append(f"Accommodation is priced in {hotel.get('currency')}, not {currency}, and is not included.")
    if placeholder_meals:
        incomplete.append(
            f"{placeholder_meals} meal(s) have no restaurant data; their placeholder price is shown separately, not as a real cost."
        )
    for cur, count in sorted(other_currency.items()):
        incomplete.append(f"{count} item(s) priced in {cur} are left out (no conversion to {currency}).")

    return {
        "trip_id": trip_id,
        "currency": currency,
        "num_travelers": n,
        "nights": nights,
        "total_budget": trip.total_budget,
        "categories": {
            "activities": round(activities, 2),
            "meals": round(meals, 2),
            "accommodation": round(hotel_total, 2),
            "transport": None,
        },
        "known_total": round(known_total, 2),
        "placeholder_total": round(placeholder_total, 2),
        "placeholder_meals": placeholder_meals,
        "excluded_other_currency": sum(other_currency.values()),
        "estimated_total": round(total, 2),
        "remaining": round(trip.total_budget - total, 2),
        "over_budget": total > trip.total_budget,
        "per_day": per_day,
        "hotel": hotel,
        "assumptions": [
            "Activity and meal prices are per person, multiplied by the number of travellers.",
            f"Accommodation assumes {rooms} room(s) (2 travellers per room) for {nights} night(s).",
            "Prices come from the sample seed dataset and are estimates, not quotes.",
        ],
        "not_included": ["Local transport (no price data available)"],
        "incomplete_reasons": incomplete,
        "free_activities": free_activities,
    }


# ---------------------------------------------------------------------------
# Helper functions
# ---------------------------------------------------------------------------

def _validate_trip_settings(
    db: Session, destination: str, start_time: str, end_time: str, must_visit: list, excluded: list
) -> None:
    """Cross-field and database checks shared by create and update (422 with all problems listed)."""
    errors = []
    if not db.query(Destination).filter(Destination.name == destination, Destination.is_active == True).first():  # noqa: E712
        errors.append(f"Unknown destination '{destination}'.")
    if end_time <= start_time:
        errors.append("preferred_end_time must be later than preferred_start_time.")
    both = sorted(set(must_visit) & set(excluded))
    if both:
        errors.append(f"Place(s) {both} cannot be both must-visit and excluded.")
    ids = set(must_visit) | set(excluded)
    if ids:
        known = {
            pid for (pid,) in db.query(Place.id).filter(
                Place.id.in_(ids), Place.destination_name == destination, Place.is_active == True  # noqa: E712
            )
        }
        unknown = sorted(ids - known)
        if unknown:
            errors.append(f"Place ID(s) {unknown} do not exist at {destination}.")
    if errors:
        raise HTTPException(status_code=422, detail=errors)


def _require_eligible_places(db: Session, trip: Trip) -> None:
    """422 before anything is changed when no place can be scheduled at all."""
    excluded = set(trip.constraints.excluded_places) if trip.constraints else set()
    eligible = [
        pid for (pid,) in db.query(Place.id).filter(
            Place.destination_name == trip.destination, Place.is_active == True  # noqa: E712
        )
        if pid not in excluded
    ]
    if not eligible:
        raise HTTPException(
            status_code=422,
            detail={
                "message": (
                    f"No places at {trip.destination} can be scheduled: every place is excluded or unavailable. "
                    "Remove some exclusions and try again. Your saved itinerary was not changed."
                ),
                "eligible_places": 0,
            },
        )


def _clear_itinerary(db: Session, trip: Trip) -> bool:
    """
    Delete every saved day of the trip, reading from the database rather than the
    possibly stale `trip.itinerary_days`, so an overlapping request cannot leave
    duplicate days behind. Returns whether an itinerary existed.
    """
    for day in list(trip.itinerary_days):
        for item in list(day.items):
            db.expunge(item)
        db.expunge(day)
    day_ids = select(Itinerary.id).where(Itinerary.trip_id == trip.id)
    db.query(ItineraryItem).filter(ItineraryItem.itinerary_id.in_(day_ids)).delete(synchronize_session=False)
    removed = db.query(Itinerary).filter(Itinerary.trip_id == trip.id).delete(synchronize_session=False)
    db.expire(trip, ["itinerary_days"])
    return removed > 0


def _generation_status(report) -> str:
    if report.has_hard_violations:
        return "invalid"
    return "valid_with_warnings" if report.soft_violations else "valid"


def _cost_source(item: ItineraryItem) -> str:
    """A meal without a restaurant record has a placeholder price, not real data."""
    return "placeholder" if item.item_type == "meal" and item.restaurant_id is None else "data"


def _item_currency(item: ItineraryItem) -> str:
    source = item.place or item.restaurant
    # Placeholder meal prices are defined in BDT (itinerary_service._meal_cost)
    return source.currency if source is not None and source.currency else "BDT"


def _load_item(trip: Trip, item_id: int) -> ItineraryItem:
    """Find an item that belongs to this trip (404 otherwise, even if it exists elsewhere)."""
    for day in trip.itinerary_days:
        for item in day.items:
            if item.id == item_id:
                return item
    raise HTTPException(status_code=404, detail=f"Item {item_id} not found in trip {trip.id}")


def _copy_item(src: ItineraryItem) -> ItineraryItem:
    item = ItineraryItem(
        item_type=src.item_type, place_id=src.place_id, restaurant_id=src.restaurant_id,
        title=src.title, start_time=src.start_time, end_time=src.end_time,
        duration_minutes=src.duration_minutes, cost=src.cost, travel_time_to_next=0.0,
        distance_to_next=0.0, notes=src.notes, recommendation_score=src.recommendation_score,
        order_index=src.order_index,
    )
    item.recommendation_reasons = src.recommendation_reasons
    return item


def _hotel(db: Session, trip: Trip):
    return ItineraryService()._pick_hotel(db, trip)


def _edit_response(db: Session, trip_id: int, day: Itinerary, message: str) -> dict:
    """Common response for edits: the changed day plus a fresh validation of the whole trip."""
    db.expire_all()
    trip = _load_trip(db, trip_id)
    day = next(d for d in trip.itinerary_days if d.id == day.id)
    return {
        "success": True,
        "message": message,
        "day": _day_out(db, day),
        "validation": constraint_validator.validate(trip, trip.itinerary_days).to_dict(),
    }


def _load_trip(db: Session, trip_id: int) -> Trip:
    trip = (
        db.query(Trip)
        .options(
            joinedload(Trip.preference),
            joinedload(Trip.constraints),
            joinedload(Trip.feedback),
            joinedload(Trip.itinerary_days)
                .joinedload(Itinerary.items)
                .joinedload(ItineraryItem.place),
            joinedload(Trip.itinerary_days)
                .joinedload(Itinerary.items)
                .joinedload(ItineraryItem.restaurant),
        )
        .filter(Trip.id == trip_id)
        .first()
    )
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    return trip


def _place_out(p: Place) -> dict | None:
    if not p:
        return None
    return {
        "id": p.id,
        "name": p.name,
        "destination_name": p.destination_name,
        "category": p.category,
        "description": p.description,
        "latitude": p.latitude,
        "longitude": p.longitude,
        "rating": p.rating,
        "review_count": p.review_count,
        "average_visit_duration": p.average_visit_duration,
        "estimated_cost": p.estimated_cost,
        "currency": p.currency,
        "opening_time": p.opening_time,
        "closing_time": p.closing_time,
        "best_time": p.best_time,
        "crowd_level": p.crowd_level,
        "activity_level": p.activity_level,
        "tags": p.tags,
        "image_url": p.image_url,
    }


def _restaurant_out(r: Restaurant) -> dict | None:
    if not r:
        return None
    return {
        "id": r.id,
        "name": r.name,
        "destination_name": r.destination_name,
        "cuisine": r.cuisine,
        "price_level": r.price_level,
        "rating": r.rating,
        "review_count": r.review_count,
        "latitude": r.latitude,
        "longitude": r.longitude,
        "average_meal_cost": r.average_meal_cost,
        "currency": r.currency,
        "opening_time": r.opening_time,
        "closing_time": r.closing_time,
        "tags": r.tags,
        "description": r.description,
    }


def _item_out(item: ItineraryItem) -> dict:
    return {
        "id": item.id,
        "item_type": item.item_type,
        "place_id": item.place_id,
        "restaurant_id": item.restaurant_id,
        "title": item.title,
        "start_time": item.start_time,
        "end_time": item.end_time,
        "duration_minutes": item.duration_minutes,
        "cost": item.cost,
        "travel_time_to_next": item.travel_time_to_next,
        "distance_to_next": item.distance_to_next,
        "notes": item.notes,
        "recommendation_score": item.recommendation_score,
        "recommendation_reasons": item.recommendation_reasons,
        "order_index": item.order_index,
        "category": item.place.category if item.place else ("Meal" if item.item_type == "meal" else None),
        "currency": _item_currency(item),
        "cost_source": _cost_source(item),
        "place": _place_out(item.place) if item.place else None,
        "restaurant": _restaurant_out(item.restaurant) if item.restaurant else None,
    }


def _day_out(db: Session, day: Itinerary) -> dict:
    items = sorted(day.items, key=lambda x: x.order_index)
    return {
        "id": day.id,
        "trip_id": day.trip_id,
        "day_number": day.day_number,
        "day_date": str(day.day_date) if day.day_date else None,
        "theme": day.theme,
        "total_cost": day.total_cost,
        "total_travel_time": day.total_travel_time,
        "items": [_item_out(i) for i in items],
    }


def _trip_out(db: Session, trip: Trip) -> dict:
    pref = trip.preference
    cons = trip.constraints
    fb = trip.feedback
    return {
        "id": trip.id,
        "title": trip.title,
        "destination": trip.destination,
        "start_date": str(trip.start_date),
        "end_date": str(trip.end_date),
        "num_travelers": trip.num_travelers,
        "total_budget": trip.total_budget,
        "currency": trip.currency,
        "status": trip.status,
        "created_at": trip.created_at.isoformat(),
        "updated_at": trip.updated_at.isoformat(),
        "num_days": trip.num_days,
        "preference": {
            "id": pref.id,
            "interests": pref.interests,
            "travel_style": pref.travel_style,
            "activity_level": pref.activity_level,
            "accommodation_preference": pref.accommodation_preference,
            "preferred_start_time": pref.preferred_start_time,
            "preferred_end_time": pref.preferred_end_time,
        } if pref else None,
        "constraints": {
            "id": cons.id,
            "max_activities_per_day": cons.max_activities_per_day,
            "max_daily_budget": cons.max_daily_budget,
            "must_visit": cons.must_visit,
            "excluded_places": cons.excluded_places,
            "avoid_crowded": cons.avoid_crowded,
            "avoid_high_activity": cons.avoid_high_activity,
        } if cons else None,
        "itinerary_days": [_day_out(db, d) for d in trip.itinerary_days],
        "feedback": _feedback_out(fb) if fb else None,
    }


def _trip_summary_out(trip: Trip) -> dict:
    return {
        "id": trip.id,
        "title": trip.title,
        "destination": trip.destination,
        "start_date": str(trip.start_date),
        "end_date": str(trip.end_date),
        "num_travelers": trip.num_travelers,
        "total_budget": trip.total_budget,
        "currency": trip.currency,
        "status": trip.status,
        "num_days": trip.num_days,
        "created_at": trip.created_at.isoformat(),
    }


def _feedback_out(fb: Feedback) -> dict | None:
    if not fb:
        return None
    return {
        "id": fb.id,
        "trip_id": fb.trip_id,
        "rating": fb.rating,
        "tags": fb.tags,
        "comment": fb.comment,
        "created_at": fb.created_at.isoformat(),
    }


def _get_hotel_info(db: Session, trip: Trip) -> dict | None:
    pref = trip.preference
    cat = pref.accommodation_preference if pref else "Standard"
    hotel = (
        db.query(Hotel)
        .filter(Hotel.destination_name == trip.destination, Hotel.category == cat)
        .first()
    )
    if not hotel:
        hotel = db.query(Hotel).filter(Hotel.destination_name == trip.destination).first()
    if not hotel:
        return None
    return {
        "id": hotel.id,
        "name": hotel.name,
        "category": hotel.category,
        "price_per_night": hotel.price_per_night,
        "currency": hotel.currency,
        "rating": hotel.rating,
        "latitude": hotel.latitude,
        "longitude": hotel.longitude,
        "amenities": hotel.amenities,
    }

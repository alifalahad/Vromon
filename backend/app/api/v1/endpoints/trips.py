"""
Vromon API v1 — Trips endpoints.

CRUD + generate/regenerate/adapt/feedback operations.
"""

from __future__ import annotations

import json
import logging
from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload, selectinload

from app.services.budget import service as budget_service
from app.services.photos import StorageError, delete_photos
from app.services.photos.storage import PhotoStore, optional_photo_store
from app.services import journey, live, rooms
from app.services.recommendation.recommendation_service import per_person_daily_budget
from app.core.auth import get_current_user
from app.db import get_db
from app.models.models import (
    Destination, Photo, User,
    Trip, TripPreference, TripConstraint,
    Itinerary, ItineraryItem, Feedback, Place, Restaurant, Hotel,
)
from app.schemas.schemas import (
    TripCreate, TripUpdate, TripOut, TripSummaryOut,
    FeedbackCreate, FeedbackOut, AdaptRequest,
    GenerateResponse, ItineraryResponse,
    MarkVisitedIn, MarkVisitedOut, TripStopIn, TripStopsIn, MustSeeIn, BusyIn, TIME_PATTERN, JourneyPreferences,
)
from app.services.trip_stops import initial_stops, mark_trip_visited, nearest_city_stop, set_stops, stop_out
from app.services.itinerary.itinerary_service import ItineraryService, day_summary
from app.services.itinerary.constraint_validator import ConstraintValidator
from app.services.itinerary.cpsat_scheduler import CpSatItineraryService
from app.services.adaptation.adaptation_service import AdaptationService
from app.services.itinerary import editing_service as edits
from app.services.itinerary.editing_service import EditError
from app.services.itinerary import late_service, trip_rules
from app.services.itinerary.trip_rules import PACE_STOPS
from app.services.conditions import service as conditions_service
from app.services.routing import ROADS, point_of, prepare_destination
from app.services.routing.roads import haversine_km
from app.services.routing import modes as travel_modes

logger = logging.getLogger("vromon.api.trips")

router = APIRouter(prefix="/trips", tags=["trips"])
itinerary_service = ItineraryService()
adaptation_service = AdaptationService()
constraint_validator = ConstraintValidator()


# ---------------------------------------------------------------------------
# CRUD
# ---------------------------------------------------------------------------

@router.post("", response_model=TripOut, status_code=201)
def create_trip(payload: TripCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Create a new trip with preferences and constraints."""
    _validate_trip_settings(
        db, payload.destination,
        payload.preference.preferred_start_time, payload.preference.preferred_end_time,
        payload.constraints.must_visit, payload.constraints.excluded_places,
        num_days=(payload.end_date - payload.start_date).days + 1,
        must_sees=[m.model_dump() for m in payload.constraints.must_sees],
        busy=[b.model_dump() for b in payload.constraints.busy],
        arrive=payload.preference.arrive_time, leave=payload.preference.leave_time,
    )
    trip = Trip(
        user_id=user.id,
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
        arrive_time=payload.preference.arrive_time,
        leave_time=payload.preference.leave_time,
    )
    pref.interests = payload.preference.interests
    pref.transport_modes = list(dict.fromkeys(payload.transport_modes))
    pref.transport_by_budget = payload.transport_by_budget or not payload.transport_modes
    if payload.origin_point is not None:
        pref.origin_lat, pref.origin_lon = payload.origin_point.lat, payload.origin_point.lon
        pref.origin_label = payload.origin_point.label
    db.add(pref)

    # Stops a day follow the pace unless the client says otherwise
    stops = payload.constraints.max_activities_per_day
    if "max_activities_per_day" not in payload.constraints.model_fields_set:
        stops = PACE_STOPS.get(payload.preference.travel_style, stops)
    cons = TripConstraint(
        trip_id=trip.id,
        max_activities_per_day=stops,
        max_daily_budget=payload.constraints.max_daily_budget,
        avoid_crowded=payload.constraints.avoid_crowded,
        avoid_high_activity=payload.constraints.avoid_high_activity,
    )
    cons.must_sees = payload.constraints.must_sees
    cons.busy = payload.constraints.busy
    cons.excluded_places = payload.constraints.excluded_places
    db.add(cons)

    origin = payload.origin
    if origin is None and payload.origin_point is not None:
        origin = nearest_city_stop(db, payload.origin_point.lat, payload.origin_point.lon)
    mode = payload.transport_mode or next(({"launch": "boat"}.get(m, m) for m in payload.transport_modes), None)
    initial_stops(db, trip, origin, mode)

    db.commit()
    db.refresh(trip)
    logger.info(f"Created trip {trip.id}: {trip.destination}")
    return _trip_out(db, trip)


@router.get("", response_model=List[TripSummaryOut])
def list_trips(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """List the signed-in user's trips (most recent first)."""
    trips = (
        db.query(Trip).filter(Trip.user_id == user.id).options(selectinload(Trip.stops))
        .order_by(Trip.created_at.desc()).all()
    )
    return [_trip_summary_out(t) for t in trips]


@router.get("/{trip_id}", response_model=TripOut)
def get_trip(trip_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Get a trip with full details including itinerary (owner, or a friend read-only)."""
    trip = _load_trip(db, trip_id, user, friends_may_read=True)
    return _trip_out(db, trip)


@router.patch("/{trip_id}", response_model=TripOut)
def update_trip(trip_id: int, payload: TripUpdate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Update trip title, status, preferences, or constraints (only the fields sent)."""
    trip = _load_trip(db, trip_id, user)
    _drop_gone_places(db, trip)
    if payload.title is not None:
        trip.title = payload.title
    if payload.status is not None:
        trip.status = payload.status
    if payload.total_budget is not None:
        trip.total_budget = round(payload.total_budget)
    if payload.preference and trip.preference:
        for field in payload.preference.model_fields_set:
            setattr(trip.preference, field, getattr(payload.preference, field))
        # A new pace changes the stops a day, unless they're sent too
        if (
            "travel_style" in payload.preference.model_fields_set and trip.constraints
            and not (payload.constraints and "max_activities_per_day" in payload.constraints.model_fields_set)
        ):
            trip.constraints.max_activities_per_day = PACE_STOPS.get(
                trip.preference.travel_style, trip.constraints.max_activities_per_day
            )
    if payload.constraints and trip.constraints:
        sent = payload.constraints.model_fields_set
        for field in sent - {"must_sees", "must_visit"}:
            setattr(trip.constraints, field, getattr(payload.constraints, field))
        if "must_sees" in sent:
            trip.constraints.must_sees = payload.constraints.must_sees
        elif "must_visit" in sent:
            trip.constraints.must_visit = payload.constraints.must_visit  # keeps each one's day and time
    try:
        _validate_trip(db, trip)
    except HTTPException:
        db.rollback()
        raise
    trip.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(trip)
    return _trip_out(db, trip)


@router.delete("/{trip_id}", status_code=204)
def delete_trip(
    trip_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    store: Optional[PhotoStore] = Depends(optional_photo_store),
):
    """Delete a trip and all associated data. Its photos stay if they belong to a place too."""
    trip = _load_trip(db, trip_id, user)
    photos = db.scalars(select(Photo).where(Photo.trip_id == trip.id)).all()
    try:
        delete_photos(db, store, [p for p in photos if p.place_type is None])
    except StorageError as exc:
        logger.error("Trip %s: deleting its photos failed: %s", trip.id, exc)
        raise HTTPException(status_code=502, detail="Photo storage is unavailable. Please try again.")
    for p in photos:
        if p.place_type is not None:
            p.trip_id = None
    room = rooms.room_of(db, trip.id)
    room_id = room.id if room is not None else None
    members = rooms.delete_room(db, trip.id)  # SQLite doesn't cascade
    db.delete(trip)
    db.commit()
    if room_id is not None:
        live.conversation_updated(members, room_id)  # gone for everyone in it


# ---------------------------------------------------------------------------
# Stops and "mark these places as visited" (Android Phase 7)
# ---------------------------------------------------------------------------

@router.put("/{trip_id}/stops", response_model=TripOut)
def replace_stops(trip_id: int, payload: TripStopsIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Replace the trip's route (stops in order, each with how you get there)."""
    trip = _load_trip(db, trip_id, user)
    set_stops(db, trip, payload.stops)
    trip.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(trip)
    return _trip_out(db, trip)


@router.post("/{trip_id}/mark-visited", response_model=MarkVisitedOut)
def mark_visited(trip_id: int, payload: MarkVisitedIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """
    Answer the offer shown when a trip has ended: mark its stops' cities and
    countries visited on the map, or dismiss the offer. Either way it isn't shown again.
    """
    trip = _load_trip(db, trip_id, user)
    # A day of slack: the phone's "today" may be ahead of the server's UTC date
    if trip.end_date >= date.today() + timedelta(days=1):
        raise HTTPException(status_code=409, detail="This trip hasn't ended yet")
    marked = mark_trip_visited(db, trip) if payload.mark else 0
    trip.visited_prompt = "marked" if payload.mark else "dismissed"
    db.commit()
    return MarkVisitedOut(visited_prompt=trip.visited_prompt, places_marked=marked)


# ---------------------------------------------------------------------------
# Duplicate trip
# ---------------------------------------------------------------------------

@router.post("/{trip_id}/duplicate", response_model=TripOut, status_code=201)
def duplicate_trip(trip_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Create a copy of an existing trip with its preferences and constraints."""
    original = _load_trip(db, trip_id, user)
    new_trip = _copy_trip(db, original, user)
    db.commit()
    db.refresh(new_trip)
    return _trip_out(db, new_trip)


@router.post("/{trip_id}/copy", response_model=TripOut, status_code=201)
def copy_trip(trip_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """
    "Copy to my trips" from a trip card (docs/friends-chat-plan.md, step 4): any trip
    you can see (yours, or a friend's) becomes a new draft of your own, with its dates,
    stops, preferences and must-dos. Not its plan (you build your own), photos,
    feedback or members, and not a friend's busy times (their own schedule).
    Someone who can't see the trip gets 404.
    """
    original = _load_trip(db, trip_id, user, friends_may_read=True)
    new_trip = _copy_trip(db, original, user)
    db.commit()
    db.refresh(new_trip)
    return _trip_out(db, new_trip)


def _copy_trip(db: Session, original: Trip, owner: User) -> Trip:
    """A new draft trip for `owner` like `original` (no plan yet). Doesn't commit."""
    own = original.user_id == owner.id
    new_trip = Trip(
        user_id=owner.id,
        destination=original.destination,
        start_date=original.start_date,
        end_date=original.end_date,
        num_travelers=original.num_travelers,
        total_budget=original.total_budget,
        # Your own copy says so; a friend's trip keeps its name in your list
        title=f"{original.title or original.destination + ' Trip'} (Copy)" if own else original.title,
        status="draft",
        # A copy of a trip that's already over isn't one you went on: don't ask to mark it visited
        visited_prompt=None if own or original.end_date >= date.today() else "dismissed",
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
            arrive_time=original.preference.arrive_time,
            leave_time=original.preference.leave_time,
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
        cons.must_sees = original.constraints.must_sees
        if own:
            cons.busy = original.constraints.busy
        cons.excluded_places = original.constraints.excluded_places
        db.add(cons)

    if original.stops:
        set_stops(db, new_trip, [
            TripStopIn(city_geonameid=st.city_geonameid, country_iso2=st.country_iso2, transport_mode=st.transport_mode,
                       arrive_on=st.arrive_on, depart_on=st.depart_on)
            for st in original.stops
        ])
    return new_trip


# ---------------------------------------------------------------------------
# Itinerary generation
# ---------------------------------------------------------------------------

Algorithm = Literal["heuristic", "cpsat"]


@router.post("/{trip_id}/generate", response_model=GenerateResponse)
def generate_itinerary(
    trip_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
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
    trip = _load_trip(db, trip_id, user)
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
        "unplaced": _unplaced(db, trip, days),
    }


@router.post("/{trip_id}/regenerate", response_model=GenerateResponse)
def regenerate_itinerary(
    trip_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    algorithm: Algorithm = Query("heuristic", description="heuristic (greedy baseline) or cpsat (OR-Tools)"),
):
    """Regenerate the entire itinerary (alias for generate)."""
    return generate_itinerary(trip_id, db, user, algorithm)


# ---------------------------------------------------------------------------
# Itinerary retrieval
# ---------------------------------------------------------------------------

@router.get("/{trip_id}/itinerary", response_model=ItineraryResponse)
def get_itinerary(trip_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Get the current itinerary for a trip, re-validated against the trip's current constraints.
    Owner, or a friend read-only."""
    trip = _load_trip(db, trip_id, user, friends_may_read=True)
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
        "unplaced": _unplaced(db, trip, days) if days else [],
        "getting_there": _getting_there(db, trip),
    }


# ---------------------------------------------------------------------------
# Item editing
# ---------------------------------------------------------------------------

@router.delete("/{trip_id}/items/{item_id}", status_code=200)
def remove_item(trip_id: int, item_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Remove an activity, recompute the day and re-validate the trip."""
    trip = _load_trip(db, trip_id, user)
    item = _load_item(trip, item_id)
    title = item.title
    try:
        day = edits.remove_activity(db, trip, item, _hotel(db, trip))
    except EditError as exc:
        raise HTTPException(status_code=exc.status, detail=exc.message)
    db.commit()
    return _edit_response(db, trip_id, user, day, f"Removed '{title}'")


@router.get("/{trip_id}/items/{item_id}/alternatives")
def item_alternatives(trip_id: int, item_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Places that could replace this activity in the same time slot (best ranked first)."""
    trip = _load_trip(db, trip_id, user)
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
def replace_item(trip_id: int, item_id: int, payload: ReplaceRequest, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Replace an activity with another place that fits the same slot; re-validates the trip."""
    trip = _load_trip(db, trip_id, user)
    item = _load_item(trip, item_id)
    old_title = item.title
    try:
        new_item = edits.replace_activity(db, trip, item, payload.place_id, _hotel(db, trip))
    except EditError as exc:
        db.rollback()
        raise HTTPException(status_code=exc.status, detail=exc.message)
    db.commit()
    return _edit_response(db, trip_id, user, new_item.itinerary, f"Replaced '{old_title}' with '{new_item.title}'")


@router.post("/{trip_id}/days/{day_id}/regenerate")
def regenerate_day(trip_id: int, day_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """
    Rebuild one day with fresh alternatives (heuristic scheduler).

    Places currently on the day are avoided so the result actually changes,
    except must-visit places, which are kept. If no alternatives remain, the
    day's current places are allowed again. Other days are never touched.
    """
    trip = _load_trip(db, trip_id, user)
    day = next((d for d in trip.itinerary_days if d.id == day_id), None)
    if day is None:
        raise HTTPException(status_code=404, detail="Day not found")

    must = edits.must_visit_ids(trip)
    hotel = _hotel(db, trip)
    this_day_ids = {i.place_id for i in day.items if i.place_id}
    # Pinned stops ("keep this time") stay where they are; new places fill around them
    new_day, keep = edits.plan_day(db, trip, day, hotel, avoid=frozenset(this_day_ids - must))
    note = "Regenerated with different places"
    kept_ids = {k.place_id for k in keep if k.place_id}
    if not any(i.item_type == "activity" and i.place_id not in must | kept_ids for i in new_day.items):
        new_day, keep = edits.plan_day(db, trip, day, hotel)
        note = "No unused alternatives fit this day; regenerated from all available places"
    edits.apply_day(db, day, new_day, keep, hotel)
    db.commit()
    return _edit_response(db, trip_id, user, day, note)


class MustDosIn(BaseModel):
    """The traveller's must-dos; only the fields sent change (null clears a time)."""
    must_sees: Optional[List[MustSeeIn]] = Field(None, max_length=50)
    busy: Optional[List[BusyIn]] = Field(None, max_length=30)
    excluded_places: Optional[List[int]] = Field(None, max_length=200)
    arrive_time: Optional[str] = None
    leave_time: Optional[str] = None

    @model_validator(mode="after")
    def check(self):
        for t in (self.arrive_time, self.leave_time):
            if t is not None and not TIME_PATTERN.match(t):
                raise ValueError("times must be HH:MM in 24-hour format (00:00-23:59)")
        if self.must_sees is not None:
            seen: set = set()
            self.must_sees = [m for m in self.must_sees if not (m.place_id in seen or seen.add(m.place_id))]
        if self.excluded_places is not None and any(i < 1 for i in self.excluded_places):
            raise ValueError("place IDs must be positive integers")
        return self


@router.put("/{trip_id}/must-dos")
def update_must_dos(trip_id: int, payload: MustDosIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """
    Change the must-sees, busy times, places to skip, or the arrival and leaving times.
    With a plan, only the days that need it are re-planned: the days whose busy times or
    arrival/leaving time changed, the days with a stop the new rules don't allow, and the
    days a missing must-see goes to. Must-sees that still can't fit are listed in
    `unplaced`, each with why and the nearest time that would fit.
    """
    trip = _load_trip(db, trip_id, user)
    _drop_gone_places(db, trip)
    pref, cons = trip.preference, trip.constraints
    if pref is None or cons is None:
        raise HTTPException(status_code=409, detail="This trip has no preferences to change.")
    sent = payload.model_fields_set
    changed: set[int] = set()
    if "busy" in sent:
        before = {(b["day"], b["start"], b["end"]) for b in cons.busy}
        after = {(b.day, b.start, b.end) for b in payload.busy or []}
        changed |= {d for d, _, _ in before ^ after}
        cons.busy = payload.busy or []
    if "must_sees" in sent:
        cons.must_sees = payload.must_sees or []
    if "excluded_places" in sent:
        cons.excluded_places = list(dict.fromkeys(payload.excluded_places or []))
    if "arrive_time" in sent and payload.arrive_time != pref.arrive_time:
        pref.arrive_time = payload.arrive_time
        changed.add(1)
    if "leave_time" in sent and payload.leave_time != pref.leave_time:
        pref.leave_time = payload.leave_time
        changed.add(trip.num_days)
    try:
        _validate_trip(db, trip)
    except HTTPException:
        db.rollback()
        raise
    replanned: list[int] = []
    if trip.itinerary_days:
        replanned = edits.replan_for_rules(db, trip, changed, _hotel(db, trip))
    trip.updated_at = datetime.utcnow()
    db.commit()
    db.expire_all()
    trip = _load_trip(db, trip_id, user)
    days = sorted(trip.itinerary_days, key=lambda d: d.day_number)
    if not replanned:
        message = "Saved"
    elif len(replanned) == 1:
        message = f"Day {replanned[0]} was re-planned"
    else:
        message = f"Days {', '.join(map(str, replanned[:-1]))} and {replanned[-1]} were re-planned"
    return {
        "message": message,
        "replanned_days": replanned,
        "trip": _trip_out(db, trip),
        "unplaced": _unplaced(db, trip, days) if days else [],
        "validation": constraint_validator.validate(trip, days).to_dict() if days else None,
    }


# ---------------------------------------------------------------------------
# Rearranging (trip planner step 3)
# ---------------------------------------------------------------------------

def _load_day(trip: Trip, day_id: int) -> Itinerary:
    day = next((d for d in trip.itinerary_days if d.id == day_id), None)
    if day is None:
        raise HTTPException(status_code=404, detail="Day not found")
    return day


def _with_notes(message: str, notes: list[str]) -> str:
    return " ".join([message, *notes])


class OrderRequest(BaseModel):
    item_ids: List[int] = Field(..., min_length=1, description="Every stop of the day, in the new order")


@router.put("/{trip_id}/days/{day_id}/order")
def reorder_day(trip_id: int, day_id: int, payload: OrderRequest, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Put a day's stops in a new order; times are recomputed from the first change on."""
    trip = _load_trip(db, trip_id, user)
    day = _load_day(trip, day_id)
    try:
        notes = edits.reorder_day(day, trip, payload.item_ids, _hotel(db, trip))
    except EditError as exc:
        db.rollback()
        raise HTTPException(status_code=exc.status, detail=exc.message)
    db.commit()
    return _edit_response(db, trip_id, user, day, _with_notes(f"Day {day.day_number} rearranged.", notes))


class MoveRequest(BaseModel):
    day_id: int
    position: Optional[int] = Field(None, ge=0, description="Where on that day; omitted = at the end")


@router.post("/{trip_id}/items/{item_id}/move")
def move_item(trip_id: int, item_id: int, payload: MoveRequest, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Move a stop to another day; both days are re-timed and the trip re-checked."""
    trip = _load_trip(db, trip_id, user)
    item = _load_item(trip, item_id)
    source_id = item.itinerary_id
    target = _load_day(trip, payload.day_id)
    try:
        notes = edits.move_to_day(db, trip, item, target, payload.position, _hotel(db, trip))
    except EditError as exc:
        db.rollback()
        raise HTTPException(status_code=exc.status, detail=exc.message)
    db.commit()
    db.expire_all()
    trip = _load_trip(db, trip_id, user)
    days = [d for d in trip.itinerary_days if d.id in (source_id, payload.day_id)]
    return {
        "success": True,
        "message": _with_notes(f"Moved '{item.title}' to day {target.day_number}.", notes),
        "days": [_day_out(db, d) for d in sorted(days, key=lambda d: d.day_number)],
        "validation": constraint_validator.validate(trip, trip.itinerary_days).to_dict(),
    }


class ItemUpdate(BaseModel):
    duration_minutes: Optional[int] = Field(None, ge=15, le=600, description="How long you stay")
    pinned: Optional[bool] = Field(None, description="Keep this time when the day or the plan changes")
    # How to get to the next stop; null = let the app choose
    travel_mode: Optional[Literal["walk", "rickshaw", "cng", "car"]] = None


@router.get("/{trip_id}/items/{item_id}/leg")
def item_leg(trip_id: int, item_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """
    The ways to get from this stop to the next: walk, rickshaw, CNG or car, each with the
    time, the fare (per vehicle, an estimate) and the stops it would make later.
    """
    trip = _load_trip(db, trip_id, user)
    item = _load_item(trip, item_id)
    try:
        return edits.leg_options(trip, item.itinerary, item)
    except EditError as exc:
        raise HTTPException(status_code=exc.status, detail=exc.message)


@router.get("/{trip_id}/conditions")
def trip_conditions(
    trip_id: int,
    refresh: bool = Query(False, description="Ask the weather service again (at most every 2 minutes)"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    Weather by the hour, the sea, sunrise and sunset for each day of the plan, and the
    warnings for each stop (rain or storms on outdoor stops, rough sea, after dark, usual
    traffic near a closing time), each with its source and, where it helps, a drier day.
    Weather and sea: Open-Meteo, kept for 30 minutes. Traffic: the usual pattern, not live.
    Owner, or a friend read-only.
    """
    trip = _load_trip(db, trip_id, user, friends_may_read=True)
    return conditions_service.trip_conditions(db, trip, refresh=refresh)


class KeepRequest(BaseModel):
    code: Literal["rain", "storm", "wind", "rough_sea", "after_dark", "traffic_closing"]
    kept: bool = True


@router.post("/{trip_id}/items/{item_id}/keep")
def keep_despite_warning(trip_id: int, item_id: int, payload: KeepRequest, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Keep a stop despite a warning ("Keep"): the warning isn't shown as needing attention again."""
    trip = _load_trip(db, trip_id, user)
    item = _load_item(trip, item_id)
    kept = [k for k in item.kept_warnings if k != payload.code]
    item.kept_warnings = kept + ([payload.code] if payload.kept else [])
    db.commit()
    return {"item_id": item.id, "kept_warnings": item.kept_warnings}


@router.get("/{trip_id}/days/{day_id}/route")
def day_route(trip_id: int, day_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """
    The road line between consecutive stops of the day, for the map. A leg without one
    (no road data) has `line: null` and is drawn straight; a leg with no road at all that a
    boat or ferry can do has `crossing` (the two ghats, estimates) and `segments`
    (road, water, road). Owner, or a friend read-only.
    """
    trip = _load_trip(db, trip_id, user, friends_may_read=True)
    day = _load_day(trip, day_id)
    stops = [
        i for i in edits.sorted_items(day)
        if point_of(i.place if i.item_type == "activity" else i.restaurant) is not None
    ]
    points = [point_of(i.place if i.item_type == "activity" else i.restaurant) for i in stops]
    lines = ROADS.lines(db, points) if len(points) > 1 else []
    legs = []
    for a, b, pa, pb, line in zip(stops, stops[1:], points, points[1:], lines):
        leg: dict[str, Any] = {"from_item_id": a.id, "to_item_id": b.id, "line": line}
        crossing = ROADS.crossing(pa, pb) if line is None else None
        if crossing is not None:
            ga, gb = (crossing.start.lat, crossing.start.lon), (crossing.end.lat, crossing.end.lon)
            before, after = ROADS.lines(db, [pa, ga])[0], ROADS.lines(db, [gb, pb])[0]
            leg["crossing"] = {
                "from_ghat": {"name": crossing.start.name, "lat": ga[0], "lon": ga[1]},
                "to_ghat": {"name": crossing.end.name, "lat": gb[0], "lon": gb[1]},
                "water_km": crossing.water_km,
                "minutes": crossing.minutes,
                "estimate": True,
                "note": "By boat or ferry between the two ghats. Times are estimates: check the local schedule.",
            }
            leg["segments"] = [
                {"mode": "road", "line": before or [[pa[1], pa[0]], [ga[1], ga[0]]], "estimate": before is None},
                {"mode": "water", "line": [[ga[1], ga[0]], [gb[1], gb[0]]], "estimate": True},
                {"mode": "road", "line": after or [[gb[1], gb[0]], [pb[1], pb[0]]], "estimate": after is None},
            ]
        legs.append(leg)
    return {"day_id": day.id, "provider": ROADS.provider_name, "legs": legs}


@router.patch("/{trip_id}/items/{item_id}")
def update_item(trip_id: int, item_id: int, payload: ItemUpdate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Change how long you stay (later stops move) or pin a stop to its time."""
    trip = _load_trip(db, trip_id, user)
    item = _load_item(trip, item_id)
    day = item.itinerary
    notes: list[str] = []
    message = "No change."
    if payload.duration_minutes is not None and payload.duration_minutes != item.duration_minutes:
        notes = edits.set_duration(day, trip, item, payload.duration_minutes, _hotel(db, trip))
        message = f"'{item.title}' now takes {payload.duration_minutes} min."
    if payload.pinned is not None and payload.pinned != bool(item.pinned):
        item.pinned = payload.pinned
        message = f"'{item.title}' keeps its time." if payload.pinned else f"'{item.title}' can move again."
    if "travel_mode" in payload.model_fields_set and payload.travel_mode != item.travel_mode:
        try:
            notes += edits.set_travel_mode(trip, day, item, payload.travel_mode, _hotel(db, trip))
        except EditError as exc:
            db.rollback()
            raise HTTPException(status_code=exc.status, detail=exc.message)
        message = f"Going on from '{item.title}' by {payload.travel_mode or 'the suggested way'}."
    db.commit()
    return _edit_response(db, trip_id, user, day, _with_notes(message, notes))


class LateRequest(BaseModel):
    now: str = Field(pattern=r"^([01]\d|2[0-3]):[0-5]\d$", description="The phone's time now, HH:MM")
    minutes: int = Field(ge=5, le=240)
    apply: bool = False


class LateUndoRequest(BaseModel):
    undo: Dict[str, Any]


@router.post("/{trip_id}/days/{day_id}/late")
def running_late(trip_id: int, day_id: int, payload: LateRequest, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """
    Running late: push the rest of the day back by `minutes` from `now`. Must-sees and pinned
    stops don't move; what can't fit any more is dropped. Without `apply` nothing changes
    (a preview of what would move and what would be dropped).
    """
    trip = _load_trip(db, trip_id, user)
    day = _load_day(trip, day_id)
    plan = late_service.push_back(trip, day, trip_rules.t2m(payload.now), payload.minutes)
    out = late_service.public(plan)
    if not payload.apply:
        return out
    undo = late_service.apply(db, trip, day, plan, _hotel(db, trip))
    db.commit()
    moved, dropped = len(plan["moved"]), len(plan["dropped"])
    res = _edit_response(db, trip_id, user, day, f"{moved} stop(s) moved, {dropped} dropped.")
    return {**res, **out, "undo": undo}


@router.post("/{trip_id}/days/{day_id}/late/undo")
def running_late_undo(trip_id: int, day_id: int, payload: LateUndoRequest, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Undo a push-back: the old times, and the dropped stops back where they were."""
    trip = _load_trip(db, trip_id, user)
    day = _load_day(trip, day_id)
    try:
        late_service.undo(db, trip, day, payload.undo, _hotel(db, trip))
    except (late_service.LateError, KeyError, ValueError, TypeError) as exc:
        db.rollback()
        status = exc.status if isinstance(exc, late_service.LateError) else 422
        raise HTTPException(status_code=status, detail=getattr(exc, "message", "That change can't be undone."))
    db.commit()
    return _edit_response(db, trip_id, user, day, "Changed back.")


class AddItemRequest(BaseModel):
    place_id: int
    position: Optional[int] = Field(None, ge=0, description="Where on the day; omitted = at the end")


@router.post("/{trip_id}/days/{day_id}/items", status_code=201)
def add_item(trip_id: int, day_id: int, payload: AddItemRequest, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Add a place to a day at a position; the day is re-timed from there."""
    trip = _load_trip(db, trip_id, user)
    day = _load_day(trip, day_id)
    place = db.get(Place, payload.place_id)
    if place is None or not place.is_active:
        raise HTTPException(status_code=404, detail="Place not found")
    try:
        item, notes = edits.add_place(db, trip, day, place, payload.position, _hotel(db, trip))
    except EditError as exc:
        db.rollback()
        raise HTTPException(status_code=exc.status, detail=exc.message)
    db.commit()
    return _edit_response(db, trip_id, user, day, _with_notes(f"Added '{item.title}'.", notes))


@router.get("/{trip_id}/days/{day_id}/suggestions")
def day_suggestions(
    trip_id: int,
    day_id: int,
    near_item_id: Optional[int] = None,
    q: Optional[str] = Query(None, max_length=80),
    limit: int = Query(8, ge=1, le=25),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Places you could add to this day (not already in the trip), near a stop when given."""
    trip = _load_trip(db, trip_id, user)
    _load_day(trip, day_id)
    near = _load_item(trip, near_item_id) if near_item_id is not None else None
    return {
        "suggestions": [
            {
                "place": _place_out(place),
                "recommendation_score": round(score, 3),
                "recommendation_reasons": reasons,
                "distance_km": round(km, 1) if km is not None else None,
            }
            for place, score, reasons, km in edits.suggestions_for_day(db, trip, near, q, limit)
        ]
    }


# ---------------------------------------------------------------------------
# Feedback
# ---------------------------------------------------------------------------

@router.post("/{trip_id}/feedback", response_model=FeedbackOut, status_code=201)
def submit_feedback(trip_id: int, payload: FeedbackCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Submit or update feedback for a trip."""
    trip = _load_trip(db, trip_id, user)
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
def get_feedback(trip_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Get feedback for a trip."""
    trip = _load_trip(db, trip_id, user)
    if not trip.feedback:
        return None
    return _feedback_out(trip.feedback)


# ---------------------------------------------------------------------------
# Adaptation
# ---------------------------------------------------------------------------

@router.post("/{trip_id}/adapt")
def adapt_trip(trip_id: int, payload: AdaptRequest, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Adapt the itinerary based on user request."""
    trip = _load_trip(db, trip_id, user)
    if not trip.itinerary_days:
        raise HTTPException(status_code=409, detail="Generate an itinerary before adapting it.")
    result = adaptation_service.adapt_trip(
        db=db,
        trip=trip,
        adaptation_type=payload.adaptation_type,
        parameters=payload.parameters,
        hotel=_hotel(db, trip),
    )
    trip = _load_trip(db, trip_id, user)
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
def budget_breakdown(trip_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """
    Cost breakdown computed from the saved itinerary and seed price data.

    Activity and meal costs in the data are per person and are multiplied by the
    number of travellers. Hotel cost = price per night × nights × rooms, assuming
    2 travellers per room. Only costs from real records in the trip's currency
    count towards `known_total`. Placeholder meal prices (no restaurant data) are
    kept separate in `placeholder_total`; items in another currency are left out
    (no conversion rate). Local transport is not estimated (no data).
    `estimated_total` = known + placeholder, and `incomplete_reasons` lists every gap.
    Owner, or a friend read-only.

    The full budget (step 7) is in `parts` (getting there both ways, the stay, food,
    tickets, local travel), `total` with its range `low`–`high`, `left`, `status`
    (ok / close / over), `by_day` and `saves` (see services/budget). `estimated_total`
    is that total; `known_total` stays the activities, meals and hotel from data.
    """
    trip = _load_trip(db, trip_id, user, friends_may_read=True)
    return _budget(db, trip)


@router.post("/{trip_id}/budget/ai")
def ai_budget(trip_id: int, lang: Literal["en", "bn"] = "en", db: Session = Depends(get_db),
              user: User = Depends(get_current_user)):
    """A feasible budget estimated by the LLM from Vromon's own data (room rates, market prices, entry
    fees, the ways there; services.budget.ai). Not saved: the traveller may use it as their budget.
    503 when no LLM is configured."""
    from app.services.budget import ai as ai_budget_service
    from app.services.llm.provider import LLMNotConfiguredError, LLMProviderError
    trip = _load_trip(db, trip_id, user, friends_may_read=True)
    try:
        journey_plan = _journey(db, trip)
    except Exception:
        journey_plan = None
    try:
        return ai_budget_service.estimate(db, trip, journey_plan, _budget(db, trip), lang=lang)
    except LLMNotConfiguredError:
        raise HTTPException(status_code=503, detail="The AI budget isn't set up on this server (no LLM key)")
    except LLMProviderError as exc:
        raise HTTPException(status_code=502, detail=f"The AI budget couldn't be made right now: {exc}")


class SaveRequest(BaseModel):
    action: Dict[str, Any] = Field(description="A way to save's `action` (or a returned `undo`)")


@router.post("/{trip_id}/budget/save")
def apply_saving(trip_id: int, payload: SaveRequest, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Apply a way to save from the budget (or undo one). Returns the new budget, the days and the undo."""
    trip = _load_trip(db, trip_id, user)
    try:
        message, undo = budget_service.apply_save(db, trip, payload.action, lambda t: _hotel(db, t))
    except budget_service.SaveError as exc:
        db.rollback()
        raise HTTPException(status_code=exc.status, detail=exc.message)
    db.commit()
    db.expire_all()
    trip = _load_trip(db, trip_id, user)
    days = sorted(trip.itinerary_days, key=lambda d: d.day_number)
    return {
        "message": message,
        "undo": undo,
        "budget": _budget(db, trip),
        "days": [_day_out(db, d) for d in days],
        "validation": constraint_validator.validate(trip, days).to_dict(),
    }


def _budget(db: Session, trip: Trip) -> dict:
    trip_id = trip.id
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
    full = budget_service.full_budget(db, trip, _hotel(db, trip), _getting_there(db, trip))
    total = full["total"]
    local = next(p for p in full["parts"] if p["key"] == "local")

    incomplete = []
    if not next(p for p in full["parts"] if p["key"] == "getting_there")["known"]:
        incomplete.append("Getting there is not included (no starting city or way to travel set).")
    if not hotel:
        incomplete.append("Accommodation is not included (no hotel data for this destination).")
    elif not hotel.get("price_known", True):
        incomplete.append(f"Accommodation is not included ({hotel['name']}'s price isn't known).")
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
            "transport": local["amount"],
        },
        "known_total": round(known_total, 2),
        "placeholder_total": round(placeholder_total, 2),
        "placeholder_meals": placeholder_meals,
        "excluded_other_currency": sum(other_currency.values()),
        "estimated_total": round(total, 2),
        "remaining": round(trip.total_budget - total, 2),
        "over_budget": total > trip.total_budget,
        **full,
        "per_day": per_day,
        "hotel": hotel,
        "assumptions": [
            "Activity and meal prices are per person, multiplied by the number of travellers.",
            f"Accommodation assumes {rooms} room(s) (2 travellers per room) for {nights} night(s).",
            "Prices come from the sample seed dataset and are estimates, not quotes.",
            "Getting there is both ways by your way of travel; local travel is every ride of the plan, "
            "from and back to the hotel. Both are estimates (fares are bargained, no timetables).",
        ],
        "not_included": ["Shopping, tips and anything not in the plan"],
        "incomplete_reasons": incomplete,
        "free_activities": free_activities,
    }


# ---------------------------------------------------------------------------
# Helper functions
# ---------------------------------------------------------------------------

def _drop_gone_places(db: Session, trip: Trip) -> None:
    """
    Must-sees and places to skip that are no longer listed (taken out of the catalog since the trip
    was made) are dropped before a change, so they can't block it: they couldn't be planned anyway.
    """
    cons = trip.constraints
    if cons is None:
        return
    ids = {m["place_id"] for m in cons.must_sees} | set(cons.excluded_places)
    if not ids:
        return
    live = {
        pid for (pid,) in db.query(Place.id).filter(
            Place.id.in_(ids), Place.destination_name == trip.destination, Place.is_active == True  # noqa: E712
        )
    }
    if ids <= live:
        return
    logger.info("Trip %s: dropping places no longer listed %s", trip.id, sorted(ids - live))
    cons.must_sees = [m for m in cons.must_sees if m["place_id"] in live]
    cons.excluded_places = [pid for pid in cons.excluded_places if pid in live]


def _validate_trip(db: Session, trip: Trip) -> None:
    """The settings checks for a saved trip (after an update)."""
    pref, cons = trip.preference, trip.constraints
    _validate_trip_settings(
        db, trip.destination,
        pref.preferred_start_time if pref else "09:00",
        pref.preferred_end_time if pref else "20:00",
        cons.must_visit if cons else [],
        cons.excluded_places if cons else [],
        num_days=trip.num_days,
        must_sees=cons.must_sees if cons else [],
        busy=cons.busy if cons else [],
        arrive=pref.arrive_time if pref else None,
        leave=pref.leave_time if pref else None,
    )


def _validate_trip_settings(
    db: Session, destination: str, start_time: str, end_time: str, must_visit: list, excluded: list,
    *, num_days: Optional[int] = None, must_sees: list = (), busy: list = (),
    arrive: Optional[str] = None, leave: Optional[str] = None,
) -> None:
    """Cross-field and database checks shared by create and update (422 with all problems listed)."""
    errors = []
    if not db.query(Destination).filter(Destination.name == destination, Destination.is_active == True).first():  # noqa: E712
        errors.append(f"Unknown destination '{destination}'.")
    if end_time <= start_time:
        errors.append("preferred_end_time must be later than preferred_start_time.")
    if num_days is not None:
        for m in must_sees:
            if m.get("day") and m["day"] > num_days:
                errors.append(f"Must-see place {m['place_id']} is on day {m['day']}, but the trip has {num_days} day(s).")
        for b in busy:
            if b["day"] > num_days:
                errors.append(f"A busy time is on day {b['day']}, but the trip has {num_days} day(s).")
        if num_days == 1 and arrive and leave and leave <= arrive:
            errors.append("You leave before you arrive (leave_time must be later than arrive_time).")
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


def _journey_points(db: Session, trip: Trip):
    """(start, destination) as journey points, or None without a start."""
    from app.models.models import City
    pref = trip.preference
    dest = db.query(Destination).filter(Destination.name == trip.destination).first()
    if dest is None:
        return None
    stops = list(trip.stops)
    if pref is not None and pref.origin_lat is not None:
        start = journey.Point(pref.origin_lat, pref.origin_lon, pref.origin_label or "Your location")
    elif len(stops) >= 2 and stops[0].city_geonameid is not None:
        city = db.get(City, stops[0].city_geonameid)
        start = journey.Point(city.lat, city.lon, city.name)
    else:
        return None
    return start, journey.Point(dest.latitude, dest.longitude, dest.name)


def _journey(db: Session, trip: Trip) -> dict | None:
    points = _journey_points(db, trip)
    if points is None:
        return None
    pref = trip.preference
    preferred = list(pref.transport_modes) if pref else []
    if not preferred and trip.stops:
        m = list(trip.stops)[-1].transport_mode
        preferred = [{"boat": "launch"}.get(m, m)] if m else []
    per_person = (trip.total_budget or 0) / max(trip.num_travelers or 1, 1)
    return journey.plan(db, points[0], points[1], preferred=preferred,
                        by_budget=bool(pref and pref.transport_by_budget and not pref.transport_modes),
                        budget_per_person=per_person, travellers=trip.num_travelers or 1)


def _getting_there(db: Session, trip: Trip) -> dict | None:
    """The recommended way there (door to door, services.journey), as the budget and the plan show it."""
    try:
        plan = _journey(db, trip)
    except Exception:  # the journey is extra: a failure must not break the trip
        logger.exception("Journey planning failed for trip %s", trip.id)
        plan = None
    pref = trip.preference
    chosen = list(pref.transport_modes) if pref and pref.transport_modes else         [m for m in [list(trip.stops)[-1].transport_mode if trip.stops else None] if m]
    if plan and plan["options"] and (not chosen or plan["options"][0]["mode"] in chosen):
        best = plan["options"][0]
        on_road = best["mode"] in ("bus", "car") and plan["road_source"].startswith("road distance")
        return {"from": plan["from"], "to": plan["to"], "mode": best["mode"], "km": best["km"],
                "minutes": best["minutes"], "fare": best["cost_per_person"], "fare_per": "person",
                "source": "road" if on_road else ("timetable" if best["mode"] == "train" else "estimate")}
    # The chosen way isn't possible from the catalog (no airport or station near): the simple estimate for it
    return _getting_there_simple(db, trip)


@router.get("/{trip_id}/journey")
def trip_journey(trip_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Getting there door to door: options by plane, train, bus and car, with legs, times and fares
    (each fare says whether it's official or an estimate). Owner, or a friend read-only."""
    trip = _load_trip(db, trip_id, user, friends_may_read=True)
    plan = _journey(db, trip)
    if plan is None:
        raise HTTPException(status_code=404, detail="No starting point: set where you start from")
    pref = trip.preference
    plan["preferences"] = {"transport_modes": list(pref.transport_modes) if pref else [],
                           "transport_by_budget": bool(pref and pref.transport_by_budget)}
    return plan


@router.put("/{trip_id}/journey/preferences")
def set_journey_preferences(trip_id: int, payload: JourneyPreferences, db: Session = Depends(get_db),
                            user: User = Depends(get_current_user)):
    """Change how you like to travel there, or where you start from; returns the journey again."""
    trip = _load_trip(db, trip_id, user)
    pref = trip.preference
    if pref is None:
        pref = TripPreference(trip_id=trip.id)
        db.add(pref)
    pref.transport_modes = list(dict.fromkeys(payload.transport_modes))
    pref.transport_by_budget = payload.transport_by_budget or not payload.transport_modes
    if payload.origin_point is not None:
        pref.origin_lat, pref.origin_lon = payload.origin_point.lat, payload.origin_point.lon
        pref.origin_label = payload.origin_point.label
    db.commit()
    db.refresh(trip)
    return trip_journey(trip_id, db, user)


def _getting_there_simple(db: Session, trip: Trip) -> dict | None:
    """From the trip's starting city to the destination, by the trip's mode (rough estimates)."""
    from app.models.models import City
    stops = list(trip.stops)
    if len(stops) < 2 or stops[0].city_geonameid is None:
        return None
    arrive = stops[-1]
    mode = arrive.transport_mode
    origin = db.get(City, stops[0].city_geonameid)
    dest = db.query(Destination).filter(Destination.name == trip.destination).first()
    a, b = point_of(origin), point_of(dest)
    if not mode or a is None or b is None:
        return None
    if mode in ("bus", "car", "train"):
        ROADS.prepare(db, [a, b])
    road = ROADS.pair(a, b)
    est = travel_modes.getting_there(mode, road.km if road.source == "road" else None, road.drive_min, haversine_km(a, b))
    if est is None:
        return None
    return {
        "from": origin.name,
        "to": trip.destination,
        "mode": mode,
        "km": round(est["km"]),
        "minutes": round(est["minutes"] / 5) * 5,
        "fare": est["fare"],
        "fare_per": est["fare_per"],
        "source": road.source if mode in ("bus", "car", "train") else "estimate",
    }


def _unplaced(db: Session, trip: Trip, days: list) -> list[dict]:
    """The must-sees that aren't in the plan, each with the reason and the nearest time that fits."""
    rules = trip_rules.load_rules(db, trip)
    if not rules.must_sees:
        return []
    places = {p.id: p for p in db.query(Place).filter(Place.id.in_(rules.must_ids()))}
    cap = trip.constraints.max_daily_budget if trip.constraints else 0.0
    return [
        {**u, "message": trip_rules.reason_text(u["reason"], u["name"])}
        for u in trip_rules.unplaced(rules, days, places, _hotel(db, trip), cap)
    ]


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
    """
    A meal without a restaurant record, or at a restaurant whose prices aren't known, has a
    placeholder price, not real data; so does a visit whose entry price isn't known (it counts 0).
    """
    if item.item_type == "meal":
        return "placeholder" if item.restaurant_id is None or (item.restaurant is not None and not item.restaurant.cost_known) else "data"
    if item.place is not None and not item.place.cost_known:
        return "placeholder"
    return "data"


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


def _hotel(db: Session, trip: Trip):
    return ItineraryService()._pick_hotel(db, trip)


def _edit_response(db: Session, trip_id: int, user: User, day: Itinerary, message: str) -> dict:
    """Common response for edits: the changed day plus a fresh validation of the whole trip."""
    db.expire_all()
    trip = _load_trip(db, trip_id, user)
    day = next(d for d in trip.itinerary_days if d.id == day.id)
    return {
        "success": True,
        "message": message,
        "day": _day_out(db, day),
        "validation": constraint_validator.validate(trip, trip.itinerary_days).to_dict(),
    }


def _load_trip(db: Session, trip_id: int, owner: User, *, friends_may_read: bool = False) -> Trip:
    """
    The trip if `owner` owns it; otherwise 404 (never 403, so existence isn't confirmed).
    With `friends_may_read` (GET routes only) the owner's accepted friends, and the trip
    room's joined members (step 7), may read it too; only the owner ever changes it.
    """
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
    if trip is not None and trip.user_id is not None and trip.user_id != owner.id and friends_may_read:
        if rooms.can_read_trip(db, owner, trip):
            prepare_destination(db, trip.destination)
            return trip
    if trip is None or trip.user_id != owner.id:
        raise HTTPException(status_code=404, detail="Trip not found")
    # Road distances between the destination's places (asked for once, then kept)
    prepare_destination(db, trip.destination)
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
        # Unknown stays unknown (step 10): shown as "Price unknown" / "Hours not checked"; an unknown rating isn't shown
        "cost_known": p.cost_known,
        "hours_known": p.hours_known,
        "rating_known": p.rating_known,
        "source": p.source,
        "url": p.url,
        "checked": p.checked,
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
        "cost_known": r.cost_known,
        "hours_known": r.hours_known,
        "rating_known": r.rating_known,
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
        "pinned": bool(item.pinned),
        "category": item.place.category if item.place else ("Meal" if item.item_type == "meal" else None),
        "currency": _item_currency(item),
        "cost_source": _cost_source(item),
        "place": _place_out(item.place) if item.place else None,
        "restaurant": _restaurant_out(item.restaurant) if item.restaurant else None,
    }


def _day_out(db: Session, day: Itinerary) -> dict:
    items = sorted(day.items, key=lambda x: x.order_index)
    out = [_item_out(i) for i in items]
    # How each activity's leg to the next activity goes: by road or estimated, and by what
    for idx, (item, row) in enumerate(zip(items, out)):
        nxt = next((j for j in items[idx + 1:] if j.item_type == "activity" and j.place is not None), None)
        if item.item_type != "activity" or item.place is None or nxt is None:
            continue
        road = ROADS.pair(point_of(item.place), point_of(nxt.place))
        mode = item.travel_mode or (travel_modes.default_mode(road.km) if road.source == "road" else None)
        row["travel_mode"] = mode
        row["travel_mode_chosen"] = item.travel_mode is not None
        row["travel_source"] = road.source
        row["travel_fare"] = travel_modes.fare(mode, road.km) if mode else None
        crossing = ROADS.crossing(point_of(item.place), point_of(nxt.place)) if road.source == "estimate" else None
        if crossing is not None:
            row["travel_crossing"] = {"from_ghat": crossing.start.name, "to_ghat": crossing.end.name,
                                      "water_km": crossing.water_km, "minutes": crossing.minutes, "estimate": True}
    return {
        "id": day.id,
        "trip_id": day.trip_id,
        "day_number": day.day_number,
        "day_date": str(day.day_date) if day.day_date else None,
        "theme": day.theme,
        "summary": day_summary(day),
        "total_cost": day.total_cost,
        "total_travel_time": day.total_travel_time,
        "items": out,
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
        "user_id": trip.user_id,
        "stops": [stop_out(st) for st in trip.stops],
        "visited_prompt": trip.visited_prompt,
        "preference": {
            "id": pref.id,
            "interests": pref.interests,
            "travel_style": pref.travel_style,
            "activity_level": pref.activity_level,
            "accommodation_preference": pref.accommodation_preference,
            "preferred_start_time": pref.preferred_start_time,
            "preferred_end_time": pref.preferred_end_time,
            "arrive_time": pref.arrive_time,
            "leave_time": pref.leave_time,
        } if pref else None,
        "constraints": {
            "id": cons.id,
            "max_activities_per_day": cons.max_activities_per_day,
            "max_daily_budget": cons.max_daily_budget,
            "must_sees": cons.must_sees,
            "must_visit": cons.must_visit,
            "busy": cons.busy,
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
        "user_id": trip.user_id,
        "stops": [stop_out(st) for st in trip.stops],
        "visited_prompt": trip.visited_prompt,
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
    hotel = _hotel(db, trip)
    if not hotel:
        return None
    return {
        "id": hotel.id,
        "name": hotel.name,
        "category": hotel.category,
        "price_per_night": hotel.price_per_night,
        "currency": hotel.currency,
        "rating": hotel.rating,
        "price_known": hotel.price_known,
        "rating_known": hotel.rating_known,
        "latitude": hotel.latitude,
        "longitude": hotel.longitude,
        "amenities": hotel.amenities,
    }

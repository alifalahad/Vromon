"""
Trips API — CRUD + generate/regenerate/adapt/feedback endpoints.
"""

from __future__ import annotations
import json
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models.models import (
    Trip, TripPreference, TripConstraint,
    Itinerary, ItineraryItem, Feedback, Place, Restaurant
)
from app.schemas.schemas import (
    TripCreate, TripUpdate, TripOut, TripSummaryOut,
    ItineraryDayOut, ItineraryItemOut, PlaceOut, RestaurantOut,
    FeedbackCreate, FeedbackOut,
    AdaptRequest, GenerationMeta,
)
from app.services.itinerary.itinerary_service import ItineraryService
from app.services.adaptation.adaptation_service import AdaptationService

router = APIRouter(prefix="/api/trips", tags=["trips"])
itinerary_service = ItineraryService()
adaptation_service = AdaptationService()


# ---------------------------------------------------------------------------
# CRUD
# ---------------------------------------------------------------------------

@router.post("", response_model=TripOut, status_code=201)
def create_trip(payload: TripCreate, db: Session = Depends(get_db)):
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
    return _trip_out(db, trip)


@router.get("", response_model=List[TripSummaryOut])
def list_trips(db: Session = Depends(get_db)):
    trips = db.query(Trip).order_by(Trip.created_at.desc()).all()
    return [_trip_summary_out(t) for t in trips]


@router.get("/{trip_id}", response_model=TripOut)
def get_trip(trip_id: int, db: Session = Depends(get_db)):
    trip = _load_trip(db, trip_id)
    return _trip_out(db, trip)


@router.put("/{trip_id}", response_model=TripOut)
def update_trip(trip_id: int, payload: TripUpdate, db: Session = Depends(get_db)):
    trip = _load_trip(db, trip_id)
    if payload.title is not None:
        trip.title = payload.title
    if payload.status is not None:
        trip.status = payload.status
    if payload.preference and trip.preference:
        pref = trip.preference
        pref.travel_style = payload.preference.travel_style
        pref.activity_level = payload.preference.activity_level
        pref.accommodation_preference = payload.preference.accommodation_preference
        pref.preferred_start_time = payload.preference.preferred_start_time
        pref.preferred_end_time = payload.preference.preferred_end_time
        pref.interests = payload.preference.interests
    if payload.constraints and trip.constraints:
        cons = trip.constraints
        cons.max_activities_per_day = payload.constraints.max_activities_per_day
        cons.max_daily_budget = payload.constraints.max_daily_budget
        cons.avoid_crowded = payload.constraints.avoid_crowded
        cons.avoid_high_activity = payload.constraints.avoid_high_activity
        cons.must_visit = payload.constraints.must_visit
        cons.excluded_places = payload.constraints.excluded_places
    trip.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(trip)
    return _trip_out(db, trip)


@router.delete("/{trip_id}", status_code=204)
def delete_trip(trip_id: int, db: Session = Depends(get_db)):
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
        title=f"{original.destination} Trip (Copy)",
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

@router.post("/{trip_id}/generate")
def generate_itinerary(trip_id: int, db: Session = Depends(get_db)):
    trip = _load_trip(db, trip_id)

    # Clear existing itinerary
    for day in trip.itinerary_days:
        db.delete(day)
    db.flush()

    days = itinerary_service.generate(db, trip)
    trip.status = "generated"
    trip.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(trip)

    total_cost = sum(d.total_cost for d in days)
    total_places = sum(len([i for i in d.items if i.item_type == "activity"]) for d in days)

    return {
        "trip_id": trip_id,
        "days_generated": len(days),
        "meta": {
            "total_places_selected": total_places,
            "estimated_total_activity_cost": total_cost,
            "algorithm": "heuristic_v1",
        },
        "itinerary": [_day_out(db, d) for d in days],
    }


@router.post("/{trip_id}/regenerate")
def regenerate_itinerary(trip_id: int, db: Session = Depends(get_db)):
    """Alias for generate — clears and rebuilds."""
    return generate_itinerary(trip_id, db)


# ---------------------------------------------------------------------------
# Itinerary retrieval
# ---------------------------------------------------------------------------

@router.get("/{trip_id}/itinerary")
def get_itinerary(trip_id: int, db: Session = Depends(get_db)):
    trip = _load_trip(db, trip_id)
    days = trip.itinerary_days
    total_cost = sum(d.total_cost for d in days)
    hotel = _get_hotel_info(db, trip)
    return {
        "trip_id": trip_id,
        "destination": trip.destination,
        "start_date": str(trip.start_date),
        "end_date": str(trip.end_date),
        "total_budget": trip.total_budget,
        "estimated_cost": total_cost,
        "hotel": hotel,
        "days": [_day_out(db, d) for d in days],
    }


# ---------------------------------------------------------------------------
# Item editing
# ---------------------------------------------------------------------------

@router.delete("/{trip_id}/items/{item_id}", status_code=200)
def remove_item(trip_id: int, item_id: int, db: Session = Depends(get_db)):
    """Remove an activity from the itinerary."""
    item = db.query(ItineraryItem).filter(ItineraryItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    day = item.itinerary
    db.delete(item)
    db.flush()
    day.total_cost = round(sum(i.cost for i in day.items if i.id != item_id), 2)
    db.commit()
    return {"success": True, "message": "Activity removed"}


@router.post("/{trip_id}/days/{day_id}/regenerate")
def regenerate_day(trip_id: int, day_id: int, db: Session = Depends(get_db)):
    """Regenerate a single day."""
    trip = _load_trip(db, trip_id)
    day = db.query(Itinerary).filter(Itinerary.id == day_id, Itinerary.trip_id == trip_id).first()
    if not day:
        raise HTTPException(status_code=404, detail="Day not found")

    used_ids = set()
    for other_day in trip.itinerary_days:
        if other_day.id != day_id:
            for item in other_day.items:
                if item.place_id:
                    used_ids.add(item.place_id)

    # Delete existing day items
    for item in day.items:
        db.delete(item)
    db.flush()

    # Rebuild
    from app.services.recommendation.recommendation_service import RecommendationService
    from app.services.itinerary.itinerary_service import ItineraryService
    svc = ItineraryService()
    pref = trip.preference
    cons = trip.constraints
    candidates = svc.recommender.recommend(
        db=db,
        destination=trip.destination,
        interests=pref.interests if pref else [],
        travel_style=pref.travel_style if pref else "Balanced",
        activity_level=pref.activity_level if pref else "Medium",
        daily_budget=trip.total_budget / max(trip.num_days, 1),
        avoid_crowded=cons.avoid_crowded if cons else False,
        exclude_ids=cons.excluded_places if cons else [],
        limit=50,
    )
    hotel = svc._pick_hotel(db, trip)
    new_day = svc._build_day(
        db=db,
        trip=trip,
        day_number=day.day_number,
        day_date=day.day_date,
        candidates=candidates,
        used_place_ids=used_ids,
        hotel=hotel,
    )
    # Copy items to existing day
    day.theme = new_day.theme
    day.total_cost = new_day.total_cost
    day.total_travel_time = new_day.total_travel_time
    for item in new_day.items:
        item.itinerary_id = day.id
        db.add(item)
    db.commit()
    db.refresh(day)
    return _day_out(db, day)


# ---------------------------------------------------------------------------
# Feedback
# ---------------------------------------------------------------------------

@router.post("/{trip_id}/feedback", response_model=FeedbackOut, status_code=201)
def submit_feedback(trip_id: int, payload: FeedbackCreate, db: Session = Depends(get_db)):
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
    trip = _load_trip(db, trip_id)
    if not trip.feedback:
        return None
    return _feedback_out(trip.feedback)


# ---------------------------------------------------------------------------
# Adaptation
# ---------------------------------------------------------------------------

@router.post("/{trip_id}/adapt")
def adapt_trip(trip_id: int, payload: AdaptRequest, db: Session = Depends(get_db)):
    trip = _load_trip(db, trip_id)
    days = adaptation_service.adapt_trip(
        db=db,
        trip=trip,
        adaptation_type=payload.adaptation_type,
        parameters=payload.parameters,
    )
    return {
        "trip_id": trip_id,
        "adaptation_applied": payload.adaptation_type,
        "days": [_day_out(db, d) for d in days],
    }


# ---------------------------------------------------------------------------
# Helper functions
# ---------------------------------------------------------------------------

def _load_trip(db: Session, trip_id: int) -> Trip:
    trip = (
        db.query(Trip)
        .options(
            joinedload(Trip.preference),
            joinedload(Trip.constraints),
            joinedload(Trip.feedback),
            joinedload(Trip.itinerary_days).joinedload(Itinerary.items).joinedload(ItineraryItem.place),
            joinedload(Trip.itinerary_days).joinedload(Itinerary.items).joinedload(ItineraryItem.restaurant),
        )
        .filter(Trip.id == trip_id)
        .first()
    )
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    return trip


def _place_out(p: Place) -> dict:
    if not p:
        return None
    d = {c.name: getattr(p, c.name) for c in p.__table__.columns}
    d["tags"] = p.tags
    return d


def _restaurant_out(r: Restaurant) -> dict:
    if not r:
        return None
    d = {c.name: getattr(r, c.name) for c in r.__table__.columns}
    d["tags"] = r.tags
    return d


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
        "status": trip.status,
        "num_days": trip.num_days,
        "created_at": trip.created_at.isoformat(),
    }


def _feedback_out(fb: Feedback) -> dict:
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


def _get_hotel_info(db: Session, trip: Trip) -> Optional[dict]:
    from app.models.models import Hotel
    pref = trip.preference
    cat = pref.accommodation_preference if pref else "Standard"
    hotel = (
        db.query(Hotel)
        .filter(Hotel.destination == trip.destination, Hotel.category == cat)
        .first()
    )
    if not hotel:
        hotel = db.query(Hotel).filter(Hotel.destination == trip.destination).first()
    if not hotel:
        return None
    return {
        "id": hotel.id,
        "name": hotel.name,
        "category": hotel.category,
        "price_per_night": hotel.price_per_night,
        "rating": hotel.rating,
        "latitude": hotel.latitude,
        "longitude": hotel.longitude,
        "amenities": hotel.amenities,
    }

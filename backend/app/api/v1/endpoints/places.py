"""
Vromon API v1 — Places endpoints.
"""

from __future__ import annotations

from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.db import get_db
from app.models.catalog import ReviewTask
from app.models.models import Itinerary, ItineraryItem, Place, User
from app.services import rooms
from app.schemas.schemas import (
    PlaceOut, RecommendationRequest, RecommendationResponse, ScoredPlace,
)
from app.services.recommendation.recommendation_service import RecommendationService

router = APIRouter(prefix="/places", tags=["places"])
recommender = RecommendationService()


@router.get("", response_model=List[PlaceOut])
def list_places(
    destination: Optional[str] = Query(None, description="Filter by destination name"),
    category: Optional[str] = Query(None, description="Filter by category"),
    db: Session = Depends(get_db),
):
    """List all active places, optionally filtered."""
    query = db.query(Place).filter(Place.is_active == True, Place.listed == True)  # noqa: E712 (never a private stop)
    if destination:
        query = query.filter(Place.destination_name == destination)
    if category:
        query = query.filter(Place.category == category)
    places = query.order_by(Place.id).all()  # PostgreSQL gives no order without one
    return [_place_out(p) for p in places]


@router.get("/{place_id}", response_model=PlaceOut)
def get_place(place_id: int, db: Session = Depends(get_db), viewer: User = Depends(get_current_user)):
    """Get a single place by ID (signed in, as the whole API). A traveller's private stop (step 6): only
    its owner and the joined members of a trip room whose plan has it; anyone else gets 404."""
    place = db.query(Place).filter(Place.id == place_id).first()
    if not place or (not place.listed and not _may_see_private(db, viewer, place)):
        raise HTTPException(status_code=404, detail="Place not found")
    return _place_out(place)


def _may_see_private(db: Session, viewer: User, place: Place) -> bool:
    if viewer.id == place.owner_user_id:
        return True
    trip_ids = set(db.scalars(select(Itinerary.trip_id).join(ItineraryItem, ItineraryItem.itinerary_id == Itinerary.id)
                              .where(ItineraryItem.place_id == place.id)))
    return any(rooms.is_joined(db, tid, viewer.id) for tid in trip_ids)


@router.post("/{place_id}/suggest", status_code=201)
def suggest_place(place_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """
    "Suggest this place to Vromon" (trip upgrades step 6): the owner's private stop goes to the data
    platform's review queue, a `new_entity` task with where it came from (no user id). Once per place
    while it's open. Anyone but the owner gets 404.
    """
    place = db.get(Place, place_id)
    if place is None or place.listed or place.owner_user_id != user.id:
        raise HTTPException(status_code=404, detail="Place not found")
    open_tasks = db.scalars(select(ReviewTask).where(ReviewTask.task_type == "new_entity", ReviewTask.entity_type == "app_place",
                                                     ReviewTask.status == "open")).all()
    if any((t.payload or {}).get("place_id") == place.id for t in open_tasks):
        return {"suggested": True, "already": True}
    db.add(ReviewTask(task_type="new_entity", entity_type="app_place", priority=3, payload={
        "origin": "traveller", "place_id": place.id, "name": place.name, "lat": place.latitude, "lon": place.longitude,
        "kind": place.tags[0] if place.tags else None, "source": place.source, "source_ref": place.source_ref,
        "destination": place.destination_name,
    }))
    db.commit()
    return {"suggested": True, "already": False}


@router.post("/recommendations", response_model=RecommendationResponse)
def get_recommendations(req: RecommendationRequest, db: Session = Depends(get_db)):
    """Get scored place recommendations based on preferences."""
    results = recommender.recommend(
        db=db,
        destination=req.destination,
        interests=req.interests,
        travel_style=req.travel_style,
        activity_level=req.activity_level,
        daily_budget=req.daily_budget,
        avoid_crowded=req.avoid_crowded,
        exclude_ids=req.exclude_ids,
        limit=req.limit,
    )
    scored = [
        ScoredPlace(place=_place_out(p), score=round(s, 3), reasons=r)
        for p, s, r in results
    ]
    total = db.query(Place).filter(
        Place.destination_name == req.destination, Place.is_active == True, Place.listed == True  # noqa: E712
    ).count()
    return RecommendationResponse(
        recommendations=scored,
        total_considered=total,
    )


def _place_out(p: Place) -> PlaceOut:
    return PlaceOut(
        id=p.id,
        name=p.name,
        destination_name=p.destination_name,
        category=p.category,
        description=p.description,
        latitude=p.latitude,
        longitude=p.longitude,
        rating=p.rating,
        review_count=p.review_count,
        average_visit_duration=p.average_visit_duration,
        estimated_cost=p.estimated_cost,
        currency=p.currency,
        opening_time=p.opening_time,
        closing_time=p.closing_time,
        best_time=p.best_time,
        crowd_level=p.crowd_level,
        activity_level=p.activity_level,
        tags=p.tags,
        image_url=p.image_url,
        cost_known=p.cost_known,
        hours_known=p.hours_known,
        rating_known=p.rating_known,
        source=p.source,
        url=p.url,
        checked=p.checked,
        listed=p.listed is not False,
        kind=(p.tags[0] if p.tags else None) if p.listed is False else None,
    )

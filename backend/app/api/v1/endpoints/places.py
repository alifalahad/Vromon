"""
Vromon API v1 — Places endpoints.
"""

from __future__ import annotations

from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.db import get_db
from app.models.models import Place
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
    query = db.query(Place).filter(Place.is_active == True)
    if destination:
        query = query.filter(Place.destination_name == destination)
    if category:
        query = query.filter(Place.category == category)
    places = query.all()
    return [_place_out(p) for p in places]


@router.get("/{place_id}", response_model=PlaceOut)
def get_place(place_id: int, db: Session = Depends(get_db)):
    """Get a single place by ID."""
    place = db.query(Place).filter(Place.id == place_id).first()
    if not place:
        raise HTTPException(status_code=404, detail="Place not found")
    return _place_out(place)


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
        Place.destination_name == req.destination, Place.is_active == True
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
    )

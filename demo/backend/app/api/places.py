from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from app.database import get_db
from app.models.models import Place
from app.schemas.schemas import PlaceOut, RecommendationRequest, RecommendationResponse, ScoredPlace
from app.services.recommendation.recommendation_service import RecommendationService

router = APIRouter(prefix="/api/places", tags=["places"])
recommender = RecommendationService()


@router.get("", response_model=List[PlaceOut])
def list_places(
    destination: str = None,
    category: str = None,
    db: Session = Depends(get_db),
):
    query = db.query(Place).filter(Place.is_active == True)
    if destination:
        query = query.filter(Place.destination == destination)
    if category:
        query = query.filter(Place.category == category)
    places = query.all()
    return [_place_out(p) for p in places]


@router.get("/{place_id}", response_model=PlaceOut)
def get_place(place_id: int, db: Session = Depends(get_db)):
    place = db.query(Place).filter(Place.id == place_id).first()
    if not place:
        raise HTTPException(status_code=404, detail="Place not found")
    return _place_out(place)


@router.post("/recommendations", response_model=RecommendationResponse)
def get_recommendations(req: RecommendationRequest, db: Session = Depends(get_db)):
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
    # Count all available places for meta
    total = db.query(Place).filter(Place.destination == req.destination, Place.is_active == True).count()
    return RecommendationResponse(
        recommendations=scored,
        total_considered=total,
    )


def _place_out(p: Place) -> PlaceOut:
    d = {c.name: getattr(p, c.name) for c in p.__table__.columns}
    d["tags"] = p.tags
    return PlaceOut(**d)

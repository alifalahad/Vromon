from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import List

from app.database import get_db
from app.models.models import Place, Restaurant, Hotel
from app.schemas.schemas import PlaceOut, RestaurantOut, HotelOut

router = APIRouter(prefix="/api/destinations", tags=["destinations"])


@router.get("", response_model=List[dict])
def list_destinations(db: Session = Depends(get_db)):
    """Return a list of available destinations."""
    destinations = db.query(Place.destination).distinct().all()
    result = []
    for (dest,) in destinations:
        place_count = db.query(Place).filter(Place.destination == dest).count()
        result.append({"name": dest, "place_count": place_count})
    return result


@router.get("/{destination}/places", response_model=List[PlaceOut])
def get_places(destination: str, db: Session = Depends(get_db)):
    places = db.query(Place).filter(
        Place.destination == destination,
        Place.is_active == True
    ).all()
    # Manually resolve tags
    out = []
    for p in places:
        d = {c.name: getattr(p, c.name) for c in p.__table__.columns}
        d["tags"] = p.tags
        out.append(PlaceOut(**d))
    return out


@router.get("/{destination}/restaurants", response_model=List[RestaurantOut])
def get_restaurants(destination: str, db: Session = Depends(get_db)):
    restaurants = db.query(Restaurant).filter(
        Restaurant.destination == destination,
        Restaurant.is_active == True
    ).all()
    out = []
    for r in restaurants:
        d = {c.name: getattr(r, c.name) for c in r.__table__.columns}
        d["tags"] = r.tags
        out.append(RestaurantOut(**d))
    return out


@router.get("/{destination}/hotels", response_model=List[HotelOut])
def get_hotels(destination: str, db: Session = Depends(get_db)):
    hotels = db.query(Hotel).filter(
        Hotel.destination == destination,
        Hotel.is_active == True
    ).all()
    out = []
    for h in hotels:
        d = {c.name: getattr(h, c.name) for c in h.__table__.columns}
        d["amenities"] = h.amenities
        out.append(HotelOut(**d))
    return out

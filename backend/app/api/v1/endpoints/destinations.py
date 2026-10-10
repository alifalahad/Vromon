"""
Vromon API v1 — Destinations endpoints.
"""

from __future__ import annotations

from typing import List
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db import get_db
from app.models.models import Destination, Place, Restaurant, Hotel
from app.schemas.schemas import DestinationOut, PlaceOut, RestaurantOut, HotelOut

router = APIRouter(prefix="/destinations", tags=["destinations"])


@router.get("", response_model=List[DestinationOut])
def list_destinations(db: Session = Depends(get_db)):
    """Return a list of available destinations with place counts."""
    destinations = db.query(Destination).filter(Destination.is_active == True).all()
    result = []
    for dest in destinations:
        place_count = db.query(Place).filter(
            Place.destination_id == dest.id, Place.is_active == True
        ).count()
        result.append(DestinationOut(
            id=dest.id,
            name=dest.name,
            country=dest.country,
            description=dest.description,
            latitude=dest.latitude,
            longitude=dest.longitude,
            image_url=dest.image_url,
            place_count=place_count,
        ))
    return result


@router.get("/{destination_id}", response_model=DestinationOut)
def get_destination(destination_id: int, db: Session = Depends(get_db)):
    """Return a single destination by ID."""
    dest = db.query(Destination).filter(Destination.id == destination_id).first()
    if not dest:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Destination not found")
    place_count = db.query(Place).filter(
        Place.destination_id == dest.id, Place.is_active == True
    ).count()
    return DestinationOut(
        id=dest.id,
        name=dest.name,
        country=dest.country,
        description=dest.description,
        latitude=dest.latitude,
        longitude=dest.longitude,
        image_url=dest.image_url,
        place_count=place_count,
    )


@router.get("/{destination_id}/places", response_model=List[PlaceOut])
def get_destination_places(destination_id: int, db: Session = Depends(get_db)):
    """Return places for a destination."""
    dest = db.query(Destination).filter(Destination.id == destination_id).first()
    if not dest:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Destination not found")
    places = db.query(Place).filter(
        Place.destination_id == dest.id, Place.is_active == True
    ).all()
    return [_place_out(p) for p in places]


@router.get("/{destination_id}/restaurants", response_model=List[RestaurantOut])
def get_destination_restaurants(destination_id: int, db: Session = Depends(get_db)):
    """Return restaurants for a destination."""
    dest = db.query(Destination).filter(Destination.id == destination_id).first()
    if not dest:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Destination not found")
    restaurants = db.query(Restaurant).filter(
        Restaurant.destination_id == dest.id, Restaurant.is_active == True
    ).all()
    return [_restaurant_out(r) for r in restaurants]


@router.get("/{destination_id}/hotels", response_model=List[HotelOut])
def get_destination_hotels(destination_id: int, db: Session = Depends(get_db)):
    """Return hotels for a destination."""
    dest = db.query(Destination).filter(Destination.id == destination_id).first()
    if not dest:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Destination not found")
    hotels = db.query(Hotel).filter(
        Hotel.destination_id == dest.id, Hotel.is_active == True
    ).all()
    return [_hotel_out(h) for h in hotels]


# ---------------------------------------------------------------------------
# Serialization helpers
# ---------------------------------------------------------------------------

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


def _restaurant_out(r: Restaurant) -> RestaurantOut:
    return RestaurantOut(
        id=r.id,
        name=r.name,
        destination_name=r.destination_name,
        cuisine=r.cuisine,
        price_level=r.price_level,
        rating=r.rating,
        review_count=r.review_count,
        latitude=r.latitude,
        longitude=r.longitude,
        average_meal_cost=r.average_meal_cost,
        currency=r.currency,
        opening_time=r.opening_time,
        closing_time=r.closing_time,
        tags=r.tags,
        description=r.description,
    )


def _hotel_out(h: Hotel) -> HotelOut:
    return HotelOut(
        id=h.id,
        name=h.name,
        destination_name=h.destination_name,
        category=h.category,
        price_per_night=h.price_per_night,
        currency=h.currency,
        rating=h.rating,
        review_count=h.review_count,
        latitude=h.latitude,
        longitude=h.longitude,
        description=h.description,
        amenities=h.amenities,
    )

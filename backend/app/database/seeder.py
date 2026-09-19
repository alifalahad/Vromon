"""
Database seeder — loads Cox's Bazar sample data on first run.
"""

import json
import os
from pathlib import Path
from sqlalchemy.orm import Session
from app.models.models import Place, Restaurant, Hotel


DATA_FILE = Path(__file__).parent.parent.parent / "data" / "coxsbazar.json"


def seed_database(db: Session):
    """Seed database with Cox's Bazar demo data if not already seeded."""
    if db.query(Place).count() > 0:
        return  # Already seeded

    with open(DATA_FILE, "r") as f:
        data = json.load(f)

    # Seed Places
    for p in data["places"]:
        place = Place(
            id=p["id"],
            name=p["name"],
            destination=p["destination"],
            category=p["category"],
            description=p.get("description"),
            latitude=p["latitude"],
            longitude=p["longitude"],
            rating=p.get("rating", 4.0),
            review_count=p.get("review_count", 0),
            average_visit_duration=p.get("average_visit_duration", 1.5),
            estimated_cost=p.get("estimated_cost", 0.0),
            opening_time=p.get("opening_time", "08:00"),
            closing_time=p.get("closing_time", "18:00"),
            best_time=p.get("best_time"),
            crowd_level=p.get("crowd_level", "Medium"),
            activity_level=p.get("activity_level", "Medium"),
        )
        place.tags = p.get("tags", [])
        db.add(place)

    # Seed Restaurants
    for r in data["restaurants"]:
        restaurant = Restaurant(
            id=r["id"],
            name=r["name"],
            destination=r["destination"],
            cuisine=r.get("cuisine"),
            price_level=r.get("price_level", "Medium"),
            rating=r.get("rating", 4.0),
            review_count=r.get("review_count", 0),
            latitude=r["latitude"],
            longitude=r["longitude"],
            average_meal_cost=r.get("average_meal_cost", 300.0),
            opening_time=r.get("opening_time", "07:00"),
            closing_time=r.get("closing_time", "22:00"),
            description=r.get("description"),
        )
        restaurant.tags = r.get("tags", [])
        db.add(restaurant)

    # Seed Hotels
    for h in data["hotels"]:
        hotel = Hotel(
            id=h["id"],
            name=h["name"],
            destination=h["destination"],
            category=h.get("category", "Standard"),
            price_per_night=h.get("price_per_night", 3000.0),
            rating=h.get("rating", 4.0),
            review_count=h.get("review_count", 0),
            latitude=h["latitude"],
            longitude=h["longitude"],
            description=h.get("description"),
        )
        hotel.amenities = h.get("amenities", [])
        db.add(hotel)

    db.commit()
    print("✅ Database seeded with Cox's Bazar demo data.")

"""
Vromon Backend — Database seeder.

Loads Cox's Bazar sample data from seed files.
Idempotent: skips if data already exists.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from sqlalchemy.orm import Session

from app.models.models import Destination, Place, Restaurant, Hotel

logger = logging.getLogger("vromon.seeder")

# Seed data path relative to the repository root
SEED_DATA_DIR = Path(__file__).parent.parent.parent.parent / "data" / "seed"

# Place fields the planners and validator rely on. The schema cannot store "unknown"
# for them (NOT NULL with defaults), so a record without them would silently get an
# invented price or opening hours. The seeder warns about such records.
REQUIRED_PLACE_FIELDS = ("estimated_cost", "opening_time", "closing_time")


def missing_place_fields(record: dict) -> list[str]:
    """Required place fields absent (or null) in a seed record."""
    return [f for f in REQUIRED_PLACE_FIELDS if record.get(f) is None]


def seed_database(db: Session) -> None:
    """Seed database with Cox's Bazar demo data if not already seeded."""

    # Check if already seeded
    if db.query(Destination).count() > 0:
        logger.info("Database already seeded — skipping.")
        return

    coxsbazar_file = SEED_DATA_DIR / "coxsbazar.json"
    if not coxsbazar_file.exists():
        logger.warning(f"Seed file not found: {coxsbazar_file}")
        return

    with open(coxsbazar_file, "r", encoding="utf-8") as f:
        data = json.load(f)

    destination_name = data.get("destination", "Cox's Bazar")
    info = data.get("destination_info", {})

    # Create Destination record (descriptive text comes from the seed file, not code)
    dest = Destination(
        id=1,
        name=destination_name,
        country=info.get("country", "Bangladesh"),
        description=info.get("description"),
        latitude=info.get("latitude", 0.0),
        longitude=info.get("longitude", 0.0),
    )
    db.add(dest)
    db.flush()

    # Seed Places
    for p in data.get("places", []):
        missing = missing_place_fields(p)
        if missing:
            logger.warning(
                "Place %r has no %s in the seed file; the schema default will be used and is NOT real data.",
                p.get("name"), ", ".join(missing),
            )
        place = Place(
            id=p["id"],
            name=p["name"],
            destination_id=dest.id,
            destination_name=destination_name,
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
            image_url=p.get("image_url"),
        )
        place.tags = p.get("tags", [])
        db.add(place)

    # Seed Restaurants
    for r in data.get("restaurants", []):
        restaurant = Restaurant(
            id=r["id"],
            name=r["name"],
            destination_id=dest.id,
            destination_name=destination_name,
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
    for h in data.get("hotels", []):
        hotel = Hotel(
            id=h["id"],
            name=h["name"],
            destination_id=dest.id,
            destination_name=destination_name,
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
    logger.info(
        f"[OK] Database seeded with {destination_name} data: "
        f"{len(data.get('places', []))} places, "
        f"{len(data.get('restaurants', []))} restaurants, "
        f"{len(data.get('hotels', []))} hotels."
    )

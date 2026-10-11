"""
Vromon RAG — Source document text chunker.

Splits structured place/restaurant/hotel records into retrievable text chunks,
preserving source metadata on every chunk for traceability.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass, field
from typing import Any


@dataclass
class RawChunk:
    """An individual text chunk before embedding."""
    text: str
    source_title: str
    source_type: str          # place / restaurant / hotel / destination
    destination: str
    place_name: str | None = None
    category: str | None = None
    tags: list[str] = field(default_factory=list)
    url: str | None = None
    content_hash: str = ""

    def __post_init__(self):
        if not self.content_hash:
            self.content_hash = hashlib.sha256(self.text.encode()).hexdigest()


def _chunk_place(place: dict[str, Any], destination: str) -> list[RawChunk]:
    """Turn a place record into 1–2 text chunks."""
    chunks: list[RawChunk] = []

    # Main descriptive chunk
    tags = ", ".join(place.get("tags", []))
    main_text = (
        f"{place['name']} is a {place.get('category', 'attraction')} in {destination}. "
        f"{place.get('description', '')} "
        f"Rating: {place.get('rating', 'N/A')} based on {place.get('review_count', 0)} reviews. "
        f"Best time to visit: {place.get('best_time', 'any time')}. "
        f"Crowd level: {place.get('crowd_level', 'unknown')}. "
        f"Activity level: {place.get('activity_level', 'unknown')}. "
        f"Average visit duration: {place.get('average_visit_duration', 'N/A')} hours. "
        f"Estimated cost: ৳{place.get('estimated_cost', 0)}. "
        f"Opening hours: {place.get('opening_time', 'N/A')} – {place.get('closing_time', 'N/A')}. "
        f"Tags: {tags}."
    )
    chunks.append(RawChunk(
        text=main_text.strip(),
        source_title=place["name"],
        source_type="place",
        destination=destination,
        place_name=place["name"],
        category=place.get("category"),
        tags=place.get("tags", []),
    ))

    return chunks


def _chunk_restaurant(restaurant: dict[str, Any], destination: str) -> list[RawChunk]:
    tags = ", ".join(restaurant.get("tags", []))
    text = (
        f"{restaurant['name']} is a restaurant in {destination} serving {restaurant.get('cuisine', 'local')} cuisine. "
        f"{restaurant.get('description', '')} "
        f"Price level: {restaurant.get('price_level', 'N/A')}. "
        f"Average meal cost: ৳{restaurant.get('average_meal_cost', 'N/A')}. "
        f"Rating: {restaurant.get('rating', 'N/A')} from {restaurant.get('review_count', 0)} reviews. "
        f"Opening hours: {restaurant.get('opening_time', 'N/A')} – {restaurant.get('closing_time', 'N/A')}. "
        f"Tags: {tags}."
    )
    return [RawChunk(
        text=text.strip(),
        source_title=restaurant["name"],
        source_type="restaurant",
        destination=destination,
        place_name=restaurant["name"],
        category="Restaurant",
        tags=restaurant.get("tags", []),
    )]


def _chunk_hotel(hotel: dict[str, Any], destination: str) -> list[RawChunk]:
    amenities = ", ".join(hotel.get("amenities", []))
    text = (
        f"{hotel['name']} is a {hotel.get('category', 'hotel')} accommodation in {destination}. "
        f"{hotel.get('description', '')} "
        f"Price per night: ৳{hotel.get('price_per_night', 'N/A')}. "
        f"Rating: {hotel.get('rating', 'N/A')} from {hotel.get('review_count', 0)} reviews. "
        f"Amenities: {amenities}."
    )
    return [RawChunk(
        text=text.strip(),
        source_title=hotel["name"],
        source_type="hotel",
        destination=destination,
        place_name=hotel["name"],
        category=hotel.get("category"),
        tags=["Accommodation", hotel.get("category", "Hotel")],
    )]


def _chunk_destination(data: dict[str, Any]) -> list[RawChunk]:
    """Create a destination-level overview chunk."""
    destination = data["destination"]
    num_places = len(data.get("places", []))
    categories = list({p.get("category", "") for p in data.get("places", [])})
    info = data.get("destination_info", {})
    # Only facts from the seed file plus computed counts — no hard-coded claims.
    text = (
        f"{destination} is a travel destination in {info.get('country', 'an unspecified country')}. "
        f"The dataset lists {num_places} attractions in these categories: {', '.join(sorted(filter(None, categories)))}. "
        f"{info.get('description', '')}"
    )
    return [RawChunk(
        text=text.strip(),
        source_title=f"{destination} — Overview",
        source_type="destination",
        destination=destination,
        category="Destination",
        tags=["Destination", "Overview"],
    )]


def chunk_seed_data(data: dict[str, Any]) -> list[RawChunk]:
    """
    Chunk all records from a seed JSON file.

    Returns a flat list of RawChunks ready for embedding.
    """
    destination = data.get("destination", "Unknown")
    chunks: list[RawChunk] = []

    # Destination overview
    chunks.extend(_chunk_destination(data))

    # Places
    for place in data.get("places", []):
        chunks.extend(_chunk_place(place, destination))

    # Restaurants
    for restaurant in data.get("restaurants", []):
        chunks.extend(_chunk_restaurant(restaurant, destination))

    # Hotels
    for hotel in data.get("hotels", []):
        chunks.extend(_chunk_hotel(hotel, destination))

    return chunks

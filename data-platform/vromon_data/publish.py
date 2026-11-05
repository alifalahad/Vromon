"""
Publishing approved catalog records into the app's existing tables (plan D1), so the trip
planner, recommendations and mobile app use them without changes.

Attractions → `places`:
  - only `published` attractions, in districts that are an app destination (a trip town
    whose name matches the district's); others are listed as unmapped
  - an attraction the app already has from data/destinations/*.json (same Wikidata id) is
    linked, not duplicated
  - otherwise a place row is written with source_ref "catalog:<slug>"; unknown price,
    hours and rating stay unknown (the app's *_known flags), never guessed
  - an attraction that stops being published hides its place (is_active False); trips
    that point to it keep working
  - Cox's Bazar's demo places (owner's decision, 2026-11-04): hidden once the destination
    has at least one published catalog place

Hotels and restaurants (service places) → `hotels`, `restaurants`:
  - only `published` ones with a location within SERVICE_RADIUS_KM of a destination's centre
    (the planner picks meals before it knows the day's route, so they must be in town)
  - a hotel's price is its lowest published room rate in taka, as the hotel states it; no
    rate, price unknown. Its level: the ministry's 5 stars or a rate over 8,000 is Luxury,
    a rate under 3,000 Budget, otherwise Standard
  - a restaurant's meal cost and hours stay unknown
  - the demo hotels and restaurants (no source_ref) are hidden once real ones are published
"""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.destinations import (CATALOG_REF_PREFIX, DATA_DIR, NEUTRAL_RATING, UNKNOWN_HOURS, UNKNOWN_MEAL_COST,
                                  UNKNOWN_MEAL_HOURS)
from app.models.catalog import (AdminUnit, Attraction, AttractionCategory, EntityExternalId, PriceObservation,
                                ServicePlace, VerificationEvent)
from app.models.models import Destination, Hotel, Place, Restaurant
from vromon_data.geo import haversine_km
from vromon_data.text import name_similarity

DEMO_DESTINATIONS = {"Cox's Bazar"}
VISIT_HOURS = {"Culture": 1.0, "History": 1.5, "Nature": 2.5, "Family": 1.5, "Beach": 2.0, "Scenic": 1.0, "Shopping": 1.5}
ACTIVITY = {"Nature": "High", "Beach": "Medium", "History": "Medium", "Culture": "Low", "Family": "Low", "Scenic": "Low",
            "Shopping": "Low"}


def _destination_for(session: Session, district: AdminUnit, destinations: list[Destination]) -> Destination | None:
    best = max(destinations, key=lambda d: name_similarity(d.name, district.name_en), default=None)
    return best if best is not None and name_similarity(best.name, district.name_en) >= 90 else None


def _file_places_by_qid(directory: Path = DATA_DIR) -> dict[str, str]:
    """Wikidata id → source_ref of places the app loads from data/destinations/*.json."""
    out: dict[str, str] = {}
    for p in directory.glob("*.json"):
        if p.name == "sources.json":
            continue
        for r in json.loads(p.read_text(encoding="utf-8")).get("places", []):
            if r.get("wikidata"):
                out[r["wikidata"]] = r["ref"]
    return out


def publish_places(session: Session, *, dry_run: bool = False) -> dict:
    counts = {"written": 0, "updated": 0, "linked_existing": 0, "hidden": 0, "demo_hidden": 0, "unmapped_district": 0}
    destinations = list(session.scalars(select(Destination).where(Destination.is_active.is_(True))))
    app_cat = dict(session.execute(select(AttractionCategory.code, AttractionCategory.app_category)).all())
    file_refs = _file_places_by_qid()
    unmapped: set[str] = set()
    published_dest: set[int] = set()

    for a in session.scalars(select(Attraction)):
        ref = f"{CATALOG_REF_PREFIX}{a.slug}"
        place = session.scalar(select(Place).where(Place.source_ref == ref))
        if a.status != "published":
            if place is not None and place.is_active:
                place.is_active = False
                counts["hidden"] += 1
            continue
        district = session.get(AdminUnit, a.district_id) if a.district_id else None
        dest = _destination_for(session, district, destinations) if district else None
        if dest is None:
            unmapped.add(district.name_en if district else "?")
            counts["unmapped_district"] += 1
            continue
        qid = session.scalar(select(EntityExternalId.external_id).where(
            EntityExternalId.entity_type == "attraction", EntityExternalId.entity_id == a.id,
            EntityExternalId.provider == "wikidata"))
        existing_ref = file_refs.get(qid) if qid else None
        existing = session.scalar(select(Place).where(Place.destination_id == dest.id, Place.source_ref == existing_ref)) \
            if existing_ref else None
        if existing is not None:
            if not session.scalar(select(EntityExternalId.id).where(EntityExternalId.provider == "app_place",
                                                                    EntityExternalId.external_id == str(existing.id))):
                session.add(EntityExternalId(entity_type="attraction", entity_id=a.id, provider="app_place",
                                             external_id=str(existing.id), source_id="vromon_curated"))
            counts["linked_existing"] += 1
            published_dest.add(dest.id)
            continue
        category = app_cat.get(a.category_code or "", "Scenic")
        new = place is None
        if new:
            place = Place(destination_id=dest.id, source_ref=ref)
            session.add(place)
        place.destination_id, place.destination_name = dest.id, dest.name
        place.name = a.canonical_name_en or a.canonical_name_bn
        place.category = category
        place.description = a.short_description_en or a.description_en
        place.latitude, place.longitude = a.latitude, a.longitude
        place.source = "catalog"
        place.url = f"https://www.wikidata.org/wiki/{qid}" if qid else a.official_website
        place.checked = True                      # a person approved it
        place.cost_known = a.entry_fee_amount is not None
        place.estimated_cost = float(a.entry_fee_amount) if place.cost_known else 0.0
        place.hours_known = False                 # opening hours aren't in the catalog yet
        place.opening_time, place.closing_time = UNKNOWN_HOURS
        place.rating_known, place.rating, place.review_count = False, NEUTRAL_RATING, 0
        place.average_visit_duration = float(a.recommended_visit_duration or VISIT_HOURS.get(category, 1.5))
        place.activity_level = ACTIVITY.get(category, "Medium")
        place.crowd_level = "Medium"
        place.tags = [category]
        place.is_active = True
        counts["written" if new else "updated"] += 1
        published_dest.add(dest.id)
        if new:
            session.add(VerificationEvent(entity_type="attraction", entity_id=a.id, method="publish_to_places",
                                          reason=f"place for {dest.name}"))

    # Demo data: hidden (not deleted) once checked places exist for that destination
    for dest in destinations:
        if dest.name in DEMO_DESTINATIONS and dest.id in published_dest:
            for p in session.scalars(select(Place).where(Place.destination_id == dest.id, Place.source_ref.is_(None),
                                                         Place.is_active.is_(True))):
                p.is_active = False
                counts["demo_hidden"] += 1

    counts["unmapped_districts"] = sorted(unmapped)
    counts["at"] = datetime.utcnow().isoformat(timespec="seconds")
    if dry_run:
        session.rollback()
    else:
        session.commit()
    return counts


SERVICE_RADIUS_KM = 6.0
LUXURY_FROM, BUDGET_UNDER = 8000.0, 3000.0


def _room_rates(session: Session) -> dict:
    """Each hotel's lowest published room rate in taka."""
    out: dict = {}
    for pid, amount in session.execute(
            select(PriceObservation.service_place_id, PriceObservation.amount_min).where(
                PriceObservation.price_kind == "rack_rate", PriceObservation.status == "published",
                PriceObservation.currency == "BDT", PriceObservation.service_place_id.isnot(None))):
        if amount is not None and (pid not in out or amount < out[pid]):
            out[pid] = float(amount)
    return out


def _hotel_level(stars: int | None, price: float | None) -> str:
    if stars == 5 or (price is not None and price > LUXURY_FROM):
        return "Luxury"
    if price is not None and price < BUDGET_UNDER:
        return "Budget"
    return "Standard"


def publish_service_places(session: Session, *, dry_run: bool = False) -> dict:
    counts = {"hotels": 0, "restaurants": 0, "priced_hotels": 0, "hidden": 0, "demo_hidden": 0, "out_of_town": 0}
    destinations = list(session.scalars(select(Destination).where(Destination.is_active.is_(True))))
    rates = _room_rates(session)
    published_dest: dict[type, set[int]] = {Hotel: set(), Restaurant: set()}

    for sp in session.scalars(select(ServicePlace).where(ServicePlace.kind.in_(("accommodation", "food")))):
        model = Hotel if sp.kind == "accommodation" else Restaurant
        ref = f"{CATALOG_REF_PREFIX}{sp.slug}"
        row = session.scalar(select(model).where(model.source_ref == ref))
        near = None
        if sp.status == "published" and sp.latitude is not None:
            dist, near = min(((haversine_km(d.latitude, d.longitude, sp.latitude, sp.longitude), d) for d in destinations),
                             key=lambda x: x[0], default=(None, None))
            if dist is None or dist > SERVICE_RADIUS_KM:
                near = None
                counts["out_of_town"] += 1
        if near is None:
            if row is not None and row.is_active:
                row.is_active = False
                counts["hidden"] += 1
            continue
        if row is None:
            row = model(source_ref=ref)
            session.add(row)
        row.destination_id, row.destination_name = near.id, near.name
        row.name = sp.name_en or sp.name_bn
        row.latitude, row.longitude = sp.latitude, sp.longitude
        row.description = sp.address
        row.source, row.checked, row.is_active = "catalog", True, True
        row.rating_known, row.rating, row.review_count = False, NEUTRAL_RATING, 0
        if model is Hotel:
            price = rates.get(sp.id)
            row.price_known = price is not None
            row.price_per_night = price if price is not None else 0.0
            row.category = _hotel_level(sp.official_star_rating, price)
            row.amenities = []
            counts["hotels"] += 1
            counts["priced_hotels"] += row.price_known
        else:
            row.cuisine = sp.category
            row.cost_known, row.average_meal_cost, row.price_level = False, UNKNOWN_MEAL_COST, "Medium"
            row.hours_known = False
            row.opening_time, row.closing_time = UNKNOWN_MEAL_HOURS
            row.tags = [sp.category] if sp.category else []
            counts["restaurants"] += 1
        published_dest[model].add(near.id)

    # Demo hotels and restaurants: hidden (not deleted) once real ones exist in that destination
    for model, dest_ids in published_dest.items():
        for row in session.scalars(select(model).where(model.destination_id.in_(dest_ids), model.source_ref.is_(None),
                                                       model.is_active.is_(True))):
            row.is_active = False
            counts["demo_hidden"] += 1

    counts["at"] = datetime.utcnow().isoformat(timespec="seconds")
    if dry_run:
        session.rollback()
    else:
        session.commit()
    return counts

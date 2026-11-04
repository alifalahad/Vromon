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
"""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.destinations import CATALOG_REF_PREFIX, DATA_DIR, NEUTRAL_RATING, UNKNOWN_HOURS
from app.models.catalog import AdminUnit, Attraction, AttractionCategory, EntityExternalId, VerificationEvent
from app.models.models import Destination, Place
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

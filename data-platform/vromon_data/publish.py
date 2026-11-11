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
  - a town that isn't a district (Kuakata, Sreemangal) also gets the published attractions
    within TOWN_RADIUS_KM of it (a day out from there), as rows of its own
    (source_ref "catalog:<slug>@<town>"), the attraction staying where it is too

Hotels and restaurants (service places) → `hotels`, `restaurants`:
  - only `published` ones with a location within SERVICE_RADIUS_KM of a destination's centre
    (the planner picks meals before it knows the day's route, so they must be in town)
  - a hotel's price is its lowest published room rate in taka, as the hotel states it; no
    rate, price unknown. Its level: the ministry's 5 stars or a rate over 8,000 is Luxury,
    a rate under 3,000 Budget, otherwise Standard
  - a restaurant's meal cost and hours stay unknown
  - the demo hotels and restaurants (no source_ref) are hidden once real ones are published

Districts → `destinations` (publish_destinations), so a trip can start in any district:
  - one per district with a published attraction, named as the district, at its largest
    GeoNames town inside the district's boundary (its headquarters, as a rule), else its centre;
    a destination of the same name is reused (towns like Kuakata stay as they are)
  - run before publish_places and publish_service_places, which fill them
  - tidy_destinations, after those two: where a destination has reviewed catalog rows, its
    older unreviewed imports (Wikivoyage, Wikidata) are hidden and it counts as checked; the
    demo rows (source "curated") are deleted unless a saved trip still uses them (then hidden)
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
from app.models.catalog import AdminBoundary
from app.models.models import City, Destination, Hotel, ItineraryItem, Place, Restaurant, TripPreference
from vromon_data.geo import haversine_km, load as load_geometry
from vromon_data.text import match_key, name_similarity

DEMO_DESTINATIONS = {"Cox's Bazar"}
TOWN_RADIUS_KM = 25.0
VISIT_HOURS = {"Culture": 1.0, "History": 1.5, "Nature": 2.5, "Family": 1.5, "Beach": 2.0, "Scenic": 1.0, "Shopping": 1.5}
ACTIVITY = {"Nature": "High", "Beach": "Medium", "History": "Medium", "Culture": "Low", "Family": "Low", "Scenic": "Low",
            "Shopping": "Low"}


def _destination_for(session: Session, district: AdminUnit, destinations: list[Destination]) -> Destination | None:
    own = next((d for d in destinations if match_key(d.name) == match_key(district.name_en)), None)
    if own is not None:
        return own
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

    # Towns that aren't districts: the published attractions around them
    districts = list(session.scalars(select(AdminUnit).where(AdminUnit.level == "district")))
    towns = [d for d in destinations if not any(name_similarity(d.name, u.name_en or "") >= 90 for u in districts)]
    for town in towns:
        for a in session.scalars(select(Attraction).where(Attraction.status == "published", Attraction.latitude.isnot(None))):
            if haversine_km(town.latitude, town.longitude, a.latitude, a.longitude) > TOWN_RADIUS_KM:
                continue
            ref = f"{CATALOG_REF_PREFIX}{a.slug}@{town.name.lower().replace(' ', '-')}"
            place = session.scalar(select(Place).where(Place.source_ref == ref))
            new = place is None
            if new:
                place = Place(destination_id=town.id, source_ref=ref)
                session.add(place)
            category = app_cat.get(a.category_code or "", "Scenic")
            qid = session.scalar(select(EntityExternalId.external_id).where(
                EntityExternalId.entity_type == "attraction", EntityExternalId.entity_id == a.id,
                EntityExternalId.provider == "wikidata"))
            place.destination_id, place.destination_name = town.id, town.name
            place.name = a.canonical_name_en or a.canonical_name_bn
            place.category = category
            place.description = a.short_description_en or a.description_en
            place.latitude, place.longitude = a.latitude, a.longitude
            place.source = "catalog"
            place.url = f"https://www.wikidata.org/wiki/{qid}" if qid else a.official_website
            place.checked = True
            place.cost_known = a.entry_fee_amount is not None
            place.estimated_cost = float(a.entry_fee_amount) if place.cost_known else 0.0
            place.hours_known = False
            place.opening_time, place.closing_time = UNKNOWN_HOURS
            place.rating_known, place.rating, place.review_count = False, NEUTRAL_RATING, 0
            place.average_visit_duration = float(a.recommended_visit_duration or VISIT_HOURS.get(category, 1.5))
            place.activity_level = ACTIVITY.get(category, "Medium")
            place.crowd_level = "Medium"
            place.tags = [category]
            place.is_active = True
            counts["town_places"] = counts.get("town_places", 0) + 1
        # An attraction that stops being published hides its town rows too
        for place in session.scalars(select(Place).where(Place.destination_id == town.id,
                                                         Place.source_ref.like(f"{CATALOG_REF_PREFIX}%@%"))):
            slug = place.source_ref[len(CATALOG_REF_PREFIX):].split("@")[0]
            if session.scalar(select(Attraction.status).where(Attraction.slug == slug)) != "published":
                place.is_active = False

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


DISTRICT_SOURCES = [
    {"name": "Bangladesh district boundaries (geoBoundaries / BBS, OCHA)", "license": "CC BY 3.0 IGO",
     "url": "https://www.geoboundaries.org/"},
    {"name": "Vromon catalog: attractions (Wikidata, Bangladesh national portal), reviewed",
     "license": "CC0 1.0 / public", "url": "https://www.wikidata.org/"},
    {"name": "Towns: GeoNames", "license": "CC BY 4.0", "url": "https://www.geonames.org/"},
]


def _seat(session: Session, district: AdminUnit) -> tuple[float, float, str | None]:
    """The district's headquarters: the GeoNames town inside its boundary named as the district
    ("Bogra" for Bogura), else its largest town there, else its centre: (lat, lon, town). By size
    alone, Shibganj (GeoNames gives it its sub-district's 378,701 people) beat Bogra (210,000)."""
    from shapely.geometry import Point
    g = session.scalar(select(AdminBoundary.geometry_geojson).where(AdminBoundary.admin_unit_id == district.id,
                                                                    AdminBoundary.is_current.is_(True)))
    if g:
        outline, _ = load_geometry(json.loads(g))
        minx, miny, maxx, maxy = outline.bounds
        towns = session.scalars(select(City).where(City.country_iso2 == "BD", City.lon.between(minx, maxx),
                                                   City.lat.between(miny, maxy)).order_by(City.population.desc()))
        inside = [t for t in towns if outline.contains(Point(t.lon, t.lat))]
        town = next((t for t in inside if name_similarity(t.name, district.name_en) >= 90), inside[0] if inside else None)
        if town is not None:
            return town.lat, town.lon, town.name
    return district.centroid_lat, district.centroid_lon, None


def publish_destinations(session: Session, *, dry_run: bool = False) -> dict:
    counts = {"written": 0, "reused": 0, "no_attractions": 0}
    with_sights = set(session.scalars(select(Attraction.district_id).where(Attraction.status == "published")))
    divisions = dict(session.execute(
        select(EntityExternalId.entity_id, EntityExternalId.external_id).where(
            EntityExternalId.entity_type == "admin_unit", EntityExternalId.provider == "iso3166-2")).all())
    existing = list(session.scalars(select(Destination)))
    districts = list(session.scalars(select(AdminUnit).where(AdminUnit.country_iso2 == "BD", AdminUnit.level == "district",
                                                             AdminUnit.status == "published").order_by(AdminUnit.name_en)))
    # A destination is one district's: its own name first, then a near spelling no other district
    # has claimed. Near spellings alone glued Bogura onto Bagerhat ("bagara" / "bagarat", 92 %), which
    # put Bagerhat in Rajshahi division, Bogura's sights in Bagerhat, and left Bogura out
    claimed: set[int] = set()
    exact: dict = {}
    for d in districts:
        own = next((x for x in existing if match_key(x.name) == match_key(d.name_en)), None)
        if own is not None:
            exact[d.id] = own
            claimed.add(id(own))
    for d in districts:
        if d.id not in with_sights:
            counts["no_attractions"] += 1
            continue
        same = exact.get(d.id)
        if same is None:
            same = next((x for x in existing if id(x) not in claimed and name_similarity(x.name, d.name_en) >= 90), None)
            if same is not None:
                claimed.add(id(same))
        if same is not None:
            same.is_active = True
            same.country_iso2 = same.country_iso2 or "BD"
            same.region_code = divisions.get(d.parent_id) or same.region_code
            counts["reused"] += 1
            continue
        lat, lon, town = _seat(session, d)
        dest = Destination(name=d.name_en, country="Bangladesh", latitude=lat, longitude=lon, country_iso2="BD",
                           region_code=divisions.get(d.parent_id), checked=True, is_active=True,
                           sources_json=json.dumps(DISTRICT_SOURCES, ensure_ascii=False),
                           attribution="Places, hotels and restaurants from the Vromon catalog (reviewed); centred on "
                                       + (town or "the district centre") + " (GeoNames).")
        session.add(dest)
        existing.append(dest)
        claimed.add(id(dest))
        counts["written"] += 1
    counts["at"] = datetime.utcnow().isoformat(timespec="seconds")
    if dry_run:
        session.rollback()
    else:
        session.commit()
    return counts


def tidy_destinations(session: Session, *, dry_run: bool = False) -> dict:
    counts = {"unreviewed_hidden": 0, "demo_deleted": 0, "demo_kept_for_trips": 0, "checked": 0}
    used = {
        Place: set(session.scalars(select(ItineraryItem.place_id).where(ItineraryItem.place_id.isnot(None)))),
        Restaurant: set(session.scalars(select(ItineraryItem.restaurant_id).where(ItineraryItem.restaurant_id.isnot(None)))),
        Hotel: set(session.scalars(select(TripPreference.hotel_id).where(TripPreference.hotel_id.isnot(None)))),
    }
    # Places the app had from its own files that a reviewed attraction is linked to count as reviewed
    linked = {int(x) for x in session.scalars(select(EntityExternalId.external_id).where(
        EntityExternalId.entity_type == "attraction", EntityExternalId.provider == "app_place"))}
    published = set(session.scalars(select(EntityExternalId.external_id).join(
        Attraction, Attraction.id == EntityExternalId.entity_id).where(
        EntityExternalId.provider == "app_place", Attraction.status == "published")))
    for place in session.scalars(select(Place).where(Place.id.in_(linked))):
        reviewed_link = str(place.id) in published
        if reviewed_link and not (place.checked and place.is_active):
            place.checked, place.is_active = True, True
            counts["linked_reviewed"] = counts.get("linked_reviewed", 0) + 1
    for dest in session.scalars(select(Destination).where(Destination.is_active.is_(True))):
        unreviewed_left = False
        for model in (Place, Hotel, Restaurant):
            rows = list(session.scalars(select(model).where(model.destination_id == dest.id)))
            reviewed = any(r.source == "catalog" and r.is_active for r in rows)
            for r in rows:
                if r.source == "curated" and r.source_ref is None:
                    if r.id in used[model]:
                        r.is_active = False
                        counts["demo_kept_for_trips"] += 1
                    else:
                        session.delete(r)
                        counts["demo_deleted"] += 1
                elif not r.checked and r.is_active:
                    if reviewed:
                        r.is_active = False
                        counts["unreviewed_hidden"] += 1
                    else:
                        unreviewed_left = True
        if not unreviewed_left and not dest.checked:
            dest.checked = True
            counts["checked"] += 1
    counts["at"] = datetime.utcnow().isoformat(timespec="seconds")
    if dry_run:
        session.rollback()
    else:
        session.commit()
    return counts

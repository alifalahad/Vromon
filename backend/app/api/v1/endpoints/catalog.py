"""
Vromon API v1 — the data-platform catalog (public, read-only).

GET /catalog/admin-units?level=&parent=        divisions, districts, sub-districts
GET /catalog/admin-units/{slug}?geometry=      one unit, its neighbours, field sources, outline
GET /catalog/categories
GET /catalog/attractions?district=&category=&q= published attractions only
GET /catalog/attractions/{slug}                one attraction with the source of every field
GET /catalog/sources                           licences and attribution to show in the app
GET /catalog/hubs?type=&district=&q=           transport hubs (stations, terminals, airports, ghats)
GET /catalog/trains?from=&to=&q=               published train services (one row per direction)
GET /catalog/fares?mode=&from=&to=             published fares, each with its kind and checked date
GET /catalog/journeys/plan?from=&to=           district to district: road estimate, trains, airports, fares, gaps
GET /catalog/foods?district=                   GI-registered specialities (DPDT)
GET /catalog/hotels?district=&stars=&q=        hotels (official star rating where listed; else business listing)
GET /catalog/restaurants?district=&q=          restaurants and cafés (business listings)

Every factual field carries where it came from and whether it was verified, so the app
can tell verified, imported and unknown values apart (guideline §1.1, §6.2). Records a
person hasn't approved are never returned.
"""

from __future__ import annotations

import json
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models.catalog import (
    AdminAdjacency, AdminBoundary, AdminUnit, Attraction, AttractionCategory, AttractionMedia, DataSource, FareProduct,
    JourneyCalculation, LocalFood, ServicePlace, TimetableVersion, Train, TrainService, TransportHub,
)
from app.schemas.catalog import (
    AdminUnitDetail, AdminUnitOut, AttractionDetail, AttractionOut, CategoryOut, FareOut, FieldSource, HubOut, PhotoOut,
    FoodOut, JourneyPlan, RoadLeg, ServicePlaceOut, SourceOut, TrainServiceOut,
)

router = APIRouter(prefix="/catalog", tags=["catalog"])
CACHE = "public, max-age=3600"
LEVELS = ("division", "district", "subdistrict")


def _slugs(db: Session, ids) -> dict:
    ids = [i for i in ids if i]
    if not ids:
        return {}
    return dict(db.execute(select(AdminUnit.id, AdminUnit.slug).where(AdminUnit.id.in_(ids))).all())


def _fields(db: Session, field_status: dict) -> dict[str, FieldSource]:
    sources = {s.source_id: s for s in db.scalars(select(DataSource))}
    out = {}
    for field, st in (field_status or {}).items():
        src = sources.get(st.get("source_id"))
        out[field] = FieldSource(status=st.get("status", "unknown"), source=src.source_name if src else None,
                                 license=src.license_name if src else None,
                                 reliability=src.reliability_class if src else None,
                                 retrieved_at=st.get("retrieved_at"), verified_at=st.get("verified_at"),
                                 verification_method=st.get("verification_method"))
    return out


def _unit_out(u: AdminUnit, slugs: dict) -> AdminUnitOut:
    return AdminUnitOut(slug=u.slug, level=u.level, name_en=u.name_en, name_bn=u.name_bn,
                        parent_slug=slugs.get(u.parent_id), centroid_lat=u.centroid_lat, centroid_lon=u.centroid_lon,
                        area_km2=u.area_km2)


@router.get("/admin-units", response_model=List[AdminUnitOut])
def admin_units(response: Response, level: str = Query("district"), parent: Optional[str] = Query(None),
                db: Session = Depends(get_db)):
    if level not in LEVELS:
        raise HTTPException(status_code=422, detail=f"level must be one of {', '.join(LEVELS)}")
    stmt = select(AdminUnit).where(AdminUnit.level == level, AdminUnit.status == "published")
    if parent:
        pid = db.scalar(select(AdminUnit.id).where(AdminUnit.slug == parent))
        if pid is None:
            raise HTTPException(status_code=404, detail="Unknown parent")
        stmt = stmt.where(AdminUnit.parent_id == pid)
    units = db.scalars(stmt.order_by(AdminUnit.name_en)).all()
    slugs = _slugs(db, {u.parent_id for u in units})
    response.headers["Cache-Control"] = CACHE
    return [_unit_out(u, slugs) for u in units]


@router.get("/admin-units/{slug}", response_model=AdminUnitDetail)
def admin_unit(slug: str, response: Response, geometry: bool = False, db: Session = Depends(get_db)):
    u = db.scalar(select(AdminUnit).where(AdminUnit.slug == slug, AdminUnit.status == "published"))
    if u is None:
        raise HTTPException(status_code=404, detail="Not found")
    neighbor_ids = db.scalars(select(AdminAdjacency.neighbor_id).where(AdminAdjacency.unit_id == u.id)).all()
    neighbors = db.scalars(select(AdminUnit).where(AdminUnit.id.in_(neighbor_ids)).order_by(AdminUnit.name_en)).all()
    slugs = _slugs(db, {u.parent_id, *(n.parent_id for n in neighbors)})
    detail = AdminUnitDetail(**_unit_out(u, slugs).model_dump(),
                             neighbors=[_unit_out(n, slugs) for n in neighbors],
                             children_count=db.scalar(select(func.count()).select_from(AdminUnit)
                                                      .where(AdminUnit.parent_id == u.id)) or 0,
                             fields=_fields(db, u.field_status))
    if geometry:
        g = db.scalar(select(AdminBoundary.geometry_geojson).where(AdminBoundary.admin_unit_id == u.id,
                                                                   AdminBoundary.is_current.is_(True)))
        detail.geometry = json.loads(g) if g else None
    response.headers["Cache-Control"] = CACHE
    return detail


@router.get("/categories", response_model=List[CategoryOut])
def categories(response: Response, db: Session = Depends(get_db)):
    response.headers["Cache-Control"] = CACHE
    return db.scalars(select(AttractionCategory).order_by(AttractionCategory.sort_order)).all()


def _attraction_out(a: Attraction, slugs: dict) -> dict:
    return dict(slug=a.slug, name_en=a.canonical_name_en, name_bn=a.canonical_name_bn, category=a.category_code,
                district_slug=slugs.get(a.district_id), subdistrict_slug=slugs.get(a.subdistrict_id),
                latitude=a.latitude, longitude=a.longitude, short_description_en=a.short_description_en,
                short_description_bn=a.short_description_bn)


@router.get("/attractions", response_model=List[AttractionOut])
def attractions(district: Optional[str] = None, category: Optional[str] = None,
                q: Optional[str] = Query(None, min_length=2, max_length=100),
                limit: int = Query(100, ge=1, le=500), db: Session = Depends(get_db)):
    stmt = select(Attraction).where(Attraction.status == "published")
    if district:
        did = db.scalar(select(AdminUnit.id).where(AdminUnit.slug == district))
        if did is None:
            raise HTTPException(status_code=404, detail="Unknown district")
        stmt = stmt.where(Attraction.district_id == did)
    if category:
        stmt = stmt.where(Attraction.category_code == category)
    if q:
        like = f"%{q.strip().lower()}%"
        stmt = stmt.where(or_(func.lower(Attraction.canonical_name_en).like(like), Attraction.canonical_name_bn.like(f"%{q.strip()}%")))
    rows = db.scalars(stmt.order_by(Attraction.canonical_name_en).limit(limit)).all()
    slugs = _slugs(db, {i for a in rows for i in (a.district_id, a.subdistrict_id)})
    return [AttractionOut(**_attraction_out(a, slugs)) for a in rows]


@router.get("/attractions/{slug}", response_model=AttractionDetail)
def attraction(slug: str, db: Session = Depends(get_db)):
    a = db.scalar(select(Attraction).where(Attraction.slug == slug, Attraction.status == "published"))
    if a is None:
        raise HTTPException(status_code=404, detail="Not found")
    slugs = _slugs(db, {a.division_id, a.district_id, a.subdistrict_id})
    fields = _fields(db, a.field_status)
    used = {st.get("source_id") for st in (a.field_status or {}).values() if st.get("source_id")}
    attribution = [s.attribution_text or f"{s.source_name} ({s.license_name})"
                   for s in db.scalars(select(DataSource).where(DataSource.source_id.in_(used)))]
    photos = [PhotoOut(url=m.file_url, thumb_url=m.thumb_url, page_url=m.original_url, width=m.width, height=m.height,
                       license=m.license, license_url=m.license_url, attribution=m.attribution)
              for m in db.scalars(select(AttractionMedia).where(
                  AttractionMedia.attraction_id == a.id,
                  AttractionMedia.approval_status.in_(("auto_approved", "approved"))))]
    return AttractionDetail(**_attraction_out(a, slugs), division_slug=slugs.get(a.division_id), photos=photos,
                            location_precision=a.location_precision, description_en=a.description_en,
                            description_bn=a.description_bn, official_website=a.official_website,
                            heritage_designation=a.heritage_designation, entry_fee_amount=a.entry_fee_amount,
                            entry_fee_currency=a.entry_fee_currency, entry_fee_description=a.entry_fee_description,
                            opening_hours=a.opening_hours, best_visit_months=a.best_visit_months,
                            recommended_visit_duration=a.recommended_visit_duration, fields=fields,
                            attribution=sorted(attribution), updated_at=a.updated_at)


@router.get("/sources", response_model=List[SourceOut])
def sources(response: Response, db: Session = Depends(get_db)):
    response.headers["Cache-Control"] = CACHE
    used = {"production", "enrichment"}
    return db.scalars(select(DataSource).where(DataSource.recommended_use.in_(used)).order_by(DataSource.source_name)).all()


WEEKDAY_EN = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]


@router.get("/hubs", response_model=List[HubOut])
def hubs(type: Optional[str] = None, district: Optional[str] = None, q: Optional[str] = Query(None, min_length=2, max_length=100),
         limit: int = Query(100, ge=1, le=500), db: Session = Depends(get_db)):
    stmt = select(TransportHub).where(TransportHub.status == "published")
    if type:
        stmt = stmt.where(TransportHub.hub_type == type)
    if district:
        did = db.scalar(select(AdminUnit.id).where(AdminUnit.slug == district))
        if did is None:
            raise HTTPException(status_code=404, detail="Unknown district")
        stmt = stmt.where(TransportHub.district_id == did)
    if q:
        stmt = stmt.where(or_(func.lower(TransportHub.name_en).like(f"%{q.strip().lower()}%"),
                              TransportHub.name_bn.like(f"%{q.strip()}%")))
    rows = db.scalars(stmt.order_by(TransportHub.name_en).limit(limit)).all()
    slugs = _slugs(db, {h.district_id for h in rows})
    sources = {s.source_id: s for s in db.scalars(select(DataSource))}
    out = []
    for h in rows:
        src = sources.get((h.field_status or {}).get("latitude", {}).get("source_id"))
        out.append(HubOut(slug=h.slug, hub_type=h.hub_type, name_en=h.name_en, name_bn=h.name_bn, latitude=h.latitude,
                          longitude=h.longitude, district_slug=slugs.get(h.district_id), iata_code=h.iata_code,
                          source=src.source_name if src else None, reliability=src.reliability_class if src else None))
    return out


@router.get("/trains", response_model=List[TrainServiceOut])
def trains(from_: Optional[str] = Query(None, alias="from", description="Origin station as printed in the timetable"),
           to: Optional[str] = None, q: Optional[str] = None, limit: int = Query(200, ge=1, le=500),
           db: Session = Depends(get_db)):
    stmt = (select(TrainService, Train, TimetableVersion)
            .join(Train, Train.id == TrainService.train_id)
            .join(TimetableVersion, TimetableVersion.id == TrainService.timetable_version_id)
            .where(TrainService.status == "published", TimetableVersion.status == "published"))
    if from_:
        stmt = stmt.where(TrainService.origin_name == from_.strip())
    if to:
        stmt = stmt.where(TrainService.destination_name == to.strip())
    if q:
        stmt = stmt.where(or_(Train.train_number == q.strip(), Train.name_bn.like(f"%{q.strip()}%")))
    hub_slugs = dict(db.execute(select(TransportHub.id, TransportHub.slug)).all())
    out = []
    for svc, train, version in db.execute(stmt.order_by(TrainService.departure_time).limit(limit)).all():
        out.append(TrainServiceOut(
            train_number=train.train_number, train_name_bn=train.name_bn, origin=svc.origin_name,
            destination=svc.destination_name, origin_hub_slug=hub_slugs.get(svc.origin_hub_id),
            destination_hub_slug=hub_slugs.get(svc.destination_hub_id), departure_time=svc.departure_time,
            arrival_time=svc.arrival_time,
            arrives_next_day=bool(svc.arrival_day_offset) if svc.arrival_day_offset is not None else None,
            off_day=WEEKDAY_EN[svc.off_day] if svc.off_day is not None else None, runs_daily=svc.runs_daily,
            timetable=version.name, effective_from=version.effective_from.isoformat() if version.effective_from else None,
            timezone=version.timezone, source_url=version.source_url))
    return out


@router.get("/fares", response_model=List[FareOut])
def fares(mode: Optional[str] = None, from_: Optional[str] = Query(None, alias="from"), to: Optional[str] = None,
          limit: int = Query(200, ge=1, le=1000), db: Session = Depends(get_db)):
    stmt = select(FareProduct).where(FareProduct.status == "published")
    if mode:
        stmt = stmt.where(FareProduct.mode == mode)
    if from_:
        stmt = stmt.where(FareProduct.origin_name == from_.strip())
    if to:
        stmt = stmt.where(FareProduct.destination_name == to.strip())
    rows = db.scalars(stmt.order_by(FareProduct.origin_name, FareProduct.destination_name, FareProduct.amount).limit(limit)).all()
    return [FareOut(mode=f.mode, origin=f.origin_name, destination=f.destination_name, fare_class=f.fare_class,
                    fare_class_label=f.fare_class_label, amount=f.amount, currency=f.currency, base_amount=f.base_amount,
                    vat_amount=f.vat_amount, fare_type=f.fare_type, official_distance_km=f.official_distance_km,
                    effective_from=f.effective_from.isoformat() if f.effective_from else None,
                    last_checked_at=f.last_checked_at, source_url=f.source_url, notes=f.notes) for f in rows]


@router.get("/journeys/plan", response_model=JourneyPlan)
def journey_plan(from_: str = Query(..., alias="from", description="Origin district slug"),
                 to: str = Query(..., description="Destination district slug"), db: Session = Depends(get_db)):
    """What Vromon knows about getting from one district to another, mode by mode. Nothing is combined
    into one unexplained number, and every gap is listed in `missing`."""
    units = {u.slug: u for u in db.scalars(select(AdminUnit).where(AdminUnit.slug.in_([from_, to]),
                                                                    AdminUnit.level == "district"))}
    if from_ not in units or to not in units:
        raise HTTPException(status_code=404, detail="Unknown district")
    a, b = units[from_], units[to]
    slugs = _slugs(db, {a.parent_id, b.parent_id})
    plan = JourneyPlan(origin=_unit_out(a, slugs), destination=_unit_out(b, slugs))
    j = db.scalar(select(JourneyCalculation).where(JourneyCalculation.origin_ref == f"admin_unit:{from_}",
                                                   JourneyCalculation.destination_ref == f"admin_unit:{to}",
                                                   JourneyCalculation.mode == "road")
                  .order_by(JourneyCalculation.calculated_at.desc()))
    if j is not None and j.distance_km is not None:
        plan.road = RoadLeg(distance_km=j.distance_km, duration_min=j.duration_min, engine=j.engine, profile=j.profile,
                            network_version=j.network_version, calculated_at=j.calculated_at)
    else:
        plan.missing.append("road: no calculated road journey between these districts")
    hubs_a = {h.id: h for h in db.scalars(select(TransportHub).where(TransportHub.district_id == a.id,
                                                                     TransportHub.status == "published"))}
    hubs_b = {h.id: h for h in db.scalars(select(TransportHub).where(TransportHub.district_id == b.id,
                                                                     TransportHub.status == "published"))}
    rows = db.execute(select(TrainService, Train, TimetableVersion)
                      .join(Train, Train.id == TrainService.train_id)
                      .join(TimetableVersion, TimetableVersion.id == TrainService.timetable_version_id)
                      .where(TrainService.status == "published", TimetableVersion.status == "published",
                             TrainService.origin_hub_id.in_(list(hubs_a) or [None]),
                             TrainService.destination_hub_id.in_(list(hubs_b) or [None]))
                      .order_by(TrainService.departure_time)).all()
    for svc, train, version in rows:
        plan.trains.append(TrainServiceOut(
            train_number=train.train_number, train_name_bn=train.name_bn, origin=svc.origin_name,
            destination=svc.destination_name, origin_hub_slug=hubs_a[svc.origin_hub_id].slug,
            destination_hub_slug=hubs_b[svc.destination_hub_id].slug, departure_time=svc.departure_time,
            arrival_time=svc.arrival_time,
            arrives_next_day=bool(svc.arrival_day_offset) if svc.arrival_day_offset is not None else None,
            off_day=WEEKDAY_EN[svc.off_day] if svc.off_day is not None else None, runs_daily=svc.runs_daily,
            timetable=version.name, effective_from=version.effective_from.isoformat() if version.effective_from else None,
            timezone=version.timezone, source_url=version.source_url))
    if not plan.trains:
        plan.missing.append("train: no published direct train between stations of these districts")

    def airports(hubs):
        return [HubOut(slug=h.slug, hub_type=h.hub_type, name_en=h.name_en, name_bn=h.name_bn, latitude=h.latitude,
                       longitude=h.longitude, iata_code=h.iata_code) for h in hubs.values() if h.hub_type == "airport"]
    plan.airports_origin, plan.airports_destination = airports(hubs_a), airports(hubs_b)
    if plan.airports_origin and plan.airports_destination:
        plan.missing.append("air: both districts have airports; flight schedules and fares are not held, check with the airlines")
    names_a = {a.name_bn, a.name_en} | {h.name_bn for h in hubs_a.values()} | {h.name_en for h in hubs_a.values()}
    names_b = {b.name_bn, b.name_en} | {h.name_bn for h in hubs_b.values()} | {h.name_en for h in hubs_b.values()}
    names_a.discard(None)
    names_b.discard(None)
    for f in db.scalars(select(FareProduct).where(FareProduct.status == "published", FareProduct.origin_name.in_(names_a),
                                                  FareProduct.destination_name.in_(names_b)).order_by(FareProduct.amount)):
        plan.fares.append(FareOut(mode=f.mode, origin=f.origin_name, destination=f.destination_name, fare_class=f.fare_class,
                                  fare_class_label=f.fare_class_label, amount=f.amount, currency=f.currency,
                                  base_amount=f.base_amount, vat_amount=f.vat_amount, fare_type=f.fare_type,
                                  official_distance_km=f.official_distance_km,
                                  effective_from=f.effective_from.isoformat() if f.effective_from else None,
                                  last_checked_at=f.last_checked_at, source_url=f.source_url, notes=f.notes))
    if not plan.fares:
        plan.missing.append("fares: no published fare for this pair; check with the operator")
    return plan


@router.get("/foods", response_model=List[FoodOut])
def foods(district: Optional[str] = None, food_only: bool = True, db: Session = Depends(get_db)):
    stmt = select(LocalFood).where(LocalFood.status == "published")
    if food_only:
        stmt = stmt.where(LocalFood.is_food.is_(True))
    if district:
        did = db.scalar(select(AdminUnit.id).where(AdminUnit.slug == district))
        if did is None:
            raise HTTPException(status_code=404, detail="Unknown district")
        stmt = stmt.where(LocalFood.district_id == did)
    rows = db.scalars(stmt.order_by(LocalFood.name_bn)).all()
    slugs = _slugs(db, {f.district_id for f in rows})
    return [FoodOut(name_bn=f.name_bn, name_en=f.name_en, district_slug=slugs.get(f.district_id), is_food=f.is_food,
                    gi_registration_no=f.gi_registration_no,
                    gi_application_date=f.gi_application_date.isoformat() if f.gi_application_date else None,
                    district_evidence=f.district_evidence, source_url=f.source_url) for f in rows]


def _service_places(db: Session, kind: str, district: Optional[str], category: Optional[str], q: Optional[str],
                    stars: Optional[int], limit: int) -> List[ServicePlaceOut]:
    stmt = select(ServicePlace).where(ServicePlace.kind == kind, ServicePlace.status == "published")
    if district:
        did = db.scalar(select(AdminUnit.id).where(AdminUnit.slug == district))
        if did is None:
            raise HTTPException(status_code=404, detail="Unknown district")
        stmt = stmt.where(ServicePlace.district_id == did)
    if category:
        stmt = stmt.where(ServicePlace.category == category)
    if stars:
        stmt = stmt.where(ServicePlace.official_star_rating >= stars)
    if q:
        stmt = stmt.where(or_(func.lower(ServicePlace.name_en).like(f"%{q.strip().lower()}%"),
                              ServicePlace.name_bn.like(f"%{q.strip()}%")))
    # Officially rated first, then the most confident listings
    rows = db.scalars(stmt.order_by(ServicePlace.official_star_rating.desc().nullslast(),
                                    ServicePlace.listing_confidence.desc().nullslast()).limit(limit)).all()
    slugs = _slugs(db, {p.district_id for p in rows})
    names = dict(db.execute(select(DataSource.source_id, DataSource.source_name)).all())
    out = []
    for p in rows:
        src = (p.field_status or {}).get("latitude", {}).get("source_id") or (p.field_status or {}).get("name_bn", {}).get("source_id")
        out.append(ServicePlaceOut(slug=p.slug, kind=p.kind, category=p.category, name_en=p.name_en, name_bn=p.name_bn,
                                   latitude=p.latitude, longitude=p.longitude, district_slug=slugs.get(p.district_id),
                                   address=p.address, website=p.website, phone=p.phone,
                                   official_star_rating=p.official_star_rating,
                                   trust="official" if p.official_star_rating else "business_listing",
                                   source=names.get(src)))
    return out


@router.get("/hotels", response_model=List[ServicePlaceOut])
def hotels(district: Optional[str] = None, category: Optional[str] = None, q: Optional[str] = Query(None, min_length=2, max_length=100),
           stars: Optional[int] = Query(None, ge=3, le=5), limit: int = Query(50, ge=1, le=500), db: Session = Depends(get_db)):
    """Hotels, resorts, guest houses: official star rating where the ministry lists one, otherwise a business listing."""
    return _service_places(db, "accommodation", district, category, q, stars, limit)


@router.get("/restaurants", response_model=List[ServicePlaceOut])
def restaurants(district: Optional[str] = None, category: Optional[str] = None,
                q: Optional[str] = Query(None, min_length=2, max_length=100), limit: int = Query(50, ge=1, le=500),
                db: Session = Depends(get_db)):
    """Restaurants, cafés, fast food: business listings (not checked by Vromon)."""
    return _service_places(db, "food", district, category, q, None, limit)

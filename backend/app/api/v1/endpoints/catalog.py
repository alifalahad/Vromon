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
    TimetableVersion, Train, TrainService, TransportHub,
)
from app.schemas.catalog import (
    AdminUnitDetail, AdminUnitOut, AttractionDetail, AttractionOut, CategoryOut, FareOut, FieldSource, HubOut, PhotoOut,
    SourceOut, TrainServiceOut,
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

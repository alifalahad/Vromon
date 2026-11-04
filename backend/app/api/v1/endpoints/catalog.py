"""
Vromon API v1 — the data-platform catalog (public, read-only).

GET /catalog/admin-units?level=&parent=        divisions, districts, sub-districts
GET /catalog/admin-units/{slug}?geometry=      one unit, its neighbours, field sources, outline
GET /catalog/categories
GET /catalog/attractions?district=&category=&q= published attractions only
GET /catalog/attractions/{slug}                one attraction with the source of every field
GET /catalog/sources                           licences and attribution to show in the app

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
    AdminAdjacency, AdminBoundary, AdminUnit, Attraction, AttractionCategory, AttractionMedia, DataSource,
)
from app.schemas.catalog import (
    AdminUnitDetail, AdminUnitOut, AttractionDetail, AttractionOut, CategoryOut, FieldSource, PhotoOut, SourceOut,
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

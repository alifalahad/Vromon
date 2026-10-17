"""
Vromon API v1 — the signed-in user's visits.

PUT /me/visits (batch upsert, newest write wins) · DELETE /me/visits/{type}/{code}
Reading another user's visits and stats lives in users.py (privacy-guarded).
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.db import get_db
from app.models.models import City, Country, Region, User, Visit
from app.schemas.geo import PlaceType, VisitBatch, VisitIn, VisitOut
from app.services.stats import visits_with_country

router = APIRouter(prefix="/me/visits", tags=["visits"])


def _unknown_places(db: Session, visits: List[VisitIn]) -> list[str]:
    wanted: dict[str, set[str]] = {"country": set(), "region": set(), "city": set()}
    for v in visits:
        wanted[v.place_type].add(v.place_code)
    found = set()
    if wanted["country"]:
        found |= {("country", c) for c in db.scalars(select(Country.iso2).where(Country.iso2.in_(wanted["country"])))}
    if wanted["region"]:
        found |= {("region", c) for c in db.scalars(select(Region.code).where(Region.code.in_(wanted["region"])))}
    city_ids = {int(c) for c in wanted["city"] if c.isdigit()}
    if city_ids:
        found |= {("city", str(c)) for c in db.scalars(select(City.geonameid).where(City.geonameid.in_(city_ids)))}
    return sorted(f"{t}:{c}" for t in wanted for c in wanted[t] if (t, c) not in found)


def _naive_utc(dt: datetime) -> datetime:
    return dt.astimezone(timezone.utc).replace(tzinfo=None) if dt.tzinfo else dt


@router.put("", response_model=List[VisitOut])
def upsert_visits(payload: VisitBatch, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Create or update several visits at once. Returns all of the user's visits."""
    unknown = _unknown_places(db, payload.visits)
    if unknown:
        raise HTTPException(status_code=422, detail=f"Unknown places: {', '.join(unknown[:20])}")

    existing = {(v.place_type, v.place_code): v for v in db.scalars(select(Visit).where(Visit.user_id == user.id))}
    now = datetime.utcnow()
    for item in payload.visits:
        changed_at = _naive_utc(item.client_updated_at) if item.client_updated_at else now
        changed_at = min(changed_at, now)  # a device clock in the future can't pin a value forever
        row = existing.get((item.place_type, item.place_code))
        if row is not None and row.updated_at > changed_at:
            continue  # last write wins: the server already has a newer change
        if row is None:
            row = Visit(user_id=user.id, place_type=item.place_type, place_code=item.place_code, created_at=now)
            db.add(row)
            existing[(item.place_type, item.place_code)] = row
        row.status = item.status
        row.first_visited_on = item.first_visited_on
        row.last_visited_on = item.last_visited_on
        row.note = item.note
        row.updated_at = changed_at
    db.commit()
    return visits_with_country(db, sorted(existing.values(), key=lambda v: (v.place_type, v.place_code)))


@router.delete("/{place_type}/{place_code}", status_code=204)
def delete_visit(place_type: PlaceType, place_code: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db.execute(delete(Visit).where(Visit.user_id == user.id, Visit.place_type == place_type, Visit.place_code == place_code))
    db.commit()
    return Response(status_code=204)

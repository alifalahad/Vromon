"""
Vromon API v1 — other users' data, read-only.

Every route depends on `require_viewer_can_see`: the owner and accepted friends
see the data; anyone else gets 404.
"""

from __future__ import annotations

from datetime import date
from typing import List, Optional

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.api.v1.endpoints.trips import _trip_summary_out
from app.db import get_db
from app.core.auth import get_current_user
from app.models.models import City, Country, Region, Trip, User, Visit
from app.schemas.friends import ComparePlace, CompareOut, CompareView, FriendProfileOut
from app.schemas.geo import StatsOut, VisitOut
from app.schemas.schemas import TripStatsOut, TripSummaryOut
from app.services.privacy import require_viewer_can_see
from app.services.friends import friendship
from app.services.stats import travel_stats, trip_stats, visits_with_country
from app.services.stats.trips import viewer_today
from app.services.stats.travel import VISITED

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/{user_id}/trips", response_model=List[TripSummaryOut])
def user_trips(owner: User = Depends(require_viewer_can_see), db: Session = Depends(get_db)):
    trips = db.scalars(
        select(Trip).where(Trip.user_id == owner.id).options(selectinload(Trip.stops)).order_by(Trip.created_at.desc())
    ).all()
    return [_trip_summary_out(t) for t in trips]


@router.get("/{user_id}/trips/stats", response_model=TripStatsOut)
def user_trip_stats(today: Optional[date] = None, owner: User = Depends(require_viewer_can_see), db: Session = Depends(get_db)):
    """Completed trips only. `today` is the phone's local date (accepted within a day of the server's)."""
    return trip_stats(db, owner.id, viewer_today(today)).to_dict()


@router.get("/{user_id}/visits", response_model=List[VisitOut])
def user_visits(owner: User = Depends(require_viewer_can_see), db: Session = Depends(get_db)):
    rows = db.scalars(select(Visit).where(Visit.user_id == owner.id).order_by(Visit.place_type, Visit.place_code)).all()
    return visits_with_country(db, list(rows))


@router.get("/{user_id}/stats", response_model=StatsOut)
def user_stats(owner: User = Depends(require_viewer_can_see), db: Session = Depends(get_db)):
    return travel_stats(db, owner.id).to_dict()


@router.get("/{user_id}/profile", response_model=FriendProfileOut)
def user_profile(owner: User = Depends(require_viewer_can_see), viewer: User = Depends(get_current_user), db: Session = Depends(get_db)):
    link = friendship(db, viewer.id, owner.id)
    return FriendProfileOut(
        id=owner.id, username=owner.username or "", display_name=owner.display_name,
        is_self=owner.id == viewer.id, friends_since=link.created_at if link else None,
        home_country_iso2=owner.home_country_iso2,
    )


def _visited_codes(db: Session, user_id) -> dict[str, set[str]]:
    rows = db.execute(select(Visit.place_type, Visit.place_code).where(Visit.user_id == user_id, Visit.status.in_(VISITED))).all()
    out: dict[str, set[str]] = {"country": set(), "region": set(), "city": set()}
    for t, c in rows:
        out[t].add(c)
    return out


def _places(db: Session, place_type: str, codes: set[str]) -> dict[str, ComparePlace]:
    if not codes:
        return {}
    if place_type == "country":
        rows = db.execute(select(Country.iso2, Country.name, Country.iso2).where(Country.iso2.in_(codes))).all()
    elif place_type == "region":
        rows = db.execute(select(Region.code, Region.name, Region.country_iso2).where(Region.code.in_(codes))).all()
    else:
        ids = [int(c) for c in codes if c.isdigit()]
        rows = [(str(i), n, cc) for i, n, cc in db.execute(select(City.geonameid, City.name, City.country_iso2).where(City.geonameid.in_(ids))).all()]
    return {str(code): ComparePlace(code=str(code), name=name, country_iso2=cc) for code, name, cc in rows}


@router.get("/{user_id}/compare", response_model=CompareOut)
def compare_with(owner: User = Depends(require_viewer_can_see), viewer: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Places visited (or lived in) by both, only the viewer, only the other user, per map view."""
    mine, theirs = _visited_codes(db, viewer.id), _visited_codes(db, owner.id)
    views = {}
    for place_type, key in (("country", "countries"), ("region", "regions"), ("city", "cities")):
        names = _places(db, place_type, mine[place_type] | theirs[place_type])
        pick = lambda codes: sorted((names[c] for c in codes if c in names), key=lambda p: p.name)  # noqa: E731
        views[key] = CompareView(
            in_common=pick(mine[place_type] & theirs[place_type]),
            only_me=pick(mine[place_type] - theirs[place_type]),
            only_them=pick(theirs[place_type] - mine[place_type]),
        )
    return CompareOut(**views)

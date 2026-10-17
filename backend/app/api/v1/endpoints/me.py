"""
Vromon API v1 — the signed-in user's account.

GET/PATCH/DELETE /me · GET /me/export · GET/PUT /me/settings ·
GET /usernames/{username}/available
"""

from __future__ import annotations

import logging
from datetime import date, datetime, timezone
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.v1.endpoints.trips import _load_trip, _trip_out
from app.core.auth import DEV_BYPASS_SUBJECT, get_current_user
from app.core.config import settings
from app.core.rate_limit import USERNAME_CHECK_LIMIT, limiter
from app.db import get_db
from app.models.models import Block, Device, FriendRequest, Photo, Trip, User, UserSettings, Visit
from app.services.photos import StorageError, delete_photos, photos_out
from app.services.photos.storage import PhotoStore, optional_photo_store
from app.schemas.schemas import TripStatsOut
from app.services.friends import delete_social_data, friend_ids
from app.services.stats import trip_stats
from app.services.stats.trips import viewer_today
from app.schemas.accounts import (
    MeOut,
    MeUpdate,
    SettingsIn,
    SettingsOut,
    UsernameAvailability,
    normalize_username,
    username_problem,
)

logger = logging.getLogger("vromon.api.me")

router = APIRouter(tags=["account"])


def _me_out(user: User) -> MeOut:
    return MeOut(
        id=user.id,
        email=user.email,
        username=user.username,
        display_name=user.display_name,
        home_country_iso2=user.home_country_iso2,
        discoverable=user.discoverable,
        friend_code=user.friend_code,
        created_at=user.created_at,
        needs_onboarding=user.username is None,
    )


def _username_taken(db: Session, username: str, by_other_than: User) -> bool:
    return db.scalar(select(func.count()).select_from(User).where(User.username == username, User.id != by_other_than.id)) > 0


@router.get("/me", response_model=MeOut)
def get_me(user: User = Depends(get_current_user)):
    return _me_out(user)


@router.patch("/me", response_model=MeOut)
def update_me(payload: MeUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Update profile fields (only those sent). Claiming a taken username returns 409."""
    fields = payload.model_fields_set
    if "username" in fields and payload.username != user.username:
        if _username_taken(db, payload.username, user):
            raise HTTPException(status_code=409, detail="That username is taken")
        user.username = payload.username
    if "display_name" in fields:
        user.display_name = payload.display_name
    if "home_country_iso2" in fields:
        user.home_country_iso2 = payload.home_country_iso2
    if "discoverable" in fields and payload.discoverable is not None:
        user.discoverable = payload.discoverable
    try:
        db.commit()
    except IntegrityError:  # claimed concurrently
        db.rollback()
        raise HTTPException(status_code=409, detail="That username is taken")
    db.refresh(user)
    return _me_out(user)


@router.get("/usernames/{username}/available", response_model=UsernameAvailability)
@limiter.limit(USERNAME_CHECK_LIMIT)
def username_available(
    request: Request,  # required by the rate limiter
    username: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    name = normalize_username(username)
    problem = username_problem(name)
    if problem:
        return UsernameAvailability(username=name, available=False, reason=problem)
    if _username_taken(db, name, user):
        return UsernameAvailability(username=name, available=False, reason="That username is taken")
    return UsernameAvailability(username=name, available=True)


@router.get("/me/trips/stats", response_model=TripStatsOut)
def my_trip_stats(today: Optional[date] = None, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Completed trips only (end date before today). `today` is the phone's local date."""
    return trip_stats(db, user.id, viewer_today(today)).to_dict()


# ---------------------------------------------------------------------------
# Settings
# ---------------------------------------------------------------------------

@router.get("/me/settings", response_model=SettingsOut)
def get_settings(user: User = Depends(get_current_user)):
    if user.settings is None:
        return SettingsOut()  # defaults until the first save
    return SettingsOut.model_validate(user.settings)


@router.put("/me/settings", response_model=SettingsOut)
def put_settings(payload: SettingsIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    row = user.settings or UserSettings(user_id=user.id)
    for field, value in payload.model_dump(exclude={"map_theme"}).items():
        setattr(row, field, value)
    row.map_theme = payload.map_theme.model_dump(exclude_none=True) if payload.map_theme else None
    row.updated_at = datetime.utcnow()
    db.add(row)
    db.commit()
    db.refresh(row)
    return SettingsOut.model_validate(row)


# ---------------------------------------------------------------------------
# Data export and account deletion (Google Play requirements)
# ---------------------------------------------------------------------------

@router.get("/me/export")
def export_my_data(
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    store: PhotoStore | None = Depends(optional_photo_store),
):
    """Everything Vromon stores about the signed-in user, as JSON. Photo links expire like in the app."""
    photos = db.scalars(select(Photo).where(Photo.user_id == user.id).order_by(Photo.created_at)).all()
    try:
        photo_rows = [p.model_dump(mode="json") for p in photos_out(db, store, list(photos), str(request.base_url))] if store else []
    except StorageError:
        raise HTTPException(status_code=502, detail="Photo storage is unavailable. Please try again.")
    trip_ids = db.scalars(select(Trip.id).where(Trip.user_id == user.id).order_by(Trip.created_at)).all()
    return {
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "profile": _me_out(user).model_dump(mode="json"),
        "settings": (SettingsOut.model_validate(user.settings) if user.settings else SettingsOut()).model_dump(mode="json"),
        "trips": [_trip_out(db, _load_trip(db, tid, user)) for tid in trip_ids],
        "visits": [
            {"place_type": v.place_type, "place_code": v.place_code, "status": v.status,
             "first_visited_on": v.first_visited_on.isoformat() if v.first_visited_on else None,
             "last_visited_on": v.last_visited_on.isoformat() if v.last_visited_on else None,
             "note": v.note, "updated_at": v.updated_at.isoformat()}
            for v in db.scalars(select(Visit).where(Visit.user_id == user.id).order_by(Visit.place_type, Visit.place_code))
        ],
        "friends": [
            {"username": f.username, "since": since.isoformat()}
            for fid, since in friend_ids(db, user.id) if (f := db.get(User, fid)) is not None
        ],
        "friend_requests": [
            {"direction": "out" if r.from_user_id == user.id else "in",
             "username": _username(db, r.to_user_id if r.from_user_id == user.id else r.from_user_id),
             "status": r.status, "created_at": r.created_at.isoformat()}
            for r in db.scalars(select(FriendRequest).where((FriendRequest.from_user_id == user.id) | (FriendRequest.to_user_id == user.id)))
        ],
        "blocked_users": [_username(db, b.blocked_id) for b in db.scalars(select(Block).where(Block.blocker_id == user.id))],
        "devices": [
            {"platform": d.platform, "last_seen_at": d.last_seen_at.isoformat()}
            for d in db.scalars(select(Device).where(Device.user_id == user.id))
        ],
        "photos": photo_rows,
    }


def _username(db: Session, user_id) -> str | None:
    other = db.get(User, user_id)
    return other.username if other else None


def _delete_auth_identity(subject: str) -> None:
    """Remove the Supabase Auth user. Raises on failure; 404 means it is already gone."""
    url = f"{settings.supabase_issuer}/admin/users/{subject}"
    key = settings.supabase_service_role_key
    resp = httpx.delete(url, headers={"apikey": key, "Authorization": f"Bearer {key}"}, timeout=10)
    if resp.status_code not in (200, 204, 404):
        raise RuntimeError(f"Supabase admin API returned {resp.status_code}")


@router.delete("/me", status_code=204)
def delete_me(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    store: PhotoStore | None = Depends(optional_photo_store),
):
    """
    Permanently delete the account: photos (files first), trips (with itineraries
    and feedback), visits, friendships, friend requests, blocks, push tokens,
    settings, the profile, and the Supabase sign-in identity.
    """
    removes_identity = user.auth_subject != DEV_BYPASS_SUBJECT
    if removes_identity and not settings.supabase_service_role_key and settings.app_env == "production":
        raise HTTPException(status_code=503, detail="Account deletion is not configured on this server")

    subject = user.auth_subject
    try:
        # Files first: if the bucket fails, nothing is deleted and the user can retry
        delete_photos(db, store, list(db.scalars(select(Photo).where(Photo.user_id == user.id))))
    except StorageError as exc:
        db.rollback()
        logger.error("Account %s: deleting photos failed: %s", subject, exc)
        raise HTTPException(status_code=502, detail="Deleting your photos failed. Nothing was deleted; please try again.")
    for trip in db.scalars(select(Trip).where(Trip.user_id == user.id)).all():
        db.delete(trip)  # ORM cascades to preferences, constraints, itinerary, feedback
    db.execute(delete(Visit).where(Visit.user_id == user.id))
    delete_social_data(db, user.id)
    db.execute(delete(Device).where(Device.user_id == user.id))
    db.delete(user)  # cascades to settings
    db.commit()
    logger.info("Deleted account data for subject %s", subject)

    if removes_identity and settings.supabase_service_role_key:
        try:
            _delete_auth_identity(subject)
        except Exception as exc:  # data is gone; only the sign-in remains
            logger.error("Account %s: data deleted but Supabase identity removal failed: %s", subject, exc)
            raise HTTPException(
                status_code=502,
                detail="Your Vromon data was deleted, but removing your sign-in failed. Please try deleting again.",
            )
    elif removes_identity:
        logger.warning("SUPABASE_SERVICE_ROLE_KEY not set: Supabase identity for %s was not removed", subject)
    return Response(status_code=204)

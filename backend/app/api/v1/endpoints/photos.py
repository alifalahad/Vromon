"""
Vromon API v1 — photos (prompt §8, Android Phase 6).

POST /me/photos · DELETE /me/photos/{photo_id} · GET /users/{user_id}/photos ·
GET /photo-files/{key} (local storage only: the signed URL is the credential)

Uploads are re-encoded on the server (EXIF and GPS removed) before they reach the
private bucket. Reading goes through `require_viewer_can_see`: the owner and
accepted friends get short-lived signed URLs; anyone else gets 404.
"""

from __future__ import annotations

import logging
import uuid
from datetime import date
from typing import List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, Response, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.v1.endpoints.trips import _load_trip
from app.core.auth import get_current_user
from app.core.config import settings
from app.core.rate_limit import PHOTO_UPLOAD_LIMIT, limiter
from app.db import get_db
from app.models.models import Photo, User
from app.schemas.geo import PlaceType
from app.schemas.photos import PhotoOut
from app.services.photos import StorageError, delete_photos, photos_out, place_exists, place_filter
from app.services.photos.processing import PhotoRejected, process_photo
from app.services.photos import storage
from app.services.photos.storage import LocalStore, PhotoStore, get_photo_store, photo_keys
from app.services.privacy import NOT_FOUND, require_viewer_can_see

logger = logging.getLogger("vromon.api.photos")

router = APIRouter(tags=["photos"])

MAX_PHOTOS_PER_USER = 2000


def _storage_failed(exc: Exception) -> HTTPException:
    logger.error("Photo storage failed: %s", exc)
    return HTTPException(status_code=502, detail="Photo storage is unavailable. Please try again.")


@router.post("/me/photos", response_model=PhotoOut, status_code=201)
@limiter.limit(PHOTO_UPLOAD_LIMIT)
def upload_photo(
    request: Request,  # required by the rate limiter; also the base of local URLs
    file: UploadFile = File(...),
    place_type: Optional[PlaceType] = Form(None),
    place_code: Optional[str] = Form(None, max_length=20),
    trip_id: Optional[int] = Form(None),
    taken_on: Optional[date] = Form(None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    store: PhotoStore = Depends(get_photo_store),
):
    """Add a photo of a place and/or one of your trips. JPEG, PNG or WebP."""
    if (place_type is None) != (place_code is None):
        raise HTTPException(status_code=422, detail="place_type and place_code go together")
    if place_type is None and trip_id is None:
        raise HTTPException(status_code=422, detail="A photo needs a place or a trip")
    if place_type is not None and not place_exists(db, place_type, place_code):
        raise HTTPException(status_code=422, detail=f"Unknown place: {place_type}:{place_code}")
    if trip_id is not None:
        _load_trip(db, trip_id, user)  # 404 unless it's your trip
    if db.scalar(select(func.count()).select_from(Photo).where(Photo.user_id == user.id)) >= MAX_PHOTOS_PER_USER:
        raise HTTPException(status_code=409, detail=f"You can keep up to {MAX_PHOTOS_PER_USER} photos")

    limit = settings.photo_max_upload_mb * 1024 * 1024
    data = file.file.read(limit + 1)
    if len(data) > limit:
        raise HTTPException(status_code=413, detail=f"Photos can be up to {settings.photo_max_upload_mb} MB")
    try:
        processed = process_photo(data)
    except PhotoRejected as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    photo_id = uuid.uuid4()
    full_key, thumb_key = photo_keys(photo_id.hex)
    try:
        store.put(full_key, processed.full)
        store.put(thumb_key, processed.thumb)
    except StorageError as exc:
        try:
            store.delete([full_key, thumb_key])
        except StorageError:
            pass
        raise _storage_failed(exc)

    photo = Photo(
        id=photo_id, user_id=user.id, storage_key=full_key, thumb_key=thumb_key,
        width=processed.width, height=processed.height, size_bytes=len(processed.full),
        # The phone's own date wins: it reads EXIF before compressing
        taken_on=taken_on if taken_on and taken_on <= date.today() else processed.taken_on,
        place_type=place_type, place_code=place_code, trip_id=trip_id,
    )
    db.add(photo)
    try:
        db.commit()
    except Exception:
        db.rollback()
        store.delete([full_key, thumb_key])
        raise
    db.refresh(photo)
    return photos_out(db, store, [photo], str(request.base_url))[0]


@router.delete("/me/photos/{photo_id}", status_code=204)
def delete_photo(
    photo_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    store: PhotoStore = Depends(get_photo_store),
):
    photo = db.get(Photo, photo_id)
    if photo is None or photo.user_id != user.id:
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    try:
        delete_photos(db, store, [photo])
    except StorageError as exc:
        raise _storage_failed(exc)
    db.commit()
    return Response(status_code=204)


@router.get("/users/{user_id}/photos", response_model=List[PhotoOut])
def user_photos(
    request: Request,
    owner: User = Depends(require_viewer_can_see),
    place_type: Optional[PlaceType] = None,
    place_code: Optional[str] = Query(None, max_length=20),
    trip_id: Optional[int] = None,
    limit: int = Query(100, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    store: PhotoStore = Depends(get_photo_store),
):
    """
    Newest first. Filter by a place (a country includes its regions and cities) or
    by a trip. Read-only for friends; URLs expire after PHOTO_URL_TTL_SECONDS.
    """
    if (place_type is None) != (place_code is None):
        raise HTTPException(status_code=422, detail="place_type and place_code go together")
    query = select(Photo).where(Photo.user_id == owner.id)
    if place_type is not None:
        query = query.where(place_filter(db, place_type, place_code))
    if trip_id is not None:
        query = query.where(Photo.trip_id == trip_id)
    photos = db.scalars(query.order_by(Photo.created_at.desc(), Photo.id).limit(limit).offset(offset)).all()
    try:
        return photos_out(db, store, list(photos), str(request.base_url))
    except StorageError as exc:
        raise _storage_failed(exc)


@router.get("/photo-files/{photo_hex}/{variant}", include_in_schema=False)
def local_photo_file(photo_hex: str, variant: str, expires: int = 0, sig: str = ""):
    """Serves local-storage files to holders of an unexpired signed URL."""
    store = storage._configured_store()
    if not isinstance(store, LocalStore):
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    path = store.open_signed(f"{photo_hex}/{variant}", expires, sig)
    return FileResponse(path, media_type="image/jpeg", headers={"Cache-Control": "private, max-age=600"})

"""
Vromon Backend — photos: listing with signed URLs, filtering by place, and
deleting files together with their rows. Processing lives in `processing.py`,
the bucket in `storage.py`.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.models import City, Country, Photo, Region
from app.schemas.photos import PhotoOut
from app.services.photos.storage import PhotoStore, StorageError

__all__ = ["photos_out", "place_filter", "place_exists", "delete_photos", "StorageError"]


def place_exists(db: Session, place_type: str, place_code: str) -> bool:
    if place_type == "country":
        return db.get(Country, place_code) is not None
    if place_type == "region":
        return db.get(Region, place_code) is not None
    return place_code.isdigit() and db.get(City, int(place_code)) is not None


def place_filter(db: Session, place_type: str, place_code: str):
    """
    Photos of a place, including the places inside it: a country's sheet shows the
    photos of its regions and cities too, and a region's those of its cities.
    """
    match_self = (Photo.place_type == place_type) & (Photo.place_code == place_code)
    if place_type == "country":
        regions = select(Region.code).where(Region.country_iso2 == place_code)
        cities = [str(i) for i in db.scalars(select(City.geonameid).where(City.country_iso2 == place_code))]
        return or_(
            match_self,
            (Photo.place_type == "region") & Photo.place_code.in_(regions),
            (Photo.place_type == "city") & Photo.place_code.in_(cities),
        )
    if place_type == "region":
        cities = [str(i) for i in db.scalars(select(City.geonameid).where(City.region_code == place_code))]
        return or_(match_self, (Photo.place_type == "city") & Photo.place_code.in_(cities))
    return match_self


def _place_names(db: Session, photos: list[Photo]) -> dict[tuple[str, str], tuple[str, str | None]]:
    """(type, code) → (name, country iso2) for the places the photos belong to."""
    wanted: dict[str, set[str]] = {"country": set(), "region": set(), "city": set()}
    for p in photos:
        if p.place_type:
            wanted[p.place_type].add(p.place_code)
    out = {}
    if wanted["country"]:
        for iso2, name in db.execute(select(Country.iso2, Country.name).where(Country.iso2.in_(wanted["country"]))):
            out[("country", iso2)] = (name, iso2)
    if wanted["region"]:
        for code, name, cc in db.execute(select(Region.code, Region.name, Region.country_iso2).where(Region.code.in_(wanted["region"]))):
            out[("region", code)] = (name, cc)
    ids = [int(c) for c in wanted["city"] if c.isdigit()]
    if ids:
        for gid, name, cc in db.execute(select(City.geonameid, City.name, City.country_iso2).where(City.geonameid.in_(ids))):
            out[("city", str(gid))] = (name, cc)
    return out


def photos_out(db: Session, store: PhotoStore, photos: list[Photo], base_url: str) -> list[PhotoOut]:
    """The photos with fresh signed URLs. Photos whose files are missing are left out."""
    if not photos:
        return []
    ttl = settings.photo_url_ttl_seconds
    urls = store.signed_urls([k for p in photos for k in (p.storage_key, p.thumb_key)], ttl, base_url)
    expires_at = datetime.now(timezone.utc) + timedelta(seconds=ttl)
    names = _place_names(db, photos)
    out = []
    for p in photos:
        url, thumb = urls.get(p.storage_key), urls.get(p.thumb_key)
        if not url or not thumb:
            continue
        name, country = names.get((p.place_type, p.place_code), (None, None)) if p.place_type else (None, None)
        out.append(PhotoOut(
            id=p.id, url=url, thumb_url=thumb, expires_at=expires_at, width=p.width, height=p.height,
            taken_on=p.taken_on, place_type=p.place_type, place_code=p.place_code, place_name=name,
            country_iso2=country, trip_id=p.trip_id, created_at=p.created_at,
        ))
    return out


def delete_photos(db: Session, store: PhotoStore | None, photos: list[Photo]) -> None:
    """
    Remove the files first, then the rows (the caller commits). If the bucket call
    fails, nothing is deleted from the database, so the request can be retried and
    no file is left behind without a row.
    """
    if not photos:
        return
    if store is None:
        raise StorageError("Photo storage is not configured")
    store.delete([k for p in photos for k in (p.storage_key, p.thumb_key)])
    for p in photos:
        db.delete(p)

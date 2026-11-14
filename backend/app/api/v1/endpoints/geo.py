"""
Vromon API v1 — geography reference data (public, cacheable).

GET /geo/countries · GET /geo/regions?country= · GET /geo/cities?q=&country=
GET /geo/places?regions=&cities=   (names and points by code, for the travel dashboard)
GET /geo/tiles/{regions|cities}.pmtiles   (development; production serves tiles from a CDN)
"""

from __future__ import annotations

from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from fastapi.responses import FileResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models.models import City, Country, Region
from app.schemas.geo import CityOut, CountryOut, PlacesLookupOut, RegionOut

router = APIRouter(prefix="/geo", tags=["geo"])

TILES_DIR = Path(__file__).resolve().parents[5] / "data" / "geo" / "build"
TILE_FILES = {"regions.pmtiles", "cities.pmtiles"}
# Reference data changes only when the pipeline is re-run
CACHE = "public, max-age=86400"


@router.get("/countries", response_model=List[CountryOut])
def countries(response: Response, db: Session = Depends(get_db)):
    response.headers["Cache-Control"] = CACHE
    return db.scalars(select(Country).order_by(Country.name)).all()


@router.get("/regions", response_model=List[RegionOut])
def regions(response: Response, country: str = Query(..., min_length=2, max_length=2), db: Session = Depends(get_db)):
    response.headers["Cache-Control"] = CACHE
    return db.scalars(select(Region).where(Region.country_iso2 == country.upper()).order_by(Region.name)).all()


@router.get("/cities", response_model=List[CityOut])
def cities(
    q: str = Query(..., min_length=2, max_length=100, description="Name prefix, case-insensitive"),
    country: Optional[str] = Query(None, min_length=2, max_length=2),
    limit: int = Query(20, ge=1, le=50),
    db: Session = Depends(get_db),
):
    stmt = select(City).where(func.lower(City.name).like(f"{q.strip().lower()}%"))
    if country:
        stmt = stmt.where(City.country_iso2 == country.upper())
    return db.scalars(stmt.order_by(City.population.desc()).limit(limit)).all()


# At most this many codes of each kind in one request (a user's marks fit easily)
MAX_LOOKUP = 500


def _codes(raw: Optional[str]) -> list[str]:
    codes = [c.strip() for c in (raw or "").split(",") if c.strip()]
    if len(codes) > MAX_LOOKUP:
        raise HTTPException(status_code=422, detail=f"At most {MAX_LOOKUP} codes")
    return codes


@router.get("/places", response_model=PlacesLookupOut)
def places(
    response: Response,
    regions: Optional[str] = Query(None, description="Region codes, comma-separated"),
    cities: Optional[str] = Query(None, description="GeoNames ids, comma-separated"),
    db: Session = Depends(get_db),
):
    """
    The regions and cities named by their codes, with their points: the travel dashboard lists
    the places a user marked (a visit stores only the code) and frames them on the map. Unknown
    codes are left out.
    """
    response.headers["Cache-Control"] = CACHE
    region_codes = _codes(regions)
    city_ids = [int(c) for c in _codes(cities) if c.isdigit()]
    found_regions = db.scalars(select(Region).where(Region.code.in_(region_codes)).order_by(Region.name)).all() if region_codes else []
    found_cities = db.scalars(select(City).where(City.geonameid.in_(city_ids)).order_by(City.name)).all() if city_ids else []
    return {"regions": found_regions, "cities": found_cities}


@router.get("/tiles/{name}")
def tiles(name: str):
    """PMTiles archives; Starlette's FileResponse answers the HTTP Range requests MapLibre sends."""
    path = TILES_DIR / name
    if name not in TILE_FILES or not path.is_file():
        raise HTTPException(status_code=404, detail="Not found")
    return FileResponse(path, media_type="application/vnd.pmtiles", headers={"Cache-Control": CACHE})

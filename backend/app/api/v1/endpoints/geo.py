"""
Vromon API v1 — geography reference data (public, cacheable).

GET /geo/countries · GET /geo/regions?country= · GET /geo/cities?q=&country=
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
from app.schemas.geo import CityOut, CountryOut, RegionOut

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


@router.get("/tiles/{name}")
def tiles(name: str):
    """PMTiles archives; Starlette's FileResponse answers the HTTP Range requests MapLibre sends."""
    path = TILES_DIR / name
    if name not in TILE_FILES or not path.is_file():
        raise HTTPException(status_code=404, detail="Not found")
    return FileResponse(path, media_type="application/vnd.pmtiles", headers={"Cache-Control": CACHE})

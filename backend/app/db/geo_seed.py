"""
Vromon Backend — geography reference data (countries, regions, cities).

Loads data/geo/*.json (built by scripts/geo/build.sh from Natural Earth and GeoNames)
into the reference tables. Runs at startup and only when the tables are empty; use
`python -m app.db.geo_seed --reseed` after rebuilding the data.
"""

from __future__ import annotations

import json
import logging
import sys
from pathlib import Path

from sqlalchemy import delete, func, insert, select
from sqlalchemy.orm import Session

from app.models.models import City, Country, Region

logger = logging.getLogger("vromon.geo_seed")

GEO_DATA_DIR = Path(__file__).parent.parent.parent.parent / "data" / "geo"
BATCH = 2000


def _load(name: str) -> list[dict]:
    with (GEO_DATA_DIR / name).open(encoding="utf-8") as f:
        return json.load(f)


def _insert(db: Session, model, rows: list[dict]) -> None:
    for i in range(0, len(rows), BATCH):
        db.execute(insert(model), rows[i : i + BATCH])


def seed_geo(db: Session, *, reseed: bool = False) -> bool:
    """Fill the reference tables. Returns False when the data files are missing."""
    if not (GEO_DATA_DIR / "countries.json").exists():
        logger.warning("Geo data not found in %s; run scripts/geo/build.sh", GEO_DATA_DIR)
        return False
    if not reseed and db.scalar(select(func.count()).select_from(Country)):
        return True
    if reseed:
        for model in (City, Region, Country):
            db.execute(delete(model))

    countries = _load("countries.json")
    _insert(db, Country, [
        {k: c[k] for k in ("iso2", "iso3", "name", "name_bn", "continent", "type", "counts_toward_world", "label_lat", "label_lon")}
        for c in countries
    ])
    regions = _load("regions.json")
    _insert(db, Region, [
        {"code": r["code"], "country_iso2": r["country_iso2"], "name": r["name"], "name_bn": r["name_bn"], "type": r["type"], "lat": r["lat"], "lon": r["lon"]}
        for r in regions
    ])
    cities = _load("cities.json")
    _insert(db, City, cities)
    db.commit()
    logger.info("Geo reference data: %d countries, %d regions, %d cities", len(countries), len(regions), len(cities))
    return True


if __name__ == "__main__":
    from app.db.base import SessionLocal

    logging.basicConfig(level=logging.INFO)
    session = SessionLocal()
    try:
        ok = seed_geo(session, reseed="--reseed" in sys.argv)
    finally:
        session.close()
    sys.exit(0 if ok else 1)

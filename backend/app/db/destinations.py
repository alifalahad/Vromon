"""
Loading the imported destinations (trip planner step 10) from
data/destinations/<slug>.json into the database. Runs at startup after the
Cox's Bazar seed; a file whose content hasn't changed since it was loaded is
skipped, so this is cheap and safe to repeat. Also: `python -m app.db.destinations`.

Unknown stays unknown: a value the sources don't give (null in the file) is
stored with a planning default and marked unknown (`cost_known`,
`hours_known`, `rating_known`, `price_known`), and the app shows it as unknown.
Places, restaurants and hotels are matched by their source reference; one that
disappears from a file is hidden (`is_active = False`), never deleted, because
trips may still point to it.
"""

from __future__ import annotations

import hashlib
import json
import logging
from pathlib import Path
from typing import Optional

from sqlalchemy.orm import Session

from app.models.models import Destination, Hotel, Place, Restaurant

logger = logging.getLogger("vromon.destinations")

DATA_DIR = Path(__file__).resolve().parents[3] / "data" / "destinations"

# Planning defaults for what isn't known (shown as unknown)
UNKNOWN_HOURS = ("09:00", "17:00")
UNKNOWN_MEAL_HOURS = ("08:00", "22:00")
UNKNOWN_MEAL_COST = 300.0        # the placeholder the planner already uses for a meal without a price
NEUTRAL_RATING = 3.5             # neither helps nor hurts the ranking; never shown


def _files(directory: Path) -> list[Path]:
    return sorted(p for p in directory.glob("*.json") if p.name != "sources.json")


def load_destinations(db: Session, directory: Path = DATA_DIR) -> dict[str, str]:
    """Load every destination file; returns {name: "loaded" | "unchanged"}."""
    out: dict[str, str] = {}
    for path in _files(directory):
        raw = path.read_bytes()
        version = hashlib.sha256(raw).hexdigest()[:64]
        data = json.loads(raw)
        name = data["destination"]["name"]
        dest = db.query(Destination).filter(Destination.name == name).first()
        if dest is not None and dest.data_version == version:
            out[name] = "unchanged"
            continue
        _load(db, data, dest, version)
        db.commit()
        out[name] = "loaded"
        logger.info("Loaded %s: %d places, %d restaurants, %d hotels",
                    name, len(data["places"]), len(data["restaurants"]), len(data["hotels"]))
    return out


def _load(db: Session, data: dict, dest: Optional[Destination], version: str) -> None:
    d = data["destination"]
    checked = bool(data.get("checked", False))
    if dest is None:
        dest = Destination(name=d["name"])
        db.add(dest)
    dest.country = d.get("country", "Bangladesh")
    dest.latitude, dest.longitude = d["latitude"], d["longitude"]
    dest.description = d.get("description")
    dest.attribution = data.get("attribution")
    dest.sources_json = json.dumps(data.get("sources", []), ensure_ascii=False)
    dest.checked = checked
    dest.is_active = True
    dest.data_version = version
    db.flush()

    _sync(db, Place, dest, data["places"], lambda row, r: _place(row, r, checked))
    _sync(db, Restaurant, dest, data["restaurants"], lambda row, r: _restaurant(row, r, checked))
    _sync(db, Hotel, dest, data["hotels"], lambda row, r: _hotel(row, r, checked))


def _sync(db: Session, model, dest: Destination, records: list[dict], fill) -> None:
    existing = {
        row.source_ref: row
        for row in db.query(model).filter(model.destination_id == dest.id, model.source_ref.isnot(None))
    }
    seen = set()
    for r in records:
        row = existing.get(r["ref"])
        if row is None:
            row = model(destination_id=dest.id, destination_name=dest.name, source_ref=r["ref"])
            db.add(row)
        row.destination_name = dest.name
        fill(row, r)
        row.is_active = True
        seen.add(r["ref"])
    for ref, row in existing.items():
        if ref not in seen:
            row.is_active = False


def _place(row: Place, r: dict, checked: bool) -> None:
    row.name = r["name"]
    row.category = r["category"]
    row.description = r.get("description")
    row.latitude, row.longitude = r["latitude"], r["longitude"]
    row.source = r.get("source", "wikivoyage")
    row.url = r.get("url")
    row.checked = checked
    row.cost_known = r.get("estimated_cost") is not None
    row.estimated_cost = float(r["estimated_cost"]) if row.cost_known else 0.0
    row.hours_known = bool(r.get("opening_time") and r.get("closing_time"))
    row.opening_time, row.closing_time = (r["opening_time"], r["closing_time"]) if row.hours_known else UNKNOWN_HOURS
    row.rating_known = False
    row.rating = NEUTRAL_RATING
    row.review_count = 0
    row.average_visit_duration = float(r.get("average_visit_duration") or 1.5)
    row.best_time = r.get("best_time")
    row.crowd_level = "Medium"
    row.activity_level = r.get("activity_level") or "Medium"
    row.tags = r.get("tags") or [r["category"]]


def _restaurant(row: Restaurant, r: dict, checked: bool) -> None:
    row.name = r["name"]
    row.description = r.get("description")
    row.latitude, row.longitude = r["latitude"], r["longitude"]
    row.cuisine = r.get("cuisine")
    row.source = r.get("source", "wikivoyage")
    row.checked = checked
    row.cost_known = r.get("average_meal_cost") is not None
    row.average_meal_cost = float(r["average_meal_cost"]) if row.cost_known else UNKNOWN_MEAL_COST
    row.price_level = r.get("price_level") or "Medium"
    row.hours_known = bool(r.get("opening_time") and r.get("closing_time"))
    row.opening_time, row.closing_time = (r["opening_time"], r["closing_time"]) if row.hours_known else UNKNOWN_MEAL_HOURS
    row.rating_known = False
    row.rating = NEUTRAL_RATING
    row.review_count = 0
    row.tags = r.get("tags") or []


def _hotel(row: Hotel, r: dict, checked: bool) -> None:
    row.name = r["name"]
    row.description = r.get("description")
    row.latitude, row.longitude = r["latitude"], r["longitude"]
    row.source = r.get("source", "wikivoyage")
    row.checked = checked
    row.price_known = r.get("price_per_night") is not None
    row.price_per_night = float(r["price_per_night"]) if row.price_known else 0.0
    row.category = r.get("category") or "Standard"
    row.rating_known = False
    row.rating = NEUTRAL_RATING
    row.review_count = 0
    row.amenities = []


if __name__ == "__main__":
    from app.db.base import SessionLocal

    logging.basicConfig(level=logging.INFO)
    with SessionLocal() as session:
        for name, state in load_destinations(session).items():
            print(f"{name}: {state}")

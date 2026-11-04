"""Which division, district and sub-district a point lies in, from the curated admin geography."""

from __future__ import annotations

import json
import uuid
from dataclasses import dataclass

from shapely.geometry import Point, shape
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.catalog import AdminBoundary, AdminUnit
from vromon_data import geo

EDGE_DEG = 0.001  # ~110 m: closer than this to a district border, a person checks the assignment
OUTSIDE_DEG = 0.01  # ~1 km beyond every district: not in Bangladesh (a coastal point just offshore is kept)


@dataclass
class Placement:
    division_id: uuid.UUID | None
    district_id: uuid.UUID | None
    subdistrict_id: uuid.UUID | None
    near_edge: bool
    outside: bool
    in_country: bool = True


class AdminLookup:
    def __init__(self, session: Session):
        rows = session.execute(select(AdminUnit, AdminBoundary.geometry_geojson)
                               .join(AdminBoundary, (AdminBoundary.admin_unit_id == AdminUnit.id)
                                     & AdminBoundary.is_current.is_(True))
                               .where(AdminUnit.country_iso2 == "BD", AdminUnit.status != "inactive")).all()
        self.units = {u.id: u for u, _ in rows}
        self.shapes = {u.id: shape(json.loads(g)) for u, g in rows}
        self.by_slug = {u.slug: u for u in self.units.values()}
        self._idx = {lvl: geo.Index([(str(uid), g) for uid, g in self.shapes.items() if self.units[uid].level == lvl])
                     for lvl in ("district", "subdistrict")}

    def district(self, slug: str) -> AdminUnit:
        return self.by_slug[slug]

    def place(self, lat: float, lon: float) -> Placement:
        p = Point(lon, lat)
        hits = [uuid.UUID(k) for k in self._idx["district"].covering_point(p)]
        outside = not hits
        if outside:  # a coastal or river point just off the simplified outline: the nearest district, reviewed
            hits = [uuid.UUID(self._idx["district"].nearest(p))]
        district = hits[0]
        in_country = not outside or self.shapes[district].distance(p) <= OUTSIDE_DEG
        near_edge = outside or len(hits) > 1 or self.shapes[district].boundary.distance(p) < EDGE_DEG
        subs = [uuid.UUID(k) for k in self._idx["subdistrict"].covering_point(p)]
        sub = next((s for s in subs if self.units[s].parent_id == district), None)
        return Placement(division_id=self.units[district].parent_id, district_id=district, subdistrict_id=sub,
                         near_edge=near_edge, outside=outside, in_country=in_country)

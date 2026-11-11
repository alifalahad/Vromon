"""Geometry helpers (shapely + pyproj). Coordinates are EPSG:4326 lon/lat; areas and lengths are geodesic."""

from __future__ import annotations

import hashlib
import json
from typing import Any

from pyproj import Geod
from shapely import make_valid, to_geojson, wkb
from shapely.geometry import MultiPolygon, Polygon, shape
from shapely.geometry.base import BaseGeometry
from shapely.strtree import STRtree

GEOD = Geod(ellps="WGS84")
# Bangladesh's extent with a margin; points outside need review (offshore islands included inside)
BD_BBOX = (88.0, 20.3, 92.8, 26.7)
SIMPLIFY_TOLERANCE_DEG = 0.0005  # ~50 m: enough for maps and point-in-district checks with an edge review


def load(geojson_geometry: dict[str, Any]) -> tuple[BaseGeometry, bool]:
    """Shapely geometry, repaired if invalid. Returns (geometry, was_repaired)."""
    g = shape(geojson_geometry)
    if g.is_valid:
        return g, False
    fixed = make_valid(g)
    # make_valid can return a collection; keep the polygonal part
    if fixed.geom_type == "GeometryCollection":
        polys = [p for p in fixed.geoms if p.geom_type in ("Polygon", "MultiPolygon")]
        parts: list[Polygon] = []
        for p in polys:
            parts.extend(p.geoms if isinstance(p, MultiPolygon) else [p])
        fixed = MultiPolygon(parts)
    return fixed, True


def area_km2(g: BaseGeometry) -> float:
    return abs(GEOD.geometry_area_perimeter(g)[0]) / 1e6


def length_km(g: BaseGeometry) -> float:
    return GEOD.geometry_length(g) / 1000


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Distance between two points on the WGS84 ellipsoid (the name is kept for familiarity)."""
    return GEOD.inv(lon1, lat1, lon2, lat2)[2] / 1000


def label_point(g: BaseGeometry) -> tuple[float, float]:
    """(lat, lon): the centroid, or a point inside the shape when the centroid falls outside it."""
    c = g.centroid
    if not g.contains(c):
        c = g.representative_point()
    return round(c.y, 6), round(c.x, 6)


def simplified_geojson(g: BaseGeometry, tolerance: float = SIMPLIFY_TOLERANCE_DEG) -> str:
    s = g.simplify(tolerance, preserve_topology=True)
    return to_geojson(s, indent=None)


def checksum(g: BaseGeometry) -> str:
    return hashlib.sha256(wkb.dumps(g, hex=False)).hexdigest()


def in_bbox(lat: float, lon: float, bbox=BD_BBOX) -> bool:
    return bbox[0] <= lon <= bbox[2] and bbox[1] <= lat <= bbox[3]


class Index:
    """Point/geometry lookups over a set of (key, geometry)."""

    def __init__(self, items: list[tuple[str, BaseGeometry]]):
        self.keys = [k for k, _ in items]
        self.geoms = [g for _, g in items]
        self.tree = STRtree(self.geoms)

    def containing(self, g: BaseGeometry) -> list[str]:
        return [self.keys[i] for i in self.tree.query(g, predicate="within")]

    def covering_point(self, g: BaseGeometry) -> list[str]:
        return [self.keys[i] for i in self.tree.query(g, predicate="intersects")]

    def nearest(self, g: BaseGeometry) -> str:
        return self.keys[int(self.tree.nearest(g))]

    def best_overlap(self, g: BaseGeometry) -> tuple[str | None, float]:
        """Key with the largest share of g's area inside it, and that share (0-1)."""
        best, share = None, 0.0
        total = g.area or 1.0
        for i in self.tree.query(g, predicate="intersects"):
            s = self.geoms[i].intersection(g).area / total
            if s > share:
                best, share = self.keys[i], s
        return best, share


def geojson_feature(geometry: str, properties: dict) -> dict:
    return {"type": "Feature", "geometry": json.loads(geometry), "properties": properties}

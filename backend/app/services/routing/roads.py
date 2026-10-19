"""
Road distances, driving times and road lines (trip planner step 5).

Every planner, edit and check asks `ROADS.travel(a, b)` how long it takes to get
from one point to another. The answer comes from road data when we have it, and
otherwise from the straight-line estimate used before (30 km/h, labelled "estimate").

Road data comes from a routing service behind `RoadProvider` (OpenRouteService
today; a self-hosted OSRM can replace it without changing anything else). It is
asked once per pair of points: `prepare()` fetches every missing pair of a
destination in one matrix request, and the answers are kept in the `route_cache`
table and in memory. Road lines for the map are fetched a day at a time and kept
the same way. If the service is down or not configured, nothing fails: the
straight-line estimate is used and says so.
"""

from __future__ import annotations

import json
import logging
import math
import threading
import time
from dataclasses import dataclass
from typing import TYPE_CHECKING, Callable, Optional, Protocol, Sequence

from app.services.routing import modes as M

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

logger = logging.getLogger("vromon.routing")

Point = tuple[float, float]              # (latitude, longitude)
PROFILE = "driving-car"
RETRY_AFTER_S = 300                      # after a failure, don't ask again for 5 minutes
MATRIX_BLOCK = 50                        # points per side of one matrix request

# A road answer much longer than the straight line isn't believed: the place was matched to the
# wrong road (a beach point far from any road, or across a river or a border). The straight-line
# estimate is used instead, and says so. Normal roads here are about 1.2-2x the straight line.
MAX_DETOUR = 2.5
MAX_DETOUR_KM = 2.0                      # extra slack for short distances
WALK_STRAIGHTNESS = 1.3                  # on foot you can cut across (beaches, lanes): at most 1.3x the straight line


def plausible(straight_km: float, road_km: float) -> bool:
    return road_km <= straight_km * MAX_DETOUR + MAX_DETOUR_KM


class RoutingUnavailable(Exception):
    """
    The routing service couldn't answer. `temporary`: down or over its limits (wait before
    asking again); otherwise this request itself can't be answered (a point with no road nearby).
    """

    def __init__(self, message: str, temporary: bool = True):
        super().__init__(message)
        self.temporary = temporary


class RoadProvider(Protocol):
    name: str

    def matrix(self, sources: Sequence[Point], destinations: Sequence[Point]) -> tuple[list[list[Optional[float]]], list[list[Optional[float]]]]:
        """Road km and driving minutes from each source to each destination (None: no road)."""

    def route(self, points: Sequence[Point]) -> tuple[list[list[float]], list[tuple[float, float]], list[int]]:
        """The road line through the points ([lon, lat] pairs), each leg's (km, minutes), and the
        index in the line of each point."""


@dataclass(frozen=True)
class Road:
    km: float
    drive_min: Optional[float]           # None: no road data (straight-line estimate)
    source: str                          # "road" or "estimate"


@dataclass(frozen=True)
class Travel:
    minutes: float
    km: float
    mode: Optional[str]                  # None: the straight-line estimate (no mode)
    source: str


def haversine_km(a: Point, b: Point) -> float:
    r = 6371.0
    p1, p2 = math.radians(a[0]), math.radians(b[0])
    dp, dl = math.radians(b[0] - a[0]), math.radians(b[1] - a[1])
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return r * 2 * math.atan2(math.sqrt(h), math.sqrt(1 - h))


def point_of(thing) -> Optional[Point]:
    """(lat, lon) of a place, hotel, restaurant or city, if it has coordinates."""
    if thing is None:
        return None
    lat = getattr(thing, "latitude", None)
    lon = getattr(thing, "longitude", None)
    if lat is None:
        lat, lon = getattr(thing, "lat", None), getattr(thing, "lon", None)
    return (lat, lon) if lat is not None and lon is not None else None


def _key(p: Point) -> tuple[float, float]:
    return (round(p[0], 5), round(p[1], 5))


class RoadNetwork:
    def __init__(self, provider_factory: Callable[[], Optional[RoadProvider]]):
        self._provider_factory = provider_factory
        self.provider: Optional[RoadProvider] = None
        self._provider_ready = False
        self._pairs: dict[tuple, Road] = {}
        self._lines: dict[tuple, list[list[float]]] = {}
        self._loaded = False
        self._failed_at = 0.0
        self._lock = threading.Lock()

    # -- setup -----------------------------------------------------------------
    def reset(self, provider: Optional[RoadProvider] = None, use_settings: bool = False) -> None:
        """Forget everything (tests); use `provider`, or the configured one when `use_settings`."""
        with self._lock:
            self._pairs.clear()
            self._lines.clear()
            self._loaded = False
            self._failed_at = 0.0
            self.provider = provider
            self._provider_ready = not use_settings

    def _get_provider(self) -> Optional[RoadProvider]:
        if not self._provider_ready:
            self.provider = self._provider_factory()
            self._provider_ready = True
        return self.provider

    @property
    def available(self) -> bool:
        return self._get_provider() is not None and time.monotonic() - self._failed_at > RETRY_AFTER_S

    @property
    def provider_name(self) -> Optional[str]:
        p = self._get_provider()
        return p.name if p else None

    # -- answers -----------------------------------------------------------------
    def pair(self, a: Optional[Point], b: Optional[Point]) -> Road:
        if a is None or b is None:
            return Road(0.0, None, "estimate")
        road = self._pairs.get((_key(a), _key(b)))
        if road is not None:
            return road
        return Road(haversine_km(a, b), None, "estimate")

    def travel(self, a: Optional[Point], b: Optional[Point], mode: Optional[str] = None) -> Travel:
        """
        How long from a to b. Without road data, the straight-line estimate (as before
        step 5). With it, by `mode`, or by the mode a local would pick for the distance.
        """
        road = self.pair(a, b)
        if road.source == "estimate" and mode is None:
            return Travel(road.km / M.STRAIGHT_KMH * 60, road.km, None, "estimate")
        # On foot you needn't follow the car road (beaches, lanes)
        walk_km = min(road.km, haversine_km(a, b) * WALK_STRAIGHTNESS) if a and b else road.km
        m = mode or M.default_mode(walk_km)
        km = walk_km if m == "walk" else road.km
        return Travel(M.minutes(m, km, road.drive_min), km, m, road.source)

    # -- fetching ----------------------------------------------------------------
    def _load(self, db: "Session") -> None:
        if self._loaded:
            return
        from app.models.models import RouteCache
        for row in db.query(RouteCache).filter(RouteCache.profile == PROFILE):
            a, b = (row.from_lat, row.from_lon), (row.to_lat, row.to_lon)
            self._remember(a, b, row.distance_km, row.duration_min)
            if row.geometry_json:
                self._lines[(_key(a), _key(b))] = json.loads(row.geometry_json)
        self._loaded = True

    def _remember(self, a: Point, b: Point, km: Optional[float], minutes: Optional[float]) -> None:
        straight = haversine_km(a, b)
        if km is None or minutes is None or not plausible(straight, float(km)):
            # No road, or an answer we don't believe: the estimate, without asking again
            self._pairs[(_key(a), _key(b))] = Road(straight, None, "estimate")
        else:
            self._pairs[(_key(a), _key(b))] = Road(float(km), float(minutes), "road")

    def _forget(self) -> None:
        """A batch wasn't saved: drop what it put in memory by reloading from the database next time."""
        self._pairs.clear()
        self._lines.clear()
        self._loaded = False

    def _known(self, a: Point, b: Point) -> bool:
        return (_key(a), _key(b)) in self._pairs

    def prepare(self, db: "Session", points: Sequence[Optional[Point]]) -> None:
        """Make sure every pair of these points has road data (one matrix request for the missing ones)."""
        pts = list(dict.fromkeys(_key(p) for p in points if p is not None))
        with self._lock:
            self._load(db)
            missing = [a for a in pts if any(a != b and not self._known(a, b) for b in pts)]
            if not missing or not self.available:
                return
            provider = self._get_provider()
            # Its own session: never commit (or roll back) the request's own changes
            with _own_session(db) as cache:
                try:
                    for i in range(0, len(missing), MATRIX_BLOCK):
                        sources = missing[i:i + MATRIX_BLOCK]
                        for j in range(0, len(pts), MATRIX_BLOCK):
                            dests = pts[j:j + MATRIX_BLOCK]
                            km, mins = provider.matrix(sources, dests)
                            self._store(cache, sources, dests, km, mins, provider.name)
                    cache.commit()
                    logger.info("Road data for %d points (%d new) from %s", len(pts), len(missing), provider.name)
                except RoutingUnavailable as exc:
                    cache.rollback()
                    self._forget()
                    self._failed_at = time.monotonic()
                    logger.warning("Routing unavailable, using straight-line estimates: %s", exc)

    def _store(self, db: "Session", sources, dests, km, mins, provider_name: str) -> None:
        from app.models.models import RouteCache
        for si, a in enumerate(sources):
            for di, b in enumerate(dests):
                if a == b or self._known(a, b):
                    continue
                k = km[si][di] if km and km[si] is not None else None
                m = mins[si][di] if mins and mins[si] is not None else None
                db.add(RouteCache(
                    provider=provider_name, profile=PROFILE, from_lat=a[0], from_lon=a[1], to_lat=b[0], to_lon=b[1],
                    distance_km=k, duration_min=m,
                ))
                self._remember(a, b, k, m)

    def lines(self, db: "Session", points: Sequence[Optional[Point]]) -> list[Optional[list[list[float]]]]:
        """
        The road line ([lon, lat] pairs) of each leg between consecutive points, or None for a
        leg without one (then the map draws a straight, dashed line).
        """
        pts = [_key(p) if p is not None else None for p in points]
        legs = list(zip(pts, pts[1:]))
        with self._lock:
            self._load(db)
            todo = [(a, b) for a, b in legs if a and b and a != b and (a, b) not in self._lines]
            if todo and self.available:
                route_pts = [p for p in pts if p is not None]
                with _own_session(db) as cache:
                    try:
                        coords, leg_stats, way = self._get_provider().route(route_pts)
                        self._store_lines(cache, route_pts, coords, leg_stats, way)
                        cache.commit()
                    except RoutingUnavailable as exc:
                        cache.rollback()
                        self._forget()
                        if exc.temporary:
                            self._failed_at = time.monotonic()
                        logger.warning("Road lines unavailable: %s", exc)
            self._load(db)
            # Only for legs whose road answer we believe (otherwise the map draws the estimate)
            return [
                self._lines.get((a, b)) if a and b and self.pair(a, b).source == "road" else None
                for a, b in legs
            ]

    def _store_lines(self, db: "Session", pts, coords, leg_stats, way) -> None:
        from app.models.models import RouteCache
        for i, (a, b) in enumerate(zip(pts, pts[1:])):
            if a == b or i + 1 >= len(way):
                continue
            line = coords[way[i]:way[i + 1] + 1]
            self._lines[(a, b)] = line
            row = (
                db.query(RouteCache)
                .filter_by(profile=PROFILE, from_lat=a[0], from_lon=a[1], to_lat=b[0], to_lon=b[1])
                .first()
            )
            km, mins = leg_stats[i] if i < len(leg_stats) else (None, None)
            if row is None:
                row = RouteCache(provider=self._get_provider().name, profile=PROFILE, from_lat=a[0], from_lon=a[1],
                                 to_lat=b[0], to_lon=b[1], distance_km=km, duration_min=mins)
                db.add(row)
                self._remember(a, b, km, mins)
            row.geometry_json = json.dumps(line)


def _own_session(db: "Session"):
    from sqlalchemy.orm import Session
    return Session(bind=db.get_bind())


def _from_settings() -> Optional[RoadProvider]:
    from app.core.config import settings
    name = (settings.routing_provider or ("ors" if settings.ors_api_key else "none")).lower()
    if name == "ors" and settings.ors_api_key:
        from app.services.routing.ors import OrsProvider
        return OrsProvider(settings.ors_api_key, settings.ors_base_url, settings.routing_timeout_seconds)
    return None


ROADS = RoadNetwork(_from_settings)

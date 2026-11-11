"""
Crossings by boat or ferry for legs the road network can't do: an island (Bhola, Hatiya,
Saint Martin's, Kutubdia, Sandwip, Manpura …) or the far bank of a river without a bridge.

The leg becomes: road to a ferry/launch ghat near the start, across the water to a ghat near
the end, road on from there. The ghats come from the data platform's `transport_hubs`
(ferry_terminal, published; OpenStreetMap). No timetable or fare is invented: the water part's
time is an estimate (a typical launch speed plus boarding), labelled so, and the app tells the
traveller to check the local schedule.

Without ghat data (a fresh database, tests) nothing changes: `plan()` returns None.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Optional, Sequence

Point = tuple[float, float]  # (lat, lon)

GHAT_SEARCH_KM = 25.0      # how far from a stop to look for a ghat
WATER_KMH = 12.0           # a typical launch / trawler speed (an estimate, never shown as a schedule)
BOARDING_MIN = 30.0        # waiting and boarding at the ghat (an estimate)
ROAD_KMH = 30.0            # the straight-line road estimate used elsewhere
MIN_LEG_KM = 2.0           # shorter legs are walked or taken by rickshaw, never by boat
MIN_WATER_KM = 1.0         # two ghats closer than this are the same bank


@dataclass(frozen=True)
class Ghat:
    slug: str
    name: str
    lat: float
    lon: float


@dataclass(frozen=True)
class Crossing:
    start: Ghat
    end: Ghat
    water_km: float
    minutes: float          # whole leg, estimate: road to ghat + boarding + water + road on
    road_km_before: float
    road_km_after: float


def km(a: Point, b: Point) -> float:
    r = 6371.0
    p1, p2 = math.radians(a[0]), math.radians(b[0])
    dp, dl = math.radians(b[0] - a[0]), math.radians(b[1] - a[1])
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))


def load_ghats(db) -> list[Ghat]:
    from app.models.catalog import TransportHub
    rows = db.query(TransportHub).filter(TransportHub.hub_type == "ferry_terminal", TransportHub.status == "published",
                                         TransportHub.latitude.isnot(None)).all()
    return [Ghat(h.slug, h.name_bn or h.name_en or h.slug, h.latitude, h.longitude) for h in rows]


def plan(a: Point, b: Point, ghats: Sequence[Ghat]) -> Optional[Crossing]:
    """The shortest road-water-road crossing between a and b through two different ghats, or None."""
    if km(a, b) < MIN_LEG_KM:
        return None
    near_a = [g for g in ghats if km(a, (g.lat, g.lon)) <= GHAT_SEARCH_KM]
    near_b = [g for g in ghats if km(b, (g.lat, g.lon)) <= GHAT_SEARCH_KM]
    best: Optional[Crossing] = None
    for s in near_a:
        for e in near_b:
            if s.slug == e.slug or km((s.lat, s.lon), (e.lat, e.lon)) < MIN_WATER_KM:
                continue
            before, water, after = km(a, (s.lat, s.lon)), km((s.lat, s.lon), (e.lat, e.lon)), km((e.lat, e.lon), b)
            minutes = (before + after) / ROAD_KMH * 60 + BOARDING_MIN + water / WATER_KMH * 60
            if best is None or minutes < best.minutes:
                best = Crossing(s, e, round(water, 1), round(minutes), round(before, 1), round(after, 1))
    return best

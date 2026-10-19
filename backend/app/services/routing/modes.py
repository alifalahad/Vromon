"""
How people get around a destination: walk, rickshaw, CNG (auto-rickshaw) or a
hired car, with the time and fare of each over a road distance.

Only the road distance and the driving time come from the routing service. The
rest are estimates from local speeds and fares, and are labelled as such in the
app: rickshaws and CNGs have no timetable or meter, and fares are bargained.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

MODES = ("walk", "rickshaw", "cng", "car")

WALK_KMH = 4.5
RICKSHAW_KMH = 10.0
RICKSHAW_MAX_KM = 6.0          # longer than this, a rickshaw isn't offered
CNG_SLOWER = 1.25              # a CNG takes about a quarter longer than a car
WALK_MAX_KM = 1.0              # up to here walking is the default
STRAIGHT_KMH = 30.0            # the straight-line estimate used without road data


@dataclass(frozen=True)
class Fare:
    base: float
    per_km: float
    minimum: float

    def of(self, km: float) -> float:
        """Rounded to the nearest ৳10 (halves up)."""
        return int(max(self.minimum, self.base + self.per_km * km) / 10 + 0.5) * 10


# Typical local fares in Bangladesh tourist towns, per vehicle (estimates)
FARES = {
    "rickshaw": Fare(base=20, per_km=25, minimum=40),
    "cng": Fare(base=40, per_km=28, minimum=80),
    "car": Fare(base=300, per_km=65, minimum=500),
}


def default_mode(km: float) -> str:
    """What a local would pick: walk a short way, otherwise a CNG."""
    return "walk" if km <= WALK_MAX_KM else "cng"


def offered(km: float) -> list[str]:
    """The modes that make sense for this distance (always at least walk and a vehicle)."""
    return [m for m in MODES if not (m == "rickshaw" and km > RICKSHAW_MAX_KM)]


def minutes(mode: str, km: float, drive_min: Optional[float]) -> float:
    """Travel minutes by this mode over `km` of road; `drive_min` is the routing service's car time."""
    car = drive_min if drive_min is not None else km / STRAIGHT_KMH * 60
    if mode == "walk":
        return km / WALK_KMH * 60
    if mode == "rickshaw":
        return max(car, km / RICKSHAW_KMH * 60)
    if mode == "cng":
        return car * CNG_SLOWER
    return car


def fare(mode: str, km: float) -> float:
    """The fare per vehicle (0 for walking)."""
    f = FARES.get(mode)
    return f.of(km) if f else 0.0


# ---------------------------------------------------------------------------
# Getting there: from the trip's starting city to the destination
# ---------------------------------------------------------------------------

def getting_there(mode: str, road_km: Optional[float], drive_min: Optional[float], straight_km: float) -> Optional[dict]:
    """
    Rough time and fare to the destination by the trip's mode (estimates: no timetables or
    live fares). Road modes use the road distance and driving time when known.
    `fare_per` says whether the fare is per person or per vehicle.
    """
    km = road_km if road_km is not None else straight_km * 1.3      # roads are rarely straight
    car = drive_min if drive_min is not None else km / 50 * 60
    if mode == "bus":
        return {"minutes": car * 1.35, "fare": max(300, round(km * 3 / 50) * 50), "fare_per": "person", "km": km}
    if mode == "car":
        return {"minutes": car * 1.1, "fare": max(1000, round(km * 30 / 100) * 100), "fare_per": "vehicle", "km": km}
    if mode == "train":
        return {"minutes": km / 45 * 60, "fare": max(200, round(km * 2.2 / 50) * 50), "fare_per": "person", "km": km}
    if mode == "plane":
        # flying time plus getting to the airport, check-in and from the airport
        return {"minutes": straight_km / 550 * 60 + 150, "fare": round((3500 + straight_km * 8) / 100) * 100,
                "fare_per": "person", "km": straight_km}
    return None

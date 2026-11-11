"""
Getting there, door to door: from where the traveller starts (their location, or a city) to the
destination, as options by plane, train, bus or car, each made of legs with times and fares.

What comes from data and what is estimated, per leg:
  - road distance and driving time: the routing service (OpenRouteService), else the catalog's
    district-to-district road journey, else the straight line × 1.3 (said so)
  - trains: Bangladesh Railway's published timetable (catalog train services and their stops);
    the fare is an estimate (the official fare table isn't transcribed yet) and says so
  - planes: the catalog's airports; flight times and fares are estimates, and the option says to
    check with the airlines (Vromon holds no flight schedules)
  - buses: the nearest bus terminals (catalog hubs); time and fare are estimates
  - getting to and from a station, terminal or airport: a CNG over the road estimate
Nothing is presented as more certain than it is: every fare carries `fare_kind`.

Ranking: options in the traveller's chosen modes come first, fastest first; without a choice
(or with "suggest by budget"), the fastest option whose return fare fits a share of the
per-person budget is recommended, else the cheapest.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.catalog import AdminBoundary, AdminUnit, JourneyCalculation, ServiceStop, TimetableVersion, Train, \
    TrainService, TransportHub
from app.services.routing import modes as local_modes
from app.services.routing.roads import ROADS, haversine_km

MODES = ("plane", "train", "bus", "car", "launch")
TRANSPORT_SHARE = 0.35       # of the per-person budget, for the way there and back
LOCAL_KMH = 22.0             # a CNG through town, to a station or terminal
HUB_RADIUS_KM = {"railway_station": 40.0, "bus_terminal": 20.0, "airport": 130.0}
PLANE_MIN_KM = 150.0         # shorter than this, flying makes no sense
BUS_SLOWER, BUS_STOPS_MIN = 1.55, 30   # a coach against the routing service's car time, plus its stops
WEEKDAYS = ("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")
AIRLINES = "Biman Bangladesh, US-Bangla, Novoair, Air Astra"


@dataclass
class Point:
    lat: float
    lon: float
    label: str


@dataclass
class Leg:
    mode: str                       # cng / bus / train / plane / car
    start: str
    end: str
    minutes: float
    km: float
    fare: Optional[float] = None
    fare_per: str = "person"        # person / vehicle
    fare_kind: str = "estimate"     # estimate / official / unknown
    depart: Optional[str] = None    # HH:MM, timetabled legs only
    arrive: Optional[str] = None
    detail: Optional[str] = None    # e.g. the train's name and number, its off day
    source: Optional[str] = None

    def out(self) -> dict:
        return {"mode": self.mode, "from": self.start, "to": self.end, "minutes": round(self.minutes / 5) * 5,
                "km": round(self.km, 1), "fare": self.fare, "fare_per": self.fare_per, "fare_kind": self.fare_kind,
                "depart": self.depart, "arrive": self.arrive, "detail": self.detail, "source": self.source}


@dataclass
class Option:
    mode: str
    legs: list[Leg]
    note: Optional[str] = None
    recommended: bool = False
    reason: Optional[str] = None
    preferred: bool = False
    alternatives: list[dict] = field(default_factory=list)   # other trains the same day

    def cost_per_person(self, travellers: int) -> float:
        return sum((l.fare or 0) / (max(travellers, 1) if l.fare_per == "vehicle" else 1) for l in self.legs)

    def minutes(self) -> float:
        return sum(l.minutes for l in self.legs)

    def out(self, travellers: int) -> dict:
        return {"mode": self.mode, "minutes": round(self.minutes() / 5) * 5, "km": round(sum(l.km for l in self.legs)),
                "cost_per_person": round(self.cost_per_person(travellers)),
                "all_official": all(l.fare_kind == "official" for l in self.legs if l.fare is not None),
                "recommended": self.recommended, "preferred": self.preferred, "reason": self.reason, "note": self.note,
                "legs": [l.out() for l in self.legs], "alternatives": self.alternatives}


# --- places ----------------------------------------------------------------------------------------

_DISTRICTS: list | None = None


def district_of(db: Session, lat: float, lon: float) -> Optional[AdminUnit]:
    """The Bangladesh district a point lies in (boundary polygons), else None."""
    global _DISTRICTS
    from app.api.v1.endpoints.explore import _inside
    if _DISTRICTS is None:
        rows = db.execute(select(AdminUnit.id, AdminBoundary)
                          .join(AdminBoundary, AdminBoundary.admin_unit_id == AdminUnit.id)
                          .where(AdminUnit.level == "district", AdminBoundary.is_current.is_(True))).all()
        _DISTRICTS = [(uid, (b.min_lon, b.min_lat, b.max_lon, b.max_lat), json.loads(b.geometry_geojson)) for uid, b in rows]
    for uid, (x0, y0, x1, y1), g in _DISTRICTS:
        if x0 <= lon <= x1 and y0 <= lat <= y1 and _inside(g, lon, lat):
            return db.get(AdminUnit, uid)
    return None


def _nearest_hubs(db: Session, hub_type: str, p: Point, limit: int = 3) -> list[tuple[float, TransportHub]]:
    radius = HUB_RADIUS_KM[hub_type]
    d = radius / 111
    hubs = db.scalars(select(TransportHub).where(TransportHub.hub_type == hub_type, TransportHub.status == "published",
                                                 TransportHub.latitude.between(p.lat - d, p.lat + d),
                                                 TransportHub.longitude.between(p.lon - d * 1.2, p.lon + d * 1.2)))
    near = sorted(((haversine_km((p.lat, p.lon), (h.latitude, h.longitude)), h) for h in hubs), key=lambda x: x[0])
    return [x for x in near if x[0] <= radius][:limit]


_TERMINAL_WORDS = ("terminal", "bus stand", "counter", "টার্মিনাল", "বাসস্ট্যান্ড", "বাস স্ট্যান্ড")


def _is_bus_terminal(h: TransportHub) -> bool:
    name = f"{h.name_en or ''} {h.name_bn or ''}".lower()
    return any(w in name for w in _TERMINAL_WORDS)


def _hub_name(h: TransportHub) -> str:
    return h.name_en or h.name_bn or h.slug


def _local(start: str, end: str, km_straight: float) -> Leg:
    """A CNG ride to or from a station, terminal or airport (estimate)."""
    km = km_straight * 1.3
    return Leg("cng", start, end, max(10.0, km / LOCAL_KMH * 60), km, fare=local_modes.fare("cng", km),
               fare_per="vehicle", source="estimate: local CNG fare")


def _road(db: Session, a: Point, b: Point) -> tuple[float, float, str]:
    """(km, driving minutes, source) between two points."""
    pa, pb = (a.lat, a.lon), (b.lat, b.lon)
    ROADS.prepare(db, [pa, pb])
    r = ROADS.pair(pa, pb)
    if r.source == "road" and r.km:
        return r.km, r.drive_min or r.km / 50 * 60, "road distance and time from OpenRouteService"
    da, db_ = district_of(db, a.lat, a.lon), district_of(db, b.lat, b.lon)
    if da is not None and db_ is not None and da.id != db_.id:
        j = db.scalar(select(JourneyCalculation).where(JourneyCalculation.origin_ref == f"admin_unit:{da.slug}",
                                                       JourneyCalculation.destination_ref == f"admin_unit:{db_.slug}",
                                                       JourneyCalculation.mode == "road"))
        if j is not None and j.distance_km:
            return j.distance_km, j.duration_min or j.distance_km / 50 * 60, "district-to-district road journey (catalog)"
    km = haversine_km(pa, pb) * 1.3
    return km, km / 50 * 60, "estimate: straight line × 1.3"


# --- the options -----------------------------------------------------------------------------------

def _bus(db: Session, a: Point, b: Point, road: tuple[float, float, str]) -> Option:
    km, drive, source = road
    est = local_modes.getting_there("bus", km, drive, km / 1.3)
    legs: list[Leg] = []
    ta = [x for x in _nearest_hubs(db, "bus_terminal", a, 12) if _is_bus_terminal(x[1])][:1]
    tb = [x for x in _nearest_hubs(db, "bus_terminal", b, 12) if _is_bus_terminal(x[1])][:1]
    start, end = (_hub_name(ta[0][1]) if ta else a.label), (_hub_name(tb[0][1]) if tb else b.label)
    if ta and ta[0][0] > 1:
        legs.append(_local(a.label, start, ta[0][0]))
    bus_minutes = drive * BUS_SLOWER + BUS_STOPS_MIN
    legs.append(Leg("bus", start, end, bus_minutes, km, fare=est["fare"], fare_per="person",
                    detail="Intercity bus (several operators)", source=f"{source}; bus fare estimated"))
    if tb and tb[0][0] > 1:
        legs.append(_local(end, b.label, tb[0][0]))
    return Option("bus", legs, note="Bus fares and departures vary by operator; book at the terminal or online.")


def _car(a: Point, b: Point, road: tuple[float, float, str]) -> Option:
    km, drive, source = road
    est = local_modes.getting_there("car", km, drive, km / 1.3)
    return Option("car", [Leg("car", a.label, b.label, est["minutes"], km, fare=est["fare"], fare_per="vehicle",
                              detail="Hired car with driver, or your own", source=f"{source}; hire cost estimated")])


def _trains(db: Session, a: Point, b: Point) -> Optional[Option]:
    """The timetabled trains from a station near the start to one near the destination (the timetable
    holds each train's first and last station; trains that only pass through aren't known yet, and
    the eastern zone's timetable is still under review)."""
    sa = {h.id: (d, h) for d, h in _nearest_hubs(db, "railway_station", a, 300)}
    sb = {h.id: (d, h) for d, h in _nearest_hubs(db, "railway_station", b, 300)}
    if not sa or not sb:
        return None
    rows = db.execute(select(TrainService, Train).join(Train, Train.id == TrainService.train_id)
                      .join(TimetableVersion, TimetableVersion.id == TrainService.timetable_version_id)
                      .where(TrainService.status == "published", TimetableVersion.status == "published")).all()

    def station(hub_id, printed: Optional[str], near: dict):
        """The nearby station a train starts or ends at: its linked hub, else the one its printed name begins."""
        if hub_id in near:
            return hub_id
        if hub_id is None and printed:
            for hid, (_, h) in near.items():
                if h.name_bn and h.name_bn.startswith(printed):
                    return hid
        return None

    found = []
    for svc, train in rows:
        o, d = station(svc.origin_hub_id, svc.origin_name, sa), station(svc.destination_hub_id, svc.destination_name, sb)
        if o is None or d is None:
            continue
        dep, arr = svc.departure_time, svc.arrival_time
        if not dep or not arr:
            continue
        mins = int(arr[:2]) * 60 + int(arr[3:]) + 1440 * (svc.arrival_day_offset or 0) - (int(dep[:2]) * 60 + int(dep[3:]))
        if mins <= 0:
            mins += 1440
        found.append((mins, svc, train, o, d))
    if not found:
        return None
    found.sort(key=lambda x: (x[0], x[1].departure_time))
    mins, svc, train, o, d = found[0]
    da, ha = sa[o]
    dbb, hb = sb[d]
    rail_km = haversine_km((ha.latitude, ha.longitude), (hb.latitude, hb.longitude)) * 1.25
    fare = local_modes.getting_there("train", rail_km, None, rail_km)["fare"]
    off = f"; doesn't run on {WEEKDAYS[svc.off_day]}" if svc.off_day is not None else ""
    name = train.name_en or train.name_bn or "Train"
    legs = []
    if da > 1:
        legs.append(_local(a.label, _hub_name(ha), da))
    legs.append(Leg("train", _hub_name(ha), _hub_name(hb), mins, rail_km, fare=fare, depart=dep_time(svc),
                    arrive=svc.arrival_time, detail=f"{name} ({train.train_number}){off}",
                    source="Bangladesh Railway timetable (published); fare estimated, the official fare is on eticket.railway.gov.bd"))
    if dbb > 1:
        legs.append(_local(_hub_name(hb), b.label, dbb))
    alts = [{"train": f"{t.name_en or t.name_bn} ({t.train_number})", "depart": s_.departure_time, "arrive": s_.arrival_time,
             "minutes": m, "off_day": WEEKDAYS[s_.off_day] if s_.off_day is not None else None}
            for m, s_, t, _o, _d in found[1:5]]
    return Option("train", legs, note="Seats sell out: buy on eticket.railway.gov.bd (from 10 days before).",
                  alternatives=alts)


def dep_time(svc: TrainService) -> Optional[str]:
    return svc.departure_time


def _plane(db: Session, a: Point, b: Point) -> Optional[Option]:
    aa, ab = _nearest_hubs(db, "airport", a, 1), _nearest_hubs(db, "airport", b, 1)
    if not aa or not ab or aa[0][1].id == ab[0][1].id:
        return None
    (da, ha), (dbb, hb) = aa[0], ab[0]
    fly_km = haversine_km((ha.latitude, ha.longitude), (hb.latitude, hb.longitude))
    if fly_km < PLANE_MIN_KM:
        return None
    est = local_modes.getting_there("plane", None, None, fly_km)
    code = lambda h: f"{_hub_name(h)} ({h.iata_code})" if h.iata_code else _hub_name(h)  # noqa: E731
    legs = [_local(a.label, code(ha), da),
            Leg("plane", code(ha), code(hb), fly_km / 550 * 60 + 90, fly_km, fare=est["fare"],
                detail="Domestic flight; be at the airport about an hour before",
                source="flight time and fare estimated: Vromon holds no flight schedules")]
    legs.append(_local(code(hb), b.label, dbb))
    return Option("plane", legs, note=f"Check flights and fares with {AIRLINES}.")


def plan(db: Session, start: Point, dest: Point, *, preferred: list[str], by_budget: bool,
         budget_per_person: Optional[float], travellers: int) -> dict:
    road = _road(db, start, dest)
    options: list[Option] = [o for o in (_plane(db, start, dest), _trains(db, start, dest)) if o is not None]
    options += [_bus(db, start, dest, road), _car(start, dest, road)]
    missing = []
    if "launch" in preferred:
        missing.append("launch: Vromon doesn't have launch routes and timetables yet")
    pref = [m for m in preferred if m in MODES]
    for o in options:
        o.preferred = o.mode in pref
    chosen = [o for o in options if o.preferred]
    if chosen and not by_budget:
        best = min(chosen, key=lambda o: o.minutes())
        best.reason = "Your choice, and the fastest of the ways you picked"
    else:
        cap = (budget_per_person or 0) * TRANSPORT_SHARE / 2      # one way
        fits = [o for o in options if cap and o.cost_per_person(travellers) <= cap]
        if fits:
            best = min(fits, key=lambda o: o.minutes())
            best.reason = "The fastest way that fits your budget"
        else:
            best = min(options, key=lambda o: o.cost_per_person(travellers))
            best.reason = "The cheapest way" + (" (nothing faster fits your budget)" if cap else "")
    best.recommended = True
    order = sorted(options, key=lambda o: (not o.recommended, not o.preferred, o.minutes()))
    return {"from": start.label, "to": dest.label, "options": [o.out(travellers) for o in order], "missing": missing,
            "road_source": road[2]}

"""
Vromon — what the traveller asked for, as rules (trip planner step 4).

Every planner (quick and optimiser), every edit and the validator read the
traveller's needs from here, so they agree on them:

  - the window of each day: the usual start and end, the arrival time on the
    first day and the leaving time on the last day
  - busy times: windows on a day when nothing is planned
  - must-sees: a place, optionally on a given day and at a time of day
    (morning / afternoon / sunset / evening) or an exact time
  - pace: how many stops a day

`unplaced()` explains, for each must-see that isn't in the plan, why it can't
fit (closed then, outside your day, busy, another must-see then, budget, no
room) and suggests the nearest time that does fit. The app turns these into
the "doesn't fit" choices; nothing is dropped silently.

Times are minutes since midnight, local time. Sunset is computed from the
destination's coordinates (the standard NOAA approximation, about ±2 min);
every destination is in Bangladesh today (UTC+6, no daylight saving).
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import TYPE_CHECKING, Iterable, Optional

if TYPE_CHECKING:
    from app.models.models import Itinerary, ItineraryItem, Place, Trip

LOCAL_UTC_OFFSET_H = 6.0
MEAL_MINUTES = 60
BREAKFAST_LATEST = 10 * 60 + 30            # a day that starts later has no breakfast
LUNCH_RANGE = (12 * 60, 14 * 60)           # lunch starts in this range…
LUNCH_PREFERRED = 12 * 60 + 30
LUNCH_STRETCH = (11 * 60 + 30, 14 * 60 + 30)   # …or, when a must-see or busy time is in the way, here
DINNER_EARLIEST = 19 * 60
SPEED_KMH = 30.0                           # the straight-line estimate every planner uses
STEP = 5                                   # minutes between the start times tried

WHENS = ("morning", "afternoon", "sunset", "evening")
PACE_STOPS = {"Relaxed": 3, "Balanced": 4, "Packed": 6, "Active": 5}


def t2m(t: str) -> int:
    h, m = map(int, t.split(":"))
    return h * 60 + m


def m2t(m: int) -> str:
    return f"{m // 60:02d}:{m % 60:02d}"


def travel_min(a, b) -> int:
    """Travel minutes (rounded up) between two things with coordinates: by road when known."""
    from app.services.routing import ROADS, point_of
    pa, pb = point_of(a), point_of(b)
    if pa is None or pb is None:
        return 0
    return math.ceil(ROADS.travel(pa, pb).minutes - 1e-9)


def sunset_min(lat: float, lon: float, day: date, utc_offset_h: float = LOCAL_UTC_OFFSET_H) -> int:
    """Local sunset (minutes since midnight), NOAA general solar position approximation."""
    g = 2 * math.pi / 365 * (day.timetuple().tm_yday - 1)
    eqtime = 229.18 * (
        0.000075 + 0.001868 * math.cos(g) - 0.032077 * math.sin(g)
        - 0.014615 * math.cos(2 * g) - 0.040849 * math.sin(2 * g)
    )
    decl = (
        0.006918 - 0.399912 * math.cos(g) + 0.070257 * math.sin(g) - 0.006758 * math.cos(2 * g)
        + 0.000907 * math.sin(2 * g) - 0.002697 * math.cos(3 * g) + 0.00148 * math.sin(3 * g)
    )
    phi = math.radians(lat)
    cos_ha = math.cos(math.radians(90.833)) / (math.cos(phi) * math.cos(decl)) - math.tan(phi) * math.tan(decl)
    ha = math.degrees(math.acos(max(-1.0, min(1.0, cos_ha))))
    utc = 720 - 4 * (lon - ha) - eqtime
    return int(round(utc + utc_offset_h * 60)) % (24 * 60)


def sunrise_min(lat: float, lon: float, day: date, utc_offset_h: float = LOCAL_UTC_OFFSET_H) -> int:
    """Local sunrise (minutes since midnight): the morning twin of sunset_min."""
    sunset = sunset_min(lat, lon, day, utc_offset_h)
    # Solar noon is halfway between sunrise and sunset
    g = 2 * math.pi / 365 * (day.timetuple().tm_yday - 1)
    eqtime = 229.18 * (
        0.000075 + 0.001868 * math.cos(g) - 0.032077 * math.sin(g)
        - 0.014615 * math.cos(2 * g) - 0.040849 * math.sin(2 * g)
    )
    solar_noon = 720 - 4 * lon - eqtime + utc_offset_h * 60
    return int(round(2 * solar_noon - sunset)) % (24 * 60)


# ---------------------------------------------------------------------------
# The rules of one trip
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class MustSee:
    place_id: int
    day: Optional[int] = None        # 1-based; None = any day
    when: Optional[str] = None       # morning / afternoon / sunset / evening
    at: Optional[int] = None         # exact start (minutes); instead of `when`

    @property
    def timed(self) -> bool:
        return self.when is not None or self.at is not None

    def as_dict(self) -> dict:
        return {"place_id": self.place_id, "day": self.day, "when": self.when, "at": m2t(self.at) if self.at is not None else None}


@dataclass(frozen=True)
class Busy:
    day: int
    start: int
    end: int
    label: Optional[str] = None


@dataclass
class Block:
    """Something fixed on a day that visits must not overlap."""
    start: int
    end: int
    point: object = None             # where it happens (for travel), if known
    kind: str = "busy"               # busy / breakfast / must / kept


def parse_must_sees(raw: Iterable[dict]) -> list[MustSee]:
    out, seen = [], set()
    for m in raw or []:
        pid = int(m["place_id"])
        if pid in seen:
            continue
        seen.add(pid)
        at = m.get("at")
        out.append(MustSee(pid, m.get("day"), m.get("when") if not at else None, t2m(at) if at else None))
    return out


def parse_busy(raw: Iterable[dict]) -> list[Busy]:
    return [Busy(int(b["day"]), t2m(b["start"]), t2m(b["end"]), b.get("label") or None) for b in raw or []]


@dataclass
class TripRules:
    num_days: int
    start: int                                   # usual day start
    end: int                                     # usual day end
    arrive: Optional[int] = None                 # first day
    leave: Optional[int] = None                  # last day
    must_sees: list[MustSee] = field(default_factory=list)
    busy: list[Busy] = field(default_factory=list)
    stops_per_day: int = 4
    first_date: Optional[date] = None
    latlon: Optional[tuple[float, float]] = None

    # -- days ---------------------------------------------------------------
    def window(self, day: int) -> tuple[int, int]:
        """When this day starts and ends: the arrival and leaving times shorten the first and last day."""
        s, e = self.start, self.end
        if day == 1 and self.arrive is not None:
            s = max(s, self.arrive)
        if day == self.num_days and self.leave is not None:
            e = min(e, self.leave)
        return s, e

    def busy_on(self, day: int) -> list[Busy]:
        return [b for b in self.busy if b.day == day]

    def has_breakfast(self, day: int) -> bool:
        s, e = self.window(day)
        return s <= BREAKFAST_LATEST and s + MEAL_MINUTES <= e and not _overlaps(s, s + MEAL_MINUTES, self.busy_blocks(day))

    def activity_start(self, day: int) -> int:
        """The earliest a visit can start: after breakfast, when the day has one."""
        s, _ = self.window(day)
        return s + MEAL_MINUTES if self.has_breakfast(day) else s

    def busy_blocks(self, day: int) -> list[Block]:
        return [Block(b.start, b.end, None, "busy") for b in self.busy_on(day)]

    def sunset(self, day: int) -> int:
        if self.latlon is None or self.first_date is None:
            return 17 * 60 + 45
        return sunset_min(self.latlon[0], self.latlon[1], self.first_date + timedelta(days=day - 1))

    # -- must-sees ------------------------------------------------------------
    def must_ids(self) -> set[int]:
        return {m.place_id for m in self.must_sees}

    def must_for(self, place_id: int) -> Optional[MustSee]:
        return next((m for m in self.must_sees if m.place_id == place_id), None)

    def days_for(self, m: MustSee) -> list[int]:
        return [m.day] if m.day else list(range(1, self.num_days + 1))

    def wanted_range(self, m: MustSee, duration: int, day: int) -> tuple[int, int]:
        """The start times the traveller asked for (before opening hours and the day are applied)."""
        if m.at is not None:
            return m.at, m.at
        if m.when == "morning":
            return 0, 11 * 60 + 30
        if m.when == "afternoon":
            return 12 * 60, 16 * 60 + 30
        if m.when == "evening":
            return 17 * 60 + 30, 23 * 60
        if m.when == "sunset":
            ss = self.sunset(day)
            # there for the sunset: arrive at least 15 min before, stay until just after
            return (ss - duration + 10, ss - 15) if duration >= 25 else (ss - 15, ss - 15)
        return 0, 24 * 60

    def start_range(self, m: MustSee, place, day: int, hotel=None) -> tuple[Optional[tuple[int, int]], Optional[dict]]:
        """
        The feasible start times of a must-see on a day (opening hours and the day window
        applied), or None with the reason: {"code": ..., and what explains it}.
        """
        dur = duration_of(place)
        lo, hi = self.wanted_range(m, dur, day)
        opens, closes = t2m(place.opening_time), t2m(place.closing_time)
        lo2, hi2 = max(lo, opens), min(hi, closes - dur)
        if lo2 > hi2:
            if lo > closes - dur:
                return None, {"code": "closes_before", "closes": m2t(closes), **self._wanted(m, day)}
            return None, {"code": "opens_after", "opens": m2t(opens), **self._wanted(m, day)}
        s, e = self.window(day)
        first = self.activity_start(day) + travel_min(hotel, place)
        lo3, hi3 = max(lo2, first), min(hi2, e - dur)
        if lo3 > hi3:
            if lo2 > e - dur:
                if day == self.num_days and self.leave is not None and e == self.leave:
                    return None, {"code": "leave", "leave": m2t(self.leave)}
                return None, {"code": "day_ends", "end": m2t(e)}
            if day == 1 and self.arrive is not None and s == self.arrive:
                return None, {"code": "arrive", "arrive": m2t(self.arrive)}
            return None, {"code": "day_starts", "start": m2t(s)}
        return (lo3, hi3), None

    def _wanted(self, m: MustSee, day: int) -> dict:
        if m.when == "sunset":
            return {"wanted": "sunset", "sunset": m2t(self.sunset(day))}
        if m.at is not None:
            return {"wanted": "at", "at": m2t(m.at)}
        return {"wanted": m.when or "any"}


def duration_of(place) -> int:
    return int(round(place.average_visit_duration * 60))


def _overlaps(s: int, e: int, blocks: Iterable[Block]) -> bool:
    return any(s < b.end and b.start < e for b in blocks)


def free_start(
    lo: int, hi: int, dur: int, blocks: list[Block], point=None, prefer: Optional[int] = None,
) -> Optional[int]:
    """
    A start in [lo, hi] where the visit overlaps no block, with travel to and from
    neighbouring blocks that have a place. The start closest to `prefer` (default: the
    earliest) wins.
    """
    def ok(s: int) -> bool:
        for b in blocks:
            gap_in = travel_min(b.point, point) if b.point is not None else 0
            gap_out = gap_in
            if s < b.end + gap_in and b.start < s + dur + gap_out:
                return False
        return True

    # Round times (every 5 minutes); an exact time that isn't on the grid stays as it is
    first = -(-lo // STEP) * STEP
    starts = list(range(first, hi + 1, STEP)) or ([lo] if lo <= hi else [])
    target = lo if prefer is None else prefer
    for s in sorted(starts, key=lambda x: (abs(x - target), x)):
        if ok(s):
            return s
    return None


def rules_for(trip: "Trip", destination=None) -> TripRules:
    pref, cons = trip.preference, trip.constraints
    return TripRules(
        num_days=trip.num_days,
        start=t2m(pref.preferred_start_time if pref else "09:00"),
        end=t2m(pref.preferred_end_time if pref else "20:00"),
        arrive=t2m(pref.arrive_time) if pref and pref.arrive_time else None,
        leave=t2m(pref.leave_time) if pref and pref.leave_time else None,
        must_sees=parse_must_sees(cons.must_sees) if cons else [],
        busy=parse_busy(cons.busy) if cons else [],
        stops_per_day=cons.max_activities_per_day if cons else 4,
        first_date=trip.start_date,
        latlon=(destination.latitude, destination.longitude) if destination is not None else None,
    )


def load_rules(db, trip: "Trip") -> TripRules:
    from app.models.models import Destination
    dest = db.query(Destination).filter(Destination.name == trip.destination).first()
    return rules_for(trip, dest)


# ---------------------------------------------------------------------------
# Meals around the fixed parts of a day
# ---------------------------------------------------------------------------

def meal_starts(rules: TripRules, day: int, blocks: list[Block]) -> dict[str, Optional[int]]:
    """
    Start of breakfast, lunch and dinner on a day (None = the day has no room or time for it),
    avoiding busy times and must-sees already placed.
    """
    s, e = rules.window(day)
    out: dict[str, Optional[int]] = {"Breakfast": s if rules.has_breakfast(day) else None}
    taken = list(blocks) + ([Block(s, s + MEAL_MINUTES, None, "breakfast")] if out["Breakfast"] is not None else [])

    def first_fit(lo: int, hi: int, prefer: Optional[int] = None) -> Optional[int]:
        hi = min(hi, e - MEAL_MINUTES)
        lo = max(lo, rules.activity_start(day) if out["Breakfast"] is not None else s)
        if lo > hi:
            return None
        return free_start(lo, hi, MEAL_MINUTES, [Block(b.start, b.end) for b in taken], prefer=prefer)

    lunch = first_fit(*LUNCH_RANGE, prefer=LUNCH_PREFERRED)
    if lunch is None:
        lunch = first_fit(*LUNCH_STRETCH, prefer=LUNCH_PREFERRED)
    out["Lunch"] = lunch
    if lunch is not None:
        taken.append(Block(lunch, lunch + MEAL_MINUTES, None, "meal"))
    out["Dinner"] = first_fit(DINNER_EARLIEST, 23 * 60)
    return out


# ---------------------------------------------------------------------------
# Must-sees with a time: placed first (the quick planner)
# ---------------------------------------------------------------------------

@dataclass
class Placement:
    must: MustSee
    place: object
    day: int
    start: int
    note: Optional[str] = None       # why it's there, when it isn't a must-see (a sunset photo stop)

    @property
    def end(self) -> int:
        return self.start + duration_of(self.place)


def place_timed(
    rules: TripRules, places: dict[int, object], hotel=None, extra: Optional[dict[int, list[Block]]] = None,
) -> list[Placement]:
    """
    Fix every must-see that has a time (or an exact start) on a day, before anything
    else is planned. A must-see that can't be placed is left for `unplaced()` to explain.
    """
    placed: list[Placement] = []
    timed = [m for m in rules.must_sees if m.timed and m.place_id in places]
    # the most constrained first: a given day and an exact time, then a day, then any day
    timed.sort(key=lambda m: (m.day is None, m.at is None))
    for m in timed:
        place = places[m.place_id]
        dur = duration_of(place)
        best: Optional[tuple[int, int]] = None
        # any day: the least busy day that fits
        days = sorted(rules.days_for(m), key=lambda d: (sum(1 for p in placed if p.day == d), d))
        for d in days:
            rng, _ = rules.start_range(m, place, d, hotel)
            if rng is None:
                continue
            blocks = rules.busy_blocks(d) + (extra or {}).get(d, []) + [
                Block(p.start, p.end, p.place, "must") for p in placed if p.day == d
            ]
            # at sunset: as late as it can be (there until sunset, and the hours before stay free)
            prefer = rng[1] if m.when == "sunset" else None
            start = free_start(rng[0], rng[1], dur, blocks, place, prefer)
            if start is not None:
                best = (d, start)
                break
        if best is not None:
            placed.append(Placement(m, place, best[0], best[1]))
    return placed


# ---------------------------------------------------------------------------
# What isn't in the plan, and why
# ---------------------------------------------------------------------------

def in_window(rules: TripRules, m: MustSee, item: "ItineraryItem", day: int) -> bool:
    """True when a scheduled must-see is where the traveller asked for it."""
    if m.day and m.day != day:
        return False
    if not m.timed or item.place is None:
        return True
    lo, hi = rules.wanted_range(m, duration_of(item.place), day)
    return lo <= t2m(item.start_time) <= hi


def unplaced(
    rules: TripRules,
    days: list["Itinerary"],
    places: dict[int, object],
    hotel=None,
    daily_cap: float = 0.0,
) -> list[dict]:
    """Every must-see missing from the plan, with the reason and the nearest time that fits."""
    in_plan = {
        i.place_id: (d.day_number, i)
        for d in days for i in d.items if i.item_type == "activity" and i.place_id
    }
    by_day = {d.day_number: d for d in days}
    out = []
    for m in rules.must_sees:
        if m.place_id in in_plan:
            continue
        place = places.get(m.place_id)
        if place is None:
            continue
        reason = _why(rules, m, place, by_day, hotel, daily_cap)
        out.append({
            **m.as_dict(),
            "name": place.name,
            "reason": reason,
            "suggestion": suggest(rules, m, place, by_day, hotel),
        })
    return out


def _fixed_blocks(rules: TripRules, day: int, itinerary: Optional["Itinerary"], skip_place: int) -> list[Block]:
    """Busy times, plus the must-sees and kept stops already on the day (they won't move)."""
    blocks = rules.busy_blocks(day)
    if itinerary is not None:
        must = rules.must_ids()
        for i in itinerary.items:
            if i.place_id == skip_place:
                continue
            if i.pinned or (i.item_type == "activity" and i.place_id in must):
                point = i.place if i.item_type == "activity" else i.restaurant
                blocks.append(Block(t2m(i.start_time), t2m(i.end_time), point, "must" if i.place_id in must else "kept"))
    return blocks


def _why(rules: TripRules, m: MustSee, place, by_day: dict, hotel, daily_cap: float) -> dict:
    reasons = []
    for d in rules.days_for(m):
        rng, why = rules.start_range(m, place, d, hotel)
        if rng is None:
            reasons.append(why)
            continue
        dur = duration_of(place)
        if free_start(rng[0], rng[1], dur, rules.busy_blocks(d), place) is None:
            label = next((b.label for b in rules.busy_on(d) if b.label), None)
            reasons.append({"code": "busy", **({"label": label} if label else {})})
            continue
        fixed = _fixed_blocks(rules, d, by_day.get(d), m.place_id)
        if free_start(rng[0], rng[1], dur, fixed, place) is None:
            other = next((b for b in fixed if b.kind != "busy" and rng[0] < b.end and b.start < rng[1] + dur), None)
            reasons.append({"code": "clash", "other": getattr(other.point, "name", "") if other else ""})
            continue
        day = by_day.get(d)
        if daily_cap and day is not None and sum(i.cost or 0.0 for i in day.items) + place.estimated_cost > daily_cap + 1e-6:
            reasons.append({"code": "budget"})
            continue
        reasons.append({"code": "full"})
    codes = {r["code"] for r in reasons}
    if len(reasons) == 1 or len(codes) == 1:
        return {**reasons[0], **({"day": m.day} if m.day else {})}
    # different reasons on different days: the plain one
    return {"code": "full"}


def suggest(rules: TripRules, m: MustSee, place, by_day: dict, hotel=None) -> Optional[dict]:
    """
    The nearest change that fits: the same day at another time, then the same time on
    another day, then any day. Returns {"day", "at"} or None.
    """
    dur = duration_of(place)

    def fits(day: int, rule: MustSee) -> Optional[int]:
        rng, _ = rules.start_range(rule, place, day, hotel)
        if rng is None:
            return None
        lo, hi = rules.wanted_range(m, dur, day)
        target = (lo + hi) // 2 if m.timed else None
        return free_start(rng[0], rng[1], dur, _fixed_blocks(rules, day, by_day.get(day), m.place_id), place, target)

    loose = MustSee(m.place_id)
    tries: list[tuple[int, MustSee]] = []
    days = rules.days_for(m)
    if m.timed:
        tries += [(d, loose) for d in days]                                                  # same day, another time
        tries += [(d, m) for d in range(1, rules.num_days + 1) if d not in days]             # same time, another day
    tries += [(d, loose) for d in range(1, rules.num_days + 1) if (d, loose) not in tries]  # any day, any time
    for d, rule in tries:
        start = fits(d, rule)
        if start is not None:
            return {"day": d, "at": m2t(start)}
    return None


def reason_text(reason: dict, name: str) -> str:
    """English fallback for clients that don't build the text themselves."""
    code = reason.get("code")
    wanted = {"sunset": f"sunset (about {reason.get('sunset')})", "at": reason.get("at"),
              "morning": "the morning", "afternoon": "the afternoon", "evening": "the evening"}.get(reason.get("wanted"), "then")
    return {
        "closes_before": f"{name} closes at {reason.get('closes')}, before {wanted}.",
        "opens_after": f"{name} opens at {reason.get('opens')}, after {wanted}.",
        "day_ends": f"Your day ends at {reason.get('end')}.",
        "day_starts": f"Your day starts at {reason.get('start')}.",
        "arrive": f"You arrive at {reason.get('arrive')}.",
        "leave": f"You leave at {reason.get('leave')}.",
        "busy": "You're busy then" + (f" ({reason['label']})." if reason.get("label") else "."),
        "clash": f"{reason.get('other') or 'Another must-see'} is at the same time.",
        "budget": "It would go over your daily budget.",
    }.get(code, "There's no room left in the plan.")

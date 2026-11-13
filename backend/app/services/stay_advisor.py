"""
Stay advisor (docs/trip-upgrades, step 4; decisions D4, D5): "sleep somewhere else for nights a-b?"

For each later run of nights now at one hotel (never a night that has already started), the
hotels that could take it: priced, real-named, rated 3.5 or more when the rating is known, near
those days' stops, or for a day far out of town the nearest ones to its stops (a must-see town:
Mongla for the Sundarbans). Each is worked out against the plan as it is:

- money_saved = (current price - its price) x nights x rooms
                - the move's transfer fare + the rides from the stay that get cheaper (or dearer)
  (None when the current hotel's price isn't known: then only the road time can make the case);
- minutes_saved = the road time from and back to the stay on the days it touches, now minus then,
                  - the transfer's minutes - 45 min of packing and checking out and in per extra move;
- extra_moves = the moves between stays it adds (or saves).

It's suggested only when it clearly wins (D4): money_saved >= max(Tk 1,000, 10% of that stay) and road
time not worse by more than 30 min, or road time saved >= 60 min and money not worse by more than
Tk 500 a night. A move every night (a one-night stay between two moves) only for 2 h a night or more.
At most 2 are shown, the best first by money + minutes x Tk 5 (D5), never two for the same night.

The traveller's answers are kept (stay_suggestions): "not now" hides it until the plan changes
(its fingerprint), "don't suggest this" until its saving grows by more than 25%.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import TYPE_CHECKING, Optional

if TYPE_CHECKING:
    from sqlalchemy.orm import Session
    from app.models.models import Hotel, Itinerary, StaySuggestion, Trip

TIME_VALUE = 5            # Tk a minute of road time, for the group (D5)
HASSLE_MIN = 45           # packing, checking out and in, per move (D4)
NEAR_KM = 3.0             # a hotel this close to the days' stops (or their middle)
FAR_KM = 25.0             # a day whose stops are this far from where you stay is "out of town"…
GATEWAY_KM = 40.0         # …and the nearest hotels to its stops count, this far at most
GATEWAYS = 3
MIN_SAVING = 1000.0       # D4: at least Tk 1,000…
MIN_SHARE = 0.10          # …or 10% of that stay, whichever is more…
WORSE_MIN = 30            # …with road time not worse by more than 30 min
TIME_RULE_MIN = 60        # or: road time saved >= 60 min…
WORSE_PER_NIGHT = 500     # …and money not worse by more than Tk 500 a night
HOP_MIN_PER_NIGHT = 120   # a move every night only for this much a night
MAX_SHOWN = 2
GROWTH = 1.25             # a dismissed suggestion returns when its saving grows by more than 25%
MAX_NIGHTS = 14           # runs of nights are looked at within the first 14


class AdviceError(Exception):
    def __init__(self, message: str, status: int = 422):
        super().__init__(message)
        self.message = message
        self.status = status


@dataclass
class Option:
    first_night: int
    last_night: int
    hotel: "Hotel"
    current: "Hotel"
    money_saved: Optional[float]
    minutes_saved: int
    extra_moves: int
    parts: dict = field(default_factory=dict)   # the arithmetic, for "Why?"

    @property
    def nights(self) -> int:
        return self.last_night - self.first_night + 1

    @property
    def score(self) -> float:
        return (self.money_saved or 0.0) + self.minutes_saved * TIME_VALUE

    def key(self) -> tuple:
        return (self.first_night, self.last_night, self.hotel.id)


# ---------------------------------------------------------------------------
# Nights and stays
# ---------------------------------------------------------------------------

def _stay_key(b) -> tuple:
    return (b.kind, b.hotel.id if b.hotel is not None else None, b.lat, b.lon)


def _per_night(blocks: list, nights: int) -> list:
    from app.services.stays import _block_for
    return [_block_for(blocks, n) for n in range(1, nights + 1)]


def _runs(per_night: list) -> list:
    """Consecutive nights with the same stay, as stays again."""
    from app.services.stays import StayBlock
    out: list = []
    for n, b in enumerate(per_night, start=1):
        if out and _stay_key(out[-1]) == _stay_key(b):
            last = out[-1]
            out[-1] = StayBlock(last.first_night, n, last.kind, last.hotel, last.label, last.lat, last.lon)
        else:
            out.append(StayBlock(n, n, b.kind, b.hotel, b.label, b.lat, b.lon))
    return out


def _moves(per_night: list) -> list[int]:
    """The nights you sleep somewhere new (2..nights)."""
    return [n for n in range(2, len(per_night) + 1) if _stay_key(per_night[n - 1]) != _stay_key(per_night[n - 2])]


def _short_gaps(moves: list[int]) -> int:
    """Moves one night apart (a one-night stay between two moves): hopping."""
    return sum(1 for x, y in zip(moves, moves[1:]) if y - x < 2)


def first_open_night(trip: "Trip", today: Optional[date] = None) -> int:
    """The first night that hasn't started: a night on today's date or before has (the trip starts today: not night 1)."""
    today = today or date.today()
    if trip.start_date is None or today < trip.start_date:
        return 1
    return (today - trip.start_date).days + 2


# ---------------------------------------------------------------------------
# Candidates
# ---------------------------------------------------------------------------

def _km(a: tuple, b: tuple) -> float:
    from app.services.routing.roads import haversine_km
    return haversine_km(a, b)


def _day_points(day: "Itinerary") -> list[tuple]:
    return [(i.place.latitude, i.place.longitude) for i in day.items
            if i.item_type == "activity" and i.place is not None and i.place.latitude is not None]


def candidates(db: "Session", trip: "Trip", days: list["Itinerary"], current: "Hotel") -> list["Hotel"]:
    """Hotels that could take these days' nights: near their stops, or for a day out of town the nearest ones."""
    from app.models.models import Hotel
    from app.services.stays import HOTEL_RADIUS_KM, destination_point, looks_like_a_hotel
    pts = [p for d in days for p in _day_points(d)]
    if not pts:
        return []
    middle = (sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts))
    pad = GATEWAY_KM / 100 + 0.05
    rows = (
        db.query(Hotel)
        .filter(Hotel.is_active == True, Hotel.price_known == True, Hotel.price_per_night > 0,  # noqa: E712
                Hotel.latitude.between(min(p[0] for p in pts) - pad, max(p[0] for p in pts) + pad),
                Hotel.longitude.between(min(p[1] for p in pts) - pad, max(p[1] for p in pts) + pad))
        .all()
    )
    centre = destination_point(db, trip)

    def fits(h: "Hotel") -> bool:
        return (
            h.id != current.id
            and (h.currency or "BDT") == (current.currency or "BDT") == (trip.currency or "BDT")
            and looks_like_a_hotel(h.name, h.destination_name)
            and (not h.rating_known or (h.rating or 0) >= 3.5)
            # where a stay may be (as PUT /stays checks)
            and (h.destination_name == trip.destination
                 or (centre is not None and _km(centre, (h.latitude, h.longitude)) <= HOTEL_RADIUS_KM))
        )

    ok = [h for h in rows if fits(h)]
    near = [h for h in ok if _km(middle, (h.latitude, h.longitude)) <= NEAR_KM
            or any(_km(p, (h.latitude, h.longitude)) <= NEAR_KM for p in pts)]
    out = {h.id: h for h in near}
    # A day out of town (a must-see far from where you stay): the nearest hotels to its stops
    here = (current.latitude, current.longitude)
    for d in days:
        dp = _day_points(d)
        if not dp or min(_km(here, p) for p in dp) <= FAR_KM:
            continue
        dist = sorted(((min(_km(p, (h.latitude, h.longitude)) for p in dp), h) for h in ok), key=lambda x: x[0])
        for km, h in dist[:GATEWAYS]:
            if km <= GATEWAY_KM:
                out.setdefault(h.id, h)
    return list(out.values())


# ---------------------------------------------------------------------------
# The numbers
# ---------------------------------------------------------------------------

def _day_road(day: "Itinerary", bases, travellers: int) -> tuple[float, float]:
    """
    Minutes from where the day starts to its first stop and from its last stop back (as the plan
    shows them), and the day's ride fares as the budget counts them (so a saving matches the budget).
    """
    from app.services.budget.service import day_legs
    from app.services.stays import return_leg, start_leg
    n = day.day_number
    minutes = 0.0
    for leg in (start_leg(day, bases.start(n), travellers), return_leg(day, bases.end(n), travellers)):
        if leg is not None:
            minutes += leg["minutes"]
    return minutes, sum(leg["cost"] for leg in day_legs(day, bases, travellers))


def _transfers(per_night: list, base_of, travellers: int) -> tuple[float, float, list[dict]]:
    """Every move between stays: one leg between the two, by the mode a local would pick (minutes, fare)."""
    from app.services.budget.service import _leg
    from app.services.routing import ROADS, point_of
    minutes = cost = 0.0
    legs = []
    for n in _moves(per_night):
        a, b = base_of(n - 1), base_of(n)
        if a is None or b is None or point_of(a) is None or point_of(b) is None:
            continue
        t = ROADS.travel(point_of(a), point_of(b))
        leg = _leg(a, b, None, travellers)
        minutes += t.minutes
        cost += leg["cost"]
        legs.append({"night": n, "minutes": round(t.minutes), "km": round(t.km, 1), "mode": leg["mode"], "cost": round(leg["cost"])})
    return minutes, cost, legs


def evaluate(db: "Session", trip: "Trip", blocks: list, first: int, last: int, hotel: "Hotel",
             days: Optional[dict] = None, now=None) -> Option:
    """The numbers for sleeping at `hotel` for nights first..last instead of the stay there now."""
    from app.services import stays
    from app.services.stays import StayBlock
    nights = trip.num_nights
    n_trav = trip.num_travelers
    rooms = -(-n_trav // 2)
    days = days or {d.day_number: d for d in trip.itinerary_days}
    old = _per_night(blocks, nights)
    current = old[first - 1].hotel
    new = list(old)
    for n in range(first, last + 1):
        new[n - 1] = StayBlock(n, n, "hotel", hotel)
    now = now or stays.bases(db, trip, blocks)
    then = stays.bases(db, trip, _runs(new))

    # The road from and back to the stay, on the days whose start or end changes
    touched = [d for n, d in sorted(days.items())
               if (_base_key(now.start(n)), _base_key(now.end(n))) != (_base_key(then.start(n)), _base_key(then.end(n)))]
    road_now = fares_now = road_then = fares_then = 0.0
    for d in touched:
        m, c = _day_road(d, now, n_trav)
        road_now, fares_now = road_now + m, fares_now + c
        m, c = _day_road(d, then, n_trav)
        road_then, fares_then = road_then + m, fares_then + c

    # Moving between stays: a leg each time, and the hassle
    night_base_now = lambda n: now.end(n)    # noqa: E731  (the stay of night n is where day n ends)
    night_base_then = lambda n: then.end(n)  # noqa: E731
    t_old_min, t_old_cost, _ = _transfers(old, night_base_now, n_trav)
    t_new_min, t_new_cost, t_legs = _transfers(new, night_base_then, n_trav)
    moves_old, moves_new = len(_moves(old)), len(_moves(new))
    extra = moves_new - moves_old
    minutes = round(road_now - road_then - (t_new_min - t_old_min) - HASSLE_MIN * extra)

    count = last - first + 1
    priced = current is not None and current.price_known and (current.currency or "BDT") == (hotel.currency or "BDT")
    stay_now = current.price_per_night * count * rooms if priced else None
    stay_then = hotel.price_per_night * count * rooms
    money = None
    if stay_now is not None:
        money = round(stay_now - stay_then - (t_new_cost - t_old_cost) + (fares_now - fares_then))
    parts = {
        "rooms": rooms, "nights": count,
        "price_now": current.price_per_night if priced else None, "price_then": hotel.price_per_night,
        "stay_now": round(stay_now) if stay_now is not None else None, "stay_then": round(stay_then),
        "road_now": round(road_now), "road_then": round(road_then),
        "fares_now": round(fares_now), "fares_then": round(fares_then),
        "transfer_minutes": round(t_new_min - t_old_min), "transfer_cost": round(t_new_cost - t_old_cost),
        "transfers": t_legs, "hassle_minutes": HASSLE_MIN * extra,
        "days": [d.day_number for d in touched],
        "hopping": _short_gaps(_moves(new)) > _short_gaps(_moves(old)),
        "time_value": TIME_VALUE,
    }
    return Option(first, last, hotel, current, money, minutes, extra, parts)


def _base_key(b) -> tuple:
    return (b.kind, b.latitude, b.longitude) if b is not None else (None,)


def worth_it(o: Option) -> bool:
    """D4: it clearly wins on money, or on road time; a move every night only for a lot of time."""
    money, minutes = o.money_saved, o.minutes_saved
    stay_now = o.parts.get("stay_now") or 0
    by_money = money is not None and money >= max(MIN_SAVING, MIN_SHARE * stay_now) and minutes >= -WORSE_MIN
    by_time = minutes >= TIME_RULE_MIN and (money is None or money >= -WORSE_PER_NIGHT * o.nights)
    if not (by_money or by_time):
        return False
    if o.parts.get("hopping") and minutes < HOP_MIN_PER_NIGHT * o.nights:
        return False
    return True


def options(db: "Session", trip: "Trip", today: Optional[date] = None) -> list[Option]:
    """Every move worth suggesting now (best first), before the traveller's answers."""
    from app.services import stays
    from app.services.routing import ROADS, point_of
    nights = trip.num_nights
    if nights < 1 or not trip.itinerary_days:
        return []
    blocks = stays.blocks_of(db, trip)
    if not blocks:
        return []
    days = {d.day_number: d for d in trip.itinerary_days}
    start = first_open_night(trip, today)
    per = _per_night(blocks, nights)
    runs = []
    for a in range(max(start, 1), min(nights, MAX_NIGHTS) + 1):
        cur = per[a - 1]
        if cur.kind != "hotel" or cur.hotel is None:
            continue
        for b in range(a, min(nights, MAX_NIGHTS) + 1):
            if _stay_key(per[b - 1]) != _stay_key(cur):
                break
            runs.append((a, b, cur.hotel))
    if not runs:
        return []
    # The hotels each run could go to, and road data for every point involved (one request at most)
    cands = {}
    for a, b, cur in runs:
        ds = [days[n] for n in range(a, min(b + 1, trip.num_days) + 1) if n in days]
        cands[(a, b)] = candidates(db, trip, ds, cur)
    now = stays.bases(db, trip, blocks)
    pts = {point_of(now.start(n)) for n in days} | {point_of(now.end(n)) for n in days}
    for d in days.values():
        for side in (stays.first_point(d)[1], stays.last_point(d)[1]):
            pts.add(point_of(side) if side is not None else None)
    for hs in cands.values():
        pts |= {point_of(h) for h in hs}
    try:
        ROADS.prepare(db, [p for p in pts if p is not None])
    except Exception:  # no road data: the planner's own estimate, as everywhere
        pass
    out = []
    for a, b, _cur in runs:
        for h in cands[(a, b)]:
            o = evaluate(db, trip, blocks, a, b, h, days, now)
            if worth_it(o):
                out.append(o)
    out.sort(key=lambda o: (-o.score, o.first_night, o.hotel.id))
    return out


# ---------------------------------------------------------------------------
# What the traveller sees, and their answers
# ---------------------------------------------------------------------------

def fingerprint(db: "Session", trip: "Trip") -> str:
    """The plan's state the suggestions were worked out for: stays, dates, travellers, stops, meals, hotel prices."""
    from app.models.models import Hotel
    from app.services import meals, stays
    days = sorted(trip.itinerary_days, key=lambda d: d.day_number)
    pts = [p for d in days for p in _day_points(d)]
    prices = []
    if pts:
        pad = GATEWAY_KM / 100 + 0.05
        prices = sorted(
            (h.id, h.price_per_night, h.price_known, h.is_active)
            for h in db.query(Hotel).filter(
                Hotel.latitude.between(min(p[0] for p in pts) - pad, max(p[0] for p in pts) + pad),
                Hotel.longitude.between(min(p[1] for p in pts) - pad, max(p[1] for p in pts) + pad),
                Hotel.price_known == True)  # noqa: E712
        )
    state = {
        "stays": stays.as_items(stays.blocks_of(db, trip)),
        "dates": [str(trip.start_date), str(trip.end_date)],
        "travellers": trip.num_travelers,
        "days": [[(i.item_type, i.place_id, i.restaurant_id, i.start_time) for i in sorted(d.items, key=lambda i: i.order_index)] for d in days],
        "meals": meals.plans_by_day(trip),
        "prices": prices,
    }
    return hashlib.sha256(json.dumps(state, sort_keys=True, default=str).encode()).hexdigest()


def _numbers(o: Option) -> dict:
    return {"money_saved": o.money_saved, "minutes_saved": o.minutes_saved, "extra_moves": o.extra_moves,
            "score": o.score, "parts": o.parts, "current_hotel_id": o.current.id}


def _grew(old: dict, o: Option) -> bool:
    """A dismissed suggestion's saving grew by more than 25% (money or road time)."""
    def more(new: Optional[float], was: Optional[float]) -> bool:
        if new is None or new <= 0:
            return False
        return was is None or was <= 0 or new > was * GROWTH
    return more(o.money_saved, old.get("money_saved")) or more(o.minutes_saved, old.get("minutes_saved"))


def suggestions(db: "Session", trip: "Trip", today: Optional[date] = None) -> list["StaySuggestion"]:
    """
    The open suggestions (at most 2, best first, never two for the same night), worked out again only
    when the plan's fingerprint changed; the answers are kept. Doesn't commit.
    """
    from app.models.models import StaySuggestion
    fp = fingerprint(db, trip)
    rows = {(r.first_night, r.last_night, r.hotel_id): r for r in trip.stay_suggestions}
    cached = rows and all(r.fingerprint == fp for r in rows.values() if r.numbers.get("current"))
    if not (cached and any(r.numbers.get("current") for r in rows.values())):
        found = options(db, trip, today)
        keys = {o.key() for o in found}
        for r in rows.values():
            if (r.first_night, r.last_night, r.hotel_id) not in keys and r.numbers.get("current"):
                r.numbers = {**r.numbers, "current": False}
                r.fingerprint = fp
        for o in found:
            r = rows.get(o.key())
            if r is None:
                r = StaySuggestion(trip_id=trip.id, first_night=o.first_night, last_night=o.last_night, hotel_id=o.hotel.id,
                                   status="open", fingerprint=fp, money_saved=o.money_saved, minutes_saved=o.minutes_saved,
                                   extra_moves=o.extra_moves)
                r.hotel = o.hotel
                r.numbers = {**_numbers(o), "current": True}
                trip.stay_suggestions.append(r)
                rows[o.key()] = r
                continue
            # "Not now": back after the plan changed; "don't suggest this": back when the saving grew by > 25%
            if r.status == "not_now" and r.numbers.get("not_now_fp") != fp:
                r.status = "open"
            elif r.status == "dismissed" and _grew(r.numbers.get("dismissed_at") or {}, o):
                r.status = "open"
            elif r.status == "accepted":
                r.status = "open"   # it was taken, then the stays changed back
            keep = {k: v for k, v in r.numbers.items() if k in ("not_now_fp", "dismissed_at")}
            r.numbers = {**_numbers(o), **keep, "current": True}
            r.money_saved, r.minutes_saved, r.extra_moves, r.fingerprint = o.money_saved, o.minutes_saved, o.extra_moves, fp
        db.flush()
    shown: list = []
    taken: set[int] = set()
    live = [r for r in trip.stay_suggestions if r.numbers.get("current") and r.status == "open"]
    # No nagging: "not now" quiets those nights (any hotel) until the plan changes; "don't suggest this"
    # hides that hotel for those nights (and the runs around them) for good
    quiet = [r for r in trip.stay_suggestions if r.status == "not_now" and r.numbers.get("not_now_fp") == fp]
    gone = [r for r in trip.stay_suggestions if r.status == "dismissed"]

    def overlaps(a, b) -> bool:
        return a.first_night <= b.last_night and b.first_night <= a.last_night

    def muted(r) -> bool:
        return any(overlaps(q, r) for q in quiet) or any(g.hotel_id == r.hotel_id and overlaps(g, r) for g in gone)

    for r in sorted(live, key=lambda r: (-(r.numbers.get("score") or 0), r.first_night, r.hotel_id)):
        nights = set(range(r.first_night, r.last_night + 1))
        if nights & taken or muted(r):
            continue
        shown.append(r)
        taken |= nights
        if len(shown) == MAX_SHOWN:
            break
    return shown


def answer(db: "Session", trip: "Trip", sid: int, status: str) -> "StaySuggestion":
    """"Not now" or "don't suggest this". Doesn't commit."""
    row = next((r for r in trip.stay_suggestions if r.id == sid), None)
    if row is None:
        raise AdviceError("That suggestion isn't there any more.", 404)
    if status == "not_now":
        row.numbers = {**row.numbers, "not_now_fp": fingerprint(db, trip)}
    elif status == "dismissed":
        row.numbers = {**row.numbers, "dismissed_at": {"money_saved": row.money_saved, "minutes_saved": row.minutes_saved}}
    row.status = status
    db.flush()
    return row


def accept(db: "Session", trip: "Trip", sid: int) -> tuple["StaySuggestion", list[dict]]:
    """Sleep there for those nights: the stays are split (as PUT /stays would); returns the old stays for Undo."""
    from app.services import stays
    row = next((r for r in trip.stay_suggestions if r.id == sid), None)
    if row is None or row.status != "open":
        raise AdviceError("That suggestion isn't there any more.", 404)
    before = stays.blocks_of(db, trip)
    nights = trip.num_nights
    if row.last_night > nights:
        raise AdviceError("The trip's nights changed: this suggestion is out of date.", 409)
    per = _per_night(before, nights)
    for n in range(row.first_night, row.last_night + 1):
        per[n - 1] = stays.StayBlock(n, n, "hotel", row.hotel)
    wanted = stays.as_items(_runs(per))
    try:
        stays.replace(db, trip, stays.validate(db, trip, wanted))
    except stays.StayError as exc:
        raise AdviceError(exc.message, exc.status) from None
    row.status = "accepted"
    db.flush()
    return row, stays.as_items(before)


def out(row: "StaySuggestion", trip: "Trip") -> dict:
    """A suggestion for the API: the hotel, the stay it replaces, the numbers and how they add up."""
    h, n = row.hotel, row.numbers
    parts = n.get("parts") or {}
    from app.models.models import Hotel  # noqa: F401
    cur = next((s.hotel for s in trip.stays if s.hotel is not None and s.first_night <= row.first_night <= s.last_night), None)
    return {
        "id": row.id,
        "first_night": row.first_night,
        "last_night": row.last_night,
        "nights": row.last_night - row.first_night + 1,
        "day_number": row.first_night,
        "hotel": {"id": h.id, "name": h.name, "destination_name": h.destination_name, "price_per_night": h.price_per_night,
                  "currency": h.currency, "rating": h.rating, "rating_known": h.rating_known,
                  "latitude": h.latitude, "longitude": h.longitude},
        "current": {"id": cur.id, "name": cur.name, "price_per_night": cur.price_per_night if cur.price_known else None}
        if cur is not None else None,
        "money_saved": row.money_saved,
        "minutes_saved": row.minutes_saved,
        "extra_moves": row.extra_moves,
        "parts": parts,
    }


def first_night_date(trip: "Trip", night: int) -> date:
    return trip.start_date + timedelta(days=night - 1)

"""
Where the traveller sleeps, night by night, and where each day starts and ends
(docs/trip-upgrades, step 1; decisions D1–D3 and D11).

  - A trip's stays (`trip_stays`) cover its nights once: a hotel, a family or friend's home
    (`home`, no cost, private to the owner), no night there (`none`: day trips from the trip's
    start point), or not decided yet. A trip without stays sleeps in the hotel Vromon picks;
    planning a trip writes that choice down (`freeze`), so the hotel doesn't change under a plan.
  - Day d starts at the stay of night d−1 (day 1: night 1's) and ends at the stay of night d
    (the last day: the last night's, where the traveller leaves from). The way back counts
    inside the day: "finish by" means back at the stay (D3).
  - Picking a hotel nobody chose (D11): a priced one with a real name, at the budget's level or
    the nearest level, near the destination's centre; if none is priced, the best-rated real-named
    one, its cost unknown. Never a guessed price.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import TYPE_CHECKING, Iterable, Optional

if TYPE_CHECKING:
    from sqlalchemy.orm import Session
    from app.models.models import Hotel, Itinerary, Trip, User

KINDS = ("hotel", "home", "none", "undecided")
LEVELS = ("Budget", "Standard", "Luxury")
# A hotel nearer than this to the destination's centre can be a trip's stay
HOTEL_RADIUS_KM = 80.0
# Words a hotel's name has (a name that is only places, like "বয়রা,খুলনা", isn't a hotel's)
HOTEL_WORDS = (
    "hotel", "inn", "resort", "guest", "motel", "lodge", "residen", "rest house", "resthouse", "cottage",
    "hostel", "suite", "palace", "villa", "bungalow", "homestay", "home stay", "international", "boarding",
    "হোটেল", "রিসোর্ট", "গেস্ট", "আবাসিক", "বোর্ডিং", "রেস্ট হাউস", "কটেজ", "রিসোর্স",
)


class StayError(Exception):
    def __init__(self, message: str, status: int = 422):
        super().__init__(message)
        self.message = message
        self.status = status


# ---------------------------------------------------------------------------
# Where a day starts and ends
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class Base:
    """A day's start or end point. Has `latitude`/`longitude`, so it travels like a hotel or a place."""
    kind: str                       # hotel / home / none / undecided
    latitude: Optional[float]
    longitude: Optional[float]
    name: Optional[str] = None
    hotel_id: Optional[int] = None
    estimate: bool = False          # the destination's centre, standing in for a place not known yet

    def out(self, private: bool = False) -> dict:
        """For the API; `private`: a viewer who isn't the owner never learns where a home is (D2)."""
        if private and self.kind == "home":
            return {"kind": "home", "name": None, "latitude": None, "longitude": None, "hotel_id": None, "estimate": False}
        return {"kind": self.kind, "name": self.name, "latitude": self.latitude, "longitude": self.longitude,
                "hotel_id": self.hotel_id, "estimate": self.estimate}


@dataclass(frozen=True)
class StayBlock:
    first_night: int
    last_night: int
    kind: str
    hotel: Optional["Hotel"] = None
    label: Optional[str] = None
    lat: Optional[float] = None
    lon: Optional[float] = None

    @property
    def nights(self) -> int:
        return self.last_night - self.first_night + 1


class TripBases:
    """Each day's start and end, and the stays they come from."""

    def __init__(self, days: dict[int, tuple[Optional[Base], Optional[Base]]], blocks: list[StayBlock], nights: int):
        self._days = days
        self.blocks = blocks
        self.nights = nights

    def start(self, day: int) -> Optional[Base]:
        return self._days.get(day, (None, None))[0]

    def end(self, day: int) -> Optional[Base]:
        return self._days.get(day, (None, None))[1]

    @property
    def first_hotel(self) -> Optional["Hotel"]:
        """Night 1's hotel (the trip's `hotel` for app versions that know only one)."""
        b = self.blocks[0] if self.blocks else None
        return b.hotel if b is not None and b.kind == "hotel" else None


def start_of(bases, day: int):
    """The point a day starts from: from TripBases, or the one hotel older callers pass."""
    return bases.start(day) if isinstance(bases, TripBases) else bases


def end_of(bases, day: int):
    """The point a day ends at (the traveller is back there by "finish by")."""
    return bases.end(day) if isinstance(bases, TripBases) else bases


def _haversine_km(a: tuple[float, float], b: tuple[float, float]) -> float:
    (lat1, lon1), (lat2, lon2) = a, b
    p1, p2 = math.radians(lat1), math.radians(lat2)
    x = math.sin(math.radians(lat2 - lat1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lon2 - lon1) / 2) ** 2
    return 6371.0 * 2 * math.atan2(math.sqrt(x), math.sqrt(1 - x))


def destination_point(db: "Session", trip: "Trip") -> Optional[tuple[float, float]]:
    from app.models.models import Destination
    d = db.query(Destination).filter(Destination.name == trip.destination).first()
    return (d.latitude, d.longitude) if d is not None and d.latitude is not None and d.longitude is not None else None


def looks_like_a_hotel(name: Optional[str], destination: str = "") -> bool:
    """False for a "hotel" whose name is only place names ("বয়রা,খুলনা") or the destination's."""
    n = (name or "").strip()
    if not n:
        return False
    low = n.lower()
    if any(w in low for w in HOTEL_WORDS):
        return True
    return "," not in n and low != destination.strip().lower()


def pick_hotel(db: "Session", trip: "Trip") -> Optional["Hotel"]:
    """The hotel the traveller chose, else the best one Vromon knows (D11)."""
    from app.models.models import Hotel
    pref = trip.preference
    if pref is not None and pref.hotel_id is not None:
        chosen = db.get(Hotel, pref.hotel_id)
        if chosen is not None and chosen.is_active and chosen.destination_name == trip.destination:
            return chosen
    hotels = db.query(Hotel).filter(Hotel.destination_name == trip.destination, Hotel.is_active == True).all()  # noqa: E712
    if not hotels:
        return None
    level = pref.accommodation_preference if pref is not None else "Standard"
    centre = destination_point(db, trip)

    def gap(h) -> int:
        return abs(LEVELS.index(h.category) - LEVELS.index(level)) if h.category in LEVELS and level in LEVELS else 3

    def near(h) -> int:  # 3 km bands: closer first, the rating decides within a band
        return int(_haversine_km(centre, (h.latitude, h.longitude)) // 3) if centre else 0

    real = [h for h in hotels if looks_like_a_hotel(h.name, trip.destination)] or hotels
    return min(real, key=lambda h: (not h.price_known, gap(h), near(h), -(h.rating if h.rating_known else 0.0), h.id))


def blocks_of(db: "Session", trip: "Trip") -> list[StayBlock]:
    """The trip's stays; without any, one hotel stay over all nights (the hotel Vromon picks)."""
    rows = sorted(trip.stays, key=lambda s: s.first_night)
    if rows:
        return [StayBlock(r.first_night, r.last_night, r.kind, r.hotel if r.kind == "hotel" else None, r.label, r.lat, r.lon) for r in rows]
    hotel = pick_hotel(db, trip)
    if hotel is None:
        return []
    return [StayBlock(1, max(trip.num_nights, 1), "hotel", hotel)]


def _base_of(block: Optional[StayBlock], trip: "Trip", centre: Optional[tuple[float, float]]) -> Optional[Base]:
    if block is None:
        return None
    if block.kind == "hotel" and block.hotel is not None:
        h = block.hotel
        return Base("hotel", h.latitude, h.longitude, h.name, h.id)
    if block.kind == "home" and block.lat is not None and block.lon is not None:
        return Base("home", block.lat, block.lon, block.label)
    pref = trip.preference
    if block.kind == "none" and pref is not None and pref.origin_lat is not None and pref.origin_lon is not None:
        return Base("none", pref.origin_lat, pref.origin_lon, pref.origin_label)
    if centre is None:
        return Base(block.kind, None, None)
    return Base(block.kind if block.kind != "hotel" else "undecided", centre[0], centre[1], None, None, True)


def _block_for(blocks: list[StayBlock], night: int) -> Optional[StayBlock]:
    """The stay of a night; past the last stay (the dates grew), the last one."""
    if not blocks:
        return None
    return next((b for b in blocks if b.first_night <= night <= b.last_night), blocks[-1] if night > blocks[-1].last_night else blocks[0])


def bases(db: "Session", trip: "Trip", blocks: Optional[list[StayBlock]] = None) -> TripBases:
    """Where each day of the trip starts and ends (with `blocks`: as if those were its stays)."""
    blocks = blocks_of(db, trip) if blocks is None else blocks
    nights = trip.num_nights
    centre = destination_point(db, trip) if any(b.kind != "hotel" or b.hotel is None for b in blocks) else None
    by_night = {n: _base_of(_block_for(blocks, n), trip, centre) for n in range(1, max(nights, 1) + 1)}
    days: dict[int, tuple[Optional[Base], Optional[Base]]] = {}
    for d in range(1, trip.num_days + 1):
        start = by_night.get(d - 1) if d > 1 else by_night.get(1)
        end = by_night.get(d) if d <= nights else by_night.get(max(nights, 1))
        days[d] = (start, end)
    return TripBases(days, blocks, nights)


def freeze(db: "Session", trip: "Trip") -> None:
    """When a trip is planned without stays: write down the hotel Vromon picks, so it stays the same."""
    from app.models.models import TripStay
    if trip.stays or trip.num_nights < 1:
        return
    hotel = pick_hotel(db, trip)
    if hotel is None:
        return
    trip.stays.append(TripStay(first_night=1, last_night=trip.num_nights, kind="hotel", hotel_id=hotel.id, hotel=hotel))
    db.flush()


# ---------------------------------------------------------------------------
# Changing them
# ---------------------------------------------------------------------------

def validate(db: "Session", trip: "Trip", items: list[dict]) -> list[StayBlock]:
    """The stays as blocks, or StayError: they must cover the trip's nights once, each complete."""
    from app.models.models import Hotel
    nights = trip.num_nights
    if nights < 1:
        if items:
            raise StayError("This trip has no nights to stay anywhere.")
        return []
    if not items:
        raise StayError("Say where you'll stay, at least for all nights at once.")
    centre = destination_point(db, trip)
    out: list[StayBlock] = []
    expected = 1
    for it in sorted(items, key=lambda x: x.get("first_night") or 0):
        first, last, kind = it.get("first_night"), it.get("last_night"), it.get("kind")
        if kind not in KINDS:
            raise StayError(f"Unknown kind of stay: {kind}.")
        if not isinstance(first, int) or not isinstance(last, int) or first != expected or last < first or last > nights:
            raise StayError(f"The stays must cover nights 1 to {nights} once, in order, with no gaps.")
        expected = last + 1
        hotel = None
        label = (it.get("label") or "").strip() or None
        if label is not None and len(label) > 80:
            raise StayError("A stay's name can be at most 80 characters.")
        lat, lon = it.get("lat"), it.get("lon")
        if kind == "hotel":
            hotel = db.get(Hotel, it.get("hotel_id")) if it.get("hotel_id") is not None else None
            if hotel is None or not hotel.is_active:
                raise StayError("That hotel isn't available.", 404)
            if hotel.destination_name != trip.destination and (
                centre is None or _haversine_km(centre, (hotel.latitude, hotel.longitude)) > HOTEL_RADIUS_KM
            ):
                raise StayError("That hotel is too far from this trip.")
            label, lat, lon = None, None, None
        elif kind == "home":
            if lat is None or lon is None or not (-90 <= lat <= 90 and -180 <= lon <= 180):
                raise StayError("Pick on the map where the home is.")
        else:
            label, lat, lon = None, None, None
        out.append(StayBlock(first, last, kind, hotel, label, lat, lon))
    if expected != nights + 1:
        raise StayError(f"The stays must cover nights 1 to {nights} once, in order, with no gaps.")
    return out


def replace(db: "Session", trip: "Trip", blocks: list[StayBlock]) -> None:
    """Write the trip's stays (validated); night 1's hotel stays the trip's hotel for older app versions."""
    from app.models.models import TripStay
    for old in list(trip.stays):
        trip.stays.remove(old)
        db.delete(old)
    db.flush()
    for b in blocks:
        trip.stays.append(TripStay(
            first_night=b.first_night, last_night=b.last_night, kind=b.kind,
            hotel_id=b.hotel.id if b.hotel is not None else None, hotel=b.hotel, label=b.label, lat=b.lat, lon=b.lon,
        ))
    if trip.preference is not None:
        trip.preference.hotel_id = blocks[0].hotel.id if blocks and blocks[0].hotel is not None else None
    db.flush()


def from_choice(trip: "Trip", choice: dict) -> list[dict]:
    """A whole-trip choice (`stay` in a new trip) as the list PUT /stays takes."""
    return [{**choice, "first_night": 1, "last_night": trip.num_nights}] if trip.num_nights >= 1 else []


def as_items(blocks: Iterable[StayBlock]) -> list[dict]:
    return [{"first_night": b.first_night, "last_night": b.last_night, "kind": b.kind,
             "hotel_id": b.hotel.id if b.hotel is not None else None, "label": b.label, "lat": b.lat, "lon": b.lon}
            for b in blocks]


# ---------------------------------------------------------------------------
# For the API
# ---------------------------------------------------------------------------

def stay_out(b: StayBlock, private: bool = False) -> dict:
    """One stay for the API; a viewer who isn't the owner sees a home without its name or place (D2)."""
    h = b.hotel
    out = {
        "first_night": b.first_night, "last_night": b.last_night, "nights": b.nights, "kind": b.kind,
        "hotel": None if h is None else {
            "id": h.id, "name": h.name, "category": h.category, "price_per_night": h.price_per_night,
            "price_known": h.price_known, "currency": h.currency, "rating": h.rating, "rating_known": h.rating_known,
            "latitude": h.latitude, "longitude": h.longitude,
        },
        "label": b.label, "lat": b.lat, "lon": b.lon,
    }
    if private and b.kind == "home":
        out.update(label=None, lat=None, lon=None)
    return out


def is_owner(trip: "Trip", user: "User") -> bool:
    return trip.user_id is None or trip.user_id == user.id


def last_point(day: "Itinerary"):
    """Where the day's plan ends: its last stop or meal that has a place."""
    for item in sorted(day.items, key=lambda i: i.order_index, reverse=True):
        point = item.place if item.item_type == "activity" else item.restaurant if item.item_type == "meal" else None
        if point is not None and point.latitude is not None:
            return item, point
    return None, None


def first_point(day: "Itinerary"):
    """Where the day's plan begins: its first stop or meal that has a place."""
    for item in sorted(day.items, key=lambda i: i.order_index):
        point = item.place if item.item_type == "activity" else item.restaurant if item.item_type == "meal" else None
        if point is not None and point.latitude is not None:
            return item, point
    return None, None


def start_leg(day: "Itinerary", start: Optional[Base], travellers: int) -> Optional[dict]:
    """From where the day starts to its first stop or meal: minutes, km, the usual mode and its fare."""
    from app.services.budget.service import _leg
    from app.services.routing import ROADS, point_of
    item, point = first_point(day)
    if item is None or start is None or start.latitude is None:
        return None
    t = ROADS.travel(point_of(start), point_of(point))
    leg = _leg(start, point, None, travellers)
    return {"to_item_id": item.id, "minutes": round(t.minutes), "km": round(t.km, 1), "mode": leg["mode"], "cost": round(leg["cost"])}


def return_leg(day: "Itinerary", end: Optional[Base], travellers: int) -> Optional[dict]:
    """The way back to the stay after the day's last stop or meal: minutes, km, the usual mode and its fare."""
    from app.services.budget.service import _leg
    from app.services.routing import ROADS, point_of
    item, point = last_point(day)
    if item is None or end is None or end.latitude is None:
        return None
    t = ROADS.travel(point_of(point), point_of(end))
    leg = _leg(point, end, None, travellers)
    return {"from_item_id": item.id, "minutes": round(t.minutes), "km": round(t.km, 1), "mode": leg["mode"], "cost": round(leg["cost"])}


def stay_cost(blocks: list[StayBlock], rooms: int, currency: str) -> dict:
    """
    The stay's cost: hotel nights × rooms at their price; homes and day trips cost nothing.
    `known` is False when a hotel has no price (or another currency) or a night isn't decided.
    """
    lines, total, unknown = [], 0.0, None
    for b in blocks:
        line = {"first_night": b.first_night, "last_night": b.last_night, "nights": b.nights, "kind": b.kind,
                "hotel": b.hotel.name if b.hotel is not None else None, "hotel_id": b.hotel.id if b.hotel is not None else None,
                "label": b.label, "amount": None, "per_night": None, "rooms": rooms}
        if b.kind in ("home", "none"):
            line["amount"] = 0.0
        elif b.kind == "hotel" and b.hotel is not None:
            h = b.hotel
            if (h.currency or "BDT") != currency:
                unknown = unknown or {"reason": "currency", "currency": h.currency}
            elif not h.price_known:
                unknown = unknown or {"reason": "no_price", "hotel": h.name, "nights": b.nights}
            else:
                line.update(amount=h.price_per_night * b.nights * rooms, per_night=h.price_per_night, rating=h.rating)
        else:
            unknown = unknown or {"reason": "no_hotel"}
        if line["amount"] is not None:
            total += line["amount"]
        lines.append(line)
    return {"known": unknown is None and bool(blocks), "amount": total, "lines": lines,
            "unknown": unknown if blocks else {"reason": "no_hotel"}}

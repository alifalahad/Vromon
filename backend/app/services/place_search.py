"""
Search anything in a trip's free time (docs/trip-upgrades, step 6; design.md §6, decision D10).

  1. Normalise the query (lower case, Bangla digits, initials joined, the shared spelling fold:
     app/core/names.py, the same code the data platform uses).
  2. Read intent: a kind word ("college", "কলেজ", "atm", "bazar", from app/core/poi-kinds.yaml) keeps the
     kind; the other words are searched as a name. A query of kind words only asks for the nearest of that kind.
  3. The area: the stop before the free time (`near_item_id`), else the day's stops' centre, else where the
     day starts, else the destination. 25 km first, then the area's district, then the whole country for
     exact names only.
  4. Sources, each scored name × 0.7 + nearness × 0.3, plus a bonus when the kind matches:
     Vromon's places of this destination → other catalog places within 25 km (sights of the next
     destination, restaurants, hotels) → the places index (poi_index, "not checked") → ORS geocoding for
     addresses and areas, only when the first three give fewer than 5 good results (cached 7 days by
     query and area, one call per user per 2 s, a daily cap shared by every process).
  5. Merge: the same name within 150 m is kept once, from the more trusted source. Grouped by source.
  6. Never empty: when nothing matches well, the closest names ("Did you mean"), the nearest places of the
     kind asked for ("Colleges near you"), and always a pin.

Privacy: the geocoder gets only the text and the area's centre; the cache holds no user id; the rate limit
keeps only the time of each user's last call, in memory. Unlisted places are a traveller's own; search never
offers anyone's private stop.
"""

from __future__ import annotations

import json
import logging
import math
import re
import threading
import time
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import TYPE_CHECKING, Any, Optional

import httpx
import numpy as np
from rapidfuzz import fuzz, process
from sqlalchemy import and_, delete, func, select

from app.core.config import settings
from app.core.names import match_key, search_key, search_text
from app.core.poi_kinds import kind_map
from app.models.catalog import GeocodeCache, PoiIndex
from app.models.models import Destination, Hotel, Place, Restaurant
from app.services.routing.roads import ROADS, haversine_km, point_of

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

    from app.models.models import Itinerary, ItineraryItem, Trip, User

logger = logging.getLogger("vromon.search")

GROUPS = ("vromon", "nearby", "other", "addresses")
TRUST = {g: i for i, g in enumerate(GROUPS)}       # a duplicate keeps the more trusted source
AREA_KM = 25.0
KIND_RESULTS_KM = 60.0      # "Colleges near you" may look further than the area
REACH_KM = 80.0             # a stop from outside Vromon's list must be this close to the day (or the town)
ADDRESS_KM = 30.0           # addresses further than this from the area aren't offered ("Azmiri, Dhaka" from Khulna)
SHOW = 65.0                 # a name must match this well to be shown
GOOD = 60.0                 # fewer than 5 results this good → the geocoder
FALLBACK = 50.0             # nothing this good → did you mean, the kind near you, a pin
KIND_BONUS = 10.0
DEDUP_KM = 0.15
STAGE1 = 300                # places-index rows scored closely, of all those in the area
BD_BOX = (88.0, 20.3, 92.8, 26.7)
CACHE_DAYS = 7
MIN_GAP_S = 2.0

_last_call: dict[str, float] = {}       # user → when they last made the geocoder work (in memory only)
_last_lock = threading.Lock()


class SearchError(Exception):
    def __init__(self, message: str, status: int = 422):
        super().__init__(message)
        self.message, self.status = message, status


# ---------------------------------------------------------------------------
# 1–2. The query
# ---------------------------------------------------------------------------

@dataclass
class Query:
    raw: str
    text: str                          # as typed, normalised
    kind: Optional[str] = None         # the kind a word asked for
    guessed_kind: Optional[str] = None  # …or one a misspelt word seems to ask for (fallbacks only)
    name_text: str = ""                # the words that aren't a kind
    forms: list[tuple[str, str]] = field(default_factory=list)   # (text, search key) to compare names with
    key: str = ""                      # the places index's key (match_key) for the whole query
    name_key: str = ""                 # …and for the name words

    @property
    def kind_only(self) -> bool:
        return self.kind is not None and not self.name_text


def read_query(q: str) -> Query:
    text = search_text(q)[:120]
    query = Query(raw=q.strip()[:120], text=text)
    if not text:
        return query
    words = kind_map().search_words()
    tokens = text.split()
    spans: list[tuple[int, int, str]] = []
    i = 0
    while i < len(tokens):
        for n in (3, 2, 1):                        # "shopping centre", "bus stand", "college"
            phrase = " ".join(tokens[i:i + n])
            if len(tokens) - i >= n and phrase in words:
                spans.append((i, i + n, words[phrase]))
                i += n
                break
        else:
            i += 1
    rest = tokens
    if spans:                                      # the last kind word is the kind: "Medical College" → college
        a, b, query.kind = spans[-1]
        rest = tokens[:a] + tokens[b:]
    query.name_text = " ".join(rest)
    query.forms = [(text, search_key(text))]
    if query.kind and len(query.name_text) >= 3:
        query.forms.append((query.name_text, search_key(query.name_text)))
    query.key = match_key(text, drop_generic=False)
    query.name_key = match_key(query.name_text, drop_generic=False) if query.name_text else ""
    if query.kind is None:
        query.guessed_kind = _guess_kind(tokens, words)
    return query


def _guess_kind(tokens: list[str], words: dict[str, str]) -> Optional[str]:
    """A misspelt kind word ("colege", "hospitel"): the kind, for "Colleges near you" only."""
    latin = [w for w in words if w.isascii() and len(w) >= 4]
    best, kind = 0.0, None
    for t in tokens:
        if len(t) < 4:
            continue
        hit = process.extractOne(t, latin, scorer=fuzz.ratio, score_cutoff=80)
        if hit and hit[1] > best:
            best, kind = hit[1], words[hit[0]]
    return kind


def _word(q: str, words: list[str]) -> float:
    """How well one typed word matches the name's best word: spelling slips count, a different word doesn't.
    A slip is rarely in the first letter: "hospital" folded looks like "capital", but they aren't alike."""
    best = max((fuzz.ratio(q, w) for w in words if w[:1] == q[:1]), default=0.0)
    if len(q) >= 3 and any(w.startswith(q) for w in words):   # still typing: "brajal"
        best = max(best, 90.0)
    # A slip in a long word ("colege"), not another short word ("bl" isn't "bsl")
    return best if best >= (90.0 if len(q) <= 4 else 82.0) else best * 0.25


def _words(q: str, name: str) -> float:
    qs, ns = q.split(), name.split()
    if not qs or not ns:
        return 0.0
    if set(qs) <= set(ns):          # every word typed is in the name: the shorter name (the main one) first
        return 90.0 + 10.0 * len(q) / max(len(name), len(q))
    return sum(_word(w, ns) for w in qs) / len(qs)


def name_score(query: Query, *names: Optional[str], kind: Optional[str] = None) -> float:
    """0–100: how well a place's names (English and Bangla) match what was typed, word by word: every word
    typed must match a word of the name ("BL College" isn't "Chalna College"). Compared as typed, and
    folded (spelling variants, Bangla in Latin letters) at a small discount. The words besides the kind
    ("BL" of "BL College") count alone only for a place of that kind."""
    best = 0.0
    forms = query.forms if kind is not None and kind == query.kind else query.forms[:1]
    for n in names:
        t = search_text(n)
        if not t:
            continue
        k = search_key(n)
        for qt, qk in forms:
            if t == qt:
                return 100.0
            best = max(best, _words(qt, t), 0.97 * _words(qk, k) if qk and k else 0.0)
    return min(best, 100.0)


# ---------------------------------------------------------------------------
# 3. The area
# ---------------------------------------------------------------------------

@dataclass
class Area:
    lat: float
    lon: float
    near_name: Optional[str]           # "2.4 km from Rupsha Bridge"; None: from the day's centre
    destination: Optional[Destination]

    def out(self) -> dict:
        return {"name": self.near_name, "lat": round(self.lat, 6), "lon": round(self.lon, 6)}

    def box(self, km: float) -> tuple[float, float, float, float]:
        dlat = km / 111.0
        dlon = km / (111.0 * max(math.cos(math.radians(self.lat)), 0.2))
        return self.lat - dlat, self.lat + dlat, self.lon - dlon, self.lon + dlon

    def km(self, lat: float, lon: float) -> float:
        return haversine_km((self.lat, self.lon), (lat, lon))


def _item_point(item: "ItineraryItem"):
    return point_of(item.place) or point_of(item.restaurant)


def area_of(db: "Session", trip: "Trip", day: "Itinerary", near: Optional["ItineraryItem"]) -> Area:
    dest = db.scalar(select(Destination).where(Destination.name == trip.destination))
    if near is not None:
        p = _item_point(near)
        if p is not None:
            return Area(p[0], p[1], near.title, dest)
    pts = [p for p in (_item_point(i) for i in day.items) if p is not None]
    if pts:
        return Area(sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts), None, dest)
    from app.services import stays as stays_service
    start = stays_service.bases(db, trip).start(day.day_number)
    p = point_of(start)
    if p is not None and not start.estimate:
        return Area(p[0], p[1], start.name, dest)
    if dest is not None and dest.latitude:
        return Area(dest.latitude, dest.longitude, None, dest)
    raise SearchError("This day has no place to search around.", 409)


def day_points(db: "Session", trip: "Trip", day: "Itinerary") -> list[tuple[float, float]]:
    """Where the day goes: its stops, where it starts and ends, and the destination's centre."""
    from app.services import stays as stays_service
    pts = [p for p in (_item_point(i) for i in day.items) if p is not None]
    bases = stays_service.bases(db, trip)
    pts += [p for p in (point_of(bases.start(day.day_number)), point_of(bases.end(day.day_number))) if p is not None]
    dest = db.scalar(select(Destination).where(Destination.name == trip.destination))
    if dest is not None and dest.latitude:
        pts.append((dest.latitude, dest.longitude))
    return pts


def within_reach(db: "Session", trip: "Trip", day: "Itinerary", lat: float, lon: float) -> bool:
    w, s, e, n = BD_BOX
    if not (s <= lat <= n and w <= lon <= e):
        return False
    return any(haversine_km(p, (lat, lon)) <= REACH_KM for p in day_points(db, trip, day))


# ---------------------------------------------------------------------------
# 4. Sources
# ---------------------------------------------------------------------------

@dataclass
class Hit:
    group: str
    source: str
    ref: dict
    name: str
    lat: float
    lon: float
    checked: bool
    name_bn: Optional[str] = None
    kind: Optional[str] = None
    category: Optional[str] = None
    address: Optional[str] = None
    key: str = ""
    name_score: float = 0.0
    distance_km: float = 0.0
    score: float = 0.0

    def out(self) -> dict:
        ref_id = next(iter(self.ref.values()))
        return {
            "id": f"{next(iter(self.ref))}:{ref_id}",
            "ref": self.ref,
            "group": self.group,
            "source": self.source,
            "name": self.name,
            "name_bn": self.name_bn,
            "kind": self.kind,
            "category": self.category,
            "address": self.address,
            "lat": round(self.lat, 6),
            "lon": round(self.lon, 6),
            "distance_km": round(self.distance_km, 1),
            "checked": self.checked,
            "score": round(self.score, 1),
        }


def _rate(hit: Hit, query: Query, area: Area, *, name: Optional[float] = None, far: bool = False) -> Hit:
    hit.name_score = name if name is not None else name_score(query, hit.name, hit.name_bn, kind=hit.kind)
    hit.distance_km = area.km(hit.lat, hit.lon)
    near = 0.0 if far else 100.0 * max(0.0, 1.0 - hit.distance_km / AREA_KM)
    # Beyond the area (the district, exact names further away): after everything nearby
    bonus = KIND_BONUS if query.kind and hit.kind == query.kind and not far else 0.0
    hit.score = 0.7 * hit.name_score + 0.3 * near + bonus
    hit.key = hit.key or match_key(hit.name, drop_generic=False)
    return hit


def _used(trip: "Trip") -> tuple[set[int], set[str]]:
    """Place ids in the trip (and skipped ones), and the sources of its private stops ("poi:…")."""
    from app.services.itinerary.editing_service import used_place_ids
    ids = set(used_place_ids(trip)) | (set(trip.constraints.excluded_places) if trip.constraints else set())
    refs = {i.place.source_ref for d in trip.itinerary_days for i in d.items
            if i.place is not None and not i.place.listed and i.place.source_ref}
    return ids, refs


def _vromon(db: "Session", trip: "Trip", query: Query, area: Area, used: set[int]) -> list[Hit]:
    rows = db.scalars(select(Place).where(Place.destination_name == trip.destination, Place.is_active.is_(True),
                                          Place.listed.is_(True))).all()
    return [_rate(Hit("vromon", "vromon", {"place_id": p.id}, p.name, p.latitude, p.longitude, bool(p.checked),
                      category=p.category), query, area) for p in rows if p.id not in used]


def _nearby(db: "Session", trip: "Trip", query: Query, area: Area, used: set[int], refs: set[str]) -> list[Hit]:
    s, n, w, e = area.box(AREA_KM)
    hits: list[Hit] = []
    for p in db.scalars(select(Place).where(Place.destination_name != trip.destination, Place.is_active.is_(True),
                                            Place.listed.is_(True), Place.latitude.between(s, n), Place.longitude.between(w, e))):
        if p.id not in used:
            hits.append(Hit("nearby", "vromon", {"place_id": p.id}, p.name, p.latitude, p.longitude, bool(p.checked),
                            category=p.category))
    for model, kind in ((Restaurant, "restaurant"), (Hotel, "hotel")):
        for r in db.scalars(select(model).where(model.is_active.is_(True), model.latitude.between(s, n),
                                                model.longitude.between(w, e))):
            if f"{kind}:{r.id}" not in refs:
                hits.append(Hit("nearby", kind, {f"{kind}_id": r.id}, r.name, r.latitude, r.longitude, bool(r.checked),
                                kind=kind, category=getattr(r, "cuisine", None) if kind == "restaurant" else None))
    if len(hits) > STAGE1:     # a big city: a quick first pass, then the close look
        keys = [search_key(h.name) for h in hits]
        first = process.cdist([query.forms[0][1]], keys, scorer=fuzz.partial_ratio, dtype=np.uint8)[0]
        hits = [hits[i] for i in np.argsort(-first)[:STAGE1]]
    return [_rate(h, query, area) for h in hits if area.km(h.lat, h.lon) <= AREA_KM]


_POI_COLS = (PoiIndex.id, PoiIndex.name, PoiIndex.name_bn, PoiIndex.kind, PoiIndex.category, PoiIndex.lat, PoiIndex.lon,
             PoiIndex.name_key)
# The first pass reads only these (a big city's area has 80,000 rows: all nine columns took 0.5 s, these 0.15 s)
_POI_LIGHT = (PoiIndex.id, PoiIndex.name_key, PoiIndex.lat, PoiIndex.lon)


def _poi_hit(r, group: str = "other") -> Hit:
    return Hit(group, "poi", {"poi_id": r.id}, r.name, r.lat, r.lon, False, name_bn=r.name_bn, kind=r.kind,
               category=r.category, key=r.name_key)


def _poi_rows(db: "Session", where) -> list:
    return db.execute(select(*_POI_COLS).where(where)).all()


def _poi_score(db: "Session", where, query: Query, area: Area, refs: set[str], *, far: bool = False) -> list[Hit]:
    if query.kind_only:      # a kind alone: every place of that kind (few), the nearest first
        rows = [r for r in _poi_rows(db, and_(where, PoiIndex.kind == query.kind)) if f"poi:{r.id}" not in refs]
        hits = [_rate(_poi_hit(r), query, area, name=100.0, far=far) for r in rows]
        return sorted(hits, key=lambda h: -h.score)[:STAGE1]
    # First pass over the whole area (fast: the stored keys only), then the close look at the best
    light = [r for r in db.execute(select(*_POI_LIGHT).where(where)).all() if f"poi:{r[0]}" not in refs]
    if not light:
        return []
    ids, keys, lats, lons = zip(*light)
    lat, lon = np.asarray(lats, dtype=float), np.asarray(lons, dtype=float)
    dkm = 111.0 * np.hypot(lat - area.lat, (lon - area.lon) * math.cos(math.radians(area.lat)))
    near = np.clip(1.0 - dkm / AREA_KM, 0.0, 1.0) * 100.0
    keys = [k or "" for k in keys]
    first = np.zeros(len(light))
    for qk in {k for k in (query.key, query.name_key) if k and len(k.replace(" ", "")) >= 4}:
        first = np.maximum(first, process.cdist([qk], keys, scorer=fuzz.partial_ratio, dtype=np.uint8)[0])
    best = [ids[i] for i in np.argsort(-(first + near * 0.05))[:STAGE1]]      # the name first; nearness breaks ties
    rows = {r.id: r for r in _poi_rows(db, PoiIndex.id.in_(best))}
    return [_rate(_poi_hit(rows[i]), query, area, far=far) for i in best if i in rows]


def _poi_area(db: "Session", query: Query, area: Area, refs: set[str]) -> list[Hit]:
    s, n, w, e = area.box(AREA_KM)
    hits = _poi_score(db, and_(PoiIndex.lat.between(s, n), PoiIndex.lon.between(w, e)), query, area, refs)
    return [h for h in hits if h.distance_km <= AREA_KM]


def _district_of(db: "Session", area: Area) -> Optional[Any]:
    s, n, w, e = area.box(3.0)
    rows = db.execute(select(PoiIndex.district_id, func.count()).where(
        PoiIndex.lat.between(s, n), PoiIndex.lon.between(w, e)).group_by(PoiIndex.district_id)).all()
    return max(rows, key=lambda r: r[1])[0] if rows else None


def _poi_wider(db: "Session", query: Query, area: Area, refs: set[str]) -> list[Hit]:
    """Fewer than 5 good results nearby: the rest of the area's district, then exact names further away
    (as far as a day can reach: a stop must be addable)."""
    hits: list[Hit] = []
    district = _district_of(db, area)
    if district is not None:
        s, n, w, e = area.box(AREA_KM)
        where = and_(PoiIndex.district_id == district, ~and_(PoiIndex.lat.between(s, n), PoiIndex.lon.between(w, e)))
        hits += _poi_score(db, where, query, area, refs, far=True)
    if not query.kind_only:
        keys = [k for k in {query.key, query.name_key} if k and len(k) >= 4]
        if keys:
            exact = _poi_rows(db, PoiIndex.name_key.in_(keys))[:200]
            hits += [_rate(_poi_hit(r), query, area, far=True) for r in exact
                     if f"poi:{r.id}" not in refs and area.km(r.lat, r.lon) <= REACH_KM]
    return hits


# ---------------------------------------------------------------------------
# ORS geocoding (addresses and areas)
# ---------------------------------------------------------------------------

LAYER_KIND = {"address": "address", "street": "street", "venue": "other", "neighbourhood": "area", "locality": "area",
              "localadmin": "area", "borough": "area", "county": "area", "region": "area", "macrocounty": "area"}


def _area_key(area: Area) -> str:
    return f"{round(area.lat / 0.05) * 0.05:.2f},{round(area.lon / 0.05) * 0.05:.2f}"


def _fetch(text: str, lat: float, lon: float) -> list[dict]:
    """ORS geocoding: only the text and the area's centre leave the server."""
    r = httpx.get(settings.ors_geocode_url, timeout=settings.geocode_timeout_seconds, params={
        "api_key": settings.ors_api_key, "text": text, "focus.point.lat": round(lat, 3), "focus.point.lon": round(lon, 3),
        "boundary.country": "BD", "size": 5,
    })
    r.raise_for_status()
    out = []
    for f in r.json().get("features", []):
        props, geom = f.get("properties") or {}, f.get("geometry") or {}
        coords = geom.get("coordinates") or []
        if len(coords) != 2 or not props.get("name"):
            continue
        out.append({"gid": str(props.get("gid") or props.get("id") or "")[:140], "name": str(props["name"])[:200],
                    "label": str(props.get("label") or "")[:300], "layer": props.get("layer"),
                    "lat": float(coords[1]), "lon": float(coords[0])})
    return out


def geocode(db: "Session", user_id: str, query: Query, area: Area) -> tuple[Optional[GeocodeCache], str, float]:
    """(the cached row, status, seconds to wait). Status: cached / used / wait / capped / off / unavailable."""
    key, area_key = query.text[:120], _area_key(area)
    now = datetime.utcnow()
    row = db.scalar(select(GeocodeCache).where(GeocodeCache.query_key == key, GeocodeCache.area_key == area_key))
    if row is not None and row.fetched_at >= now - timedelta(days=CACHE_DAYS):
        return row, "cached", 0.0
    if not settings.ors_api_key:
        return None, "off", 0.0
    with _last_lock:
        last = _last_call.get(user_id)
        mono = time.monotonic()
        if last is not None and mono - last < MIN_GAP_S:
            return None, "wait", round(MIN_GAP_S - (mono - last), 1)
        today = now.replace(hour=0, minute=0, second=0, microsecond=0)
        if (db.scalar(select(func.count()).select_from(GeocodeCache).where(GeocodeCache.fetched_at >= today)) or 0) >= settings.geocode_daily_cap:
            return None, "capped", 0.0
        _last_call[user_id] = mono
    try:
        results = _fetch(query.raw, area.lat, area.lon)
    except (httpx.HTTPError, ValueError) as exc:
        logger.warning("Geocoding unavailable: %s", type(exc).__name__)
        return None, "unavailable", 0.0
    db.execute(delete(GeocodeCache).where(GeocodeCache.fetched_at < now - timedelta(days=CACHE_DAYS)))
    if row is None:
        row = GeocodeCache(query_key=key, area_key=area_key)
        db.add(row)
    row.results_json, row.fetched_at = json.dumps(results, ensure_ascii=False), now
    db.commit()
    return row, "used", 0.0


def _address_hits(row: Optional[GeocodeCache], query: Query, area: Area, refs: set[str]) -> list[Hit]:
    if row is None:
        return []
    hits = []
    for i, g in enumerate(json.loads(row.results_json or "[]")):
        if f"geocode:{g.get('gid')}"[:160] in refs:
            continue
        h = Hit("addresses", "geocode", {"geocode": f"{row.id}.{i}"}, g["name"], g["lat"], g["lon"], False,
                kind=LAYER_KIND.get(g.get("layer"), "address"), address=g.get("label") or None)
        _rate(h, query, area, name=name_score(query, g["name"], g.get("label")))
        if h.distance_km <= ADDRESS_KM:
            hits.append(h)
    return hits


def geocode_result(db: "Session", token: str) -> dict:
    """The geocoder's result a search returned (`{cache id}.{index}`); 410 when the cache has moved on."""
    m = re.fullmatch(r"(\d+)\.(\d+)", token or "")
    row = db.get(GeocodeCache, int(m.group(1))) if m else None
    results = json.loads(row.results_json or "[]") if row is not None else []
    i = int(m.group(2)) if m else -1
    if not (0 <= i < len(results)):
        raise SearchError("That address isn't available any more. Search again.", 410)
    return results[i]


# ---------------------------------------------------------------------------
# 5–6. Merge, group, never empty
# ---------------------------------------------------------------------------

def _dedup(hits: list[Hit]) -> list[Hit]:
    kept: list[Hit] = []
    for h in sorted(hits, key=lambda h: (TRUST[h.group], -h.score)):
        if any(k.key == h.key and haversine_km((k.lat, k.lon), (h.lat, h.lon)) <= DEDUP_KM for k in kept if h.key):
            continue
        kept.append(h)
    return kept


def _did_you_mean(pool: list[Hit], query: Query) -> list[str]:
    seen, out = set(), []
    for h in sorted(pool, key=lambda h: (-h.name_score, len(h.name))):
        t = search_text(h.name)
        if not t or t == query.text or t in seen:
            continue
        seen.add(t)
        out.append(h.name)
        if len(out) == 3:
            break
    return out


def _kind_results(db: "Session", kind: str, area: Area, refs: set[str], query: Query) -> list[Hit]:
    s, n, w, e = area.box(KIND_RESULTS_KM)
    rows = _poi_rows(db, and_(PoiIndex.kind == kind, PoiIndex.lat.between(s, n), PoiIndex.lon.between(w, e)))
    hits = [_rate(_poi_hit(r), query, area, name=0.0) for r in rows if f"poi:{r.id}" not in refs]
    return sorted((h for h in hits if h.distance_km <= KIND_RESULTS_KM), key=lambda h: h.distance_km)[:5]


def _grouped(hits: list[Hit], limit: int) -> list[dict]:
    out = []
    for g in GROUPS:
        rows = sorted((h for h in hits if h.group == g), key=lambda h: (-h.score, h.distance_km))[:limit]
        if rows:
            out.append({"key": g, "results": [h.out() for h in rows]})
    return out


def search(db: "Session", trip: "Trip", day: "Itinerary", user: "User", q: str, near: Optional["ItineraryItem"] = None,
           limit: int = 8, part: str = "all") -> dict:
    """Grouped results for the "Add a stop" sheet. `part`: "places" (Vromon, the catalog and the places index,
    fast), "addresses" (the geocoder only, for the app's second request) or "all"."""
    t0 = time.perf_counter()
    query = read_query(q)
    area = area_of(db, trip, day, near)
    out: dict[str, Any] = {"query": query.raw, "kind": query.kind or query.guessed_kind, "near": area.out(), "groups": [],
                           "did_you_mean": [], "kind_results": None, "pin": True, "addresses_wanted": False,
                           "geocoder": "skipped", "retry_after": None}
    if not query.text:
        return out
    used, refs = _used(trip)
    hits: list[Hit] = []
    timings = {}
    if part in ("places", "all"):
        pool = _vromon(db, trip, query, area, used) + _nearby(db, trip, query, area, used, refs) + _poi_area(db, query, area, refs)
        if sum(h.score >= GOOD and h.name_score >= SHOW for h in pool) < 5:
            pool += _poi_wider(db, query, area, refs)
        hits = _dedup([h for h in pool if h.name_score >= SHOW])
        good = sum(h.score >= GOOD for h in hits)
        timings["places_ms"] = round((time.perf_counter() - t0) * 1000)
        # Not for a kind (the index has them all), nor for the first letters of a word still being typed
        out["addresses_wanted"] = good < 5 and not query.kind_only and len(query.text) >= 3
        if not any(h.score >= FALLBACK for h in hits):
            out["did_you_mean"] = _did_you_mean(pool, query)
            kind = query.kind or query.guessed_kind
            if kind:
                found = _kind_results(db, kind, area, refs, query)
                out["kind_results"] = {"kind": kind, "results": [h.out() for h in found]} if found else None
    if part == "addresses" or (part == "all" and out["addresses_wanted"]):
        t1 = time.perf_counter()
        row, status, wait = geocode(db, str(user.id), query, area)
        out["geocoder"], out["retry_after"] = status, wait or None
        address = _address_hits(row, query, area, refs)
        hits = _dedup(hits + [h for h in address if h.name_score >= FALLBACK]) if hits else _dedup(address)
        timings["geocoder_ms"] = round((time.perf_counter() - t1) * 1000)
    out["groups"] = _grouped(hits, limit)
    logger.info("search part=%s results=%d %s", part, len(hits), timings)
    return out


# ---------------------------------------------------------------------------
# Adding a result: the private place (listed = false, owned by the traveller)
# ---------------------------------------------------------------------------

UNKNOWN_HOURS = ("00:00", "23:59")      # hours unknown: shown as "Hours not checked", never a reason to move it
PRIVATE_VISIT_HOURS = 1.0
NEUTRAL_RATING = 3.5
CATEGORY_OF_KIND = {"mosque": "Religious", "temple": "Religious", "church": "Religious", "pagoda": "Religious",
                    "place_of_worship": "Religious", "park": "Nature", "nature": "Nature", "museum": "Historical",
                    "historic_site": "Historical", "market": "Shopping", "shopping_mall": "Shopping", "shop": "Shopping"}


def private_place(db: "Session", trip: "Trip", day: "Itinerary", user: "User", *, poi_id: Optional[str] = None,
                  geocode_token: Optional[str] = None, pin: Optional[dict] = None, restaurant_id: Optional[int] = None,
                  hotel_id: Optional[int] = None) -> Place:
    """The traveller's own place for a search result or a pin: listed = false, owned by them, a 60-minute
    visit, cost and hours unknown. The same result added again (another day, another trip) is reused.
    Road data between it and the day's other stops is asked for first, before this request writes anything:
    the road cache is saved on a connection of its own, and SQLite would make it wait for this one's lock."""
    dest = db.scalar(select(Destination).where(Destination.name == trip.destination))
    if dest is None:
        raise SearchError("This trip's destination isn't known.", 409)
    checked, hours, ref, kind = False, UNKNOWN_HOURS, None, None
    if poi_id is not None:
        row = db.get(PoiIndex, poi_id)
        if row is None:
            raise SearchError("Place not found", 404)
        name, lat, lon, kind, source, ref = row.name, row.lat, row.lon, row.kind, "poi", f"poi:{row.id}"
    elif geocode_token is not None:
        g = geocode_result(db, geocode_token)
        name, lat, lon, source = g["name"], g["lat"], g["lon"], "geocode"
        kind, ref = LAYER_KIND.get(g.get("layer"), "address"), f"geocode:{g.get('gid')}"[:160]
    elif restaurant_id is not None or hotel_id is not None:
        model, kind, rid = (Restaurant, "restaurant", restaurant_id) if restaurant_id is not None else (Hotel, "hotel", hotel_id)
        row = db.get(model, rid)
        if row is None or not row.is_active:
            raise SearchError("Place not found", 404)
        name, lat, lon, source, ref, checked = row.name, row.latitude, row.longitude, kind, f"{kind}:{row.id}", bool(row.checked)
        if kind == "restaurant" and getattr(row, "hours_known", False):
            hours = (row.opening_time, row.closing_time)
    elif pin is not None:
        name = " ".join(str(pin.get("name") or "").split())[:80]
        if not name:
            raise SearchError("Give the pin a name.")
        lat, lon, source, kind = float(pin["lat"]), float(pin["lon"]), "pin", "pin"
    else:
        raise SearchError("Nothing to add.")
    if not within_reach(db, trip, day, lat, lon):
        raise SearchError(f"'{name}' is too far from this day's stops (more than {int(REACH_KM)} km).")
    place = None
    if ref is not None:
        place = db.scalar(select(Place).where(Place.owner_user_id == user.id, Place.source_ref == ref,
                                              Place.destination_id == dest.id).limit(1))
    prepare_day(db, trip, day, (lat, lon))
    if place is None:
        place = Place(name=name[:200], destination_id=dest.id, destination_name=dest.name,
                      category=CATEGORY_OF_KIND.get(kind or "", "Other"), latitude=lat, longitude=lon,
                      owner_user_id=user.id, listed=False, source=source, source_ref=ref)
        db.add(place)
    place.is_active = True
    place.checked = checked
    place.rating, place.rating_known, place.review_count = NEUTRAL_RATING, False, 0
    place.average_visit_duration = PRIVATE_VISIT_HOURS
    place.estimated_cost, place.cost_known = 0.0, False
    place.opening_time, place.closing_time = hours
    place.hours_known = hours != UNKNOWN_HOURS
    place.crowd_level, place.activity_level = "Medium", "Medium"
    place.tags = [kind] if kind else []
    db.flush()
    return place


def prepare_day(db: "Session", trip: "Trip", day: "Itinerary", point: tuple[float, float]) -> None:
    """Road data between a private stop and the rest of its day (a small matrix: Vromon's places are
    prepared for the whole destination; a private one isn't). Call it before the request writes anything."""
    try:
        ROADS.prepare(db, day_points(db, trip, day) + [point])
    except Exception as exc:  # roads are a nicety: the straight-line estimate still works
        logger.warning("Road data for a private stop failed: %s", type(exc).__name__)

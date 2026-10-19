"""
Live conditions for a trip (trip planner step 6): the weather by the hour, the
sea for beach and boat stops, sunrise and sunset, and the warnings that follow
for each stop, each with its reason, its source and what can be done.

  - Weather and sea come from Open-Meteo (free, no key), fetched for the
    destination at most every 30 minutes and kept in `conditions_cache`. If a
    refresh fails the last copy is used and marked stale, with its age.
  - Days beyond the forecast (16 days for weather, about a week for the sea) have
    no weather yet; sunrise and sunset are still computed.
  - Traffic is the usual pattern of Bangladesh towns (slow 08:00-10:00 and
    17:00-20:00), never live, and is labelled so. Planned times don't change;
    legs that fall in a slow time say how much longer they usually take.

The app never says anything is safe: warnings come only from this data, and the
screen says so.
"""

from __future__ import annotations

import json
import logging
from datetime import date, datetime, timedelta
from typing import TYPE_CHECKING, Callable, Optional

from app.services.conditions import openmeteo
from app.services.conditions.openmeteo import ConditionsUnavailable
from app.services.itinerary.trip_rules import m2t, rules_for, sunrise_min, sunset_min, t2m

if TYPE_CHECKING:
    from sqlalchemy.orm import Session
    from app.models.models import Itinerary, ItineraryItem, Trip

logger = logging.getLogger("vromon.conditions")

TTL = timedelta(minutes=30)
MIN_REFRESH = timedelta(minutes=2)          # "Refresh" asks again only after this

OUTDOOR = {"beach", "nature", "adventure", "scenic", "photography"}
WILD = {"nature", "adventure", "scenic"}    # not where you want to be after dark
SEA_WORDS = ("beach", "boat", "island", "sea", "coast")
STORM_CODES = {95, 96, 99}                  # WMO weather codes: thunderstorms
RAIN_LIKELY = 60                            # % chance of rain in an hour that counts as "likely"
DRY = 30                                    # % below which another day counts as drier
WINDY_GUSTS = 50                            # km/h: boats may not run
ROUGH_SEA_M = 1.5
MODERATE_SEA_M = 0.8
DARK_GRACE = 15                             # minutes after sunset that still count as light enough
# Usual traffic in Bangladesh towns (not live): when, how much slower, and its name
PEAKS = [(8 * 60, 10 * 60, 1.3, "morning"), (17 * 60, 20 * 60, 1.4, "evening")]


# ---------------------------------------------------------------------------
# Fetching, with a cache that survives restarts and failures
# ---------------------------------------------------------------------------

def _spot(lat: float, lon: float) -> tuple[float, float]:
    return round(lat, 2), round(lon, 2)


def _cached(db: "Session", kind: str, lat: float, lon: float, fetch: Callable[[float, float], dict], refresh: bool):
    """(payload or None, fetched_at or None, stale): the cached copy while fresh, else a new one."""
    from sqlalchemy.orm import Session as _Session
    from app.models.models import ConditionsCache

    slat, slon = _spot(lat, lon)
    row = db.query(ConditionsCache).filter_by(kind=kind, lat=slat, lon=slon).first()
    now = datetime.utcnow()
    if row is not None and now - row.fetched_at < (MIN_REFRESH if refresh else TTL):
        return json.loads(row.payload_json), row.fetched_at, False
    try:
        payload = fetch(lat, lon)
    except ConditionsUnavailable as exc:
        logger.warning("%s for %s,%s unavailable: %s", kind, slat, slon, exc)
        return (json.loads(row.payload_json), row.fetched_at, True) if row is not None else (None, None, True)
    # Its own session: never commit the request's own changes
    with _Session(bind=db.get_bind()) as cache:
        saved = cache.query(ConditionsCache).filter_by(kind=kind, lat=slat, lon=slon).first()
        if saved is None:
            saved = ConditionsCache(kind=kind, lat=slat, lon=slon, payload_json="{}", fetched_at=now)
            cache.add(saved)
        saved.payload_json = json.dumps(payload)
        saved.fetched_at = now
        cache.commit()
    return payload, now, False


def _by_date(hourly: dict, fields: list[str]) -> dict[date, dict[int, dict]]:
    """Hourly arrays → {date: {minute of day: {field: value}}}."""
    out: dict[date, dict[int, dict]] = {}
    for i, stamp in enumerate(hourly.get("time", [])):
        d = date.fromisoformat(stamp[:10])
        out.setdefault(d, {})[t2m(stamp[11:16])] = {f: (hourly.get(f) or [None] * (i + 1))[i] for f in fields}
    return out


# ---------------------------------------------------------------------------
# What a stop is
# ---------------------------------------------------------------------------

def _category(item: "ItineraryItem") -> str:
    return (item.place.category if item.place else "").lower()


def _words(item: "ItineraryItem") -> str:
    p = item.place
    return " ".join([item.title, p.category if p else "", " ".join(p.tags) if p else ""]).lower()


def _outdoor(item: "ItineraryItem") -> bool:
    return item.item_type == "activity" and (_category(item) in OUTDOOR or any(w in _words(item) for w in SEA_WORDS))


def outdoor_place(place) -> bool:
    """A place you're outside at (what the rain matters for), as `_outdoor` decides for a stop."""
    words = " ".join([place.name, place.category or "", " ".join(place.tags)]).lower()
    return (place.category or "").lower() in OUTDOOR or any(w in words for w in SEA_WORDS)


def _by_sea(item: "ItineraryItem") -> bool:
    return item.item_type == "activity" and any(w in _words(item) for w in SEA_WORDS)


def _boat(item: "ItineraryItem") -> bool:
    return item.item_type == "activity" and ("boat" in _words(item) or "island" in _words(item))


def _evening_place(item: "ItineraryItem", rules) -> bool:
    """Meant for the evening or the sunset (a night market, a sunset ride, a must-see at sunset)."""
    best = (item.place.best_time or "").lower() if item.place else ""
    m = rules.must_for(item.place_id) if item.place_id else None
    return any(w in best for w in ("sunset", "evening", "night")) or (m is not None and m.when in ("sunset", "evening"))


# ---------------------------------------------------------------------------
# The report
# ---------------------------------------------------------------------------

def _spans(hours: dict[int, dict], start: int, end: int) -> list[int]:
    """The hours (minute of day, on the hour) that overlap [start, end)."""
    return [h for h in sorted(hours) if h < end and start < h + 60]


def _range(hs: list[int]) -> tuple[str, str]:
    return m2t(hs[0]), m2t(min(hs[-1] + 60, 24 * 60 - 1))


def _peak(minute: int):
    return next(((a, b, f, name) for a, b, f, name in PEAKS if a <= minute < b), None)


def trip_conditions(db: "Session", trip: "Trip", refresh: bool = False) -> dict:
    from app.models.models import Destination

    dest = db.query(Destination).filter(Destination.name == trip.destination).first()
    days: list["Itinerary"] = sorted(trip.itinerary_days, key=lambda d: d.day_number)
    if dest is None or not days:
        return {"available": False, "fetched_at": None, "stale": False, "forecast_until": None, "days": []}
    rules = rules_for(trip, dest)

    fc, fc_at, fc_stale = _cached(db, "forecast", dest.latitude, dest.longitude, openmeteo.forecast, refresh)
    hourly = _by_date((fc or {}).get("hourly", {}), ["temperature_2m", "precipitation_probability", "precipitation", "weather_code", "wind_gusts_10m"])
    daily = (fc or {}).get("daily", {})
    daily_by_date = {
        date.fromisoformat(t): {k: (daily.get(k) or [None] * (i + 1))[i] for k in daily if k != "time"}
        for i, t in enumerate(daily.get("time", []))
    }

    # The sea, at the first beach or boat stop of the trip (one spot covers the coast here)
    sea_stop = next((i for d in days for i in sorted(d.items, key=lambda x: x.order_index) if _by_sea(i) and i.place), None)
    sea_hours: dict[date, dict[int, dict]] = {}
    sea_at = None
    if sea_stop is not None:
        mar, sea_at, _ = _cached(db, "marine", sea_stop.place.latitude, sea_stop.place.longitude, openmeteo.marine, refresh)
        sea_hours = _by_date((mar or {}).get("hourly", {}), ["wave_height"])

    out_days = []
    for day in days:
        d = day.day_date
        hours = hourly.get(d, {})
        in_forecast = bool(hours)
        dd = daily_by_date.get(d, {})
        sunrise = dd["sunrise"][11:16] if dd.get("sunrise") else m2t(sunrise_min(dest.latitude, dest.longitude, d))
        sunset = dd["sunset"][11:16] if dd.get("sunset") else m2t(sunset_min(dest.latitude, dest.longitude, d))
        items = sorted(day.items, key=lambda x: x.order_index)
        acts = [i for i in items if i.item_type == "activity" and i.place is not None]
        warnings: list[dict] = []

        def add(item: Optional["ItineraryItem"], code: str, **params):
            key = code
            kept = item is not None and key in item.kept_warnings
            warnings.append({
                "key": f"{code}:{item.id if item else day.id}",
                "code": code,
                "item_id": item.id if item else None,
                "place": item.title if item else None,
                "stop_number": items.index(item) + 1 if item else None,
                "kept": kept,
                "source": "sea" if code == "rough_sea" else "traffic" if code == "traffic_closing" else "sun" if code == "after_dark" else "weather",
                **params,
            })

        # Weather on outdoor stops
        for item in acts:
            if not in_forecast or not _outdoor(item):
                continue
            s, e = t2m(item.start_time), t2m(item.end_time)
            hs = _spans(hours, s, e)
            storm = [h for h in hs if hours[h].get("weather_code") in STORM_CODES]
            rainy = [h for h in hs if (hours[h].get("precipitation_probability") or 0) >= RAIN_LIKELY]
            windy = [h for h in hs if (hours[h].get("wind_gusts_10m") or 0) >= WINDY_GUSTS]
            move = _drier_day(days, day, s, e, hourly)
            if storm:
                frm, to = _range(storm)
                add(item, "storm", **{"from": frm, "to": to}, boat=_boat(item), move_to=move)
            elif rainy:
                frm, to = _range(rainy)
                chance = max(hours[h].get("precipitation_probability") or 0 for h in rainy)
                add(item, "rain", **{"from": frm, "to": to}, chance=chance, move_to=move)
            if _boat(item) and windy:
                frm, to = _range(windy)
                gust = max(hours[h].get("wind_gusts_10m") or 0 for h in windy)
                add(item, "wind", **{"from": frm, "to": to}, gust=round(gust), move_to=move)

        # The sea for the day (daytime hours), on the first beach or boat stop of the day
        waves = [v["wave_height"] for h, v in sea_hours.get(d, {}).items() if 6 * 60 <= h <= 18 * 60 and v.get("wave_height") is not None]
        day_sea_stop = next((i for i in acts if _by_sea(i)), None)
        sea = None
        if waves and day_sea_stop is not None:
            wave = round(max(waves), 1)
            sea = {"place": day_sea_stop.title, "wave": wave, "level": "rough" if wave >= ROUGH_SEA_M else "moderate" if wave >= MODERATE_SEA_M else "calm"}
            if wave >= ROUGH_SEA_M:
                add(day_sea_stop, "rough_sea", wave=wave)

        # After dark, somewhere wild
        ss = t2m(sunset)
        for item in acts:
            # Remote nature, not a town beach (busy and lit in the evening)
            if _category(item) in WILD and not _by_sea(item) and t2m(item.end_time) > ss + DARK_GRACE and not _evening_place(item, rules):
                add(item, "after_dark", sunset=sunset, end=item.end_time)

        # Usual traffic on the legs that leave in a slow time (not live)
        legs: dict[str, dict] = {}
        slow: set[str] = set()
        for a, b in zip(acts, acts[1:]):
            minutes = a.travel_time_to_next or 0
            mode = a.travel_mode
            if minutes <= 0 or mode == "walk":
                continue
            leave = t2m(a.end_time)
            peak = _peak(leave)
            if peak is None:
                continue
            extra = round(minutes * (peak[2] - 1))
            if extra < 3:
                continue
            legs[str(a.id)] = {"extra": extra, "from": m2t(peak[0]), "to": m2t(peak[1]), "peak": peak[3]}
            slow.add(peak[3])
            closes = t2m(b.place.closing_time) if b.place and b.place.closing_time else None
            if closes is not None and t2m(b.end_time) + extra > closes:
                add(b, "traffic_closing", extra=extra, closes=b.place.closing_time, peak=peak[3])

        # What else was checked
        outside = [
            i for i in acts
            if i.place.opening_time and (t2m(i.start_time) < t2m(i.place.opening_time) or t2m(i.end_time) > t2m(i.place.closing_time))
        ]
        checks = [
            {"code": "opening_hours", "ok": not outside, "count": len(acts)},
            {"code": "after_dark", "ok": not any(w["code"] == "after_dark" for w in warnings), "sunset": sunset,
             "back_by": items[-1].end_time if items else None},
            {"code": "traffic", "ok": not legs, "peaks": sorted(slow)},
        ]

        out_days.append({
            "day_id": day.id,
            "day_number": day.day_number,
            "date": d.isoformat() if d else None,
            "in_forecast": in_forecast,
            "sunrise": sunrise,
            "sunset": sunset,
            "temp_max": _round(dd.get("temperature_2m_max")),
            "temp_min": _round(dd.get("temperature_2m_min")),
            "rain_max": dd.get("precipitation_probability_max"),
            "code": dd.get("weather_code"),
            "hours": [
                {"time": m2t(h), "temp": _round(v.get("temperature_2m")), "rain": v.get("precipitation_probability"), "code": v.get("weather_code")}
                for h, v in sorted(hours.items()) if 5 * 60 <= h <= 22 * 60
            ],
            "sea": sea,
            "items": {
                str(i.id): _at(hours, t2m(i.start_time)) for i in items if in_forecast and _at(hours, t2m(i.start_time))
            },
            "legs": legs,
            "warnings": warnings,
            "checks": checks,
        })

    return {
        "available": fc is not None,
        "fetched_at": fc_at.isoformat() + "Z" if fc_at else None,
        "sea_fetched_at": sea_at.isoformat() + "Z" if sea_at else None,
        "stale": fc_stale,
        "forecast_until": max(hourly).isoformat() if hourly else None,
        "days": out_days,
    }


# ---------------------------------------------------------------------------
# For the planner: the hours to keep outdoor stops out of
# ---------------------------------------------------------------------------

def planning_weather(db: "Session", trip: "Trip") -> dict[int, frozenset[int]]:
    """
    {day number: the wet hours (minute of day, on the hour)}: storms, or rain likely. From
    the cached forecast (fetched if it's old); {} beyond the forecast, without one, or
    when weather planning is off. Planning never waits long or fails for the weather.
    """
    from app.core.config import settings
    from app.models.models import Destination

    today = _today()
    if not settings.weather_planning or trip.start_date > today + timedelta(days=15) or trip.end_date < today:
        return {}
    dest = db.query(Destination).filter(Destination.name == trip.destination).first()
    if dest is None:
        return {}
    fc, _, _ = _cached(db, "forecast", dest.latitude, dest.longitude, lambda la, lo: openmeteo.forecast(la, lo, timeout=5.0), False)
    hourly = _by_date((fc or {}).get("hourly", {}), ["precipitation_probability", "weather_code"])
    out: dict[int, frozenset[int]] = {}
    for n in range(1, trip.num_days + 1):
        hours = hourly.get(trip.start_date + timedelta(days=n - 1), {})
        wet = frozenset(
            h for h, v in hours.items()
            if v.get("weather_code") in STORM_CODES or (v.get("precipitation_probability") or 0) >= RAIN_LIKELY
        )
        if wet:
            out[n] = wet
    return out


def _today() -> date:
    return date.today()


def wet_during(wet: frozenset[int], start: int, end: int) -> bool:
    return any(h < end and start < h + 60 for h in wet)


def _round(v) -> Optional[int]:
    return round(v) if isinstance(v, (int, float)) else None


def _at(hours: dict[int, dict], minute: int) -> Optional[dict]:
    """The weather in the hour a stop starts."""
    v = hours.get(minute // 60 * 60)
    if not v:
        return None
    return {"temp": _round(v.get("temperature_2m")), "rain": v.get("precipitation_probability"), "code": v.get("weather_code")}


def _drier_day(days: list["Itinerary"], here: "Itinerary", start: int, end: int, hourly: dict) -> Optional[dict]:
    """Another day of the trip that's dry at the same time of day (the nearest one), if the forecast reaches it."""
    for d in sorted(days, key=lambda x: (abs(x.day_number - here.day_number), x.day_number)):
        if d.id == here.id:
            continue
        hours = hourly.get(d.day_date, {})
        hs = _spans(hours, start, end)
        if hs and all(
            (hours[h].get("precipitation_probability") or 0) < DRY and hours[h].get("weather_code") not in STORM_CODES
            for h in hs
        ):
            return {"day_id": d.id, "day_number": d.day_number, "date": d.day_date.isoformat() if d.day_date else None}
    return None

"""
Open-Meteo (open-meteo.com): free weather and sea forecasts, no key. Hourly
weather for 16 days, sea (wave height) for about a week. Times come back in
local time (Asia/Dhaka).

Its docs (read 2026-11-19): several places go in one request as comma-separated
latitudes and longitudes, and the answer is then a list with one result per place,
in the order asked (each result carries the weather model's own grid point, not the
coordinates sent); `past_days` (0-92) adds the days before today, as they were;
`current` gives the weather now, from 15-minute data.
"""

from __future__ import annotations

import httpx

FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
MARINE_URL = "https://marine-api.open-meteo.com/v1/marine"
TIMEZONE = "Asia/Dhaka"
# How far the forecast reaches: today and the 15 days after it. The app is told each day's
# date the forecast opens on, so this number lives only here.
FORECAST_DAYS = 16
# How far back `past_days` goes
PAST_DAYS_MAX = 92

HOURLY = "temperature_2m,precipitation_probability,precipitation,weather_code,wind_gusts_10m"


class ConditionsUnavailable(Exception):
    """The forecast couldn't be fetched (no connection, the service is down)."""


def _get(url: str, params: dict, timeout: float) -> dict | list:
    try:
        r = httpx.get(url, params=params, timeout=timeout)
    except httpx.HTTPError as exc:
        raise ConditionsUnavailable(f"Open-Meteo unreachable: {exc}") from exc
    if r.status_code != 200:
        raise ConditionsUnavailable(f"Open-Meteo answered {r.status_code}: {r.text[:200]}")
    return r.json()


def forecast(lat: float, lon: float, timeout: float = 10.0) -> dict:
    """{"hourly": {...}, "daily": {...}}: temperature, rain chance and amount, weather code, gusts; sunrise and sunset."""
    data = _get(FORECAST_URL, {
        "latitude": lat,
        "longitude": lon,
        "hourly": HOURLY,
        "daily": "sunrise,sunset,temperature_2m_max,temperature_2m_min,weather_code,precipitation_probability_max",
        "timezone": TIMEZONE,
        "forecast_days": FORECAST_DAYS,
    }, timeout)
    return {"hourly": data.get("hourly", {}), "daily": data.get("daily", {})}


def forecast_spots(spots: list[tuple[float, float]], past_days: int = 0, timeout: float = 10.0) -> list[dict]:
    """
    One request for several places: per place, in the order given, {"hourly", "daily", "current"}:
    the forecast as `forecast` gives it, the day's rain in mm, the weather now, and `past_days` days
    before today as they were.
    """
    data = _get(FORECAST_URL, {
        "latitude": ",".join(f"{lat:g}" for lat, _ in spots),
        "longitude": ",".join(f"{lon:g}" for _, lon in spots),
        "hourly": HOURLY,
        "daily": "sunrise,sunset,temperature_2m_max,temperature_2m_min,weather_code,precipitation_probability_max,precipitation_sum",
        "current": "temperature_2m,weather_code",
        "timezone": TIMEZONE,
        "forecast_days": FORECAST_DAYS,
        "past_days": max(0, min(past_days, PAST_DAYS_MAX)),
    }, timeout)
    # One place comes back as one result, several as a list
    results = data if isinstance(data, list) else [data]
    if len(results) != len(spots):
        raise ConditionsUnavailable(f"Open-Meteo answered {len(results)} places for {len(spots)}")
    return [{"hourly": r.get("hourly", {}), "daily": r.get("daily", {}), "current": r.get("current")} for r in results]


def marine(lat: float, lon: float, timeout: float = 10.0) -> dict:
    """{"hourly": {"time": [...], "wave_height": [...]}} (wave height in metres; None over land)."""
    data = _get(MARINE_URL, {
        "latitude": lat,
        "longitude": lon,
        "hourly": "wave_height",
        "timezone": TIMEZONE,
        "forecast_days": 8,
    }, timeout)
    return {"hourly": data.get("hourly", {})}

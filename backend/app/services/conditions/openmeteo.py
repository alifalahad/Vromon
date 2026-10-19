"""
Open-Meteo (open-meteo.com): free weather and sea forecasts, no key. Hourly
weather for 16 days, sea (wave height) for about a week. Times come back in
local time (Asia/Dhaka).
"""

from __future__ import annotations

import httpx

FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
MARINE_URL = "https://marine-api.open-meteo.com/v1/marine"
TIMEZONE = "Asia/Dhaka"


class ConditionsUnavailable(Exception):
    """The forecast couldn't be fetched (no connection, the service is down)."""


def _get(url: str, params: dict, timeout: float) -> dict:
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
        "hourly": "temperature_2m,precipitation_probability,precipitation,weather_code,wind_gusts_10m",
        "daily": "sunrise,sunset,temperature_2m_max,temperature_2m_min,weather_code,precipitation_probability_max",
        "timezone": TIMEZONE,
        "forecast_days": 16,
    }, timeout)
    return {"hourly": data.get("hourly", {}), "daily": data.get("daily", {})}


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

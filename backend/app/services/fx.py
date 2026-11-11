"""
Exchange rates for typing a trip's budget in another currency (the planner works in taka).

ExchangeRate-API's open access (open.er-api.com, no key, updated once a day; its terms ask for a
credit, which the app shows next to a converted amount). Rates are kept for `fx_cache_hours`; when
the service can't be reached, the last rates fetched are served and marked stale. Nothing about
the user is sent: the request is the same for everyone.
"""

from __future__ import annotations

import threading
import time
from dataclasses import dataclass
from datetime import datetime, timezone

import httpx

from app.core.config import settings

SOURCE = "ExchangeRate-API"
SOURCE_URL = "https://www.exchangerate-api.com"


class FxUnavailable(Exception):
    """No rates: the service couldn't be reached and none were fetched before."""


@dataclass(frozen=True)
class FxRates:
    base: str
    # One `base` buys this much of each currency (BDT: 1 taka = 0.0082 USD)
    rates: dict[str, float]
    # When the provider last updated them
    updated_at: datetime
    fetched_at: datetime
    stale: bool = False


_lock = threading.Lock()
_cached: FxRates | None = None
_cached_at = 0.0


def _fetch(timeout: float) -> FxRates:
    try:
        r = httpx.get(settings.fx_rates_url, timeout=timeout)
    except httpx.HTTPError as exc:
        raise FxUnavailable(f"Exchange rates unreachable: {exc}") from exc
    if r.status_code != 200:
        raise FxUnavailable(f"Exchange rates answered {r.status_code}")
    data = r.json()
    rates = data.get("rates") or {}
    if data.get("result") != "success" or not rates:
        raise FxUnavailable(f"Exchange rates answered {data.get('result')!r}")
    updated = data.get("time_last_update_unix")
    now = datetime.now(timezone.utc)
    return FxRates(
        base=str(data.get("base_code") or "BDT"),
        rates={str(k): float(v) for k, v in rates.items() if isinstance(v, (int, float)) and v > 0},
        updated_at=datetime.fromtimestamp(updated, timezone.utc) if isinstance(updated, (int, float)) else now,
        fetched_at=now,
    )


def get_rates(timeout: float = 8.0) -> FxRates:
    """Today's rates from taka, from the cache when they're fresh enough."""
    global _cached, _cached_at
    with _lock:
        if _cached is not None and time.monotonic() - _cached_at < settings.fx_cache_hours * 3600:
            return _cached
        try:
            _cached = _fetch(timeout)
            _cached_at = time.monotonic()
            return _cached
        except FxUnavailable:
            if _cached is None:
                raise
            # Yesterday's rates beat none; try again in a few minutes, not at every request
            _cached_at = time.monotonic() - settings.fx_cache_hours * 3600 + 300
            return FxRates(_cached.base, _cached.rates, _cached.updated_at, _cached.fetched_at, stale=True)


def reset_cache() -> None:
    """For tests."""
    global _cached, _cached_at
    with _lock:
        _cached = None
        _cached_at = 0.0

"""
Vromon API v1 — exchange rates from taka (a trip's budget typed in another currency).

Public and the same for everyone: nothing about the user is needed or sent on.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Response

from app.schemas.schemas import FxRatesOut
from app.services import fx

router = APIRouter(prefix="/fx", tags=["fx"])


@router.get("/rates", response_model=FxRatesOut)
def rates(response: Response):
    """How much of each currency one taka buys today (ExchangeRate-API, credited in the app)."""
    try:
        r = fx.get_rates()
    except fx.FxUnavailable as exc:
        raise HTTPException(status_code=503, detail="Exchange rates are unavailable right now") from exc
    response.headers["Cache-Control"] = "public, max-age=3600"
    return FxRatesOut(
        base=r.base,
        rates=r.rates,
        updated_at=r.updated_at,
        fetched_at=r.fetched_at,
        stale=r.stale,
        source=fx.SOURCE,
        source_url=fx.SOURCE_URL,
    )

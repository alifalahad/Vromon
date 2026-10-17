"""Vromon Backend — photo schemas (Android Phase 6)."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel


class PhotoOut(BaseModel):
    id: uuid.UUID
    # Signed, short-lived URLs (≤ 15 minutes). Fetch the list again for fresh ones.
    url: str
    thumb_url: str
    expires_at: datetime
    width: int
    height: int
    taken_on: Optional[date] = None
    place_type: Optional[str] = None
    place_code: Optional[str] = None
    place_name: Optional[str] = None
    country_iso2: Optional[str] = None
    trip_id: Optional[int] = None
    created_at: datetime

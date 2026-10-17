"""
Vromon Backend — account schemas (/me, settings, usernames).
"""

from __future__ import annotations

import re
import uuid
from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

USERNAME_MIN, USERNAME_MAX = 3, 20
_USERNAME_CHARS = re.compile(r"^[a-z0-9._]+$")
RESERVED_USERNAMES = frozenset(
    {"admin", "administrator", "root", "support", "help", "vromon", "official", "staff", "moderator", "system", "api", "me", "null", "undefined"}
)


def username_problem(username: str) -> str | None:
    """Why a (lowercased) username can't be used, or None if it's valid."""
    if not USERNAME_MIN <= len(username) <= USERNAME_MAX:
        return f"Use {USERNAME_MIN}–{USERNAME_MAX} characters"
    if not _USERNAME_CHARS.match(username):
        return "Use only letters, numbers, dots and underscores"
    if username.startswith(".") or username.endswith(".") or ".." in username:
        return "Dots can't be first, last or next to each other"
    if username in RESERVED_USERNAMES:
        return "This username is reserved"
    return None


def normalize_username(raw: str) -> str:
    return raw.strip().lower()


class MeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: Optional[str]
    username: Optional[str]
    display_name: Optional[str]
    home_country_iso2: Optional[str]
    discoverable: bool
    friend_code: str
    created_at: datetime
    # True until a username is claimed: the app shows onboarding first
    needs_onboarding: bool


class MeUpdate(BaseModel):
    """Only the fields sent are changed; send null to clear display name or home country."""

    model_config = ConfigDict(extra="forbid")

    username: Optional[str] = None
    display_name: Optional[str] = Field(default=None, max_length=50)
    home_country_iso2: Optional[str] = None
    discoverable: Optional[bool] = None

    @field_validator("username")
    @classmethod
    def _username(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            raise ValueError("Username can't be removed")
        v = normalize_username(v)
        problem = username_problem(v)
        if problem:
            raise ValueError(problem)
        return v

    @field_validator("display_name")
    @classmethod
    def _display_name(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        v = " ".join(v.split())
        return v or None

    @field_validator("home_country_iso2")
    @classmethod
    def _country(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        v = v.strip().upper()
        if not re.fullmatch(r"[A-Z]{2}", v):
            raise ValueError("Use a two-letter ISO 3166-1 country code")
        return v


class UsernameAvailability(BaseModel):
    username: str
    available: bool
    reason: Optional[str] = None


_CATALOG_ID = r"^[a-z0-9_-]{1,32}$"
_CATALOG_REF = r"^(theme:)?[a-z0-9_-]{1,32}$"


class MapThemeSelection(BaseModel):
    """The map theme picked in the app (mobile features/mapThemes/resolve.ts).

    The catalog lives in the app, so the server checks the shape only: ids, or
    `theme:<id>` for a preset's own style or colours. Unknown ids fall back to the
    default in the app.
    """

    model_config = ConfigDict(extra="forbid")

    v: Literal[1] = 1
    themeId: Optional[str] = Field(None, pattern=_CATALOG_ID)
    styleId: Optional[str] = Field(None, pattern=_CATALOG_REF)
    colorsId: Optional[str] = Field(None, pattern=_CATALOG_REF)
    compareId: Optional[str] = Field(None, pattern=_CATALOG_ID)

    @model_validator(mode="after")
    def _complete(self) -> "MapThemeSelection":
        if not self.themeId and not (self.styleId and self.colorsId and self.compareId):
            raise ValueError("A map theme needs a themeId, or a styleId, colorsId and compareId")
        return self


class SettingsIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    language: Optional[Literal["en", "bn"]] = None
    appearance: Literal["system", "light", "dark"] = "system"
    haptics: bool = True
    units: Literal["km", "mi"] = "km"
    map_theme: Optional[MapThemeSelection] = None
    notify_friend_requests: bool = True
    notify_friend_accepted: bool = True


class SettingsOut(SettingsIn):
    model_config = ConfigDict(from_attributes=True, extra="ignore")

    # Whatever is stored, as is: rows saved before the schema was strict must still load
    map_theme: Optional[dict] = None

    updated_at: Optional[datetime] = None

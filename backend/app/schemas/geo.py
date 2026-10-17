"""
Vromon Backend — geography and visit schemas.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator

PlaceType = Literal["country", "region", "city"]
VisitStatus = Literal["visited", "want", "lived"]
MAX_BATCH = 500


class CountryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    iso2: str
    iso3: Optional[str]
    name: str
    name_bn: Optional[str]
    continent: Optional[str]
    counts_toward_world: bool


class RegionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    code: str
    country_iso2: str
    name: str
    name_bn: Optional[str]
    type: Optional[str]


class CityOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    geonameid: int
    country_iso2: str
    region_code: Optional[str]
    name: str
    lat: float
    lon: float
    population: int


class VisitIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    place_type: PlaceType
    place_code: str = Field(min_length=1, max_length=20)
    status: VisitStatus
    first_visited_on: Optional[date] = None
    last_visited_on: Optional[date] = None
    note: Optional[str] = Field(default=None, max_length=2000)
    # When the change was made on the device (offline edits sync later). The newest
    # write wins per place; a stale edit leaves the server's version in place.
    client_updated_at: Optional[datetime] = None

    @model_validator(mode="after")
    def _dates(self) -> "VisitIn":
        if self.first_visited_on and self.last_visited_on and self.last_visited_on < self.first_visited_on:
            raise ValueError("last_visited_on is before first_visited_on")
        return self


class VisitBatch(BaseModel):
    visits: List[VisitIn] = Field(max_length=MAX_BATCH)


class VisitOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    place_type: PlaceType
    place_code: str
    status: VisitStatus
    first_visited_on: Optional[date]
    last_visited_on: Optional[date]
    note: Optional[str]
    updated_at: datetime
    # The place's country (for regions and cities, from the reference tables)
    country_iso2: Optional[str] = None


class StatsOut(BaseModel):
    countries: int
    regions: int
    cities: int
    continents: int
    continent_names: List[str]
    world_countries: int
    world_total: int
    world_percent: float
    want_to_visit: int

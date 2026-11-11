"""Explore screens: Bangladesh's divisions and districts, and the world's continents, countries and cities."""

from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel

from app.schemas.catalog import FoodOut, PhotoOut, ServicePlaceOut


class ExplorePhoto(PhotoOut):
    """`kind`: photo (of the place itself), attraction (of a sight there, named in `caption`) or
    satellite (Esri imagery of the area, when no photo is known)."""
    kind: str
    caption: Optional[str] = None


class DistrictCounts(BaseModel):
    attractions: int = 0
    gi_foods: int = 0
    gi_products: int = 0
    hotels: int = 0
    hotels_with_price: int = 0
    restaurants: int = 0


class DistrictCard(BaseModel):
    slug: str
    name_en: Optional[str] = None
    name_bn: Optional[str] = None
    division_slug: Optional[str] = None
    division_en: Optional[str] = None
    division_bn: Optional[str] = None
    centroid_lat: Optional[float] = None
    centroid_lon: Optional[float] = None
    area_km2: Optional[float] = None
    bbox: Optional[List[float]] = None        # [min_lon, min_lat, max_lon, max_lat]
    photo: Optional[ExplorePhoto] = None
    counts: DistrictCounts


class DivisionOut(BaseModel):
    slug: str
    name_en: Optional[str] = None
    name_bn: Optional[str] = None
    area_km2: Optional[float] = None
    districts: List[DistrictCard]


class NamedUnit(BaseModel):
    slug: str
    name_en: Optional[str] = None
    name_bn: Optional[str] = None


class ExploreAttraction(BaseModel):
    slug: str
    name_en: Optional[str] = None
    name_bn: Optional[str] = None
    category: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    short_description_en: Optional[str] = None
    photo: Optional[PhotoOut] = None


class TripDestination(BaseModel):
    id: int
    name: str


class DistrictDetail(DistrictCard):
    geometry: Optional[dict] = None
    neighbors: List[NamedUnit]
    subdistricts: List[NamedUnit]
    foods: List[FoodOut]
    attractions: List[ExploreAttraction]
    hotels: List[ServicePlaceOut]
    trip_destinations: List[TripDestination]


class CountryFactsOut(BaseModel):
    capital_en: Optional[str] = None
    capital_bn: Optional[str] = None
    population: Optional[int] = None
    population_year: Optional[int] = None
    area_km2: Optional[float] = None
    currencies: List[dict] = []
    languages: List[str] = []
    calling_codes: List[str] = []
    description_en: Optional[str] = None
    description_bn: Optional[str] = None
    wikidata_id: Optional[str] = None


class CountryCard(BaseModel):
    iso2: str
    name: str
    name_bn: Optional[str] = None
    continent: Optional[str] = None
    un_member_or_observer: bool
    status: Optional[str] = None              # Natural Earth's type: sovereign, dependency, disputed …
    photo: Optional[ExplorePhoto] = None
    facts: Optional[CountryFactsOut] = None


class CityCard(BaseModel):
    geonameid: int
    name: str
    country_iso2: str
    country_name: Optional[str] = None
    region: Optional[str] = None
    population: int
    latitude: float
    longitude: float
    photo: Optional[ExplorePhoto] = None


class CountryDetail(CountryCard):
    regions: int
    cities: List[CityCard]
    label_lat: Optional[float] = None
    label_lon: Optional[float] = None


class ContinentOut(BaseModel):
    name: str
    countries: int
    un_members_and_observers: int
    population: Optional[int] = None          # sum of the countries' Wikidata populations
    largest: List[CountryCard]                # by population, up to 3


class BangladeshOut(BaseModel):
    country: CountryCard
    divisions: List[DivisionOut]
    gi_foods: List[FoodOut]
    sources: List[str]


class SearchOut(BaseModel):
    districts: List[DistrictCard]
    countries: List[CountryCard]
    cities: List[CityCard]


class DistrictMapOut(BaseModel):
    """The district's rendered map (the data platform's template): published languages and credits."""
    languages: List[str]
    width: int
    height: int
    credits: List[str]
    made_on: Optional[str] = None
    # language → the render's version (its checksum's start): put in the image URL so a new render is a new URL
    versions: dict = {}

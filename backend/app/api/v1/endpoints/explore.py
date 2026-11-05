"""
Vromon API v1 — Explore (public, read-only).

GET /explore/bangladesh                 Bangladesh's facts, its divisions with their districts, GI foods
GET /explore/districts/{slug}           one district: outline, neighbours, upazilas, GI foods and products,
                                        attractions, hotels with their published room rates
GET /explore/continents                 continents with their countries' counts and largest countries
GET /explore/countries?continent=       countries, largest population first
GET /explore/countries/{iso2}           one country: facts and its largest cities
GET /explore/cities?continent=&country= the largest cities (GeoNames, 15,000 people or more)
GET /explore/search?q=                  districts, countries and cities by name (English or Bangla)

Only published catalog records are returned, and photos only with an approved licence. A district
without a photo of its own shows a photo of one of its attractions, else Esri's satellite image
of the district; a country without one, Esri's satellite image of it (`photo.kind` says which). Facts are Wikidata's; none is computed here except
the continent's population, the sum of its countries'.
"""

from __future__ import annotations

import json
import math
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models.catalog import (
    AdminAdjacency, AdminBoundary, AdminUnit, Attraction, AttractionMedia, CountryFacts, GeoMedia, LocalFood,
    ServicePlace,
)
from app.models.models import City, Country, Destination, Region
from app.schemas.catalog import FoodOut, PhotoOut
from app.schemas.explore import (
    BangladeshOut, CityCard, ContinentOut, CountryCard, CountryDetail, CountryFactsOut, DistrictCard, DistrictCounts,
    DistrictDetail, DivisionOut, ExploreAttraction, ExplorePhoto, NamedUnit, SearchOut, TripDestination,
)
from app.api.v1.endpoints.catalog import _room_prices, _service_places

router = APIRouter(prefix="/explore", tags=["explore"])
CACHE = "public, max-age=3600"
APPROVED = ("auto_approved", "approved")
NOT_A_CONTINENT = "Seven seas (open ocean)"
ESRI_EXPORT = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export"
ESRI_CREDIT = "Esri, Vantor, Earthstar Geographics, and the GIS User Community"
SOURCES = [
    "Districts and boundaries: geoBoundaries (CC BY 4.0), Bangladesh national portal",
    "GI foods and products: Department of Patents, Designs and Trademarks (DPDT), Bangladesh",
    "Attractions: Wikidata (CC0), Bangladesh national portal; hotels and restaurants: Overture Maps, MoCAT",
    "Country facts: Wikidata (CC0); cities: GeoNames (CC BY 4.0); photos: Wikimedia Commons (credited each)",
]


# --- photos ----------------------------------------------------------------------------------------

def _geo_photos(db: Session, entity_type: str, keys) -> dict[str, ExplorePhoto]:
    keys = [str(k) for k in keys]
    if not keys:
        return {}
    rows = db.scalars(select(GeoMedia).where(GeoMedia.entity_type == entity_type, GeoMedia.entity_key.in_(keys),
                                             GeoMedia.approval_status.in_(APPROVED)))
    return {m.entity_key: ExplorePhoto(kind="photo", url=m.file_url, thumb_url=m.thumb_url, page_url=m.original_url,
                                       license=m.license, license_url=m.license_url, attribution=m.attribution)
            for m in rows}


def _attraction_photos(db: Session, district_ids) -> dict:
    """district id → a photo of one of its published attractions (the widest landscape one)."""
    out: dict = {}
    rows = db.execute(select(Attraction.district_id, Attraction.canonical_name_en, AttractionMedia)
                      .join(AttractionMedia, AttractionMedia.attraction_id == Attraction.id)
                      .where(Attraction.district_id.in_(list(district_ids)), Attraction.status == "published",
                             AttractionMedia.approval_status.in_(APPROVED))).all()
    best: dict = {}
    for did, name, m in rows:
        score = ((m.width or 0) >= (m.height or 0), m.width or 0)
        if did not in best or score > best[did][0]:
            best[did] = (score, name, m)
    for did, (_, name, m) in best.items():
        out[did] = ExplorePhoto(kind="attraction", caption=name, url=m.file_url, thumb_url=m.thumb_url,
                                page_url=m.original_url, width=m.width, height=m.height, license=m.license,
                                license_url=m.license_url, attribution=m.attribution)
    return out


def _satellite(bbox: list[float]) -> ExplorePhoto:
    """Esri's World Imagery over the district's extent, squared so the district sits in the middle."""
    min_lon, min_lat, max_lon, max_lat = bbox
    cx, cy = (min_lon + max_lon) / 2, (min_lat + max_lat) / 2
    half = max(max_lon - min_lon, max_lat - min_lat) / 2 * 1.08
    box = f"{cx - half:.4f},{cy - half:.4f},{cx + half:.4f},{cy + half:.4f}"
    url = f"{ESRI_EXPORT}?bbox={box}&bboxSR=4326&imageSR=3857&size=640,640&format=jpg&f=image"
    return ExplorePhoto(kind="satellite", url=url, thumb_url=url, page_url=ESRI_EXPORT.rsplit("/export", 1)[0],
                        attribution=ESRI_CREDIT)


# --- districts -------------------------------------------------------------------------------------

def _district_cards(db: Session, districts: list[AdminUnit]) -> list[DistrictCard]:
    ids = [d.id for d in districts]
    parents = {u.id: u for u in db.scalars(select(AdminUnit).where(AdminUnit.id.in_({d.parent_id for d in districts})))}
    boxes = {b.admin_unit_id: [b.min_lon, b.min_lat, b.max_lon, b.max_lat]
             for b in db.scalars(select(AdminBoundary).where(AdminBoundary.admin_unit_id.in_(ids),
                                                             AdminBoundary.is_current.is_(True)))}

    def count(stmt) -> dict:
        return dict(db.execute(stmt).all())

    attractions = count(select(Attraction.district_id, func.count()).where(
        Attraction.district_id.in_(ids), Attraction.status == "published").group_by(Attraction.district_id))
    foods = count(select(LocalFood.district_id, func.count()).where(
        LocalFood.district_id.in_(ids), LocalFood.status == "published", LocalFood.is_food.is_(True))
        .group_by(LocalFood.district_id))
    products = count(select(LocalFood.district_id, func.count()).where(
        LocalFood.district_id.in_(ids), LocalFood.status == "published", LocalFood.is_food.is_(False))
        .group_by(LocalFood.district_id))
    places = db.execute(select(ServicePlace.district_id, ServicePlace.kind, func.count()).where(
        ServicePlace.district_id.in_(ids), ServicePlace.status == "published")
        .group_by(ServicePlace.district_id, ServicePlace.kind)).all()
    hotel_ids = db.execute(select(ServicePlace.id, ServicePlace.district_id).where(
        ServicePlace.district_id.in_(ids), ServicePlace.status == "published",
        ServicePlace.kind == "accommodation")).all()
    priced_ids = set(_room_prices(db, [h for h, _ in hotel_ids]))
    priced: dict = {}
    for h, did in hotel_ids:
        if h in priced_ids:
            priced[did] = priced.get(did, 0) + 1
    by_kind: dict = {}
    for did, kind, n in places:
        by_kind[(did, kind)] = n
    own = _geo_photos(db, "district", [d.slug for d in districts])
    sights = _attraction_photos(db, [d.id for d in districts if d.slug not in own])

    out = []
    for d in districts:
        div = parents.get(d.parent_id)
        bbox = boxes.get(d.id)
        photo = own.get(d.slug) or sights.get(d.id) or (_satellite(bbox) if bbox else None)
        out.append(DistrictCard(
            slug=d.slug, name_en=d.name_en, name_bn=d.name_bn, division_slug=div.slug if div else None,
            division_en=div.name_en if div else None, division_bn=div.name_bn if div else None,
            centroid_lat=d.centroid_lat, centroid_lon=d.centroid_lon, area_km2=d.area_km2, bbox=bbox, photo=photo,
            counts=DistrictCounts(attractions=attractions.get(d.id, 0), gi_foods=foods.get(d.id, 0),
                                  gi_products=products.get(d.id, 0), hotels=by_kind.get((d.id, "accommodation"), 0),
                                  hotels_with_price=priced.get(d.id, 0), restaurants=by_kind.get((d.id, "food"), 0))))
    return out


def _foods(db: Session, district_id=None, food_only: bool = True) -> list[FoodOut]:
    stmt = select(LocalFood).where(LocalFood.status == "published")
    if food_only:
        stmt = stmt.where(LocalFood.is_food.is_(True))
    if district_id is not None:
        stmt = stmt.where(LocalFood.district_id == district_id)
    rows = db.scalars(stmt.order_by(LocalFood.is_food.desc(), LocalFood.name_bn)).all()
    slugs = dict(db.execute(select(AdminUnit.id, AdminUnit.slug).where(
        AdminUnit.id.in_({f.district_id for f in rows if f.district_id}))).all())
    return [FoodOut(name_bn=f.name_bn, name_en=f.name_en, district_slug=slugs.get(f.district_id), is_food=f.is_food,
                    gi_registration_no=f.gi_registration_no,
                    gi_application_date=f.gi_application_date.isoformat() if f.gi_application_date else None,
                    district_evidence=f.district_evidence, source_url=f.source_url) for f in rows]


@router.get("/bangladesh", response_model=BangladeshOut)
def bangladesh(response: Response, db: Session = Depends(get_db)):
    units = db.scalars(select(AdminUnit).where(AdminUnit.country_iso2 == "BD", AdminUnit.status == "published",
                                               AdminUnit.level.in_(("division", "district")))
                       .order_by(AdminUnit.name_en)).all()
    cards = _district_cards(db, [u for u in units if u.level == "district"])
    divisions = [DivisionOut(slug=u.slug, name_en=u.name_en, name_bn=u.name_bn, area_km2=u.area_km2,
                             districts=[c for c in cards if c.division_slug == u.slug])
                 for u in units if u.level == "division"]
    country = _country_cards(db, [db.get(Country, "BD")])[0]
    response.headers["Cache-Control"] = CACHE
    return BangladeshOut(country=country, divisions=divisions, gi_foods=_foods(db), sources=SOURCES)


@router.get("/districts/{slug}", response_model=DistrictDetail)
def district(slug: str, response: Response, db: Session = Depends(get_db)):
    d = db.scalar(select(AdminUnit).where(AdminUnit.slug == slug, AdminUnit.level == "district",
                                          AdminUnit.status == "published"))
    if d is None:
        raise HTTPException(status_code=404, detail="Not found")
    card = _district_cards(db, [d])[0]
    g = db.scalar(select(AdminBoundary.geometry_geojson).where(AdminBoundary.admin_unit_id == d.id,
                                                               AdminBoundary.is_current.is_(True)))
    neighbor_ids = db.scalars(select(AdminAdjacency.neighbor_id).where(AdminAdjacency.unit_id == d.id)).all()
    named = lambda rows: [NamedUnit(slug=u.slug, name_en=u.name_en, name_bn=u.name_bn) for u in rows]  # noqa: E731
    neighbors = db.scalars(select(AdminUnit).where(AdminUnit.id.in_(neighbor_ids)).order_by(AdminUnit.name_en)).all()
    subs = db.scalars(select(AdminUnit).where(AdminUnit.parent_id == d.id, AdminUnit.status == "published")
                      .order_by(AdminUnit.name_en)).all()

    sights = db.scalars(select(Attraction).where(Attraction.district_id == d.id, Attraction.status == "published")).all()
    photos: dict = {}
    for m in db.scalars(select(AttractionMedia).where(AttractionMedia.attraction_id.in_([a.id for a in sights]),
                                                      AttractionMedia.approval_status.in_(APPROVED))):
        photos.setdefault(m.attraction_id, PhotoOut(url=m.file_url, thumb_url=m.thumb_url, page_url=m.original_url,
                                                    width=m.width, height=m.height, license=m.license,
                                                    license_url=m.license_url, attribution=m.attribution))
    # Those with a photo first, then those with a description
    sights = sorted(sights, key=lambda a: (a.id not in photos, not a.short_description_en, a.canonical_name_en or ""))
    attractions = [ExploreAttraction(slug=a.slug, name_en=a.canonical_name_en, name_bn=a.canonical_name_bn,
                                     category=a.category_code, latitude=a.latitude, longitude=a.longitude,
                                     short_description_en=a.short_description_en, photo=photos.get(a.id))
                   for a in sights[:40]]
    hotels = _service_places(db, "accommodation", slug, None, None, None, 400)
    # Those with a published room rate first, cheapest first; then the officially rated
    hotels = sorted(hotels, key=lambda h: (h.price is None, h.price.from_amount if h.price and h.price.currency == "BDT"
                                           else float("inf"), -(h.official_star_rating or 0)))[:12]

    dests = [TripDestination(id=x.id, name=x.name) for x in db.scalars(select(Destination).where(
        Destination.is_active.is_(True), Destination.country_iso2 == "BD"))
        if card.bbox and card.bbox[0] <= x.longitude <= card.bbox[2] and card.bbox[1] <= x.latitude <= card.bbox[3]
        and _inside(json.loads(g) if g else None, x.longitude, x.latitude)]
    response.headers["Cache-Control"] = CACHE
    return DistrictDetail(**card.model_dump(), geometry=json.loads(g) if g else None, neighbors=named(neighbors),
                          subdistricts=named(subs), foods=_foods(db, d.id, food_only=False), attractions=attractions,
                          hotels=hotels, trip_destinations=dests)


def _inside(geometry: Optional[dict], lon: float, lat: float) -> bool:
    """Point in a (Multi)Polygon, by ray casting over the outer rings minus holes."""
    if not geometry:
        return False
    polys = geometry["coordinates"] if geometry["type"] == "MultiPolygon" else [geometry["coordinates"]]

    def in_ring(ring) -> bool:
        inside = False
        for (x1, y1), (x2, y2) in zip(ring, ring[1:] + ring[:1]):
            if (y1 > lat) != (y2 > lat) and lon < (x2 - x1) * (lat - y1) / (y2 - y1) + x1:
                inside = not inside
        return inside

    return any(in_ring(p[0]) and not any(in_ring(h) for h in p[1:]) for p in polys)


# --- the world -------------------------------------------------------------------------------------

def _facts_out(f: Optional[CountryFacts]) -> Optional[CountryFactsOut]:
    if f is None:
        return None
    return CountryFactsOut(capital_en=f.capital_en, capital_bn=f.capital_bn, population=f.population,
                           population_year=f.population_year, area_km2=f.area_km2, currencies=f.currencies or [],
                           languages=f.languages or [], calling_codes=f.calling_codes or [],
                           description_en=f.description_en, description_bn=f.description_bn, wikidata_id=f.wikidata_id)


def _country_satellite(c: Country, f: Optional[CountryFacts]) -> Optional[ExplorePhoto]:
    """Esri's imagery of the country (when Wikidata has no photo): the cached World Imagery tile at
    its label point, at the zoom where one tile spans about twice the country. A tile, not an
    export: an export of a large country takes Esri seconds to draw, longer than phones wait."""
    if c.label_lat is None or c.label_lon is None or not f or not f.area_km2:
        return None
    span_km = math.sqrt(f.area_km2) * 2 / max(math.cos(math.radians(c.label_lat)), 0.2)
    z = min(max(int(math.log2(40075 / span_km)), 1), 12)
    n = 2 ** z
    x = int((c.label_lon + 180) / 360 * n)
    lat = math.radians(c.label_lat)
    y = int((1 - math.asinh(math.tan(lat)) / math.pi) / 2 * n)
    url = f"{ESRI_EXPORT.rsplit('/export', 1)[0]}/tile/{z}/{y}/{x}"
    return ExplorePhoto(kind="satellite", url=url, thumb_url=url, page_url=ESRI_EXPORT.rsplit("/export", 1)[0],
                        attribution=ESRI_CREDIT)


def _country_cards(db: Session, countries: list[Country]) -> list[CountryCard]:
    isos = [c.iso2 for c in countries]
    facts = {f.iso2: f for f in db.scalars(select(CountryFacts).where(CountryFacts.iso2.in_(isos)))}
    photos = _geo_photos(db, "country", isos)
    return [CountryCard(iso2=c.iso2, name=c.name, name_bn=c.name_bn, continent=c.continent,
                        un_member_or_observer=c.counts_toward_world, status=c.type,
                        photo=photos.get(c.iso2) or _country_satellite(c, facts.get(c.iso2)),
                        facts=_facts_out(facts.get(c.iso2))) for c in countries]


def _by_population(db: Session, countries: list[Country]) -> list[CountryCard]:
    cards = _country_cards(db, countries)
    return sorted(cards, key=lambda c: (-(c.facts.population or 0) if c.facts else 0, c.name))


def _city_cards(db: Session, cities: list[City]) -> list[CityCard]:
    names = dict(db.execute(select(Country.iso2, Country.name).where(
        Country.iso2.in_({c.country_iso2 for c in cities}))).all())
    regions = dict(db.execute(select(Region.code, Region.name).where(
        Region.code.in_({c.region_code for c in cities if c.region_code}))).all())
    photos = _geo_photos(db, "city", [c.geonameid for c in cities])
    return [CityCard(geonameid=c.geonameid, name=c.name, country_iso2=c.country_iso2,
                     country_name=names.get(c.country_iso2), region=regions.get(c.region_code),
                     population=c.population, latitude=c.lat, longitude=c.lon, photo=photos.get(str(c.geonameid)))
            for c in cities]


@router.get("/continents", response_model=List[ContinentOut])
def continents(response: Response, db: Session = Depends(get_db)):
    countries = db.scalars(select(Country).where(Country.continent.isnot(None), Country.continent != NOT_A_CONTINENT)).all()
    out = []
    for name in sorted({c.continent for c in countries}):
        members = [c for c in countries if c.continent == name]
        cards = _by_population(db, members)
        pops = [c.facts.population for c in cards if c.facts and c.facts.population]
        out.append(ContinentOut(name=name, countries=len(members),
                                un_members_and_observers=sum(c.counts_toward_world for c in members),
                                population=sum(pops) if pops else None, largest=cards[:3]))
    response.headers["Cache-Control"] = CACHE
    return out


@router.get("/countries", response_model=List[CountryCard])
def countries(response: Response, continent: Optional[str] = None, limit: int = Query(300, ge=1, le=300),
              db: Session = Depends(get_db)):
    stmt = select(Country).where(Country.continent != NOT_A_CONTINENT)
    if continent:
        stmt = stmt.where(Country.continent == continent)
    response.headers["Cache-Control"] = CACHE
    return _by_population(db, db.scalars(stmt).all())[:limit]


@router.get("/countries/{iso2}", response_model=CountryDetail)
def country(iso2: str, response: Response, db: Session = Depends(get_db)):
    c = db.get(Country, iso2.upper())
    if c is None:
        raise HTTPException(status_code=404, detail="Not found")
    card = _country_cards(db, [c])[0]
    cities = db.scalars(select(City).where(City.country_iso2 == c.iso2).order_by(City.population.desc()).limit(12)).all()
    regions = db.scalar(select(func.count()).select_from(Region).where(Region.country_iso2 == c.iso2)) or 0
    response.headers["Cache-Control"] = CACHE
    return CountryDetail(**card.model_dump(), regions=regions, cities=_city_cards(db, cities),
                         label_lat=c.label_lat, label_lon=c.label_lon)


@router.get("/cities", response_model=List[CityCard])
def cities(response: Response, continent: Optional[str] = None, country: Optional[str] = None,
           limit: int = Query(30, ge=1, le=100), db: Session = Depends(get_db)):
    stmt = select(City)
    if country:
        stmt = stmt.where(City.country_iso2 == country.upper())
    elif continent:
        stmt = stmt.join(Country, Country.iso2 == City.country_iso2).where(Country.continent == continent)
    response.headers["Cache-Control"] = CACHE
    return _city_cards(db, db.scalars(stmt.order_by(City.population.desc()).limit(limit)).all())


@router.get("/search", response_model=SearchOut)
def search(q: str = Query(..., min_length=1, max_length=80), db: Session = Depends(get_db)):
    term = q.strip()
    like = f"%{term.lower()}%"
    districts = db.scalars(select(AdminUnit).where(
        AdminUnit.level == "district", AdminUnit.status == "published",
        or_(func.lower(AdminUnit.name_en).like(like), AdminUnit.name_bn.like(f"%{term}%")))
        .order_by(AdminUnit.name_en).limit(10)).all()
    countries_ = db.scalars(select(Country).where(
        Country.continent != NOT_A_CONTINENT,
        or_(func.lower(Country.name).like(like), Country.name_bn.like(f"%{term}%"))).order_by(Country.name).limit(10)).all()
    # Cities: names that start with the term (34,000 of them; anywhere-in-the-name matches are noise)
    cities_ = db.scalars(select(City).where(func.lower(City.name).like(f"{term.lower()}%"))
                         .order_by(City.population.desc()).limit(10)).all()
    return SearchOut(districts=_district_cards(db, list(districts)), countries=_country_cards(db, list(countries_)),
                     cities=_city_cards(db, list(cities_)))

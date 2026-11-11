"""
Facts and photos for the Explore screens, from Wikidata (CC0), with each photo's licence,
author and attribution from the Commons API (guideline §8):

  - countries (by ISO 3166-1 alpha-2, P297): capital, population with its year, area,
    currencies, official languages, calling codes, a one-line description, and the
    country's image (P18). Values are Wikidata's best-ranked statements; none is computed.
  - cities (by GeoNames id, P1566): the image of the most populous cities of each country
  - Bangladesh's districts ("district of Bangladesh", Q152732): the image, matched to our
    district by name and by being near its centre; the Wikidata id is recorded

As with attraction photos, a photo is approved for display only when its licence allows
reuse with credit (public domain, CC0, CC BY, CC BY-SA) and an author or credit is
recorded; anything else waits for a person. Only metadata and Commons' URLs are stored.
"""

from __future__ import annotations

import re
from typing import Any, Iterable
from urllib.parse import unquote

from sqlalchemy import func, select

from app.models.catalog import AdminUnit, CountryFacts, EntityExternalId, GeoMedia
from app.models.models import City, Country
from vromon_data import http
from vromon_data.connectors.commons_media import API as COMMONS_API, OPEN_LICENCES, _text
from vromon_data.geo import haversine_km
from vromon_data.pipeline import Connector, Context, Record
from vromon_data.text import name_similarity

SPARQL = "https://query.wikidata.org/sparql"
CITIES_PER_COUNTRY = 6
DISTRICT_MATCH_KM = 40

COUNTRIES = """SELECT ?item ?iso ?image ?descEn ?descBn WHERE {
  ?item wdt:P297 ?iso . FILTER NOT EXISTS { ?item wdt:P576 ?ended }
  OPTIONAL { ?item wdt:P18 ?image }
  OPTIONAL { ?item schema:description ?descEn FILTER(lang(?descEn) = "en") }
  OPTIONAL { ?item schema:description ?descBn FILTER(lang(?descBn) = "bn") }
}"""
# One query per property: best-ranked statements only (Wikidata's own choice of current value)
COUNTRY_PROPS = {
    "capital": """SELECT ?iso ?en ?bn WHERE { ?item wdt:P297 ?iso; p:P36 ?s . ?s a wikibase:BestRank; ps:P36 ?v .
      FILTER NOT EXISTS { ?item wdt:P576 ?ended } FILTER NOT EXISTS { ?s pq:P582 ?until }
      OPTIONAL { ?v rdfs:label ?en FILTER(lang(?en) = "en") } OPTIONAL { ?v rdfs:label ?bn FILTER(lang(?bn) = "bn") } }""",
    "population": """SELECT ?iso ?v ?t WHERE { ?item wdt:P297 ?iso; p:P1082 ?s . ?s a wikibase:BestRank; ps:P1082 ?v .
      FILTER NOT EXISTS { ?item wdt:P576 ?ended } OPTIONAL { ?s pq:P585 ?t } }""",
    "area": """SELECT ?iso ?v WHERE { ?item wdt:P297 ?iso; p:P2046 ?s . ?s a wikibase:BestRank; psn:P2046/wikibase:quantityAmount ?v .
      FILTER NOT EXISTS { ?item wdt:P576 ?ended } }""",
    "currency": """SELECT ?iso ?code ?en WHERE { ?item wdt:P297 ?iso; p:P38 ?s . ?s a wikibase:BestRank; ps:P38 ?v .
      FILTER NOT EXISTS { ?item wdt:P576 ?ended } FILTER NOT EXISTS { ?s pq:P582 ?until }
      ?v wdt:P498 ?code . OPTIONAL { ?v rdfs:label ?en FILTER(lang(?en) = "en") } }""",
    "language": """SELECT ?iso ?en WHERE { ?item wdt:P297 ?iso; p:P37 ?s . ?s a wikibase:BestRank; ps:P37 ?v .
      FILTER NOT EXISTS { ?item wdt:P576 ?ended } ?v rdfs:label ?en FILTER(lang(?en) = "en") }""",
    "calling": """SELECT ?iso ?v WHERE { ?item wdt:P297 ?iso; p:P474 ?s . ?s a wikibase:BestRank; ps:P474 ?v .
      FILTER NOT EXISTS { ?item wdt:P576 ?ended } }""",
}
CITIES = """SELECT ?gn ?item ?image WHERE { VALUES ?gn { %s } ?item wdt:P1566 ?gn; wdt:P18 ?image . }"""
DISTRICTS = """SELECT ?item ?en ?image ?coord WHERE { ?item wdt:P31 wd:Q152732 .
  OPTIONAL { ?item wdt:P18 ?image } OPTIONAL { ?item wdt:P625 ?coord }
  OPTIONAL { ?item rdfs:label ?en FILTER(lang(?en) = "en") } }"""
_POINT = re.compile(r"Point\(([-\d.]+) ([-\d.]+)\)")
# Some items' "image" is a map, a flag or a coat of arms: not a photo of the place
NOT_A_PHOTO = re.compile(r"\.svg$|\.gif$|\bmaps?\b|location|locator|orthographic|\bflag\b|coat.of.arms|emblem|seal\b", re.I)


def _v(row: dict, key: str) -> str | None:
    return (row.get(key) or {}).get("value")


def _qid(uri: str | None) -> str | None:
    return uri.rsplit("/", 1)[-1] if uri else None


def file_title(image_uri: str) -> str:
    """Commons file title from a Special:FilePath URI."""
    return "File:" + unquote(image_uri.rsplit("/", 1)[-1]).replace("_", " ")


class WikidataGeo(Connector):
    name = "wikidata_geo"
    version = "1"
    source_id = "wikidata"
    auto_accept = True
    creates_entities = False
    full_snapshot = False

    def _sparql(self, ctx: Context, c, key: str, query: str) -> list[dict]:
        if ctx.params.get("responses") is not None:   # tests: canned SPARQL bindings by key
            return ctx.params["responses"].get(key, [])
        r = http.get(c, SPARQL, check_robots=False, params={"query": query, "format": "json"})
        r.raise_for_status()
        self.arts.append(ctx.store_artifact(uri=f"{SPARQL}#{key}", content=r.content,
                                            content_type=r.headers.get("content-type"), filename_hint=f"{key}.json"))
        return r.json()["results"]["bindings"]

    def fetch(self, ctx: Context):
        s = ctx.session
        self.arts: list = []
        self.data: dict[str, Any] = {}
        per_country = int(ctx.params.get("cities_per_country", CITIES_PER_COUNTRY))
        ranked = (select(City.geonameid, City.country_iso2,
                         func.row_number().over(partition_by=City.country_iso2,
                                                order_by=City.population.desc()).label("n"))).subquery()
        self.city_ids = [str(g) for g, _ in s.execute(select(ranked.c.geonameid, ranked.c.country_iso2)
                                                      .where(ranked.c.n <= per_country))]
        with http.client(timeout=120) as c:
            self.data["countries"] = self._sparql(ctx, c, "countries", COUNTRIES)
            for key, q in COUNTRY_PROPS.items():
                self.data[key] = self._sparql(ctx, c, key, q)
            self.data["districts"] = self._sparql(ctx, c, "districts", DISTRICTS)
            self.data["cities"] = []
            for i in range(0, len(self.city_ids), 200):
                batch = " ".join(f'"{g}"' for g in self.city_ids[i:i + 200])
                self.data["cities"] += self._sparql(ctx, c, f"cities-{i // 200}" if ctx.params.get("responses") is None
                                                    else "cities", CITIES % batch)
                if ctx.params.get("responses") is not None:
                    break
            self.info = self._imageinfo(ctx, c)
        return self.arts

    def _wanted_images(self) -> set[str]:
        rows = self.data["countries"] + self.data["cities"] + self.data["districts"]
        return {file_title(_v(r, "image")) for r in rows if _v(r, "image")}

    def _imageinfo(self, ctx: Context, c) -> dict[str, dict]:
        if ctx.params.get("imageinfo") is not None:
            return ctx.params["imageinfo"]
        info: dict[str, dict] = {}
        titles = sorted(self._wanted_images())
        for i in range(0, len(titles), 40):
            r = http.get(c, COMMONS_API, check_robots=False, params={
                "action": "query", "format": "json", "prop": "imageinfo", "titles": "|".join(titles[i:i + 40]),
                "iiprop": "url|size|extmetadata", "iiurlwidth": 800,
                "iiextmetadatafilter": "LicenseShortName|LicenseUrl|Artist|Credit"})
            r.raise_for_status()
            self.arts.append(ctx.store_artifact(uri=f"{COMMONS_API}#geo-batch={i // 40}", content=r.content,
                                                content_type=r.headers.get("content-type"),
                                                filename_hint=f"geo-imageinfo-{i // 40}.json"))
            data = r.json()["query"]
            normalized = {n["to"]: n["from"] for n in data.get("normalized", [])}
            for page in data["pages"].values():
                ii = (page.get("imageinfo") or [None])[0]
                if ii:
                    info[normalized.get(page["title"], page["title"])] = ii
        return info

    def parse(self, ctx: Context, arts) -> Iterable[dict[str, Any]]:
        yield {"id": "wikidata-geo", "data": self.data}

    def normalize(self, ctx: Context, raw: dict[str, Any]) -> Record:
        return Record(entity_type="geo_bundle", source_record_id=raw["id"], fields={}, raw={})

    # --- writing -------------------------------------------------------------------------------

    def after(self, ctx: Context, records: list[Record]) -> None:
        self._country_facts(ctx)
        known = set(ctx.session.scalars(select(Country.iso2)))
        images: dict[tuple[str, str], tuple[str | None, list[str]]] = {}
        for r in self.data["countries"]:
            iso = (_v(r, "iso") or "").upper()
            if iso in known and _v(r, "image"):
                images.setdefault(("country", iso), (_qid(_v(r, "item")), []))[1].append(_v(r, "image"))
        for r in self.data["cities"]:
            if _v(r, "gn"):
                images.setdefault(("city", _v(r, "gn")), (_qid(_v(r, "item")), []))[1].append(_v(r, "image"))
        images.update(self._districts(ctx))
        for (entity_type, key), (qid, uris) in images.items():
            self._media(ctx, entity_type, key, qid, uris)
        ctx.session.flush()

    def _country_facts(self, ctx: Context) -> None:
        s = ctx.session
        known = set(s.scalars(select(Country.iso2)))
        facts: dict[str, dict] = {}
        for r in self.data["countries"]:
            iso = (_v(r, "iso") or "").upper()
            if iso in known and iso not in facts:
                facts[iso] = {"qid": _qid(_v(r, "item")), "desc_en": _v(r, "descEn"), "desc_bn": _v(r, "descBn"),
                              "capital": None, "pop": None, "area": None, "cur": [], "lang": [], "call": []}

        def each(key):
            for r in self.data.get(key, []):
                f = facts.get((_v(r, "iso") or "").upper())
                if f is not None:
                    yield f, r

        for f, r in each("capital"):
            f["capital"] = f["capital"] or (_v(r, "en"), _v(r, "bn"))
        for f, r in each("population"):
            year = int(_v(r, "t")[:4]) if _v(r, "t") else None
            if f["pop"] is None or (year or 0) > (f["pop"][1] or 0):
                f["pop"] = (int(float(_v(r, "v"))), year)
        for f, r in each("area"):
            f["area"] = f["area"] or round(float(_v(r, "v")) / 1e6, 1)      # normalized to m²
        for f, r in each("currency"):
            if _v(r, "code") not in [x["code"] for x in f["cur"]]:
                f["cur"].append({"code": _v(r, "code"), "name": _v(r, "en")})
        for f, r in each("language"):
            if _v(r, "en") not in f["lang"]:
                f["lang"].append(_v(r, "en"))
        for f, r in each("calling"):
            if _v(r, "v") not in f["call"]:
                f["call"].append(_v(r, "v"))

        for iso, f in facts.items():
            row = s.get(CountryFacts, iso) or CountryFacts(iso2=iso)
            s.add(row)
            row.wikidata_id = f["qid"]
            row.capital_en, row.capital_bn = f["capital"] or (None, None)
            row.population, row.population_year = f["pop"] or (None, None)
            row.area_km2 = f["area"]
            row.currencies, row.languages, row.calling_codes = sorted(f["cur"], key=lambda x: x["code"]), sorted(f["lang"]), f["call"]
            row.description_en = (f["desc_en"] or "")[:500] or None
            row.description_bn = (f["desc_bn"] or "")[:500] or None
            row.source_id, row.retrieved_at, row.job_id = self.source_id, ctx.now, ctx.job.id
            ctx.count("country_facts")

    def _districts(self, ctx: Context) -> dict:
        s = ctx.session
        images: dict = {}
        districts = list(s.scalars(select(AdminUnit).where(AdminUnit.country_iso2 == "BD", AdminUnit.level == "district")))
        by_item: dict[str, dict] = {}
        for r in self.data["districts"]:
            w = by_item.setdefault(_v(r, "item"), {"images": []})
            w.update({k: _v(r, k) for k in ("en", "coord") if _v(r, k)})
            if _v(r, "image") and _v(r, "image") not in w["images"]:
                w["images"].append(_v(r, "image"))
        for uri, w in by_item.items():
            m = _POINT.match(w.get("coord") or "")
            label = re.sub(r"\s+District$", "", w.get("en") or "")
            best = max(districts, key=lambda d: name_similarity(label, d.name_en or ""), default=None)
            if best is None or name_similarity(label, best.name_en or "") < 85 or not m or best.centroid_lat is None:
                ctx.count("district_unmatched")
                continue
            if haversine_km(float(m.group(2)), float(m.group(1)), best.centroid_lat, best.centroid_lon) > DISTRICT_MATCH_KM:
                ctx.count("district_too_far")
                continue
            qid = _qid(uri)
            if not s.scalar(select(EntityExternalId.id).where(EntityExternalId.entity_id == best.id,
                                                              EntityExternalId.provider == "wikidata")):
                s.add(EntityExternalId(entity_type="admin_unit", entity_id=best.id, provider="wikidata",
                                       external_id=qid, source_id=self.source_id))
            ctx.count("district_matched")
            if w["images"]:
                images[("district", best.slug)] = (qid, w["images"])
        return images

    def _media(self, ctx: Context, entity_type: str, key: str, qid: str | None, image_uris: list[str]) -> None:
        """The first of the item's images that is a photo and is on Commons."""
        s = ctx.session
        photos = [u for u in image_uris if not NOT_A_PHOTO.search(file_title(u))]
        if not photos:
            ctx.count(f"{entity_type}_no_photo")
            return
        image_uri = next((u for u in photos if file_title(u) in self.info), None)
        if image_uri is None:
            ctx.count("missing_on_commons")
            return
        info = self.info[file_title(image_uri)]
        meta = info.get("extmetadata") or {}
        licence = _text(meta, "LicenseShortName")
        creator = _text(meta, "Artist") or _text(meta, "Credit")
        public_domain = (licence or "").lower().startswith(("public domain", "pd", "cc0"))
        open_ok = bool(licence and OPEN_LICENCES.match(licence)) and bool(creator or public_domain)
        row = s.scalar(select(GeoMedia).where(GeoMedia.entity_type == entity_type, GeoMedia.entity_key == key))
        if row is None:
            row = GeoMedia(entity_type=entity_type, entity_key=key, source_id="wikimedia_commons",
                           approval_status="needs_review")
            s.add(row)
        row.wikidata_id = qid
        row.original_url = info.get("descriptionurl") or image_uri
        row.file_url = (info.get("url") or "").split("?")[0] or None
        row.thumb_url = (info.get("thumburl") or "").split("?")[0] or None
        row.license, row.license_url, row.creator = licence, _text(meta, "LicenseUrl"), creator
        row.attribution = f"{creator or 'Unknown author'}, {licence}, via Wikimedia Commons" if licence else None
        row.retrieved_at, row.job_id = ctx.now, ctx.job.id
        if row.approval_status in ("needs_review", "auto_approved"):
            row.approval_status = "auto_approved" if open_ok else "needs_review"
        ctx.count(f"{entity_type}_photo_{'ok' if open_ok else 'needs_review'}")

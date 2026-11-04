"""
Attractions from Wikidata (CC0) for chosen districts (default: the four pilot districts).

For each district: one SPARQL query over its bounding box, for items whose type is (a
subclass of) an attraction type in vromon_data.categories; then each point is placed
in its district and sub-district from Vromon's own boundaries, and only points inside
the chosen districts are kept.

Wikidata is a community source: claims are *proposed* and every new attraction waits
for a person (review task `new_entity`). Each task carries evidence for the reviewer:
the Wikidata page, whether the name appears on the district portal's official tourist
spot list (names only, compared after spelling folding), and any existing app place
with the same Wikidata id. Unnamed gazetteer features (peaks, forest blocks) without a
Bangla label, Wikipedia article or photo are skipped and counted.
"""

from __future__ import annotations

import json
import re
import uuid
from typing import Any, Iterable

from sqlalchemy import select

from app.models.catalog import AdminBoundary, Attraction, ReviewTask
from vromon_data import categories, dedup, http
from vromon_data.admin_lookup import AdminLookup
from vromon_data.connectors.portal_names import load_portals
from vromon_data.pipeline import Connector, Context, Record
from vromon_data.text import bn_to_latin, clean, name_similarity, slugify

SPARQL = "https://query.wikidata.org/sparql"
PILOT = ["bd-district-bandarban", "bd-district-cox-s-bazar", "bd-district-barishal", "bd-district-rajshahi"]
PORTAL_MATCH_BN = 88  # Bangla name vs the portal's Bangla name
PORTAL_MATCH_EN = 92  # only an English name: transliterated comparison, stricter

QUERY = """
SELECT ?item ?itemLabel (SAMPLE(?bn0) AS ?bn) (SAMPLE(?c) AS ?coord) (GROUP_CONCAT(DISTINCT ?cls; separator=" ") AS ?classes)
       (SAMPLE(?descEn0) AS ?descEn) (SAMPLE(?descBn0) AS ?descBn) (SAMPLE(?img) AS ?image) (SAMPLE(?web) AS ?website)
       (SAMPLE(?sl) AS ?sitelinks) (SAMPLE(?herLabel0) AS ?heritage) WHERE {{
  SERVICE wikibase:box {{
    ?item wdt:P625 ?c .
    bd:serviceParam wikibase:cornerSouthWest "Point({w} {s})"^^geo:wktLiteral .
    bd:serviceParam wikibase:cornerNorthEast "Point({e} {n})"^^geo:wktLiteral .
  }}
  VALUES ?cls {{ {classes} }}
  ?item wdt:P31/wdt:P279* ?cls .
  OPTIONAL {{ ?item rdfs:label ?bn0 FILTER(LANG(?bn0) = "bn") }}
  OPTIONAL {{ ?item schema:description ?descEn0 FILTER(LANG(?descEn0) = "en") }}
  OPTIONAL {{ ?item schema:description ?descBn0 FILTER(LANG(?descBn0) = "bn") }}
  OPTIONAL {{ ?item wdt:P18 ?img }}
  OPTIONAL {{ ?item wdt:P856 ?web }}
  OPTIONAL {{ ?item wikibase:sitelinks ?sl }}
  OPTIONAL {{ ?item wdt:P1435 ?her . ?her rdfs:label ?herLabel0 FILTER(LANG(?herLabel0) = "en") }}
  SERVICE wikibase:label {{ bd:serviceParam wikibase:language "en". }}
}} GROUP BY ?item ?itemLabel
"""
_POINT = re.compile(r"Point\(([-\d.]+) ([-\d.]+)\)")
_QID = re.compile(r"^Q\d+$")
_PORTAL_TITLE = re.compile(r'data-column="title">\s*([^<]+?)\s*</td>')


def _v(b: dict, key: str) -> str | None:
    return b[key]["value"] if key in b else None


class WikidataAttractions(Connector):
    name = "wikidata_attractions"
    version = "1"
    source_id = "wikidata"
    auto_accept = False
    order = ("attraction",)

    def fetch(self, ctx: Context):
        categories.ensure(ctx.session)
        self.lookup = AdminLookup(ctx.session)
        self.districts = ctx.params.get("districts") or PILOT
        self.responses: list[tuple[str, Any, Any]] = []
        self.portal_names: dict[str, list[str]] = {}
        classes = " ".join(f"wd:{q}" for q, _ in categories.WIKIDATA_CLASSES)
        portals = load_portals()
        with http.client(timeout=180) as c:
            for slug in self.districts:
                unit = self.lookup.district(slug)
                b = ctx.session.scalar(select(AdminBoundary).where(AdminBoundary.admin_unit_id == unit.id,
                                                                  AdminBoundary.is_current.is_(True)))
                pad = 0.02
                q = QUERY.format(w=b.min_lon - pad, s=b.min_lat - pad, e=b.max_lon + pad, n=b.max_lat + pad, classes=classes)
                if ctx.params.get("responses"):  # tests: canned SPARQL JSON per district
                    data = ctx.params["responses"][slug]
                    art = ctx.store_artifact(uri=f"test://wikidata/{slug}", content=json.dumps(data).encode(),
                                             content_type="application/sparql-results+json", filename_hint=f"{slug}.json")
                else:
                    r = http.get(c, SPARQL, params={"query": q, "format": "json"}, check_robots=False)
                    r.raise_for_status()
                    art = ctx.store_artifact(uri=f"{SPARQL}#district={slug}", content=r.content,
                                             content_type=r.headers.get("content-type"), filename_hint=f"{slug}.json")
                    data = r.json()
                self.responses.append((slug, art, data))
                self.portal_names[slug] = self._portal_spots(ctx, c, slug, portals)
        return [a for _, a, _ in self.responses]

    def _portal_spots(self, ctx: Context, c, slug: str, portals: dict) -> list[str]:
        """Names on the district portal's tourist-spot table (facts only; used as review evidence)."""
        if "portal_spots" in ctx.params:
            return ctx.params["portal_spots"].get(slug, [])
        unit = self.lookup.district(slug)
        key = next((k for k, v in portals.items() if v["level"] == "district" and
                    name_similarity(k, unit.name_en) >= 85), None)
        if key is None:
            return []
        base = f"https://{portals[key]['domain']}.gov.bd/pages/tourist-spot"
        names: list[str] = []
        for page in range(1, 21):  # 10 rows a page
            url = base if page == 1 else f"{base}?page={page}"
            try:
                r = http.get(c, url)
            except Exception as e:  # evidence only: a missing list must not stop the import
                ctx.error("fetch", f"portal tourist-spot list: {e}", slug)
                break
            found = [n for n in (clean(x) for x in _PORTAL_TITLE.findall(r.text)) if n]
            fresh = [n for n in found if n not in names]
            if not fresh:
                break
            ctx.store_artifact(uri=url, content=r.content, content_type=r.headers.get("content-type"),
                               filename_hint=f"{slug}-tourist-spot-p{page}.html")
            names += fresh
        return names

    def parse(self, ctx: Context, arts) -> Iterable[dict[str, Any]]:
        seen: set[str] = set()
        wanted = {self.lookup.district(s).id: s for s in self.districts}
        for slug, art, data in self.responses:
            for b in data["results"]["bindings"]:
                qid = _v(b, "item").rsplit("/", 1)[-1]
                if qid in seen:
                    continue
                m = _POINT.search(_v(b, "coord") or "")
                if not m:
                    continue
                lon, lat = float(m.group(1)), float(m.group(2))
                place = self.lookup.place(lat, lon)
                if not place.in_country:  # e.g. peaks across the border in Myanmar or India
                    ctx.count("skipped_outside_bangladesh")
                    continue
                if place.district_id not in wanted:
                    continue
                seen.add(qid)
                yield {"id": qid, "b": b, "lat": lat, "lon": lon, "place": place, "district_slug": wanted[place.district_id],
                       "artifact_id": art.id}

    def normalize(self, ctx: Context, raw: dict[str, Any]) -> Record | None:
        b, qid = raw["b"], raw["id"]
        classes = [x.rsplit("/", 1)[-1] for x in (_v(b, "classes") or "").split()]
        category = categories.category_for(classes)
        label = clean(_v(b, "itemLabel"))
        name_en = None if (not label or _QID.match(label)) else label
        name_bn = clean(_v(b, "bn"))
        sitelinks = int(_v(b, "sitelinks") or 0)
        image = _v(b, "image")
        if category in categories.GAZETTEER_PRONE and not (name_bn or sitelinks or image):
            ctx.count("skipped_gazetteer_feature")
            return None
        if not (name_en or name_bn):
            ctx.count("skipped_no_name")
            return None
        place = raw["place"]
        fields = {
            "canonical_name_en": name_en, "canonical_name_bn": name_bn, "category_code": category,
            "latitude": round(raw["lat"], 6), "longitude": round(raw["lon"], 6), "location_precision": "point",
            "division_id": str(place.division_id) if place.division_id else None,
            "district_id": str(place.district_id), "subdistrict_id": str(place.subdistrict_id) if place.subdistrict_id else None,
            "short_description_en": clean(_v(b, "descEn")), "short_description_bn": clean(_v(b, "descBn")),
            "official_website": _v(b, "website"), "heritage_designation": clean(_v(b, "heritage")),
        }
        names = [(lang, n, "label") for lang, n in (("en", name_en), ("bn", name_bn)) if n]
        url = f"https://www.wikidata.org/wiki/{qid}"
        rec = Record(entity_type="attraction", source_record_id=qid, fields=fields,
                     raw={"qid": qid, "classes": classes, "sitelinks": sitelinks, "image": image, "district": raw["district_slug"]},
                     external_ids=[("wikidata", qid)], names=names, artifact_id=raw["artifact_id"], source_url=url,
                     confidence="medium", verification_method="spatial_join_admin_boundaries")
        if place.near_edge:
            rec.review.append(("missing_admin_area", {"reason": "point on or near a district border; check the district",
                                                      "outside_outline": place.outside, "wikidata": url}))
        # Evidence for the reviewer
        portal = self.portal_names.get(raw["district_slug"], [])
        compare, threshold = (name_bn, PORTAL_MATCH_BN) if name_bn else (name_en, PORTAL_MATCH_EN)
        best = max(((name_similarity(n, compare), n) for n in portal), default=(0.0, None))
        rec.raw["evidence"] = {
            "wikidata": url, "sitelinks": sitelinks, "has_image": bool(image),
            "official_portal_match": best[1] if best[0] >= threshold else None,
            "official_portal_score": round(best[0]),
        }
        return rec

    def resolve_field(self, ctx: Context, record: Record, field_name: str, value: Any) -> Any:
        return value

    def create(self, ctx: Context, record: Record) -> uuid.UUID:
        district = self.lookup.units[uuid.UUID(record.fields["district_id"])]
        bn = record.fields["canonical_name_bn"]
        base_name = record.fields["canonical_name_en"] or (bn_to_latin(bn) if bn else record.source_record_id)
        base = f"{district.slug.removeprefix('bd-district-')}-{slugify(base_name)}"
        slug = base
        if ctx.session.scalar(select(Attraction.id).where(Attraction.slug == slug)):
            slug = f"{base}-{record.source_record_id.lower()}"
        a = Attraction(slug=slug, country_iso2="BD", status="needs_review", created_by_job_id=ctx.job.id, field_status={})
        ctx.session.add(a)
        ctx.session.flush()
        return a.id

    def after(self, ctx: Context, records: list[Record]) -> None:
        # Put the evidence on each new-entity task, so the reviewer sees it with the record
        for rec in records:
            if rec.entity_id is None:
                continue
            task = ctx.session.scalar(select(ReviewTask).where(ReviewTask.entity_id == rec.entity_id,
                                                               ReviewTask.task_type == "new_entity",
                                                               ReviewTask.status == "open"))
            if task is not None:
                task.payload = {**task.payload, **rec.raw.get("evidence", {}),
                                "name_en": rec.fields["canonical_name_en"], "name_bn": rec.fields["canonical_name_bn"],
                                "category": rec.fields["category_code"], "district": rec.raw["district"],
                                "lat": rec.fields["latitude"], "lon": rec.fields["longitude"]}
            if rec.raw.get("evidence", {}).get("official_portal_match"):
                ctx.count("on_official_portal_list")
        ctx.count("review_duplicate", dedup.open_tasks(ctx.session, ctx.job.id))

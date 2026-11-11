"""
Hotels, resorts, guest houses, restaurants and cafés (guideline §3.7).

  overture_service_places  Overture Maps Places (CDLA-Permissive-2.0; Foursquare rows Apache-2.0 with
                           NOTICE): public business listings from Meta, Microsoft, AllThePlaces,
                           PinMeTo, Foursquare. One DuckDB query over Overture's open S3 release, for
                           the Bangladesh box and the lodging and food categories only.
                           Listing confidence (Overture's own score): >= 0.8 published as
                           "business listing, not checked"; 0.7-0.8 kept for review; < 0.7 skipped.
                           A name that is an address is kept for review; listings that may be one
                           business become `duplicate` review tasks (never merged automatically).
  mocat_star_hotels        The Ministry of Civil Aviation and Tourism's (Hotel & Restaurant Cell)
                           official lists of five-, four- and three-star hotels. Each listed hotel is
                           matched by name within its district and gets an official star rating; a
                           listed hotel with no match is added with its district and no location.

Prices, ratings and opening hours are in neither source and stay unknown.
"""

from __future__ import annotations

import html
import io
import json
import re
import uuid
from typing import Any, Iterable

from rapidfuzz import fuzz
from sqlalchemy import select

from app.models.catalog import AdminUnit, ServicePlace
from vromon_data import artifacts, http
from vromon_data.admin_lookup import AdminLookup
from vromon_data.pipeline import Connector, Context, Record
from vromon_data.text import bn_to_latin, clean, match_key, slugify

OVERTURE_S3 = "s3://overturemaps-us-west-2/release"
BD_BOX = (88.0, 20.3, 92.8, 26.7)
LODGING = {"hotel", "motel", "resort", "hostel", "guest_house", "bed_and_breakfast", "inn", "lodge", "accommodation", "cottage"}
FOOD = {"restaurant", "cafe", "coffee_shop", "fast_food_restaurant", "bakery", "tea_room", "food_court", "dessert_shop",
        "smoothie_juice_bar", "bar"}
PUBLISH_AT, REVIEW_AT = 0.8, 0.7
_BN = re.compile(r"[ঀ-৿]")


def latest_release() -> str:
    import duckdb
    con = duckdb.connect()
    con.execute("INSTALL httpfs; LOAD httpfs; SET s3_region='us-west-2';")
    return con.execute(f"SELECT max(regexp_extract(file, 'release/([^/]+)/', 1)) FROM glob('{OVERTURE_S3}/*/theme=places/type=place/*')").fetchone()[0]


def _place_fields(lookup: AdminLookup, lat: float, lon: float) -> tuple[dict | None, bool]:
    p = lookup.place(lat, lon)
    if not p.in_country:
        return None, False
    return {"division_id": str(p.division_id) if p.division_id else None, "district_id": str(p.district_id),
            "subdistrict_id": str(p.subdistrict_id) if p.subdistrict_id else None}, p.near_edge


class _ServicePlaceConnector(Connector):
    auto_accept = True
    order = ("service_place",)

    def create(self, ctx: Context, record: Record) -> uuid.UUID:
        f = record.fields
        name = f.get("name_en") or (bn_to_latin(f["name_bn"]) if f.get("name_bn") else record.source_record_id)
        district = self.lookup.units.get(uuid.UUID(f["district_id"])) if f.get("district_id") else None
        base = f"{district.slug.removeprefix('bd-district-') + '-' if district else ''}{slugify(name)}"[:180]
        slug = base if not ctx.session.scalar(select(ServicePlace.id).where(ServicePlace.slug == base)) \
            else f"{base}-{uuid.uuid4().hex[:6]}"
        sp = ServicePlace(slug=slug, kind=f["kind"], status=record.raw.get("_status", "needs_review"),
                          created_by_job_id=ctx.job.id, field_status={})
        ctx.session.add(sp)
        ctx.session.flush()
        return sp.id


class OvertureServicePlaces(_ServicePlaceConnector):
    name = "overture_service_places"
    version = "1"
    source_id = "overture_places"

    def fetch(self, ctx: Context):
        self.lookup = AdminLookup(ctx.session)
        if ctx.params.get("rows") is not None:  # tests
            self.rows = ctx.params["rows"]
            return []
        import duckdb
        release = ctx.params.get("release") or latest_release()
        con = duckdb.connect()
        con.execute("INSTALL httpfs; LOAD httpfs; INSTALL spatial; LOAD spatial; SET s3_region='us-west-2';")
        cats = ",".join(f"'{c}'" for c in sorted(LODGING | FOOD))
        w, s, e, n = BD_BOX
        out = artifacts.paths.RAW_DIR / "_tmp-overture.parquet"
        out.parent.mkdir(parents=True, exist_ok=True)
        con.execute(f"""COPY (SELECT id, names.primary AS name, names.common AS names_common, basic_category AS category,
            confidence, operating_status, websites, phones, addresses, brand.names.primary AS brand,
            list_transform(sources, lambda s: s.dataset) AS datasets, ST_X(geometry) AS lon, ST_Y(geometry) AS lat
            FROM read_parquet('{OVERTURE_S3}/{release}/theme=places/type=place/*', hive_partitioning=1)
            WHERE bbox.xmin > {w} AND bbox.xmax < {e} AND bbox.ymin > {s} AND bbox.ymax < {n} AND basic_category IN ({cats}))
            TO '{out.as_posix()}' (FORMAT parquet)""")
        self.art = ctx.store_artifact(uri=f"{OVERTURE_S3}/{release}/theme=places#bd-lodging-food", content=out.read_bytes(),
                                      content_type="application/vnd.apache.parquet", filename_hint=f"overture-{release}-bd.parquet")
        self.rows = [dict(zip([d[0] for d in cur.description], r)) for cur in [con.execute(f"SELECT * FROM '{out.as_posix()}'")]
                     for r in cur.fetchall()]
        out.unlink()
        ctx.count("overture_rows", len(self.rows))
        return [self.art]

    def parse(self, ctx: Context, arts) -> Iterable[dict[str, Any]]:
        seen: set = set()
        for r in self.rows:
            conf = r.get("confidence") or 0
            if conf < REVIEW_AT:
                ctx.count("skipped_low_confidence")
                continue
            if (r.get("operating_status") or "open") != "open":
                ctx.count("skipped_closed")
                continue
            key = (r["category"] in LODGING, match_key(r.get("name")), round(r["lat"], 3), round(r["lon"], 3))
            if key in seen:  # the same business listed twice at the same spot
                ctx.count("skipped_duplicate")
                continue
            seen.add(key)
            yield {**r, "id": r["id"]}

    def normalize(self, ctx: Context, raw: dict[str, Any]) -> Record | None:
        admin, edge = _place_fields(self.lookup, raw["lat"], raw["lon"])
        if admin is None:
            ctx.count("skipped_outside_bangladesh")
            return None
        name = clean(raw.get("name"))
        common = raw.get("names_common") or {}
        name_bn = clean(common.get("bn")) or (name if name and _BN.search(name) else None)
        name_en = clean(common.get("en")) or (name if name and not _BN.search(name) else None)
        addr = (raw.get("addresses") or [{}])[0] or {}
        fields = {"kind": "accommodation" if raw["category"] in LODGING else "food", "category": raw["category"],
                  "name_en": name_en, "name_bn": name_bn, "latitude": round(raw["lat"], 6), "longitude": round(raw["lon"], 6),
                  **admin, "address": clean(", ".join(x for x in (addr.get("freeform"), addr.get("locality")) if x)) or None,
                  "website": (raw.get("websites") or [None])[0], "phone": (raw.get("phones") or [None])[0],
                  "brand": clean(raw.get("brand")), "listing_confidence": round(raw["confidence"], 3)}
        rec = Record(entity_type="service_place", source_record_id=raw["id"], fields=fields,
                     raw={"datasets": raw.get("datasets"), "_status": "published" if raw["confidence"] >= PUBLISH_AT else "needs_review"},
                     external_ids=[("overture", raw["id"])],
                     names=[(lang, n, "label") for lang, n in (("en", name_en), ("bn", name_bn)) if n],
                     artifact_id=getattr(self, "art", None) and self.art.id, source_url="https://docs.overturemaps.org/guides/places",
                     confidence="medium", verification_method="business_listing")
        if edge:
            rec.raw["_status"] = "needs_review"
        if name_is_address(name_en or name_bn):
            rec.raw["_status"] = "needs_review"
            ctx.count("name_looks_like_address")
        return rec

    def after(self, ctx: Context, records: list[Record]) -> None:
        from app.models.catalog import ReviewTask
        decided = set(ctx.session.scalars(select(ReviewTask.entity_id).where(
            ReviewTask.entity_type == "service_place", ReviewTask.status.in_(("approved", "rejected")))))
        for rec in records:
            if rec.entity_id:
                sp = ctx.session.get(ServicePlace, rec.entity_id)
                # A person's decision and an official rating stand; otherwise the listing's own confidence decides
                if sp.status != "rejected" and sp.id not in decided and sp.official_star_rating is None:
                    sp.status = rec.raw["_status"]
                ctx.count(f"{sp.kind}_{sp.status}")
        ctx.session.flush()

    def after_resolve(self, ctx: Context) -> None:
        ctx.count("duplicate_tasks_opened", duplicate_tasks(ctx.session, ctx.job.id))


MOCAT_PAGES = {5: "https://mocat.gov.bd/pages/static-pages/6940329735ce18e1c055efda",
               4: "https://mocat.gov.bd/pages/static-pages/694032a135ce18e1c055fad8",
               3: "https://mocat.gov.bd/pages/static-pages/6940329335ce18e1c055ecbd"}
_ENTRY = re.compile(r"(?:^|\s)([০-৯]+)\.\s+(.*?)(?=\s[০-৯]+\.\s|$)")
# An entry is "<name> <address>" with no separator. The name ends at a company suffix; without one,
# before the first address word (a number, plot, road …) or comma, and then after its last hotel word
# ("সারাহ রিসোর্ট রাজাবাড়ি," → "সারাহ রিসোর্ট").
_SUFFIXES = {"লিঃ", "লি:", "লিমিটেড", "লিমিটড"}
_ADDRESS_WORDS = ("প্লট", "হাউজ", "বাড়ি", "রোড", "এয়ারপোর্ট", "এয়ারপার্ট", "হোটল-মোটেল", "হোটেল-মোটেল", "মেরিন", "মেরীন", "কলেজ")
_NAME_ENDS = {"হোটেল", "হোটেলস", "রিসোর্ট", "রিসোর্টস", "রিসার্ট", "রিসোটর্স", "স্পা", "গলফ", "ইন", "ইন্", "ভিউ", "গার্ডন",
              "গার্ডেন", "রেসিডন্স"}
# Words every hotel or restaurant name has; left out when comparing names
_PLACE_WORDS = {"hotel", "hotels", "resort", "resorts", "international", "and", "the", "suites", "ltd", "limited", "spa",
                "হোটেল", "হোটেলস", "রিসোর্ট", "রিসোর্টস", "রিসার্ট", "রিসোটর্স", "এন্ড", "এ্যান্ড", "ও", "দি", "ইন্টারন্যাশনাল", "স্পা",
                "restaurant", "restora", "resturant", "cafe", "café", "party", "center", "centre", "&",
                "রেস্তোরা", "রেস্তোরাঁ", "রেস্টুরেন্ট", "রেষ্টুরেন্ট", "ক্যাফে", *_SUFFIXES}
# A first name part with one of these is a business ("Chondu Hotel, Bissoroad, Comilla"); without,
# a name of three or more parts is usually an address ("তালতলী মুরগিবাজার, শ্রীপুর, গাজীপুর")
_BUSINESS_WORDS = _PLACE_WORDS - {"and", "the", "&", "ও", "দি", "এন্ড", "এ্যান্ড", "international", "ইন্টারন্যাশনাল", "party", "center",
                                  "centre"} | {"inn", "ইন", "guest", "motel", "cottage", "coffee", "কফি", "kitchen", "কিচেন", "kabab",
                                               "কাবাব", "biryani", "বিরিয়ানি", "food", "ফুড", "snacks", "bar", "dine", "bakery", "sweets",
                                               "মিষ্টি", "হোটেল", "রিসোর্ট"}
DUPLICATE_M, DUPLICATE_AT = 150, 90   # listings this close, with names this alike, may be one business
MATCH_AT = 85          # token_sort_ratio of the two name keys
SHORT_MATCH_AT = 95    # keys under 8 letters: one letter is too much ("Sea Crown" vs "Sea Queen")
MATCH_MARGIN = 5       # the best listing must beat any differently named one by this much


def split_entry(entry: str) -> tuple[str, str]:
    """An official entry → (name, address)."""
    quoted = re.search(r"“(.+?)”", entry)
    if quoted:
        return quoted.group(1).strip(), entry[quoted.end():].strip(" ,।")
    tokens = entry.split()
    end = next((i + 1 for i, t in enumerate(tokens) if t.strip(",।") in _SUFFIXES), None)
    if end is None:
        end = next((i for i, t in enumerate(tokens) if i and (t[0] in "০১২৩৪৫৬৭৮৯0123456789" or t.startswith(_ADDRESS_WORDS)
                                                              or t.endswith(","))), len(tokens))
        last = max((i for i, t in enumerate(tokens[:end]) if i and t in _NAME_ENDS), default=None)
        end = last + 1 if last is not None else end
    return " ".join(tokens[:end]).strip(" ,"), " ".join(tokens[end:]).strip(" ,।")


def name_is_address(name: str | None) -> bool:
    parts = [p for p in re.split(r"[,،]", name or "") if p.strip()]
    return len(parts) >= 3 and not any(w.casefold().strip("।.") in _BUSINESS_WORDS for w in re.split(r"[\s\-/()]+", parts[0]))


def duplicate_tasks(session, job_id=None) -> int:
    """A `duplicate` review task for each pair of listings that may be one business: same kind and
    district, within DUPLICATE_M, names alike in either script. Nothing is merged automatically (as
    for attractions, vromon_data.dedup). Returns the number of tasks opened."""
    from collections import defaultdict
    from app.models.catalog import ReviewTask
    from vromon_data.dedup import _km
    session.flush()  # the session doesn't autoflush; resolved locations must be visible to the query
    rows = session.scalars(select(ServicePlace).where(ServicePlace.status.in_(("published", "needs_review")),
                                                      ServicePlace.latitude.is_not(None))).all()
    known = {frozenset((t.entity_id, t.related_entity_id)) for t in session.scalars(
        select(ReviewTask).where(ReviewTask.task_type == "duplicate", ReviewTask.entity_type == "service_place"))}
    cells = defaultdict(list)
    for p in rows:   # cells of about 200 m, so only neighbours are compared
        cells[(p.kind, p.district_id, int(p.latitude * 500), int(p.longitude * 500))].append(p)
    keys = {p.id: place_key(p.name_en or p.name_bn) for p in rows}
    opened = 0
    for (kind, district, i, j), here in cells.items():
        near = [q for di in (-1, 0, 1) for dj in (-1, 0, 1) for q in cells.get((kind, district, i + di, j + dj), ())]
        for a in here:
            for b in near:
                if str(a.id) >= str(b.id) or not keys[a.id] or not keys[b.id] or frozenset((a.id, b.id)) in known:
                    continue
                metres = _km((a.latitude, a.longitude), (b.latitude, b.longitude)) * 1000
                score = name_score(keys[a.id], keys[b.id])
                if metres <= DUPLICATE_M and score >= DUPLICATE_AT:
                    known.add(frozenset((a.id, b.id)))
                    session.add(ReviewTask(task_type="duplicate", entity_type="service_place", entity_id=a.id,
                                           related_entity_id=b.id, priority=2, job_id=job_id,
                                           payload={"distance_m": round(metres), "name_similarity": round(score),
                                                    "record_a": a.name_en or a.name_bn, "record_b": b.name_en or b.name_bn}))
                    opened += 1
    session.flush()
    return opened


def place_key(name: str | None) -> str:
    """A spelling-insensitive key without the words every hotel or restaurant name has. Unlike
    match_key alone, it keeps what follows a comma ("Dhaka,shakil International Hotel" is not "Dhaka")."""
    name = re.sub(r"\s+by\s+\w+$", "", clean(name) or "", flags=re.I)  # "InterContinental Dhaka by IHG"
    words = [w for w in re.split(r"[\s\-,/()“”]+", name) if w and w.casefold() not in _PLACE_WORDS]
    return match_key(" ".join(words), drop_generic=False)


def name_score(a: str, b: str) -> float:
    """Whole-name similarity: one name inside a longer one ("Long" in "Inani Long Bay") is not a match."""
    shortest = min(len(a.replace(" ", "")), len(b.replace(" ", "")))
    if shortest < 4:
        return 100.0 if a == b else 0.0
    score = fuzz.token_sort_ratio(a, b)
    return score if shortest >= 8 or score >= SHORT_MATCH_AT else min(score, MATCH_AT - 1)


def find_district(address: str, units: list[AdminUnit]) -> AdminUnit | None:
    """The district an official address names. Its last part first ("নওদাপাড়া রংপুর রোড, বগুড়া" is in
    Bogura, not Rangpur), spelt a little differently too ("কক্রবাজার", "নারায়নগঞ্জ"); else a district's
    name anywhere, else a sub-district's."""
    address = clean(address) or ""
    districts = sorted((u for u in units if u.level == "district" and u.name_bn), key=lambda d: -len(d.name_bn))
    last = re.sub(r"[-–][০-৯0-9]+$", "", address.strip(" ,।").split(",")[-1].strip())
    hit = next((d for d in districts if d.name_bn in last), None)
    if hit:
        return hit
    best = max(districts, key=lambda d: fuzz.ratio(last, d.name_bn), default=None)
    if best is not None and fuzz.ratio(last, best.name_bn) >= 80:
        return best
    hit = next((d for d in districts if d.name_bn in address), None)
    if hit:
        return hit
    by_id = {u.id: u for u in units}
    sub = next((s for s in sorted((u for u in units if u.level == "subdistrict" and u.name_bn), key=lambda s: -len(s.name_bn))
                if s.name_bn in address), None)
    return by_id.get(sub.parent_id) if sub is not None else None


def best_listing(name: str, candidates: list[ServicePlace]) -> tuple[ServicePlace | None, ServicePlace | None, float]:
    """(the one listing whose name matches, the closest listing, its score). No match when none is
    close enough or two differently named ones are."""
    key = place_key(name)
    scored = sorted(((max(name_score(key, place_key(p.name_en)), name_score(key, place_key(p.name_bn))), p)
                     for p in candidates if p.name_en or p.name_bn), key=lambda sp: -sp[0])
    if not scored:
        return None, None, 0.0
    top, best = scored[0]
    rival = next((s for s, p in scored[1:] if place_key(p.name_en) != place_key(best.name_en)), 0.0)
    return (best if top >= MATCH_AT and top - rival >= MATCH_MARGIN else None), best, top


class MocatStarHotels(_ServicePlaceConnector):
    name = "mocat_star_hotels"
    version = "1"
    source_id = "mocat_hotels"
    creates_entities = False

    def fetch(self, ctx: Context):
        self.lookup = AdminLookup(ctx.session)
        self.entries: list[dict] = []
        with http.client(timeout=120) as c:
            for star, url in MOCAT_PAGES.items():
                text = ctx.params["pages"][star] if ctx.params.get("pages") else http.get(c, url).text
                art = ctx.store_artifact(uri=url, content=text.encode(), content_type="text/html", filename_hint=f"mocat-{star}-star.html")
                body = re.sub(r"<script.*?</script>|<style.*?</style>", " ", text, flags=re.S)
                plain = " ".join(html.unescape(re.sub(r"<[^>]+>", " ", body)).replace("­", "").split())
                i = plain.find("তারকা মানঃ")
                plain = plain[i:] if i >= 0 else plain
                plain = plain.split("এই কনটেন্টটি শেয়ার")[0]
                for m in _ENTRY.finditer(plain):
                    entry = m.group(2).strip(" ।")
                    name, address = split_entry(entry)
                    self.entries.append({"star": star, "name": clean(name), "address": clean(address),
                                         "entry": entry, "url": url, "artifact_id": art.id})
        return []

    def parse(self, ctx: Context, arts) -> Iterable[dict[str, Any]]:
        for e in self.entries:
            yield {"id": f"{e['star']}:{e['entry']}", **e}

    def normalize(self, ctx: Context, raw: dict[str, Any]) -> Record:
        return Record(entity_type="service_place", source_record_id=raw["id"], fields={}, raw=raw)

    def after(self, ctx: Context, records: list[Record]) -> None:
        from vromon_data import claims as C
        s = ctx.session
        units = list(self.lookup.units.values())
        found = []
        for rec in records:
            e = rec.raw
            district = find_district(e["address"] or e["entry"], units)
            candidates = s.scalars(select(ServicePlace).where(ServicePlace.kind == "accommodation",
                                                              ServicePlace.district_id == (district.id if district else None),
                                                              ServicePlace.status.notin_(("inactive", "rejected")),
                                                              ServicePlace.latitude.is_not(None))).all() if district else []
            found.append((e, district, *best_listing(e["name"], candidates)))
        # A listing two official entries point to ("Unique Hotel & Resorts Limited", the company behind
        # two hotels) is neither of them
        hits: dict = {}
        for _, _, best, _, _ in found:
            if best is not None:
                hits[best.id] = hits.get(best.id, 0) + 1
        for e, district, best, closest, score in found:
            if best is not None and hits[best.id] == 1:
                target = best
                ctx.count("matched_listing")
            else:
                if best is not None:
                    ctx.count("shared_listing")
                slug = f"{(district.slug.removeprefix('bd-district-') + '-') if district else ''}{slugify(bn_to_latin(e['name']))}-{e['star']}star"[:190]
                if s.scalar(select(ServicePlace.id).where(ServicePlace.slug == slug)):
                    slug = f"{slug}-{uuid.uuid4().hex[:6]}"
                target = ServicePlace(slug=slug,
                                      kind="accommodation", category="hotel", status="needs_review", created_by_job_id=ctx.job.id, field_status={})
                s.add(target)
                s.flush()
                C.add_claim(s, entity_type="service_place", entity_id=target.id, field="kind", value="accommodation",
                            source_id=self.source_id, status="accepted", retrieved_at=ctx.now, job_id=ctx.job.id, source_url=e["url"])
                if district:
                    C.add_claim(s, entity_type="service_place", entity_id=target.id, field="district_id", value=str(district.id),
                                source_id=self.source_id, status="accepted", retrieved_at=ctx.now, job_id=ctx.job.id, source_url=e["url"])
                ctx.review("location_needed", entity_type="service_place", entity_id=target.id, name=e["name"],
                           address=e["address"], star=e["star"],
                           **({"closest_listing": closest.slug, "closest_name": closest.name_en, "closest_score": round(score)}
                              if closest is not None else {}))
                ctx.count("added_without_location")
            for field, value in (("official_star_rating", e["star"]), ("name_bn", e["name"]), ("address", e["address"] or None)):
                C.add_claim(s, entity_type="service_place", entity_id=target.id, field=field, value=value, source_id=self.source_id,
                            status="accepted", retrieved_at=ctx.now, job_id=ctx.job.id, source_url=e["url"], confidence="high",
                            verification_method="official_list", verified_at=ctx.now)
            C.resolve(s, "service_place", target.id)
        s.flush()

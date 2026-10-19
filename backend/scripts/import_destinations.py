"""
Build the destination data files from open sources (trip planner step 10).

    cd backend && venv/bin/python -m scripts.import_destinations [--only Sylhet]

Reads data/destinations/sources.json and writes, per destination,
data/destinations/<slug>.json (reviewable, committed with the code) plus the
quality report docs/trip-planner/data-quality.md. Nothing is written to a
database: app/db/destinations.py loads the files.

Sources: Wikivoyage (CC BY-SA 4.0) listings and descriptions, Wikidata (CC0)
sights. Fetched once, politely (a named user agent, one query per destination).
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import time
from datetime import date
from pathlib import Path

import httpx

from app.services.destinations.importer import (
    ACTIVITY, VISIT_HOURS, WIKIDATA_TYPES, category_for, clean_description, km, listings, parse_hours, parse_price,
    same_place, tags_for, to_float,
)

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data" / "destinations"
REPORT = ROOT / "docs" / "trip-planner" / "data-quality.md"
UA = {"User-Agent": "VromonDataImport/1.0 (travel planner prototype; one-off import)"}
WV_API = "https://en.wikivoyage.org/w/api.php"
WD_SPARQL = "https://query.wikidata.org/sparql"
MAX_PLACES = 40
MAX_HOTELS = 15
MAX_RESTAURANTS = 20
MAX_SHARE = 0.4          # of the places, at most this share in one category (from Wikidata)
SAME_SPOT_KM = 0.15      # the same kind of place this close is the same place under another name


def slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


CACHE = Path.home() / ".cache" / "vromon-import"   # outside the repo; answers are reused for a week
CACHE_DAYS = 7


def get(client: httpx.Client, url: str, **params) -> dict:
    """A JSON answer: from the cache when fresh, else asked for politely (waits when told to slow down)."""
    key = hashlib.sha256((url + json.dumps(params, sort_keys=True)).encode()).hexdigest()
    cached = CACHE / f"{key}.json"
    if cached.exists() and time.time() - cached.stat().st_mtime < CACHE_DAYS * 86400:
        return json.loads(cached.read_text())
    for attempt in range(5):
        r = client.get(url, params=params, headers=UA, timeout=60)
        if r.status_code == 200:
            CACHE.mkdir(parents=True, exist_ok=True)
            cached.write_text(r.text)
            time.sleep(1.5)  # one request at a time, with a pause
            return r.json()
        wait = int(r.headers.get("Retry-After", "0") or 0) or 10 * (attempt + 1)
        print(f"  {r.status_code} from {url.split('/')[2]}: waiting {wait}s", flush=True)
        time.sleep(min(wait, 120))
    r.raise_for_status()
    return {}


def wikivoyage(client: httpx.Client, title: str) -> tuple[str, str, str]:
    """(wikitext, intro text, canonical title) of a Wikivoyage page; ("", "", title) if it doesn't exist."""
    d = get(client, WV_API, action="query", prop="revisions|extracts", rvprop="content", rvslots="main", exintro=1,
            explaintext=1, redirects=1, titles=title, format="json", formatversion=2)
    page = d["query"]["pages"][0]
    if page.get("missing"):
        return "", "", title
    text = page["revisions"][0]["slots"]["main"]["content"]
    intro = (page.get("extract") or "").strip()
    return text, intro, page["title"]


def wikidata_around(client: httpx.Client, lat: float, lon: float, radius: float) -> list[dict]:
    """Notable sights (the types the app knows) within the radius, with their sitelink count."""
    types = " ".join(f"wd:{q}" for q in WIKIDATA_TYPES)
    q = f"""
SELECT ?item ?label ?desc ?coord (GROUP_CONCAT(DISTINCT STRAFTER(STR(?type), "entity/"); separator=",") AS ?types) ?links WHERE {{
  SERVICE wikibase:around {{ ?item wdt:P625 ?coord . bd:serviceParam wikibase:center "Point({lon} {lat})"^^geo:wktLiteral .
                             bd:serviceParam wikibase:radius "{radius}" . }}
  ?item wdt:P31 ?type . VALUES ?type {{ {types} }}
  ?item wdt:P17 wd:Q902 .
  ?item rdfs:label ?label . FILTER(LANG(?label) = "en")
  OPTIONAL {{ ?item schema:description ?desc . FILTER(LANG(?desc) = "en") }}
  ?item wikibase:sitelinks ?links .
}} GROUP BY ?item ?label ?desc ?coord ?links ORDER BY DESC(?links) LIMIT 120"""
    d = get(client, WD_SPARQL, query=q, format="json")
    out = []
    for b in d["results"]["bindings"]:
        m = re.match(r"Point\(([-\d.]+) ([-\d.]+)\)", b["coord"]["value"])
        if not m:
            continue
        out.append({
            "wikidata": b["item"]["value"].rsplit("/", 1)[1],
            "name": b["label"]["value"],
            "description": clean_description(b.get("desc", {}).get("value") or ""),
            "latitude": float(m.group(2)), "longitude": float(m.group(1)),
            "types": tuple(t for t in b["types"]["value"].split(",") if t),
            "links": int(b["links"]["value"]),
        })
    return out


def wikidata_types(client: httpx.Client, qids: list[str]) -> tuple[dict[str, tuple[str, ...]], set[str]]:
    """The P31 types of the Wikidata items that Wikivoyage listings point to, and the ones in another country."""
    if not qids:
        return {}, set()
    values = " ".join(f"wd:{q}" for q in qids)
    d = get(client, WD_SPARQL, format="json", query=f"""
SELECT ?item ?type ?country WHERE {{ VALUES ?item {{ {values} }} OPTIONAL {{ ?item wdt:P31 ?type . }} OPTIONAL {{ ?item wdt:P17 ?country . }} }}""")
    out: dict[str, list[str]] = {}
    abroad: set[str] = set()
    for b in d["results"]["bindings"]:
        q = b["item"]["value"].rsplit("/", 1)[1]
        if "type" in b:
            out.setdefault(q, []).append(b["type"]["value"].rsplit("/", 1)[1])
        if "country" in b and not b["country"]["value"].endswith("/Q902"):
            abroad.add(q)
    return {k: tuple(v) for k, v in out.items()}, abroad


def sentence(s: str, limit: int = 400) -> str:
    s = s.strip()
    if not s:
        return s
    s = s[0].upper() + s[1:]
    if len(s) > limit:
        s = s[:limit].rsplit(" ", 1)[0] + "…"
    return s


def build(client: httpx.Client, cfg: dict) -> dict:
    centre = (cfg["latitude"], cfg["longitude"])
    radius = cfg["radius_km"]
    report: dict = {"listings": 0, "no_coordinates": 0, "too_far": 0, "merged": 0}
    texts, intro, pages = [], "", []
    for title in cfg["wikivoyage"]:
        text, ex, canonical = wikivoyage(client, title)
        if text:
            texts.append(text)
            pages.append(canonical)
            intro = intro or ex
    raw = [l for t in texts for l in listings(t)]
    report["listings"] = len(raw)
    qids = sorted({l["wikidata"] for l in raw if re.fullmatch(r"Q\d+", l.get("wikidata") or "")})
    types, abroad = wikidata_types(client, qids)

    def located(l: dict):
        lat, lon = to_float(l.get("lat")), to_float(l.get("long"))
        if lat is None or lon is None:
            report["no_coordinates"] += 1
            return None
        if km(centre, (lat, lon)) > radius:
            report["too_far"] += 1
            return None
        return lat, lon

    places: list[dict] = []
    restaurants: list[dict] = []
    hotels: list[dict] = []
    for i, l in enumerate(raw):
        if l.get("wikidata") in abroad:
            report["too_far"] += 1  # across the border (Jaflong's page lists Meghalaya too)
            continue
        pos = located(l)
        if pos is None:
            continue
        name, text = l["name"], l.get("content", "")
        hours = parse_hours(l.get("hours"))
        price = parse_price(l.get("price"))
        base = {"source": "wikivoyage", "ref": f"wv:{slug(cfg['name'])}:{l['kind']}:{slug(name)}", "name": name,
                "latitude": pos[0], "longitude": pos[1], "description": sentence(text) or None,
                "opening_time": hours[0] if hours else None, "closing_time": hours[1] if hours else None,
                "url": l.get("url") or None, "hours_text": l.get("hours") or None, "price_text": l.get("price") or None}
        if l["kind"] in ("see", "do", "buy"):
            cat = category_for(name, text, l["kind"], types.get(l.get("wikidata", ""), ()))
            places.append({**base, "wikidata": l.get("wikidata") or None, "category": cat, "tags": tags_for(cat, name, text),
                           "estimated_cost": price[0] if price else None, "average_visit_duration": VISIT_HOURS.get(cat, 1.5),
                           "activity_level": ACTIVITY.get(cat, "Medium")})
        elif l["kind"] in ("eat", "drink"):
            cost = ((price[0] + price[1]) / 2 if price[1] else price[0]) if price else None
            restaurants.append({**base, "cuisine": (l.get("alt") or None), "average_meal_cost": cost,
                                "price_level": None if cost is None else "Budget" if cost < 300 else "Medium" if cost < 800 else "Premium"})
        elif l["kind"] == "sleep":
            low = price[0] if price and price[0] > 0 else None
            hotels.append({**base, "price_per_night": low,
                           "category": None if low is None else "Budget" if low < 1500 else "Standard" if low < 5000 else "Luxury"})

    # Wikidata sights: add the ones Wikivoyage doesn't list (or fill in a type and description)
    per_category: dict[str, int] = {}
    for p in places:
        per_category[p["category"]] = per_category.get(p["category"], 0) + 1
    for w in wikidata_around(client, cfg["latitude"], cfg["longitude"], cfg.get("wikidata_radius_km", radius)):
        cat = category_for(w["name"], w["description"], None, w["types"])
        match = next((p for p in places if same_place(p, w) or (p["category"] == cat and km(
            (p["latitude"], p["longitude"]), (w["latitude"], w["longitude"])) <= SAME_SPOT_KM)), None)
        if match is not None:
            report["merged"] += 1
            match["wikidata"] = match.get("wikidata") or w["wikidata"]
            match["description"] = match["description"] or sentence(w["description"]) or None
            continue
        # Room for every kind of interest: no category fills more than its share from Wikidata
        if len(places) >= MAX_PLACES or per_category.get(cat, 0) >= MAX_PLACES * MAX_SHARE:
            continue
        per_category[cat] = per_category.get(cat, 0) + 1
        places.append({
            "source": "wikidata", "ref": f"wd:{w['wikidata']}", "wikidata": w["wikidata"], "name": w["name"],
            "latitude": w["latitude"], "longitude": w["longitude"], "description": sentence(w["description"]) or None,
            "category": cat, "tags": tags_for(cat, w["name"], w["description"]), "estimated_cost": None,
            "opening_time": None, "closing_time": None, "average_visit_duration": VISIT_HOURS.get(cat, 1.5),
            "activity_level": ACTIVITY.get(cat, "Medium"), "url": f"https://www.wikidata.org/wiki/{w['wikidata']}",
            "hours_text": None, "price_text": None,
        })

    # One record per ref (two listings with the same name: keep the first)
    def unique(rows: list[dict], limit: int) -> list[dict]:
        seen, out = set(), []
        for r in rows:
            if r["ref"] not in seen:
                seen.add(r["ref"])
                out.append(r)
        return out[:limit]

    places, restaurants, hotels = unique(places, MAX_PLACES), unique(restaurants, MAX_RESTAURANTS), unique(hotels, MAX_HOTELS)
    sources = [{"name": "Wikivoyage", "license": "CC BY-SA 4.0", "url": f"https://en.wikivoyage.org/wiki/{p.replace(' ', '_')}"} for p in pages]
    sources.append({"name": "Wikidata", "license": "CC0 1.0", "url": "https://www.wikidata.org/"})
    return {
        "destination": {
            "name": cfg["name"], "country": "Bangladesh", "latitude": cfg["latitude"], "longitude": cfg["longitude"],
            "description": sentence(intro, 600) or None,
        },
        "attribution": "Text and listings from Wikivoyage (CC BY-SA 4.0); places from Wikidata (CC0). "
                       "Prices and opening hours are as the sources state them and haven't been checked.",
        "sources": sources,
        "fetched_on": date.today().isoformat(),
        "checked": False,
        "places": places,
        "restaurants": restaurants,
        "hotels": hotels,
        "_report": report,
    }


def quality(data: dict) -> dict:
    p, r, h = data["places"], data["restaurants"], data["hotels"]
    cats: dict[str, int] = {}
    for x in p:
        cats[x["category"]] = cats.get(x["category"], 0) + 1
    return {
        "places": len(p),
        "with_hours": sum(1 for x in p if x["opening_time"]),
        "with_price": sum(1 for x in p if x["estimated_cost"] is not None),
        "with_description": sum(1 for x in p if x["description"]),
        "categories": dict(sorted(cats.items(), key=lambda kv: -kv[1])),
        "restaurants": len(r),
        "restaurants_with_price": sum(1 for x in r if x["average_meal_cost"] is not None),
        "hotels": len(h),
        "hotels_with_price": sum(1 for x in h if x["price_per_night"] is not None),
        "has_description": bool(data["destination"]["description"]),
    }


def write_report(rows: list[tuple[str, dict, dict]]) -> None:
    lines = [
        "# Destination Data Quality",
        "",
        f"**Built:** {date.today().isoformat()} by `backend/scripts/import_destinations.py` · **Sources:** Wikivoyage (CC BY-SA 4.0), Wikidata (CC0)",
        "",
        "Nothing here has been checked by a person yet. In the app, an unknown price says \"Price unknown\" and",
        "unknown hours say \"Hours not checked\" (the planner then assumes 09:00–17:00). Ratings are unknown for all of them.",
        "",
        "| Destination | Places | With hours | With a price | With a description | Restaurants (priced) | Hotels (priced) | Description | Categories |",
        "|---|---|---|---|---|---|---|---|---|",
    ]
    for name, q, rep in rows:
        cats = ", ".join(f"{k} {v}" for k, v in q["categories"].items())
        lines.append(
            f"| {name} | {q['places']} | {q['with_hours']} | {q['with_price']} | {q['with_description']} | "
            f"{q['restaurants']} ({q['restaurants_with_price']}) | {q['hotels']} ({q['hotels_with_price']}) | "
            f"{'yes' if q['has_description'] else 'no'} | {cats} |"
        )
    lines += ["", "**Left out while importing** (Wikivoyage listings):", "",
              "| Destination | Listings read | No coordinates | Outside the area | Matched to a Wikidata sight |", "|---|---|---|---|---|"]
    for name, _q, rep in rows:
        lines.append(f"| {name} | {rep['listings']} | {rep['no_coordinates']} | {rep['too_far']} | {rep['merged']} |")
    lines += ["", "**What a person should check first:** each destination's top places (opening hours, entry fees for locals",
              "and foreigners, whether it's still open), and the hotels' current prices.", ""]
    REPORT.write_text("\n".join(lines))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", help="build just this destination")
    args = ap.parse_args()
    cfg = json.loads((DATA / "sources.json").read_text())
    rows = []
    with httpx.Client() as client:
        for d in cfg["destinations"]:
            out = DATA / f"{slug(d['name'])}.json"
            if args.only and d["name"] != args.only:
                if out.exists():
                    data = json.loads(out.read_text())
                    rows.append((d["name"], quality(data), data.get("_report", {})))
                continue
            data = build(client, d)
            out.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")
            q = quality(data)
            rows.append((d["name"], q, data["_report"]))
            print(f"{d['name']}: {q['places']} places ({q['with_hours']} with hours, {q['with_price']} with a price), "
                  f"{q['restaurants']} restaurants, {q['hotels']} hotels", flush=True)
            time.sleep(2)
    write_report(rows)
    return 0


if __name__ == "__main__":
    sys.exit(main())

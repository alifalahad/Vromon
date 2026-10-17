"""
Vromon geo pipeline, step 2: normalise Natural Earth + GeoNames into the files
the app, the tile builder and the backend use.

Inputs (from build.sh): data/geo/build/{countries-full,countries-simple,regions-full}.geojson,
data/geo/raw/gn/cities15000.txt, data/geo/raw/mledoze-countries.json
Outputs:
  data/geo/countries.json, regions.json, cities.json   -> backend reference tables
  mobile/assets/geo/countries.json                     -> bundled Countries layer (offline, GeoJSON)
  data/geo/build/{regions,cities}-tiles.geojson        -> tippecanoe input

Run via scripts/geo/build.sh, not directly.
"""

from __future__ import annotations

import csv
import json
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data" / "geo" / "raw"
BUILD = ROOT / "data" / "geo" / "build"
OUT = ROOT / "data" / "geo"
MOBILE_ASSET = ROOT / "mobile" / "assets" / "geo" / "countries.json"
MOBILE_LABELS = ROOT / "mobile" / "assets" / "geo" / "country-labels.json"

# Decision D6: 193 UN member states + the 2 observer states count toward "% of world"...
UN_OBSERVERS = {"VA", "PS"}
# mledoze/countries marks the Holy See (observer) as a member; corrected here.
NOT_UN_MEMBERS = {"VA"}
# ...minus states the Bangladesh point of view (decision D5) does not show as countries:
# its map draws the Israel/Palestine area as one feature, Palestine. Developer decision
# (2026-10-13): follow the Bangladesh POV, so "the world" is 194 countries.
NOT_IN_BANGLADESH_POV = {"IL"}
WORLD_SIZE = 194


def load(path: Path):
    with path.open(encoding="utf-8") as f:
        return json.load(f)


def write_json(path: Path, data, compact: bool = True) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        if compact:
            json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
        else:
            json.dump(data, f, ensure_ascii=False, indent=1)
        f.write("\n")


def clean(value):
    """Natural Earth uses '-99' / '' for missing values."""
    if value is None:
        return None
    if isinstance(value, str):
        value = value.strip()
        return None if value in ("", "-99", "-099") else value
    return None if value == -99 else value


def country_codes(p: dict) -> tuple[str | None, str | None]:
    iso2 = clean(p.get("ISO_A2")) or clean(p.get("ISO_A2_EH"))
    iso3 = clean(p.get("ISO_A3")) or clean(p.get("ISO_A3_EH"))
    return iso2, iso3


def un_world_set() -> set[str]:
    data = load(RAW / "mledoze-countries.json")
    members = {c["cca2"] for c in data if c.get("unMember")} - NOT_UN_MEMBERS
    if len(members) != 193:
        sys.exit(f"Expected 193 UN member states, got {len(members)}: check the source")
    world = (members | UN_OBSERVERS) - NOT_IN_BANGLADESH_POV
    if len(world) != WORLD_SIZE:
        sys.exit(f"Expected {WORLD_SIZE} countries in the world set, got {len(world)}")
    return world


# ---------------------------------------------------------------------------
# Countries
# ---------------------------------------------------------------------------

def build_countries(world: set[str]) -> dict[str, dict]:
    full = load(BUILD / "countries-full.geojson")
    simple = load(BUILD / "countries-simple.geojson")
    lookup: dict[str, dict] = {}
    unmatched: list[str] = []

    for f in full["features"]:
        p = f["properties"]
        iso2, iso3 = country_codes(p)
        if not iso2:
            unmatched.append(p.get("NAME") or "?")
            continue
        if iso2 in lookup:  # some ISO codes span several NE features; keep the first
            continue
        lookup[iso2] = {
            "iso2": iso2,
            "iso3": iso3,
            # Short common name ("China"), not the formal NAME_EN ("People's Republic of China")
            "name": p.get("NAME") or p.get("NAME_EN"),
            "name_bn": clean(p.get("NAME_BN")),
            "continent": p.get("CONTINENT"),
            "type": p.get("TYPE"),
            "counts_toward_world": iso2 in world,
            "label_lon": p.get("LABEL_X"),
            "label_lat": p.get("LABEL_Y"),
            "min_label": p.get("MIN_LABEL"),
        }

    missing_world = sorted(world - set(lookup))
    if missing_world:
        sys.exit(f"World countries missing from the map data: {missing_world}")

    features = []
    for f in simple["features"]:
        iso2, _ = country_codes(f["properties"])
        if not iso2 or iso2 not in lookup:
            continue
        c = lookup[iso2]
        features.append({
            "type": "Feature",
            "properties": {"iso2": iso2, "name": c["name"], "name_bn": c["name_bn"], "min_label": f["properties"].get("MIN_LABEL")},
            "geometry": f["geometry"],
        })
    write_json(MOBILE_ASSET, {"type": "FeatureCollection", "features": features})

    # One label point per country (Natural Earth's placement), so multi-part countries
    # like Indonesia aren't labelled once per island
    labels = [
        {
            "type": "Feature",
            "properties": {"iso2": c["iso2"], "name": c["name"], "min_label": c["min_label"]},
            "geometry": {"type": "Point", "coordinates": [round(c["label_lon"], 3), round(c["label_lat"], 3)]},
        }
        for c in lookup.values()
        if c["label_lon"] is not None and c["label_lat"] is not None
    ]
    write_json(MOBILE_LABELS, {"type": "FeatureCollection", "features": labels})

    rows = [{k: v for k, v in c.items() if k != "min_label"} for c in sorted(lookup.values(), key=lambda c: c["iso2"])]
    write_json(OUT / "countries.json", rows, compact=False)
    print(f"countries: {len(rows)} ({sum(c['counts_toward_world'] for c in rows)} count toward the world); "
          f"skipped without ISO code: {unmatched}")
    return lookup


# ---------------------------------------------------------------------------
# Regions (admin-1)
# ---------------------------------------------------------------------------

def build_regions(countries: dict[str, dict]) -> dict[str, str]:
    full = load(BUILD / "regions-full.geojson")
    iso_counts = Counter(clean(f["properties"].get("iso_3166_2")) for f in full["features"])
    rows, tile_features, by_geonames = [], [], {}
    seen: set[str] = set()

    for f in full["features"]:
        p = f["properties"]
        country = clean(p.get("iso_a2"))
        if not country or country not in countries:
            continue
        iso = clean(p.get("iso_3166_2"))
        # ISO 3166-2 when it is valid and unique, else Natural Earth's stable adm1_code
        code = iso if iso and iso.startswith(country + "-") and iso_counts[iso] == 1 else clean(p.get("adm1_code"))
        if not code or code in seen:
            continue
        seen.add(code)
        name = clean(p.get("name_en")) or clean(p.get("name")) or code
        rows.append({
            "code": code,
            "country_iso2": country,
            "name": name,
            "name_bn": clean(p.get("name_bn")),
            "type": clean(p.get("type_en")),
            "lat": p.get("latitude"),
            "lon": p.get("longitude"),
        })
        gn = clean(p.get("gn_a1_code"))
        if gn:
            by_geonames.setdefault(gn, code)
        tile_features.append({
            "type": "Feature",
            "properties": {"code": code, "country": country, "name": name},
            "geometry": f["geometry"],
        })

    rows.sort(key=lambda r: r["code"])
    write_json(OUT / "regions.json", rows, compact=False)
    write_json(BUILD / "regions-tiles.geojson", {"type": "FeatureCollection", "features": tile_features})
    print(f"regions: {len(rows)}")
    return by_geonames


# ---------------------------------------------------------------------------
# Cities (GeoNames cities15000: populated places with ≥ 15,000 people)
# ---------------------------------------------------------------------------

def build_cities(countries: dict[str, dict], region_by_geonames: dict[str, str]) -> None:
    rows, features = [], []
    with (RAW / "gn" / "cities15000.txt").open(encoding="utf-8") as f:
        for r in csv.reader(f, delimiter="\t", quoting=csv.QUOTE_NONE):
            geonameid, name, _ascii, _alt, lat, lon, _fclass, _fcode, cc, _cc2, admin1 = r[:11]
            population = int(r[14] or 0)
            if cc not in countries:
                continue
            region = region_by_geonames.get(f"{cc}.{admin1}")
            row = {
                "geonameid": int(geonameid),
                "country_iso2": cc,
                "region_code": region,
                "name": name,
                "lat": round(float(lat), 5),
                "lon": round(float(lon), 5),
                "population": population,
            }
            rows.append(row)
            features.append({
                "type": "Feature",
                "properties": {"id": row["geonameid"], "name": name, "country": cc, "pop": population},
                "geometry": {"type": "Point", "coordinates": [row["lon"], row["lat"]]},
            })
    rows.sort(key=lambda r: r["geonameid"])
    write_json(OUT / "cities.json", rows)
    write_json(BUILD / "cities-tiles.geojson", {"type": "FeatureCollection", "features": features})
    linked = sum(1 for r in rows if r["region_code"])
    print(f"cities: {len(rows)} ({linked} linked to a region)")


if __name__ == "__main__":
    world = un_world_set()
    countries = build_countries(world)
    regions = build_regions(countries)
    build_cities(countries, regions)

"""
Vromon geo pipeline, step 2: normalise Natural Earth + GeoNames into the files
the app, the tile builder and the backend use.

Inputs (from build.sh): data/geo/build/{countries-full,countries-simple,regions-full}.geojson,
data/geo/raw/gn/cities15000.txt, data/geo/raw/mledoze-countries.json,
data/geo/raw/gb/geoBoundaries-BGD-ADM1.geojson (Bangladesh's divisions, see ADM1_OVERRIDES)
Outputs:
  data/geo/countries.json, regions.json, cities.json   -> backend reference tables
  mobile/assets/geo/countries.json                     -> bundled Countries layer (offline, GeoJSON)
  mobile/assets/geo/home-regions.json                  -> bundled home-country regions (offline, GeoJSON)
  mobile/assets/geo/home-region-borders.json           -> the lines between those regions
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

# Countries whose admin-1 comes from geoBoundaries instead of Natural Earth.
# Natural Earth has 7 divisions for Bangladesh (Mymensingh, split from Dhaka in 2015,
# is missing) and some Bangla names say জেলা (district). Names come from this table,
# keyed by ISO 3166-2, not from the source (which spells Rajshahi "Rajshani").
ADM1_OVERRIDES: dict[str, dict] = {
    "BD": {
        "file": RAW / "gb" / "geoBoundaries-BGD-ADM1.geojson",
        "type": "Division",
        "names": {
            "BD-A": ("Barishal", "বরিশাল বিভাগ"),
            "BD-B": ("Chattogram", "চট্টগ্রাম বিভাগ"),
            "BD-C": ("Dhaka", "ঢাকা বিভাগ"),
            "BD-D": ("Khulna", "খুলনা বিভাগ"),
            "BD-E": ("Rajshahi", "রাজশাহী বিভাগ"),
            "BD-F": ("Rangpur", "রংপুর বিভাগ"),
            "BD-G": ("Sylhet", "সিলেট বিভাগ"),
            "BD-H": ("Mymensingh", "ময়মনসিংহ বিভাগ"),
        },
    },
}
# Bundled copy of the home country's regions (offline; drawn when the map opens on home)
MOBILE_HOME_REGIONS = ROOT / "mobile" / "assets" / "geo" / "home-regions.json"
# ...and the lines between them (inner borders only)
MOBILE_HOME_BORDERS = ROOT / "mobile" / "assets" / "geo" / "home-region-borders.json"
# Bangladesh's 64 districts (zila): the lines between them inside each division, and their names
MOBILE_HOME_DISTRICTS = ROOT / "mobile" / "assets" / "geo" / "home-districts.json"
# Official English spellings (BBS, since 2018) and Bangla names, keyed by the geoBoundaries name
BD_DISTRICTS: dict[str, tuple[str, str]] = {
    "Bagerhat": ("Bagerhat", "বাগেরহাট"), "Bandarban": ("Bandarban", "বান্দরবান"), "Barguna": ("Barguna", "বরগুনা"),
    "Barisal": ("Barishal", "বরিশাল"), "Bhola": ("Bhola", "ভোলা"), "Bogra": ("Bogura", "বগুড়া"),
    "Brahamanbaria": ("Brahmanbaria", "ব্রাহ্মণবাড়িয়া"), "Chandpur": ("Chandpur", "চাঁদপুর"),
    "Chittagong": ("Chattogram", "চট্টগ্রাম"), "Chuadanga": ("Chuadanga", "চুয়াডাঙ্গা"), "Comilla": ("Cumilla", "কুমিল্লা"),
    "Cox's Bazar": ("Cox's Bazar", "কক্সবাজার"), "Dhaka": ("Dhaka", "ঢাকা"), "Dinajpur": ("Dinajpur", "দিনাজপুর"),
    "Faridpur": ("Faridpur", "ফরিদপুর"), "Feni": ("Feni", "ফেনী"), "Gaibandha": ("Gaibandha", "গাইবান্ধা"),
    "Gazipur": ("Gazipur", "গাজীপুর"), "Gopalganj": ("Gopalganj", "গোপালগঞ্জ"), "Habiganj": ("Habiganj", "হবিগঞ্জ"),
    "Jamalpur": ("Jamalpur", "জামালপুর"), "Jessore": ("Jashore", "যশোর"), "Jhalokati": ("Jhalokati", "ঝালকাঠি"),
    "Jhenaidah": ("Jhenaidah", "ঝিনাইদহ"), "Joypurhat": ("Joypurhat", "জয়পুরহাট"), "Khagrachhari": ("Khagrachhari", "খাগড়াছড়ি"),
    "Khulna": ("Khulna", "খুলনা"), "Kishoreganj": ("Kishoreganj", "কিশোরগঞ্জ"), "Kurigram": ("Kurigram", "কুড়িগ্রাম"),
    "Kushtia": ("Kushtia", "কুষ্টিয়া"), "Lakshmipur": ("Lakshmipur", "লক্ষ্মীপুর"), "Lalmonirhat": ("Lalmonirhat", "লালমনিরহাট"),
    "Madaripur": ("Madaripur", "মাদারীপুর"), "Magura": ("Magura", "মাগুরা"), "Manikganj": ("Manikganj", "মানিকগঞ্জ"),
    "Maulvibazar": ("Moulvibazar", "মৌলভীবাজার"), "Meherpur": ("Meherpur", "মেহেরপুর"), "Munshiganj": ("Munshiganj", "মুন্সীগঞ্জ"),
    "Mymensingh": ("Mymensingh", "ময়মনসিংহ"), "Naogaon": ("Naogaon", "নওগাঁ"), "Narail": ("Narail", "নড়াইল"),
    "Narayanganj": ("Narayanganj", "নারায়ণগঞ্জ"), "Narsingdi": ("Narsingdi", "নরসিংদী"), "Natore": ("Natore", "নাটোর"),
    "Nawabganj": ("Chapai Nawabganj", "চাঁপাইনবাবগঞ্জ"), "Netrakona": ("Netrokona", "নেত্রকোণা"), "Nilphamari": ("Nilphamari", "নীলফামারী"),
    "Noakhali": ("Noakhali", "নোয়াখালী"), "Pabna": ("Pabna", "পাবনা"), "Panchagarh": ("Panchagarh", "পঞ্চগড়"),
    "Patuakhali": ("Patuakhali", "পটুয়াখালী"), "Pirojpur": ("Pirojpur", "পিরোজপুর"), "Rajbari": ("Rajbari", "রাজবাড়ী"),
    "Rajshahi": ("Rajshahi", "রাজশাহী"), "Rangamati": ("Rangamati", "রাঙ্গামাটি"), "Rangpur": ("Rangpur", "রংপুর"),
    "Satkhira": ("Satkhira", "সাতক্ষীরা"), "Shariatpur": ("Shariatpur", "শরীয়তপুর"), "Sherpur": ("Sherpur", "শেরপুর"),
    "Sirajganj": ("Sirajganj", "সিরাজগঞ্জ"), "Sunamganj": ("Sunamganj", "সুনামগঞ্জ"), "Sylhet": ("Sylhet", "সিলেট"),
    "Tangail": ("Tangail", "টাঙ্গাইল"), "Thakurgaon": ("Thakurgaon", "ঠাকুরগাঁও"),
}


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

def polygons(geometry: dict) -> list:
    return geometry["coordinates"] if geometry["type"] == "MultiPolygon" else [geometry["coordinates"]]


def ring_area_centroid(ring: list) -> tuple[float, float, float]:
    """Shoelace area (absolute) and centroid of a ring."""
    a = cx = cy = 0.0
    for (x1, y1), (x2, y2) in zip(ring, ring[1:] + ring[:1]):
        cross = x1 * y2 - x2 * y1
        a += cross
        cx += (x1 + x2) * cross
        cy += (y1 + y2) * cross
    if a == 0:
        return 0.0, ring[0][0], ring[0][1]
    return abs(a / 2), cx / (3 * a), cy / (3 * a)


def label_point(geometry: dict) -> tuple[float, float]:
    """Centroid of the largest part (lon, lat), rounded."""
    _, x, y = max((ring_area_centroid([c[:2] for c in p[0]]) for p in polygons(geometry)), key=lambda t: t[0])
    return round(x, 4), round(y, 4)


def in_ring(x: float, y: float, ring: list) -> bool:
    inside = False
    for (x1, y1), (x2, y2) in zip(ring, ring[1:] + ring[:1]):
        if (y1 > y) != (y2 > y) and x < x1 + (y - y1) * (x2 - x1) / (y2 - y1):
            inside = not inside
    return inside


def contains(geometry: dict, lon: float, lat: float) -> bool:
    return any(in_ring(lon, lat, p[0]) and not any(in_ring(lon, lat, hole) for hole in p[1:]) for p in polygons(geometry))


def region_at(regions: list[dict], lon: float, lat: float) -> str:
    """The region containing the point, else the one with the nearest boundary point (coastal towns)."""
    for r in regions:
        if contains(r["geometry"], lon, lat):
            return r["code"]
    def gap(r):
        return min((x - lon) ** 2 + (y - lat) ** 2 for p in polygons(r["geometry"]) for x, y, *_ in p[0])
    return min(regions, key=gap)["code"]


def rounded(geometry: dict, digits: int = 3) -> dict:
    """
    Coordinates rounded (3 digits ≈ 100 m), with repeated points dropped. Rings that
    shrink below a triangle (4 points, closed) are dropped too: MapLibre rejects the
    whole GeoJSON over one of them (tiny islands in the Bay of Bengal).
    """
    def ring(r):
        out = []
        for c in r:
            pt = [round(c[0], digits), round(c[1], digits)]
            if not out or out[-1] != pt:
                out.append(pt)
        return out
    parts = []
    for p in polygons(geometry):
        rings = [ring(r) for r in p]
        if len(rings[0]) < 4:
            continue  # the outer ring collapsed: drop the whole part
        parts.append([rings[0]] + [r for r in rings[1:] if len(r) >= 4])
    return {"type": "MultiPolygon", "coordinates": parts} if geometry["type"] == "MultiPolygon" else {"type": "Polygon", "coordinates": parts[0]}


def inner_borders(features: list[dict], keep=lambda a, b: True) -> list[dict]:
    """
    The lines between neighbouring regions, without the country's outer edge (the
    country layer draws that, from different data; drawing both doubles the line).
    An edge is inner when another region has the same edge. Each run of inner edges
    along a ring becomes one LineString, emitted once per pair of neighbours, and
    only when `keep(code, neighbour)` (districts: only inside one division).
    """
    owners: dict[tuple, set[str]] = {}
    rings = []
    for f in features:
        code = f["properties"]["code"]
        for p in polygons(f["geometry"]):
            ring = [tuple(c) for c in p[0]]
            rings.append((code, ring))
            for a, b in zip(ring, ring[1:]):
                owners.setdefault(frozenset((a, b)), set()).add(code)

    lines = []
    for code, ring in rings:
        run, run_with = [], None
        for a, b in zip(ring, ring[1:]):
            others = owners[frozenset((a, b))] - {code}
            other = min(others) if others else None
            if other is None or other < code or not keep(code, other):  # outer edge, the neighbour emits it, or not wanted
                other = None
            if other != run_with and len(run) > 1:
                lines.append(run)
                run = []
            if other is None:
                run, run_with = [], None
                continue
            if not run:
                run = [list(a)]
            run.append(list(b))
            run_with = other
        if len(run) > 1:
            lines.append(run)
    return [{"type": "Feature", "properties": {}, "geometry": {"type": "LineString", "coordinates": line}} for line in lines]


def override_regions(country: str, spec: dict) -> list[dict]:
    """Rows (with their geometry) for a country whose admin-1 comes from ADM1_OVERRIDES."""
    out = []
    for f in load(spec["file"])["features"]:
        code = f["properties"]["shapeISO"]
        if code not in spec["names"]:
            sys.exit(f"{country}: unexpected region {code} in {spec['file'].name}")
        name, name_bn = spec["names"][code]
        lon, lat = label_point(f["geometry"])
        out.append({"code": code, "country_iso2": country, "name": name, "name_bn": name_bn,
                    "type": spec["type"], "lat": lat, "lon": lon, "geometry": f["geometry"]})
    if {r["code"] for r in out} != set(spec["names"]):
        sys.exit(f"{country}: expected regions {sorted(spec['names'])}, got {sorted(r['code'] for r in out)}")
    return out


def build_regions(countries: dict[str, dict]) -> tuple[dict[str, str], dict[str, list[dict]]]:
    full = load(BUILD / "regions-full.geojson")
    iso_counts = Counter(clean(f["properties"].get("iso_3166_2")) for f in full["features"])
    rows, tile_features, by_geonames = [], [], {}
    seen: set[str] = set()

    overridden: dict[str, list[dict]] = {}
    for country, spec in ADM1_OVERRIDES.items():
        overridden[country] = override_regions(country, spec)
        for r in overridden[country]:
            seen.add(r["code"])
            rows.append({k: v for k, v in r.items() if k != "geometry"})
            tile_features.append({
                "type": "Feature",
                "properties": {"code": r["code"], "country": country, "name": r["name"]},
                "geometry": r["geometry"],
            })

    for f in full["features"]:
        p = f["properties"]
        country = clean(p.get("iso_a2"))
        if not country or country not in countries or country in overridden:
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

    # Only Bangladesh for now (the default home country); keyed by country so more can follow
    home = [
        {
            "type": "Feature",
            "properties": {"code": r["code"], "country": country, "name": r["name"], "name_bn": r["name_bn"],
                           "label": [r["lon"], r["lat"]]},
            "geometry": rounded(r["geometry"]),
        }
        for country, regions in overridden.items()
        for r in sorted(regions, key=lambda r: r["code"])
    ]
    write_json(MOBILE_HOME_REGIONS, {"type": "FeatureCollection", "features": home})
    write_json(MOBILE_HOME_BORDERS, {"type": "FeatureCollection", "features": inner_borders(home)})
    build_home_districts(overridden.get("BD", []))
    print(f"regions: {len(rows)} ({', '.join(f'{c}: {len(r)} from geoBoundaries' for c, r in overridden.items())})")
    return by_geonames, overridden


# ---------------------------------------------------------------------------
# Cities (GeoNames cities15000: populated places with ≥ 15,000 people)
# ---------------------------------------------------------------------------

def build_cities(countries: dict[str, dict], region_by_geonames: dict[str, str], overridden: dict[str, list[dict]]) -> None:
    rows, features = [], []
    with (RAW / "gn" / "cities15000.txt").open(encoding="utf-8") as f:
        for r in csv.reader(f, delimiter="\t", quoting=csv.QUOTE_NONE):
            geonameid, name, _ascii, _alt, lat, lon, _fclass, _fcode, cc, _cc2, admin1 = r[:11]
            population = int(r[14] or 0)
            if cc not in countries:
                continue
            if cc in overridden:
                # GeoNames admin-1 codes link to Natural Earth's regions; place these by location
                region = region_at(overridden[cc], float(lon), float(lat))
            else:
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


def build_home_districts(divisions: list[dict]) -> None:
    """
    Bangladesh's districts for the map (map home): dashed lines between districts of
    the same division (the division lines are drawn already, from other data), and a
    label point per district inside it (mapshaper's inner point), with its division.
    Inputs from build.sh: build/bd-districts.geojson (simplified), build/bd-district-points.geojson.
    """
    shapes = load(BUILD / "bd-districts.geojson")["features"]
    points = {f["properties"]["shapeName"]: f["geometry"]["coordinates"] for f in load(BUILD / "bd-district-points.geojson")["features"]}
    unknown = sorted({f["properties"]["shapeName"] for f in shapes} - set(BD_DISTRICTS))
    if unknown or len(shapes) != 64:
        sys.exit(f"Bangladesh districts: expected the 64 in BD_DISTRICTS, got {len(shapes)} (unknown: {unknown})")
    features, division_of = [], {}
    for f in shapes:
        raw = f["properties"]["shapeName"]
        lon, lat = points[raw]
        division_of[raw] = region_at(divisions, lon, lat)
        f["properties"]["code"] = raw
        f["geometry"] = rounded(f["geometry"])
    lines = inner_borders(shapes, keep=lambda a, b: division_of[a] == division_of[b])
    for raw, (name, name_bn) in sorted(BD_DISTRICTS.items(), key=lambda kv: kv[1][0]):
        lon, lat = points[raw]
        features.append({
            "type": "Feature",
            "properties": {"name": name, "name_bn": name_bn, "division": division_of[raw]},
            "geometry": {"type": "Point", "coordinates": [round(lon, 4), round(lat, 4)]},
        })
    write_json(MOBILE_HOME_DISTRICTS, {"type": "FeatureCollection", "features": lines + features})
    print(f"districts: {len(features)} names, {len(lines)} lines inside divisions")


if __name__ == "__main__":
    world = un_world_set()
    countries = build_countries(world)
    regions, overridden = build_regions(countries)
    build_cities(countries, regions, overridden)

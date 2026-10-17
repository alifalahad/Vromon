#!/usr/bin/env python3
"""Renders the map-theme assets from the catalog (mobile/src/features/mapThemes/catalog.ts).

- Style thumbnails for the Map Theme carousel: a Europe crop of the bundled Natural
  Earth countries, drawn in each style's land / water / border colours, with the
  water pattern and border glow where the style has them.
- Water pattern tiles for MapLibre (`fill-pattern` / `background-pattern`) at 1x, 2x
  and 3x: diagonal hatching for Pencil, a dot grid for Treasure.
- mobile/src/features/mapThemes/assets.generated.ts: the requires plus a fingerprint
  of the colours used, which a unit test compares with the catalog so stale
  thumbnails fail CI.

All artwork is drawn here (prompt rule 10). Run after changing a Style in the catalog:

    python3 scripts/map-themes/build.py

Needs Pillow and Node (the catalog is TypeScript; it is transpiled with the
mobile app's own `typescript` package).
"""

from __future__ import annotations

import json
import math
import subprocess
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
MOBILE = ROOT / "mobile"
CATALOG = MOBILE / "src/features/mapThemes/catalog.ts"
COUNTRIES = MOBILE / "assets/geo/countries.json"
OUT_STYLES = MOBILE / "assets/map/styles"
OUT_PATTERNS = MOBILE / "assets/map/patterns"
OUT_TS = MOBILE / "src/features/mapThemes/assets.generated.ts"

# Thumbnail: 160 x 106 dp card image, rendered at 3x, supersampled 2x
THUMB_W, THUMB_H = 480, 318
SUPER = 2
# Europe crop (UK to the Black Sea, Scandinavia's south to the Mediterranean), as in 18–23
WEST, EAST, CENTRE_LAT = -11.0, 33.0, 49.5
# Pattern tile size in dp; MapLibre scales by the image's pixel ratio
TILE_DP = 5

NODE_LOADER = """
const fs = require('fs');
const ts = require(process.argv[1]);
const src = fs.readFileSync(process.argv[2], 'utf8');
const out = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const mod = { exports: {} };
new Function('module', 'exports', out)(mod, mod.exports);
process.stdout.write(JSON.stringify({ STYLES: mod.exports.STYLES }));
"""


def load_styles() -> list[dict]:
    ts = MOBILE / "node_modules/typescript"
    raw = subprocess.check_output(["node", "-e", NODE_LOADER, str(ts), str(CATALOG)])
    return json.loads(raw)["STYLES"]


def fingerprint(styles: list[dict]) -> str:
    """Must match `assetFingerprint()` in mobile/src/__tests__/mapThemes.test.ts."""
    parts = []
    for s in styles:
        dark = s.get("dark")
        parts.append(
            ",".join(
                [
                    s["id"], s["land"], s["water"], s["border"], s.get("pattern") or "",
                    "glow" if s.get("borderGlow") else "",
                    f"{dark['land']}/{dark['water']}/{dark['border']}" if dark else "",
                ]
            )
        )
    # FNV-1a (32-bit): trivial to reproduce in the app's tests without Node's crypto
    h = 0x811C9DC5
    for byte in ";".join(parts).encode():
        h = ((h ^ byte) * 0x01000193) & 0xFFFFFFFF
    return f"{h:08x}"


def rgb(hex_: str) -> tuple[int, int, int]:
    return tuple(int(hex_[i : i + 2], 16) for i in (1, 3, 5))  # type: ignore[return-value]


def shade(hex_: str, amount: float) -> tuple[int, int, int]:
    """Towards white (amount > 0) or black (amount < 0)."""
    target = 255 if amount > 0 else 0
    return tuple(round(c + (target - c) * abs(amount)) for c in rgb(hex_))  # type: ignore[return-value]


# ── Patterns ──────────────────────────────────────────────────────────────────


def pattern_tile(kind: str, water: str, px: int) -> Image.Image:
    """A seamless tile whose average colour stays close to `water`."""
    big = px * 4  # draw large, then downsample for smooth edges
    img = Image.new("RGB", (big, big), shade(water, 0.16))
    d = ImageDraw.Draw(img)
    ink = shade(water, -0.22)
    if kind == "hatch":
        w = max(1, round(big * 0.11))
        # Diagonal lines at 45°: one through the tile, wrapped at the corners
        for off in (-big, 0, big):
            d.line([(off, big), (off + big, 0)], fill=ink, width=w)
    else:  # dots: a staggered grid, two dots per tile
        r = big * 0.14
        for cx, cy in ((big * 0.25, big * 0.25), (big * 0.75, big * 0.75)):
            d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=ink)
    return img.resize((px, px), Image.LANCZOS)


# ── Thumbnails ────────────────────────────────────────────────────────────────


def mercator_y(lat: float) -> float:
    return math.log(math.tan(math.pi / 4 + math.radians(lat) / 2))


def projector(w: int, h: int):
    scale = w / math.radians(EAST - WEST)
    cy = mercator_y(CENTRE_LAT)

    def project(lon: float, lat: float) -> tuple[float, float]:
        lat = max(-85.0, min(85.0, lat))
        return (math.radians(lon - WEST) * scale, h / 2 - (mercator_y(lat) - cy) * scale)

    return project


def polygons(features: list[dict]):
    for f in features:
        g = f["geometry"]
        if g["type"] == "Polygon":
            yield g["coordinates"]
        elif g["type"] == "MultiPolygon":
            yield from g["coordinates"]


def in_view(ring: list[list[float]]) -> bool:
    lons = [p[0] for p in ring]
    lats = [p[1] for p in ring]
    return max(lons) > WEST - 5 and min(lons) < EAST + 5 and max(lats) > 25 and min(lats) < 72


def render_thumbnail(colors: dict, features: list[dict], pattern: str | None, glow: bool) -> Image.Image:
    w, h = THUMB_W * SUPER, THUMB_H * SUPER
    project = projector(w, h)
    img = Image.new("RGB", (w, h), rgb(colors["water"]))
    if pattern:
        tile = pattern_tile(pattern, colors["water"], TILE_DP * 3 * SUPER)
        for x in range(0, w, tile.width):
            for y in range(0, h, tile.height):
                img.paste(tile, (x, y))

    rings = [[project(lon, lat) for lon, lat in ring] for poly in polygons(features) for ring in poly[:1] if in_view(ring)]
    holes = [[project(lon, lat) for lon, lat in ring] for poly in polygons(features) for ring in poly[1:] if in_view(ring)]

    d = ImageDraw.Draw(img)
    for ring in rings:
        d.polygon(ring, fill=rgb(colors["land"]))
    for ring in holes:
        d.polygon(ring, fill=rgb(colors["water"]))

    line_w = round(1.1 * SUPER * 1.5)
    if glow:
        halo = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        hd = ImageDraw.Draw(halo)
        for ring in rings:
            hd.line(ring + ring[:1], fill=rgb(colors["border"]) + (170,), width=line_w * 4, joint="curve")
        img.paste(halo.filter(ImageFilter.GaussianBlur(line_w * 2)), (0, 0), halo.filter(ImageFilter.GaussianBlur(line_w * 2)))
    for ring in rings:
        d.line(ring + ring[:1], fill=rgb(colors["border"]), width=line_w, joint="curve")
    # A 256-colour palette keeps each card around 20–40 KB
    return img.resize((THUMB_W, THUMB_H), Image.LANCZOS).quantize(256, method=Image.Quantize.MEDIANCUT)


def main() -> None:
    styles = load_styles()
    features = json.loads(COUNTRIES.read_text())["features"]
    OUT_STYLES.mkdir(parents=True, exist_ok=True)
    OUT_PATTERNS.mkdir(parents=True, exist_ok=True)

    thumbs: list[str] = []
    patterns: list[str] = []
    for s in styles:
        variants = [("", s)] + ([("-dark", s["dark"])] if s.get("dark") else [])
        for suffix, colors in variants:
            name = f"{s['id']}{suffix}.png"
            render_thumbnail(colors, features, s.get("pattern"), bool(s.get("borderGlow"))).save(OUT_STYLES / name, optimize=True)
        dark = f", dark: require('../../../assets/map/styles/{s['id']}-dark.png')" if s.get("dark") else ""
        thumbs.append(f"  {s['id']}: {{ light: require('../../../assets/map/styles/{s['id']}.png'){dark} }},")

        if s.get("pattern"):
            base = f"water-{s['id']}"
            for scale, suffix in ((1, ""), (2, "@2x"), (3, "@3x")):
                pattern_tile(s["pattern"], s["water"], TILE_DP * scale).save(OUT_PATTERNS / f"{base}{suffix}.png", optimize=True)
            patterns.append(f"  '{base}': require('../../../assets/map/patterns/{base}.png'),")
        print(f"  {s['id']}")

    OUT_TS.write_text(
        "/* Generated by scripts/map-themes/build.py from catalog.ts. Do not edit. */\n\n"
        "/** Carousel thumbnails per style (light, and dark where the style follows Appearance). */\n"
        "export const STYLE_THUMBNAILS: Record<string, { light: number; dark?: number }> = {\n"
        + "\n".join(thumbs)
        + "\n};\n\n"
        "/** MapLibre images for patterned water, keyed by image name. */\n"
        "export const WATER_PATTERNS: Record<string, number> = {\n"
        + "\n".join(patterns)
        + "\n};\n\n"
        "/** Colours these assets were drawn with (checked against the catalog in tests). */\n"
        f"export const ASSET_FINGERPRINT = '{fingerprint(styles)}';\n"
    )
    print(f"Wrote {len(styles)} styles, {len(patterns)} patterns → {OUT_TS.relative_to(ROOT)}")


if __name__ == "__main__":
    main()

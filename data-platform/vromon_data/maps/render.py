"""
District maps (Phases 3 and 7, guideline §7): one original map per district and language,
generated from GIS data with one template, never drawn by hand or by an image generator.

Inputs, all recorded in the credits file next to each image:
  - district and neighbour outlines: admin_boundaries (geoBoundaries / BBS-OCHA)
  - terrain: Copernicus DEM GLO-90 tiles (raw artifacts), hillshaded; relief is exaggerated
    only as much as the district's real range allows, so a flat district stays flat
  - rivers: OpenStreetMap waterways (Overpass), omitted with a note if unavailable
  - attractions: published catalog records only; `draft=True` adds the candidates still under
    review, with a DRAFT watermark, for reviewers
Labels are shaped with HarfBuzz (maps.shaped_text). Output: exports/maps/<slug>-<lang>[-draft].png
and .json (2160 x 2700 px).
"""

from __future__ import annotations

import io
import json
import math
from datetime import datetime
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
from matplotlib import patheffects  # noqa: E402
from matplotlib.patches import PathPatch, Polygon as MplPolygon  # noqa: E402
from matplotlib.path import Path as MplPath  # noqa: E402
from matplotlib.transforms import Affine2D  # noqa: E402
from shapely.geometry import MultiPolygon, box, shape  # noqa: E402
from sqlalchemy import select  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402

from app.models.catalog import (  # noqa: E402
    AdminAdjacency, AdminBoundary, AdminUnit, Attraction, AttractionCategory, SourceClaim,
)
from vromon_data import artifacts, http  # noqa: E402
from vromon_data.maps.shaped_text import face_for, text_path  # noqa: E402
from vromon_data.paths import EXPORTS_DIR  # noqa: E402

DEM_URL = "https://copernicus-dem-90m.s3.amazonaws.com/{n}/{n}.tif"
OVERPASS = "https://overpass-api.de/api/interpreter"
TEMPLATE_VERSION = "district-map-2"   # 2: labels placed without overlaps
W_IN, H_IN, DPI = 8.0, 10.0, 270        # 2160 x 2700 px
DOT_PX = 11                               # an attraction dot's radius (s=26 pt²) in pixels, with its edge
PALETTE = {"bg": "#f4efe6", "land": "#e9e2d0", "neighbor": "#d9d3c4", "outline": "#5b4a3a", "shadow": "#3b3127",
           "water": "#6fa8c9", "text": "#2c241c", "muted": "#7a6d5f"}
CATEGORY_COLOR = {"Nature": "#3f8f4f", "Beach": "#d08a2e", "History": "#9c4a2f", "Culture": "#6b4fa0", "Family": "#c2508b",
                  "Scenic": "#2f7e9c", "Shopping": "#8a7a2e"}
CATEGORY_BN = {"Nature": "প্রকৃতি", "Beach": "সমুদ্রসৈকত", "History": "ইতিহাস ও ঐতিহ্য", "Culture": "জাদুঘর ও ধর্মীয় স্থান",
               "Family": "পার্ক ও বিনোদন", "Scenic": "দর্শনীয় দৃশ্য", "Shopping": "বাজার"}
BN_DIGITS = str.maketrans("0123456789", "০১২৩৪৫৬৭৮৯")
T = {"bn": {"legend": "চিহ্ন", "rivers": "নদী", "neighbors": "পাশের জেলা", "attractions": "দর্শনীয় স্থান", "km": "কিমি",
            "none": "যাচাই করা দর্শনীয় স্থান এখনো নেই", "district": "জেলা", "draft": "খসড়া: প্রকাশের জন্য নয়"},
     "en": {"legend": "Legend", "rivers": "Rivers", "neighbors": "Neighbouring districts", "attractions": "Attractions",
            "km": "km", "none": "No reviewed attractions yet", "district": "District", "draft": "DRAFT — not for publication"}}


# --- inputs -----------------------------------------------------------------------------------

def _geom(session: Session, unit_id):
    g = session.scalar(select(AdminBoundary.geometry_geojson).where(AdminBoundary.admin_unit_id == unit_id,
                                                                   AdminBoundary.is_current.is_(True)))
    return shape(json.loads(g)) if g else None


def _dem(session: Session, bounds, credits: dict) -> tuple[np.ndarray | None, tuple]:
    """Mosaic of Copernicus GLO-90 tiles over bounds (minx, miny, maxx, maxy); tiles are raw artifacts."""
    import rasterio
    from rasterio.merge import merge
    from vromon_data import registry
    from vromon_data.pipeline import sync_source
    sync_source(session, registry.by_id()["copernicus_dem"])
    minx, miny, maxx, maxy = bounds
    datasets, names = [], []
    with http.client(timeout=300) as c:
        for lat in range(math.floor(miny), math.floor(maxy) + 1):
            for lon in range(math.floor(minx), math.floor(maxx) + 1):
                n = f"Copernicus_DSM_COG_30_N{lat:02d}_00_E{lon:03d}_00_DEM"
                url = DEM_URL.format(n=n)
                art = artifacts.find_by_uri(session, "copernicus_dem", url)
                if art is None:
                    r = http.get(c, url, check_robots=False)
                    if r.status_code != 200:   # all-sea tiles don't exist
                        continue
                    art, _ = artifacts.store(session, source_id="copernicus_dem", uri=url, content=r.content,
                                             content_type="image/tiff", license_snapshot="Copernicus DEM licence")
                    session.commit()
                    artifacts.write_manifest(art)
                datasets.append(rasterio.open(artifacts.raw_path(art)))
                names.append(n)
    if not datasets:
        return None, bounds
    arr, transform = merge(datasets, bounds=bounds)
    for d in datasets:
        d.close()
    credits["dem_tiles"] = names
    z = arr[0].astype("float32")
    z[z < -100] = np.nan
    return z, bounds


def _rivers(session: Session, bounds, credits: dict) -> list[list[tuple[float, float]]]:
    from vromon_data import registry
    from vromon_data.pipeline import sync_source
    sync_source(session, registry.by_id()["osm_overpass"])
    minx, miny, maxx, maxy = bounds
    q = f'[out:json][timeout:120];way["waterway"~"^(river|canal)$"]({miny},{minx},{maxy},{maxx});out geom tags;'
    uri = f"{OVERPASS}#rivers={minx:.3f},{miny:.3f},{maxx:.3f},{maxy:.3f}"
    art = artifacts.find_by_uri(session, "osm_overpass", uri)
    try:
        if art is None:
            import time
            with http.client(timeout=180) as c:
                for attempt in range(4):  # the public instance is often busy: back off, then give up honestly
                    r = c.post(OVERPASS, data={"data": q})
                    if r.status_code in (429, 502, 503, 504) and attempt < 3:
                        time.sleep(30 * (attempt + 1))
                        continue
                    r.raise_for_status()
                    break
            art, _ = artifacts.store(session, source_id="osm_overpass", uri=uri, content=r.content,
                                     content_type="application/json", license_snapshot="ODbL 1.0")
            session.commit()
            artifacts.write_manifest(art)
        data = json.loads(artifacts.raw_path(art).read_bytes())
    except Exception as e:  # a missing layer is omitted and said so, never invented
        credits["rivers"] = f"omitted: OpenStreetMap waterways unavailable ({type(e).__name__})"
        return []
    credits["rivers"] = f"OpenStreetMap waterways (ODbL), artifact {art.sha256[:12]}"
    out = []
    for w in data.get("elements", []):
        pts = [(p["lon"], p["lat"]) for p in w.get("geometry", [])]
        if len(pts) > 1:
            out.append((pts, w.get("tags", {}).get("waterway"), w.get("tags", {})))
    return out


def _attractions(session: Session, district_id, draft: bool) -> list[dict]:
    cats = dict(session.execute(select(AttractionCategory.code, AttractionCategory.app_category)).all())
    out = []
    for a in session.scalars(select(Attraction).where(Attraction.status == "published", Attraction.district_id == district_id)):
        out.append({"lat": a.latitude, "lon": a.longitude, "name_en": a.canonical_name_en, "name_bn": a.canonical_name_bn,
                    "app": cats.get(a.category_code or "", "Scenic"), "draft": False})
    if draft:  # candidates under review, from their proposed claims (not ones the source no longer has)
        from app.models.catalog import ReviewTask
        flagged = set(session.scalars(select(ReviewTask.entity_id).where(
            ReviewTask.task_type.in_(("source_record_removed",)), ReviewTask.status == "open")))
        vals: dict = {}
        for c in session.scalars(select(SourceClaim).where(SourceClaim.entity_type == "attraction",
                                                           SourceClaim.status == "proposed")):
            vals.setdefault(c.entity_id, {})[c.field_name] = (c.claimed_value or {}).get("v")
        for eid, v in vals.items():
            if eid not in flagged and v.get("district_id") == str(district_id) and v.get("latitude") is not None:
                out.append({"lat": v["latitude"], "lon": v["longitude"], "name_en": v.get("canonical_name_en"),
                            "name_bn": v.get("canonical_name_bn"), "app": cats.get(v.get("category_code") or "", "Scenic"),
                            "draft": True})
    return out


# --- drawing ----------------------------------------------------------------------------------

def _label_box(ax, text, x, y, size_pt, *, ha="center", bold=False):
    """The pixel box (x0, y0, x1, y1) that _label would cover for data coords (x, y)."""
    _, width, ascent = text_path(text, face_for(text, bold))
    if not ascent:
        return None
    scale_px = size_pt * ax.figure.dpi / 72 / ascent
    px, py = ax.transData.transform((x, y))
    dx = {"center": -width / 2, "left": 0, "right": -width}[ha]
    halo = size_pt * 0.22 * ax.figure.dpi / 72
    return (px + dx * scale_px - halo, py - 0.62 * ascent * scale_px - halo,
            px + (dx + width) * scale_px + halo, py + 0.68 * ascent * scale_px + halo)


class _Placer:
    """Places labels so none overlaps another label or a marked point: each label tries a few
    positions around its anchor (above, right, left, below) and is left out when none is free."""

    def __init__(self, ax):
        self.ax = ax
        self.boxes: list[tuple[float, float, float, float]] = []
        a = ax.get_window_extent()
        self.area = (a.x0 + 4, a.y0 + 4, a.x1 - 4, a.y1 - 4)

    def block(self, x, y, radius_px):
        px, py = self.ax.transData.transform((x, y))
        self.boxes.append((px - radius_px, py - radius_px, px + radius_px, py + radius_px))

    def _free(self, b):
        x0, y0, x1, y1 = self.area
        if b[0] < x0 or b[1] < y0 or b[2] > x1 or b[3] > y1:
            return False
        return all(b[2] <= o[0] or b[0] >= o[2] or b[3] <= o[1] or b[1] >= o[3] for o in self.boxes)

    def place(self, text, x, y, size_pt, offsets=((0, 0, "center"),), **kw) -> bool:
        """offsets: (dx_px, dy_px, ha) tried in order; the first free one is drawn."""
        if not text:
            return False
        inv = self.ax.transData.inverted()
        px, py = self.ax.transData.transform((x, y))
        for dx, dy, ha in offsets:
            lx, ly = inv.transform((px + dx, py + dy))
            b = _label_box(self.ax, text, lx, ly, size_pt, ha=ha, bold=kw.get("bold", False))
            if b and self._free(b):
                self.boxes.append(b)
                _label(self.ax, text, lx, ly, size_pt, ha=ha, **kw)
                return True
        return False


def _around(radius_px, size_pt, dpi):
    """Positions around a point marker of `radius_px`: above, right, left, below, then the corners."""
    h = size_pt * dpi / 72                 # the text's size in pixels
    halo = size_pt * 0.22 * dpi / 72
    up = radius_px + 0.62 * h + halo + 2   # the box's bottom just clears the marker
    down = -(radius_px + 0.68 * h + halo + 2)
    side = radius_px + halo + 4
    return ((0, up, "center"), (side, 0, "left"), (-side, 0, "right"), (0, down, "center"),
            (side, up * 0.8, "left"), (-side, up * 0.8, "right"), (side, down * 0.8, "left"), (-side, down * 0.8, "right"))


def _label(ax, text, x, y, size_pt, *, color=PALETTE["text"], ha="center", bold=False, halo=True, coords="data", zorder=20):
    """Shaped text at (x, y); size in points. coords: 'data' or 'axes'."""
    if not text:
        return
    path, width, ascent = text_path(text, face_for(text, bold))
    fig = ax.figure
    bbox = ax.get_window_extent()
    px_per_pt = fig.dpi / 72
    scale_px = size_pt * px_per_pt / ascent  # font units -> pixels
    if coords == "axes":
        sx, sy = scale_px / bbox.width, scale_px / bbox.height
        base = ax.transAxes
    else:
        x0, x1 = ax.get_xlim()
        y0, y1 = ax.get_ylim()
        sx, sy = scale_px * (x1 - x0) / bbox.width, scale_px * (y1 - y0) / bbox.height
        base = ax.transData
    dx = {"center": -width / 2, "left": 0, "right": -width}[ha]
    tr = Affine2D().translate(dx, -ascent * 0.35).scale(sx, sy).translate(x, y) + base
    patch = PathPatch(path, transform=tr, facecolor=color, edgecolor="none", zorder=zorder, clip_on=False)
    if halo:
        patch.set_path_effects([patheffects.withStroke(linewidth=size_pt * 0.22, foreground="#fbf8f1")])
    ax.add_patch(patch)


def _polys(g):
    return list(g.geoms) if isinstance(g, MultiPolygon) else [g]


def _mpl_path(g, aspect):
    verts, codes = [], []
    for p in _polys(g):
        for ring in [p.exterior, *p.interiors]:
            xs, ys = ring.coords.xy
            pts = [(x * aspect, y) for x, y in zip(xs, ys)]
            verts += pts
            codes += [MplPath.MOVETO] + [MplPath.LINETO] * (len(pts) - 2) + [MplPath.CLOSEPOLY]
    return MplPath(verts, codes)


def _hillshade(z, dx, dy, azimuth=315.0, altitude=40.0, exaggeration=1.0):
    gy, gx = np.gradient(np.nan_to_num(z, nan=np.nanmin(z)) * exaggeration, dy, dx)
    slope = np.arctan(np.hypot(gx, gy))
    aspect = np.arctan2(-gx, gy)
    az, alt = math.radians(azimuth), math.radians(altitude)
    shaded = np.sin(alt) * np.cos(slope) + np.cos(alt) * np.sin(slope) * np.cos(az - aspect)
    return np.clip(shaded, 0, 1)


def render_district(session: Session, slug: str, lang: str = "en", draft: bool = False, out_dir: Path | None = None) -> Path:
    unit = session.scalar(select(AdminUnit).where(AdminUnit.slug == slug))
    division = session.get(AdminUnit, unit.parent_id)
    g = _geom(session, unit.id)
    credits: dict = {"template": TEMPLATE_VERSION, "district": slug, "language": lang, "draft": draft,
                     "generated_at": datetime.utcnow().isoformat(timespec="seconds"),
                     "boundaries": "geoBoundaries gbOpen BGD ADM2 (BBS/OCHA ROAP, CC BY 3.0 IGO), release 9469f09",
                     "names": "Vromon curated names; Bangla verified against district portals"}
    minx, miny, maxx, maxy = g.bounds
    pad = max(maxx - minx, maxy - miny) * 0.12
    frame = (minx - pad, miny - pad, maxx + pad, maxy + pad)
    lat0 = (miny + maxy) / 2
    aspect = math.cos(math.radians(lat0))         # equirectangular, true scale at the district's latitude

    fig = plt.figure(figsize=(W_IN, H_IN), dpi=DPI, facecolor=PALETTE["bg"])
    ax = fig.add_axes([0.06, 0.17, 0.88, 0.70])
    ax.set_facecolor(PALETTE["bg"])
    fx0, fy0, fx1, fy1 = frame[0] * aspect, frame[1], frame[2] * aspect, frame[3]
    # Fit the frame to the axes' shape
    axw, axh = 0.88 * W_IN, 0.70 * H_IN
    want = axw / axh
    if (fx1 - fx0) / (fy1 - fy0) < want:
        c, half = (fx0 + fx1) / 2, (fy1 - fy0) * want / 2
        fx0, fx1 = c - half, c + half
    else:
        c, half = (fy0 + fy1) / 2, (fx1 - fx0) / want / 2
        fy0, fy1 = c - half, c + half
    ax.set_xlim(fx0, fx1)
    ax.set_ylim(fy0, fy1)
    ax.set_axis_off()
    view = box(fx0 / aspect, fy0, fx1 / aspect, fy1)

    # Neighbours (their names are placed last, where they fit)
    neighbour_labels: list[tuple[str, float, float]] = []
    neighbor_ids = session.scalars(select(AdminAdjacency.neighbor_id).where(AdminAdjacency.unit_id == unit.id)).all()
    for nid in neighbor_ids:
        n = session.get(AdminUnit, nid)
        ng = _geom(session, nid)
        if ng is None:
            continue
        ax.add_patch(PathPatch(_mpl_path(ng, aspect), facecolor=PALETTE["neighbor"], edgecolor="#b9b09d", lw=0.6, zorder=1))
        vis = ng.intersection(view.buffer(-pad * 0.15))
        if not vis.is_empty and vis.area > 0.02 * view.area:
            p = vis.representative_point()
            neighbour_labels.append((n.name_bn if lang == "bn" else n.name_en, p.x * aspect, p.y))
    credits["neighbors"] = "admin_adjacency (shared borders of the boundary polygons)"

    # Shadow for the raised look, then the district
    dpath = _mpl_path(g, aspect)
    off = (fy1 - fy0) * 0.006
    ax.add_patch(PathPatch(dpath.transformed(Affine2D().translate(off, -off * 1.4)), facecolor=PALETTE["shadow"],
                           edgecolor="none", alpha=0.55, zorder=2))
    ax.add_patch(PathPatch(dpath, facecolor=PALETTE["land"], edgecolor="none", zorder=3))

    # Terrain
    z, b = _dem(session, (minx - 0.02, miny - 0.02, maxx + 0.02, maxy + 0.02), credits)
    if z is not None:
        relief = float(np.nanpercentile(z, 98) - np.nanpercentile(z, 2))
        exaggeration = 1.0 if relief > 300 else 2.0  # restrained: flat districts are not made to look hilly
        rows, cols = z.shape
        dx = (b[2] - b[0]) / cols * 111320 * aspect
        dy = (b[3] - b[1]) / rows * 110540
        hs = _hillshade(z, dx, dy, exaggeration=exaggeration)
        zn = (z - np.nanmin(z)) / max(np.nanmax(z) - np.nanmin(z), 1)
        tint = plt.get_cmap("gist_earth")(0.35 + 0.45 * np.nan_to_num(zn))[..., :3]
        rgb = tint * (0.55 + 0.45 * hs[..., None])
        img = ax.imshow(rgb, extent=(b[0] * aspect, b[2] * aspect, b[1], b[3]), origin="upper", zorder=4, interpolation="bilinear")
        img.set_clip_path(PathPatch(dpath, transform=ax.transData))
        credits["terrain"] = (f"Copernicus DEM GLO-90 (© DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 "
                              f"provided under COPERNICUS by the European Union and ESA); relief {relief:.0f} m, "
                              f"vertical exaggeration {exaggeration:g}x")
    else:
        credits["terrain"] = "omitted: no DEM tile covers this area"
    ax.add_patch(PathPatch(dpath, facecolor="none", edgecolor=PALETTE["outline"], lw=1.6, zorder=8))

    # Rivers
    rivers = _rivers(session, (minx - 0.05, miny - 0.05, maxx + 0.05, maxy + 0.05), credits)
    river_labels: list[tuple[str, list]] = []
    for pts, kind, tags in sorted(rivers, key=lambda r: -len(r[0])):
        xs, ys = zip(*pts)
        ax.plot([x * aspect for x in xs], ys, color=PALETTE["water"], lw=1.4 if kind == "river" else 0.7,
                solid_capstyle="round", zorder=6, alpha=0.95)
        name = tags.get("name:bn") if lang == "bn" else (tags.get("name:en") or (tags.get("name") if tags.get("name", "").isascii() else None))
        if name and kind == "river" and len(pts) > 8 and name not in [n for n, _ in river_labels]:
            river_labels.append((name, pts))

    # Attractions
    points = _attractions(session, unit.id, draft)
    placer = _Placer(ax)
    for p in points:
        ax.scatter([p["lon"] * aspect], [p["lat"]], s=26, color=CATEGORY_COLOR.get(p["app"], "#555"), edgecolor="white",
                   linewidth=0.8, zorder=14, alpha=0.6 if p["draft"] else 1.0, marker="D" if p["draft"] else "o")
        placer.block(p["lon"] * aspect, p["lat"], DOT_PX)
    shown = 0
    for p in [p for p in points if not p["draft"]]:
        # A sight without a Bangla name keeps its English one on the Bangla map (rather than no name)
        if placer.place((p["name_bn"] or p["name_en"]) if lang == "bn" else p["name_en"], p["lon"] * aspect, p["lat"], 8.5,
                        offsets=_around(DOT_PX, 8.5, DPI), zorder=15):
            shown += 1
    credits["attraction_labels"] = f"{shown} of {sum(not p['draft'] for p in points)} named (the rest would overlap)"
    for name, pts in river_labels[:8]:
        for frac in (0.5, 0.35, 0.65, 0.2, 0.8):
            mx, my = pts[int(len(pts) * frac)]
            if view.contains(box(mx - 1e-4, my - 1e-4, mx + 1e-4, my + 1e-4)) and \
                    placer.place(name, mx * aspect, my, 9, color="#2f6f93", zorder=12):
                break
    for name, x, y in neighbour_labels:
        placer.place(name, x, y, 11, offsets=((0, 0, "center"), (0, 30, "center"), (0, -30, "center"), (40, 0, "center"),
                                              (-40, 0, "center")), color=PALETTE["muted"], zorder=5)
    credits["attractions"] = (f"{sum(not p['draft'] for p in points)} published catalog records"
                              + (f"; {sum(p['draft'] for p in points)} candidates under review (draft only)" if draft else ""))

    # Title, legend, scale, north, credits
    name = unit.name_bn if lang == "bn" else unit.name_en
    sub = (f"{division.name_bn} বিভাগ" if lang == "bn" else f"{division.name_en} Division") if division else ""
    _label(fig.axes[0], name, 0.5, 1.13, 34, coords="axes", bold=True, halo=False)
    _label(fig.axes[0], f"{T[lang]['district']}, {sub}", 0.5, 1.065, 14, coords="axes", color=PALETTE["muted"], halo=False)
    lx, ly = 0.02, -0.06
    _label(ax, T[lang]["legend"], lx, ly, 11, coords="axes", ha="left", bold=True, halo=False)
    items = ([(T[lang]["rivers"], PALETTE["water"], "line")] if rivers else []) +         [(T[lang]["neighbors"], PALETTE["neighbor"], "box")]
    items += [(CATEGORY_BN[k] if lang == "bn" else k, v, "dot") for k, v in CATEGORY_COLOR.items()
              if any(p["app"] == k for p in points)]
    step_y = min(0.035, 0.20 / max(len(items), 1))
    for i, (lab, col, kind) in enumerate(items):
        yy = ly - step_y * (i + 1)
        if kind == "line":
            ax.plot([lx, lx + 0.03], [yy, yy], transform=ax.transAxes, color=col, lw=2, clip_on=False)
        elif kind == "box":
            ax.add_patch(MplPolygon([[lx, yy - 0.008], [lx + 0.03, yy - 0.008], [lx + 0.03, yy + 0.008], [lx, yy + 0.008]],
                                    transform=ax.transAxes, color=col, clip_on=False))
        else:
            ax.scatter([lx + 0.015], [yy], s=30, color=col, transform=ax.transAxes, clip_on=False, edgecolor="white")
        _label(ax, lab, lx + 0.045, yy, 9, coords="axes", ha="left", halo=False)
    if not any(not p["draft"] for p in points):
        _label(ax, T[lang]["none"], lx, ly - step_y * (len(items) + 1), 9, coords="axes", ha="left", color=PALETTE["muted"], halo=False)
    # Scale bar: a round number of km about a fifth of the frame
    km_per_unit = 111.32
    target = (fx1 - fx0) * km_per_unit / 5
    step = min((s for s in (1, 2, 5, 10, 20, 25, 50, 100) if s >= target * 0.6), default=100)
    sx0 = 0.62
    length = step / km_per_unit / (fx1 - fx0)
    ax.plot([sx0, sx0 + length], [-0.06, -0.06], transform=ax.transAxes, color=PALETTE["text"], lw=3, clip_on=False)
    km_text = f"{step}".translate(BN_DIGITS) if lang == "bn" else f"{step}"
    _label(ax, f"{km_text} {T[lang]['km']}", sx0 + length / 2, -0.09, 9, coords="axes", halo=False)
    ax.annotate("", xy=(0.95, -0.02), xytext=(0.95, -0.09), xycoords="axes fraction",
                arrowprops=dict(arrowstyle="-|>", color=PALETTE["text"], lw=1.5))
    _label(ax, "N" if lang == "en" else "উ", 0.95, 0.0, 10, coords="axes", halo=False)
    credit_lines = ["Boundaries: geoBoundaries / BBS, OCHA (CC BY 3.0 IGO)",
                    "Terrain: Copernicus DEM GLO-90, ESA/EU" if z is not None else "Terrain: not available",
                    "Rivers: © OpenStreetMap contributors (ODbL)" if rivers else "Rivers: not shown (source unavailable)",
                    "Attractions: Vromon catalog (Wikidata CC0, reviewed)",
                    f"Vromon · {TEMPLATE_VERSION} · {datetime.utcnow():%Y-%m-%d}"]
    for i, line in enumerate(credit_lines):
        _label(ax, line, 0.62, -0.13 - 0.022 * i, 6.5, coords="axes", ha="left", color=PALETTE["muted"], halo=False)
    if draft:
        _label(ax, T[lang]["draft"], 0.5, 0.5, 30, coords="axes", color="#c0392b", halo=False, zorder=30)
    credits["credits_on_map"] = credit_lines

    out_dir = out_dir or (EXPORTS_DIR / "maps")
    out_dir.mkdir(parents=True, exist_ok=True)
    stem = f"{slug}-{lang}{'-draft' if draft else ''}"
    png = out_dir / f"{stem}.png"
    fig.savefig(png, dpi=DPI, facecolor=PALETTE["bg"])
    plt.close(fig)
    (out_dir / f"{stem}.json").write_text(json.dumps(credits, indent=2, ensure_ascii=False), encoding="utf-8")
    _record_export(session, unit.id, lang, "draft" if draft else "final", png, credits)
    return png


def _record_export(session: Session, unit_id, lang: str, variant: str, png: Path, credits: dict) -> None:
    """Every generated map is recorded with its checksum and inputs; it stays `needs_review` until the
    owner approves the template on the pilot (guideline §13 Phase 3 gate)."""
    import hashlib
    from app.models.catalog import MapExport
    sha = hashlib.sha256(png.read_bytes()).hexdigest()
    if session.scalar(select(MapExport.id).where(MapExport.district_id == unit_id, MapExport.language == lang,
                                                 MapExport.variant == variant, MapExport.sha256 == sha)) is None:
        session.add(MapExport(district_id=unit_id, language=lang, variant=variant, file_path=png.name, sha256=sha,
                              template_version=TEMPLATE_VERSION, credits=credits, status="needs_review"))
    session.commit()

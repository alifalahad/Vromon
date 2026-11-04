# District Map Pipeline

Code: `data-platform/vromon_data/maps/`. Output: `data-platform/exports/maps/<district>-<lang>[-draft].png` plus a `.json` credits file, with one `map_exports` row per image.

## What a map is made of

| Layer | Source | Notes |
|---|---|---|
| District and neighbour outlines | `admin_boundaries` (geoBoundaries ADM2, BBS/OCHA, CC BY 3.0 IGO) | Neighbours come from `admin_adjacency` (shared borders) |
| Terrain | Copernicus DEM GLO-90 tiles, stored as raw artifacts | Hillshade plus a hypsometric tint. Vertical exaggeration is 1× when relief exceeds 300 m, otherwise 2×; a flat district is never made to look hilly. |
| Rivers | OpenStreetMap waterways (Overpass, ODbL) | If unavailable, the layer is **omitted** and both the map and the credits say so |
| Attractions | `attractions` with status `published` only | `--draft` adds candidates under review, with a DRAFT watermark, for reviewers |
| Labels | Curated names (Bangla verified against portals); OSM river names | Shaped with HarfBuzz (`shaped_text.py`) and drawn as outlines, so Bangla conjuncts are correct without QGIS or raqm. Fonts: Noto Sans Bengali / Noto Sans (OFL, `data-platform/assets/fonts`). |

Every map shows a legend, scale bar, north arrow, source credits, template version and date. The `.json` file records the DEM tiles, river artifact, relief, exaggeration and the published/draft attraction counts.

## Commands

```
python -m vromon_data maps render --districts bandarban,cox-s-bazar,barishal,rajshahi   # pilot, en + bn
python -m vromon_data maps render --districts bandarban --draft --lang bn               # reviewer draft
python -m vromon_data maps render --all                                                  # 64 districts x 2
```

## Pilot (2026-11-04)

| District | Kind | Relief (DEM) | Exaggeration |
|---|---|---|---|
| Bandarban | hill | 690 m | 1× |
| Cox's Bazar | coastal / island | 219 m | 2× |
| Barishal | riverine | 12 m | 2× |
| Rajshahi | flat | 27 m | 2× |

All four render in Bangla and English. **No attractions appear yet,** because none are published. The maps say "no reviewed attractions yet" instead of showing unreviewed points.

## Gate before publishing

All exports are `needs_review`. Per guideline §7.2 and §13 (Phases 3 and 7), the owner checks the pilot (accuracy, fonts, labels, credits) before any map is published or shared.

## Known limitations

- River labels come from OSM `name:bn`/`name` and haven't been reviewed. A few may be OSM's naming, not the official one.
- The public Overpass server is often busy. Self-hosting an OSM extract (Geofabrik) would make river layers reliable.
- GLO-90 (90 m) is used for posters; GLO-30 is available for close-ups.

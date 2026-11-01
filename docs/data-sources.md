# Geographic data sources

Built by `scripts/geo/build.sh` (downloads → `data/geo/raw/`, build outputs → `data/geo/build/`, both git-ignored). Committed outputs: `data/geo/{countries,regions,cities}.json` (backend reference tables), `mobile/assets/geo/countries.json` (GeoJSON: the bundled offline Countries layer) and `mobile/assets/geo/home-regions.json` (GeoJSON: Bangladesh's 8 divisions, bundled so they draw offline).

| Data | Source | Version | Licence | Used for |
|---|---|---|---|---|
| Countries (admin-0), **Bangladesh point of view** (`ne_10m_admin_0_countries_bdg`) | [Natural Earth](https://www.naturalearthdata.com/) via naciscdn.org | 5.1.1 | Public domain | Country shapes, English and Bangla names, ISO codes, continents |
| States/provinces/divisions (admin-1) (`ne_10m_admin_1_states_provinces`) | Natural Earth | 5.1.x | Public domain | Region shapes and names (incl. Bangla), ISO 3166-2 codes, GeoNames admin-1 links. **Not used for Bangladesh** (see the next row). |
| Bangladesh divisions (ADM1, `geoBoundaries-BGD-ADM1`, boundary ID `BGD-ADM1-32408957`) | [geoBoundaries](https://www.geoboundaries.org/) gbOpen (source: Wikimedia Commons) | release commit `9469f09` (built 2023-12-12) | **CC0 1.0** (public domain) | Shapes of Bangladesh's 8 divisions (Natural Earth has 7: Mymensingh, split from Dhaka in 2015, is missing) |
| Bangladesh districts (ADM2, `geoBoundaries-BGD-ADM2`, boundary ID `BGD-ADM2-16705992`) | [geoBoundaries](https://www.geoboundaries.org/) gbOpen; source: Bangladesh Bureau of Statistics (BBS), OCHA ROAP | release commit `9469f09` (built 2023-12-12) | **CC BY 3.0 IGO: attribution required** | The 64 district lines and names shown when zoomed into a division (`mobile/assets/geo/home-districts.json`). Simplified to 1% with mapshaper; official spellings (Chattogram, Cumilla, Jashore, Bogura, …) and Bangla names from `BD_DISTRICTS` in `prepare.py`. |
| Cities with population ≥ 15,000 (`cities15000`) | [GeoNames](https://www.geonames.org/) | downloaded 2026-10-13 | **CC BY 4.0: attribution required** | City points, population |
| UN membership flags | [mledoze/countries](https://github.com/mledoze/countries) | master, 2026-10-13 | ODbL 1.0 | Which countries count toward "% of world" |
| Elevation (Terrarium PNG tiles), read live | [AWS Terrain Tiles](https://registry.opendata.aws/terrain-tiles/) (Mapzen/Tilezen) | live, `s3.amazonaws.com/elevation-tiles-prod/terrarium` | Open data; **attribution required** for several sources (SRTM, GMTED2010, ETOPO1 and others) | Hillshade in the Odyssey map style only |
| Street map (vector tiles, styles `liberty` and `dark`, glyphs, sprites), read live | [OpenFreeMap](https://openfreemap.org/) public instance | live, `tiles.openfreemap.org` | Free incl. commercial use, no key; OpenStreetMap data **ODbL, attribution required** ("© OpenStreetMap contributors", OpenMapTiles); no SLA | Itinerary map only (Android Phase 7) |

Map-theme artwork (Style thumbnails, water pattern tiles) is drawn by `scripts/map-themes/build.py` from the Natural Earth countries above and the catalog colours; nothing is copied from the reference app.

## Decisions applied

- **D5, Bangladesh point of view.** Natural Earth spells the variant `bdg`. In it, the Israel/Palestine area is one feature, Palestine (PS); Israel is not a separate country. Developer decision (2026-10-13): follow the POV exactly.
- **D6, "% of world" = 194.** 193 UN member states + 2 observer states (Holy See, Palestine) = 195, minus Israel, which the Bangladesh POV does not show = **194**. `mledoze/countries` marks the Holy See as a UN member; the pipeline corrects that (it is an observer). The script stops if the counts change.
- **Codes.** Countries use ISO 3166-1 alpha-2 (`ISO_A2`, falling back to Natural Earth's `ISO_A2_EH` for France, Norway and Kosovo `XK`). Six features without any code (e.g. Dhekelia, Bir Tawil, Scarborough Reef) are left out. Regions use ISO 3166-2 when valid and unique, otherwise Natural Earth's `adm1_code`. Cities use the GeoNames id and link to a region through Natural Earth's `gn_a1_code`.
- **Bangladesh's divisions (map home step 1, 2026-10-26).** Shapes come from geoBoundaries; the codes are ISO 3166-2 (`BD-A`…`BD-H`, Mymensingh = `BD-H`), the same codes as before, so existing visits keep their meaning. English and Bangla names come from a fixed table in `scripts/geo/prepare.py` (`ADM1_OVERRIDES`): the official spellings Barishal and Chattogram, and every Bangla name ends in বিভাগ (Natural Earth had জেলা, "district", for three). Bangladeshi cities are linked to the division they lie in (point in polygon; a coastal point outside every outline takes the nearest division), not through GeoNames admin-1 codes. Databases seeded before this are updated by migration `0013`.

## Attribution shown in the app

Settings → About → Licences must show: "Map data: Natural Earth (public domain). Cities: GeoNames, CC BY 4.0. Maps rendered with MapLibre." Since map home step 1 it also credits "Bangladesh divisions: geoBoundaries (CC0)" (not required by CC0, but shown). It also credits the districts: "Bangladesh districts: Bangladesh Bureau of Statistics and OCHA ROAP, via geoBoundaries (CC BY 3.0 IGO)" (required).

Since Phase 4 it also names the terrain source: "Terrain (Odyssey style): AWS Terrain Tiles from Mapzen, with data from SRTM, GMTED2010, ETOPO1 and others." **Before release (Phase 8):** copy the full per-source attribution list from Tilezen's `joerd` attribution document into the licences screen, and decide whether to keep reading the public bucket or self-host the tiles.

Since Phase 7 it also names the street map: "Itinerary streets: © OpenStreetMap contributors (ODbL), tiles by OpenFreeMap." The itinerary map shows MapLibre's attribution button and the same line in its caption. OpenFreeMap offers no SLA: before release, decide whether to keep the public instance or self-host (it is open source).

The Trips stats card background (`mobile/assets/trips/stats-card.jpg`) is original artwork drawn by `scripts/trips/render_stats_card.py`; no photo or third-party image is used (prompt rule 10).

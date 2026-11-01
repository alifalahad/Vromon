# Map Home Redesign: Step 1 Report (Bangladesh's 8 divisions)

**Date:** 2026-10-26
**Plan:** [../map-home-redesign-plan.md](../map-home-redesign-plan.md), Step 1

## What changed

| Area | Change | Files |
|---|---|---|
| **Data source** | Bangladesh's divisions now come from **geoBoundaries** gbOpen BGD ADM1, which has all 8 divisions and is **CC0** (public domain). It's pinned to release commit `9469f09`. Every other country still uses Natural Earth. | [scripts/geo/build.sh](../../scripts/geo/build.sh) |
| **Names** | A fixed table keyed by ISO code: Barishal, Chattogram, Dhaka, Khulna, Mymensingh (**BD-H**), Rajshahi, Rangpur, Sylhet. Every Bangla name now ends in **বিভাগ** (Khulna, Rajshahi and Rangpur had জেলা). The source's "Rajshani" typo isn't used. | [scripts/geo/prepare.py](../../scripts/geo/prepare.py) `ADM1_OVERRIDES` |
| **Cities** | Bangladeshi cities link to the division they lie in (point in polygon; a coastal point outside every outline takes the nearest division). This links 7 Mymensingh-area cities that had no division (Mymensingh, Jamalpur, Netrakona, Sherpur and others) and moves 2 Bhola/Barguna towns from Khulna to Barishal, which is correct. Every one of the 139 Bangladeshi cities now has a division. | `prepare.py` |
| **Rebuilt data** | `data/geo/regions.json` (+1 region, BD only), `data/geo/cities.json` (9 links), `regions.pmtiles`. `countries.json` didn't change. | `data/geo/` |
| **Offline copy** | `mobile/assets/geo/home-regions.json` (37 KB) holds the 8 divisions with English and Bangla names. `geoData.ts` exports `HOME_REGIONS` and `homeRegionName()`, ready for Step 2 to draw. | [geoData.ts](../../mobile/src/features/map/geoData.ts) |
| **Existing databases** | Migration **0013**: when the reference tables are already seeded, it adds BD-H, fixes the names and coordinates, and updates the 9 city links. On an empty database it does nothing (the seeder loads the new files). Downgrade restores the old values. Existing visits keep their codes (BD-C is still Dhaka). | [0013](../../backend/alembic/versions/20261026_0013_bangladesh_divisions.py) |
| **Tile cache** | **New fix, found on the phone:** MapLibre kept serving the old tiles (the server allows a 1-day cache), so the phone made no tile requests after the rebuild. The tiles URL now carries `?v=2026-10-26` (`TILES_VERSION` in `api.ts`), and `build.sh` reminds you to bump it. | [api.ts](../../mobile/src/services/api.ts) |
| **Credits** | The licences text (EN and BN) adds "Bangladesh divisions: geoBoundaries (CC0)". `docs/data-sources.md` records the source, version, licence and decisions. | i18n, [data-sources.md](../data-sources.md) |

## Tests

| Check | Result |
|---|---|
| Backend: BD has exactly BD-A..BD-H, Mymensingh's Bangla name, all "Division"; Mymensingh city → BD-H | ✅ `test_bangladesh_has_its_8_divisions` |
| Backend: marking Mymensingh is accepted and counted in stats | ✅ `test_mymensingh_can_be_marked` |
| Backend: migration 0013 on an old 7-division database (upgrade and downgrade) | ✅ `test_0013_brings_old_bangladesh_divisions_up_to_date` (SQLite; the PostgreSQL variant runs only when `TEST_POSTGRES_URL` is set) |
| Mobile: bundled file has 8 divisions; `homeRegionName('BD-H')` → Mymensingh / ময়মনসিংহ বিভাগ; every Bangla name ends in বিভাগ | ✅ `homeRegions.test.ts` |
| `pytest -q` | ✅ 552 passed, 9 skipped |
| `npm run typecheck`, `npm run lint` | ✅ |
| `npm test` | ✅ 328 passed. The first run had 2 timeouts in `navigation.test.tsx` while Metro and the tile build were using the CPU. That file passed 3 times alone, and the full suite passed on the rerun. |

## On the phone (realme, your account, nothing saved)

- **Local database:** the backend restart ran migration 0013 (log: "Running upgrade 0012 -> 0013"). The DB now has 8 divisions and the fixed names.
- **Regions view:** after the tiles-URL fix, the phone fetched the new tiles (`regions.pmtiles?v=2026-10-26`, HTTP 206). A new northern division, Mymensingh, now shows between Rangpur/Rajshahi and Sylhet. [Screenshot](step-1/02-regions-view-mymensingh.png).
- **Add place → Regions → Bangladesh:** the list shows Barishal, Chattogram, Dhaka, Khulna, **Mymensingh**, … all "Division". [Screenshot](step-1/01-add-place-8-divisions.png). I left without saving.
- **Not done on the phone:**
  - **Tapping and marking Mymensingh on the map.** Tapping any division still opens nothing; that's the Step 0 bug, fixed in Step 2. Marking BD-H is covered by the backend test instead, so your account wasn't touched (the visits table has no BD-H row and the backend log shows no visit writes).
  - **The Bangla names in the app.** Switching the app language would also change your synced settings, so the Bangla names are covered by the API and Jest tests.
- I put the map back in Countries view, as it was.

## Left open (for Step 2)

1. **Double border along Bangladesh's edge.** In Regions view, the geoBoundaries outline and Natural Earth's country border don't line up exactly, so Bangladesh's outer edge shows two slightly offset lines. Step 2 draws the home divisions from the bundled file. It should hide the region border where the country border already runs (for example, draw only inner division lines, or draw the home country from the divisions' outer edge).
2. **Division taps** (from Step 0) are still broken.
3. **Other phones' map caches:** anyone who ran the old build keeps old tiles only until their app gets this version (new URL).

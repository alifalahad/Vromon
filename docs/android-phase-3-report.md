# Android Phase 3 Report: World Map

**Date:** 2026-10-13 · **Status:** verified on device by Claude; waiting for the developer's approval
**Plan:** `docs/android-app-plan.md` §3 Phase 3 · **Decisions:** `docs/technology-decisions.md` §22 · **Data:** `docs/data-sources.md`

## 1. Summary

The Map tab is a real travel map. A geo pipeline (`scripts/geo/build.sh`) builds Natural Earth (Bangladesh point of view) countries and regions plus GeoNames cities into a bundled offline countries layer, reference tables, and PMTiles. The backend gained countries/regions/cities tables, visits with newest-wins sync, travel stats, and privacy-guarded `/users/{id}/visits|stats`. The app renders it all with MapLibre: Countries / Regions / Cities views, the Map view sheet (`08`), Add place, a place sheet with Visited / Want to visit / Lived, the "also mark the country?" prompt, legend chips, and offline edits that queue and sync. Onboarding gained "Where have you been?". Developer decision on the way: under the Bangladesh POV, "% of world" is 194.

## 2. Verified on the device (realme RMX2170, by Claude over adb)

| Feature | Result |
|---|---|
| Dev build with MapLibre installs and runs (arm64-only build, 4 m 46 s) | ✓ |
| Sign-in → onboarding (3 steps; live username check) | ✓ |
| World map, dark Default style, one label per country, short names | ✓ (after fixes below) |
| Add place: countries (local), regions (per-country list from API), cities (server search) | ✓ Bangladesh, Dhaka division, Dhaka city |
| Status colours repaint instantly: Visited magenta, Lived purple | ✓ |
| Tap a country → place sheet → change status / Clear; "0 regions · 0 cities" | ✓ |
| Map view sheet (matches `08`), switching to Regions and Cities (PMTiles 206 Range) | ✓ |
| Legend chips appear when 2+ statuses are used | ✓ |
| Offline: backend stopped → Nepal marked, "1 change waiting to sync" → backend back, app foregrounded → synced, chip gone | ✓ |
| Delete account (typed-username confirm + dialog) → data, visits and Supabase sign-in removed | ✓ (QA account `vromon.qa@example.com` created for testing via the Supabase admin API, then deleted through the app) |

## 3. Bugs found and fixed during on-device testing

1. **Visit saves rejected (422):** the Add place screen passed display fields (`name`, `flag`) into the API payload. The payload is now built from `place_type`/`place_code` only, and a rejected edit triggers a resync so the map never shows a change the server refused. Two tests added.
2. **Map view sheet stopped opening:** a `visible` flag drifted out of step with the bottom-sheet modal stack. The sheet now opens imperatively; one sheet at a time (`stackBehavior="replace"`).
3. **Region/city layers drew over labels and country borders:** layers mounted later are anchored with `beforeId`.
4. **City dot size ignored, MapLibre error:** `zoom` must feed a top-level `interpolate`; restructured.
5. **Marked city dots covered by neighbours:** marked cities moved to their own top layer.
6. **Duplicate labels (Indonesia ×7) and formal names:** one label point per country (`country-labels.json`), short `NAME`, a MIN_LABEL zoom filter.
7. Smaller: "Countries" → "Country" in the sheet subtitle, plural "change(s)", search fields no longer auto-capitalise, deletion text now mentions the travel map.

Process issues: Metro started with `CI=1` doesn't watch files (stale bundle). Run it without `CI=1`. An old dev build on the phone shows "Cannot find native module" until the new build is installed.

## 4. Commands run

| Command | Result |
|---|---|
| `npm run typecheck` · `npx eslint . --max-warnings 0` | pass |
| `npm test` | 11 suites, **116 passed** |
| `npx expo-doctor` | 21/21 (after `npx expo install --fix` for 7 SDK patch updates) |
| `pytest -q` | **286 passed**, 8 skipped |
| `alembic check` | at `0003`, no drift |
| `scripts/geo/build.sh` | 237 countries (194 world), 4,556 regions, 33,940 cities; regions 16 MB, cities 15 MB PMTiles; bundled countries 655 KB |

## 5. Deviations

- Map labels are English (MapLibre can't shape Bengali script).
- Glyphs come from MapLibre's demo server and tiles from the dev backend. Both move to a CDN before release (Phase 8).
- Regions and cities need a connection (PMTiles aren't cached offline by MapLibre Native); Countries, visits and edits work offline.
- The place sheet doesn't yet show photos or trips (Phases 6 and 7) or dates (the date is captured in Add place).
- The map-theme button (top-right) arrives with Phase 4.

## 6. Known issues

- The Settings → Licences row uses a simple dialog; a proper licences screen comes in Phase 8.
- At world zoom, unmarked city dots are dense in India and China; a cluster or density style could come with Phase 4 theming.

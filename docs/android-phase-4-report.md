# Android Phase 4 Report: Map Themes

**Date:** 2026-10-13 · **Status:** verified on device by Claude; waiting for the developer's approval
**Plan:** `docs/android-app-plan.md` §3 Phase 4 · **Decisions:** `docs/technology-decisions.md` §23 · **Data:** `docs/data-sources.md`

## 1. Summary

The travel map is themeable. A typed catalog (4 Themes, 11 Colors, 15 Styles) feeds a resolver that turns the user's selection plus the Appearance setting into map colours. The new Map Theme screen (`03`–`07`) has a live MapLibre preview (the user's countries, or a labelled sample), Map | Friends with the comparison legend, Themes · Colors · Styles chips, a snapping card carousel and Apply. Apply saves locally at once and syncs to the account. The Map tab has the theme button (top right), the Settings row shows the theme name ("Default" / "Custom"), and the place sheet, Add place and the legend all use the theme's status colours. Every style renders on the device, including Pencil hatching, Treasure dots, Glow, and Odyssey terrain. The backend validates the stored selection. On-device testing also found and fixed a bottom-sheet bug that stopped the place sheet and the Settings option sheets from opening.

## 2. Verified on the device (realme RMX2170, by Claude over adb)

| Feature | Result |
|---|---|
| Theme button on the map → Map Theme screen | ✓ |
| Default (dark) preview vs `04`, Midnight vs `03` | ✓ colours match (`android-phase-4/01`, `02`) |
| Rustic + Friends: legend, In common / You / Friend vs `07` | ✓ (`03`) |
| Sample label when the user has no countries | ✓ "Sample places" / "Sample comparison" |
| Colors tab: palette applied over a theme's map → "Custom" | ✓ |
| Styles: thumbnails; Pencil hatch, Treasure dots, Glow blur on the live map | ✓ (`05`, `07`) |
| Odyssey: terrain shading on land, flat sea | ✓ after two fixes (§3.2, §3.3) (`06`) |
| Apply → map repaints, `PUT /me/settings` 200, Settings row "Custom" | ✓ (`04`) |
| Opening from Settings lands on the tab with the selected card | ✓ |
| Marked country in the theme's colours on the main map, place sheet, Add place | ✓ Bangladesh marked in Bright on Glow, then cleared (`08`, `10`) |
| Light appearance (map + theme screen) | ✓ (`09`) |
| Back without Apply discards the draft | ✓ |

Test data was put back: the visit was cleared, and the account was reset to the Default theme and System appearance.

Not checked on the device: offline Apply followed by a restart (covered by unit tests), TalkBack, Reduce Motion.

## 3. Bugs found and fixed during on-device testing

1. **Place sheet and Settings option sheets never opened.** On mount they called `dismiss()` on a sheet that wasn't open. `@gorhom/bottom-sheet` 5.2.14 then marks the sheet "dismissing" and ignores every later `present()`. The option sheets weren't touched in this phase and failed the same way, so this predates Phase 4. Fixed with `src/ui/useSheetPresentation.ts`, which only dismisses a sheet that is open (unit-tested).
2. **Odyssey crashed the app.** In MapLibre RN 11.5, any `hillshade-*-color` makes Android's style factory throw (it reads the colour as an array). Fixed by using MapLibre's default hillshade colours with a lower, zoom-scaled exaggeration.
3. **Odyssey shaded the sea:** the elevation tiles include the sea floor. A sea mask (world polygon minus the countries) now covers the shading.
4. Smaller: Pencil hatching was too coarse (tile 8 → 5 dp). The preview crop matches `03`–`07` more closely. The sample chip moved off Spain and Portugal. The preview shows fewer micro-state labels. A theme id the app doesn't know now falls back to "Default" instead of "Custom".

## 4. Commands run

| Command | Result |
|---|---|
| `npm run typecheck` · `npx eslint . --max-warnings 0` | pass |
| `npm test` | 15 suites, **176 passed** (Phase 3: 11 / 116) |
| `npx expo-doctor` | 21/21 |
| `pytest -q` | **288 passed**, 8 skipped (Phase 3: 286) |
| `alembic check` | no drift (no schema change; `map_theme` JSON existed) |
| `python3 scripts/map-themes/build.py` | 15 styles (16 thumbnails, 608 KB), 2 patterns × 3 scales |

New tests: catalog validity (hex, unique ids, sampled values, `derived` flags, tiers), WCAG label contrast for all 21 base maps, the resolver rules, a generated-asset fingerprint, preview framing, the Map Theme screen (RNTL: selection, haptic, Apply, Custom, Friends legend), settings sync (server wins, offline change pushed first, no cross-account push), the sheet presentation hook, and the backend schema (`test_map_theme_selection`, legacy rows load).

## 5. Files

**Mobile, new:** `app/map/theme.tsx`; `src/features/mapThemes/` (`catalog.ts`, `color.ts`, `resolve.ts`, `preview.ts`, `useMapTheme.ts`, `ThemeCard.tsx`, `ThemePreviewMap.tsx` + `.web.tsx`, `StatusSwatch.tsx`, `assets.generated.ts`); `src/features/map/layers.tsx`, `geoData.ts`; `src/ui/SegmentedControl.tsx`, `useSheetPresentation.ts`; `src/constants/features.ts`; `assets/map/styles/*.png`, `assets/map/patterns/*.png`; 4 test files.
**Mobile, changed:** `app/(tabs)/index.tsx` (theme button, themed legend), `app/(tabs)/settings.tsx` (Map Theme row), `app/_layout.tsx` (route, sync by user id), `app/map/add-place.tsx`, `src/features/map/WorldMap.tsx` (+ `.web.tsx`), `style.ts`, `PlaceSheet.tsx`, `src/features/preferences/store.ts`, `sync.ts`, `src/ui/Button.tsx` (optional icon), `OptionSheet.tsx`, `src/i18n/en.json`, `bn.json`, `src/types/index.ts`, `src/__tests__/mapStyle.test.ts`.
**Backend:** `app/schemas/accounts.py` (`MapThemeSelection`), `app/api/v1/endpoints/me.py`, `tests/test_accounts.py`.
**Scripts / docs:** `scripts/map-themes/build.py`; `docs/technology-decisions.md` §23, `docs/data-sources.md`, this report, `docs/android-phase-4/` (screenshots).

## 6. Deviations

- **Stored selection is ids** (`styleId`, `colorsId`, `compareId`) instead of the prompt's inline `compare` colours, so catalog fixes reach existing users.
- **Out-of-box colours changed:** the default is now the Default theme (orange Visited, as in `04`; the Settings row in `13` says "Default"). Phase 3's magenta is Colors → Default.
- **Default theme in light appearance** uses the stripe values as the prompt says: grey land #D9D9D9 and grey water. This differs from the Default *style*'s light map (cream land, blue sea). See §8.
- **Friends preview is a labelled sample** until friends exist (Phase 5).
- **Four ❓ cards got our own names** (Forest, Cobalt, Sage, Ivory) and designed values, flagged `derived` (D8).
- **Odyssey's thumbnail is flat** (no terrain); the live map has terrain when online.
- **Apply opened from Settings returns to Settings**, not the map.

## 7. Known issues and risks

- **Terrain tiles are read live from AWS's public bucket.** Before release: copy the full per-source attribution into the licences screen, and decide whether to self-host the tiles (Phase 8).
- Map labels in previews use MapLibre's demo glyph server (as in Phase 3), self-hosted in Phase 8.
- At world zoom a tap on a small country can open its neighbour (MapLibre's touch box returns the first feature). This is Phase 3 behaviour; I can pick the feature nearest the tap if you want.
- In dev builds, Expo's floating dev-tools button sits over the theme button. It isn't in preview or release builds.

## 8. Decisions needed

1. **Default theme in light appearance:** keep the prompt's grey stripe values, or use the Default style's light map (cream land, blue sea, as in `14`–`23`)?
2. **Out-of-box status colours:** keep the Default theme's orange (`04`), or start new users on the magenta palette (`02`, `14`)?
3. **Names for the four unnamed catalog cards** (Forest, Cobalt, Sage, Ivory): keep, rename, or send full screenshots (D8).

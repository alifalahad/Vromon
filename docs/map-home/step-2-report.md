# Map Home Redesign: Step 2 Report (layout, home camera, Map sheet)

**Date:** 2026-10-26
**Plan:** [../map-home-redesign-plan.md](../map-home-redesign-plan.md), Step 2 (mockups 1 and 8)

## What changed

| Area | Change | Files |
|---|---|---|
| **Layout** | The legend chips, the palette button, the view pill and the blue FAB are gone. On the map now: the **story capsule** top-left, the **Map button** top-right, and a right-hand column with **home ⇄ world** and **+** (Add place). The pending-sync chip sits under the capsule. The dock slot above the tab bar stays empty until Step 4. | [index.tsx](../../mobile/app/(tabs)/index.tsx) |
| **Glass** | New tokens `glass`, `glassBorder` and `accentStrong` (dark and light), `GlassSurface`, and a `glass()` style. **No blur:** `expo-blur` isn't installed, and adding it needs a new dev build; at 90% opacity a blur would barely show. | [tokens.ts](../../mobile/src/ui/theme/tokens.ts), [GlassSurface.tsx](../../mobile/src/ui/GlassSurface.tsx) |
| **Glass opacity** | Dark glass is **0.90**, not the mockups' 0.86. At 0.86, blue link text over a white map (light themes such as Serenity or Rustic in dark mode) is 4.3:1, below AA; at 0.90 it is 4.9:1. | `contrast.test.ts` |
| **Story capsule** | A ring and "**N of 8 divisions**", then "N countries", counted from the visit list (so it updates at once, offline too). Uses Bangla digits in Bangla ("৮টির মধ্যে ৩টি বিভাগ"). For a home country without bundled regions it shows only the countries. Tapping it does nothing yet; "Your story" comes in Step 3. | [StoryCapsule.tsx](../../mobile/src/features/map/StoryCapsule.tsx), [home.ts](../../mobile/src/features/map/home.ts) |
| **Home camera** | The map opens framed on the home country (`me.home_country_iso2`, default BD), on its largest part, so France isn't framed with French Guiana. The globe button flies to the world and turns into a home button; past zoom 3.5 the map counts as "world". Re-tapping the Map tab flies home. | [WorldMap.tsx](../../mobile/src/features/map/WorldMap.tsx) |
| **Map sheet** | Replaces the Map view sheet and the Map Theme button. **Show:** Countries / **Divisions** / Cities (the middle word comes from the home country; other countries say "Regions"). Choosing one switches the view and closes the sheet. **Theme:** the 4 preset themes, applied at once with the sheet staying open, plus **All themes** → the Map Theme screen. **The layer toggles are hidden** because none of those layers exist yet (the plan's rule); they arrive with Steps 5 and 9. | [MapSheet.tsx](../../mobile/src/features/map/MapSheet.tsx) (`MapViewSheet.tsx` deleted) |
| **Division taps (Step 0 bug)** | **Fixed.** Cause, confirmed in MapLibre's Android source (`MLRNMapView.onMapClick`): a tap goes to the topmost source that has a press handler, and the countries source (its borders sit above the region fills) always had one, so it took every tap and dropped it outside Countries view. Now the countries source only has a handler in Countries view. | `WorldMap.tsx` |
| **Divisions drawn from the app** | In Divisions view, Bangladesh's 8 divisions come from the bundled file. They work offline, the tiles leave Bangladesh out (so it isn't drawn twice), and they have **English labels** (MapLibre can't shape Bengali). | `WorldMap.tsx`, [geoData.ts](../../mobile/src/features/map/geoData.ts) |
| **Double border (Step 1)** | **Fixed.** The pipeline now writes only the **inner** lines between divisions (`home-region-borders.json`, 15 lines, 7.6 KB). The country layer draws the outer edge, so it's one line, not two offset ones. | [prepare.py](../../scripts/geo/prepare.py) `inner_borders` |
| **Map error found on the phone** | A tiny Bay of Bengal island collapsed below 4 points after rounding, and MapLibre rejected the polygon ("Polygon must be described by 4 or more coordinate points"). The pipeline now drops collapsed rings, and a test guards it. | `prepare.py` `rounded`, `homeRegions.test.ts` |
| **Strings** | EN and BN: Divisions/বিভাগ, the Map sheet, the toggle labels ("Back to Bangladesh"), the capsule. Removed `map.mapView` and `map.theme`, which nothing used any more. | `i18n/en.json`, `i18n/bn.json` |
| **Maestro** | 02-mark-bangladesh opens the Map sheet → Countries (and closes the sheet if Countries was already shown). 03-theme-rustic goes Map sheet → All themes. | `.maestro/02`, `.maestro/03` |

## Tests

| Check | Result |
|---|---|
| Home helpers: Bangladesh framed on its mainland, France without French Guiana, "3 of 8" counting (incl. an offline visit without a country), country count, "divisions" word | ✅ `mapHome.test.ts` (6) |
| Map sheet: "Divisions" for BD / "Regions" for IN, choosing a view closes, a theme applies at once and stays open, All themes, Bangla | ✅ `mapSheet.test.tsx` (5) |
| Capsule: "3 of 8 divisions · 2 countries" and its spoken label, countries only without bundled regions, Bangla digits | ✅ `storyCapsule.test.tsx` (3) |
| Contrast: text on glass over a black and a white map, white on `accentStrong` | ✅ `contrast.test.ts` |
| Bundled divisions: no ring under 4 points | ✅ `homeRegions.test.ts` |
| `npm run typecheck`, `npm run lint`, `npm test` | ✅ typecheck and lint clean; **347/347**. One earlier run had 5 timeouts because two Jest runs overlapped; the clean run alone passed everything. |
| Backend | No backend code changed in this step (`data/geo/*.json` didn't change), so `pytest` wasn't rerun |

## On the phone (realme, your account, nothing saved)

| Check | Result | Screenshot |
|---|---|---|
| Opens framed on Bangladesh, capsule "0 of 8 divisions · 2 countries", Map button, globe, + | ✅ | [01](step-2/01-opens-on-bangladesh.png) |
| Map sheet: Countries / Divisions / Cities; 4 themes with Default selected; All themes | ✅ | [02](step-2/02-map-sheet.png) |
| Divisions view: 8 divisions with English names, inner lines only, one outer border, no MapLibre error after the fix | ✅ | [03](step-2/03-divisions-view.png) |
| **Tapping a division opens its sheet** (Mymensingh) | ✅ I closed it without marking. | [04](step-2/04-division-tap-opens-sheet.png) |
| Globe → world (button turns into home) → home → Bangladesh; from the world, re-tapping the Map tab → Bangladesh | ✅ | — |
| All themes → Map Theme screen; back without applying | ✅ | — |
| No writes | ✅ The backend log has no visit or settings writes. The map is back in Countries view, as I found it. | — |

**Not run on the phone:**
- **Applying a theme from the sheet.** It would change your synced settings, so a Jest test covers it.
- **The Maestro flows.** 02 marks Bangladesh and 03 applies Rustic, so they need the E2E accounts, which means signing you out. They can run whenever you want.

## Left open

1. **Visited and Lived look almost the same** in the Default theme (found in Step 0). Their colours come from `resolve.ts` (`LIVED_DARKEN = 0.2`), and the plan has no step for it. Suggest fixing it in Step 3 next to the capsule and legend words.
2. In Divisions view, the "Bangladesh" country label sits among the division names. It could be hidden at home zoom; it's a small polish item for Step 11.
3. Blur on the glass needs `expo-blur` and a new dev build; that's optional.

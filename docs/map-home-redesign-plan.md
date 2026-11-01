# Map Home Redesign: Step-by-Step Plan

**Mockups:** https://claude.ai/artifact/Pnz28jHwwXq3BXg6hRg8PB (9 screens)
**Screen:** the Map tab, `mobile/app/(tabs)/index.tsx`
**Written:** 2026-10-23, against commit `89ec2fd`

## Status (2026-10-26)

| Step | Status | Report |
|---|---|---|
| 0 Audit | ✅ done on the phone | [step-0-report.md](map-home/step-0-report.md) |
| 1 Eight divisions | ✅ done on the phone | [step-1-report.md](map-home/step-1-report.md) |
| 2 Layout, home camera, Map sheet | ✅ done on the phone | [step-2-report.md](map-home/step-2-report.md) |
| 3–11 Story, dock, layers, place sheet, today, press and hold, friends, replay and poster, polish | ✅ built and tested; phone-checked read-only on your account (writes covered by tests, see the report's "Not done") | [step-3-11-report.md](map-home/step-3-11-report.md) |

## How to use this file

Run one step per session. Paste the step's **Prompt** block into the coding agent. The agent reads "Rules for every step" first, builds the step, and then stops with a short report. Test each step on the phone, then approve it or ask for fixes before you start the next one.

---

## 1. The idea

The Map tab is the first screen people see. Right now it is a Visited-style world map with three floating controls. Been, Visited and Skratch already do that, and they do it well. Vromon's difference is that it **plans trips around Bangladesh**, so the map should connect three things: where you have been, where you want to go, and the trip you are on or about to take.

**One map, three moments:**

| Moment | What the map shows | Bottom card ("the dock") |
|---|---|---|
| Between trips | Your Bangladesh by division, with your trip trails and dots for places Vromon can plan | A place from your Want list → **Plan a trip here** |
| Trip coming up | A dashed arc to the destination | Countdown, plan status, cost → **Open trip** |
| On the trip | Today's stops and route, and you | Next stop, "Leave in 20 min" → **Directions** / **Running late** |

**What we keep from other apps, and how we change it:**

| From | Idea | Vromon version |
|---|---|---|
| Been, Visited | Progress count and % | A ring that counts **divisions in your home country** first, then countries |
| Polarsteps | Trails of past trips | Thin trails drawn from real trip stops. The coming trip is a dashed arc. |
| Visited, Flighty | Yearly stats and a shareable poster | The "Your story" panel, plus **Replay**: the map fills in year by year |
| Skratch | A satisfying way to mark places | **Long-press** anywhere, slide to Visited, Want or Lived, then let go |
| Social map apps | Friends on the map | Friend avatars on places they have been, and a link to the existing Compare screen |
| Nobody | **Plannable places** | Dots for destinations Vromon has data for. One tap starts the trip wizard. |

**Minimal rule:** at most 4 floating things on the map: the story capsule, the Map button, a right-hand column (home/world toggle and +), and the dock. The palette button and the view pill move into one **Map sheet**.

---

## 2. Design spec (from the mockups)

Use the existing tokens in `mobile/src/ui/theme/tokens.ts`. New values:

| Token | Dark | Light (to tune in step 2) | Use |
|---|---|---|---|
| `glass` | `rgba(23,27,34,0.86)` + 20 px blur | `rgba(255,255,255,0.88)` + blur | Capsule, round buttons, dock |
| `glassBorder` | `rgba(255,255,255,0.08)` | `rgba(0,0,0,0.06)` | 1 px border on glass |
| `accentStrong` | `#2D6AE3` | `accent` | Filled buttons. White on `#3379F3` is only 4.1:1, which fails AA for 15–16 px text. |
| `tripSunset`, `tripSunsetText` | already in the trip-planner spec | | Countdown, story ring, eyebrow text |

- **Map statuses (Midnight theme):** visited `#F08A4B`, lived `#C25A27` (darker, so the two differ in lightness as well as hue), want = blue hatching (`#6EA0F6` at 55%). Visited and lived places get a soft outer glow. Every status also shows a word (legend, sheet, story grid), so colour is never the only signal.
- **Floating layout (390 × 844 reference):**
  - Story capsule: top-left, 56 px tall.
  - Map button: top-right, 48 px.
  - Right column above the dock: home/world toggle (48 px) and Mark (+, 56 px).
  - Dock: 12 px from the sides, 12 px above the tab bar, radius 28.
  - Sheets: top radius 26, handle 40 × 5.
- **Type:** the system font. Dock title 26/800, eyebrow 11/700 with 0.12 em tracking and uppercase. Map labels 9.5/700 with 0.14 em tracking and uppercase. Bangla names use Noto Sans Bengali.
- **Only one blue button per screen.** Secondary buttons use `rgba(255,255,255,0.08)`.
- **Motion:**
  - Dock content crossfades between moments (180 ms).
  - The camera eases (400 ms).
  - The want pin pulses once on open, not forever.
  - Everything respects `useReduceMotion`.

---

## 3. Rules for every step

1. Read `mobile/AGENTS.md`, `docs/architecture.md` and this file first. Routes stay in `mobile/app/`. Never hand-edit `android/`.
2. **No fake data in the app.** The numbers in the mockups are samples. Every figure must come from the API. If a source does not exist yet, hide the element; never show a made-up value. Mark estimates with "≈".
3. **Privacy is enforced on the server.** Friend data comes only from endpoints that check an accepted friendship.
4. **Every string goes through i18n, in English and Bangla.** Bangla uses Bangla digits, as the stats card already does.
5. **Accessibility:** 48 dp touch targets, labels on icon buttons, AA contrast (add the new tokens to `contrast.test.ts`), and a non-gesture route for every gesture.
6. **Test on the USB phone, not the emulator.** Use the QA/E2E accounts, never real user data.
7. Before you report a step as done, run `npm run typecheck && npm run lint && npm test` in `mobile/` and `pytest -q` in `backend/` if the backend changed.
8. Do not commit, push or open a PR unless asked.
9. End each step with a short report: what changed, which files, how it was verified (test or phone), and anything left open. Then **stop**.

---

## Step 0: Audit and decisions (no code)

**Prompt**
```
Read docs/map-home-redesign-plan.md (sections 1–3) and open the mockups link in it.
Audit what the redesign needs, but do NOT write app code yet:
- mobile/app/(tabs)/index.tsx and everything it imports (WorldMap, layers, MapViewSheet, PlaceSheet, visits, mapThemes)
- the stats endpoints (/users/{id}/stats, /me/trips/stats), trips list (/trips), destinations (/destinations), /users/{id}/compare, route_cache geometry, Today mode (app/trip/today/[id].tsx)
- the home-country setting (app/settings/home-country.tsx) and how regions.json/regions.pmtiles label Bangladesh
For each mockup screen, list: the data it needs, where it comes from today, and what is missing.
Confirm these known gaps:
(a) the Natural Earth admin-1 data has 7 Bangladesh divisions and no Mymensingh (BD-H);
(b) destinations have no region code, so a division can't be matched to a plannable destination;
(c) there is no endpoint for friends' visits aggregated per place.
Write the result to docs/map-home/step-0-report.md and stop.
```
**Done when:** the report exists and every mockup element is mapped to a data source or a gap.

---

## Step 1: Bangladesh divisions data (8, with Mymensingh)

**Prompt**
```
Follow docs/map-home-redesign-plan.md, Step 1. Rules in section 3.
Goal: the map and stats know all 8 divisions of Bangladesh.
- Replace the Bangladesh features in the region data with an 8-division ADM1 source that has a licence we can use (e.g. OCHA COD-AB for BGD, or geoBoundaries).
  Keep every other country's features unchanged. Code Mymensingh as BD-H; keep the existing BD-A..BD-G codes.
- Rebuild regions.pmtiles and regions.json with the existing scripts/geo pipeline, and add name_bn for all 8 divisions.
  Fix the wrong Bangla names (Khulna, Rajshahi and Rangpur say "জেলা"; they must say "বিভাগ") and spell Barisal as Barishal.
- Bundle the home country's divisions as GeoJSON in mobile/assets/geo (like countries.json), so divisions draw offline.
- Add BD-H to the backend geo seed with an Alembic migration if the region table needs it. Existing visits to BD-C (Dhaka) stay as they are.
- Record the source, version and licence in docs/data-sources.md.
Tests: a backend test that BD has 8 regions; a mobile test that the Mymensingh code resolves to a name.
Check on the phone: Mymensingh can be tapped and marked.
```
**Done when:** the map shows 8 divisions and the stats say "of 8".

---

## Step 2: The new map layout, camera that opens on home, and the Map sheet

**Prompt**
```
Follow docs/map-home-redesign-plan.md, Step 2, and mockups 1 and 8 ("Home, between trips" and "One Map sheet").
- Add tokens glass, glassBorder and accentStrong (section 2), in dark and light, to tokens.ts and contrast.test.ts.
  Add a GlassSurface UI component (expo-blur if it is in the SDK 57 docs, otherwise a solid fallback).
- Layout in index.tsx:
  - top-left: story capsule (stub: a ring plus "N of 8 divisions" from /users/{me}/stats, with the count of regions in the home country);
  - top-right: Map button;
  - right column: home/world toggle and Mark (+, opens the existing /map/add-place);
  - an empty Dock slot above the tab bar.
- Camera: open framed on the home country (settings home_country; default BD). The home/world toggle flies between home and the world.
  Re-tapping the Map tab still recentres (on home).
- Map sheet (bottom sheet) replaces MapViewSheet and the palette button:
  - "Show": Countries / <regions word> / Cities. The regions word comes from the home country's region type ("Divisions" for BD).
  - "On the map": toggles for Trip trails, Places Vromon can plan, Friends. Store them in usePreferences. Hide toggles whose layer doesn't exist yet.
  - "Theme": 4 theme swatches from the catalogue, plus "All themes" → /map/theme.
- Remove the old legend chips; the Story panel (step 3) carries the legend words.
Keep the pending-sync chip, but place it under the capsule.
- Fix the Step 0 bug: tapping a division in Regions view opens nothing (see docs/map-home/step-0-report.md).
  Check it on the phone.
- Draw the home divisions from the bundled GeoJSON (step 1), and add an English label layer for division names.
  MapLibre can't shape Bengali script.
- Fix the double border on Bangladesh's outer edge: the geoBoundaries outline doesn't line up with Natural Earth's
  country border (docs/map-home/step-1-report.md, "Left open").
Update the Maestro flows 02-mark-bangladesh (uses map-view-pill) and 03-theme-rustic (uses map-theme-button) for the new controls.
```
**Done when:** the app opens on Bangladesh, the old pill and palette button are gone, and the theme and view still work from the sheet.

---

## Step 3: Story capsule and the "Your story" panel

**Prompt**
```
Follow docs/map-home-redesign-plan.md, Step 3, and mockup 5 ("Your story").
- Capsule: a progress ring (home-country regions visited or lived, out of the total) and a second line ("N countries · M trips this year").
  When zoomed out to the world, it switches to countries and the world percentage (mockup 4).
- Tapping the capsule opens a panel from the top:
  - the title "Your <home country>" with the Bangla name;
  - a 2-column grid of all home-country divisions with their status as a word (Lived/Visited/Want/blank), coloured like the map;
  - stat tiles from real data only: countries, trips planned with Vromon, and days on the road (/me/trips/stats total_days).
    The home-country "N of 8" is computed in the app from visits (country_iso2) and /geo/regions?country=XX;
    /users/{id}/stats counts regions across all countries.
    No distance tile: nothing sums trip distances yet;
  - "New places each year" bars from first_visited_on (client-side group by year), with the current year highlighted;
  - buttons: Replay my years (step 10; hide until then) and Share poster (step 10; hide until then).
Write unit tests for the year grouping and the ring maths.
```
**Done when:** the numbers match the API for a QA account, and the panel reads correctly in TalkBack and in Bangla.

---

## Step 4: The Dock, a card that changes with the moment

**Prompt**
```
Follow docs/map-home-redesign-plan.md, Step 4, and mockups 1, 2 and 3.
Backend first:
- add region_code (ISO 3166-2) to destinations, filled at import/seed by a point-in-polygon test of latitude/longitude against the region data;
- include it in DestinationOut;
- write the migration and tests.
Mobile: a Dock component with a pure function pickDockState(trips, visits, destinations, now) → one of:
  1. 'today': a trip whose dates include today
     → day N of M, next stop and time, "Leave in X min" (reuse the Today mode hooks; don't duplicate the maths),
        a 5-segment day progress bar, Directions and Running late (open the existing late flow).
  2. 'upcoming': the nearest future trip within 30 days
     → name, dates, a countdown in days, and chips (plan status, number of stops, ≈ cost if the budget is known),
        and Open trip.
  3. 'idea': places on the Want list that have a plannable destination (match by region_code or country)
     → name, region and Bangla name, Plan a trip here (→ /trip/new?destination=<id>), Next idea (cycles, with page dots).
  4. 'empty': nothing above → "Mark where you've been" with a long-press hint and + Mark.
Unit-test pickDockState for every branch, including date edges (today = start, today = end, timezone Asia/Dhaka).
Crossfade between states (respect reduce motion).
```
**Done when:** a QA account with no trips, one with an upcoming trip, and one with a trip today each show the right card on the phone.

---

## Step 5: Map layers for plannable places and trip trails

**Prompt**
```
Follow docs/map-home-redesign-plan.md, Step 5, and mockups 1 and 2.
- Plannable places: a MapLibre circle layer from /destinations (latitude/longitude), with small white dots and a soft halo.
  Tap → a light sheet with the name, place count, "checked/unchecked data" (the destination's `checked`), and Plan a trip here.
  Respects the "Places Vromon can plan" toggle.
- Trip trails: for completed trips, draw thin lines through the trip's stops in order.
  TripStopOut has no coordinates: add lat/lon from the cities table, or use the itinerary places for single-destination trips.
  If route_cache has geometry for a leg, use it; otherwise draw a gentle arc. The trail is decoration, not navigation, so no "route" wording.
  For the upcoming trip, draw a dashed blue arc from home to the destination, plus the destination pin with a label.
  Respects the "Trip trails" toggle.
- Want places pulse once when the map opens (not in a loop).
Performance: build the GeoJSON with useMemo; no re-render on camera move. Test on the realme phone with 20+ trips.
```
**Done when:** trails and dots draw from real data, the toggles work, and panning stays smooth.

---

## Step 6: The upgraded place sheet

**Prompt**
```
Follow docs/map-home-redesign-plan.md, Step 6, and mockup 6 ("Tap a division").
Update src/features/map/PlaceSheet.tsx:
- header: name, Bangla name, and "Division of Bangladesh" (type and country from the region data);
- the status selector as a 4-way segmented control (Visited / Want / Lived / Clear), with a check icon on the selected option;
- "Your trips here": the user's trips with stops in this place (match by stop coordinates in the region, or by destination region_code). Each row opens the trip;
- "<friends> have been here": avatars from the friends endpoint (step 9). Hide until step 9 lands;
- keep the PhotoStrip;
- primary button: "Plan a trip to X" or "Plan another trip to X" when there is a matching destination; otherwise no button.
Highlight the selected place on the map with a white outline.
```
**Done when:** tapping Sylhet on a QA account shows its trips, and Plan opens the wizard prefilled.

---

## Step 7: Today on the map

**Prompt**
```
Follow docs/map-home-redesign-plan.md, Step 7, and mockup 3 ("On the trip").
When pickDockState is 'today':
- the camera frames today's stops;
- draw today's legs: done (solid sunset), next (dotted blue), later (dotted grey);
- stop pins: done = check, next = white numbered pin with the time label, later = outlined numbered pins;
- show the user's location (reuse the location permission and tracking from Today mode; ask for nothing new);
- the capsule switches to "Day N of M · <place>" with a day ring; tapping it opens /trip/today/[id];
- add a "Centre on me" button in the right column.
Leaving the trip moment returns the map to the home camera.
```
**Done when:** a QA trip set to today shows the day on the map, and Running late changes the times in the Dock.

---

## Step 8: Long-press to mark

**Prompt**
```
Follow docs/map-home-redesign-plan.md, Step 8, and mockup 7 ("Long-press to mark").
- Long-press on the map → query the feature under the finger at the current view level → show a radial of 3 options above the finger
  (Visited, Want, Lived), with the place name in a chip and the area outside dimmed.
- Slide to an option and release → mark it (useMarkPlace, same outbox), with haptic ticks on hover and a success haptic.
  Releasing elsewhere cancels.
- An already-marked place shows its current status highlighted, and a 4th "Clear" option.
- Show a one-time hint the first time ("Long-press anywhere to mark it"), stored in preferences.
- Accessibility: TalkBack users keep tap → place sheet, which has the same actions. The radial options are real buttons.
Add a Maestro flow for long-press marking.
```
**Done when:** you can mark 5 divisions in under 10 seconds on the phone, and undo works through the sheet.

---

## Step 9: Friends layer

**Prompt**
```
Follow docs/map-home-redesign-plan.md, Step 9, and mockup 4 ("Zoomed out, friends layer").
Backend: GET /me/friends/footprints?place_type=country|region returns
[{place_type, place_code, friends: [{id, display_name, avatar}], count}].
It covers accepted friends only (the same rule as services/privacy.py viewer_can_see) and is rate-limited.
Test the privacy cases: a blocked friend, a pending request, a removed friend.
Mobile:
- an avatar stack (up to 2 avatars and "+N") on each place's label point, with the "Friends" toggle in the Map sheet;
- tap → place sheet;
- Dock 'social' variant when the Friends layer is on and there is no trip moment: the newest friend mark
  → "Compare maps" (the existing /friends/compare/[id]) and "Hide friends";
- place sheet (step 6): show "<names> have been here".
```
**Done when:** two QA accounts that are friends see each other's footprints, and a non-friend sees nothing (checked on the server).

---

## Step 10: Replay and share poster

**Prompt**
```
Follow docs/map-home-redesign-plan.md, Step 10, and mockup 9 ("Replay your years").
- Replay: a full-screen mode from the Story panel.
  The map recolours year by year from first_visited_on, with a big year label and one line made from that year's data
  (e.g. "first trip to Chattogram" from the earliest new place or trip; no invented text).
  It has play/pause and a year slider (an accessible slider with an announced value).
  Visits without a date go into an "Undated" step at the end.
- Share poster: capture the map snapshot (MapLibre's snapshot API) plus the capsule stats into a 1080×1920 image,
  then share it with expo-sharing. No user location or friend data in the poster.
- "Save as video" is optional. Do it only if a supported SDK 57 approach exists; otherwise leave it out and say so in the report.
```
**Done when:** Replay runs smoothly on the phone, and the poster shares to WhatsApp or Messenger.

---

## Step 11: Polish and release check

**Prompt**
```
Follow docs/map-home-redesign-plan.md, Step 11.
- Light theme pass on every new surface (glass, dock, sheets). Contrast tests for all new tokens.
- Bangla pass: every new string, Bangla digits, and long Bangla names in the dock (2 lines max, no clipping).
- Largest font size: the dock and capsule grow without overlapping the right column (as in the android-phase-8 checks).
- Reduce motion: no pulse, no crossfade, instant camera.
- Offline: the map, capsule and dock open from the persisted cache. Plan/compare actions explain that they need a connection.
- Performance: cold start to first map frame on the realme phone, before and after. Note it in the report.
- Update docs/feature-inventory.md and the Maestro flows. Final report: docs/map-home/step-11-report.md.
```
**Done when:** all checks pass and the phone run is recorded in the report.

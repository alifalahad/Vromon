# Android Phase 7 Report: Trips

**Date:** 2026-10-17 · **Status:** verified on device by Claude; waiting for the developer's approval
**Plan:** `docs/android-app-plan.md` §3 Phase 7 · **Decisions:** `docs/technology-decisions.md` §26

## 1. Summary

The Trips tab now matches `10`:
- A stats card (completed trips, total days, continents, countries, cities) over an original aeroplane illustration with the warm orange overlay.
- Upcoming, Ongoing and Past sections.
- Trip cards with the date range, "Duration N days" in green, and the stops (flag, how you get there, "City, Country", dotted connector).

"All trip stats" matches `09`, using the formulas in the prompt (completed trips only). Trips now have stops (decision D7): the wizard asks where you start and how you travel, a route editor adds, removes and reorders stops, and existing trips got their destination as a stop. When a trip has ended, one tap marks its places visited on your map. Friends' trips open read-only. The itinerary map runs on MapLibre with OpenStreetMap streets, so `react-native-maps` is gone and the app has one map engine and needs no Google key.

## 2. Verified on the device (realme RMX2170, plus a QA account as the friend)

| Feature | Result |
|---|---|
| New dev build without react-native-maps installs and runs | ✓ (6 min build) |
| Trips tab: stats card over the illustration, sections, trip cards with stops | ✓ (`01`, `02`) |
| Stats card counts only finished trips (your 45 finished test trips: 135 days) | ✓ |
| All trip stats: 135 total days → 19.29 weeks, 4.43 months, 0.37 years; average 3.0 days; longest trip, most visited country, trips per year | ✓ (`03`; the maths checked by hand) |
| "Trip finished — mark Cox's Bāzār as visited?" → Mark visited → "2 places marked"; the offer doesn't come back for other trips to the same place | ✓ |
| Wizard: Starting from (city search) + Getting there (Bus) → Review shows both → Create → back on the Trips tab | ✓ (`04`, `05`) |
| The new trip's route: Dhaka (Stop) → Cox's Bāzār (Bus) | ✓ |
| Route editor: add Chattogram (search), choose Train, save → route shows three stops | ✓ (`06`, `07`) |
| City search stays above the keyboard (after the fix in §3) | ✓ (`08`) |
| Itinerary map on MapLibre: OpenFreeMap streets (dark), day colours, dashed lines, numbered markers, attribution; tap a marker → "Day 1 · 3. Marine Drive · starts 16:09" | ✓ (`09`) |
| Friend's profile lists their trip with its route; it opens read-only (no edit route, planner, delete or photo upload) | ✓ (`10`) |
| Friend's itinerary: no Adapt, Redo, Regenerate day, Why?, Replace or Remove | ✓ (`11`) |
| QA account deleted afterwards: its trip and stops are gone | ✓ |

## 3. Bugs found and fixed on the device

1. **The keyboard covered the city search** in the wizard and the route editor. Edge-to-edge Android doesn't resize the window, so both screens now pad for the keyboard, and the search scrolls itself into view.
2. **The "mark as visited?" offer would repeat** for every old trip to the same city. Trips whose places are all already on the map are now skipped.
3. **Route editor:** long city names wrapped mid-word next to three buttons. The reorder arrows moved to the "Getting there" row.

## 4. Commands run

| Command | Result |
|---|---|
| `npm run typecheck` · `npx eslint . --max-warnings 0` | pass |
| `npm test` | 18 suites, **213 passed** (Phase 6: 17 / 202) |
| `npx expo-doctor` | 21/21 |
| `pytest -q` | **384 passed**, 8 skipped (Phase 6: 358) |
| `alembic upgrade / downgrade 0005 / upgrade` · `alembic check` | pass, no drift; dev DB at `0006`, 50 existing trips backfilled with a stop |
| The planner suite (optimizer, generation, editing, validation) | passes, part of the 384 |
| PostgreSQL migration test | **not run** (Docker isn't running on this Mac); runs in CI |

## 5. Files

**Backend, new:**
- `app/services/stats/trips.py`, `app/services/trip_stops.py`
- `alembic/versions/20261017_0006_trip_stops.py`
- `tests/test_trips_phase7.py` (26 tests)

**Backend, changed:**
- `models.py` (`TripStop`, `trips.visited_prompt`), `models/__init__.py`
- `schemas/schemas.py` (stops, mark-visited, trip stats)
- `endpoints/trips.py` (stops on create and duplicate, `PUT …/stops`, `POST …/mark-visited`, serialisers)
- `endpoints/me.py` (`/me/trips/stats`), `endpoints/users.py` (`/users/{id}/trips/stats`, trips with stops)
- `services/stats/__init__.py`

**Mobile, new:**
- `app/stats/trips.tsx`, `app/trip/route/[id].tsx`
- `src/features/trips/`: `dates.ts`, `transport.ts`, `queries.ts`, `StatsCard.tsx`, `TripCard.tsx`, `MarkVisitedBanner.tsx`, `CitySearch.tsx`
- `assets/trips/stats-card.jpg`, `src/__tests__/trips.test.tsx`

**Mobile, changed:**
- `app/(tabs)/trips.tsx` (rewritten), `app/trip/new.tsx` (origin, mode, back to Trips, keyboard), `app/trip/[id].tsx` (route, read-only), `app/itinerary/[id].tsx` (read-only), `app/friends/[id].tsx` (trips open), `app/_layout.tsx`
- `src/components/TripMap.tsx` (MapLibre), `TripMap.web.tsx` (comment)
- `src/features/tripForm.ts`, `src/services/api.ts`, `queryClient.ts`, `src/types/index.ts`, i18n (en, bn)
- `package.json` / lock (`react-native-maps` removed)

**Other:**
- `scripts/trips/render_stats_card.py`
- `docs/technology-decisions.md` §26, `docs/data-sources.md` (OpenFreeMap, illustration)
- This report, `docs/android-phase-7/` (screenshots; `01` and `03` side by side with `10` and `09`)

## 6. Deviations

- **The stats card image is an original illustration**, not a photo: prompt rule 10 requires a licensed or original image, and there's no photo to license.
- **Transport mode means "how you get to this stop".** The origin has none and shows "Stop". The reference shows a mode on every stop.
- **Cards don't show the trip title.** Like `10`, they show dates, duration and stops; a small "Draft" chip marks trips without an itinerary. Duplicate and delete moved to the trip screen.
- **The wizard's own labels are still English-only** (as before this phase). The new Trips, stats and route strings are translated.
- **Light-appearance itinerary map** (OpenFreeMap `liberty`) wasn't checked on the device; only dark was.

## 7. Known issues and risks

- **GeoNames names keep diacritics:** "Cox’s Bāzār", not "Cox's Bazar". This is Phase 3's city data. A display-name override or GeoNames' ASCII name could replace it; your call.
- **OpenFreeMap has no SLA** (free public instance). Self-hosting is possible later (Phase 8 decision).
- **The MapLibre "cities … incorrect header check" error** (Phase 3 tiles) appeared again once at launch. Cities still drew.
- **Your dev database holds 51 test trips** from earlier phases, which dominate the stats (45 finished, 135 days).
- Some seeded Cox's Bazar places sit slightly inland on the OpenStreetMap basemap. That's the seed data's coordinates, not the map.
- PostgreSQL migration test still only in CI.

## 8. Decisions needed

1. **City names:** keep GeoNames' spelling ("Cox’s Bāzār") or show ASCII / English names ("Cox's Bazar")?
2. **Old test trips:** delete the 50 dev trips from earlier phases so the stats show real data? (Nothing deleted without your OK.)
3. Still open: push setup (EAS + Firebase), a domain for invite links, the Phase 4 questions, and the photo limits from Phase 6.

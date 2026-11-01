# Map Home Redesign: Step 0 Report (audit)

**Date:** 2026-10-25
**Plan:** [../map-home-redesign-plan.md](../map-home-redesign-plan.md)
**Code changed:** none

**How it was checked:**
- I read the code.
- I called the local API (backend on 8001).
- I ran the debug dev build on the realme phone (RMX2170), signed in to your account, with read-only actions: switching the view, zooming, opening a sheet. Nothing was marked.

Screenshots are in [step-0/](step-0/).

## 1. What the phone shows today

| Check | Result | Screenshot |
|---|---|---|
| Where the map opens | On the whole of Asia (zoom 1.6). Bangladesh is a small patch in the middle. | [01](step-0/01-opens-on-asia.png) |
| Visited vs Lived | Both are orange of almost the same lightness. They are hard to tell apart on the map and in the legend. | [01](step-0/01-opens-on-asia.png) |
| Legend | 3 chips that take 2 rows at the top | [01](step-0/01-opens-on-asia.png) |
| Regions view over Bangladesh | Faint borders, **no division names**, nothing filled. Your account has no division visits. | [02](step-0/02-regions-view-bangladesh.png) |
| **Tapping a division** | **Nothing opens** (3 tries in central and northern Bangladesh). The region tiles do load (`GET /geo/tiles/regions.pmtiles` 206), and the log has no JS error. | — |
| Tapping a country | Works: the Bangladesh sheet opens ("Country · Lived") | [03](step-0/03-country-sheet.png) |
| Sheet text | "0 regions · **1 cities** visited here": there is no singular/plural form | [03](step-0/03-country-sheet.png) |

**The division-tap bug is new and blocks steps 6 and 8.** The likely cause is in [WorldMap.tsx](../../mobile/src/features/map/WorldMap.tsx): the countries `GeoJSONSource` also receives the press, and its handler drops it outside Countries view, so the region `VectorSource` press never reaches `onPressPlace`. I haven't confirmed this; it should be fixed and tested on the phone in step 2.

## 2. Gaps the plan expected

| Gap | Confirmed? | Detail |
|---|---|---|
| (a) No Mymensingh | **Yes** | `/geo/regions?country=BD` returns 7: BD-A..BD-G. `regions.json` and the DB `regions` table also have 7. Natural Earth admin-1 is the source ([scripts/geo/build.sh](../../scripts/geo/build.sh)). |
| (b) Destinations have no region code | **Yes** | `Destination` has `latitude`/`longitude`, and `country` is a **name** ("Bangladesh"), not an ISO code. There is a way in: `cities.region_code` exists, so the nearest city or a point-in-polygon test can give the code. |
| (c) No aggregated friend footprints | **Partly** | `GET /users/{id}/visits` already returns one friend's visits with the privacy check. Showing friends on the map would need one request per friend. An aggregate endpoint is still the right fix (step 9). |

## 3. New findings

1. **Wrong Bangla names.** Khulna, Rajshahi and Rangpur are "… জেলা" (district) instead of "… বিভাগ" (division) in `regions.json` and the DB. "Barisal" should be "Barishal", the official spelling since 2018. Fix both in step 1.
2. **The map can't draw Bengali script.** MapLibre can't shape it ([layers.tsx](../../mobile/src/features/map/layers.tsx) `CountryLabels`). Map labels stay English; Bangla appears only in the app's own text (capsule, sheets, dock). There are no region labels at all today, so step 2 or 5 must add a symbol layer for division names.
3. **Divisions need a connection.** Regions come from PMTiles on the backend, so they don't work offline. If the map opens on home in divisions view, offline users see empty land. Fix: bundle the home country's divisions as GeoJSON, like `countries.json` (Bangladesh's 8 are about 50 KB simplified). This belongs in step 1 (data) and step 2 (render).
4. **No per-country region count.** `/users/{id}/stats` counts regions across **all** countries. The capsule needs "N of 8 in my home country". It can be computed in the app from visits (`country_iso2`) plus `/geo/regions?country=BD`, so no new endpoint is needed.
5. **Trip stops have no coordinates.** `TripStopOut` has `city_geonameid` but no lat/lon, so trails for multi-city trips need either lat/lon added to `TripStopOut` (the cities table has them) or a lookup. Single-destination trips can use the itinerary items' place coordinates.
6. **Distance travelled has no source.** `route_cache` holds distances only for legs that were fetched, and nothing sums them per trip. The "≈ km travelled" tile is dropped until a trip-distance figure exists, as the plan allows.
7. **Trip stats count only completed trips.** `/me/trips/stats` covers completed trips (`per_year`, `total_days`), but it also returns `upcoming` and `ongoing` counts. "Trips this year" can use `per_year` plus the trips list.
8. **10 of 11 destinations are unchecked.** `checked = 0`; only Cox's Bazar is checked. Plannable dots must show this the same way the destination screen does.
9. **There is no "hidden profile" setting.** Privacy is only friendship plus block (`services/privacy.py`). Step 9's test list should drop that case.
10. **Code to reuse:**
    - [NextTripCard.tsx](../../mobile/src/features/trips/NextTripCard.tsx) already does "how soon / which day" for the upcoming state;
    - [today.ts](../../mobile/src/features/trips/today/today.ts) has pure `todayState`, `leaveBy`, `leaveTimes` and `dayFor` for the today state;
    - `useHere` for location;
    - `useTrips` and `useTripStats` in `features/trips/queries.ts`.
11. **Packages:** `expo-blur` isn't installed, so step 2 must check it against the SDK 57 docs or use a solid fallback. `expo-sharing` and `expo-location` are installed.
12. **Maestro:** `map-view-pill` is used in **02-mark-bangladesh**, not 01-tabs, and `map-theme-button` is used in 03-theme-rustic. Step 2 must update 02 and 03.

## 4. Each mockup screen: data needed, where it comes from, what's missing

| Screen | Needs | Source today | Missing |
|---|---|---|---|
| 1 Home, between trips | Home camera; division fills; division labels; trails; plannable dots; Want-list idea | `me.home_country_iso2`, visits, `/destinations`, trips | Mymensingh; offline divisions; label layer; trail coordinates (5); destination → region (b) |
| 2 Trip coming up | Nearest future trip, dates, stops, cost, plan status | `/trips` (summary + stops), budget endpoint, NextTripCard logic | Destination coordinates for the arc, by matching `destination` name → `/destinations` (no id on the trip summary) |
| 3 On the trip | Today's items, times, leave-by, location | itinerary, `today.ts`, `useHere` | Nothing new; it reuses Today mode |
| 4 World + friends | Country fills, world %, friend avatars | `/users/{id}/stats`, `/friends`, `/users/{id}/visits` per friend | Aggregate endpoint (c), for performance |
| 5 Your story | Divisions with status, countries, trips, days, per-year bars | visits, stats, trip stats | Per-country region count (computed in the app); distance (dropped) |
| 6 Place sheet | Name and Bangla name, type, trips here, friends here, plan button | regions (`name_bn`, `type`), trips, destinations | Division taps (bug); correct `name_bn`; region ↔ trip/destination matching |
| 7 Long-press mark | The feature under the finger, `useMarkPlace` | MapLibre `queryRenderedFeatures`, outbox | Same tap/query issue as screen 6 |
| 8 Map sheet | View, layer toggles, themes | `usePreferences`, theme catalogue | Nothing |
| 9 Replay | `first_visited_on` per visit | visits | Visits without dates go in an "Undated" step |

## 5. Changes to the plan

These are already applied to [map-home-redesign-plan.md](../map-home-redesign-plan.md):
- **Step 1:** correct the Bangla names and the Barishal spelling, and bundle the home country's divisions for offline use.
- **Step 2:**
  - fix the division-tap bug;
  - add a division label layer (English);
  - update Maestro 02 and 03, not 01.
- **Step 3:** compute the home-country count in the app; no distance tile until there's a source.
- **Step 5:** trail coordinates from `TripStopOut` (add lat/lon) or the itinerary.
- **Step 9:** remove the "hidden profile" test case.

## 6. Left open

- **Division taps not opening a sheet:** the cause above is a guess. It needs a fix and a phone test in step 2.
- **Data source for 8 divisions:** OCHA COD-AB (CC BY-IGO) or geoBoundaries (CC BY 4.0). Both need attribution. Step 1 picks one and records it in `docs/data-sources.md`.

**Phone state after the check:** Map tab in Countries view, as it was. The backend (8001) and Metro are still running in the background.

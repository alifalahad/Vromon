# Trip Planner Step 5 Report: Real Roads and Travel Times

**Date:** 2026-10-18 · **Status:** done on the phone; waiting for your approval
**Plan:** `docs/trip-planner-plan.md`, step 5 · **Your decision:** OpenRouteService now, the best option (likely self-hosted OSRM) at deployment · **Screenshots:** `docs/trip-planner/step-5/`

## 1. What changed

### Travel between stops uses real roads

- **Each leg shows the road distance**, how you go, about how long, and the fare. For example: *CNG · about 18 min · 7.4 km · ≈ ৳250*.
- **The map draws the real road** between stops. A leg without road data is a dashed straight line, as before.
- **Tap a leg to choose how to go:** walk, rickshaw (up to 6 km), CNG or a hired car. The leg sheet shows:
  - each one's time and fare, with the suggested one marked ("Suggested for this distance");
  - what choosing it does to the day: *"Arrive 13:07. Nothing else moves."*, or *"Seagull Beach moves 1 h 39 min later. 3 more stops move too."*;
  - "Use this", and "Let Vromon choose" to go back to the suggestion;
  - a note that rickshaw and CNG times and all fares are estimates, and that there is no live traffic yet.
- **Changing a mode only pushes later stops back when they would otherwise overlap.** It never pulls them earlier, so free time is kept. A stop with "Keep this time" that has to move is named in the message.
- **The suggestion:** walk up to 1 km, otherwise a CNG.

### Getting there

- **Day 1 starts with a "Getting there" card**, from the trip's starting city by its mode. For example: *Getting there from Dhaka by bus · About 6 h 5 min · 387 km · ≈ ৳1,150 each*.
- **How it's worked out:**
  - bus, car and train use the road distance;
  - plane uses flying time plus about 2½ hours for the airports.
- **It's marked as a rough estimate.** These aren't timetables or real fares, and it isn't added to the budget yet (that's step 7).

### What the planners and edits use

- **Both planners, rearranging, and the leg sheet use the road times:**
  - CNG takes a quarter longer than a car;
  - walking is 4.5 km/h and a rickshaw 10 km/h, on the road distance.
- **Without road data, nothing changes from before:** the straight-line estimate at 30 km/h, labelled "estimate".
- **The plan's note now says which applies:**
  - "Travel times use road distances; rickshaw and CNG times and all fares are estimates, without traffic";
  - or, without road data, the old "straight-line estimates" note.
- **One rule for every planner and edit:** travel starts when a visit ends, and a meal between two visits happens on the way. Before this fix, the optimiser and the editing disagreed, so the sheet wrongly said stops would move when you kept the suggested mode.

### How it's built

- **Swappable:** the road service sits behind one small interface in `backend/app/services/routing/`. OpenRouteService is one file (`ors.py`); a self-hosted OSRM would be another file next to it, and nothing else changes.
- **Asked once, then kept:**
  - all places and hotels of a destination are fetched in **one** request, the first time a trip there is opened;
  - the answers are stored in a new `route_cache` table;
  - a day's road lines are fetched once and stored the same way;
  - after a restart nothing is asked again.
- **If the service fails** (down, over its limit), the app quietly uses the estimate and waits 5 minutes before asking again. Nothing breaks.
- **The key** is only in `backend/.env` (`ORS_API_KEY`), never in the app.
- **The new address:** OpenRouteService is moving to `api.heigit.org`; that's the address used, and both were tested with your key.
- **Free limits:** 500 matrix and 2,000 directions requests a day. Today used about 3 matrix requests (Cox's Bazar once, Dhaka–Cox's Bazar once, and a test) and a few road-line requests.
- **Data:** migration 0009 adds the `route_cache` table and a `travel_mode` on each stop. Tested upgrade, downgrade and upgrade; `alembic check` is clean; the dev database was backed up first.

## 2. Checked on the phone (the test account e2e.ana, not your account)

- **A new trip:** from Dhaka by bus, built straight from step 2.
  - The backend fetched road data for all 33 places and hotels in one request, and Dhaka–Cox's Bazar in one more.
- **Screenshots:**
  - Day 1: "Getting there from Dhaka by bus · About 6 h 5 min · 387 km · ≈ ৳1,150 each" (01, 02);
  - legs with mode, time, distance and fare, for example "CNG · about 19 min · 7.4 km · ≈ ৳250" (03);
  - the map with the road lines (01);
  - the leg sheet: CNG suggested, "Arrive 13:07. Nothing else moves." (04);
  - choosing Walk shows what moves (05); saving re-timed the day and the message said "Walk to Seagull Beach" (06).
- **Automatic phone tests:** see section 4.

## 3. Bugs found and fixed while testing

1. **Road lines were refused (406)** by OpenRouteService: the request didn't accept its GeoJSON answer. Found with your real key; fixed.
2. **The suggested mode claimed stops would move.** The optimiser lets you travel while a meal sits between two visits, but editing added the travel after the meal. Fixed: one rule everywhere (server and app preview), and a test that checks every leg moves nothing after building, with both planners.
3. **The leg row and the sheet disagreed by a minute** (rounding in two places). Fixed: the same rounding.
4. **Walking showed "Free entry"** (the place-price wording). Fixed: "Free".
5. **Some road answers were wrong** (found when you noticed the map had changed):
   - **What happened:**
     - a place near the border was matched to a road on the far side: a "road" of 1,792 km for 6.8 km;
     - Maheshkhali Island needs a boat;
     - hops of 100–500 m in the hotel and beach zone became 4–5 km by car (one-way roads);
     - Inani Beach and Himchari Waterfall sit about 3 km off in our data (in the sea or on the sand), so no road was found for them at all.
   - **Fixed:**
     - a road answer more than 2.5× the straight line (plus 2 km) isn't believed: the leg uses the labelled estimate and the map draws a dashed line;
     - walking can cut across (at most 1.3× the straight line);
     - road lines only look for a road within 1 km of each place;
     - a place without a road nearby no longer pauses all road requests.
   - **Still open:** the wrong place coordinates themselves need checking by hand (planned for step 10).
6. **The test suite could have called the real road service** once your key was in `.env`. Fixed:
   - tests switch the service off;
   - a guard that fails on any network call passed for all tests;
   - the run before the fix may have used a few of today's free requests.

## 4. Commands run

- **Backend:**
  - `pytest` gives **464 passed**, 8 skipped. That includes the new `tests/test_trip_planner_step5.py` (22 tests, with a fake road service: doubtful answers rejected, asked once and kept, kept across restarts, used by both planners, fallback when the service fails, leg options, choosing a mode, map lines, getting there, the adapter's requests).
  - The full suite was also run with a guard that blocks any network call: no calls.
  - `alembic check` is clean.
- **App:** `jest` gives **277 passed** (23 suites, new `tripLegs.test.tsx`); `tsc` and `eslint` are clean.
- **Maestro on the phone:**
  - the roads run passed;
  - **the full suite 00–99 passed in one run** with real roads on (sign in, tabs, map, theme, friends, the step 4 new-trip flow, the trip screen, a friend's trip, rearranging, sign out).

## 5. Files

- **Backend:**
  - **New:** `services/routing/` (`roads.py`: the cache, the fallback and the interface; `ors.py`: OpenRouteService; `modes.py`: speeds, fares, getting there); `alembic/versions/20261018_0009_roads.py`; `tests/test_trip_planner_step5.py`.
  - **Changed:**
    - `config.py` (`ROUTING_PROVIDER`, `ORS_API_KEY`, `ORS_BASE_URL`);
    - `models.py` (`RouteCache`, `ItineraryItem.travel_mode`);
    - `schemas.py`;
    - `endpoints/trips.py` (`GET …/items/{id}/leg`, `travel_mode` on `PATCH …/items/{id}`, `GET …/days/{id}/route`, `getting_there` on the itinerary, road data prepared when a trip is opened);
    - the planners, `editing_service.py` and `constraint_validator.py` (road times, one travel rule);
    - `tests/conftest.py` (no real road service in tests).
- **App:**
  - **New:** `plan/LegSheet.tsx`, `plan/GettingThere.tsx`, `__tests__/tripLegs.test.tsx`.
  - **Changed:** `PlanRows.tsx` (leg rows), `DayMap.tsx` (road lines), `timeline.ts`, `trip/[id].tsx`, types, API, en/bn strings.
- **Docs:** `docs/go-live.md` (the routing choice at deployment).

## 6. Known issues and limits

- **No live traffic, and driving times are for empty roads.** OpenStreetMap's driving times assume free-flowing traffic (8.8 km in about 9 min by car), so they're shorter than Google Maps' times in Bangladesh, which include usual traffic. Step 6 adds "usual traffic" factors.
- **Wrong place locations:** some places (Inani Beach, Himchari Waterfall) are a few km off in our data, so their legs use estimates. Fixing the data is step 10's hand check.
- **Fares are estimates** from typical local rates (rickshaw ≈ ৳20 + ৳25/km, CNG ≈ ৳40 + ৳28/km, hired car ≈ ৳300 + ৳65/km, per vehicle). They should be checked against real prices before launch.
- **Restaurants:** travel to and from them isn't planned separately; a meal between two visits is treated as on the way.
- **The map:** a day's road can run outside the area the map first shows (it fits the stops, not the whole road); pinch to see it.
- **Not checked by hand:** the leg sheet in Bangla and at the largest font (the strings are in, as for step 4).

## 7. What I need from you

1. **Try it on your phone:** open a trip, tap a leg (the line between two stops), and choose another way to go.
2. **Approve step 5**, or tell me what to change.
3. **Step 6 (live conditions and warnings)** needs one decision: the traffic provider, and whether to spend money on one. My recommendation: test free options' Bangladesh coverage first; otherwise show "usual traffic" only, clearly labelled.

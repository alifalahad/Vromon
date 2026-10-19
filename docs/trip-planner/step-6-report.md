# Trip Planner Step 6 Report: Live Conditions and Warnings

**Date:** 2026-10-19 · **Status:** done on the phone; waiting for your approval
**Plan:** `docs/trip-planner-plan.md`, step 6 · **Design:** the "Conditions and warnings" mockup from step 1 · **Screenshots:** `docs/trip-planner/step-6/`
**Decision taken (the free path):** weather and sea from Open-Meteo (free, no key, no account), and traffic as "usual traffic" for Bangladesh towns, clearly labelled as not live. No money spent and no new accounts. A live traffic provider can be added later behind the same code.

## 1. What changed

### On the trip screen

- **"Updated 17 min ago"** at the top of the map. It opens the Conditions screen.
  - When a refresh fails: "Offline · updated 2 h ago" with an amber dot.
- **The day at a glance**, as chips under the day: temperature ("32° / 24°"), warnings ("1 warning", amber; red for storms), "Sunset 17:19" and "Sea 0.5 m".
  - Each chip opens the Conditions screen for that day.
  - A changed chip fades in instead of jumping.
- **Warnings on the stop they affect:**
  - shown inside the stop card, like the plan's other problems;
  - a red ring for storms, amber for the rest.
- **Legs in a usually slow time** say so: "Usually slow 17:00–20:00 · about +5 min".
- **Refresh:** every 10 minutes while the trip is open, and again when you come back to the app.

### The Conditions screen

- **Day tabs** across the top, then the forecast by the hour (time, sky icon, temperature, chance of rain). Night hours show a moon.
- **Sun card:** sunrise and sunset. **Sea card:** wave height at the day's beach or boat stop: calm, moderate or rough.
- **Warnings**, each with:
  - **What:** for example "Storms likely 15:00–17:00".
  - **Why it matters:** for example "Affects stop 5, Sunset Boat Ride. Boats may not run in a storm."
  - **Where it comes from, and its age:** "Source: weather forecast (Open-Meteo) · 3 min ago".
  - **What you can do:**
    - **"Move to Tuesday":** only when another day of the trip is dry at the same time; it uses the existing move.
    - **"Keep":** the warning moves to "You kept these", with "Show again".
- **"Also checked":**
  - opening hours ("All 4 stops are open when you arrive");
  - after dark ("Sunset is 17:19. You're back by 20:00");
  - traffic ("None of your legs are in the usual slow times. This is usual traffic, not live").
- **At the bottom:** "Vromon warns you using the data above. It can't promise that a place or a road is safe."
- **Pull down** to refresh.
- **Days beyond the forecast** (more than about two weeks ahead) say when the weather will appear. Sunrise and sunset are still worked out from the date.

### The warnings (what triggers each)

| Warning | When | Source |
|---|---|---|
| Storms likely | A thunderstorm in any hour of an outdoor visit | Open-Meteo forecast |
| Rain likely (with the %) | A 60%+ chance of rain in an hour of an outdoor visit | Open-Meteo forecast |
| Strong wind | Gusts of 50 km/h or more during a boat or island stop | Open-Meteo forecast |
| Rough sea | Waves of 1.5 m or more in daytime, on a beach or boat day | Open-Meteo Marine |
| After dark | A wild place (nature, adventure, viewpoints) still being visited 15 min after sunset; not places meant for the evening or a must-see at sunset | Sunset for the date |
| Traffic may make you late | A leg in the usual slow time (08:00–10:00 ×1.3, 17:00–20:00 ×1.4) would make you end after the next stop closes | Usual traffic, not live |

- **"Outdoor"** means beaches, nature, adventure, viewpoints and photography stops, plus anything with beach, boat, island or sea in it.
- **Planned times don't change** for usual traffic; legs only say how much longer they usually take. (Changing all planned times for traffic would be a bigger, separate decision.)

### How it's built

- **Backend:** `services/conditions/`:
  - `openmeteo.py` fetches the forecast (16 days, hourly) and the sea (about a week);
  - `service.py` builds each day's report and its warnings.
- **Cache:** one forecast per destination (and one sea forecast per beach spot), kept for 30 minutes in a new `conditions_cache` table.
  - **Refresh:** "Refresh" (pull down) asks again only if the copy is over 2 minutes old.
  - **A failed refresh:** shows the last copy, marked stale, with its age.
- **API:**
  - `GET /trips/{id}/conditions` (`?refresh=true`), which a friend can also read;
  - `POST /trips/{id}/items/{item_id}/keep` (`{code, kept}`).
- **Data:** migration 0010 adds the cache table and the stops' kept warnings. Tested upgrade, downgrade, upgrade; `alembic check` is clean.
- **Offline:** the conditions are saved on the phone with the plan, so the screen opens offline with "Offline · updated … ago".
- **In both languages:** all wording in English and Bangla (Bangla digits too).

## 1b. Changes after your review (2026-10-19)

You said the map shows streets and directions that don't exist, asked for a map like the mockup and a friendlier weather screen, and noticed there was no way to refresh. Changed:

- **A readable dark map:** the free OpenFreeMap dark style is recoloured in the app (blue water, grey land, green parks, lighter roads and labels) instead of near-black everywhere. Same tiles, no cost.
- **Estimates no longer look like roads:**
  - a leg without trusted road data is a thin, faint dotted line with no white edge;
  - real road legs stay solid, with an edge.
- **The selected stop's name** shows next to its pin.
- **The Conditions screen, answers first:**
  - the day in one card ("Cloudy · 25°–32° · Rain unlikely · Sunrise 05:49 · Sunset 17:23");
  - then "N things to know" (or "Nothing to worry about");
  - then **At your stops** (the weather at each stop, at the time you're there);
  - then **By the hour** (with a rain bar and night icons), the sea in plain words ("Calm · waves around 0.4 m"), and "Also checked".
- **The day's summary** uses the daylight hours, so a foggy dawn no longer labels the whole day "Fog".
- **Refresh:** a **Refresh** button next to "Updated … ago" on the Conditions screen, and a refresh icon in the trip screen's "Updated … ago" pill. Pull-down still works.
- **A false warning removed:** "after dark" no longer applies to town beaches (a beach volleyball court at Laboni in the evening); it's for remote nature places only. A test checks it.
- **Checked on your phone:** looked at your trip read-only (no changes): the new map, the refresh button ("Updated just now" after tapping it), and the new Conditions screen. I didn't save those screenshots, because they show your own trip.
- **Tests:** backend 477 passed, app 282 passed.

## 2. Checked on the phone (the test account e2e.ana, not your account)

- **A new trip with the real forecast** (screenshots 01–04):
  - "Updated 17 min ago" (the forecast was fetched 17 min earlier and kept);
  - chips "32° / 24°", "Sunset 17:19", "Sea 0.5 m";
  - the Conditions screen with the hourly forecast, sunrise 05:52 and sunset 17:19, a calm sea at Inani Beach, and "Also checked".
  - The real forecast for those days is dry, so no weather warnings appeared.
- **A real warning** on an earlier test trip (05–07):
  - an amber "1 warning" chip;
  - the card "Traffic may make you late for Laboni Beach: usual traffic adds about 5 min, and it closes at 20:00. This is usual traffic, not live", with its source;
  - "Keep" moved it to "You kept these" and "Show again" brought it back. Both reached the server.
- **Rain, storm, wind, rough sea and after-dark warnings**, and "Move to …", are covered by tests with a fake forecast (see section 4). The real forecast had none of them this week.

## 3. Problems found and fixed while testing

1. **The phone typed the test email in Bangla letters:** your keyboard (Ridmik) was in Bangla mode. You switched it to English; nothing to change in the app.
2. **Night hours showed a sun:** fixed (a moon before sunrise and after sunset).

## 4. Commands run

- **Backend:** `pytest` gives **476 passed**, 8 skipped.
  - That includes the new `tests/test_trip_planner_step6.py` (12 tests with a fake Open-Meteo): each warning, the drier day to move to, "Keep" and undo, the 30-minute cache and the 2-minute refresh, a failed refresh showing the last copy as stale, and days beyond the forecast.
  - The full suite also ran with a guard that fails on any network call: no calls.
  - `alembic check` is clean.
- **App:** `jest` gives **281 passed** (24 suites, new `tripConditions.test.tsx`); `tsc` and `eslint` are clean.
- **Maestro on the phone:**
  - the conditions run passed;
  - **the full suite 00–99 passed in one run**, with live weather and real roads on.

## 5. Files

- **Backend:**
  - **New:** `services/conditions/` (`openmeteo.py`, `service.py`); `alembic/versions/20261019_0010_conditions.py`; `tests/test_trip_planner_step6.py`.
  - **Changed:** `models.py` (`ConditionsCache`, `ItineraryItem.kept_warnings`), `endpoints/trips.py` (conditions, keep), `trip_rules.py` (sunrise).
- **App:**
  - **New:** `app/trip/conditions/[id].tsx`; `src/features/trips/conditions/` (`ConditionChips.tsx`, `useConditionText.ts`); `__tests__/tripConditions.test.tsx`.
  - **Changed:** `trip/[id].tsx` (pill, chips, stop warnings, leg notes), `PlanRows.tsx` (leg note), `queryClient.ts` (conditions and road lines kept offline), `_layout.tsx`, types, API, en/bn strings.

## 6. Known issues and limits

- **Traffic isn't live.** It's the usual pattern for Bangladesh towns, and it's labelled so everywhere. No free live traffic source covers Bangladesh well; a paid one can be added later.
- **One forecast spot per destination:** fine for Cox's Bazar (the stops are within about 30 km); bigger destinations would need one per area.
- **Weather warnings appear only within about two weeks of the trip**, when a forecast exists.
- **Unchanged:** planned times don't include usual traffic.
- **Not checked by hand:** the Conditions screen in Bangla and at the largest font (all strings are in both languages).
- **Bad place locations** (from step 5) also affect which beach the sea is read at.

## 7. What I need from you

1. **Try it:** open a trip, tap "Updated … ago" or a chip, and look at the Conditions screen.
2. **Sign in again on your phone** (the last test signs the test account out).
3. **Approve step 6**, or tell me what to change.
4. **Step 7 (full budget and a weather-aware planner)** needs one decision from the plan: AI-written day summaries or not. My recommendation is no for now: fixed templates are clear and free.

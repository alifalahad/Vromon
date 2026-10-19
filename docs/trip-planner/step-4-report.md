# Trip Planner Step 4 Report: A New Trip Built Around the Traveller's Needs

**Date:** 2026-10-18 · **Status:** done on the phone; waiting for your approval
**Plan:** `docs/trip-planner-plan.md`, step 4 · **Mockups:** the canvas (approved) · **Screenshots:** `docs/trip-planner/step-4/`

## 1. What changed

### Planning a trip: three short steps, then the plan

The old six-step form is gone. "Build my plan" works from step 2 or 3, so someone in a hurry answers step 1 only.

1. **Where & when** (the only required step):
   - destination cards;
   - dates on a calendar (tap the first day, then the last; past days can't be picked);
   - travellers (− / +);
   - **First and last day** (optional): "Arriving Sun 25 around **14:00**", "Leaving Tue 27 by **11:00**";
   - **Getting there**: from where, and bus / train / plane / car.
2. **Your style**:
   - interests, with icons;
   - pace: Relaxed (up to 3 stops a day) / Balanced (4) / Packed (6), replacing "max activities per day";
   - budget: a total that follows Budget / Comfort / Luxury, the travellers and the days, with − / + to set it by hand. Under it, the amount per person and the hotels it buys, from the destination's real hotel prices (for example "hotels around ৳2,800–৳4,200 a night");
   - **Your day**: "Start around 09:00 · finish by 20:00", picked from a list of times (no typing).
3. **Your must-dos**:
   - **Must see**: pick places (with search). Each one is a card with a day (Any day / Day 1…) and a time (Any time / Morning / Afternoon / Sunset / Evening / an exact time), and its opening hours;
   - **Busy times**: a day, from and to (as time chips), and an optional label ("Wedding");
   - **Skip**: places to leave out, as a separate list;
   - **Avoid crowded places**: a switch;
   - **A summary line**: "3 days · 2 travellers · ৳25,000 · 2 must-sees". The days, travellers and budget can be tapped to go back to them.

**Building the plan** is a short screen, not a step:
- the route line draws itself while the server plans;
- the checks say what really happened, for example "Saved your trip" (ticked as soon as it is saved), "Placed your must-sees first", "Started day 1 after you arrive (14:00)", "Kept Mon 26 · 18:00–20:00 free";
- the plan opens with "See your plan".

**When a must-see can't fit, it's never dropped silently.** The building screen shows why, in plain words, and three choices:
- **"Go in the afternoon instead · Day 1 · 16:00"**: the nearest time that does fit (same day first, then the same time on another day, then any day);
- **Choose another time**: the day and time chips again;
- **Leave it out**.

The plan opens only after you choose. The same card shows on the trip screen if you leave a must-see unplaced.

Example (real data):
- *Himchari Hilltop Viewpoint at sunset doesn't fit: it closes at 17:00, before sunset (about 17:21).*
- Sunset is worked out from the destination's coordinates and the date (within about 2 minutes of published tables).

### On the trip screen

- **"Your preferences" is now "Your must-dos"**, with **Edit**. The edit screen changes must-sees, busy times, places to skip, and the arrival and leaving times.
- **Saving re-plans only the days that need it**, and the trip screen says which: "Day 2 was re-planned".
  - Adding a busy time on day 2 rebuilds day 2 only.
  - Moving a must-see from day 1 to day 3 rebuilds those two days.
  - Leaving one out changes nothing else.
- **Rows glide:**
  - when stops are reordered or added, the other rows glide to their new places instead of jumping;
  - the card you just dropped stays where you dropped it;
  - travel and free-time rows fade in;
  - all of this is off when "remove animations" is on.
- **Rearranging respects busy times:** a stop moved into a busy time waits until it ends. The phone's live preview and the server use the same rule.

### What the planners do (quick planner and optimiser)

1. **Day windows:**
   - day 1 starts when you arrive (no breakfast if that's after 10:30);
   - the last day ends when you leave (no lunch or dinner if you leave before them).
2. **Busy times** are blocked. A meal that falls inside one is left out (you're at the wedding).
3. **Must-sees:**
   - one with a time is placed first: at sunset it starts as late as it can, so it ends after sunset;
   - one with only a day goes on that day;
   - the rest of the day fills around them.
4. **Lunch** still follows the morning (12:00–14:30), unless a must-see or busy time sits at midday; then it takes a free slot.
5. **Pace** sets the stops a day: 3 / 4 / 6.
6. **The independent check** now also flags:
   - a stop before you arrive or after you leave;
   - a stop during a busy time;
   - a must-see that isn't on its day or at its time (all hard problems);
   - a missing must-see now says its name instead of "place ID 16".

### Data

- **Migration 0008:**
  - must-sees with a day and a time replace the plain must-visit list (old trips are converted: each becomes a must-see with no day or time);
  - adds busy times, arrival and leaving times.
  - Tested: upgrade, downgrade, upgrade again; `alembic check` is clean.
- **Old clients still work:** the API still accepts and returns `must_visit` (the ids).
- **The dev database** was backed up before migrating.

## 2. Checked on the phone (the test account e2e.ana, not your account)

### The five real requests from the plan

| Request | Result |
|---|---|
| 1. A must-see on day 1 at sunset | Inani Beach 15:00–18:00 on day 1 (sunset about 17:21) |
| 2. Arriving at 14:00 on the first day | Day 1 starts after 14:00, no breakfast; the check says "Started day 1 after you arrive (14:00)" |
| 3. Busy on day 2, 18:00–20:00 (added from the trip screen) | Day 2 re-planned: nothing from 18:00 to 20:00, so no dinner that day; days 1 and 3 unchanged (read from the database) |
| 4. A must-see that can't fit, and each of its three choices | Hilltop at sunset: the suggestion was taken (in English), "Choose another time → Afternoon" (in Bangla, placed at 14:20), and "Leave it out" (the app test and the backend test) |
| 5. Skipping steps 2 and 3 | "Build my plan now" from step 2 (the app test); step 3 skipped in the phone runs |

### The rest

- **Bangla** (screenshots 13–20): every new screen, with Bangla digits, the reason and the choices.
- **The largest font** (1.6×, screenshots 21–26):
  - everything stays usable;
  - one heading cut off "optional", fixed (the heading row now wraps).
- **Screen reader labels:** an accessibility dump of step 3. Every control has a label; two "Add" buttons also read an icon character, now fixed.
  - **Not done:** a hands-on pass with TalkBack switched on.
- **Automatic phone tests:** flow 05 is rewritten for the new trip:
  - it adds two must-sees, one of which can't fit;
  - it takes the suggestion and opens the plan.
  - The full suite result is in section 4.

## 3. Bugs found and fixed while testing

1. **The quick planner lost a long morning place.** A fixed 12:30 lunch left no room for Himchari National Park (3½ h, closes 17:00); an old test caught it. Fixed: lunch follows the morning again.
2. **A sunset must-see started too early** in the quick planner, and day 1 lost its lunch. Fixed: it starts as late as it can.
3. **Odd suggested times** ("13:27"). Fixed: times are on 5-minute steps. Screenshot 04 still shows the old time; screenshot 18 shows the fix (16:00).
4. **"Arriving 25 Sun"**: the phone writes the date the other way round. Fixed: "Sun 25".
5. **The summary line had no separators.** Fixed: "3 days · 2 travellers · …".
6. **Busy-time chips opened at 06:00**, so the chosen time was off screen. Fixed: they open at the chosen time.
7. **Large text cut off a heading.** Fixed (see above).

## 4. Commands run

- **Backend:** `pytest` gives **442 passed**, 8 skipped. That includes the new `tests/test_trip_planner_step4.py` (37 tests: both planners, the five requests, fixing what doesn't fit, rules on edits). `alembic check` is clean.
- **App:**
  - `jest` gives **274 passed** in 22 suites, including the new `newTrip.test.ts` and `newTripScreen.test.tsx`;
  - `tsc` and `eslint` are clean.
- **Maestro on the phone:**
  - the new flow 05 passed;
  - the trip-screen must-dos run (edit, add a busy time, save) passed;
  - the Bangla run passed;
  - **full suite 00–99**:
    - flows 00–07 passed in one run, including the new 05;
    - 08 failed once on its check for the 5-second "Moved … to day 2" message (the move itself reached the server and succeeded), then 08 and 99 passed on a rerun;
    - this is the same timing flake as in step 3;
    - an earlier run at 1.6× font failed at sign-in because the test typed into the wrong box when the keyboard moved the screen; it passed at normal size.

## 5. Files

- **Backend:**
  - **New:** `services/itinerary/trip_rules.py` (the shared rules, sunset, "why it doesn't fit", suggestions); `alembic/versions/20261018_0008_must_dos.py`; `tests/test_trip_planner_step4.py`.
  - **Changed:** `models.py`, `schemas.py`, `endpoints/trips.py` (create/update/duplicate, `unplaced` on generate and the itinerary, `PUT /trips/{id}/must-dos`), `itinerary_service.py`, `cpsat_scheduler.py`, `editing_service.py`, `constraint_validator.py`, `recommendation_service.py` (reason wording), `tests/test_optimizer.py` (the one test whose expected behaviour changed: a must-see that can't fit is now reported, not a 422).
- **App:**
  - **Rewritten:** `app/trip/new.tsx`.
  - **New:**
    - `app/trip/must-dos/[id].tsx`;
    - `src/features/trips/new/` (`newTrip.ts`, `RangeCalendar`, `MustDosEditor`, `BusySheet`, `PlacePickerSheet`, `UnplacedCard`, `Building`, `useMustDoText`, `icons`);
    - `src/ui/TimeSheet.tsx`;
    - `src/features/trips/plan/build.ts`, `flash.ts`.
  - **Changed:** `trip/[id].tsx`, `TripDetails.tsx`, `PlanRows.tsx` (glide), `timeline.ts` (busy times), types, API, en/bn strings.
  - **Removed:** `src/features/tripForm.ts` and its test (replaced by `newTrip.ts`).
- **Phone tests:** `.maestro/05-plan-trip.yaml` and `config.yaml`.

## 6. Known issues and limits

- **TalkBack:** labels are checked, but a hands-on pass with TalkBack on is still to do.
- **Times are estimates:**
  - sunset is computed, not live;
  - travel times are straight-line estimates (step 5 brings roads);
  - a sunset must-see is placed by the time, not the weather.
- **Getting there:** the origin and mode are saved but not yet used for a first leg or its cost (step 5).
- **No photos:** destinations and places still have no photos in the database, so the cards use drawings and icons.
- **Avoid crowds** can't be changed from the trip screen's edit; "Quieter" in the menu does that job.

## 7. What I need from you

1. **Try it on your phone:**
   - plan a trip with a must-see at sunset, an arrival time and a busy time;
   - try "Edit" under "Your must-dos" on the trip screen.
2. **Sign in again:** the phone ends signed out (the last phone test signs the test account out).
3. **Font size:** set it back to normal if you haven't.
4. **Approve step 4**, or tell me what to change. Step 5 (real roads and travel times) needs one decision from you: OpenRouteService now, or self-hosted OSRM.

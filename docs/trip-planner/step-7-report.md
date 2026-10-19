# Trip Planner Step 7 Report: Full Budget and a Weather-Aware Planner

**Date:** 2026-10-19 · **Status:** built; checked on the phone; waiting for your approval
**Plan:** `docs/trip-planner-plan.md`, step 7 · **Design:** the "Budget" mockup from step 1 · **Screenshots:** `docs/trip-planner/step-7/`
**Decision taken (decision 4, AI-written day summaries):** no, as recommended. Each day's line comes from a fixed template in English and Bangla. It's free, and the same plan always reads the same way. An AI version can be added later.

## 1. What changed

### The budget screen (from the trip screen's budget meter, or ⋯ → Budget)

- **The total against your budget:** "≈ ৳24,060 of ৳25,000", a bar split by part, and one line:
  - "৳6,340 left. Prices with ≈ are estimates." (green);
  - "Only ৳940 left." when within 10% of the budget (amber);
  - "৳3,000 left, but the estimates could reach ৳26,100." when the high end of the estimates would go over (amber);
  - "৳2,000 over your budget. See the ways to save below." (red).
  - Under it, the range: "Likely ৳23,000 to ৳25,600".
- **Each part, with where it comes from:**

  | Part | How it's worked out | Marked |
  |---|---|---|
  | Getting there | Both ways by your way of travel ("Bus, Dhaka ⇄ Cox's Bazar, 2 seats"); a car is paid once for the group | ≈ estimate |
  | Stay | Your hotel × nights × rooms ("Sea Crown Hotel · 2 nights × ৳3,500") | from data |
  | Food | The plan's meals × travellers | ≈ only when some meals have no restaurant price |
  | Tickets | Entry and activities × travellers ("· 2 stops are free") | from data |
  | Local travel | Every ride of the plan, from and back to the hotel included, by its mode; fare × the vehicles needed (a CNG takes 3, a rickshaw 2) | ≈ estimate |

  - A part without data says "Not known" (for example, getting there when the trip has no starting city). It isn't guessed or counted.
- **By day:** a bar for each day (food, tickets and local travel; getting there and the stay are counted once).
- **Ways to save** that apply to this plan, biggest first, each with "Apply" and then "Undo" in the bar at the bottom:
  - **a cheaper hotel:** the cheapest one rated 3.5 or more ("Coral Reef Guest House instead of Sea Crown Hotel · Rated 3.7 (now 4.2)"). The saving is net: a hotel further away costs more in rides, and that is taken off;
  - **skip the priciest stop:** never a must-see or a stop you pinned;
  - **rickshaw instead of CNG** on the short rides (3 km or less) that the app chose, not the ones you chose ("About 12 min slower in all · Save about ৳300").
  - **Undo puts everything back exactly:** the hotel, the stop in its place, and the travel modes with every stop's time.
- **A friend's trip** shows the budget without "Apply".
- **The trip screen's budget meter** turns amber before the plan goes over (within 10%, or when the estimates could take it over) and red when it's over. Its total now includes getting there and local travel.

### A weather-aware planner

- **Rainy hours:** when the forecast covers the trip (about two weeks ahead), the planner keeps outdoor stops (beaches, nature, views, boats, islands) out of the hours with storms or a 60%+ chance of rain.
  - Indoor stops (temples, the aquarium, markets) take those hours, marked "Indoors while rain is likely".
  - Outdoor stops move to the dry hours.
  - If nothing else fits, an outdoor stop still goes in, and the step 6 warning with "Move to …" appears on it.
- **Sunset for photography:** when you picked Photography, each day gets the best view or beach at sunset ("Here at sunset (about 17:18), for your photos").
  - Not on a day where a must-see is already at sunset, or when rain is likely at sunset.
  - These aren't must-sees, so the day can still drop one if something you asked for needs the time.
- **What never moves:** must-sees with a day or time, and pinned stops. The weather only changes the rest.
- **Where it applies:** building a plan, rebuilding it, and re-planning a day (including after changing your must-dos).
- **Both planners follow it:**
  - the optimiser (CP-SAT, which the app tries first) gives an outdoor visit in a rainy hour a large penalty, and a view or beach at sunset a bonus (at most one a day);
  - the quick planner (the fallback) does the same with its own rules.
- **The forecast never blocks planning:** it uses the cached forecast (30 min); if Open-Meteo is down, planning goes on without it.

### The day in a line

- Under the day tabs: "Beach morning, views afternoon, sunset at Inani Beach", or "A free day". In Bangla: "সকালে সৈকত, Inani Beach-এ সূর্যাস্ত".
- A place whose name already says it ("Sunset Boat Ride") isn't given "sunset at" again.
- The server works out the parts (morning, afternoon, evening, and the stop at sunset), and the app puts them into words.

### How it's built

- **Backend:**
  - the new `services/budget/service.py` (the parts, the ranges, the days, the ways to save, applying and undoing);
  - `GET /trips/{id}/budget` keeps every older field and adds `parts`, `total`, `low`, `high`, `left`, `status`, `by_day` and `saves`;
  - `POST /trips/{id}/budget/save` with `{action}` applies a way to save (or an `undo`) and returns the new budget, the changed days and the undo;
  - `conditions/service.py` gives the planner its rainy hours (`planning_weather`);
  - `itinerary_service.py` adds the rain rule, the sunset stops, the chosen hotel and `day_summary`;
  - `cpsat_scheduler.py` adds the rain penalty and the sunset bonus.
- **Data:** migration 0011 adds `trip_preferences.hotel_id` (the hotel you chose). Tested upgrade, downgrade and upgrade on a copy of the dev database; `alembic check` is clean, and the dev database is upgraded.
- **Setting:** `WEATHER_PLANNING` (on by default; tests turn it off and use a fake forecast).
- **App:**
  - the budget screen rewritten from the mockup (`app/trip/budget/[id].tsx`); the old budget panel is removed;
  - `plan/daySummary.ts`;
  - the meter colours;
  - types, API, and the strings in English and Bangla (Bangla digits too).

## 2. Checked on the phone (the test account e2e.ana, not your account)

A new trip, Dhaka to Cox's Bazar by bus, 26–28 Oct, 2 travellers, Photography (screenshots 01–05):

- **The day line (01):** "Beach morning, photo afternoon, Sunset Boat Ride". The boat ride runs 17:00–19:00 around the 17:19 sunset.
- **Day 2:** Marine Drive at sunset.
- **Day 3:** the live forecast had rain likely at 17:00–19:00, so there was no sunset stop that day. The temple (indoors) took that time, with "Indoors while rain is likely".
- **The budget (02):**
  - "≈ ৳25,570 of ৳25,000" and, in red, "৳570 over your budget. See the ways to save below.";
  - getting there "≈ ৳4,600 · Bus, Dhaka ⇄ Cox's Bazar, 2 seats";
  - the stay ৳7,000, food ৳8,540, tickets ৳1,900 ("5 stops are free") and local travel ≈ ৳3,530;
  - "Likely ৳24,170 to ৳27,780".
- **By day and the ways to save (03):** "Coral Reef Guest House instead of Sea Crown Hotel · Rated 3.7 (now 4.2) · Save ৳5,080" (net of ৳320 more in rides), and "Skip Sunset Boat Ride · Day 1 · Save ৳1,000".
- **Apply (04):** "Staying at Coral Reef Guest House." with Undo; the hotel saving left the list.
- **Undo (05):** "Changed back."; the stay is back to Sea Crown, and the hotel saving is offered again.
- **The trip screen's meter** is red at ৳25,570 / ৳25,000.
- **Maestro:** every flow 00–99 passed on the phone, but not in one run:
  - **flow 04:** the second test account's sign-in token had expired; I renewed it;
  - **flow 06:** it looked for the old "Budget breakdown" heading; it now checks the new budget screen;
  - **flow 08:** twice, the 5-second "Moved …" / "Added …" message was gone before Maestro looked (a tap takes Maestro 6–12 s on this phone with the map open). The flow now checks the result instead: the day's line ("6 stops · …") changes after the move and after the add. A `day-stats` test ID was added for this.

## 3. Problems found and fixed while building

1. **On the phone, the first plan had no sunset stop.** I had assumed the app uses the quick planner, but it tries the optimiser (CP-SAT) first, which didn't know about the weather or sunsets yet. Both planners now follow the same rules, and the tests run each rule against both.
2. **The hotel saving ignored the rides:** the cheaper hotel was further out, so local travel went up by ৳320. The saving shown is now net.
3. **The by-day dates read "26 Mon":** they now match the day tabs ("Mon 26").
4. **"sunset at Sunset Boat Ride":** now just "Sunset Boat Ride".
5. **"CNG and Rickshaw":** mode names in the middle of a sentence are now lower case ("CNG and rickshaw").
6. **The trip's total budget can't be changed after the trip is made** (the PATCH endpoint has no field for it). Not changed in this step; the tests set it directly. Say if you want an "edit budget" option; it fits step 8.

## 4. Commands run

- **Backend:** `pytest` gives **510 passed**, 8 skipped.
  - The new `tests/test_trip_planner_step7.py` has 33 tests with a fake forecast and fake roads (the planner tests run against both planners):
    - a rainy morning goes indoors, with outdoor stops moved to the dry afternoon;
    - rain all day still gives a day;
    - a must-see's time never moves for rain;
    - re-planning a day follows the rain;
    - no forecast calls when planning by weather is off or the trip is beyond the forecast;
    - a forecast outage doesn't stop planning;
    - sunset stops (and not without Photography, not over a must-see at sunset, not in rain);
    - every budget part and its range;
    - a car paid once;
    - the vehicle count;
    - the warning levels;
    - each way to save applied and undone (exact times back);
    - pinned stops never offered;
    - bad actions change nothing;
    - the chosen hotel used everywhere;
    - the day summary.
  - Two older budget tests were updated: local travel is now counted, so the total includes it.
  - The full suite also ran with a guard that fails on any network call: no calls.
- **App:** `jest` gives **291 passed** (25 suites, new `tripBudget.test.tsx`: the parts, over budget and unknown parts, apply and undo, a friend's read-only view, Bangla, and the day summary). `tsc` and `eslint` are clean.

## 5. Files

- **Backend:**
  - **New:** `services/budget/`; `alembic/versions/20261019_0011_chosen_hotel.py`; `tests/test_trip_planner_step7.py`.
  - **Changed:** `endpoints/trips.py`, `itinerary_service.py`, `editing_service.py`, `conditions/service.py`, `trip_rules.py` (`Placement.note`), `models.py`, `schemas.py`, `config.py`, `tests/conftest.py`, two older tests, and the step 6 test's fake forecast.
- **App:**
  - **New:** `src/features/trips/plan/daySummary.ts`; `__tests__/tripBudget.test.tsx`.
  - **Rewritten:** `app/trip/budget/[id].tsx`.
  - **Removed:** `src/components/BudgetPanel.tsx`.
  - **Changed:** `app/trip/[id].tsx` (meter, day line, `day-stats` test ID), types, API, en/bn strings.
  - **Maestro:** `06-trip-screen.yaml` (the new budget screen), `08-rearrange.yaml` (checks the day's line, not the brief messages).

## 6. Known issues and limits

- **Getting there and local fares are estimates:** typical fares, bargained in real life, with no timetables. They're marked ≈ with a range.
- **Getting there assumes the same way back.**
- **The rain rule only applies within the forecast** (about two weeks). A trip planned further ahead is planned without weather; re-planning a day closer to the date uses it.
- **Hotel prices are from the seed data**, not live rates.
- **Not checked by hand:** the budget screen at the largest font, and with TalkBack.

## 7. What I need from you

1. **Try it:** open a trip, tap the budget meter, and try a "way to save" and Undo.
2. **Sign in again on your phone:** the last test signed the test account out.
3. **Approve step 7**, or tell me what to change.
4. **Step 8 (Trips tab)** needs no decision from the plan.

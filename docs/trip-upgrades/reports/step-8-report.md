# Step 8 report: hardening, the full check, and the friends' APK

**Date:** 2026-11-13. **Status:** done. Steps 1–7 were checked together on the phone, as test account A, on a release build of the dev app, in English and Bangla and with the largest text. Nine bugs were found and fixed (below). The 11 backend tests that failed in GitHub CI (three causes) are fixed. The friends' APK is rebuilt. All test suites pass, and the whole Maestro suite passes on the phone (17 flows, the three new ones included).

## What changed

**Backend**

| Where | Change |
|---|---|
| Getting there | `_getting_there` (trips.py) takes the journey's option for the trip's own way wherever it is in the list. With "by budget" on (the default when no way is chosen), the journey puts its recommendation first, a car for trip 123. The trip goes by bus, so the plan and its budget fell back to the rough bus estimate (৳550 a person) while the journey showed its bus fare (৳595). A hired car (every priced leg per vehicle) stays priced per vehicle. |
| AI budget | The facts now say which way the plan uses (`way_there_in_plan`, `in_plan` on each way) and what the food you bring costs (`meals_in_plan.own_total`). It had priced the recommended car (৳11,400) for a trip by bus, and called the packed lunch free. |
| Budget | The food part lists `own_total`: what own food costs the group, as counted. A day can set its own amount (৳150 on trip 123's day 2) while the trip has none, so the trip's amount alone didn't say what was counted. |
| Search | A copy of a stop the trip already has isn't offered. The trip's places seed the duplicate check (`place_search._in_trip`). "Divisional Museum" (places index, 3 m away) was offered as "not checked" on a day with Vromon's "Divisional Museum, Khulna". |
| The day's line | `day_summary` names Vromon's places only. A part of the day with only your own stops (a pin, a place from search) says `own`: "personal evening", "সন্ধ্যায় নিজের পরিকল্পনা". It said "other evening", and "সন্ধ্যায় other" in Bangla. |
| GitHub CI 1 | `friends.cancel_pending_between` runs one statement per direction. SQLite 3.45–3.46 (Ubuntu 24.04, GitHub's runners) fails with "internal query planner error" on `status = ? AND (a→b OR b→a)` next to the partial index `uq_friend_requests_pending`. Blocking a friend failed there; 8 tests failed in CI. The Mac's SQLite (3.42) is older. |
| GitHub CI 2 | `RoadNetwork` stored "never failed" as `0.0` on the monotonic clock, which counts from boot. So for 5 minutes after a machine started, no road data was asked for: a fresh CI runner, or a server just restarted. Now `None`. |
| GitHub CI 3 | "How to get there" rounded the exact minutes, while the plan row rounds the stored value (0.1 min) halves up. A 3.46-minute leg was 3 min in the sheet and 4 in the plan; which leg hits that depends on the plan CP-SAT finds, which differs between machines. `modes.shown_minutes` rounds as the plan does. |

**App**

| Where | Change |
|---|---|
| Meal titles | A restaurant meal's title is in the traveller's language: "সকালের নাস্তা · KFC", not "Breakfast · KFC". This covers the plan rows, Today ("দুপুরের খাবার · KFC-এ ১৩:১২-এর জন্য") and the map home's dock. |
| Categories | A Vromon place's category is in the traveller's language, as the interests name it: "পরিবার", not "Family". |
| The plan's time column | Shrinks to fit one line; with Bangla digits at 1.6× it wrapped as "০৯:০" / "০". |
| Choices (`SegmentedControl`) | Each label shrinks to fit one line. At 1.6× "থাকার জায়গায়" was cut to "থাকার …"; allowing two lines then broke "Restaur-ant". |
| Strings | `daySummary.what.own` in English ("personal") and Bangla ("নিজের পরিকল্পনা"). |
| Timing | The add-stop search logs its time in builds made with `EXPO_PUBLIC_PERF_LOG=1` (nothing otherwise). |

**Maestro**
- New: `13-stay-and-meals.yaml`, `14-search-anything.yaml`, `15-rate-trip.yaml`, added to `flowsOrder` by name.
- Old flows that had broken since 11–12 Nov were fixed (section 5): the removed Settings tab, the new catalogue, and lost tab taps.

**Files:**
- Backend: `app/api/v1/endpoints/trips.py`, `app/services/{budget/ai,budget/service,friends,place_search}.py`, `app/services/itinerary/{editing_service,itinerary_service}.py`, `app/services/routing/{modes,roads}.py`. Tests: `test_ai_budget.py`, `test_meals.py`, `test_place_search.py`, `test_trip_planner_step5.py`, `test_trip_planner_step7.py`.
- App: `app/trip/today/[id].tsx`, `src/features/map/Dock.tsx`, `src/features/trips/plan/{AddStopSheet,PlanRows}.tsx`, `src/ui/SegmentedControl.tsx`, `src/i18n/{en,bn}.json`. New: `src/__tests__/planRowsText.test.ts`.
- Maestro: `13-stay-and-meals.yaml`, `14-search-anything.yaml`, `15-rate-trip.yaml` (new); `01-tabs.yaml`, `04-friend-by-code.yaml`, `05-plan-trip.yaml`, `06-trip-screen.yaml`, `07-friend-trip.yaml`, `subflows/sign-out.yaml`, `scripts/room-invite.js` (flow 12), `config.yaml`.
- Docs: `docs/architecture.md` ("Hardening"; the budget line), `docs/feature-inventory.md` ("Trip upgrades"), `data-platform/README.md` (the index's size).

## How it was checked

### The test suites

| Suite | Result |
|---|---|
| Backend `venv/bin/python -m pytest -q` (Mac, SQLite) | **825 passed, 9 skipped** (the 9 need PostgreSQL) |
| Backend as GitHub CI runs it: Linux (python:3.11, SQLite 3.46.1), PostgreSQL 16 for the migration tests | before the fixes **11 failed**, 813 passed, 4 skipped; after the three CI fixes **826 passed, 4 skipped**. This run came before the later step-8 fixes; you'll see the whole suite on GitHub after the push. |
| App: `npm run typecheck` (without the git-ignored route types), `npx eslint . --max-warnings 0`, `npm test -- --ci` | typecheck clean, eslint clean, **65 suites, 657 tests pass** |
| Data platform `pytest` | **62 passed** |
| Maestro, the whole suite on the phone | **17 of 17 passed**: 00–05 in the final full run; it stopped at 06, which was fixed, and 06–15 and 99 then passed in one continuation run (11 of 11, 22 min) |

**Why CI failed.** `gh` isn't installed here, and GitHub shows job logs only to admins. So I ran the CI job in a Linux container with the same images: Python 3.11 and `pgvector/pgvector:0.8.0-pg16`. That reproduced 11 failures:
- 8 blocking tests: the SQLite planner error;
- the step-6 road test: the boot clock;
- one CP-SAT test: the rounding.

The earlier run on GitHub (commit `f0ac797`, before steps 1–7) had failed in the backend too. The blocking failure is older than this work.

### 1. Together: one trip that uses everything (trip 123, Khulna, 13–16 Nov, account A)

Trip 123 has:
- hotel nights 1–2 (Hotel Royal International, ৳2,800);
- night 3 at "Uncle's house";
- a packed lunch on day 2 (৳150 a person, that day's own amount);
- breakfast and dinner where you stay on day 3;
- a college found with search (Govt. B.L College);
- a pin ("Cousin's office");
- a review: 4 stars, 4 things rated, 2 with comments.

Trip 121 (Khulna, 4–7 Dec) has the stay advisor's card, since the advisor only looks at nights that haven't started.

| What | Before the fixes | After |
|---|---|---|
| Getting there: plan, budget, journey, review | budget bus ৳550 a person (rough estimate), journey's bus ৳595, AI budget car ৳11,400 | bus ৳595 a person, ৳2,380 for 2 both ways, in the plan, the budget and the AI budget ("based on the provided bus fare"); the review says "Dhaka → Khulna · Bus" |
| Stay | ৳5,600 everywhere | the same; night 3 "Uncle's house", no cost |
| Food | budget ৳5,700 (9 restaurant meals ৳300 each and the ৳150 lunch, × 2); the AI budget called own food free | the AI budget includes it ("a small amount for self-prepared food") |
| Local travel | ৳11,220 (15 CNG legs) in the budget and the AI budget | the same |
| Total | plan header ৳24,720 | ৳24,900 (the way there is ৳180 more); the plan header, the budget screen and the API agree |
| Day 3 on the plan | "Tonight: Uncle's house", breakfast where you stay "No cost", the morning from the hotel of night 2 (1 h 40 min), 3 h 26 min of travel, as the API says | |
| The map | the day's road line and pins, with the hotel | |
| Today | "Day 1 of 4"; at the dolphin sanctuary; leave by 12:00 for lunch at KFC at 13:12, CNG about 1 h 10 min | see "Left open": the plan has lunch "on the way" |
| Stay advisor (trip 121) | "Sleep at Hotel Ambassador for nights 1–3? ৳1,400 a night instead of ৳2,800. Saves ৳4,200 and 8 min on the road"; **Switch** took the total from ৳25,170 to ৳20,970, exactly ৳4,200 | a new warning appeared: day 1 now ends back at the hotel at 20:10 (see "Left open") |

The AI budget answered in 20 s in English and in Bangla, with Bangla digits. Its first try today failed on Gemini's side (504).

### 2. Bangla (release build, at 1.6×, the hardest case for cut-off text)

Walked: the trip screen and plan rows, the day's line, the stays sheet, the meals sheet, a "not checked" stop, the add-stop search, the rating screen, the budget, Today and the map home.
- **Fixed:** "Breakfast · KFC", "Lunch · KFC" in Today, "Family", "সন্ধ্যায় other", the wrapped times and the cut meal choice.
- **Shown in Bangla:** everything else, with Bangla digits and distances ("০.৩ কিমি").
- **Left in English, as before:** names from the data (hotels, "Dhaka", "Khulna", a restaurant's cuisine "fast food restaurant") and the planner's warnings (see "Left open").

### 3. Large text (font scale 1.6, then back to 1.0)

- **Bangla:** the same screens; long hotel names end in "…" in one-line rows, as designed.
- **English:** the rating screen, the meals sheet ("Restaurant · My own · Where I stay" on one line) and the plan.
- The capsule on the map home ends in "…" at 1.6× (one line, as before).

### 4. Release build of the dev app

`./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a`, installed over the debug build.
- **Opened trip 123 ten times:** the plan sheet was drawn every time. Each screenshot was checked; none blank.
- **The trip screen** opens in 73 ms from the saved copy.
- **Sheets:**
  - the stays sheet and the meals sheet (day 1, day 2);
  - a stop's sheet;
  - the add-stop sheet;
  - the stay advisor, with Switch (trip 121);
  - the rating screen;
  - the budget;
  - Today.
- **Searched and added a stop:** "1971: Genocide-Torture Archive & Museum" became stop 8 with "Not checked", its leg by CNG (৳160), and a warning that it ends after the day's end. It was then removed again over the API.
- **Search on the phone:**
  - 34 searches, timed by the app (build with `EXPO_PUBLIC_PERF_LOG=1`), over USB to the Mac's backend: typically 90–150 ms, up to 390 ms, one at 787 ms.
  - That comes after the 300 ms pause in typing.
  - Addresses (the external geocoder) come separately, after 700 ms more, only when places found little.

**A build gotcha:** Gradle's bundle task doesn't watch the JSON translation files. A build after changing only `en.json`/`bn.json` said UP-TO-DATE and kept the old strings. Deleting `android/app/build/generated/assets/react/release` (and `res/react/release`, `intermediates/sourcemaps/react/release`) makes it bundle again.

### 5. Maestro

The whole suite ran on the phone against the release build (`-e DEV_CLIENT=false`), as test account A, with B as the friend over the API.

**Fixes found by running it.** Three flows had been broken since the catalogue and the map tab changed on 11–12 Nov. A flow that fails stops the suite, so they were broken before step 8.

| Flow | What failed | Fix |
|---|---|---|
| 00 / 01 / 99 | the Settings tab is gone (commit `ccc64d2`: the profile button opens Settings) | `01-tabs.yaml` checks the Explore tab and opens Settings from the profile button; `subflows/sign-out.yaml` too |
| 04, 07 | a tap on Friends while the Trips tab was still settling was lost | wait for each tab; tap Friends again if it didn't open |
| 05 | the "Hilltop" viewpoint isn't in the catalogue any more, and every Cox's Bazar place now closes by 17:00 (Inani Beach too) | Inani Beach on day 1, and Himchari at sunset as the must-see that can't fit; if the first fix leaves Inani needing its own ("Go in the morning instead"), take it too |
| 12 | the room script picked places by old ids (17, 24, …), now gone; the plan says "Dulhazra", not "Dulahazara" | it picks a word whose place isn't in the plan yet (Dulhazra, Ramkot, Adinath, Sonadia, Ajgobi) |
| 14 (new) | waited for "Put a pin", which is below the suggestions | waits for the search box |

**Before the final run:**
- **Pass:** flows 00–04 and 06–11, and the new flows 13 (stays and meals) and 15 (rating).
- **Fixed, then passed alone:** 12 and 14.
- **Fixed again:** 05.

Leftover trips from the failed runs were deleted: A's 124 and 125, and B's room trip 124. A flow that passes deletes its own trip, except 05, which never did.

**The final run:**

| Run | Flows | Result |
|---|---|---|
| The whole suite | 00 Sign in, 01 Tabs, 02 Mark Bangladesh, 03 Rustic theme, 04 Add a friend, 05 Must-sees | passed |
| | 06 Open a trip, build its plan, look at a stop and the menu | failed: no stop card on screen |
| Fix | 06 opens the first trip in the list, now trip 122. The earlier runs of 06 and 08 had added stops to it, so a "Needs attention" box and "Getting there" pushed the stops below the screen. The flow now scrolls to the first stop, as 13–15 do. | |
| Continuation | 06, 07 Friend's trip, 08 Rearrange, 09 The whole journey, 10 Map home, 11 Chat, 12 Trip room, **13 Stays and meals**, **14 Search anything**, **15 Rate a trip**, 99 Sign out | **11 of 11 passed** (22 min) |

The flows that open "the next trip" (06, 08) rebuild or rearrange it: trip 122 on account A has been rebuilt. Trip 123 isn't touched; checked afterwards: the same days, way there and total.

### 6. Performance (a copy of the real database, 356 MB, as account A; median and p95 of 15 runs after one warm-up)

| Endpoint | Median | p95 |
|---|---|---|
| `GET /trips/123/itinerary` (4 days) | 21 ms | 22 ms |
| `GET /trips/121/itinerary` (4 days) | 13 ms | 22 ms |
| `GET /trips/123/days/{day}/route` | 9 ms | 10 ms |
| `GET /trips/121/stay-suggestions` | 9 ms | 9 ms |
| `GET /trips/123/stay-suggestions` | 10 ms | 13 ms |
| `GET /trips/123/budget` | 23 ms | 27 ms |
| search "college" / "hospital" / "museum" / "mosque" / "কলেজ" (places) | 13–17 ms | 16–24 ms |
| search "bl college" / "kfc" | 37–38 ms | 41–73 ms |
| search "zzqx" (nothing found: did-you-mean and the wider pass) | 53 ms | 80 ms |

**The database after the places index:**
- 356 MB in all;
- `poi_index`: 179,490 rows, 44 MB, plus 32 MB for its five indexes;
- `route_cache`: 19 MB;
- the data platform's `source_claims`: 60 MB.

Step 6 measured search in Dhaka, the biggest city: p95 387 ms.

### 7. Docs

- **`docs/architecture.md`:** "Hardening (docs/trip-upgrades, step 8)", and the budget line updated. Steps 1–7 already had their sections: stays, meals, the advisor, search and private stops, rating.
- **`docs/feature-inventory.md`:** "Trip upgrades (steps 1–8)".
- **`data-platform/README.md`:** the places index's size. The `overture_pois` connector section was written in step 5.

### 8. The friends' APK

- **The previous APK** is kept as `scripts/share/apk/vromon-2026-11-12.apk.bak`; the older `.bak` files are still there.
- **Built** with the commands in `docs/sharing-with-friends.md`:
  - a clean prebuild with `APP_VARIANT=preview`;
  - `assembleRelease` for arm64-v8a and armeabi-v7a (18.5 min);
  - a prebuild back to the dev app.
- **The new `scripts/share/apk/vromon.apk`:**
  - 108 MB, package `com.vromon.app.preview`;
  - its bundle has step 8's strings ("নিজের পরিকল্পনা", "personal").
- **The share** (`scripts/share/start.sh`) was not running. It was started with today's backend code: port 8002, a new tunnel, the address published to the config file the app reads. The API answered `/health` through the tunnel, and the APK link answered.
- **On your phone:**
  - **Installed** over the old friends' app; its data stays.
  - **Signed in:** the app was signed out, since your sessions ended when the dev app went to test account A. So I signed in as test account A.
  - **Checked through the share:**
    - trip 123 opens: ৳24,900 of ৳40,000; "Nature morning, culture afternoon, personal evening"; "Tonight: Hotel Royal International Ltd.";
    - the plan sheet is drawn;
    - "Add a stop" search works: "museum" gives the archive museum, Khulna Heritage Museum and others as "not checked", without the copy of "Divisional Museum".
  - **Nothing was added.** I then signed test account A out of the friends' app, as I had found it.

## Bugs found in step 8 (fixed)

1. The way there was priced two ways: the rough estimate in the plan and budget, the journey's fare in the journey.
2. The AI budget priced a car for a trip by bus.
3. The AI budget called a day's packed lunch free.
4. Search offered a copy of a stop the trip already had.
5. The day's line said "other" (in both languages).
6. Meal titles and categories in English in the Bangla app (the plan, Today, the dock).
7. The plan's times wrapped with Bangla digits at 1.6×.
8. A meal choice was cut at 1.6×.
9. The three CI failures: the SQLite planner error, the boot clock, and the rounding of minutes.

Also fixed:
- Maestro flows 01 and the sign-out subflow used the removed Settings tab.
- Flows 05 and 12 used places the new catalogue doesn't have.
- Flows 04 and 07 lost a tab tap.

## Left open

1. **A meal "on the way" and Today mode.** The planner puts a restaurant meal between two far-apart stops right when the first ends: "Lunch at KFC 13:12" when the sanctuary visit ends at 13:12, with KFC 40 min away near the next stop. The day's length is right; the meal's time isn't. Today then says "leave by 12:00, 1 h 12 min before the visit ends", on purpose (trip planner step 9). The fix is to time such meals after the ride in all three planners (quick, CP-SAT, edits). It's bigger than hardening. Your call whether to do it next.
2. **The stay advisor and the end of the day.** Switching trip 121 to Hotel Ambassador saved ৳4,200 and 8 min in all, but day 1 now ends back at the hotel at 20:10, 10 min after the day's end. "Re-plan this day" is offered. Should the advisor leave out a switch that makes a day end late, or say so on the card (D4)?
3. **The planner's warnings are English in the Bangla app.** All 16 kinds ("Day 1: back where you stay at 20:10, after your day ends at 20:00") are sentences from the server. This predates the trip upgrades; only "back where you stay" is new. The fix is to send each warning's details and write the sentences in both languages.
4. **Must-sees with the new catalogue.**
   - Every Cox's Bazar place in the catalogue of 11 Nov is open 09:00–17:00, beaches included. So no must-see there can be "at sunset".
   - After fixing one must-see, another can show "doesn't fit: There's no room left in the plan" next to a suggestion that fits ("Go in the morning instead · Day 1 · 10:40"). The suggestion works, but the reason reads wrong.
   - The hours look like defaults from the data platform and are worth checking at the source.
5. **Places index data.** Some names have stray quotes from Overture (`জিন্নাহ পাড়া কলেজ রোড "" খুলনা ""`). A search for "museum" also shows a school and a fish fair that Overture files as museums. The connector could tidy names; the kinds come from Overture.
6. **Test data on account A:**
   - trip 121 now sleeps at Hotel Ambassador (Switch on the phone); its day 4 has 7 stops from step 6's search tests;
   - trips 122 and 123 (Khulna, this week) are there for rating and Today.
   Delete them whenever you like.
7. **The phone.** - The dev app is the debug build again (it needs Metro), signed out by Maestro's flow 99.
- The friends' app is the new APK, signed out.
- Font scale 1.0, the app in English.
- Sign in with your own account in either app when you like.
- The share is running from this session; it stops when the session ends. Start it again with `scripts/share/start.sh`.

## Git commands for the owner

Nothing from step 8 is committed. GitHub CI runs on the push to `main`:

```bash
cd ~/Codes/Vromon
git status
git add -A
git commit -m "Trip upgrades step 8: hardening - the way there and own food agree everywhere, search skips copies of your stops, Bangla and large text fixes, CI fixes (SQLite planner bug, boot clock, leg minutes), Maestro 13-15"
git push origin main
```

Then GitHub → Actions → the "CI" run for this commit: `backend` (pytest, PostgreSQL for the migrations) and `mobile` (typecheck, eslint, jest).

# Map Home Redesign: Steps 3–11 Report

**Date:** 2026-10-26
**Plan:** [../map-home-redesign-plan.md](../map-home-redesign-plan.md)
**Asked for:** "complete the full .md file, all steps, and every check yourself"
**Phone check:** realme RMX2170, signed in to your account, read-only (see "How it was checked"). Screenshots are in [step-3-11/](step-3-11/).

## How it was checked

- **Phone, your account, nothing written.** I opened screens, sheets and pickers, and cancelled or closed before anything saved. The backend log shows no visit, trip or late-plan writes.
  - Synced settings I changed I set back the same minute: Light and Bangla were tested, then English and System restored.
  - Phone-only settings are also back as I found them: Countries view, Friends off.
- **Your Cox's Bazar trip is on today**, so the dock's "on a trip" state was checked live, with its real itinerary.
- **The E2E test accounts couldn't be used.** Resetting their passwords was blocked by the session's permission rules. So everything that writes or needs a second person was checked with automated tests instead:
  - marking a place by press and hold;
  - a coming trip;
  - the Want-list idea and the friend card in the dock;
  - Maestro flows 02, 03 and the new 10.

## What was built, step by step

| Step | What | Main files |
|---|---|---|
| 3 · Your story | The capsule is a button. At home zoom: "N of 8 divisions · N countries". Zoomed out: "N countries · N% of the world" from `/users/{id}/stats`. The panel from the top: every division with its status as a word (it's the legend), stat tiles from real data only (countries, trips planned with Vromon, days on the road, Want list), new places per year with a note on undated places, Replay and Share poster. **No distance tile**, because nothing sums trip distances (Step 0). | `StoryCapsule.tsx`, `StoryPanel.tsx`, `story.ts` |
| 3 · Visited vs Lived | Lived is now **40% darker** (was 20%), so it's at least 1.8:1 apart in lightness from Visited in every preset theme. A test guards it. | `mapThemes/resolve.ts` |
| 4 · The dock | One card that follows the moment: **on a trip today** (next stop, leave time, Directions, Running late, which opens Today with the late preview already open), **a trip coming up** (countdown, plan status, stops, ≈ cost from the budget), **an idea** from the Want list (a destination there; Plan a trip here; Next idea), **from your friends** (Step 9), or **a nudge**. The pure `pickDockState` is unit-tested. The backend adds each destination's **country and division** (`country_iso2`, `region_code`, migration **0014**), filled at startup from the nearest city with a known division. | `Dock.tsx`, `dockState.ts`, `useTripToday.ts`, `services/destination_places.py` |
| 5 · Layers | **Trip trails** (gentle arcs through a finished trip's stops; the stops now carry `lat`/`lon`/`region_code`), the coming trip's **dashed arc and pin**, **dots for places Vromon can plan** (tap: a sheet with places count, "not checked yet" and Plan a trip here), and a single **pulse** on Want places when the map opens. "On the map" switches in the Map sheet. | `tripGeo.ts`, `TripLayers.tsx`, `DestinationSheet.tsx`, `trip_stops.py` |
| 6 · Place sheet | Bangla name for home divisions in Bangla, "Division of Bangladesh". A 4-way Visited · Want · Lived · Clear control with a check. Your trips there (each opens). Friends who've been. "Plan a trip to …" for a division, "Plan a trip in Bangladesh" for a country. A white outline on the map for the open place. Fixed "1 cities" (plurals in EN and BN). | `PlaceSheet.tsx`, `WorldMap.tsx`, `layers.tsx` |
| 7 · Today on the map | On a trip day the map frames today's stops, clear of the capsule and dock. It draws the legs (done solid, next dotted blue, later dotted grey), numbered pins (the next with its time), and you (Today mode's own location setting; nothing new is asked). The capsule shows "Day 7 of 11 · Cox's Bazar" and opens Today. Centre on me. Leaving the trip moment flies home. | `todayGeo.ts`, `TodayLayers.tsx`, `index.tsx` |
| 8 · Press and hold | Hold any place: its name and Visited / Want / Lived (plus Clear when marked) in an arc around the finger. Tap a choice; tap elsewhere to cancel. A one-time hint. A new Maestro flow `10-map-home.yaml`. | `QuickMark.tsx`, `WorldMap.tsx` |
| 9 · Friends | **`GET /me/friends/footprints`**: accepted friends only, never anyone blocked, rate-limited. Privacy is tested for pending, blocked and removed friends. A marker per place (newest friend's initials, "+N"); tap: that place's sheet naming them. The dock's friend card ("Nadia marked Thailand" · Compare maps · Hide friends). Footprints leave the cache on unfriend or block. | `friends.py`, `friendGeo.ts`, `FriendLayers.tsx` |
| 10 · Replay and poster | **Replay** (`/map/replay`): year by year from first-visited dates, then "Undated". A big year, one line from that year's own data, play or pause, and a year slider TalkBack can adjust. **Poster:** a preview of your map (framed on home, taken with friends, location and destination dots off) and your counts, captured at 1080×1920 and shared with the system share sheet. **Save as video: not done**; there's no supported SDK 57 route without more native code. | `app/map/replay.tsx`, `Poster.tsx` |
| 11 · Polish | Light theme, Bangla, offline (below). Place fills **fade at street zoom**, so a route never sits on solid orange. Today's route shows only from city zoom. Dots and friend markers sit above labels and take taps first. | `layers.tsx` `CLOSE_UP_FADE`, `TodayLayers.tsx` |

**New native module:** `react-native-view-shot` (installed with `expo install`) for the poster. I rebuilt the dev app (Gradle, 5.5 min) and installed it over yours with `adb install -r`, which keeps your data and sign-in.

## Found and fixed on the phone

| Found | Fix |
|---|---|
| At street zoom your "Lived" country fill painted the whole screen solid orange under today's route | Fills fade from zoom 7 to 11 (`CLOSE_UP_FADE`) |
| Today's stops landed under the dock: the camera was framed while the dock was still 94 pt tall (before the trip loaded) | Refit when the dock's height settles, with the dock's height as bottom padding |
| "Home" framing hid southern Bangladesh under the dock | `bottomInset` on the map: home framing keeps clear of the dock |
| On a trip day "Your story" couldn't be opened (the capsule opened Today) | The trip day shows only at home zoom; zoomed out, the capsule is your story again |
| Replay: "Undated" broke over two lines; it said "First time in…" for undated places | Smaller word size, one line; "No date yet: Argentina and Bangladesh" |
| Poster taken at world zoom, with destination dots | Framed on home first; dots off for the picture; taller map area |
| A dot under a selected division couldn't be tapped (the selection outline sat above it) | Dots drawn on top of the stack |
| Friend markers covered division names | Lifted 24 pt above the label point |
| Today's pins cluttered the world view | Shown from zoom 7 |
| The footprints endpoint 404'd: the running backend predated it | Restarted, 200 |
| "Plan another trip to Chattogram" on the Bangladesh sheet (one arbitrary city) | Countries say "Plan a trip in Bangladesh" and open the wizard with nothing chosen |

## Phone results (screenshots in `step-3-11/`)

| Check | Result | Shot |
|---|---|---|
| On a trip: route, stops clear of capsule and dock, "Day 7 of 11 · Cox's Bazar", "1 of 6 stops done today" (it ticked over live at 08:00) | ✅ | 01 |
| Dock: "Next · 08:18 Himchari Waterfall · CNG · about 31 min · Leave now", which matches the Today screen ("Leave now 07:45, 8 min behind") | ✅ | 01 |
| Running late → Today with "Push the rest of the day back" open (not applied) | ✅ | 02 |
| Capsule at world zoom: "2 countries · 1% of the world" | ✅ | 03 |
| Your story: 8 divisions, 2 countries, 5 trips, 0 days on the road (no finished trips), 1 Want; years 2022–2026; undated note | ✅ | 04, 05 |
| Replay: 2026 "1 new place", then "Undated · No date yet: Argentina and Bangladesh" | ✅ | 06 |
| Poster preview, Share → the system share sheet with the image (closed without sending) | ✅ | 07, 08 |
| Map sheet: Show; On the map (Trails, Plannable, Friends); Theme | ✅ | 09 |
| Friends layer: a marker on Bangladesh and 3 divisions; tap → sheet "sulaiman has been here" | ✅ | 10, 11 |
| Country sheet: Lived ✓, "0 regions · 1 city visited here", your 3 trips | ✅ | 11 |
| Divisions at home, all above the dock; division sheet with outline and "Plan a trip to Sylhet" | ✅ | 12, 13 |
| Destination dot → Sreemangal sheet (14 places, not checked) → wizard with Sreemangal chosen (closed) | ✅ | 14, 15 |
| Press and hold → "Khulna" with Visited / Want / Lived, outline; cancelled | ✅ | 16 |
| Light theme: map, dock, Map sheet | ✅ | 17 |
| Bangla: "১১ দিনের ৭ নম্বর দিন", "পরের · ০৮:১৮", "এখনই রওনা দিন", Bangla digits | ✅ | 18 |
| Offline (backend stopped): map, capsule, dock, today's route; divisions, names and dots from the bundled file | ✅ | 19, 20 |

## Phone results with the test account e2e.ana (2026-10-26, after you gave its password)

**Setup.** Ana's 24 leftover test trips that were on or after today were deleted, so each dock state could be shown. Ana was given a finished three-stop trip (Dhaka → Srimangal → Sylhet, March) and dated places. Bob, her friend, got two visited places directly in the local test database (his password is different). Your account was signed out on the phone for this.

| Check | Result | Shot |
|---|---|---|
| Capsule "3 of 8 divisions · 2 countries"; nudge dock "Mark where you've been"; **trip trails** (Dhaka → Srimangal → Sylhet arc, and an older Cox's Bazar trip) | ✅ | 21 |
| Divisions: Lived (Dhaka) clearly darker than Visited (Sylhet, Chattogram) | ✅ | 22 |
| **Press and hold → Want** on Khulna: saved (`PUT /me/visits` 200), Khulna shaded, dock switched to "From your Want list · Khulna · Plan a trip here" | ✅ | 23 |
| Second wish (Barishal): newest first ("Kuakata · Barishal"), page dots, **Next idea** → Khulna; **Plan a trip here** → wizard with Khulna chosen | ✅ | 24, 25 |
| **Theme from the Map sheet** (Rustic → Default): applied at once, sheet stayed open | ✅ | — |
| **Friends layer** on: Bob's marker; dock "From your friends · Bob (E2E) marked Chattogram" → **Compare maps** opens; **Hide friends** turns the layer off and the Want card returns | ✅ | 26, 27 |
| **Trip coming up** (created for 1–3 Nov): "Your next trip · Cox's Bazar Trip · Sun 1 – Tue 3 Nov", countdown **6 days**, Plan ready · 10 stops · ≈ ৳21,870, dashed arc and pin above the dock; **Open trip** opens it | ✅ | 28 |
| Division sheet (Sylhet): Visited ✓, **Your trips here** (the March trip), "Plan another trip to Sylhet" | ✅ | 29 |
| **Press and hold → Clear** on a marked place: the current choice is ringed, Clear removes it (`DELETE` 204) | ✅ | 30 |
| **Replay with dated places:** "2022 · First time in Dhaka · 1 of 8 divisions" → "2026 · First time in Sylhet, and 2 more · 3 of 8" | ✅ | 31, 32 |
| Your story: status words (Lived, Visited, Want to visit dashed), 11 days on the road, year bars | ✅ | 33 |
| **Maestro** 01 tabs, 02 mark Bangladesh, 03 Rustic theme, 10 map home (story, Divisions, press and hold → Want) | ✅ all 4 passed | — |

**Found and fixed during these checks:**

| Found | Fix |
|---|---|
| **Building a plan failed with "database is locked"** (an existing bug, on SQLite only): the weather cache saved through a second session while the plan's own write was open. It only showed when the cached weather had expired. | Skip the cache save on a lock and use the fresh forecast (`conditions/service.py`); regression test `test_a_locked_cache_save_still_returns_fresh_conditions` |
| The coming trip's pin sat under the dock (the map was framed while the dock was smaller) | Home framing follows the dock's height until you move the map yourself (tab re-tap and the home button reset that) |
| Replay text was white on a light map theme, and Replay showed Countries while counting divisions | Text on a glass card; Replay uses Divisions when the home country has them |
| Maestro's launch link opened the wrong app: both the dev and Preview apps handle `exp+vromon://` | Ran a scratch copy whose launch step brings the running dev app forward (as `docs/sharing-with-friends.md` describes for the Preview app). The flows themselves are unchanged. |

**Note:** the app treats lists as fresh for 5 minutes, so a trip created outside the app (as here, through the API) shows on the map after that or on the next Trips visit. Trips created in the app refresh at once.

## Tests

- **Final run (after the test-account checks):** typecheck and lint clean · Jest **391/391** · pytest **558 passed, 9 skipped** (PostgreSQL variants).
- **Mobile (Jest):**
  - New suites: `story`, `storyPanel`, `storyCapsule`, `dock`, `dockCard`, `tripGeo`, `todayGeo`, `placeSheet`, `quickMark`, `friendGeo`, `mapSheet`, `mapHome`, `homeRegions`.
  - New theme lightness test in `mapThemes`.
  - New contrast checks for glass and `accentStrong`.
- **Backend (pytest):** `test_destination_places.py` (nearest-city division, API fields), stop coordinates in `test_trips_phase7.py`, `TestFootprints` in `test_friends.py` (who, newest first, wishes excluded, pending, blocked, removed, bad place type), migration 0013.
- **Flaky under load:** `today.test.tsx` and `navigation.test.tsx` time out now and then when the full suite runs beside Metro and Gradle. Both pass alone, every time.

## Not done, and why

| Item | Why | What it would take |
|---|---|---|
| "Slide to a choice and let go" | The touch belongs to the native map view and ends at the long press | Choices are tapped instead (documented in `QuickMark.tsx`) |
| Save Replay as video | No supported SDK 57 route | Out of scope |
| Reduced-motion check on the phone | realme refuses `settings put` over adb | You switch on "Remove animations" by hand; the code honours it (`ReduceMotion.System`, `useReduceMotion`) |
| Largest font size | Can't be changed over adb on this phone (known) | You set it by hand and I can check |
| Cold-start timing before and after | Needs a release build on both versions | Can be done with `EXPO_PUBLIC_PERF_LOG=1` on a release build |
| 6 Expo packages a patch behind (`expo`, `expo-router`, …) | Already behind before this work; upgrading means another native build | `npx expo install --fix` + rebuild |
| Glass blur | `expo-blur` would need yet another native rebuild; at 90% opacity it barely shows | Optional |

# Trip Planner Step 11 Report: Hardening (the final step)

**Date:** 2026-10-22 · **Status:** done; the trip planner plan is complete
**Plan:** `docs/trip-planner-plan.md`, step 11 · **How to run it yourself:** `docs/running-locally.md`

## 1. What was checked, and what it found

### The whole journey on the phone

- **A new flow, `mobile/.maestro/09-journey.yaml`,** runs the trip planner end to end on one trip that starts today:
  - plan it (Cox's Bazar, today and tomorrow, a must-see);
  - rearrange it (stay longer at a stop);
  - open its live conditions;
  - go back to the Trips tab, where the trip opens on **Today mode**;
  - "Running late?" → Apply → Undo;
  - delete the trip, so the next run starts the same way.
- **It found two real bugs (fixed):**
  1. **Android's Back didn't close a sheet.** With a stop's details open, Back left the whole trip screen. Now Back closes an open sheet first, in all 11 sheets (one shared fix in `useSheetPresentation`, with a test).
  2. **Deleting a trip went back to the screen before it,** which could be Today mode still showing the deleted trip. Now deleting goes to the Trips tab and drops the trip's saved plan, budget and weather.
- **Result:** `09-journey` passes on the phone; the full suite result is in section 3.

### Speed (release build of the dev variant, realme RMX2170, Android 12, 60 Hz)

| What | Measured | Target |
|---|---|---|
| Opening a trip from the phone's saved copy | **232–330 ms** (4 opens) | under 1 s ✓ |
| Scrolling the plan and switching days | 932 frames, **2.8% janky**; per frame 12 ms typical, 21 ms (90th percentile), 32 ms (99th) | smooth |
| Dragging a stop (6 drags) | 1,035 frames, **4.1% janky**; 19 ms typical, 22 ms (90th), 26 ms (95th) | smooth |

- **How it was measured:**
  - **Trip screen:** a timer logs how long it takes to show the plan, in development builds or a release build made with `EXPO_PUBLIC_PERF_LOG=1`; normal builds log nothing.
  - **Frames:** Android's own frame statistics (`dumpsys gfxinfo`).
  - **Drags:** the system's press-hold-move (`input draganddrop`).
- **Dragging runs at about 50 frames a second** while a card is held: usable, not perfectly smooth. Making it smoother would mean moving the list's re-layout off the JavaScript thread; that's a bigger change for later.
- **In the development build** (unoptimised JavaScript through Metro), the same screen takes 1.3–1.5 s. That's expected and isn't what people will use.

### Offline

- **With the backend stopped**, the app restarted and showed, from the phone's saved copy:
  - the Trips tab (with the next-trip card);
  - the whole plan (stops, legs, the day line, the weather chips, the warning);
  - the Conditions screen.
- **Fixed:** the budget meter was missing offline, because the budget wasn't saved with the plan. It is now.
- **Not checked:** with the phone fully offline (no Wi-Fi at all). The map's street tiles would then show only what the phone has already downloaded.

### Accessibility

- **TalkBack labels:** an automated pass over 7 key screens on the phone (Trips, a trip's plan, stop details, Budget, Conditions, step 1 of a new trip, Today mode). It found **no tappable element without something for TalkBack to read** among 102.
  - On Today mode, the three switches show up only because the dump can't see they're hidden. That's deliberate: the whole row is the switch, with its name and state (the same pattern as Settings).
- **Contrast** (a unit test of every text colour on every surface, in both appearances), with two new checks:
  - **White on the orange cards** (the next trip, "Now"): passes, 5.1:1.
  - **Blue text on the soft-blue buttons** (Apply, Mark visited, Refresh, the small buttons, the time chips): it **failed**. It was 3.9:1 in dark mode, and 4.1:1 over the inset grey in light mode. These buttons now use their own text colour (`onAccentSoft`: #8AB4F8 in dark mode, #1F55C0 in light mode), which passes on every surface. Eight places changed, several from before the trip planner.
- **Large text:** the Android phone can't be set to a large font scale over USB, so the largest font wasn't re-checked by hand for steps 5–11. Their texts wrap rather than cut off (no fixed heights on text).

### Tests

- **Backend:** `pytest` gives **549 passed**, 8 skipped, with a guard that fails on any network call (none made); `alembic check` is clean.
- **App:** `jest` gives **322 passed**; `tsc` and `eslint --max-warnings 0` are clean. New in this step:
  - the sheet Back test;
  - the two contrast checks;
  - 4 trip-screen test files now fix the date (their trips are dated 19–20 Oct 2026; once that became "today" they opened on day 2 and failed. A test must not depend on today's date).

### Docs

- **`docs/technology-decisions.md` §28:** the trip planner's decisions and measurements.
- **`docs/running-locally.md`:**
  - what's new: database updates and destination data at startup;
  - trying each feature, and Today mode on any trip day in development builds;
  - rebuilding the destination data;
  - the phone tests;
  - two new troubleshooting rows.
- **Privacy:** `docs/legal/privacy-policy.md` and `docs/play-store/data-safety.md` were updated in steps 9 and 10 (location on the phone only, local reminders, the road, weather and Google Maps services).

## 2. Files

- **App:**
  - **New:** `mobile/.maestro/09-journey.yaml`, `.maestro/scripts/dates.js`, `src/ui/theme/cards.ts`, `src/utils/devPerf.ts`, `src/__tests__/sheetBack.test.tsx`.
  - **Changed:**
    - `src/ui/useSheetPresentation.ts` (Back);
    - `app/trip/[id].tsx` (delete goes to Trips; the timer);
    - `src/services/queryClient.ts` (budget saved for offline);
    - `src/ui/theme/tokens.ts` (`onAccentSoft`) and the 8 places that use it;
    - `NextTripCard.tsx` and `app/trip/today/[id].tsx` (shared card colours);
    - `.maestro/config.yaml` and `08-rearrange.yaml` (the sheet pulled up before "Add a stop");
    - `contrast.test.ts` and 4 trip-screen test files (a fixed date).
- **Docs:** `technology-decisions.md`, `running-locally.md`, this report.

## 3. Phone test suite

- **The full suite** (00–09 and 99, 11 flows): 00–07 passed in one run.
- **Flow 08** then failed: after moving a stop to day 2, the plan sheet sat half open, so the scroll landed on the map and "Add a stop" was never reached. That's a test problem, not an app one. The flow now pulls the sheet up first.
- **Rerun:** 00, 08, 09 (the journey) and 99 all passed.

## 4. What's left (outside this plan)

- **Prices and opening hours** for the 10 new destinations need checking by a person (decision 6).
- **Before launch:** self-hosted OSRM for roads, hosting, and the store steps (`docs/go-live.md`).
- **Not checked by hand:** TalkBack used for real, end to end, on the new screens; and the largest font on steps 5–11.
- **Smoother dragging** (about 50 fps today).

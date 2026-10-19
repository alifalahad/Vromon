# Trip Planner Step 2 Report: One Trip Screen

**Date:** 2026-10-18 · **Status:** done on the phone; waiting for your approval
**Plan:** `docs/trip-planner-plan.md`, step 2 · **Design:** `docs/trip-planner/design-spec.md`
**Screenshots:** `docs/trip-planner/step-2/`

## 1. What changed

### One screen per trip

The trip details screen, the itinerary screen and its map tab are now **one trip screen**:
- **The map:** the day's stops as numbered pins (blue visits, amber meals) joined in visiting order.
- **The plan sheet** you pull up:
  - **Header:** destination, friendly dates ("Mon 19 – Tue 20 Oct"), travellers, and a budget meter you can tap.
  - **Day tabs.** During the trip, the screen opens on today.
  - **Day summary:** theme, number of stops, cost per person, travel time.
  - **Day ribbon:** the day to scale. Tapping it scrolls to the stop at that time.
  - **Stop cards:** time, length, price, and "For you: …" taken from the planner's reasons.
  - **Travel legs** ("About 2 min · 0.9 km") and **free time** between stops.
  - **Change the whole plan:** More relaxed, Cheaper, Quieter, Fuller (the existing "adapt" feature), and "New ideas for this day".
  - **Trip details:** route (with Edit route), your preferences, photos, and plan feedback.
- **⋯ menu:** Edit route, Budget, Rebuild the whole plan, Duplicate, Delete trip.

### Stops

- **Tap a stop:** its details open:
  - when you're there, opening hours, price and crowds;
  - why the planner chose it, and "More about this place" (the existing explanation);
  - **Directions** (opens Google Maps), **Swap** and **Remove**.
- **Tap a pin:** the same details open, and the pin is highlighted.
- **Swipe a stop left to remove it.** A snackbar offers **Undo** for 5 seconds; the removal is sent to the server only after that.

### Trips without a plan, and friends' trips

- **A trip without a plan** shows "Build my plan". It uses the optimiser, and falls back to the quick planner if the optimiser can't make a plan. The planner choice is no longer shown.
- **A friend's trip** opens the same screen read-only: no menu, swipes, Swap/Remove or plan changes.

### Wording, icons and numbers

- **Removed developer words:** "Status: Generated", "Planner: Standard / Optimized (OR-Tools)", "Valid", "All constraints satisfied", "Match 73%", "straight-line".
- **Problems are shown on the stop** they affect, with a red or amber ring. Problems for the whole day appear once, above the stops.
- **Emoji icons** on the trip screens are replaced by vector icons.
- **Bangla shows Bangla digits** for dates, times, counts, money and the map pins. Durations use ঘ/মি.

### Links

- **Old links:** `/itinerary/<id>` now opens the trip screen.
- **Budget:** has its own page (`/trip/budget/<id>`), still the old breakdown until step 6.

## 2. Checked on the phone (realme RMX2170, signed in to your account)

| Check | Result |
|---|---|
| Open a trip with a plan: map, pins, header, budget meter, day tabs, ribbon, stops, legs, free time | ✓ (`1`, `2`) |
| Tap a stop → details; tap a pin → details with the pin highlighted and the camera on it | ✓ (`3`) |
| Tap the ribbon → the sheet pulls up and scrolls to the stop at that time | ✓ |
| Swipe to remove, then Undo → the stop comes back and **nothing is sent** (checked in the log: Undo found and cancelled the waiting removal) | ✓ (`4`), after the fixes in §3 |
| Day 2: the map refits to the day's stops | ✓ (`5`) |
| ⋯ menu shows all 5 actions; Budget opens | ✓ (`6`) |
| Swap lists places that fit the slot (closed without swapping) | ✓ |
| Light theme and Bangla | ✓ (`7`); your settings are back to System and English |
| Dark theme | ✓ |
| Largest font size | **not checked**: this phone doesn't let adb change the font size; it needs you (§6) |
| Maestro suite on the phone, test accounts (flows 00–07, 99), including the new **06** (open a trip, build its plan, stop details, menu → budget) and **07** (a friend's trip opens read-only) | **9/9 passed** in 9 min 27 s |

While testing on your account, the phone went through a test proxy that refused every write, so none of the tests could change your trips. §4 explains why I added it.

## 3. Bugs found and fixed while testing

1. **Undo didn't work**, for two reasons:
   - **Swipe reported twice:** a swipe can report "opened" twice. The second report sent the first removal at once.
   - **Taps didn't reach Undo:** on Android, a floating view over the plan sheet doesn't get taps.

   Now each stop has its own timer, a repeated remove is ignored, and the snackbar lives in the sheet's footer. A unit test covers the double remove.
2. **Durations wrapped in the time column** ("2 h 30 min"); they now use a short form ("2 h 30").
3. **The error screen replaced cached data** when a refresh failed; the cached plan now stays on screen.
4. **The Swap and "More about this place" sheets** still said "match 64%", "Use" and "Replace". They now use the new wording, in both languages.
5. **The jest bottom-sheet mock** had no default export and didn't draw footers; fixed in `jest.setup.js`.

## 4. A problem I caused, and fixed

While I was testing Undo, before the fix in §3, **one real removal reached your trip**: trip 48, day 1, Cox's Bazar Night Market.

To put it back with its exact original values, I re-ran the planner for that trip in what I thought was a test transaction. The planner saves by itself, so this **added two extra days** to trip 48.

What I did to repair it:
- **The Night Market stop:** put back with its original time (18:00–19:30), price, notes and reasons, and the day re-timed. Day 1 is ৳2,120 per person and 7 min travel again, as before.
- **The two extra days:** removed (rows 18 and 19 with their 13 stops).

Trip 48 is now as it was: 2 days, ৳2,120 and ৳1,800 per person, 7 and 6 stops. Day 2 was never touched. The one difference is that the restored stop has a new internal ID.

From then on, every test on your account went through the read-only proxy. I've also saved this as a rule for future sessions.

## 5. Commands run

| Command | Result |
|---|---|
| `npx tsc --noEmit` · `npx eslint . --max-warnings 0` | pass |
| `npm test` | 20 suites, **269 passed** (8 new in `tripPlan.test.tsx`) |
| `maestro test .maestro` on the phone | **9/9 passed**. Earlier runs failed on two test issues, both fixed in the flows: the friend's trip was created after its profile had been cached, and flow 01 checked the Trips tab before the debug build had drawn it. |

No backend code changed in this step.

## 6. Files

**New:**
- `src/features/trips/plan/` (the trip screen's pieces):
  - `timeline.ts`, `colors.ts`, `usePlanFormat.ts`, `useDeferredRemoval.ts`;
  - `DayMap.tsx` (+ `.web.tsx`), `DayRibbon.tsx`, `PlanRows.tsx`, `StopSheet.tsx`, `TripDetails.tsx`.
- `src/ui/Snackbar.tsx`, `src/ui/ActionSheet.tsx`.
- `app/trip/budget/[id].tsx`.
- Tests: `src/__tests__/tripPlan.test.tsx`.
- Maestro: `.maestro/06-trip-screen.yaml`, `07-friend-trip.yaml`, `scripts/friend-trip.js`.

**Changed:**
- `app/trip/[id].tsx` (rewritten) and `app/itinerary/[id].tsx` (now a redirect).
- `app/_layout.tsx`, `src/components/ItemSheets.tsx`, `src/types/index.ts` (the meal's restaurant).
- `src/i18n/en.json`, `bn.json`, `jest.setup.js`.
- `.maestro/config.yaml`, `01-tabs.yaml` (waits for the Trips tab), `04-friend-by-code.yaml` (gives the friend a planned trip).

## 7. Known issues and limits

- **Travel legs are still straight-line estimates**; the screen says so. Real roads are step 4.
- **Meal restaurants are still picked without checking their hours**: breakfast at Beach Garden Restaurant at 09:00 although it opens at 12:00. The fix is in step 3.
- **Two meal pins can sit on top of each other** when the restaurants are very close (day 2 of trip 48).
- **Text from the data stays English** in Bangla: place names, categories, day themes, the planner's reasons and server messages.
- **Pins open a stop's details instead of scrolling the list:** the sheet library doesn't let the list scroll while the sheet is half open, so a pin can't scroll it.
- **Swipe-to-remove** works with your finger and through TalkBack's actions. Drag and drop is step 3.

## 8. What I need from you

1. **Sign in again** in Vromon (Dev): the Maestro run signed your account out (it signs in as the test accounts).
2. **Largest font check:** set Settings → Display & brightness → Font size to the largest, tell me, and I'll check the trip screen; then set it back.
3. **Approve step 2**, or tell me what to change.
4. Still open from step 1: should I delete the ~45 old test trips? (Yes or no.)

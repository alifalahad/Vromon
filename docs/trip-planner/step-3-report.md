# Trip Planner Step 3 Report: Drag and Drop Editing

**Date:** 2026-10-18 · **Status:** done on the phone; waiting for your approval
**Plan:** `docs/trip-planner-plan.md`, step 3 · **Screenshots:** `docs/trip-planner/step-3/`
**Also done this session:** I deleted your 51 old test trips (trips 1–51) as you asked, through the app's own delete logic, including the one test photo on trip 49. Your trip 57 (25–26 Oct, created today) is kept.

## 1. What changed

### Rearranging a day

- **Drag and drop:** press and hold a stop, then drag it.
  - The card lifts and follows your finger.
  - A blue line shows where it will land.
  - The times of the other stops update as you go, shown in blue.
  - Near the top or bottom of the plan, the list scrolls by itself: slowly at first, faster further in.
  - On release, the new order shows at once, the server re-times the day, and the snackbar offers **Undo**.
- **Move to another day:** while you drag, a bar at the top shows the other days. Dropping on one moves the stop there. The stop's details have "Move to another day" too.
- **Stay:** the stop's details have a stepper (±15 min).
  - Later stops move.
  - Several quick taps are sent as one change.
- **Keep this time** (pin):
  - A pinned stop keeps its time when you rearrange, use "New ideas for this day", or "Make it more relaxed / cheaper / quieter".
  - It shows a lock and "Keeps its time", and can't be dragged.
- **Add a stop:** the "+" in a free-time row, or "Add a stop" at the end of the day.
  - **Suggestions:** places that fit your interests, nearest to the stop before it first, with the distance.
  - **Search:** a search box for places.
  - **What's left out:** places already in the trip or excluded.
  - **Where it goes:** at the end of the day, but before dinner.
- **TalkBack** (the screen reader): every stop has "Move earlier", "Move later" and "Move to another day" actions, so everything works without dragging.

### The re-timing rules (the same on the server and the phone)

Each stop starts after the one before it, plus travel between visits (still the straight-line estimate). A stop never starts:
- before the place or restaurant opens;
- before lunch time (12:00) or dinner time (19:00), for those meals;
- before your preferred day start.

A pinned stop keeps its start unless the stops before it now run past it; the message then says it had to move. Stops before the first change keep their times.

### Meals respect restaurant hours (the bug found in step 1)

- **Picking a restaurant:** the planner only picks restaurants that are open for the whole meal. When a meal ends up at a different time than planned, it re-picks one that is open then, without going over the cost the budget had reserved.
- **Daily budget cap:** with a cap, the three meals alone must fit, so cheaper restaurants are chosen when needed.
- **The validator** now checks meals against restaurant hours too. Older plans built before this fix now show the problem; screenshot `8` shows "Breakfast at Mermaid Café … 09:00, but the restaurant is open 11:00–22:00". Rebuilding the plan fixes it.

### Wording

- The reason "Scheduled by CP-SAT optimizer" is now "Placed where the day needs the least travel". The app hides the old text in existing plans.
- An empty search says "Nothing matches '…'" instead of "No other places to add".

## 2. Checked on the phone (signed in as the test account e2e.ana, not your account)

| Check | Result |
|---|---|
| Press, hold and drag a stop: the card follows, the line and preview times show, the order is saved on the server, and Undo restores it | ✓ (`1`, `2`) |
| Drag downward while the list is at the top: the sheet stays put | ✓ |
| Drop on the Day 2 chip moves the stop to day 2; day 1 is re-timed | ✓ (`3`) |
| Breakfast moved to the start of the day waits until the café opens (11:00) | ✓ |
| Stay +30 min (two taps, one request); later stops moved by 30 min; keep this time saved | ✓ (`4`) |
| Move to another day from the details, with Undo | ✓ (`5`) |
| Add a stop: suggestions with distances; search "light" finds the lighthouse; adding it saves | ✓ (`6`, `7`) |
| Maestro on the phone (10 flows, including the new **08**: stay, keep this time, move to day 2, add a stop) | **All 10 pass.** In the last full run, flows 00–07 passed; flow 08 did everything but missed the 5-second "Added" message (the add itself succeeded: 201 on the server). Flows 08 and 99 then passed when rerun. |

Drag and drop was checked with step-by-step touch events (press, hold, move, release), not with my finger. Please try it yourself (§6).

## 3. Bugs found and fixed while testing

1. **A drag could get stuck**, for two reasons:
   - The card's swipe-to-remove wrapper was removed when the drag started, which ended the gesture silently.
   - Turning off the sheet's own dragging mid-gesture dropped our gesture.

   Fixes:
   - The wrapper now stays (just disabled).
   - The sheet settings no longer change during a drag.
   - A watchdog cancels a drag that has had no events for 8 seconds.
2. **Auto-scroll ran past the end of the list**, and it was too fast (about 875 px/s). It now follows the real scroll position, stops at the end, and goes slow to fast with depth (at most 10 px a frame).
3. **The morning was lost after moving lunch first:** the day's start became 12:00, so Undo put breakfast at 12:00. The day now starts at your preferred start. There's a test for this.
4. **The search box garbled text** with the phone's keyboard prediction ("liglighliglight"). The box now keeps its own text.
5. **The keyboard stayed open** after picking a place, and hid the snackbar.
6. **A place added at the end of the day landed after dinner**, outside its hours. It now goes before dinner.
7. **The test mock's sheet never called onDismiss**, unlike the real one. Fixed, so tests follow the same path as the app.

## 4. Commands run

| Command | Result |
|---|---|
| `pytest -q` | **405 passed**, 8 skipped (was 386; 19 new in `test_trip_planner_step3.py`) |
| `alembic upgrade head` · `alembic check` | migration `0007` (pinned stops) applied; no drift |
| `npx tsc --noEmit` · `npx eslint . --max-warnings 0` | pass |
| `npm test` | 21 suites, **276 passed** (7 new in `tripPlanEdit.test.tsx`) |
| `maestro test .maestro` | 10/10 (see §2). Earlier runs failed on test issues, all fixed in the flows: the USB port forwards dropped, the friend's token expired after an hour, and flows tapped stop cards that were off screen. |

## 5. Files

**Backend:**
- `alembic/versions/20261018_0007_item_pinned.py`; `models.py` (`ItineraryItem.pinned`).
- `services/itinerary/editing_service.py`:
  - re-timing (`apply_order`) and `day_start_of`;
  - the edits: reorder, move to another day, set the stay, add a place;
  - suggestions.
- `services/itinerary/itinerary_service.py` (restaurant hours, the meal re-pick, meals within a daily cap) and `cpsat_scheduler.py` (the same; the reason wording).
- `services/itinerary/constraint_validator.py` (meal hours) and `services/adaptation/adaptation_service.py` (pinned stops stay).
- `api/v1/endpoints/trips.py`:
  - `PUT /trips/{id}/days/{day_id}/order`, `POST /trips/{id}/items/{item_id}/move`, `PATCH /trips/{id}/items/{item_id}`;
  - `POST /trips/{id}/days/{day_id}/items`, `GET /trips/{id}/days/{day_id}/suggestions`;
  - "New ideas for this day" keeps pinned stops;
  - `pinned` in the item output.
- Tests: `tests/test_trip_planner_step3.py`.

**Mobile:**
- New: `src/features/trips/plan/useStopDrag.ts`, `AddStopSheet.tsx`.
- Changed:
  - `timeline.ts` (re-timing that mirrors the server's);
  - `PlanRows.tsx` (drag, pin, TalkBack actions, "+" in free time);
  - `StopSheet.tsx` (stay, keep this time, move to another day);
  - `app/trip/[id].tsx`, `services/api.ts`, `types/index.ts`, `ItemSheets.tsx`;
  - i18n (English and Bangla), `jest.setup.js`.
- Tests: `src/__tests__/tripPlanEdit.test.tsx`.
- Maestro: `08-rearrange.yaml`.

## 6. Known issues and limits

- **Undo after a reorder** restores the order and works out the times again. They can differ slightly from the planner's original times (for example, if the planner had left a gap).
- **Moving a stop earlier than its opening time**, or a meal before its usual time, creates free time before it. That's correct, but you may want to drag something into the gap.
- **Edits can push stops past closing time or late into the evening.** The stop then shows a warning; nothing stops you making the change.
- **Pinned stops can't be dragged.** Turn off "Keep this time" first.
- **The "Added" check in flow 08 can miss** the 5-second message on a slow run. The add itself works.
- **The message for a stay change or a pin is hidden behind the stop's details while they're open.** The details show the new value, and a refused change shows an alert, so you still see what happened.
- **Suggestions rank by fit first, then closeness.** A great match 15 km away can come before a closer one.
- **Travel is still straight-line** (road routes are step 4). **Only Cox's Bazar has data** (step 9).

## 7. What I need from you

1. **Try drag and drop with your own finger.** Hold a stop for a moment, then drag; drop it on a day chip to move it to another day. Tell me if anything feels off: the hold time (0.35 s), the scrolling speed, or where it lands.
2. **Sign in again** in Vromon (Dev). The phone is signed in as the test account.
3. **Largest font check** (still open from step 2): set the largest font size and tell me, and I'll check the trip screen.
4. **Approve step 3**, or tell me what to change.

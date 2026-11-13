# Step 2 report: app, choose where you stay; the stay and the way back on the map and in the plan

**Date:** 2026-11-12. **Status:** built, tested (jest, typecheck, lint, pytest, the API as test accounts A and B) and checked on the phone as test account A. **Your account was signed out on the phone for this: sign in again.**

## What changed

| Where | Change |
|---|---|
| New trip, step 2 | A **"Where you'll stay"** row before the budget (`stays-open`), shown when the trip has nights. It opens a sheet: **All nights** or **night by night**, then one of: *Let Vromon pick a hotel* (the default), *With family or friends* (a place on a map, with an optional name, only you see it), *Day trip, no night here*, *Decide later*, or a hotel from the destination (priced ones first, cheapest first; the rest by rating, "Price not known"). Nights with family or day trips take that many hotel nights off the **suggested budget** at once (the middle price of the level's priced hotels there, per room; nothing is guessed when no hotel has a price). The trip is sent with `stays` only when you chose something. |
| Trip screen | A **"Tonight: Hotel X · Change"** line under the day's summary. On the last day it says **"Last day: leave from X"**. For a friend's trip it has no Change, and a home shows as "With family or friends". **Change** opens the same sheet (without "Let Vromon pick") and saves with `PUT /stays`. The snackbar says how the trip's cost changed ("Saved. The trip now costs ৳6,000 less"). The plan list starts with **"From Hotel X · 15 min"** and ends with **"Back to Hotel X · 25 min · ৳80"**. A stand-in at the town centre says "rough guess". A day with `BACK_LATE` shows the warning with a **"Re-plan this day"** button (`POST /days/{id}/regenerate`). |
| Day map | The stay as a **pin with a bed or a house** whose tip is on the stay, so a stop at the same spot (breakfast at the hotel) stays visible under it (one pin when the day starts and ends there; two on a move day). With a stay pin, the map leaves room at the top so the pin isn't hidden behind the Satellite / 3D / Full map buttons. The legs **from the stay to the first stop and from the last stop back** are drawn like the others: along the road from the route's `from_base`/`to_base`, otherwise as a dotted straight line. A stay more than 40 km away (day trips from home) gets its pin and line, but the camera still fits the day's stops. A stand-in at the destination's centre is not drawn. Pin colours are new tokens (`planColors.stay`/`onStay`), checked in `contrast.test.ts`. |
| Today mode | **"Leave by"** for the day's first stop now counts from that day's stay, using the server's time for that leg when it has one ("From Hotel X"), not the trip's one hotel. After the last stop, a card **"Back to Hotel X around 19:40 (25 min) · ৳80"** with Directions (it replaces "No more stops to go to today"). Reminders use the same start. Today has no map; its "Full plan" opens the trip map with the pin. |
| Budget screen | When the stay isn't one hotel for every night, the stay part says so ("2 stays, night by night below"), with a line per stay: "Nights 1–2 · Hotel X · ৳6,000", "Night 3 · Uncle's house · No cost", "Night 4 · Decide later · Not chosen yet". All nights free: "No room to pay for: with family or friends, or day trips". |
| Server fix | The destination's hotel list **always said "price known" and "rating known"** (`_hotel_out` dropped the two fields, so the defaults were sent). Every unpriced Khulna hotel would have shown "৳0 a night". Fixed, with a test. |
| Strings | `stays.*`, `placePicker.*`, `today.backTo` in English and Bangla (Bangla digits through the formatter; `_one`/`_other` plurals). "Local travel: CNG, to and from your hotel" and Today's "from your hotel" now say "where you stay" (it can be a home). |

**Files:**
- New: `mobile/src/features/trips/stays/{stays.ts,StaysSheet.tsx,StaysRow.tsx,TonightRow.tsx,BaseRow.tsx}`, `mobile/src/features/places/PlacePicker.tsx` (step 6 reuses it), `mobile/src/__tests__/stays.test.tsx`.
- Changed: `mobile/app/trip/{new.tsx,[id].tsx}`, `mobile/app/trip/today/[id].tsx`, `mobile/app/trip/budget/[id].tsx`, `mobile/src/features/trips/new/newTrip.ts`, `mobile/src/features/trips/plan/{DayMap.tsx,colors.ts}`, `mobile/src/features/trips/today/today.ts`, `mobile/src/services/api.ts`, `mobile/src/types/index.ts`, `mobile/src/i18n/{en,bn}.json`. Tests: `newTripScreen`, `tripPlan`, `contrast`.
- Backend: `app/api/v1/endpoints/destinations.py` (the hotel fields), `app/api/v1/endpoints/trips.py` + `app/services/stays.py` (`start_leg`: the way from the stay to the first stop), `tests/test_trip_stays.py`.

## How it was checked

**Tests:**
- Mobile `jest`: **all 60 suites, 602 tests pass** (24 new: the stays helpers, the payload and suggested budget, the rows, Tonight, the budget lines, Today from and back to the stay, the trip screen with base rows/pin/re-plan, the new-trip sheet end to end). `tsc` clean, `eslint app src` clean.
- Backend `pytest -q`: **760 passed, 9 skipped** (758 after step 1; 1 new test for the hotel list's known fields).

**Over the API as test accounts (dev backend), trip 119:** A made a 4-day Khulna trip (20–23 Nov, 2 travellers) with **nights 1–2 at Hotel Rose Garden** and **night 3 at "Uncle's house"** (Sonadanga), planned by the optimiser. (The prompt says "3-day … night 3"; a 3-day trip has 2 nights, so 4 days were used.)

| Day | Starts at → ends at | From the stay | Back to the stay | Route legs |
|---|---|---|---|---|
| 1 | hotel → hotel | 1 min walk | 1 min walk, back 19:59 | `from_base`, 3 stop legs, `to_base`, both on roads |
| 2 | hotel → hotel | 8 min CNG, ৳180 | 3 min CNG, back 20:00 | `from_base`, 5, `to_base` |
| 3 (move day) | **hotel → Uncle's house** | 3 min CNG | 4 min CNG, back 19:59 | `from_base`, 6, `to_base` |
| 4 | Uncle's house → Uncle's house | 4 min CNG | 5 min CNG, back 20:00 | `from_base`, 3, `to_base` |

- Every day is back by "finish by" (20:00). No `BACK_LATE`.
- Budget: the stay part has two blocks (nights 1–2 at the hotel, cost unknown because Hotel Rose Garden has no price; night 3 at the home, **৳0**).
- **As test account B** (A's friend): the trip opens. Day 3's end and day 4's start are `{kind: "home"}` with no name or place and no way back; the stays list has the home with no label or place; `PUT /stays` → **404**.

**On the phone (dev app, test account A, trip 119), described:**
- **Day 1 map:** a light pin with a bed above Hotel Rose Garden in Khulna town, the road out west to stop 2 and back. The meal stops next to the hotel (1, 3, 4) show under the pin's tip. (The first look had the bed pin covering them; fixed, see the table above.)
- **Day 1 plan:** "Tonight: Hotel Rose Garden · Change", then "From Hotel Rose Garden · 7 min" before breakfast. After dinner (18:58–19:58): "Back to Hotel Rose Garden · 9 min · ৳80". The road times arrived after the plan was made, so day 1 showed "Needs attention: Day 1: back where you stay at 20:07, after your day ends at 20:00" with **Re-plan this day**. Tapping it re-planned the day; the warning went away and dinner moved earlier.
- **Day 3 (the move day):** "Tonight: Uncle's house" with a house icon; "From Hotel Rose Garden · 4 min". The map shows the house pin in front of the hotel pin (about 1 km apart) above the town's stops. At first both pins were hidden behind the Satellite / 3D / Full map buttons; fixed.
- **Change:** the sheet lists "All 3 nights: Different places on different nights" and each night (Night 1 · Fri, Nov 20: Hotel Rose Garden; Night 2: Hotel Rose Garden; Night 3: Uncle's house). Night 2's choices: family, day trip, decide later, then the hotels: Hotel jalico ৳750, Hotel Ambassador ৳1,400, Western Inn International ৳2,000, Hotel Royal International Ltd. ৳2,800, then the unpriced ones as "Price not known". Western Inn for night 2, Save: "Saved. The trip now costs ৳190 less" (৳14,960 → ৳14,770; only the rides changed, because night 1's hotel has no price and the stay isn't counted); day 3 now starts at Western Inn.
- **Budget screen:** "Stay · Not known · 3 stays, night by night below", then "Night 1 · Hotel Rose Garden · Not known", "Night 2 · Western Inn International · ৳2,000", "Night 3 · Uncle's house · No cost".
- **Today mode** (the development build's clock set to day 3): at 08:00 "Leave by 08:55 · Walk · about 3 min · From Western Inn International" for breakfast at 09:00. At 19:57 "That's today done" and "Back to Uncle's house around 20:01 (6 min) · ৳130" with Directions.
- **Release build** of the dev app (`assembleRelease`, installed over the dev app): the trip opened **8 times out of 8** with the bed pin, the road lines and the plan sheet drawn ("Tonight: Hotel Rose Garden" in the view dump each time).

## Differences from the prompt, and why
- **The stays sheet lives in `features/trips/stays/`**, not `features/trips/plan/`, with the other stay pieces.
- **Today mode has no map** of its own, so the stay pin is on the trip map that "Full plan" opens.
- **A stay far from the day's stops isn't fitted into the map view** (more than 40 km: a day trip from home). Otherwise the day's stops would shrink to a dot.
- **A stand-in at the destination's centre** (a night not decided yet) is named in the rows ("rough guess") but has no pin or line, because it isn't a real place.
- **The server sends the way from the stay** (`start_leg`) as well as the way back, so the plan's first row, Today's leave-by and the map agree.

## Left open
- **A friend's view on a phone:** checked over the API as B (the home is hidden), not on a second phone.
- **Changing a stay re-times nothing** (as in step 1): the day keeps its times and gets a `BACK_LATE` warning with "Re-plan this day" when the new way back is too long.
- **Junk in the hotel list:** some "hotels" are area names or shops ("বয়রা,খুলনা", "NR Store", "NR Tours"). The planner already skips names that are only places (D11), but the sheet lists everything the server sends. That's a data fix for the owner, or a filter in a later step.
- **Most hotels have no price** (Khulna: 5 of 28, all Budget level), so "free nights take the hotel cost off" only works where priced hotels exist at that level.
- **The friends' share backend (port 8002)** still runs older code; step 8 restarts it with the friends' APK.

## Git commands for the owner
```bash
cd ~/Codes/Vromon
git add -A
git commit -m "Trip upgrades step 2: choose where you stay; the stay and the way back on the map, plan, Today and budget"
git push origin main
```

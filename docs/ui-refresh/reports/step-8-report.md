# Step 8 report: Trip screen, drag and drop for long trips

**Date:** 2026-11-16. **Status:** done. **Mockups:** frames 13 (TripDrag3) and 14 (TripDrag30) of https://claude.ai/artifact/RMjDbAXaeW6DNQKAY8pBNN.

Moving a stop to another day is now one row of day chips at the top, the same height for 2 days or 30. A far day is as quick as the next one: the row scrolls by itself at its sides, and the track under it runs through the whole trip. The stop you drag floats over everything, so you always see it.

## 1. What changed

### Where to drop: the strip of days (`DropStrip.tsx` and `dropGeometry.ts`, new)

- **One row** at the top while a stop is dragged, as in the frames.
  - When every chip fits, they share the width (frame 13: 2, 3 or 4 days on a 360 dp phone).
  - Otherwise the chips keep 64 dp and the row scrolls (frame 14). Fades with ‹ › show at a side that can scroll.
- **Each chip** has the day and its date ("Day 4 / Sun 13").
  - The current day is shown in grey with "It's here now" ("Here now" on narrow chips) and isn't a target.
  - The chip under the finger grows from 56 to 66, fills blue, and the phone ticks.
- **The line above the chips** says what a release does: "Release to move to Day 12 · Tue 1 Dec". The month is added once the trip has crossed into another. Before a chip is chosen it says "Drop on a day to move it there".
- **It opens** with the days around the current one in view.
- **Far days (D8):**
  - **The sides:** while the finger rests at the row's left or right side, it scrolls by itself, a little faster every frame. On the phone, resting about 1.5 s at the right side went from Day 4 to Day 16.
  - **The fast lane:** under the chips is a track from "Day 1" to "Day 30". Sliding the finger along it picks the day at that point of the trip and scrolls the row there.
  - The lane starts only once the finger slides mostly sideways along it. A finger passing straight up through it to reach the chips doesn't jump the row.
- **Which chip is under the finger** is worked out from the strip's own place and how far it has scrolled. The old way measured each chip once on screen, and that breaks as soon as the chips move. The strip doesn't take touches; the drag reports the finger to it.
- **Colours:**
  - The chosen chip uses the strong blue. In dark mode white on the plain blue is 4.1:1; in light mode the two blues are the same.
  - The track is the line colour (`border`), not the frame's #E7EBF1, which has no token.
  - The new pairs are in `contrast.test.ts`.

### The stop being dragged (`useStopDrag.ts`, `PlanRows.tsx`)

- **A copy that follows the finger.** Before, the card itself moved inside the plan sheet, and above the sheet's top it was cut off: on a long trip you could barely see what you were dragging. Now a copy follows the finger over everything but the strip. It has:
  - a white card with a blue ring and a clear shadow (frames 13 and 14);
  - the grip, in blue;
  - a slight lift (1.03×), which reduced motion turns off.
- **Its place in the list** stays as a dashed outline, as in the frames.
- **The rest of the day is dimmed** to 42%, as in the frames (the stops, the legs, free time, the stay rows).
- **The landing line** is easier to see: a 4 dp blue line with a ring at its start, and the time the stop would start there ("10:00") in the time column. The other stops show their new times in blue, as before.
- **Steadier targets.** The rows' places are taken when the drag starts, so the landing line moving the rows doesn't move the target under the finger.
- **The list still scrolls** near the top and bottom of the plan. It no longer scrolls while the finger is far above the sheet on its way to the strip.

### Easier to find (`PlanRows.tsx`, `app/trip/[id].tsx`, `preferences/store.ts`)

- **A grip** (six dots) on every stop of your own trip that can be moved.
- **A pinned stop** shows a lock in the same place, and its card still says why it can't move: "Keeps its time".
- **A one-time tip** above the stops the first time one of your plans opens: "Press and hold a stop to move it". On a trip of more than one day it adds "To move it to another day, drop it on a day at the top."
  - It closes with ×, or when a stop is lifted.
  - It's remembered in preferences (`dragHintSeen`), so it shows once on this phone.

### After a move to another day

"Moved Inani Beach to Day 11", with Undo. "Day" now has a capital, as everywhere else.

Undo uses the same API with the old position (`POST …/items/{id}/move` with `position`), so the stop goes back exactly where it was. This was already in place; it's now tested.

### Without gestures (`StopSheet.tsx`)

The stop sheet's "Move to another day" is now a grid of every day with its date:
- four columns on a phone, three at the largest text, so all 30 days show without sideways scrolling;
- the stop's own day is outlined, "Here now", and can't be picked.

TalkBack's "Move to another day" action on a card opens this sheet, as before.

## 2. How it was checked

On the USB phone as test account A (dev build, on Metro):
- a 3-day trip (132, Sun 22 – Tue 24 Nov);
- a 30-day trip made for this step (134, Cox's Bazar, 10 Dec – 8 Jan, two travellers, ৳150,000; the longest the app allows).

The drags were real touch events (adb motion events). Times are from finger down to release, including the 0.6 s press and hold and adb's own delay per event.

| Checked on the phone | Result |
|---|---|
| 30 days: lift a stop to the strip | One row: "Day 1 Here now", Day 2 Fri 11, Day 3 filled ("Release to move to Day 3 · Sat 12"), Day 4, ›; the track "Day 1 —— Day 30". The plan stays visible below it, dimmed, with the stop's place outlined. |
| The copy in the air | "2 Inani Beach", ringed and lifted, above the plan; the landing line "09:00" above Breakfast, whose time shows 11:00 in blue. |
| Day 1 → day 10 by the track | One drag, **1.30 s**: "Moved Teknaf Beach to Day 10". On an earlier try the finger landed one day further along: "Release to move to Day 11 · Sun 20", with the row scrolled there and ‹ › showing. |
| Day 1 → the last day (30) by the track's end | **1.25 s**, then Undo: Breakfast back at 09:00 on day 1 (both requests in the server's log). |
| Resting at the right side | The row scrolled on by itself; the release moved the stop to Day 16 ("Moved Inani Beach to Day 16"); Undo put it back. |
| 3 days: move to the next day | Frame 13's strip: three chips sharing the width, "Release to move to Day 2 · Mon 23". **1.13 s**, "Moved Inani Beach to Day 2". |
| Reorder within a day | Teknaf above Inani: the landing line "10:00", the others' new times in blue (13:29, 15:29); "Moved Teknaf Beach"; Undo: "Order put back; times worked out again". |
| Cancel | Up to the strip and back to its place: nothing sent (the server's log unchanged). |
| Undo | Tapped six times, at once after the drop: 5 times the stop went back. Once the server got no Undo; that tap came from my script, and the same drag and Undo repeated twice afterwards worked both times. |
| The day picker, 30 days | All 30 days with dates in four columns, Day 1 outlined "Here now"; on the 3-day trip, picking Day 1 moved the stop back ("Moved Inani Beach to Day 1", with Undo). |
| The tip | Shown on the first plan opened (30-day trip), closed when a stop was lifted, not shown again on the 3-day trip. |
| Largest text (1.6×) | The line wraps to two lines; the chips are wider; nothing is cut off. The picker has three columns ("Day 1 / It's here now"). |
| Bangla | "ছেড়ে দিলে যাবে: দিন ১১ · রবি ২০", chips "দিন ১০ / শনি ১৯", the track "দিন ১ … দিন ৩০"; the picker "দিন ১ / এখন এখানে", "বৃহস্পতি ১৭" shrunk a little to fit. |
| Light and dark | Both. The phone was in dark mode; light was set in the app, then put back to System. |
| Release build: lift a stop to the strip 10 times | 10 of 10: the strip ("Release to move to Day 3 · Sat 12"), the outline and the dimmed plan were drawn every time; each release back in place sent nothing. A real move to Day 3 and Undo then worked too. |

**Found on the phone, fixed:** on this 360 dp phone the 3-day strip's chips are 99 dp wide. "It's here now" fits there, but it was shown only from 100 dp, so the chip said "Here now". It's now shown from 90 dp. The picker has the same rule.

The phone was left as found: English, Appearance System, text size 1.0. Trips 132 and 134 were put back as they were before the tests, through the app or the API.

## 3. Checks

| Check | Result |
|---|---|
| `npx tsc --noEmit` | clean |
| `npx eslint . --max-warnings 0` | clean |
| `npx jest` | 749 of 749 passed (15 new) |
| Maestro `08-rearrange` | passed on the phone: rebuild, stay longer, keep its time, move to Day 2 through the new day grid, add a stop. A first run failed before reaching the drag: the rebuild took over the app's 30 s while the release build was using the Mac's CPU, and "Couldn't build a plan" covered the stop's sheet. Run again without the build: passed. |

New tests in `dragStrip.test.tsx` (12):
- **The strip's sizes:** 2 days share the width; 7 and 30 scroll; chips are wider at large text.
- **Which chip a point lands on** while the strip is scrolled, in a gap, outside, and at the end.
- **The opening place:** the current day in the middle, as far as the ends allow.
- **The fast lane:** reaches Day 12 · Tue 1 Dec in one slide; passing straight up through it does nothing.
- **Resting at a side:** Day 5 → Day 9 in the first half second, Day 16 after the next one (faster).
- **The current day** is never a target.
- **The 2-, 7- and 30-day strips** on screen.
- **The stop sheet's picker** for 30 days.

New in `tripPlanEdit.test.tsx`:
- the tip shows once and is remembered;
- the grip, and a pinned stop saying why it can't move;
- the picker's days and dates;
- "Moved Laboni Beach to Day 2", then Undo moves it back to its old place (day 1, second of four).

## 4. Left open

- **Where a moved stop lands on its new day.** The server puts it at the end of that day: this was already so. On the 3-day trip that put Inani Beach at 19:56, after it closes at 17:00, and the plan said so ("Needs attention"). Choosing a place by time (or letting you drop it at a place in the other day) belongs with the plan's redesign in step 14.
- **Seen in the server's log (not this step's code):** once, on the 30-day trip, asking for the stay suggestions failed with "UNIQUE constraint failed: stay_suggestions…". Two requests arriving together can both save the same new suggestion (`stay_advisor.suggestions`). The next request worked, and nothing showed in the app. Worth a fix in the stay advisor.
- **Reduced motion** wasn't switched on on the phone. The copy isn't scaled then (in the code), and the rows' glide follows the system setting through Reanimated.
- **The dashed outline** in the frames is grey, as here. The landing line and the time beside it are this step's addition, asked for in the prompt; the frames show the moment before a new place is chosen.

## Files

- New:
  - `mobile/src/features/trips/plan/DropStrip.tsx`
  - `mobile/src/features/trips/plan/dropGeometry.ts`
  - `mobile/src/__tests__/dragStrip.test.tsx`
- Changed:
  - `mobile/src/features/trips/plan/useStopDrag.ts` (the copy, the strip, rows taken at the start)
  - `mobile/src/features/trips/plan/PlanRows.tsx` (grip, outline, dimming, `DragGhost`, `LandingLine`)
  - `mobile/src/features/trips/plan/StopSheet.tsx` (the day grid)
  - `mobile/app/trip/[id].tsx` (the strip, the copy, the tip; the old drop box and its chip removed)
  - `mobile/src/features/preferences/store.ts` (`dragHintSeen`)
  - `mobile/src/ui/LineIcon.tsx` (grip, arrow up, chevron left)
  - `mobile/src/i18n/en.json`, `bn.json`
  - `mobile/src/__tests__/tripPlanEdit.test.tsx`, `contrast.test.ts`
- `docs/ui-refresh/prompts.md` (Status table), this report

## Git

Committed by the agent on `main`, with no co-author line. Nothing was pushed.

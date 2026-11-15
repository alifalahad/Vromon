# Step 6 report: Must-dos, the busy time typed

**Date:** 2026-11-15. **Status:** done. **Mockup:** frame BusyTime of https://claude.ai/artifact/RMjDbAXaeW6DNQKAY8pBNN.

"A time you're busy" no longer has rows of half-hour chips: From and To are typed, any minute, in a sheet rebuilt from the frame. A busy time can now be changed after it's added. Both planners keep exactly that time free.

## 1. What changed

### A typed time (`src/ui/TimeField.tsx`, new)

- **Two boxes,** hours and minutes, in the manner of the date fields:
  - the number pad, with the old value selected when a box is touched;
  - it moves on to the minutes by itself once the hour is whole ("16", or "7" read as 07);
  - Backspace in an empty minute box goes back to the hour.
- **Any minute** counts. Bangla digits are accepted, and the boxes show the app's own digits.
- **The value** is "HH:MM", or "invalid" for a time that doesn't exist (25:70).
- **Look (the frame):** 66-tall boxes, the title font at 30, the box ringed in blue while typing, and the box being typed in tinted.
- **Nothing clipped:** the font's tall digits get no font padding and a line of their own. On the phone the hour was clipped at the top before this fix ("don't hide text numbers when typing").

### The sheet (`BusySheet.tsx`, rebuilt)

- **Heading:** "A time you're busy · Nothing is planned then."
- **The day:** chips with the date ("Day 1 · Sun 22"). Up to three share the width; on longer trips they scroll sideways and open with the chosen day in view.
- **The times:** From → To side by side, typed, with how long that is ("5 h 35 min").
- **All day:** one switch. It keeps the whole day (00:00–23:59) free, and its line in the list says "All day", not the clock times.
- **"What is it?"** stays optional ("For example, a wedding").
- **Mistakes** are said in words under the times, and the button stays off until they're fixed:
  - "That time doesn't exist";
  - "It ends before it starts";
  - "That's outside your day (09:00–20:00): nothing is planned then anyway". Each day's hours come from the trip, the first day's arriving and the last day's leaving included. Partly outside is fine.
- **The button** says what it will do: "Keep Day 1, 16:10 to 21:45 free", or "Keep Day 2 free" for all day.
- **The keyboard** never covers the times or the button. On the phone it did at first: with Android's "adjustResize" mode the sheet library waits for the window to shrink, and edge-to-edge Android never shrinks it. The sheet now moves itself up by the keyboard's height ("adjustPan").
- **Changing a busy time:** before, a busy time could only be removed and added again. Now tapping it in the must-dos opens the sheet on its day, times and label, and saving replaces it. This works on New trip and on a trip's Must-dos screen.

### The planner (point 3)

Both planners already respect a busy time at any minute:

- CP-SAT takes it as an exact interval.
- The fallback tries start times every 5 minutes against an exact block, which can't overlap it.

Nothing rounds, so there was nothing to fix. A new test proves it with 16:10–17:25 on both planners.

### D6

Only the busy time is typed now. The day's start and finish, arriving and leaving, and a must-see's exact time keep their chip sheet (`TimeSheet.tsx`) until step 20, where you'll be asked whether you like typed times on the phone.

## 2. How it was checked

| Checked | Result |
|---|---|
| The sheet on the phone (test account A, New trip) | As in the frame: day chips with dates, From 18:00 → To 20:00, "2 h", All day, "What is it? optional", the button. |
| Typing 16:10 and 21:45 on the phone | Typed with the number pad, moving on by itself: "5 h 35 min", "Keep Day 1, 16:10 to 21:45 free". The sheet rose above the keyboard with the times and the button in view (after the fix above). Saved as "Busy · Sun 22 · 16:10–21:45". |
| The plan leaves it free, real data | A Cox's Bazar trip on test account A built through the dev backend's API (the app's own request), busy 16:10–21:45 on day 1 and 16:10–17:25 on day 2. Day 1's last stop ends at 15:19; day 2 has nothing from 16:10 to 17:25 and dinner at 19:00. No stop overlaps either. |
| Built on the phone from New trip (trip 132) | "Your plan is ready" said "Kept Sun 22 · 16:10–21:45 free". Day 1's last stop (Teknaf Beach) ends at 15:45; nothing from 16:10 to 21:45, as the day's ribbon on the phone shows too. |
| Added on an existing trip's Must-dos (trip 132, day 2, 16:10–17:25) and saved | The sheet: "Day 2 · Mon 23", "1 h 15 min", "Keep Day 2, 16:10 to 17:25 free". Both busy times saved exactly. Day 2 now stops at 15:44 and picks up with dinner at 18:56; nothing from 16:10 to 17:25. |

On the way, realme showed a security prompt about the dev app's overlay (the dev performance monitor) over the keyboard; you answered it. Later the phone lost its internet for a while, signing test account A out of the dev app; it was signed in again. The dev menu's "Toggle performance monitor" didn't switch the monitor off; it's dev-only and isn't in the friends' app.

## 3. Checks

| Check | Result |
|---|---|
| `npx tsc --noEmit` | clean |
| `npx eslint . --max-warnings 0` | clean |
| `npx jest` | 723 of 723 passed (10 new in `busyTime.test.tsx`: a typed time, valid and impossible; the mistakes; typing at any minute with the length and the button's text; 25:70; To before From; outside the day; Bangla digits; All day; changing a busy time already added; Bangla) |
| `pytest -q` | 831 passed, 9 skipped (2 new: 16:10–17:25 kept free by CP-SAT and by the fallback) |

## 4. Left open

- **The dev performance monitor** is still on in the dev app (dev-only).
- **The other times** (TimeSheet) stay chips until step 20 (D6).

## Files

- New: `mobile/src/ui/TimeField.tsx`, `mobile/src/__tests__/busyTime.test.tsx`
- `mobile/src/features/trips/new/BusySheet.tsx` (rebuilt), `MustDosEditor.tsx` (a busy time can be changed; each day's hours), `useMustDoText.ts` ("All day")
- `mobile/app/trip/new.tsx`, `mobile/app/trip/must-dos/[id].tsx` (each day's hours to the editor)
- `mobile/src/i18n/en.json`, `bn.json`
- `backend/tests/test_trip_planner_step4.py`
- `docs/ui-refresh/prompts.md` (Status table), this report

## Git

Committed by the agent on `main`, with no co-author line. Nothing was pushed.

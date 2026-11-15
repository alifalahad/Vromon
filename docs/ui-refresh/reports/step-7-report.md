# Step 7 report: Trip screen, the row of buttons over the map

**Date:** 2026-11-15. **Status:** done. **Mockups:** frames 11 (TripScreen) and 12 (TripLayers) of https://claude.ai/artifact/RMjDbAXaeW6DNQKAY8pBNN.

The trip screen's top is one row: a large weather button on the left; map options, Full map and ⋮ on the right. There's no back arrow and no "Updated … ago".

## 1. What changed

### The row (`src/features/trips/plan/TripTopBar.tsx`, new; `app/trip/[id].tsx`)

- **The weather button**, the largest (58 tall). It shows the selected day's sky icon, its high in the title font ("30°"), a short sky word and the low ("Some sun · Low 24°").
  - **Warnings:** a day with a warning gets a mark on the sky icon (red for a storm, amber otherwise), and screen readers hear it.
  - **Old forecast:** when the refresh failed or the forecast is over 3 hours old, it looks quieter and says how old ("2 h ago") in place of the low.
  - **No forecast yet:** "Forecast later". Before the forecast loads: "Weather".
  - **Tap:** it opens the weather screen on that day. Refreshing lives only there (pull down, or its Refresh button); the trip screen's own refresh is gone.
  - **Short words:** on a 360 dp phone the row left the words about 36 dp, so "Partly cloudy" was cut to "Part…". The button now uses short sky words (`conditions.skyShort`: "Some sun", "Storms", "রোদ", "কিছু মেঘ"…); the weather screen still says the full words.
- **Map options** (layers icon) opens a small panel under the row, as in frame 12. The button turns blue while it's open. The panel has:
  - "Map type": Default or Satellite, as two small pictures with the chosen one ringed;
  - "3D view": the whole row is the switch, not only the switch (Expo's dev button sat over the switch on the phone, which showed the gap);
  - "Show the whole day" (when the day has more than one stop).
  - A tap outside, or the phone's Back, closes it.
- **Full map** is its own button, as before. In Full map the plan comes back from "Show the plan", and the phone's Back returns to the plan first.
- **⋮** is for the owner only, as before.
- **Icons** are the frames' line drawings (`LineIcon`: layers, full map, more, cube, show the day).

### The phone's Back

With no back arrow:

- The map options panel closes first.
- Full map returns to the plan.
- Sheets close themselves (as they already did).
- Then Back leaves the screen to wherever the trip was opened from.

### The map (`DayMap.tsx`)

- Its own row (Satellite, 3D, Full map) is gone: satellite and 3D come from the panel.
- The room kept at the top when framing the day is recalculated for the new row (and a stay's pin, which stands above its spot).
- The map's credit ("i") moved from the top right, where the row now is, to just above the plan sheet. The satellite credit stays at the bottom left. Both are visible.

### The plan sheet's weather chips (`ConditionChips.tsx`)

They say only what the button doesn't, as in frame 11:

- the warnings, or "No warnings" in green when the forecast has none;
- sunset;
- the sea in a word ("Sea calm", "Some waves", "Rough sea").

The temperature chip is gone; the button says it. The rest of the sheet is step 14's and wasn't touched; the button's other states are step 17's.

### Taken away

The back button, the "Updated … ago" pill and its refresh, the fit-the-day button (now "Show the whole day" in the panel), the trip screen's refresh code, `RoundButton`, and their styles.

## 2. How it was checked

On the USB phone as test account A (dev build), trip 132 (Cox's Bazar).

| Checked on the phone | Result |
|---|---|
| The row | "30° Some sun · Low 24°" in full, then map options, Full map, ⋮. Before the short words: "30° Part… · Low …". |
| Map options | The panel as in frame 12. Satellite turned the map to imagery with its credit; 3D switched on from the row; "Show the whole day" closed the panel and framed the day. |
| Back with the panel open | Closed the panel; still on the trip. |
| Full map, then Back | Back on the plan. |
| ⋮, then Back | The menu closed; still on the trip. |
| Weather, then Back | The weather screen for the day, then back on the trip. |
| Opened from a link, then Back | Left to the tabs. |
| Opened from the map | The trip capsule opens Today (the trip is on); Today's "Full plan" opens the trip; Back → Today, Back → the map. |
| Opened from the Trips tab | "Open plan" on the trip that's on opens Today (D20), then as above. |
| Opened from a chat card (conversation 1, message 43) | The trip, with the new row; Back → the chat. |
| Release build: open the trip 10 times | 10 of 10: the weather button, map options and the plan sheet were drawn every time. Back left the screen each time. |

## 3. Checks

| Check | Result |
|---|---|
| `npx tsc --noEmit` | clean |
| `npx eslint . --max-warnings 0` | clean |
| `npx jest` | 734 of 734 passed (11 new in `tripTopBar.test.tsx`: what the button says when loading, without a forecast, old, with warnings; the owner's and a friend's row; Full map gone in Full map; the panel's map type, 3D (switch and row), whole day, a tap outside) |

`tripConditions.test.tsx` now checks the weather button and the new chips. Refreshing is tested on the weather screen. Maestro `09-journey` taps `trip-weather` instead of `conditions-pill`.

## 4. Left open

- **The button's other states** (now, "as it was", too early) are step 17's.
- **The plan sheet's other content in frame 11** (the chip beside the name, the budget row, the day tabs' sky icons, the "From …" row) is step 14's.
- **The dev app** was rebuilt (debug) after the release check: building the friends' APK regenerates the Android folder and had removed the old debug build. The fresh install also cleared the performance monitor overlay.

## Files

- New: `mobile/src/features/trips/plan/TripTopBar.tsx`, `mobile/src/__tests__/tripTopBar.test.tsx`
- `mobile/app/trip/[id].tsx`, `mobile/src/features/trips/plan/DayMap.tsx`, `mobile/src/features/trips/conditions/ConditionChips.tsx`, `mobile/src/ui/LineIcon.tsx`
- `mobile/src/i18n/en.json`, `bn.json`
- `mobile/src/__tests__/tripConditions.test.tsx`, `mobile/.maestro/09-journey.yaml`
- `docs/ui-refresh/prompts.md` (Status table), this report

## Git

Committed by the agent on `main`, with no co-author line. Nothing was pushed.

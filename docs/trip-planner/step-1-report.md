# Trip Planner Step 1 Report: Design Mockups

**Date:** 2026-10-18 · **Status:** mockups ready; waiting for your review
**Plan:** `docs/trip-planner-plan.md`, step 1

## 1. What was made

- **Mockups:** 13 phone screens on one design canvas: https://claude.ai/artifact/LQuSxSaKiQ8SAiZkHk6Wzf. The link is private to your claude.ai account, so open it signed in.

  | Row | Screens |
  |---|---|
  | 1 · Plan a trip | Trips tab → New trip 1/3 (where, when, travellers) → 2/3 (interests, pace, budget, getting there) → 3/3 (building the plan) |
  | 2 · The trip screen | Map + sheet → sheet pulled up (full day) → **drag and drop (works)** → stop details → travel leg (choose walk, rickshaw, CNG or car) |
  | 3 · Live, money, trip day | Conditions and warnings → Budget → Today mode → the plan in light theme and Bangla |

- **Clickable:** press Play on a screen to tap through: Trips → Plan a trip → … → See your plan → stops, legs, budget, conditions.
- **Working controls:**
  - interest chips, pace, budget tier and getting-there choices;
  - number of travellers;
  - the stop's stay length and "keep this time";
  - the travel mode;
  - "Running late?" and the reminder switch.
- **Drag and drop:** tap a stop to lift it, then move it. The times, travel legs and warnings recalculate (for example, moving the dinner at the Night Market earlier warns that it opens at 18:00). Dropping a stop on Day 2 or 3 moves it off the day, and Undo restores it.
- **Theme:** every screen except the Bangla one has a dark/light switch under Tweaks.
- **Design spec:** `docs/trip-planner/design-spec.md` (colours, components, motion, wording, accessibility).
- **Mockup sources:** `docs/trip-planner/mockups/`.

## 2. Real data versus sample data

- **Real (from the Vromon database):** places, restaurants, hotels, opening hours, visit lengths, ratings and prices for Cox's Bazar. For example, Sea Crown Hotel at ৳3,500 a night, and 13 places matching beach, nature and food.
- **Sample:** weather, sea state, sunrise and sunset, traffic, road distances and times, rickshaw and CNG fares, and the bus fare. These show the design only; steps 4 and 5 fetch them for real. A note on the canvas says the same.

## 3. Found while doing this

1. **Planner bug (not fixed; it belongs to a code step):**
   - The planner picks meal restaurants at random without checking their hours. Your current Cox's Bazar trip has breakfast at Beach Garden Restaurant at 09:00, but it opens at 12:00.
   - The validator only checks activity hours, so this passed as "All constraints satisfied".

   Added to step 3 of the plan.
2. **Contrast:** a lighter card colour (`#3D3D3D`) in dark mode failed AA for blue links (4.15:1) and grey captions (3.96:1). The mockups now use the existing `bg`/`surface` tokens (4.83:1 and 4.6:1).
3. **A date error in the plan** ("Sun 19 Oct"): 19 Oct 2026 is a Monday. Fixed.

## 4. Checks

- Every text and background colour pair was computed against WCAG AA (§3.2). White on the dark-theme accent is 4.06:1, as before (the approved Phase 1 exception).
- I have not looked at the rendered canvas myself. Please open it and tell me anything that looks wrong: a cut-off line, an overlap, or a screen that doesn't respond to taps.
- No app or backend code changed in this step.

## 5. Not done

- **Old test trips are not deleted.** That needs your yes.

## 6. Your decisions

1. **The look:** approve it, or tell me what to change (per screen is fine, or leave comments on the canvas).
2. **Delete about 45 old test trips** on your dev account (the E2E accounts stay)? Yes or no.
3. **Three design choices to confirm or change:**
   - **Sunset orange** as the trip's own colour (the next-trip card and Today), with blue kept for buttons.
   - **A map-first trip screen**, with the plan in a sheet.
   - **Rickshaw and CNG** as the default modes for short trips.

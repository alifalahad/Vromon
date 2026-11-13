# Step 2: App, choose where you stay; the stay and the way back on the map

**Goal:** the traveller can say where they'll stay (all nights or night by night), and sees the stay and the way back on the day map, in the plan, in Today mode and in the budget.
**Depends on:** step 1.

## Prompt

```
Follow docs/trip-upgrades: features.md F1, design.md §5 (step 2 rows) and §7, decisions D1–D3, rules.md.
Read reports/step-1-report.md for the API.

1. A place picker the app can reuse (step 6 needs it for "Put a pin on the map"):
   src/features/places/PlacePicker.tsx: a full-screen map with a centre pin, a search box for areas (start with
   destination places and districts; step 6 widens it), "Use this place", and an optional name field.
   The map uses androidView="texture". There's a non-gesture route: search, then "Use this place".

2. New trip, step 2 (app/trip/new.tsx), a "Where you'll stay" row like the interests row (InterestsSheet.tsx is the
   pattern), opening a sheet:
   - Hotel (recommended by budget): the hotel the budget level implies, with its price, and "Choose another"
     (the destination's hotels, priced first);
   - With family or friends (no cost): opens PlacePicker, with an optional label;
   - Day trips, no night here;
   - Decide later.
   "Different places on different nights" opens the per-night editor (shown when the trip has ≥ 2 nights).
   The budget card reacts at once. newTrip.ts sends `stay` or `stays` (unit tests for the payload).

3. Trip screen (app/trip/[id].tsx, plan sheet):
   - a "Tonight" row for the selected day ("Tonight: Hotel Castle Salam · Change"; "Tonight: with family (Uncle's
     house)"; on the last day "Last day: leave from …"), opening a StaysSheet (the per-night editor:
     src/features/trips/plan/StaysSheet.tsx) that saves with PUT /stays and shows the budget change in a snackbar.
     PUT /stays keeps every stop's time (step 1 report): when the response's validation has BACK_LATE for a day,
     show it on that day ("Back at 20:45, after 20:00") with "Re-plan this day" (POST /trips/{id}/days/{day_id}/regenerate);
   - DayMap: a stay pin (bed icon for hotels, house icon for homes; new colour token in contrast.test.ts), the leg
     from the stay to the first stop and the leg back, drawn like the others (from the route API's from_base/to_base);
   - the plan list: a first row "From <stay> · 15 min" and a last row "Back to <stay> · 25 min · ৳80";
   - for viewers who aren't the owner, a home shows as "Staying with family", with no pin (the API redacts it;
     check the app shows nothing more).

4. Today mode (app/trip/today/[id].tsx, today.ts, useTripToday.ts): "leave by" from the day's start base; a
   "Back to …" line after the last stop; the map's stay pin.

5. Budget screen (app/trip/budget/[id].tsx): stay lines per block, "no cost" for family/friends and day trips,
   "not chosen yet" for undecided.

6. i18n (en, bn), accessibility, jest tests for the sheets, the payload and the plan rows. typecheck, lint, jest.

7. On the phone as test account A:
   - make a 3-day Khulna trip with "nights 1–2 hotel, night 3 with family";
   - check the map pins and the way back on each day, the move day (day 3 starts at the hotel, ends at the home),
     the budget lines, and Today mode;
   - as B (over the API or a second device if available), confirm the home is redacted;
   - repeat a release-build check (rules.md) of opening the trip 8 times with the new pin and legs.
   Describe each screenshot in the report.

Write reports/step-2-report.md, update the Status table, give the git commands, stop.
```

## Done when
- A traveller can choose all four kinds, for all nights or per night, and change them later.
- Each day map shows the stay pin, the leg out and the leg back. The plan list has the "From" and "Back to" rows. Today mode and the budget agree.
- Homes are hidden from anyone but the owner.

## The owner checks
On your phone (dev app), with a test trip:
- Choosing "With family or friends" makes the stay cost disappear from the budget.
- The day map shows where you sleep, and the way back after the last stop.

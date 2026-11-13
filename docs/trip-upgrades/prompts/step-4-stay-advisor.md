# Step 4: Stay advisor, a better place to sleep for later nights

**Goal:** when sleeping somewhere else for some later nights clearly saves money and/or road time, after counting the hassle of moving, Vromon shows a card with the numbers until the traveller decides.
**Depends on:** steps 1–2 (stays) and 3 (meals; a "where I stay" meal moves with the stay).

## Prompt

```
Follow docs/trip-upgrades: features.md F2, design.md §2 (0032), §3 (stay-suggestions rows), §4 "Stay advisor",
§5 (step 4 row), decisions D4–D5, rules.md.

Backend:
1. Migration 0032_stay_suggestions. Migration test.
2. backend/app/services/stay_advisor.py:
   - fingerprint(trip): a hash of the stays, dates, travellers, each day's stops (ids and order), meal plan, and
     the candidate hotels' prices.
   - candidates(trip): per later block of ≥ 1 night (never a night that has already started), hotels that are
     active, price known, rating ≥ 3.5, within 3 km of that block's days' stop centroid, or in a must-see town
     (example: Mongla for the Sundarbans), excluding the current one.
   - evaluate(trip, block, hotel): money_saved, minutes_saved, extra_moves, exactly as design.md §4. Road minutes come
     from the same travel estimates the planner uses (ORS matrix when available, else its estimate), the transfer by
     the cheapest sensible local mode, and 45 min of hassle per move.
   - suggestions(trip): apply D4's rule and D5's weight; at most 2, best first; reuse stored rows (status), returning
     a dismissed one only if its saving grew by more than 25%, and a not_now one only after the fingerprint changed.
3. API: GET /trips/{id}/stay-suggestions (computed on demand and cached by fingerprint);
   POST …/{sid}/accept (splits the stays through the same code as PUT /stays and re-times the affected days; meals
   "where I stay" follow the new stay), …/not-now, …/dismiss. Owner only (room members and friends 404 for writes;
   reads are owner-only too: it's about money).
4. "Ways to save" (budget service) lists the open stay suggestions in place of its old cheaper-hotel line, so
   there's one source of truth.
5. Tests:
   - the Khulna/Mongla shape: a Sundarbans day far from the city hotel → suggest one night in Mongla, with the
     numbers;
   - a cheaper hotel next door → suggest for money;
   - a tiny saving → no suggestion;
   - no hopping every night;
   - dismissed stays dismissed until +25%;
   - not_now returns after a plan change;
   - accept re-times the days and keeps pinned stops;
   - the numbers match a hand calculation in the test.

App:
6. A StayAdviceCard above the affected day in the plan sheet: "Sleep in Mongla for night 3?", the hotel, its price
   against the current one, "Saves ৳1,700 and 1 h 50 min on the road · one extra check-out and check-in",
   [Switch] [Not now] [Don't suggest this], and "Why?" (a sheet with the arithmetic in plain words).
   Switch → snackbar with Undo (Undo restores the previous stays through PUT /stays).
   The card refreshes when the plan changes (invalidate the query on every edit).
7. Budget screen: the suggestion in Ways to save, with the same three buttons.
8. i18n en/bn (amounts in the trip's currency, Bangla digits), accessibility (the numbers read as one sentence),
   jest tests; typecheck, lint, jest.

Phone (test account A): a 4-day Khulna trip with a Sundarbans day; check that the card appears with sensible
numbers, Switch moves the night and changes the map and budget, Undo restores it, Not now hides it until a change,
and Don't suggest keeps it hidden.

Write reports/step-4-report.md, including two worked examples with real numbers. Update the Status table, give the
git commands, stop.
```

## Done when
- The card appears only when D4's rule says it's worth it, and its numbers match the report's worked examples.
- Switch, Undo, Not now and Don't suggest all behave as described.

## The owner checks
- On a Khulna trip with a Sundarbans day, Vromon suggests sleeping in Mongla that night, and the money and time it shows make sense to you.

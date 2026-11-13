# Step 3: Meals, restaurants by default, or your own food, or where you stay

**Goal:** per meal (and per day), the traveller can keep Vromon's restaurant suggestions (default), bring their own food, or eat where they stay. The plan, the map and the budget follow.
**Depends on:** steps 1–2 (where you stay).

## Prompt

```
Follow docs/trip-upgrades: features.md F3, design.md §2 (0031), §3 (meals rows), §4 "Meals", §5 (step 3 rows),
decision D6, rules.md.

Backend:
1. Migration 0031_meal_plan (trip_preferences.meals_json, itineraries.meals_json, itinerary_items.meal_source),
   with defaults that keep today's behaviour (all "restaurant"). Migration test.
2. Planner (itinerary_service.py, cpsat_scheduler.py, editing tools that rebuild meals):
   - restaurant: as today;
   - own: a 30-min meal item, meal_source "own", no restaurant. Lunch goes at the stop where the traveller is at
     12:30–14:30, preferring a park, scenic or beach stop; breakfast before the first stop; dinner after the last
     stop. No restaurant leg. Title "Packed breakfast/lunch/dinner".
   - stay: breakfast and dinner only; breakfast at the start base before the first leg, dinner at the end base after
     the way back (so it's outside "finish by"); no restaurant, cost 0.
   - A per-day override wins over the trip's plan.
3. Budget: food counts restaurant meals as today, own meals × own_cost_per_person × travellers (0 when unset),
   stay meals 0; the food part's detail lists the counts by source. budget/ai.py gets the meal plan.
4. API: PUT /trips/{id}/meals and PUT /trips/{id}/days/{day_id}/meals (null clears), each rebuilding only the meal
   items of the affected days and keeping everything else; TripCreate accepts an optional `meals`.
   Privacy matrix (owner ✓; room member and friend read-only; stranger 404).
5. Tests: each source places the meal right; lunch with "own" lands at a stop and adds no travel; stay dinner is after
   the way back; the budget counts; the override wins; an untouched trip plans exactly as before (compare a fixed
   seed's output).

App:
6. New trip step 2: a "Meals" row ("Best places to eat") opening a sheet with, per meal, Restaurant / Bring my own /
   Where I stay (breakfast and dinner only), and an optional "Amount per person for your own food" in the trip's
   currency (currency.ts). When the stay is family/friends, show the one-tap suggestion "Have breakfast and dinner
   there?" once.
7. Trip screen: the day menu's "Meals today" (override sheet); meal rows by source (a restaurant card as today;
   "Packed lunch (your own)"; "Breakfast where you stay"), and "Places to eat nearby" still reachable from a packed
   meal row (it opens the existing suggestions for restaurants near that time and place).
8. Budget screen: the food line's breakdown by source.
9. i18n en/bn, accessibility, jest tests; typecheck, lint, jest.

Phone (test account A): a trip with "lunch: bring my own" and "family stay with breakfast and dinner there":
check the day plan, the map (no restaurant legs for those meals), Today mode and the budget.

Write reports/step-3-report.md, update the Status table, give the git commands, stop.
```

## Done when
- Restaurants stay the default, and the other two choices change the plan, the map and the budget as described.
- A trip that doesn't touch meals plans exactly as before.

## The owner checks
- "Bring my own lunch" gives a short packed-lunch break at a nice stop, with no restaurant and no cost.
- "Where I stay" puts breakfast before you leave and dinner after you're back.

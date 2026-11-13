# Step 3 report: meals, restaurants by default, your own food, or where you stay

**Date:** 2026-11-12. **Status:** built and tested (pytest, jest, typecheck, lint, the API as test accounts A and B), and checked on the phone as test account A.

## What changed

| Where | Change |
|---|---|
| Data | Migration `0031_meal_plan`: `trip_preferences.meals_json` (the trip's plan), `itineraries.meals_json` (a day's own plan) and `itinerary_items.meal_source` (`restaurant` / `own` / `stay`). Every meal planned before became `restaurant`; your database had 302. NULL means every meal at a restaurant, as before. Backup first: `backend/vromon-backup-2026-11-12-before-meals.db` (ignored by git). |
| Rules | `app/services/meals.py` checks a plan: lunch is never "where you stay", and the amount is 0–100,000. It also places meals where you stay and says when the traveller leaves and gets back. `TripRules.meals` holds each day's plan. Breakfast takes 60 min at a restaurant, 30 packed, and 0 where you stay, because then it's before leaving. |
| Quick planner | **Packed breakfast:** at the day's start. **Packed lunch:** 30 min at the stop just seen, about midday. If that stop isn't a park, a view or a beach, it first tries to fit one such stop and still have lunch by 14:30. **Packed dinner:** after the last stop; the day keeps 30 min for it before the way back. **Breakfast where you stay:** ends when you leave. **Dinner where you stay:** starts after you're back, not before 19:00. Neither of those has a restaurant or a leg. There's no breakfast at the stay on day 1 when you arrive at a set time, and no dinner there on the last day (there's no night). |
| Optimiser | The lunch interval takes its source's length. Dinner is an interval only at a restaurant. A packed dinner keeps 30 min before the last arc back. Own and stay meals are written out the same way as in the quick planner. |
| Edits | **Reorder, move and add:** meals where you stay aren't counted as positions. They re-time themselves after every edit, and running late doesn't push them. **Changing meals:** only those meals change. Each takes the old one's place, and the day is re-timed from the first change. **A whole new plan:** keeps each day's own meals. |
| Checks | Meals where you stay are outside the day on purpose, so they get no early or late warnings. "Back at the stay" counts a packed dinner eaten after the last stop. Own and stay meals aren't flagged as placeholder prices. |
| Budget | Food counts restaurant meals at their price. Own meals cost the amount × travellers, or 0 when no amount is given. Meals where you stay cost 0. The food line says "1 at a restaurant · 2 packed · 5 where you stay". The AI estimate is told about the plan. |
| API | New endpoints: `PUT /trips/{id}/meals`, and `PUT /trips/{id}/days/{day_id}/meals` (`null` follows the trip's plan again). Both rebuild only the meals of the days they affect, and return the days, the validation and the budget change. `POST /trips` accepts `meals`. "Places to eat nearby" is `GET /trips/{id}/items/{item_id}/places-to-eat`: restaurants open for an hour then, nearest the stop before it. To eat at one after all: `PUT …/items/{item_id}/restaurant`. Owner only for changes; friends and room members can read; others get 404. Documented in `docs/architecture.md`. |
| New trip | A **Meals** row ("Best places to eat") opens a sheet with three choices per meal: Restaurant, My own, or Where I stay (breakfast and dinner only). It also takes an optional amount per person for your own food, in the trip's currency. With a family stay, a card asks once: "You're staying with family or friends. Have breakfast and dinner there?" [No thanks] [Yes]. |
| Trip screen | **Menu:** gets **Meals today** (with "Same as the whole trip") and **Meals for the whole trip**. **Breakfast where you stay:** a plain row before "From …". **Dinner where you stay:** a row after "Back to …". **Packed meals:** the card says "Packed lunch (your own) · At Laboni Beach · ৳150 each" and has **Places to eat nearby**. That opens a list of restaurants; the owner can pick one. **The ride on:** after a packed meal, it shows after the meal, on the timeline strip too. **Map:** no restaurant legs for these meals. |
| Today mode | Packed meals and meals where you stay are named the same way ("NOW · Packed lunch (your own)"). "Leave by" counts from the stop where you ate. |
| Strings | `meals.*` in English and Bangla. |

**Files:**
- Backend:
  - New: `alembic/versions/20261112_0031_meal_plan.py`, `app/services/meals.py`, `tests/test_meals.py` (18 tests).
  - Changed: `app/models/models.py`, `app/schemas/schemas.py`, `app/api/v1/endpoints/trips.py`, `app/services/itinerary/{trip_rules,itinerary_service,cpsat_scheduler,editing_service,late_service,constraint_validator}.py`, `app/services/budget/{service,ai}.py`.
- App:
  - New: `src/features/trips/meals/{meals.ts,MealsSheet.tsx,MealsRow.tsx,StayMealRow.tsx,PlacesToEatSheet.tsx}`, `src/__tests__/meals.test.tsx`.
  - Changed: `app/trip/{new.tsx,[id].tsx}`, `app/trip/today/[id].tsx`, `app/trip/budget/[id].tsx`, `src/features/trips/new/newTrip.ts`, `src/features/trips/plan/{PlanRows.tsx,timeline.ts}`, `src/services/api.ts`, `src/types/index.ts`, `src/i18n/{en,bn}.json`.
  - Tests: `newTripScreen`, `tripPlan`, `tripBudget`.
- Docs: `docs/architecture.md` ("Meals").

## How it was checked

**Tests:**
- Backend `pytest -q`: **778 passed, 9 skipped** (760 before; 18 new). `test_meals.py` covers:
  - checking a plan;
  - an untouched trip planning to the minute the same as one with every meal at a restaurant, on both planners;
  - a packed lunch at a stop, with no restaurant and no leg, and the stop named;
  - packed breakfast before the first stop and dinner after the last, back by "finish by", on both planners;
  - breakfast at the stay ending when you leave and dinner starting after the way back, with none on the last day, on both planners;
  - the budget by source, and own food at 0 with no amount;
  - changing the trip's meals keeping every stop;
  - a day's plan winning, surviving a whole new plan, and clearing;
  - meals at the stay following running late;
  - lunch at the stay refused;
  - a draft keeping its plan;
  - who may change meals (owner yes; friend and room member read only; stranger and blocked 404);
  - places to eat nearby and eating there after all.
- App `jest`: **61 suites, 615 tests pass** (13 new). `tsc` and `eslint app src` are clean.

**Over the API, trip 120** (test account A): Khulna, 27–29 Nov, 2 travellers. Nights 1–2 at "Uncle's house". Meals: breakfast and dinner at the house, packed lunch at ৳150 each. Planned by the optimiser.

| Day | Breakfast at the house | Packed lunch | Dinner at the house |
|---|---|---|---|
| 1 | 08:16–09:01, leaves 09:01 (first stop 09:05, 4 min away) | 13:12, "At বড় বাজার, খুলনা" | 19:00, back 14:47 |
| 2 | 08:16–09:01 | 12:15, "At Pankhali Dolphin Sanctuary" | 19:00, back at 17:36 |
| 3 (last) | 08:15–09:00 | 12:00, "At House of Sir Prafulla Chandra Roy" | none: no night there |

- Every route has only `from_base`, the legs between sights and `to_base`, with no restaurant legs.
- Food: **৳900** = 3 packed lunches × ৳150 × 2. Counts: own 3, stay 5, restaurant 0.
- As **B**: the trip reads with the same meals; `PUT /meals` → **404**.

**On the phone** (dev app, test account A, trip 120):
- **Day 1 map:** the house pin west of town, roads between the sights only. The packed lunch has no pin of its own: it's eaten at stop 3.
- **Day 1 plan:**
  - "08:16–09:01 · Breakfast where you stay · No cost", then "From Uncle's house · 7 min".
  - Stops 1–3, then "Packed lunch (your own) · At বড় বাজার, খুলনা · ৳150 each · Places to eat nearby", then the ride to the cathedral.
  - At first that ride showed *before* the lunch; fixed.
  - "Back to Uncle's house · 7 min · ৳170", then "19:00–19:45 · Dinner where you stay · No cost".
- **Places to eat nearby:** restaurants open at 13:12, nearest first (0.3 km, 0.3 km, 0.5 km…), each with "Eat here".
- **Menu → Meals today:** "Meals on day 1", with "Same as the whole trip" on and the trip's choices greyed. I turned it off, chose Restaurant for lunch, and saved. Lunch became "Lunch · D Café and BBQ Restaurant" for 1 h, and the cathedral moved from 13:42 to 14:12.
- **Today mode** (the development build's clock at day 2, 12:20): "NOW · 12:20 · Packed lunch (your own) · Until 12:45". The next stop counts from the sanctuary.
- **Budget:**
  - Stay ৳0, with "Nights 1–2 · Uncle's house · No cost".
  - Food ৳1,200, with "1 at a restaurant · 2 packed · 5 where you stay" (after the day-1 change).

## Differences from the prompt, and why
- **"Meals today" is in the trip's ⋮ menu**, next to "Meals for the whole trip". The trip screen has no separate day menu.
- **"Places to eat nearby" is new.** The app had no restaurant suggestions to reuse, so a small endpoint lists restaurants open then near the stop. Picking one changes only that meal.
- **The amount for your own food is set for the whole trip.** A day's own plan uses the trip's amount.
- **Meals where you stay aren't stops.** They aren't numbered or dragged. They sit before "From …" and after "Back to …".
- **No release-build check this step.** No map overlay or start-up change was added; the new sheets are the same component that passed step 2's 8/8 release check. Step 8 repeats the release checks.

## Left open
- **The optimiser doesn't count the ride after a lunch.** That's old behaviour for restaurant meals; with a packed lunch the next stop can start right when lunch ends. The quick planner and the edits count it. In trip 120 the optimiser's road estimate to Dhangmari (53 min) was also shorter than the road time that came later (1 h 23 min). Today mode then said "Leave now" during lunch; that's the old estimate-vs-road issue, not meals.
- **The optimiser doesn't look for a nicer stop for a packed lunch.** It eats at the stop it's at; only the quick planner tries a park, a view or a beach.
- **Data:** some restaurant "cuisines" are raw categories ("fast_food_restaurant"); the app shows them with spaces. Most restaurant prices are unknown.
- **The New trip's suggested budget doesn't drop for packed meals or meals at the stay.** It follows the level, as before. The trip's budget screen counts them.
- **The phone's dev app is signed in as test account A**, so you can look at trip 120 yourself. Sign out and back in with your own account when you're done. The friends' share backend (port 8002) still runs older code; step 8.

## Git commands for the owner
```bash
cd ~/Codes/Vromon
git add -A
git commit -m "Trip upgrades step 3: meals at a restaurant, your own food, or where you stay"
git push origin main
```
Steps 1 and 2 aren't committed yet either, and their changes share files with this step, so this one commit holds steps 1–3.

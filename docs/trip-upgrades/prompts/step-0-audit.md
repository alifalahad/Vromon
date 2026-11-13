# Step 0: Audit, test accounts and decisions (no app code)

**Goal:** confirm how things work today, record a baseline, and get the owner's answers to D1–D10, so the later steps build on facts.
**Depends on:** nothing.

## Prompt

```
Read docs/trip-upgrades/README.md, rules.md, features.md, design.md (all of it) and decisions.md.
This step writes no app code.

1. Test accounts (rules.md, "Testing safely"):
   - `python3 scripts/e2e/session.py A` and `B` both print a token; GET /api/v1/friends as A lists B.
   - git still ignores .env.e2e.local. Don't print passwords.

2. Audit, confirming or correcting design.md §1 with file:line references:
   - Every place the backend uses "the trip's hotel": `_pick_hotel`, `_hotel(db, trip)`, `hotel_id`,
     `recompute_day(…, hotel)`, `day_legs`, late_service, the CP-SAT depot (node 0), the itinerary and route
     responses, budget/ai.py. List each call site with what it needs in future (a start point, an end point, a
     price per night).
   - Every place the app uses `itinerary.hotel` (Today mode, useTripToday) or shows the stay (budget screen).
   - How others read a trip: rooms.can_read_trip, the friends' read-only view, chat trip cards. Which fields would
     need redacting for a family/friend home (D2).
   - Meals: MEAL_SLOTS, _pick_meal, _meal_item_at, how lunch moves, how the budget counts food.
   - Rating: FeedbackForm.tsx, the feedback table and endpoints, where TripDetails shows it, tripPhase().
   - Search: AddStopSheet.tsx → suggestions_for_day; what happens with no match; what a stop needs (a places row).
   - Data for "search anything": what's in data-platform/raw (osm_overpass, overture_places), the Overture
     connector's category filter (connectors/service_places.py), whether duckdb/rapidfuzz are installed where
     needed (data-platform/.venv, backend/venv), and whether the ORS key can call /geocode/search
     (one call, text "Khulna", boundary.country=BD; report status code and result count only).

3. Baseline, as test account A on the phone (writes are fine for A):
   - Plan a 3-day trip to Khulna (Comfort, 2 travellers). Screenshot the plan and the budget.
   - From the API, for each day: the last stop's end time, the minutes back to the hotel
     (GET /trips/{id}/budget legs), and how far that overruns "finish by". This is the D3 evidence.
   - In free time, search "college", "BL College", "Sonadanga" and "hospital" in Add a stop; record what comes back.

4. Ask the owner the decisions in decisions.md (D1–D10), showing each recommendation, and record the answers
   with the date in decisions.md.

Write docs/trip-upgrades/reports/step-0-report.md (audit tables, baseline numbers, answers, any corrections to
design.md, which you also make in design.md) and update the Status table. Stop.
```

## Done when
- Both test accounts work, and the report lists every hotel / meal / rating / search call site with what changes.
- The baseline numbers are recorded (how much each day overruns "finish by" because of the way back).
- D1–D10 have answers in `decisions.md`.

## The owner checks
- The decisions read right to you, and the baseline matches what you see in the app.

# Step 1: Backend, where you stay (night by night) and the way back

**Goal:** the backend knows where the traveller sleeps each night (hotel, family/friends, none, undecided), each day starts and ends there, the way back counts, and stays are priced per night.
**Depends on:** step 0 (answers to D1–D3).

## Prompt

```
Follow docs/trip-upgrades: features.md F1, design.md §1 "Audit findings", §2 (0030), §3 (stays rows), §4 "Where a day
starts and ends" and "Stay costs", decisions D1–D3 and D11, and rules.md. Compare against the baseline trip (test
account A, trip 117) in reports/step-0-report.md. Use step-0-report.md's list of hotel call sites.

1. Migration 0030_trip_stays (design.md §2), with the backfill: one hotel stay over all nights for every trip with a
   plan (the chosen hotel, else what _pick_hotel picks). Keep trip_preferences.hotel_id equal to night 1's hotel.
   Model TripStay; Trip.stays relationship ordered by first_night. Test it in tests/test_migrations.py.

2. backend/app/services/stays.py:
   - validate(stays, nights): covers 1..nights once, no gaps or overlaps, home needs lat/lon, hotel needs hotel_id
     (an active hotel of this destination, or of a nearby destination for a later block), label ≤ 80 chars.
   - bases(trip) → per day (start, end) points with kind and name, by the rules in design.md §4 (day d starts at
     night d−1's stay, ends at night d's; the last day ends at the last night's; none → origin or destination centre;
     undecided → destination centre, marked estimate).
   - stay_cost(trip) → per block and total (hotel price × nights × rooms; home/none 0; undecided unpriced).
   - pick_hotel(trip, near) replacing _pick_hotel's fallback (D11): a priced hotel with a real name (not an area name
     like "বয়রা,খুলনা": skip names that are only a place name / comma list), near the trip's stops, at the budget's
     level, else the nearest level; if none is priced, the best-rated real-named one with the cost "unknown".
     Test with Khulna's real shape (Standard: none priced; Budget: priced).
   - redact(stay, viewer) for D2.

3. Planners: replace the single hotel with each day's start and end in itinerary_service.py and cpsat_scheduler.py.
   The return leg counts inside the day window (D3): the quick planner reserves travel(last, end) before day_end;
   CP-SAT becomes a path from start to end. Update recompute_day, late_service, editing_service, day_legs and every
   other call site from step 0. Keep behaviour identical for a trip whose one stay is the hotel it had, except that
   the way back now fits inside "finish by".

4. Budget (services/budget/service.py): the stay part from stay_cost, with lines per block ("2 nights with family,
   no cost"); ways_to_save's cheaper hotel works per block. budget/ai.py gets the stays.

5. API (design.md §3): GET/PUT /trips/{id}/stays (PUT re-times only the affected days, keeps pinned stops,
   returns the stays, changed days and the budget delta); itinerary days get start_base, end_base and return_leg;
   GET …/days/{day}/route adds the from_base and to_base legs; `hotel` stays in the itinerary response for old app
   versions. POST /trips (TripCreate) accepts an optional `stays` list, or `stay: {kind, hotel_id?, label?, lat?, lon?}`
   for the whole trip; without either, today's behaviour.

6. Tests:
   - validation cases;
   - the D3 case: a base 40 minutes from the stops, where the plan must end its last stop early enough to be back
     by finish-by;
   - a home stay costs 0 and its legs still count in local travel;
   - a move day starts at stay A and ends at stay B;
   - the privacy matrix for /stays, the itinerary and route (owner ✓, room member redacted, friend with trips
     shared redacted, stranger 404, blocked 404);
   - old clients still get `hotel`;
   - /me/export includes stays; account deletion removes them.
   Re-run the whole backend suite.

7. As test account A over the API: on a 3-day Khulna trip, set nights 1–2 to a hotel and night 3 to a home with
   a label; read the itinerary, route and budget; record the numbers against step 0's baseline.

Document the API in docs/architecture.md. Write reports/step-1-report.md, update the Status table, give the git
commands, stop.
```

## Done when
- `pytest -q` passes, with the new tests above.
- Over the API, a plan's days end back at the stay by "finish by", and a home night costs 0.
- An old app version (the friends' current APK) still opens trips: the `hotel` field is still there.

## The owner checks
- Nothing visible yet, except that plans may end a little earlier in the evening because the way back now fits inside "finish by".

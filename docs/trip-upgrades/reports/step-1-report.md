# Step 1 report: backend, where you stay (night by night) and the way back

**Date:** 2026-11-12. **Backend only:** nothing changes in the app until step 2, except that plans now end early enough to be back at the stay by "finish by".

## What changed

| Area | Change |
|---|---|
| Data | Migration `0030_trip_stays`: table `trip_stays` (`first_night`, `last_night`, `kind` hotel/home/none/undecided, `hotel_id`, `label`, `lat`, `lon`). Backfill: every trip with a plan and at least one night got one hotel stay with the hotel it used before (25 trips in your database), so existing plans keep their hotel. Model `TripStay`, `Trip.stays`, `Trip.num_nights`. |
| Rules | `app/services/stays.py`: `validate` (covers the nights once, in order; a hotel within 80 km; a home needs a place; label ≤ 80); `bases` (day *d* starts at night *d−1*'s stay and ends at night *d*'s; the last day ends at the last night's; `none` = the trip's start point, else the destination's centre as an estimate); `freeze` (writes down the picked hotel when a plan is built); `pick_hotel` (D11: priced and real-named first, at or near the budget's level, near the centre; else the best-rated real-named one); `stay_cost`, `return_leg`, `stay_out` (hides a home from non-owners, D2). |
| Planners | Quick planner: the first leg comes from the day's start; the last visit leaves time to reach the day's end; dinner moves earlier by the way back when needed; the day's travel includes the way back. Optimiser (CP-SAT): a start and end per day instead of one hotel node; the last visit must leave time to get back; dinner ends early enough for the way back. Both write the stay down (`freeze`). |
| Edits | `recompute_day` takes the day's start and end (every edit, late-running, adaptation and room suggestion goes through `trips._hotel`, which now returns the trip's bases). |
| Validation | New soft check `BACK_LATE` ("Day 2: back where you stay at 20:45, after your day ends at 20:00"), 5 min tolerance. |
| Budget | The stay is priced per stay (`detail.blocks`); homes and day trips cost 0. Local travel runs from the day's start and back to its end, measured from the day's last stop or meal. "Ways to save" offers a cheaper hotel per hotel stay; applying it rewrites the stays and the undo restores them. The AI budget is told the stays. |
| API | `GET/PUT /trips/{id}/stays`; `POST /trips` accepts `stay` or `stays`; every day has `start_base`, `end_base`, `return_leg`; the route has `from_base` and `to_base` legs (one road request per day, as before); `hotel` is kept for older app versions (night 1's hotel). Homes are hidden from non-owners in the itinerary, trip, route, budget and stays. The export includes the stays; deleting the account removes them. Documented in `docs/architecture.md`. |

**Files:**
- Backend code: `app/services/stays.py` (new), `alembic/versions/20261112_0030_trip_stays.py` (new), `app/models/models.py`, `app/models/__init__.py`, `app/schemas/schemas.py`, `app/api/v1/endpoints/trips.py`, `app/services/itinerary/{itinerary_service,cpsat_scheduler,editing_service,trip_rules,constraint_validator}.py`, `app/services/budget/{service,ai}.py`.
- Tests: `tests/test_trip_stays.py` (new), `tests/test_trip_planner_step7.py`.
- Docs: `docs/architecture.md`.

## How it was checked

**Tests:**
- `pytest -q`: **758 passed, 10 skipped** (was 747/9 before the step; 12 new tests).
- `tests/test_trip_stays.py` covers: hotel-name and D11 picking; the cover rules (missing night, overlap, gap, unknown kind, home without a place, a long label, an unknown hotel); a home night costing 0; the move day; "back by finish-by" with a home 37 km from the sights, for **both planners**; the route's base legs; creating a trip with a stay; a day trip; the privacy matrix (owner sees all; a friend sees "home" only, with no way back, no base legs, no label; can't change it; a stranger and a blocked friend get 404); the export and account deletion.
- `tests/test_migrations.py` passes, so `0030` matches the model.

**On a copy of your database first:** the migration backfilled 25 stays, one for each planned trip with nights. Your Chattogram trip (116) keeps "New Grand Park Hotel". Then the real database was backed up to `backend/vromon-backup-2026-11-12-before-stays.db` (ignored by git) and migrated by restarting the dev backend.

**Over the API as test account A:**

| | Step 0 baseline | Now |
|---|---|---|
| Hotel picked for a new Khulna trip (Comfort, 2 travellers) | "বয়রা,খুলনা" (an area name), price unknown | **Hotel Royal International Ltd.** (Budget level, ৳2,800), stay **৳5,600** for 2 nights |
| Back at the stay (trip 117, re-planned with night 1 at the hotel and night 2 with family 17 km north) | 20:06, 20:09, 20:04 | **20:00, 20:00, 20:00**: dinner at 18:55 / 18:15 / 18:22, then 5 / 45 / 38 min back |
| Day 2 (the move day) | n/a | starts at the hotel, ends at "Uncle's house"; the route has `from_base` and `to_base` legs |
| Budget when the stays changed | stay unknown, total ৳11,870 | total ৳15,500 (the hotel night plus the rides from the family home) |
| Before re-planning, after the change | n/a | `BACK_LATE` on days 2 and 3 (back at 20:45 and 20:38): the warning works |
| Test account B (A's friend) reading trip 117 | n/a | stays `[hotel, home]` with no label or place; day 3's end is `{kind: "home"}` and nothing else, with no way back; `PUT /stays` → 404 |

## Differences from the prompt, and why
- **`PUT /stays` doesn't re-plan days.** It recomputes the legs and travel of the days whose start or end moved, keeps every stop's time, and reports any day that now gets back late (`BACK_LATE`, plus the budget before and after). Re-planning would replace stops the traveller may have chosen. Step 2 can offer "Re-plan this day" (the existing `POST /trips/{id}/days/{day_id}/regenerate`) next to the warning.
- **One-day trips** (no nights) keep using the picked hotel as their start and end, as before. There's no night to choose.
- **The way back is measured from the day's last stop or meal**, usually the dinner restaurant, for the plan, the route and the budget, so all three agree. Before, the budget measured from the last sight.

## Left open / for later steps
- **Edits don't time the first stop from the stay.** When stops are re-timed after an edit (`apply_order`), the trip from the stay to the first stop still isn't counted. This is old behaviour; the end of the day is covered by `BACK_LATE`.
- **The optimiser doesn't count travel to and from restaurants** (old behaviour). A visit can end at 17:45 with dinner starting at 17:45 somewhere else.
- **The friends' share backend (port 8002) still runs the old code.** It works against the migrated database (the new table is ignored there), so your friends see no change until the share restarts. Step 2 or step 8 restarts it.
- **Data, for the owner:** most hotels still have no price (82 of 937). D11 now prefers the priced ones, but in many destinations none exist, and the stay advisor (step 4) depends on prices.
- The test trips on account A (117, 118) are kept for step 2's phone checks.

## Git commands for the owner
```bash
cd ~/Codes/Vromon
git add -A
git commit -m "Trip upgrades step 1: stays night by night, the way back counts, D11 hotel picking"
git push origin main
```

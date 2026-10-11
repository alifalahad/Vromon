# Phase 9 Report: OR-Tools CP-SAT Optimization and Comparison

**Date:** 2026-10-12
**Status:** Implemented. Awaiting developer review. Phase 10 not started.

---

## 1. What Phase 9 adds

A formal optimizer that sits alongside the greedy baseline. Both use the same ranked candidates, day themes, meal restaurants and hotel, and both are checked by the same **independent validator**.

```
trip ──► ranking (unchanged) ──┬──► heuristic_v1 (greedy, default) ──┐
                               └──► cpsat_v1 (OR-Tools CP-SAT) ──────┼──► ConstraintValidator ──► response
                                       │                             │      (never trusts either)
                                INFEASIBLE / UNKNOWN ──► 422 + diagnostics; saved itinerary untouched
```

`POST /api/v1/trips/{id}/generate?algorithm=cpsat` (also on `/regenerate`). The default is still `heuristic`, so the mobile app's behaviour is unchanged.

### CP-SAT model (`backend/app/services/itinerary/cpsat_scheduler.py`)
| Kind | Content |
|---|---|
| Decisions | which place on which day (`x[p,d]`), start time, visiting order (route arcs), lunch/dinner start |
| **Hard constraints** | opening hours (open ≤ start, end ≤ close); day window after a 60-min breakfast; activities end by the preferred end time; each place at most once; excluded never; must-visit exactly once; ≤ max activities/day; travel time between consecutive visits (`AddCircuit` route through the hotel); no overlap with lunch (12:00–14:00 start) or dinner (from 19:00); activities + meals ≤ daily budget cap, when set |
| **Objective** (maximise) | Σ 1000 × (ranking score + 0.15 day-theme bonus) − 2 × travel minutes |
| Solver | deterministic work limit 5.0, 8 workers with `interleave_search`, seed 0, 15 s wall-clock safety cap |
| Statuses reported | `OPTIMAL`, `FEASIBLE` (with relative gap to the proven bound), `INFEASIBLE` (with diagnostics), `UNKNOWN`, `MODEL_INVALID` |

**Shared assumptions (both algorithms):** travel is straight-line (haversine) distance at 30 km/h, an **estimate, not road routing**. Travel to and from restaurants isn't modelled, and the return to the hotel isn't counted. Opening hours and costs come from the seed sample data, not verified sources.

**Intentional difference:** the baseline lets activities run up to 60 min past the preferred day end; CP-SAT treats the end as hard. The comparison reports this as `late_min`.

## 2. Phase 4 defects found and fixed

The validator didn't check opening hours, so the baseline's violations were invisible. Measured **before** the fix on four sample trips:

| Trip | Opening-hour violations | Repeated runs identical? |
|---|---|---|
| 2 days, Beach/Nature | 1 (Himchari Hilltop Viewpoint 16:16–17:16, closes 17:00) | No |
| 3 days, Food/Culture | 2 (Maheshkhali Island 13:52–17:52, closes 17:00) | No |
| 4 days, Adventure/Photography | 5 (Sunset Boat Ride 14:21–16:21, opens 15:00) | No |
| 1 day, no interests | 0 | No |

| Fix | File |
|---|---|
| Baseline checked only `arrive < close`, not `finish ≤ close`; after inserting lunch it also skipped the opening-time check. Both fixed. | `itinerary_service.py` |
| Baseline picked meals with `random.choice`. It is now seeded from the trip's inputs, so identical requests give identical itineraries. | `itinerary_service.py` |
| Validator gained three **hard** checks: `OUTSIDE_OPENING_HOURS`, `DUPLICATE_PLACE`, `DAILY_BUDGET_EXCEEDED` (all item costs vs `max_daily_budget`, when > 0) | `constraint_validator.py` |

After the fixes: 0 opening-hour violations, identical output on repeated runs. A regression test covers each fix.

## 3. Comparison results (actually run)

`venv/bin/python ../evaluation/optimization_comparison.py`: 9 fixed scenarios, in-memory DB seeded from `data/seed/`, each algorithm run twice. Full table: `evaluation/results/optimization_comparison_20261012_002511.md`.

> **Update (Phase 10, 2026-10-12):** a further baseline defect was found and fixed. The day-theme bonus (+0.15) could rank ordinary places above must-visit places (score 1.0), so the greedy planner sometimes ran out of time before reaching a must-visit. Must-visit places are now tried first. Rerunning the comparison (`evaluation/results/optimization_comparison_20261012_010644.md`): the heuristic now passes validation in **7/7** feasible scenarios (was 6/7), with 74 activities, score 59.92, 1983 travel minutes and 198 late minutes. CP-SAT's results are unchanged. The tables below are the original Phase 9 run.

**Totals over the 7 feasible scenarios**

| Metric | Heuristic | CP-SAT |
|---|---|---|
| Itineraries passing the validator | 6 / 7 | **7 / 7** |
| Hard violations | 1 (missed must-visit) | 0 |
| Activities scheduled | 76 | 83 |
| Sum of ranking scores | 61.52 | 66.58 |
| Estimated travel minutes | 2021 | 983 |
| Activity minutes past preferred end | 196 | 0 |
| Total runtime | 0.05 s | 16.4 s |
| Reproducible (2 runs identical) | 7 / 7 | 7 / 7 |
| Proven optimal | — | 4 / 7 (others FEASIBLE, gaps 0.4 %–14.2 %) |

**Deliberately conflicting scenarios**

| Scenario | Heuristic | CP-SAT |
|---|---|---|
| Laboni Beach both must-visit and excluded | Scheduled the excluded place → `EXCLUDED_PLACE_SCHEDULED` | `INFEASIBLE`: "Place … is both must-visit and excluded." |
| Must-visit Fish Market (06:00–10:00) with an 11:00 day start | Silently dropped it → `MUST_VISIT_MISSING` | `INFEASIBLE`: "Must-visit … does not fit in the daily time window" |

**How to read this honestly**
- CP-SAT did **not** dominate every metric. In `relaxed_short_day` and `week_packed` the heuristic's ranking-score total is slightly higher. Both times it got that by running 51 and 11 min past the day end, which CP-SAT forbids, or by accepting about 3× the travel.
- `FEASIBLE` results are **not proven optimal**. The gap column says how far from the bound they may be.
- These results cover 9 scenarios on one destination's sample data. They are not a general claim of superiority.
- The heuristic takes milliseconds; CP-SAT takes about 0.2–4 s per trip.

## 4. Changes made

| File | Change |
|---|---|
| `backend/app/services/itinerary/cpsat_scheduler.py` | **New.** Pure `solve()` model plus `CpSatItineraryService` (build problem from a trip, solve read-only, persist in baseline format) |
| `backend/app/api/v1/endpoints/trips.py` | `?algorithm=heuristic\|cpsat` on generate/regenerate. The CP-SAT path solves before deleting the old itinerary and returns 422 with diagnostics on failure. Response adds `meta.solver` and `validation`. |
| `backend/app/services/itinerary/itinerary_service.py` | Opening-hours and determinism fixes (section 2) |
| `backend/app/services/itinerary/constraint_validator.py` | Three new hard checks (section 2) |
| `backend/app/core/config.py`, `.env.example` | `OPTIMIZER_DETERMINISTIC_LIMIT`, `OPTIMIZER_TIME_LIMIT_SECONDS`, `OPTIMIZER_WORKERS` |
| `backend/pyproject.toml` | `ortools>=9.15.6755,<10` |
| `backend/tests/test_optimizer.py` | **New.** 37 tests |
| `evaluation/optimization_scenarios.json`, `evaluation/optimization_comparison.py` | **New.** Reproducible comparison |
| `docs/technology-decisions.md` | OR-Tools version and determinism decision |

Phase 8 self-check fixes are listed in `phase-8-report.md` §6b.

## 5. Commands executed

```bash
cd backend
venv/bin/pip install "ortools==9.15.6755"       # + pandas 3.0.6, protobuf 6.33.6, absl-py, immutabledict
venv/bin/python -m pytest tests/test_optimizer.py -q
venv/bin/python -m pytest -q                    # 141 passed, 3 skipped
venv/bin/python ../evaluation/optimization_comparison.py
DATABASE_URL=sqlite:///<scratch>/smoke.db venv/bin/uvicorn app.main:app --port 8766   # API smoke test, then stopped
```

## 6. Test results

| Suite | Result |
|---|---|
| Full backend suite | **141 passed, 3 skipped** (the skips are the optional live Gemini tests) |
| `test_optimizer.py` | 37 passed (about 15 s; the solver runs for real) |
| Mutation checks | Removing opening hours from the solver fails 5 tests, 3 of them via the **independent validator**. Restoring the old baseline closing-time bug fails 3 tests. |
| API smoke test (throwaway DB) | 2-day trip → `OPTIMAL`, `valid: true`, 2.8 s; contradictory request → 422 `INFEASIBLE` with the place named |

## 7. Manual verification steps

1. `cd backend && venv/bin/pip install "ortools==9.15.6755" "google-genai==2.25.0"` (already installed in your venv by me; `pip install -e .` currently fails because `pyproject.toml` references a missing `backend/README.md`)
2. `venv/bin/python -m pytest -q` → expect `141 passed, 3 skipped`.
3. `venv/bin/python ../evaluation/optimization_comparison.py` → compare the new `evaluation/results/optimization_comparison_*.md` with the table above. The numbers should be identical; that is the reproducibility claim.
4. Start the API, then in `/docs`: create a trip, run `generate` with `algorithm=heuristic`, then `algorithm=cpsat`. Compare `meta.solver.status`, `valid` and the timelines.
5. Conflict: `PATCH` the trip so one place ID is in both `must_visit` and `excluded_places`. `generate?algorithm=cpsat` → 422 naming the place. `GET /trips/{id}/itinerary` still shows the previous itinerary.
6. Repeat step 4's cpsat call. The schedule should be identical.

## 8. Known issues and limitations

- **Travel times are straight-line estimates**, not road routes. The 30 km/h speed is an assumption carried over from the demo.
- **Sample data:** opening hours, durations and costs are demo seed values, not verified.
- **CP-SAT is slower:** about 2–4 s for multi-day trips versus milliseconds. Long trips (5–7 days) return `FEASIBLE`, not proven `OPTIMAL`, within the default limit. Raise `OPTIMIZER_DETERMINISTIC_LIMIT` for tighter gaps.
- **Reproducibility** holds for the same OR-Tools version, worker count and limits. If the 15 s wall-clock cap is ever hit, the response says `reproducible: false`.
- **Not optimised:** the total trip budget (only the per-day cap is a hard constraint), hotel cost, and travel to restaurants.
- **Unchanged recommender behaviour:** a place that is both must-visit and excluded is still passed to the heuristic as a candidate, so the heuristic schedules it and fails validation. CP-SAT reports it as infeasible.
- **`regenerate_day` always uses the heuristic.** CP-SAT for a single day is not implemented.
- **The mobile app doesn't offer the `cpsat` option yet.** It still calls the default.
- **No Python lockfile yet** (carried over from Phase 8).

## 9. Next phase proposal: Phase 10, adaptation, saved trips, feedback, maps and budget

Re-check every remaining demo feature against the real app: regenerate day, remove/replace activity, adapt itinerary, duplicate/save/delete trips, feedback, map markers and routes, and budget breakdown. Re-validate itineraries after every edit, and record each feature's verified status in a feature inventory. Wire the Phase 8 explanations and the Phase 9 `cpsat` option into the mobile app.

# Phase 6 Report (Week 2): Generate, Persist, Retrieve and Display a Real Itinerary

**Date:** 2026-10-12
**Prompt:** `vromon_week_2_mobile_integration_prompt.md`, Prompt B (run after the developer approved Phase 5)
**Status:** Completed. Awaiting developer review.

---

## Phase status

- **Phase:** 6, itinerary generation and display
- **Result:** completed (physical-device check pending; see Known issues)
- **Context:** the repository already had generation (`POST /trips/{id}/generate`, greedy baseline and CP-SAT), persistence, an independent validator and an itinerary screen (Phases 4, 6, 9 and 10 of the main plan). Following Prompt B's scope gate, this phase **audited them against B3–B9, reproduced every gap with a failing test or UI check, fixed it and re-verified**. It did not rebuild the existing pipeline.
- **Endpoint naming:** Prompt B suggests `/itineraries/generate`. The project's existing convention is trip-scoped (`POST /trips/{id}/generate`, `GET /trips/{id}/itinerary`), and Prompt B says to use the existing convention, so no duplicate routes were added. A trip has exactly one current itinerary, so the trip ID is the itinerary ID.
- **Pipeline (unchanged, verified):** load the trip → eligible candidates (excluded and inactive places removed) → ranking → deterministic scheduler (or CP-SAT, solved before anything is deleted) → persist in one transaction → independent validation → typed response.

## Gaps found and fixed

| # | Gap (Prompt B ref.) | Evidence before the fix | Fix |
|---|---|---|---|
| 1 | **Overlapping Generate requests could duplicate days** (B4, B5) | Test reproducing a stale concurrent request: days `[1, 1, 2, 2]` | Delete by query instead of the cached list, plus a row lock on the trip (PostgreSQL); documented replace-on-regenerate; `replaced_previous` in the response |
| 2 | **No eligible places:** the old itinerary was deleted and meal-only days were saved as `valid: true` with no warning (B4, B9) | Test: 200, 0 places, no warnings | 422 with an explanation **before** anything is changed (both planners); the mobile app shows it with "Try again" |
| 3 | Responses were untyped dicts (B3) | — | Pydantic `GenerateResponse` / `ItineraryResponse` / `ValidationReportOut` (visible in `/docs`) |
| 4 | No generation status (B3, B6) | — | `status`: `valid` / `valid_with_warnings` / `invalid`, also on `GET …/itinerary` (re-validated against the trip's *current* constraints) |
| 5 | **Invented meal price** (300 BDT when no restaurant data) presented as a real cost; no missing-data warnings (B3, B7) | Test with restaurants disabled | Items carry `cost_source` (`data`/`placeholder`); `info` notes `PLACEHOLDER_MEAL_COST`; the budget keeps placeholders out of `known_total`; the app shows "Price unknown (est. ৳300)" |
| 6 | No currency on items; the budget summed any currency (B3, B7) | Test with one place priced in USD | `currency` per item; other currencies are excluded from totals and reported (`CURRENCY_MISMATCH`, `incomplete_reasons`) |
| 7 | **Activity ending up to 90 min after the user's day end was not reported** (B9 time boundaries) | Test: an activity ended 17:55 with the day ending 17:00, no warning | Validator: any activity past the preferred end → soft `AFTER_PREFERRED_END` (meals keep the 90-min dinner grace). The greedy baseline still allows a 60-min overrun by design; it is now always disclosed |
| 8 | Empty days not flagged (B6) | Test: 10-day trip, later days empty, no warning | Soft `NO_ACTIVITIES`; the app shows an empty-day note |
| 9 | **Match score shown above 100%** ("Match 106%"): the +0.15 day-theme bonus was stored as the ranking score and passed to the LLM explanation prompt (B3: explanation from real scoring features) | UI run | Both planners store the plain ranking score; the bonus still orders and optimizes. The comparison script adds the bonus itself, and its rerun reproduces the published totals exactly |
| 10 | Validation violations not linked to activities (B6) | — | `item_id` on violations; warnings shown on the affected activity card |
| 11 | Hard problems hidden behind "Details" (B6) | Phase 10 banner | Hard problems always listed; preference warnings and data limitations in separate groups |
| 12 | Itinerary screen had no overview or dated day labels (B6) | — | Overview (dates, number of days, status chip, cost per person incl. placeholder count, link to the budget); tabs "Day 2 · 11 Nov"; category on each card |
| 13 | Budget panel: no Retry, no known/estimated split (B7) | — | Known total, placeholder line, "This total is incomplete" list, Retry |
| 14 | Day theme "Culture & Culture" with one interest | UI run | De-duplicated label |
| 15 | `meta.estimated_total_activity_cost` included meals | Code review | Now activities only; new `estimated_total_cost_per_person` for both |
| 16 | Seed records without cost/hours would silently get schema defaults | Code review | The seeder warns; a test proves all 25 seed places have explicit values |

Rollback on failure (B4) was already correct; it now has a test (a planner crash returns 500 and the saved days are unchanged).

## Files changed

| Path | Purpose |
|---|---|
| `backend/app/api/v1/endpoints/trips.py` | Generate: lock, eligibility check, `_clear_itinerary`, status/`replaced_previous`, typed responses; itinerary: status, num_days, currency, sorted days; items: category/currency/cost_source; budget: known / placeholder / estimated, currency handling, `incomplete_reasons`; hotel currency |
| `backend/app/schemas/schemas.py` | `ViolationOut`, `ValidationReportOut`, `GenerationStatus`, `GenerateMeta`, `GenerateResponse`, `ItineraryResponse`; item fields |
| `backend/app/services/itinerary/constraint_validator.py` | `item_id` in output; activity end-boundary rule; `NO_ACTIVITIES`; info notes (`PLACEHOLDER_MEAL_COST`, `CURRENCY_MISMATCH`, `ESTIMATED_TRAVEL_TIME`) |
| `backend/app/services/itinerary/itinerary_service.py` | Store the plain ranking score; de-duplicated theme label |
| `backend/app/services/itinerary/cpsat_scheduler.py` | `ScheduledVisit.ranking_score`; stored score without the theme bonus (objective unchanged) |
| `backend/app/db/seeder.py` | `missing_place_fields` + warning |
| `backend/tests/test_phase6_generation.py` (new) | 19 tests (section B9 list) |
| `evaluation/optimization_comparison.py` | Score metric adds the theme bonus explicitly (same definition as before) |
| `mobile/src/types/index.ts` | Aligned with the new schemas |
| `mobile/src/utils/itinerary.ts` | `summariseValidation` (hard/soft/info), `statusLabel`, `issuesForItem`, `itemCostLabel`, `dayTabLabel` |
| `mobile/src/components/ValidationBanner.tsx` | Hard problems always visible; grouped details |
| `mobile/app/itinerary/[id].tsx` | Overview, dated tabs, categories, cost labels, inline issues, empty-day note |
| `mobile/src/components/BudgetPanel.tsx` | Known / placeholder / estimated totals, incomplete reasons, Retry |
| `mobile/app/trip/[id].tsx` | Result line (replaced / planner / status), Try again on failure, accessibility state |
| `mobile/src/__tests__/utils.test.ts`, `ValidationBanner.test.tsx` | New helper and banner tests |
| `docs/feature-inventory.md`, `backend/README.md`, `docs/phase-5-report.md` (marked approved) | Docs |

No dependencies were added, no schema migration was needed (no new columns), and `demo/` is unchanged.

## Verification

| Command | Result | Status |
|---|---|---|
| `cd backend && venv/bin/python -m pytest -q` | **219 passed**, 3 skipped (live Gemini). 200 before this phase | Pass |
| `venv/bin/python -m pytest -q tests/test_phase6_generation.py` before the fixes | 10 failed (gaps 1–8, incl. the duplicate days `[1,1,2,2]`) | Expected failures |
| `venv/bin/python ../evaluation/validator_fault_injection.py` | 98/98 detected, 0/14 false positives (unchanged) | Pass |
| `venv/bin/python ../evaluation/optimization_comparison.py` | Same totals as published: heuristic 74 activities / score 59.875 / 1982.8 travel min / 198 late min; CP-SAT 83 / 66.538 / 990 / 0; both 7/7 valid and reproducible | Pass |
| `cd mobile && npx tsc --noEmit` / `npx eslint . --max-warnings 0` | 0 errors / 0 problems | Pass |
| `npx jest` | 4 suites, **36 passed** | Pass |
| `npx expo export --platform android` / `web` | Bundled | Pass |
| Headless-Chrome UI run (web build + backend on a scratch SQLite DB, port 8010) | Generate → "Generated 3 days with the standard planner · Valid" → itinerary with dated tabs, overview, Day 2 → Budget lists missing items → reopen shows identical items → Regenerate asks for confirmation and says "previous itinerary was replaced" (DB: still 3 day rows) → exclude a scheduled place → "Not valid: 1 constraint problem" shown without tapping → exclude every place → "No places … can be scheduled … Your saved itinerary was not changed" + Try again (day IDs before/after identical) → restaurants disabled → "Price unknown (est. ৳300)", data limitations, budget separates placeholders. 21 checks passed, 0 page errors | Pass |
| Expo Go on a physical phone / native emulator | Not available to the agent | **Not run** |

New evaluation result files: `evaluation/results/validator_fault_injection_20261012_031232.*` and `optimization_comparison_20261012_031844.*` (earlier files kept as history). The soft-violation counts in the new comparison file are higher because of the stricter end-of-day rule; hard counts and every published metric are unchanged.

## Manual testing steps

1. **Restart the backend** so it runs the new code: Ctrl-C the running server, then `cd backend && venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload`.
2. `cd mobile && npx expo start -c`, then open in Expo Go (phone on the same Wi-Fi; `mobile/.env` → `http://192.168.1.101:8000`) or press `w`.
3. **Create a 3-day trip** (Phase 5 flow). Choose one must-visit place (★) and one excluded place (✕).
4. On the trip screen, tap **✨ Generate itinerary**. The button shows "Planning…" and cannot be tapped twice. Expect "Generated 3 days with the standard planner · Valid" (or "Valid with warnings") and a green or amber banner.
5. Tap **View itinerary**. Check:
   - tabs "Day 1 · <date>", "Day 2 · …";
   - the overview shows dates, "3 days", a status chip and the cost per person;
   - every card shows a category and time, and activities are in time order;
   - the must-visit place appears and the excluded place appears on no day.
6. Tap **💰 Budget** (scroll the tab bar if needed, or tap the overview's cost line): known total, hotel, "Local transport: Not estimated", and a "This total is incomplete" list.
7. **Persistence:** go back to My Trips, reopen the trip and **View saved itinerary**. The same activities appear. You can also open `http://localhost:8000/api/v1/trips/<id>/itinerary`.
8. **Regenerate:** on the trip screen, tap **Regenerate itinerary** and confirm. Expect "Your previous itinerary was replaced". Check that there are no duplicate days: `sqlite3 backend/vromon.db "select day_number, count(*) from itineraries where trip_id=<id> group by 1;"` shows one row per day.
9. **Hard violation:** in `/docs`, `PATCH /api/v1/trips/<id>` with `{"constraints": {"excluded_places": [<an id that is in the itinerary>]}}`. Reopen the itinerary: a red "Not valid: 1 constraint problem" banner lists the problem without tapping, the chip says "Has constraint problems", and the affected card shows ⛔.
10. **No eligible places:** PATCH `excluded_places` to every place ID (and `must_visit` to `[]`), then tap Generate. Expect "Could not generate · No places … can be scheduled … Your saved itinerary was not changed" with **↻ Try again**, and the old itinerary still opens.
11. **Optimizer:** choose **Optimized** and generate. Expect "Optimizing…", then an optimizer line under the banner (proven best, or within X%).
12. **Network failure:** stop the backend and tap Generate. You get an error and Try again. Restart the backend and tap Try again.
13. `git status demo/` prints nothing.

## Known issues and risks

1. **Not run on a physical device by the agent** (Android bundle builds; web UI verified). Steps 2–12 on your phone are the remaining check.
2. **Your backend must be restarted** (step 1). The instance that was already running on port 8000 was started without `--reload`.
3. The greedy baseline still lets the last activity run up to 60 min past the day end (kept so recorded evaluations stay comparable). It is now always flagged; the Optimized planner never does this.
4. The schema cannot store "unknown" for place cost or hours (NOT NULL with defaults; there are no Alembic migrations). The current seed has explicit values for every place (tested), and the seeder warns if a future record does not.
5. The meal placeholder (300 BDT) is still used for scheduling and the daily-cap check (the conservative choice), but it is never presented as a real price.
6. On narrow phones the Map and Budget tabs are off-screen in the horizontally scrolling tab bar; the overview's cost line also opens the budget.
7. The Budget panel's Retry and the network-failure Try again were not triggered in the automated run.
8. Unchanged from Phase 11: no authentication, sample data only, straight-line travel times, live RAG unevaluated (no Gemini key).

## Data and service prerequisites

Same as Phase 5: Python 3.11 venv (`requirements.lock`), SQLite by default, Node and `npm ci`, Expo Go SDK 57, and `EXPO_PUBLIC_API_URL` only in `mobile/.env`. No API keys are needed for Phase 6. OR-Tools (already locked) is used for the Optimized planner.

## Feature inventory updates

New "Week 2 · Phase 6" section in `docs/feature-inventory.md`: 11 rows ✅, 1 ✅/⚠️ (Budget Retry not triggered), 1 ⚠️ (physical device).

## Next step (not implemented)

Week 2 is complete. In the original plan, Week 3 is RAG (Phases 7–8). Those phases are already implemented but **unevaluated with real models**. The natural next step is to add a Gemini key to `backend/.env` and run the 4 commands in `evaluation/README.md` (live answers, `RAG_MIN_SCORE` calibration, the 12-question evaluation).

## Approval gate

Please follow the manual steps (especially 1 and 3–12 on your phone) and approve Phase 6 or list the fixes you want.

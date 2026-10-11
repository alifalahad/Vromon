# Vromon — Feature Inventory

**Last updated:** 2026-10-12 (Week 2: Phase 5 approved; Phase 6 generation/display audit and fixes)
**Rule:** a feature is ✅ only if its behaviour was verified by an automated test or a recorded manual or automated UI run. "Implemented" without verification is marked ⚠️.

Legend: ✅ verified · ⚠️ implemented, verification pending (needs you or a device) · 🟡 partial · ❌ not implemented

## Demo features (from the plan's Phase 10 list)

| # | Feature | Status | Where | How it was verified |
|---|---|---|---|---|
| 1 | Six-step trip wizard | ✅ | `mobile/app/trip/new.tsx`, `src/features/tripForm.ts` | Jest schema/step tests; headless-Chrome run through all 6 steps (2026-10-12) |
| 2 | Budget presets (৳15k / 25k / 50k + custom) | ✅ | wizard step 3 | Screenshot run; payload mapping test |
| 3 | Interests and travel pace | ✅ | wizard step 4 | Jest ("at least one interest", valid travel styles); screenshot run. *Before Phase 10 the mobile app never sent interests.* |
| 4 | Daily time window / activity limit | ✅ | wizard step 5; both planners; validator | Backend tests; Jest time-order checks |
| 5 | Must-visit and excluded places | ✅ | wizard step 5 (tap to cycle); planners; validator | `test_phase10_editing.py`, `test_optimizer.py`; screenshot run. Default planner now tries must-visits first (fixed in Phase 10). |
| 6 | Multi-day itinerary | ✅ | both planners | Backend tests; e2e run (3-day trip) |
| 7 | Opening-hour constraints | ✅ | both planners; validator `OUTSIDE_OPENING_HOURS` | `test_optimizer.py::TestBaselineFixes`, solver tests |
| 8 | Budget-aware ranking | ✅ | `recommendation_service.py` (budget_match weight) + hard daily cap | Phase 4 tests; `TestDailyCapWithMeals` |
| 9 | Restaurant and hotel suggestions | 🟡 | meals are assigned to restaurants (seeded, deterministic); the hotel is picked by accommodation category | Shown in the timeline and budget. **No ranked hotel or restaurant choice list in the app.** |
| 10 | Match scores and explanations | ✅ / ⚠️ | score + ranking reasons on each card and in "Why?"; sourced AI explanation via `/rag/.../explanation` | Ranking part: screenshot run. AI part ⚠️: UI handles "not configured" correctly; a live Gemini answer is untested (no API key). |
| 11 | Day tabs and timeline | ✅ | `mobile/app/itinerary/[id].tsx` | Screenshot run |
| 12 | Map markers and routes | ⚠️ native / ✅ web fallback | `src/components/TripMap.tsx` (react-native-maps), `TripMap.web.tsx` | Android bundle builds; web fallback screenshot. **The native map must be checked on your phone.** Routes are straight lines (labelled), not road routes. |
| 13 | Budget breakdown and trip summary | ✅ | `GET /trips/{id}/budget`, `BudgetPanel.tsx`, trip screen | `TestBudget`; screenshot run |
| 14 | Regenerate a day | ✅ | `POST /trips/{id}/days/{day}/regenerate` | `TestRegenerateDay` (changes places, keeps must-visit, no extra rows, others untouched); UI run |
| 15 | Remove / replace activities | ✅ | `DELETE …/items/{id}`, `GET …/alternatives`, `POST …/replace` | `TestRemove`, `TestReplace`; UI run |
| 16 | Adapt an itinerary | ✅ | relax / reduce_budget / avoid_crowds / energise | `TestAdapt`; UI run. *"energise" was a silent no-op before Phase 10.* |
| 17 | Duplicate, save, view, delete trips | ✅ | trips list + trip screen | `TestSavedTrips`; UI run (duplicate) |
| 18 | Feedback ratings and tags | ✅ | `FeedbackForm.tsx`, `/trips/{id}/feedback` | `TestSavedTrips`; UI run (submit, reload, update) |
| 19 | Responsive / PWA behaviour | ❌ (replaced) | — | The real app is a native Expo app; its web build runs (`npm run web`), but there is no PWA manifest or service worker. The demo's PWA is preserved in `demo/`. |
| 20 | Demo API behaviour | ✅ | `/api/v1/...` equivalents (see below) | Backend suite |

## Week 2 · Phase 5: mobile ↔ backend integration (re-verified 2026-10-12)

See [`phase-5-report.md`](phase-5-report.md). "UI run" = headless Chrome driving the web build against a live backend on a scratch database.

| Feature | Status | Where | How it was verified |
|---|---|---|---|
| Destinations loaded from `GET /destinations` with loading / empty / error + Retry | ✅ | `app/(tabs)/index.tsx` | UI run; network-error + Retry run with the backend stopped and restarted |
| **Destination screen: real places with category filter** (new) | ✅ | `app/destination/[id].tsx`, `src/features/places.ts` | UI run (25 places, Beach filter); `places.test.ts` |
| "Plan a trip here" preselects the destination (was ignored before) | ✅ | `app/trip/new.tsx` | UI run |
| Wizard: real-calendar dates, end ≥ start, ≤ 30-day trips (backend limit) | ✅ | `src/features/tripForm.ts` | `tripForm.test.ts`; UI run (2026-02-31, reversed, 52-day range all blocked) |
| Retry when destinations or places fail to load inside the wizard | ⚠️ | `app/trip/new.tsx` | Typecheck/lint only; not triggered in the UI run |
| Backend 422 errors name the field (`max activities per day: …`) | ✅ | `src/services/api.ts` `errorMessage` | `utils.test.ts` with real FastAPI 422 bodies captured from the API |
| Failed submit keeps the answers and says the trip was not saved | ⚠️ | `app/trip/new.tsx` | Not triggered in the UI run (client validation already blocks the known 422s). Check by stopping the backend before tapping Create trip |
| Trip persisted and confirmed with the real ID ("Trip #N saved") | ✅ | `app/trip/[id].tsx` | UI run → `GET /trips/{id}` and SQLite row match the form (dates, interests, must-visit, excluded) |
| API URL documented per platform (web, iOS Sim, Android Emulator, phone) | ✅ | `README.md`, `mobile/.env.example` | Docs |
| Same flow on a physical phone / native emulator | ⚠️ | — | Android bundle builds; needs your device |

## Week 2 · Phase 6: generate, persist, retrieve and display (2026-10-12)

See [`phase-6-report.md`](phase-6-report.md). Backend items are covered by `backend/tests/test_phase6_generation.py` (19 tests); "UI run" = headless Chrome on the web build against a live backend with a scratch DB.

| Feature | Status | Where | How it was verified |
|---|---|---|---|
| Typed generate / itinerary responses (Pydantic `GenerateResponse`, `ItineraryResponse`) with `status` = valid / valid_with_warnings / invalid | ✅ | `schemas.py`, `trips.py` | Tests; OpenAPI |
| Per-activity category, currency and `cost_source` (data / placeholder); hard and soft violations carry `item_id` | ✅ | `trips.py`, `constraint_validator.py` | Tests |
| Missing-data disclosures (severity `info`): placeholder meal prices, other currencies, straight-line travel times | ✅ | `constraint_validator.py` | Tests; UI run (placeholder meals) |
| Empty day flagged (`NO_ACTIVITIES`); activity past the user's day end always flagged (was silent up to 90 min) | ✅ | `constraint_validator.py` | Tests |
| No eligible places → explicit 422 *before* anything is deleted (was: old plan wiped, meal-only days saved as "valid") | ✅ | `trips.py` | Tests (heuristic + CP-SAT); UI run (error + Try again; saved days unchanged) |
| Repeated generation replaces the single current itinerary; overlapping requests cannot leave duplicate days (reproduced `[1,1,2,2]` before the fix) | ✅ | `trips.py` `_clear_itinerary` + row lock | Tests (repeat ×4, stale concurrent request); UI run (`replaced_previous`); DB row counts |
| Planner crash leaves the saved itinerary intact | ✅ | transaction | Test (injected failure → 500, old days unchanged) |
| Budget: known total vs placeholder vs estimated; other currencies excluded; incomplete reasons listed | ✅ | `GET /trips/{id}/budget`, `BudgetPanel.tsx` | Tests; UI run |
| Displayed match score is the real ranking score (was up to 115%: day-theme bonus stored) | ✅ | both planners | Test; optimizer comparison re-run reproduces published totals |
| Itinerary screen: overview (dates, days, status, cost), dated day tabs, empty-day note, category, honest cost labels, inline warnings | ✅ | `app/itinerary/[id].tsx`, `utils/itinerary.ts` | Jest (helpers); UI run |
| Hard problems always visible; preference warnings and data limitations separated | ✅ | `ValidationBanner.tsx` | Jest; UI run (invalid plan) |
| Trip screen: "replaced your previous itinerary", status, Try again on failure; Budget Retry | ✅ / ⚠️ | `app/trip/[id].tsx`, `BudgetPanel.tsx` | UI run (replace, Try again shown); Budget Retry not triggered |
| Same flow on a physical phone | ⚠️ | — | Android bundle builds; needs your device |

## Features added after the demo

| Feature | Status | Notes |
|---|---|---|
| Independent constraint validation shown in the app | ✅ | Banner on the itinerary and after every edit; backend revalidates after each change |
| Planner choice: Standard (greedy) / Optimized (CP-SAT) | ✅ | Trip screen; infeasible requests show the solver's diagnostics |
| Grounded Q&A (`POST /rag/ask`) | ⚠️ backend only | No mobile screen; a live LLM is untested (no key) |
| Semantic search (`GET /rag/search`) | ✅ backend | Dummy embeddings unless a key is configured |
| Input validation (times, place IDs, destination, trip length, must/excluded overlap) | ✅ | Phase 11, `test_security_validation.py` |
| Partial trip updates (PATCH changes only the sent fields) | ✅ | Phase 11 fix; previously reset unsent fields to defaults |
| CORS from configuration; admin token for ingestion | ✅ | Phase 11 |
| PostgreSQL 16 | ✅ | Phase 11: full e2e flow and restart idempotency via Docker |
| Docker Compose stack | ✅ | Phase 11: built and verified |
| CI workflow | ⚠️ | Same commands verified locally on a clean copy; not yet run on GitHub |
| Live AI explanations / RAG evaluation | ⚠️ | Waiting for a Gemini API key |

## Demo endpoint → real API mapping

| Demo | Real (`/api/v1`) |
|---|---|
| `GET /api/destinations`, `/{dest}/places/restaurants/hotels` | `GET /destinations`, `/destinations/{id}/places\|restaurants\|hotels` |
| `GET /api/places`, `/places/{id}`, `POST /places/recommendations` | same paths under `/api/v1` |
| `POST/GET/PUT/DELETE /api/trips…` | same; update is `PATCH` |
| `POST /trips/{id}/generate`, `/regenerate` | same, plus `?algorithm=heuristic\|cpsat` |
| `GET /trips/{id}/itinerary` | same, plus a `validation` report |
| `POST /trips/{id}/days/{dayId}/regenerate` | same (fixed: must-visit kept; no phantom day) |
| `DELETE /trips/{id}/items/{itemId}` | same (fixed: item must belong to the trip; must-visit protected) |
| `POST /trips/{id}/adapt` | same, now reports `changes` and `validation` |
| `POST/GET /trips/{id}/feedback`, `POST /trips/{id}/duplicate` | same |
| — | **new:** `GET /trips/{id}/budget`, `GET /trips/{id}/items/{id}/alternatives`, `POST /trips/{id}/items/{id}/replace`, `/rag/*` |

# Phase 10 Report: Adaptation, Saved Trips, Feedback, Maps and Budget

**Date:** 2026-10-12
**Status:** Implemented. Awaiting developer review. Phase 11 not started.

---

## 1. Summary

Every remaining demo feature now works in the real app (backend + Expo mobile), and each is tracked with its verification method in [`feature-inventory.md`](feature-inventory.md). Every edit goes through the backend, which recalculates the day and **re-validates the whole trip**; the app shows the result in a validation banner.

| Area | What you can do in the app |
|---|---|
| Plan | 6-step wizard: destination, dates and travellers, budget presets and daily cap, interests and pace, daily hours and limits, must-visit/excluded places picked from real data, review |
| Generate | Choose **Standard** (greedy) or **Optimized** (CP-SAT). If constraints conflict, the optimizer explains why. |
| Itinerary | Day tabs, timeline, opening hours, match score, travel estimate · **Why?** · **Replace** (pick from places that fit the slot) · **Remove** · **Regenerate day** · **Adapt** (relaxed / cheaper / avoid crowds / more active) · **Redo all** |
| Map | Native map with numbered markers per day and dashed straight-line connections; on web, a stop list |
| Budget | Activities, meals and hotel for the whole group; remaining or over budget; per-day totals; assumptions; transport shown as "not estimated" |
| Trips | List, open, duplicate, delete, feedback (stars, tags, comment; editable) |

## 2. Defects found and fixed (pre-existing)

| # | Defect | Effect before the fix | Fix |
|---|---|---|---|
| 1 | Mobile wizard never sent **interests** | All mobile trips were ranked without the user's interests | Interests step (required) |
| 2 | Wizard offered travel style "Active" | The backend expects "Packed"; the value didn't match the ranking rule | Options limited to Relaxed / Balanced / Packed |
| 3 | `DELETE /trips/{id}/items/{item}` didn't check ownership | One trip's URL could delete another trip's activity | Item must belong to the trip (404 otherwise) |
| 4 | Remove left stale travel legs | Travel time pointed at a deleted place | `recompute_day()` after every edit |
| 5 | Regenerate day persisted items onto a **phantom extra day** | The day became empty and a new day row appeared | Items are copied onto the existing day |
| 6 | Regenerate day ignored must-visit places, and after Phase 9's determinism it returned the same day | Must-visits could disappear; the button looked broken | Keeps must-visits and avoids the day's current places (falls back if no alternatives) |
| 7 | Adapt could delete must-visit places, and totals used deleted items | Invalid itineraries, wrong totals | Must-visits protected; days recomputed |
| 8 | Adapt "energise" did nothing, silently | Fake behaviour | Adds the best-ranked place that fits a free gap, or reports "No change" |
| 9 | "reduce_budget" removed a free activity when nothing was paid | Pointless removal | Only paid activities |
| 10 | Default planner: the day-theme bonus (+0.15) outranked must-visits (1.0) | e.g. a must-visit Sunset Boat Ride was never scheduled | Must-visits are tried first |
| 11 | Default planner's daily cap ignored the **dinner/lunch still to come** | e.g. 2600 against a 2500 cap after regenerating a day | Remaining meal costs are reserved before accepting an activity |
| 12 | App confirm dialogs used `Alert.alert` | On web, Remove and Regenerate did nothing (react-native-web Alert is a no-op) | `src/utils/dialogs.ts`: browser confirm on web |

Defects 10 and 11 were found by the live end-to-end run, not by the existing tests. Each has a regression test now, and each test was confirmed to fail on the old code. After the fixes, the Phase 9 comparison shows the default planner valid in 7/7 scenarios; see the note in `phase-9-report.md`.

## 3. Changes

### Backend
| File | Change |
|---|---|
| `app/services/itinerary/editing_service.py` | **New.** `recompute_day`, slot fitting, alternatives, remove/replace, add-best-activity, must-visit protection |
| `app/services/adaptation/adaptation_service.py` | Rewritten on the editing service; reports changes |
| `app/api/v1/endpoints/trips.py` | Ownership-checked edits returning `{message, day, validation}`; `GET …/alternatives`; `POST …/replace`; fixed regenerate-day; adapt with `changes` + `validation`; `GET /trips/{id}/budget`; `validation` in `GET …/itinerary`; duplicate keeps the title |
| `app/services/itinerary/itinerary_service.py` | Must-visit priority; meal-cost reservation under the daily cap |
| `tests/test_phase10_editing.py` | **New.** 32 tests |

### Mobile
| File | Change |
|---|---|
| `app/trip/new.tsx` | 6-step wizard (React Hook Form + Zod) |
| `app/trip/[id].tsx` | Planner choice, validation and solver result, conflict diagnostics, duplicate, delete, feedback |
| `app/itinerary/[id].tsx` | Day tabs, timeline actions, adapt panel, map and budget tabs, validation banner |
| `app/(tabs)/trips.tsx` | Duplicate; cross-platform delete confirm |
| `src/components/*` | `ValidationBanner`, `TripMap` (+ `.web`), `BudgetPanel`, `FeedbackForm`, `ItemSheets` (Why? / Replace) |
| `src/features/tripForm.ts`, `src/utils/*`, `src/constants/trip.ts`, `src/theme.ts` | Pure, tested logic and shared constants |
| `src/services/api.ts`, `src/types/index.ts` | New endpoints; `ApiError` keeps status and structured detail |
| `src/__tests__/*` | **New.** 25 tests (Jest + React Native Testing Library) |
| `package.json`, `tsconfig.json` | `react-native-maps` 1.27.2; dev: `jest`, `jest-expo`, `@types/jest`, `@testing-library/react-native`, `test-renderer`; scripts `test`, `typecheck` |

### Docs
`docs/feature-inventory.md` (**new**), this report, `docs/technology-decisions.md` (maps, testing), `docs/phase-9-report.md` (baseline note).

## 4. Commands executed

```bash
# backend
cd backend
venv/bin/python -m pytest -q                                   # 173 passed, 3 skipped
venv/bin/python ../evaluation/optimization_comparison.py       # rerun after the baseline fixes
DATABASE_URL=sqlite:///<scratch>/e2e.db venv/bin/uvicorn app.main:app --port 8767   # live e2e (throwaway DB)

# mobile
cd mobile
npx expo install react-native-maps
npx expo install jest-expo jest @types/jest @testing-library/react-native -- --save-dev
npm install --save-dev "test-renderer@~1.2.0"
npx tsc --noEmit                                                # exit 0
npx jest                                                        # 25 passed
npx expo export --platform android                              # bundles
npx expo export --platform web                                  # bundles; no react-native-maps in web bundle
CI=1 EXPO_PUBLIC_API_URL=http://127.0.0.1:8767 npx expo start --web --port 8082
# + headless Chrome (DevTools protocol) clicking through 25 screens/actions at 390×844
```

## 5. Results

| Check | Result |
|---|---|
| Backend suite | **173 passed, 3 skipped** (the skips are the live Gemini tests) |
| Mobile typecheck | 0 errors |
| Mobile tests | **25 passed** (3 suites, including a rendered component test) |
| Android / web bundles | Both build |
| Live API e2e (create → optimize → alternatives → replace → refused must-visit removal → regenerate day → 4 adaptations → budget → feedback → duplicate → delete → conflicting trip) | All passed, after fixing defect 11, which this run found |
| Web UI automation (2 runs, 25 actions) | No page errors; all confirmation dialogs correct; screenshots reviewed |
| **Not verified by me** | The native map and the app on a physical phone or emulator; live AI explanations (no LLM key) |

## 6. Manual verification steps

See the chat summary for the step-by-step phone walkthrough. In short: run the backend on `0.0.0.0`, set `mobile/.env` to your Mac's IP, open the app in Expo Go, and work through the checklist (wizard → generate both ways → every itinerary action → map → budget → feedback → duplicate/delete → a conflicting trip).

## 7. Known issues and limitations

- **The native map is unverified on a device.** Lines are straight connections, not roads.
- **Hotel and restaurant suggestions are partial.** Meals are assigned automatically and the hotel is the first in the chosen category; the app has no ranked choice list.
- **Regenerate day uses the standard planner only.**
- **Adapt "energise" adds one activity per day per tap**, and only where a gap fits.
- **Budget:** prices are sample seed data. Rooms assume 2 travellers each. Transport isn't estimated. A 300 BDT meal placeholder is used only if a destination has no restaurants (not the case for the seed data).
- **PWA behaviour is not reimplemented.** The real app is native; its web build is for development.
- **No mobile screen for free-form RAG questions.** The backend endpoint exists.
- **ESLint isn't configured for the mobile app.** Typecheck and tests cover correctness.
- **I deleted `evaluation/results/optimization_comparison_20261012_005624.*` during cleanup.** It was probably your Phase 9 rerun; it's regenerable with the same script.

## 8. Next phase proposal: Phase 11, evaluation, security, deployment and final verification

Run the RAG evaluation with a real key, plus the recommendation and optimization evaluations; check the mobile app on a device; set up lint; review `.gitignore`/`.env.example` and scan for tracked secrets; add a Python lockfile and fix `pip install -e .` (missing `backend/README.md`); write the README and setup docs; and produce the final feature inventory and report.

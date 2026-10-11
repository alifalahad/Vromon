# Phase 5 Report (Week 2): Connect the Mobile App to the Backend

**Date:** 2026-10-12
**Prompt:** `vromon_week_2_mobile_integration_prompt.md`, Prompt A
**Status:** Completed and approved by the developer (2026-10-12). Phase 6: see `phase-6-report.md`.

---

## Phase status

- **Phase:** 5, mobile ↔ backend integration
- **Result:** completed, with one item pending your device (see Known issues)
- **Context found at preflight:** the repository was already past Phase 11 (`docs/phase-11-report.md`). The mobile app (Expo SDK 57, Expo Router, TanStack Query, React Hook Form + Zod, one Axios client) already loaded destinations and created trips. This phase therefore **audited that flow against Prompt A, fixed the gaps it found, and re-verified it end to end**. It did not rebuild what worked.
- **Scope implemented:**
  1. New destination screen that lists the destination's real places (name, category, description, rating, entry cost, hours) with a category filter and loading / empty / error / retry states.
  2. Fixed: tapping a destination passed its name to the wizard, but the wizard ignored it. "Plan a trip to X" now preselects X.
  3. Stricter form validation: real calendar dates (`2026-02-31` is rejected) and the backend's 30-day trip limit. Before this, both were caught only by the backend.
  4. Backend validation errors now name the field (`max activities per day: Input should be ≤ 10` instead of a bare message).
  5. Retry buttons when destinations or places fail to load inside the wizard; a clearer failed-submit message that confirms the answers are kept.
  6. "✓ Trip saved, Trip #N" confirmation, using the ID and timestamp the server returns.
  7. The same validation message no longer appears twice on a wizard step.
  8. The API URL is documented for web, the iOS Simulator, the Android Emulator and a physical phone.

### Preflight summary (evidence)

| Item | Finding |
|---|---|
| Git | `main`; many uncommitted backend/doc changes and an untracked `mobile/` from earlier phases, all preserved. No commits were made. |
| Backend routes used | `GET /api/v1/destinations`, `GET /destinations/{id}`, `GET /destinations/{id}/places`, `GET /places?destination=`, `POST /trips` (201), `GET /trips`, `GET /trips/{id}` |
| Request schema | `TripCreate` {destination, start_date, end_date, num_travelers 1–50, total_budget > 0, preference{interests, travel_style, activity_level, accommodation_preference, preferred_start/end_time HH:MM}, constraints{max_activities_per_day 1–10, max_daily_budget ≥ 0, must_visit, excluded_places, avoid_crowded}}; the trip is at most 30 days; DB checks for unknown destination/place IDs and must ∩ excluded. The mobile `toTripPayload` sends every field except `avoid_high_activity` (the backend defaults it to false; the wizard has no control for it). |
| Baseline checks | Backend `pytest`: 200 passed, 3 skipped. Mobile: `tsc` 0 errors, ESLint 0, Jest 25/25. |
| Blockers | None |

## Files changed

| Path | Purpose / behaviour |
|---|---|
| `mobile/app/destination/[id].tsx` (new) | Destination screen: `GET /destinations/{id}` + `/places`; category filter chips; pull to refresh; loading, error + Retry, empty, and "no places in this category" states; a sample-data footnote; a "Plan a trip to X" button |
| `mobile/src/features/places.ts` (new) | Pure helpers: `placeCategories`, `filterByCategory`, `formatEntryCost` (a missing cost shows as "Cost unknown", never as free) |
| `mobile/app/(tabs)/index.tsx` | Destination cards open the destination screen; accessibility label |
| `mobile/app/_layout.tsx` | Registers the `destination/[id]` route |
| `mobile/app/trip/new.tsx` | Reads the `destination` route param; Retry for failed loads; clearer submit-failure text; no duplicated step message; accessibility roles and states on the destination options and the Create button |
| `mobile/src/features/tripForm.ts` | `isCalendarDate`, `tripDays`, `MAX_TRIP_DAYS = 30`; `defaultTripForm(today, destination)` |
| `mobile/src/services/api.ts` | `errorMessage` prefixes each Pydantic issue with its field and drops "Value error," |
| `mobile/app/trip/[id].tsx` | "✓ Trip saved" banner, shown only when arriving from creation (`created=1`), with the trip ID and the server timestamp (labelled UTC) |
| `mobile/src/__tests__/places.test.ts` (new), `tripForm.test.ts`, `utils.test.ts` | +7 tests (calendar dates, 30-day limit, preselection, 422 formatting with real FastAPI bodies, place helpers) |
| `README.md`, `mobile/.env.example` | Per-platform `EXPO_PUBLIC_API_URL` table, Android Emulator `10.0.2.2`, and a note never to put keys in `EXPO_PUBLIC_*` |
| `docs/feature-inventory.md` | Phase 5 section |

No backend files changed, no dependencies were added, and `demo/` was not modified (`git status demo/` is empty).

## Verification

| Command | Result | Status |
|---|---|---|
| `cd backend && venv/bin/python -m pytest -q` (baseline; backend unchanged) | 200 passed, 3 skipped (live Gemini) | Pass |
| `cd mobile && npx tsc --noEmit` | 0 errors | Pass |
| `npx eslint . --max-warnings 0` | 0 problems | Pass |
| `npx jest` | 4 suites, **32 passed** (25 before) | Pass |
| `npx expo export --platform web` | Bundled | Pass |
| `npx expo export --platform android` | Bundled (1452 modules) | Pass |
| API flow with `curl` against a second backend on port 8010 with a scratch SQLite DB | destinations → destination → places → `POST /trips` 201 → `GET /trips/{id}` → `GET /trips` → row present in SQLite; 404 for an unknown destination; both 422 shapes (Pydantic list and DB-check list) captured | Pass |
| Headless Chrome (CDP) driving the web build against that backend | Explore shows the real place count → destination screen (25 places) → Beach filter hides the Nature place, All restores it → plan → destination preselected → `2026-02-31`, reversed dates and a 52-day trip each blocked → interests required → must-visit and excluded chosen → review → **Create → "Trip #2 saved"**; `GET /trips/2` and the SQLite row match the form (must_visit [1], excluded [4], interests Beach and Nature). No page errors. | Pass |
| Same, with the backend stopped, then restarted | "Cannot reach the server at … Is the backend running and EXPO_PUBLIC_API_URL correct?" + Retry; Retry loads the places once the backend is back | Pass |
| Expo Go on a physical phone / native emulator | Not available to the agent | **Not run** |

Your own backend (port 8000) and Expo server (port 8081) were left running and untouched. Verification used separate ports and a throwaway DB, so no test trips were written to `backend/vromon.db`.

## Manual testing steps

1. Backend: `cd backend && venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload`. Check http://localhost:8000/health.
2. Set `mobile/.env` → `EXPO_PUBLIC_API_URL` (table in `README.md`). For a phone: `ipconfig getifaddr en0`, then `http://<that IP>:8000`. Your current `.env` already points at `192.168.1.101`, which matched this Mac at the time of the check.
3. `cd mobile && npx expo start -c` (`-c` clears the cache so the `.env` change is picked up). Scan the QR code with Expo Go, or press `w` for web.
4. **Explore:** "Cox's Bazar · 25 places" is listed. Tap it.
5. **Destination screen:** 25 places with categories, descriptions, ratings, cost and hours. Tap **Beach**: only beaches remain. Tap **All**.
6. Tap **Plan a trip to Cox's Bazar**. Step 1 shows Cox's Bazar highlighted. Tap **Next**.
7. **Validation:** set the end date to `2026-02-31` → "Not a real date". Set it before the start date → "End date must be on or after…". Set it more than 30 days after the start → "at most 30 days". Then enter a valid range.
8. Continue. On Interests, tap **Next** with nothing selected → "Pick at least one interest". Choose some.
9. On Schedule, tap one place once (★ must-visit) and another twice (✕ excluded). On Review, check that both appear by name.
10. Tap **Create trip ✓**. The button shows a spinner and is disabled while saving. You land on Trip Details with **"✓ Trip saved, Trip #N"**.
11. **Confirm persistence:** open http://localhost:8000/api/v1/trips/N (or `/docs`), or `sqlite3 backend/vromon.db "select id,destination,start_date,end_date,status from trips order by id desc limit 1;"`. The **My Trips** tab also lists it.
12. **Error state:** stop the backend (Ctrl-C), then reload the app (press `r` in the Expo terminal, or shake the phone → Reload). Data is cached for 5 minutes, so you need the reload. After a few seconds (2 automatic retries), Explore shows "Cannot reach the server at …" with **Retry**. Restart the backend and tap Retry; the list loads. On a destination screen you can also pull down to refresh.
13. **Submit failure:** stop the backend on the Review step and tap Create trip. An error appears, every answer is still filled in, and once the backend is back, Create succeeds.
14. Confirm `git status demo/` prints nothing.

## Known issues and risks

1. **Not run on a physical device or native emulator by the agent.** The Android bundle builds, and the web build was driven end to end. Steps 3–13 on your phone are the remaining check.
2. The in-wizard Retry and the failed-submit path (step 13) were not triggered automatically. They are marked ⚠️ in the inventory.
3. Dates are typed as `YYYY-MM-DD` text (no native date picker). Validation is strict, but entry is clumsy on a phone. Adding a picker means a new native dependency, which was out of scope.
4. The `avoid_high_activity` constraint exists in the backend, but the wizard has no control for it, so the default `false` is persisted. This was already the case before this phase.
5. No authentication (as documented in Phase 11): anyone who can reach the API can read and modify trips. Use a trusted network.
6. Place data is illustrative sample data (stated on the destination screen).
7. The CDP harness's first category-filter check clicked an off-screen chip (a harness limitation, since the chip row scrolls horizontally). The separate filter check, using a visible chip, passed.

## Data and service prerequisites

- Python 3.11 venv in `backend/` (`requirements.lock`). SQLite by default; no external services.
- Node 22.13+ / 24+ and `npm ci` in `mobile/`. Expo Go for SDK 57 on the phone.
- `mobile/.env`: `EXPO_PUBLIC_API_URL` only. **No secrets in the mobile app.** Gemini keys are optional and live only in `backend/.env`; Phase 5 doesn't need them.
- For a phone: the same Wi-Fi network, the backend bound to `0.0.0.0`, and the macOS firewall allowing Python.

## Feature inventory updates

New "Week 2 · Phase 5" section in `docs/feature-inventory.md`: 8 items ✅ and 3 ⚠️ (physical device, in-wizard Retry, failed-submit path).

## Next step (not implemented)

Phase 6 (Prompt B): generate, persist, retrieve and display a validated itinerary from the mobile flow. The repository already contains generation endpoints, a validator and an itinerary screen from earlier phases. Phase 6 would audit them against Prompt B (generation idempotency, budget-summary honesty with mixed or missing costs, missing-data warnings, the B9 test list), fix gaps and re-verify.

## Approval gate

Please follow the manual steps above (especially 3–13 on your phone) and either **approve Phase 5** or list the fixes you want. Phase 6 will not start until you explicitly approve it.

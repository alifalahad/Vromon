# Vromon — Walkthrough & Setup Guide

## Changes Made

### Bug Fixes
| File | Change |
|---|---|
| [seeder.py](file:///e:/Vromon/backend/app/database/seeder.py) | Fixed `UnicodeEncodeError` — replaced ✅ emoji with ASCII text for Windows cp1252 console |
| [config.py](file:///e:/Vromon/backend/app/config.py) | Migrated from deprecated `class Config` to `model_config = ConfigDict()` (Pydantic v2) |
| [requirements.txt](file:///e:/Vromon/backend/requirements.txt) | Relaxed version pins (`==` → `>=`) so pip can find pre-built wheels for Python 3.14 |

### New Features
| File | Change |
|---|---|
| [trips.py](file:///e:/Vromon/backend/app/api/trips.py) | Added `POST /api/trips/{id}/duplicate` endpoint — copies a trip with preferences & constraints |
| [api.ts](file:///e:/Vromon/frontend/src/services/api.ts) | Added `tripsApi.duplicate()` method |
| [SavedTripsPage.tsx](file:///e:/Vromon/frontend/src/pages/SavedTripsPage.tsx) | Added **Duplicate** button with loading state, matching the Master Prompt §22 requirement |

### Setup Files
| File | Change |
|---|---|
| [backend/.env](file:///e:/Vromon/backend/.env) | Created from `.env.example` so server starts without manual config |
| [vite.config.ts](file:///e:/Vromon/frontend/vite.config.ts) | Added `host: '0.0.0.0'` for phone access on same network |

---

## Verification Results

### Backend Tests: ✅ 13/13 Passed
```
tests/test_services.py::TestRecommendation::test_interest_match_scores_higher PASSED
tests/test_services.py::TestRecommendation::test_excluded_places_not_returned PASSED
tests/test_services.py::TestRecommendation::test_must_visit_always_included PASSED
tests/test_services.py::TestRecommendation::test_crowded_penalty PASSED
tests/test_services.py::TestRecommendation::test_score_clamped_0_1 PASSED
tests/test_services.py::TestRecommendation::test_reasons_provided PASSED
tests/test_services.py::TestUtils::test_time_to_minutes PASSED
tests/test_services.py::TestUtils::test_minutes_to_time PASSED
tests/test_services.py::TestUtils::test_haversine_same_point PASSED
tests/test_services.py::TestUtils::test_haversine_known_distance PASSED
tests/test_services.py::TestItineraryService::test_generates_for_each_day PASSED
tests/test_services.py::TestItineraryService::test_no_overlapping_activities PASSED
tests/test_services.py::TestItineraryService::test_respects_max_activities PASSED
```

### Frontend TypeScript: ✅ No Errors
TypeScript compiles cleanly with `tsc --noEmit`.

### Backend Import: ✅ Starts Successfully
Backend initializes, creates tables, and seeds demo data without errors.

---

## How to Run — Step by Step

### Step 1: Start the Backend

Open a **terminal** (PowerShell/CMD) and run:

```powershell
cd e:\Vromon\backend
venv\Scripts\activate
uvicorn app.main:app --reload --port 8000
```

You should see:
```
INFO:     Uvicorn running on http://127.0.0.1:8000
INFO:     [OK] Database seeded with Cox's Bazar demo data.
```

> [!TIP]
> Check the API docs at **http://localhost:8000/docs** — this is the Swagger UI showing all endpoints.

---

### Step 2: Start the Frontend

Open a **second terminal** and run:

```powershell
cd e:\Vromon\frontend
npm run dev
```

You should see:
```
VITE v8.x.x  ready in XXX ms

➜  Local:   http://localhost:5173/
➜  Network: http://192.168.x.x:5173/
```

---

### Step 3: Test the Demo Flow

Open **http://localhost:5173** in your browser and follow this flow:

1. **Landing page** → Click **Plan My Trip**
2. **Step 1**: Destination is pre-set to Cox's Bazar. Pick dates (any 3-day range) and travelers
3. **Step 2**: Select budget (৳15,000) and accommodation preference
4. **Step 3**: Pick interests — Beach, Nature, Food, Photography
5. **Step 4**: Choose travel style (Relaxed) and activity level (Medium)
6. **Step 5**: Set constraints — max 4 activities/day, toggle "Avoid crowded"
7. **Step 6**: Review and click **Generate My Itinerary**
8. **Itinerary page**: See the day-by-day timeline with recommendation reasons
9. Click the **expand arrow** on any activity to see "Why we recommend this"
10. Click **Regenerate Day** on any day
11. Click **Adapt** → "Make it more relaxed"
12. Check the **Budget Dashboard** on the right panel
13. Give a **star rating** and submit feedback
14. Click **Save Trip**
15. Navigate to **My Trips** to see saved trip
16. Try **Duplicate** and **Delete** on saved trips

---

## How to Access on Your Phone

### Same WiFi Network

1. Make sure your phone is on the **same WiFi** as your PC
2. Find your PC's local IP address:
   ```powershell
   ipconfig
   ```
   Look for `IPv4 Address` under your WiFi adapter (e.g., `192.168.1.105`)

3. When you start the frontend with `npm run dev`, Vite will show a **Network** URL like:
   ```
   ➜  Network: http://192.168.1.105:5173/
   ```

4. Open that Network URL on your phone's browser

> [!IMPORTANT]
> The Vite proxy (`/api → localhost:8000`) only works when accessing via Vite's dev server. If you're accessing from your phone, the API calls go through Vite's proxy, so the backend must be running on your PC too.

> [!WARNING]
> If your phone can't connect, check Windows Firewall — you may need to allow port 5173 through. Run this in an **admin PowerShell**:
> ```powershell
> netsh advfirewall firewall add rule name="Vite Dev" dir=in action=allow protocol=TCP localport=5173
> ```

---

## What's Complete (per Master Prompt §42 Acceptance Criteria)

| Step | Status |
|---|---|
| Open application | ✅ |
| Landing page | ✅ |
| Click "Plan My Trip" | ✅ |
| Select Cox's Bazar | ✅ |
| Select dates | ✅ |
| Enter budget | ✅ |
| Select interests | ✅ |
| Select travel style | ✅ |
| Set constraints | ✅ |
| Review | ✅ |
| Generate itinerary | ✅ |
| View multi-day itinerary | ✅ |
| View map | ✅ |
| See recommendation reasons | ✅ |
| Edit activity (remove) | ✅ |
| Regenerate day | ✅ |
| View updated budget | ✅ |
| Give feedback | ✅ |
| Adapt itinerary | ✅ |
| Save trip | ✅ |
| Open saved trip | ✅ |
| Duplicate trip | ✅ (newly added) |
| Delete trip | ✅ |

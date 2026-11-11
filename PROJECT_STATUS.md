# Vromon — Project Status: Done vs. Left

**Compiled:** 2026-10-23, from a review of every tracked file (721), the git history (15 commits, latest `89ec2fd`), and the reports in `docs/`.
**Note:** test counts below come from the latest recorded reports (2026-10-22). They were not re-run for this summary.

---

## 1. At a glance

| Area | State |
|---|---|
| Backend API (FastAPI, `backend/`) | ✅ Feature-complete for the current scope |
| Android app (Expo / React Native, `mobile/`) | ✅ Android plan phases 1–8 done |
| Trip planner (new-trip flow → Today mode) | ✅ Trip-planner plan steps 1–11 done |
| Evaluation (`evaluation/`) | 🟡 Done, except the live RAG evaluation |
| Sharing with friends (Cloudflare tunnel from the Mac) | ✅ Works while the Mac is on |
| **Going live (hosting, store build, Play Store)** | ❌ **Not started; needs accounts** |
| Data quality (10 new destinations) | ❌ Not checked by a person |

Latest recorded test results: backend `pytest` **549 passed, 8 skipped**; app `jest` **322 passed**; `tsc`, `eslint --max-warnings 0`, `alembic check` clean; Maestro phone suite passes (00–09, 99).

---

## 2. What is done

### 2.1 Backend (`backend/`)
- **Stack:** Python 3.11, FastAPI, SQLAlchemy 2, Pydantic 2, SQLite (dev) / PostgreSQL 16 (Docker, prod).
- **Alembic migrations:** 12 versions (`20261012_0001` → `20261020_0012`): baseline, users & trip ownership, geography & visits, friends, photos, trip stops, pinned items, must-dos, roads, conditions, chosen hotel, imported destinations.
- **Auth:** Supabase JWTs (`core/auth.py`); trips are owned by users; production mode requires sign-in; admin token for ingestion.
- **Rate limiting:** slowapi (`core/rate_limit.py`) on username checks, LLM calls, friend lookups/requests.
- **Monitoring:** Sentry wired in (`core/monitoring.py`), off until a DSN is set.
- **Endpoints (`/api/v1`):** destinations, places, trips, geo, visits, friends, photos, me/users, RAG.
- **Services:**
  - Recommendation ranking (weighted, explainable).
  - Itinerary: greedy heuristic + OR-Tools CP-SAT scheduler, independent constraint validator, editing (remove / replace / regenerate day / adapt), "running late" service, trip rules.
  - Budget service (known vs placeholder vs estimated costs).
  - Routing: OpenRouteService road times with `route_cache`, straight-line fallback, transport modes.
  - Conditions: Open-Meteo weather, usual-traffic warnings.
  - RAG: ingestion, chunking, embeddings, retrieval, grounded generation (Gemini), citation filtering.
  - Friends, privacy, photos (processing + Supabase storage), push (scaffold), stats.
  - Destination importer (`scripts/import_destinations.py`) — 10 extra destinations in `data/destinations/`.
- **Docker:** `backend/Dockerfile`, `docker-compose.yml`; CI workflow at `.github/workflows/ci.yml`.

### 2.2 Android app (`mobile/`) — Android plan phases 1–8
| Phase | Delivered |
|---|---|
| 1 Foundations | Dev build (not Expo Go), EAS config, theme tokens, UI kit, i18n (EN/BN) |
| 2 Accounts & privacy | Sign up / in / forgot / reset, Google sign-in, secure session storage, profile, username, home country, blocked users, delete account |
| 3 World map | MapLibre world map, countries offline, regions/cities via PMTiles, mark visited places |
| 4 Map themes | Theme catalog, previews, status colours (premium locks behind a flag, off) |
| 5 Friends | Friend codes, QR scanner, requests, compare maps, friend profiles |
| 6 Photos | Gallery picker, upload, strip & viewer on places and trips |
| 7 Trips | Trips tab, stats card, trip cards, route screen |
| 8 Hardening | Accessibility (labels, 48 dp targets, contrast, large text), trimmed permissions, Sentry, Maestro E2E, legal drafts, Play Store listing & graphics |

### 2.3 Trip planner — steps 1–11
| Step | Delivered |
|---|---|
| 1 Mockups | 13+ screens in `docs/trip-planner/mockups/`, design spec |
| 2 Trip screen | Map + plan sheet, day tabs, ribbon, stop cards, legs, free time, swipe-to-remove with Undo, read-only friend trips, Bangla digits |
| 3 Rearranging | Drag & drop within/between days, stay ±15 min, "Keep this time", add a stop |
| 4 New-trip flow | 3 short steps: where & when, style, must-dos; place picker, range calendar |
| 5 Real roads | Road distances/times via ORS, leg sheet |
| 6 Live conditions | Weather + usual-traffic chips and warnings |
| 7 Budget | Full budget screen, weather-aware planner, chosen hotel |
| 8 Trips tab | Next-trip card, trip list |
| 9 Today mode | Now/next, running late (Apply/Undo), opt-in foreground location (never stored), local reminders |
| 10 More destinations | Dhaka, Chattogram, Sylhet, Sreemangal, Rajshahi, Khulna, Bandarban, Rangamati, Kuakata, Tangail (Wikivoyage-credited) |
| 11 Hardening | Back closes sheets, delete returns to Trips, offline budget cache, contrast fixes, speed measured, `09-journey` E2E flow |

### 2.4 Other
- **Sharing with friends** (`scripts/share/`, `docs/sharing-with-friends.md`): preview APK reads the backend address from a public config file; Cloudflare quick tunnel; `start.sh` / `stop.sh`.
- **Evaluation:** validator fault injection (98/98 caught, 0 false positives), heuristic vs CP-SAT comparison, ranking vs baselines (P@5 0.975), performance.
- **Docs:** architecture, technology decisions (§1–28), running locally, deployment, go-live checklist, privacy policy & terms drafts, Play data safety & listing.
- **Original demo** preserved in `demo/` (web + PWA).

---

## 3. What is left

### 3.1 Going live (blocking anyone using the app without the Mac) — see `docs/go-live.md`
- [ ] Create a hosting account (Render recommended) and deploy `backend/Dockerfile` over HTTPS.
- [ ] Production database: Supabase Postgres connection string → `DATABASE_URL`.
- [ ] Set production env vars (`APP_ENV`, `DATABASE_URL`, `SUPABASE_*`, `ADMIN_TOKEN`, `CORS_ORIGINS`, `ORS_API_KEY`/routing, optional LLM & Sentry).
- [ ] Upload map tiles (~30 MB `.pmtiles`) to a public bucket; set `EXPO_PUBLIC_TILES_URL`.
- [ ] Choose EAS Build or local release build; build `preview` and `production` profiles (release must be signed with a real key, not the debug key).
- [ ] Add Supabase Auth redirect URLs for the new package.
- [ ] Distribute: APK link and/or Google Play internal testing (needs a $25 Play developer account).
- [ ] Smoke test from a phone on mobile data.
- [ ] Replace OpenRouteService free key with self-hosted OSRM (or a paid ORS plan) before launch.

### 3.2 Legal & store paperwork
- [ ] Fill every `[TO FILL]` in `docs/legal/privacy-policy.md`, `docs/legal/terms.md`, `docs/play-store/listing.md`, `docs/play-store/data-safety.md` (contact email, dates, governing law, hosting provider, deletion URL, policy URL).
- [ ] Have the legal drafts reviewed; host them at public URLs.
- [ ] Better store screenshots from a demo account with real data.

### 3.3 Accounts / integrations not yet set up
- [ ] **Push notifications:** Expo/EAS project + Firebase `google-services.json` + FCM key. Friend-request push is not delivered today (badge polls instead).
- [ ] **Sentry project** (DSNs for app and backend).
- [ ] **EAS Update** (over-the-air JS updates).
- [ ] **Domain for App Links** so invite links are tappable `https://…/add/<code>` (today: `vromon://` + code to type).
- [ ] **Gemini / embedding API key**, then run the live RAG evaluation (`evaluation/rag_generation_eval.py`, `test_rag_live.py` currently skipped) and calibrate `RAG_MIN_SCORE`.

### 3.4 Data
- [ ] A person must check prices, opening hours and whether places are open for the 10 imported destinations (decision 6).
- [ ] Ratings are unknown for all imported places.
- [ ] Thin destinations (Tangail, Bandarban, Kuakata, Rangamati: 7–8 places); most new towns have no restaurants/hotels — add via OpenStreetMap when its servers are up.
- [ ] Unknown opening hours default to 09:00–17:00.
- [ ] Unique pictures per destination card (all use the same drawing).
- [ ] Full credits page for Wikivoyage (CC BY-SA).
- [ ] Decide city-name spelling ("Cox’s Bāzār" vs "Cox's Bazar").
- [ ] Clean up ~50 old dev test trips and E2E accounts `e2e.ana` / `e2e.bob` when no longer needed.

### 3.5 Product gaps & polish
- [ ] Grounded Q&A (`POST /rag/ask`) has no mobile screen (backend only).
- [ ] `regenerate_day` always uses the heuristic (no single-day CP-SAT).
- [ ] pgvector not used — vectors stored as JSON, compared with numpy (fine at current size).
- [ ] Ranked hotel/restaurant choice lists are limited (hotel picked by category).
- [ ] Wizard labels partly English-only; longer Bangla explanations fall back to English; Bangla translations need a reviewer.
- [ ] Photos: no in-app camera, no pinch-to-zoom, not cached offline, picker selection lost under "Don't keep activities".
- [ ] Friend stats run one query per friend (needs batching for large lists); search is username prefix only.
- [ ] Map Theme "Friends" preview still uses a sample.
- [ ] Invite link opened while signed out is dropped after sign-in.
- [ ] Today mode: reminders reschedule only when the app is open; Android 14+ "Alarms & reminders" hint shown to everyone.
- [ ] Open Phase 4 questions: light-mode Default map, starting status colours, names of four catalog cards.
- [ ] Photo limits (2000/account, 15 MB/upload) need confirming.

### 3.6 Performance
- [ ] Cold start ~2.8–3.1 s (target 2.5 s) — show cached screen before session/`/me` finishes.
- [ ] World map panning ~40–48 fps — simplify low-zoom country geometry.
- [ ] Stop dragging ~50 fps — move re-layout off the JS thread.
- [ ] Occasional MapLibre "cities … incorrect header check" error at launch — investigate.

### 3.7 Verification still pending
- [ ] Real end-to-end TalkBack use on the new screens (only the accessibility tree was checked).
- [ ] Largest font scale on trip-planner steps 5–11 and Today mode; Today mode in Bangla.
- [ ] Fully offline phone (no Wi-Fi) behaviour.
- [ ] QR scan between two physical devices.
- [ ] Light-appearance itinerary map on device.
- [ ] CI workflow has not yet been confirmed running on GitHub; PostgreSQL migration test runs only in CI.

### 3.8 Housekeeping
- [ ] **`README.md` is out of date:** it still says "no authentication", "no Alembic migrations" and "one destination". All three are no longer true (Supabase auth, 12 Alembic migrations, 11 destinations, rate limiting added). It should be updated to describe the current app.
- [ ] Root-level prompt files (`vromon_*_prompt.md`, `vromon_step_by_step_implementation_plan.md`) could move into `docs/` or be archived.
- [ ] `docs/current-state-audit.md` and `docs/feature-inventory.md` describe the 2026-10-10/12 state and are stale.

---

## 4. Deliberately not planned
Social/group planning, in-app booking or payments, exposing planner internals, gamification/badges/feeds, AI-written day summaries (templates used instead), "describe your trip in words" (revisit later).

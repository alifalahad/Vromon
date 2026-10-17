# Vromon — Technology Decisions

**Date:** 2026-10-10

---

## Decision Record

### 1. Backend Framework: FastAPI

**Choice:** FastAPI (same as demo)
**Reason:** Already proven in demo, excellent async support, automatic OpenAPI docs, Pydantic v2 native integration. No reason to change.

### 2. Database: PostgreSQL + pgvector + PostGIS

**Choice:** PostgreSQL 16+ with pgvector and PostGIS extensions
**Reason:** Required for vector similarity search (RAG embeddings) and geographic queries. SQLite cannot support these. For local development, SQLite fallback with feature flags where PostgreSQL is unavailable.
**Driver:** `psycopg` (async-capable, modern PostgreSQL adapter)

### 3. ORM: SQLAlchemy 2.x + Alembic

**Choice:** SQLAlchemy 2.x with Alembic migrations
**Reason:** Demo already uses SQLAlchemy 2.x. Alembic adds version-controlled schema changes required for a production system.

### 4. Mobile Framework: React Native + Expo (SDK 52+)

**Choice:** Expo with Expo Router for file-based navigation
**Reason:** Specified in requirements. Expo simplifies build/run. Expo Router provides Next.js-like file-based routing.

### 5. LLM Provider: Google Gemini

**Choice:** Google Gemini via the official `google-genai` SDK (pinned `>=2.25.0,<3`; 2.25.0 installed)
**Default model:** `gemini-3.6-flash` (configurable via `LLM_MODEL`)
**Reason:** Free tier available for students, supports JSON structured output against a Pydantic schema, good multilingual (English + Bangla) support. Provider code lives behind `app/services/llm/provider.py` (`LLMProvider` interface) so it can be swapped.
**Phase 8 update (2026-10-11):** The original default `gemini-2.0-flash` reached its announced shutdown date (2026-06-01) per Google's deprecations page, so the default was changed. Verify the model ID is available to your key before demonstrating.

### 6. Embedding Model: Google text-embedding-004

**Choice:** `gemini-embedding-001` via the same `google-genai` SDK, truncated to 768 dimensions (`output_dimensionality`)
**Reason:** Good multilingual support, same API key as the LLM (single credential), 768 dims keeps vectors compatible with the existing store and pgvector. Documents use task type `RETRIEVAL_DOCUMENT`, queries `RETRIEVAL_QUERY`.
**Phase 8 update (2026-10-11):** `text-embedding-004` was shut down on 2026-01-14 per Google's deprecations page. `gemini-embedding-001` has an announced shutdown of 2028-05-14. The stored model name includes the dimension (e.g. `gemini-embedding-001-768`), and ingestion re-embeds any chunk produced by a different model.

### 7. Constraint Solver: Google OR-Tools CP-SAT

**Choice:** `ortools` Python package (pinned `>=9.15.6755,<10`; 9.15.6755 installed, released 2026-01-14). It pulls in `pandas`, `protobuf`, `absl-py` and `immutabledict`.
**Reason:** Specified in requirements. CP-SAT handles discrete scheduling problems well. The deterministic greedy baseline remains the default; CP-SAT is opt-in via `?algorithm=cpsat`.
**Phase 9 decision (2026-10-12):** The search is bounded by CP-SAT's *deterministic* work limit (`OPTIMIZER_DETERMINISTIC_LIMIT`, default 5.0) with `interleave_search` across 8 workers, so the same request yields the same schedule. A wall-clock limit alone gave different schedules on repeated runs. A wall-clock cap (`OPTIMIZER_TIME_LIMIT_SECONDS`, default 15) is a safety net, and the response flags `reproducible: false` if it is hit.

### 8. API Client (Mobile): Axios

**Choice:** Axios with typed wrapper
**Reason:** Well-tested HTTP client, interceptor support for auth/error handling, TypeScript types available.

### 9. State Management: TanStack Query + Zustand

**Choice:** TanStack Query for server state, Zustand for local UI state
**Reason:** TanStack Query provides caching/retry/invalidation for API data. Zustand is lightweight for shared UI state (trip wizard form data). No Redux overhead.

### 10. Form Handling: React Hook Form + Zod

**Choice:** React Hook Form for form state, Zod for validation schemas
**Reason:** Specified in requirements. RHF is performant (no unnecessary re-renders), Zod provides TypeScript-first schema validation.

### 11. Maps (Mobile): react-native-maps

**Choice:** `react-native-maps` 1.27.2 (installed with `npx expo install`, so the version matches SDK 57)
**Reason:** It is included in Expo Go (no native build or API key needed for development, per the SDK 57 docs). A Google Maps Android key is required only for store or standalone builds (`app.json` → `plugins.react-native-maps.androidGoogleMapsApiKey`). It has no web support, so `TripMap.web.tsx` shows a stop list with OpenStreetMap links on web.
**Routes:** dashed straight lines between stops in visiting order, labelled as such. No road-routing provider is used, so no route geometry or road travel times are claimed.

### 12. Python Package Management: pyproject.toml + pip

**Choice:** `pyproject.toml` with `pip freeze` for lockfile
**Reason:** Modern Python packaging standard. No need for Poetry/PDM complexity for a student project.

---

## Versions (Locked)

| Package | Version |
|---|---|
| Python | 3.11 (venv 3.11.4; Docker `python:3.11-slim`) |
| FastAPI | >=0.115.0 |
| SQLAlchemy | >=2.0.31 |
| Pydantic | >=2.10.0 |
| Alembic | >=1.13.0 (1.13.2 locked); migrations in `backend/alembic/` since Android Phase 1 |
| Uvicorn | >=0.30.0 |
| psycopg[binary] | >=3.2.0 |
| pgvector | >=0.3.0 |
| google-genai | >=2.25.0,<3 (2.25.0 installed) |
| ortools | >=9.15.6755,<10 (9.15.6755 installed) |
| httpx | >=0.28.1 (required by google-genai) |
| pytest | >=8.2.0 |
| Node.js | 24.x in CI (local dev verified on 26.9) |
| Expo SDK | 57 (expo 57.0.27) |
| TypeScript | ~6.0.3 |
| React Native | 0.86.3 (React 19.2.3) |

### 13. Grounded generation safeguards (Phase 8)

**Choice:** Custom, framework-free pipeline in `app/services/rag/generation.py`; no LangChain/LlamaIndex.
**Reason:** The pipeline is ~300 lines; a framework would add dependencies without a concrete benefit. Safeguards: retrieval relevance gate (`RAG_MIN_SCORE`), structured output schema, citation validation against labels actually given to the model, numeric-value grounding check (prices/hours/ratings must appear in cited sources), and source references built from database rows only.

### 14. Mobile testing (Phase 10)

**Choice:** `jest` ~29.7 + `jest-expo` ~57.0 (`"jest": {"preset": "jest-expo"}`), `@testing-library/react-native` 14.1 with `test-renderer` ~1.2 (the version RNTL recommends for React 19.2). Scripts: `npm test`, `npm run typecheck`.
**Note:** RNTL v14 made `render` and `fireEvent` async; tests must `await` them.
**Lint (Phase 11):** `eslint` 9 + `eslint-config-expo` ~57 (flat config, `eslint.config.js`); `npm run lint` and `npx eslint . --max-warnings 0` pass.

### 15. Reproducibility and delivery (Phase 11)

- **Python lock:** `backend/requirements.lock` (`pip freeze` of the tested venv). Verified by a clean install into an empty venv, then the full test suite.
- **PostgreSQL:** `psycopg[binary]` 3.3.6, `pgvector` (Python) 0.5.0. The app runs on PostgreSQL 16 (`pgvector/pgvector:0.8.0-pg16`), verified end to end via Docker. The pgvector extension is available but not used yet; vectors are still JSON plus numpy.
- **Containers:** `backend/Dockerfile` (python:3.11-slim, non-root, healthcheck) and root `docker-compose.yml` (db + backend). Both verified.
- **CI:** `.github/workflows/ci.yml` (actions/checkout@v7, setup-python@v7, setup-node@v7). The same commands were run locally on a clean copy. **The workflow has not run on GitHub yet**; it runs on the first push.

---

## Android app: social travel map (Phase 0, 2026-10-12)

Decisions confirmed by the developer for the work described in `vromon_android_app_agent_prompt.md`. The plan is in `docs/android-app-plan.md`.

### 16. Product decisions (D1–D9)

| # | Decision | Choice |
|---|---|---|
| D1 | Identity provider | **Supabase Auth**, with Supabase Postgres (PostGIS, pgvector) and a private Supabase Storage bucket for photos. FastAPI verifies Supabase JWTs against the project's JWKS. Email verification, password reset, and Google sign-in come from Supabase. |
| D2 | Premium locks | **All free for now.** Every catalog item carries `tier: 'free' \| 'premium'`; the lock UI is hidden behind a feature flag. No Play Billing. |
| D3 | What a non-friend sees (search, QR) | **Username, display name, avatar.** Nothing else. |
| D4 | Existing ownerless trips | **Assigned to the first account created in development; deleted in production** (environment-gated Alembic data migration). |
| D5 | Disputed borders | **Natural Earth Bangladesh point of view.** |
| D6 | "% of world" denominator | **195** (193 UN members + 2 observers). Territories can be marked and are listed, but are counted separately. |
| D7 | Trip legs | **New `trip_stops` table** (order, city, country, transport mode, dates). The wizard creates one stop for the destination and lets the user add an origin. |
| D8 | Incomplete catalog cards (❓ in prompt §7.2–7.4) | **Best-fit colours.** Values cut off in the screenshots are designed to fit the visible stripes and the rest of the palette. Each such value is flagged `derived: true` in `catalog.ts` so it is never presented as sampled. Full screenshots, if supplied later, replace them. |
| D9 | Font | **System font (Roboto on Android).** |
| — | Build path | **Local development builds first** (`npx expo run:android` on a USB-connected phone). `eas.json` is written in Phase 1; EAS cloud builds start once an Expo account is logged in (required by Phase 8). |

### 17. Mobile library versions for SDK 57 (verified 2026-10-12)

Expo-managed versions come from `expo/bundledNativeModules.json` in the installed `expo` 57.0.27, which is what `npx expo install` resolves. Install with `npx expo install` regardless.

| Library | SDK 57 version | Notes |
|---|---|---|
| expo-dev-client | ~57.0.19 | |
| expo-haptics | ~57.0.3 | SDK 57 has `performAndroidHapticsAsync(AndroidHaptics.*)` (no `VIBRATE` needed). Expo's docs recommend it over the Vibrator-based `impactAsync`/`notificationAsync` on Android, so the wrapper uses it on Android. |
| react-native-reanimated / react-native-worklets | 4.5.1 / 0.10.1 | |
| react-native-gesture-handler | ~2.32.0 | |
| @expo/vector-icons | ^15.0.2 | |
| expo-image / -image-picker / -image-manipulator | ~57.0.5 / ~57.0.20 / ~57.0.21 | |
| expo-camera | ~57.0.6 | Barcode scanning |
| react-native-svg | 15.15.4 | |
| expo-secure-store | ~57.0.4 | |
| @react-native-async-storage/async-storage | 2.2.0 | Query-cache persister and local preferences. **Never holds tokens in plain text.** The Supabase session goes through a storage adapter backed by `expo-secure-store`; if the session exceeds SecureStore's size limit, the adapter stores it AES-encrypted in AsyncStorage, with the key in SecureStore. |
| expo-localization | ~57.0.2 | |
| expo-notifications | ~57.0.22 | |
| @shopify/flash-list | 2.0.2 | |
| expo-sharing / expo-clipboard / expo-linking | ~57.0.22 / ~57.0.2 / ~57.0.12 | |
| @sentry/react-native | ~7.11.0 | |
| expo-updates | ~57.0.25 | |
| expo-build-properties | ~57.0.22 | Only if an SDK level needs overriding |
| **Not in Expo's list (check at install time):** | | |
| @maplibre/maplibre-react-native | 11.5.0 | Peers: expo ≥54, react ≥19.1, react-native ≥0.80. Has a `codegenConfig` (New Architecture). Expo config plugin `@maplibre/maplibre-react-native`; not usable in Expo Go. Bundles MapLibre Native Android 13.6.1, which reads `pmtiles://` sources (supported since Android 11.7/11.8). **PMTiles sources are not cached for offline use**, which is why the admin-0 layer is bundled in the app. |
| @gorhom/bottom-sheet | 5.2.14 | Peers accept Reanimated ≥4 and Gesture Handler ≥2.16.1. Last published 2026-05. Must be smoke-tested on the dev build in Phase 1; fallback is Expo Router `formSheet`. |
| react-native-mmkv | 4.3.2 | Needs `react-native-nitro-modules` (0.37.1). **Chosen instead: AsyncStorage** (Expo-managed, already needed for the query persister). Preference reads are few and small, so MMKV's speed doesn't justify an extra native dependency. |
| react-native-qrcode-svg | 6.3.26 | Peer react-native-svg ≥14 |
| @tanstack/query-async-storage-persister, @tanstack/react-query-persist-client | 5.104.2 | Match the installed `@tanstack/react-query` minor |
| i18next / react-i18next | 26.4.3 / 17.0.16 | Peers accept TypeScript 6 |
| @supabase/supabase-js | 2.117.3 | Auth client only; all data goes through FastAPI |

### 18. Android platform levels

SDK 57 / React Native 0.86 default to **compileSdk 36, targetSdk 36, minSdk 24** (`react-native/gradle/libs.versions.toml`). Google Play requires new apps and updates to target **API 36 (Android 16)** from 2026-08-31, so the defaults satisfy it without `expo-build-properties`. Re-check before the Phase 8 submission.

### 19. Doc drift found in the Phase 0 audit

The "Versions (Locked)" table above listed Python 3.14.x, Expo SDK 52+, TypeScript 5.x, and React Native 0.76+. It was corrected in Android Phase 1 to what the repository actually uses.

### 20. Android Phase 1 foundations (2026-10-12)

- **Build:** `app.json` → `app.config.ts`. `APP_VARIANT` (set per profile in `mobile/eas.json`; unset locally = development) selects the Android package: `com.vromon.app.dev`, `com.vromon.app.preview`, `com.vromon.app`. `android/` and `ios/` are generated by `npx expo prebuild` and git-ignored.
- **Theme:** semantic tokens in `mobile/src/ui/theme/tokens.ts`, `useTheme()` / `makeStyles()`, Appearance = System / Light / Dark. Text tokens pass WCAG AA on `bg` and `surface` (unit-tested). The sampled `accent` #3379F3 is kept as a fill colour; accent-coloured text uses `link` (#6EA0F6 dark). Documented exceptions: white on #3379F3 is 4.06:1 (passes AA only for large text and UI components), and the active tab label uses `accent` to match `01-bottom-nav.jpg`.
- **Interaction:** `src/ui/haptics.ts` (Android: `performAndroidHapticsAsync`) and `src/ui/PressableScale.tsx`; ESLint `no-restricted-imports` blocks `expo-haptics` and React Native's touchables elsewhere. Reduce Motion is read through `AccessibilityInfo` (`src/ui/useReduceMotion.ts`) rather than Reanimated's `useReducedMotion`, which Expo Router's test mocks don't provide.
- **Tabs:** `expo-router/js-tabs` (the `Tabs` export from `expo-router` is deprecated in SDK 57).
- **Local preferences:** Zustand `persist` over AsyncStorage (`vromon.preferences`).
- **Migrations:** startup runs `app.db.migrations.upgrade_to_head()` instead of `create_all`. A database created by `create_all` before Alembic is stamped at baseline `0001` automatically. `tests/test_migrations.py` asserts zero drift between migrations and models, downgrade to base, adoption, and idempotency on SQLite and, when `TEST_POSTGRES_URL` is set (CI service container), PostgreSQL.
- **Added packages** (all via `npx expo install`): expo-dev-client, expo-haptics, react-native-reanimated 4.5.1 + react-native-worklets 0.10.1, react-native-gesture-handler, @gorhom/bottom-sheet 5.2.14, @expo/vector-icons + expo-font + expo-asset, expo-localization, i18next + react-i18next, @react-native-async-storage/async-storage, expo-system-ui.

### 21. Android Phase 2 backend: accounts and privacy (2026-10-12)

- **Token verification:** Supabase access tokens are verified locally with PyJWT (`pyjwt[crypto]` 2.15.1) against `{SUPABASE_URL}/auth/v1/.well-known/jwks.json`: ES256/RS256 only, `aud=authenticated`, `iss={SUPABASE_URL}/auth/v1`, `exp` required. Keys are cached for at most 600 s (Supabase's advice) and refetched for an unknown `kid`. **Legacy HS256 projects are not supported**: Supabase recommends against verifying the shared secret locally, so the project must use asymmetric JWT signing keys (the default for new projects).
- **Accounts:** a `users` row is created on first authenticated request (`auth_subject` = JWT `sub`). Usernames are stored lowercase (3–20 of `a-z0-9._`, no leading, trailing or double dots, a small reserved list), so uniqueness is case-insensitive. `email` is an informational copy and **not unique** (Supabase owns email identity; a unique column would break re-registration after an out-of-band deletion). No `deleted_at`: deletion is immediate and permanent.
- **Account deletion:** local data (trips with itineraries and feedback, settings, profile) is deleted in one transaction, then the Supabase identity via the Admin API with `SUPABASE_SERVICE_ROLE_KEY`. If the Admin call fails, the response is 502 and the user can retry. In production a missing service key returns 503 before anything is deleted.
- **Privacy:** every trip route is owner-scoped in `_load_trip`; other users get **404**. `/users/{id}/…` routes use `require_viewer_can_see` (owner only until friendships exist in Phase 5). RAG search, ask and explain require sign-in (paid model calls), and explain also checks trip ownership before anything else.
- **Rate limits** (slowapi 0.1.10, per client IP): username availability 30/min, grounded ask/explain 20/min. Behind Render, uvicorn needs `--proxy-headers` for real client IPs.
- **Decision D4, as implemented:** migration `0002` adds `trips.user_id` (nullable) and, when `APP_ENV=production`, deletes ownerless trips and their child rows. In development the first account adopts ownerless trips. The `DEV_AUTH_BYPASS` user counts as a stand-in: the first real account inherits its trips too. `trips.user_id` becomes NOT NULL in a later migration, once development databases have been claimed.
- **`DEV_AUTH_BYPASS`:** development-only switch (refused by settings validation unless `APP_ENV=development`) so the app keeps working before mobile sign-in exists.
- **Test isolation:** `tests/conftest.py` points `DATABASE_URL` at a temporary SQLite file before importing the app. Before this, tests that triggered the app's own engine wrote to the developer's `backend/vromon.db`.

### 22. Android Phase 3: world map (2026-10-13)

- **Data:** Natural Earth 5.1.1 **Bangladesh point of view** (Natural Earth names the file `…_bdg`), Natural Earth admin-1, and GeoNames `cities15000`, built by `scripts/geo/build.sh` (mapshaper 0.6 via npx, tippecanoe 2.79 via Homebrew). Sources, licences and code rules: `docs/data-sources.md`.
- **D5 × D6 (developer decision, 2026-10-13):** the Bangladesh POV draws Israel/Palestine as one feature, Palestine. The map follows it exactly, and **"% of world" uses 194** (193 UN members + Holy See + Palestine − Israel). The pipeline asserts both counts.
- **Map engine:** `@maplibre/maplibre-react-native` 11.5.0 (`Map`, `Camera`, `GeoJSONSource`, `VectorSource`, `Layer` with `paint`/`layout`). Countries are a bundled GeoJSON (655 KB, simplified 6%, works offline). Regions (4,556) and cities (33,940) are PMTiles (16 MB / 14 MB), served in development by `GET /api/v1/geo/tiles/{name}.pmtiles` (Starlette `FileResponse` answers Range requests); production moves them to a CDN (`EXPO_PUBLIC_TILES_URL`). Status colours are a `match` paint expression rebuilt from the visit list, so marking a place updates one paint property.
- **Labels:** MapLibre's demo glyph server (`Noto Sans Regular`) in development; self-hosted before release. **Map labels are English**: MapLibre can't shape Bengali script; everything else follows the language setting.
- **Offline:** TanStack Query cache persisted to AsyncStorage (7 days, only `me`/`visits`/`trips`/`trip`/`itinerary`/`destinations`, cleared on sign-out). Visit edits are optimistic and go through a persisted outbox (`src/features/map/visits.ts`), flushed on app start, on foreground and when `expo-network` reports a connection. It only ever sends the owning account's edits. The server keeps the newest change per place (`client_updated_at`, clamped to server time).
- **Stats:** `backend/app/services/stats/` (shared by friends later). Lived counts as visited; counts follow what the user marked (a visited city does not silently add its country; the app asks once, with "Don't ask again").
- **Reference API:** public `GET /geo/countries|regions|cities` with day-long cache headers. Visits: `PUT /me/visits` (batch ≤ 500, validates every code), `DELETE /me/visits/{type}/{code}`, `GET /users/{id}/visits|stats` behind `require_viewer_can_see`. Visits include their country (`country_iso2`) for per-country counts and, later, friend comparison.

### 23. Android Phase 4: map themes (2026-10-13)

- **Catalog** (`mobile/src/features/mapThemes/catalog.ts`): 4 Themes, 11 Colors, 15 Styles. Land, water and status colours are sampled from the screenshots; borders, labels and halos are tuned values that pass WCAG AA (label on halo ≥ 4.5:1, label on land ≥ 3:1, unit-tested for every base map). **D8 as applied:** values the screenshots cut off are listed per item in `derived` (Sky's Lived, Intrepid's Visited, Ivory's water, borders of Sage and Ivory). The four unnamed cards got our own names: **Forest** (the "…st" palette), **Cobalt** (after Burst), **Sage** and **Ivory** (the two partial styles).
- **Selection model:** the account stores ids, not colours: `{ v: 1, themeId?, styleId, colorsId, compareId }`, where `theme:<id>` means a preset's own map or status colours. Picking a Theme sets all three parts; picking a Color or Style replaces one part and the selection becomes **Custom** (prompt §6.6). Ids rather than the prompt's inline `Compare` colours, so catalog corrections reach existing users. Unknown ids (from a newer app) fall back to the Default theme's part. The out-of-box selection is the **Default theme** (`13-settings-rows.jpg` shows "Default"), so the map's Visited colour changes from Phase 3's magenta to the Default theme's orange (`04`); the magenta palette is still available as Colors → Default.
- **Preset statuses** (proposal from prompt §7.2, as implemented): Want to visit = the Visited colour at 35% over land plus a 1.5 dp outline; Lived = Visited with HSL lightness × 0.8. Friend "In common" is blended over land at the preset's opacity (Rustic renders #AB898A as in `07`).
- **Server:** `PUT /me/settings` validates `map_theme` strictly (Pydantic `MapThemeSelection`, extra fields forbidden, id patterns, `v: 1`); `GET` returns whatever is stored, so older rows still load. No migration: the JSON column existed since Phase 2.
- **Sync:** local first (Zustand persisted), pushed debounced. A change the server hasn't confirmed is remembered per account (`unsyncedFor`) and pushed on the next start instead of being overwritten by the server's older copy; another account's unsent changes are dropped, never sent.
- **Rendering:** the MapLibre style now holds glyphs only; water, patterns, glow, terrain and labels are React-child layers that stay mounted and toggle `visibility`, so changing a theme is a paint update, not a style reload. Patterns are runtime images (`<Images>`) used by a `background-pattern` layer. Glow is a second blurred `line` layer.
- **Odyssey terrain:** hillshade from AWS Open Data Terrain Tiles (Terrarium, read live, needs a connection; flat colours offline). The tiles include the sea floor, so a sea mask (world polygon minus the countries, built once at runtime) is drawn over the shading. **MapLibre RN 11.5 bug:** setting any `hillshade-*-color` crashes on Android (the style factory reads a colour as an array), so the defaults are used, with a zoom-scaled exaggeration.
- **Artwork** (prompt rule 10): Style thumbnails and the Pencil/Treasure pattern tiles are rendered by `scripts/map-themes/build.py` from the Natural Earth countries and the catalog colours. A fingerprint in the generated module makes a unit test fail when the catalog changes without re-running the script.
- **D2:** every item has a `tier`; only the Default items are free. `FEATURE_PREMIUM_LOCKS = false` (`src/constants/features.ts`) hides the lock badges and the locked Apply.
- **Bottom sheets (bug found on the device in this phase):** `@gorhom/bottom-sheet` 5.2.14 ignores every `present()` after `dismiss()` was called on a sheet that wasn't open, which the place sheet and the Settings option sheets did on mount. Not caused by Phase 4: the option sheets, untouched in this phase, failed the same way (when it started wasn't established). Both now open and close through `src/ui/useSheetPresentation.ts`.

### 24. Android Phase 5: friends (2026-10-13)

- **Schema** (migration `0004`): `friend_requests` (one pending request per direction, a partial unique index), `friendships` (stored once, smaller id first; `CHECK user_a_id < user_b_id`, ordered by UUID hex, which is the byte order SQLite and PostgreSQL compare), `blocks`, `devices` (Expo push tokens, unique), and `user_settings.notify_friend_requests|notify_friend_accepted`. The boolean defaults use `sa.true()`: autogenerate on SQLite wrote `'1'`, which PostgreSQL rejects.
- **Privacy:** `require_viewer_can_see` admits the owner and accepted friends, with no block either way. Every `/users/{id}/…` route is a GET. Friends can read a trip, its itinerary and its budget (`_load_trip(..., friends_may_read=True)`); every write stays owner-only and answers 404 to anyone else. A pending request grants nothing. Unfriending and blocking take effect on the next request. The privacy matrix (prompt §8) is in `tests/test_friends.py`; making the guard admit everyone fails 5 of its tests.
- **Finding people:** username prefix search over discoverable accounts with a username, excluding yourself and anyone blocked either way, with `LIKE` wildcards escaped (at least 2 characters, 20 results, rate-limited 30/min). Friend codes (8 characters, no look-alikes) work for anyone, discoverable or not, and are rotatable. A request by user id only reaches discoverable people (or someone who already asked you). Asking someone who already asked you accepts their request. Results show only id, username, display name and avatar (D3), plus the viewer's relation for the button.
- **QR codes** hold `vromon://add/<CODE>`, so a phone's own camera app opens Vromon too. The in-app scanner also accepts a bare code or an `https://…/add/<CODE>` link (for App Links later). There are no user ids in QR codes (prompt §9).
- **Push:** the Expo Push API over `httpx` (no extra SDK). Recipients and preferences are read in the request, and the send runs as a background task; tokens Expo reports as `DeviceNotRegistered` are deleted. A token belongs to whoever signed in last on that phone, and sign-out unregisters it. **Not yet active:** the app needs an EAS project id (`EAS_PROJECT_ID`) and Firebase (`GOOGLE_SERVICES_FILE`) at build time. Without them registration does nothing and Settings says so. The Friends badge polls incoming requests every 60 s and refreshes when the app or tab is focused. Permission is asked in context (first friend request sent or accepted, or a Settings toggle), never at launch.
- **Offline:** friends, friend profiles, stats and trips are persisted with the rest of the query cache. Unfriending or blocking removes that person's cached data. TanStack's focus manager now follows `AppState`, so stale data refreshes when the app returns to the foreground.
- **Account deletion and export** now cover friendships, requests, blocks and push tokens.
- **New native modules** (one new dev build): expo-camera ~57.0.6 (`recordAudioAndroid: false`, so no microphone permission), expo-notifications ~57.0.22, expo-clipboard ~57.0.2, react-native-svg 15.15.4, react-native-qrcode-svg 6.3.26.

### 25. Android Phase 6: photos (2026-10-17)

- **Storage:** a private Supabase Storage bucket (`photos`, decision D1), used only by FastAPI with the service role key over the Storage REST API (`httpx`, no extra SDK). The bucket is created private on first upload (JPEG only, 8 MB per file), and the server refuses to use it if it has been made public. Object keys are `<random photo uuid>/full.jpg` and `…/thumb.jpg`, not tied to the owner's id. `PHOTO_STORAGE=local` keeps files on disk with HMAC-signed URLs served by `GET /api/v1/photo-files/…`; it is for development and tests, and refused in production (Render's disk is ephemeral).
- **Signed URLs:** issued only by `GET /users/{id}/photos`, behind `require_viewer_can_see`, and signed in one batch call per list. They last `PHOTO_URL_TTL_SECONDS` (600 s; settings refuse more than 900 s, the prompt's ceiling). Supabase enforces the expiry itself (verified: an expired URL returns 400 `"exp" claim timestamp check failed`), and the bucket's public URL returns 400. Unfriending or blocking ends access to the list at once; a URL already handed out keeps working until it expires (at most 10 minutes). Deleting a photo removes the file at once, but Supabase's CDN (Cloudflare, cached per file, token still checked on every request) keeps serving it to links issued *before* the delete for about a minute (measured 54–56 s; the `Cache-Control` header sent on upload makes no difference). An expired link fails even when the file is cached.
- **Processing (Pillow 12.3.0):** every upload is decoded and re-encoded from its pixels into a brand-new image, so no EXIF (GPS included), XMP, IPTC, comments, ICC profile or trailing data survive. Orientation is applied to the pixels first, colours are converted to sRGB, and transparency is flattened onto white. Full size ≤ 2048 px (JPEG q85), thumbnail ≤ 480 px (q78). JPEG, PNG and WebP only; at most 50 megapixels (decompression bombs refused before decoding) and `PHOTO_MAX_UPLOAD_MB` (15). The capture date is read from EXIF before it is discarded; the phone's own reading wins, and future dates are ignored. Pillow 13.0.0 (released 2026-10-16) was too new to pin.
- **Model** (migration `0005`): `photos(id uuid, user_id, storage_key, thumb_key, width, height, size_bytes, taken_on, place_type, place_code, trip_id → trips ON DELETE SET NULL, created_at)`, with `CHECK (place_type IS NULL) = (place_code IS NULL)`. "A photo needs a place or a trip" is checked by the API, not the database: a CHECK would make PostgreSQL refuse to delete a trip whose photos have no place, because of the SET NULL.
- **Places:** a country's photos include those of its regions and cities, and a region's those of its cities. Clearing a visit keeps the photos.
- **Lifecycle:** deleting a trip deletes the photos that belong only to it; photos also tied to a place stay, without the trip. Account deletion removes the files first: if the bucket fails, nothing is deleted (502) and the user can retry, so no file is left behind without a row. The export lists photo metadata with signed links (which expire like in the app).
- **Limits:** 2000 photos per account, uploads rate-limited to 60 per minute.
- **Mobile:** `expo-image-picker` ~57.0.20 (the Android photo picker, multi-select up to 10, no storage permission), `expo-image-manipulator` ~57.0.21 (the contextual API: ≤ 2048 px, JPEG 0.85, so uploads stay small on mobile data), `expo-image` ~57.0.5 (thumbnails and the viewer, cached by photo id via `cacheKey`, so a new signed URL doesn't download again). Photo lists are never persisted (their URLs expire) and refetch a minute before the soonest expiry. Uploads go one at a time with progress, and a failed one stays on screen with Retry or Discard. Sign-out clears the image caches and any pending uploads.
- **Permissions:** `android.blockedPermissions` removes `READ_EXTERNAL_STORAGE`, `WRITE_EXTERNAL_STORAGE`, `READ_MEDIA_IMAGES`, `READ_MEDIA_VIDEO`, `READ_MEDIA_VISUAL_USER_SELECTED` and `RECORD_AUDIO`, which the picker module would otherwise add. `CAMERA` stays for QR scanning (the picker can't block it without blocking QR too).
- **Expo patch updates** (`npx expo install --fix`, so expo-doctor passes): expo 57.0.30, expo-asset 57.0.20, expo-constants 57.0.22, expo-linking 57.0.13, expo-notifications 57.0.23, expo-router 57.0.28.

### 26. Android Phase 7: trips (2026-10-17)

- **Trip stops (D7, migration `0006`):** `trip_stops(trip_id, position, city_geonameid?, country_iso2, transport_mode?, arrive_on?, depart_on?)`, unique per (trip, position). `transport_mode` (plane / bus / train / car / boat / walk) is *how you get to* that stop; a stop without one shows "Stop". A stop names a GeoNames city or only a country. New trips get an optional origin from the wizard plus the destination, which is matched to the **nearest GeoNames city in the destination's country** (by coordinates, not by name: GeoNames spells it "Cox’s Bāzār"). The migration backfills that destination stop for existing trips. `PUT /trips/{id}/stops` replaces the route (owner only); duplicating a trip copies it.
- **Trip statistics** (`app/services/stats/trips.py`, pure and unit-tested): completed trips only (end date before today); duration = end − start + 1; weeks = days / 7, months = days / 30.44, years = days / 365.25 (2 decimals); average = total days / completed trips (1 decimal); continents, countries and cities from the completed trips' stops; plus longest trip, most visited country, trips per year and transport modes. `GET /me/trips/stats` and, for friends, `GET /users/{id}/trips/stats` (privacy guard). "Today" is the phone's local date, accepted when within a day of the server's UTC date, so a trip ends at the user's midnight.
- **"Mark these places as visited?"** `POST /trips/{id}/mark-visited {mark}` (owner only, after the trip has ended) marks every stop's city and country visited and records the answer in `trips.visited_prompt`, so it is asked once per trip. It never downgrades: "lived" and "visited" stay, "want to visit" becomes "visited", and missing visit dates are filled from the stop or the trip. The Trips tab offers it for the most recent finished, unanswered trip **whose places aren't all on the map already** (otherwise every old trip to the same city would ask in turn).
- **Trips tab** (`10`): stats card over an **original illustration** (`scripts/trips/render_stats_card.py`, deterministic) with a warm orange overlay; sections Upcoming (soonest first), Ongoing, Past (most recent first); trip cards with the date range, "Duration N days" in green, and stops with flag, transport icon and "City, Country" joined by a dotted line. Duplicate and delete moved off the cards (they stay on the trip screen). `tripStats` is persisted for offline use with the other trip data.
- **Wizard:** the Where step adds "Starting from (optional)" (GeoNames city search) and "Getting there"; saving returns to the Trips tab (`router.dismissTo('/trips')`), where the trip appears under Upcoming.
- **Friends' trips** open read-only from their profile: the trip screen hides the planner, duplicate, delete, feedback, route editing and photo uploads; the itinerary hides Adapt, Redo, Regenerate day, Why?, Replace and Remove. The server already refused those writes (404).
- **Itinerary map → MapLibre:** streets from **OpenFreeMap** (`liberty` in light appearance, `dark` in dark), GeoJSON sources for day lines (dashed) and numbered markers (circle + symbol layers, Noto Sans from OpenFreeMap's glyphs); tapping a marker names the stop below the map. Attribution is shown (MapLibre button plus caption). `react-native-maps` was **removed**, so the app has one map engine and needs no Google Maps key.
- **Keyboard on edge-to-edge Android:** the window doesn't resize for the keyboard, so the wizard and route editor use `KeyboardAvoidingView` with `padding`, and the city search scrolls itself to the top of its scroll view when focused (`innerViewRef` + `measureLayout`).

### 27. Android Phase 8: hardening, on this Mac only (2026-10-17)

The developer chose to keep everything local for now: no deployment, cloud builds, store release or git changes. The steps that need their accounts are in `docs/go-live.md`.

- **Accessibility:**
  - Every icon-only control has a label (static scan of all screens), and the accessibility tree was checked on the device for eight screens.
  - Tab buttons now carry a clean label; TalkBack previously read the icon-font glyph (", Map"). The Friends tab says "Friends, 1 friend request" when there is a badge.
  - The whole 64 dp Settings row is the switch (role `switch`, checked state); the Switch itself (about 27 dp) is hidden from TalkBack.
  - Small targets: the segmented control gets `hitSlop`, the wizard's mode chips are 48 dp, and "Browse places" gets a larger slop. The inline "Invite" / "add via code" links stay at the sentence's line height (a WCAG 2.5.8 inline exception), with the 64 dp + button doing the same thing.
- **Contrast (WCAG AA):** a unit test checks every text token on every surface it is used on, in both appearances.
  - Light appearance: tertiary text, link, success and warning were darkened slightly to pass on the inset grey.
  - Map-view and itinerary accent text now uses `link` (the Phase 1 rule).
  - The dark accent stays #3379F3, and the active tab stays accent-coloured: these are the documented Phase 1 exceptions (§20).
- **Crash reporting (Sentry):** `@sentry/react-native` 7.11.0 and `sentry-sdk` 2.71.0 (2.72.0 was only five days old). Both are off unless a DSN is set (`EXPO_PUBLIC_SENTRY_DSN`, `SENTRY_DSN`). No personal data is sent: no PII, no request bodies, no screenshots or view hierarchy, and tracing is off. The build plugin, which uploads source maps, is added only when `SENTRY_ORG` and `SENTRY_PROJECT` are set; local builds use `SENTRY_DISABLE_AUTO_UPLOAD=true`. Metro uses `getSentryExpoConfig` (adds debug IDs to bundles).
- **E2E:** a Maestro suite in `mobile/.maestro` follows the prompt §10 flow. It needs two throwaway test accounts.
- **Release permissions:** the first release APK declared permissions the app never uses: location (from MapLibre's user-location layer), biometric (a library dependency) and `SYSTEM_ALERT_WINDOW`. They are now in `android.blockedPermissions`. The release APK asks only for camera (QR), internet, network and Wi-Fi state, notifications (with boot and wake-lock for scheduled ones), vibration and the launcher badge (verified with aapt2); no location, storage, microphone, biometric or overlay.
- **Backend for production:** uvicorn trusts `X-Forwarded-For` behind the host's proxy (`--proxy-headers`), so rate limits apply per client and not per proxy.
- **Release material:**
  - Privacy policy and terms (drafts with `[TO FILL]` items) in `docs/legal/`.
  - Play Data safety answers and the listing in `docs/play-store/`.
  - Store graphics: `scripts/store/render_assets.py` makes the 512 px icon, a 1024 × 500 feature graphic from the original illustration, and 2:1 screenshots.

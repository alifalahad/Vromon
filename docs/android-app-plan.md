# Vromon Android App: Implementation Plan

**Written:** 2026-10-12 (Phase 0), from an audit of commit `bc34328` plus uncommitted `docs/design-reference/` and `vromon_android_app_agent_prompt.md`.
**Source spec:** `vromon_android_app_agent_prompt.md` (called "the prompt" below; § numbers refer to it).
**Decisions:** `docs/technology-decisions.md` §16–19.

One phase per session. Each phase ends with the prompt's §12 report and stops for approval.

---

## 1. Phase 0 audit results

### 1.1 Prompt §2 re-verified

| Area | Prompt says | Found | Match |
|---|---|---|---|
| Backend | Python 3.11, FastAPI, SQLAlchemy 2, Pydantic 2, OR-Tools, Gemini RAG | Same; venv Python 3.11.4 | ✓ |
| Migrations | None; `create_all` | `backend/app/main.py:34` calls `Base.metadata.create_all`; `alembic>=1.13.0` is in `pyproject.toml` but there is no `alembic/` directory | ✓ |
| Tables | — | destinations, places, restaurants, hotels, trips, trip_preferences, trip_constraints, itineraries, itinerary_items, feedback, source_documents, document_chunks | — |
| Auth | None | None; `Trip` has no owner | ✓ |
| Mobile | Expo 57, RN 0.86, React 19.2, TS 6 | expo 57.0.27, react-native 0.86.3, react 19.2.3, typescript ~6.0.3 | ✓ |
| Routes | `mobile/app/` | `mobile/app/` (`(tabs)/index`, `(tabs)/trips`, `destination/[id]`, `trip/new`, `trip/[id]`, `itinerary/[id]`) | ✓ |
| Maps | react-native-maps 1.27 | 1.27.2; `TripMap.tsx` + `TripMap.web.tsx` | ✓ |
| Theme | slate palette | `mobile/src/theme.ts`; root layout also hard-codes `#0F172A`/`#60A5FA` | ✓ (hard-coded colours to remove) |
| Run mode | Expo Go, no `eas.json` | No `eas.json`, no `expo-dev-client`; `app.json` has `userInterfaceStyle: "dark"` | ✓ |
| Data | Cox's Bazar only | `data/seed/coxsbazar.json` | ✓ |
| Legacy | `demo/`, `frontend/` frozen | Present | ✓ |

### 1.2 Baseline checks (2026-10-12, before any change)

| Check | Result |
|---|---|
| `npm run typecheck` (mobile) | pass |
| `npm run lint` (mobile) | pass, no findings |
| `npm test` (mobile) | 4 suites, **36 passed** |
| `pytest -q` (backend) | **219 passed, 3 skipped**, 1 deprecation warning (Starlette test client wants `httpx2`) |
| `npx expo-doctor` | **21/21 checks passed** |

### 1.3 Local toolchain

Node 26.9.0, npm 11.19.1, Java, Docker, Android SDK with `adb` and an emulator package, all present. **Not installed:** `eas-cli` (only needed in Phase 8, run through `npx eas-cli@latest`), `maestro` (Phase 8), `tippecanoe` (Phase 3, via `brew install tippecanoe` or its Docker image).

---

## 2. Architecture

```
Android app (Expo dev build, com.vromon.app)
 ├─ supabase-js ─────────► Supabase Auth (email/password, Google, verify, reset)
 │                          session in a SecureStore-backed adapter
 ├─ Axios (Bearer JWT) ──► FastAPI /api/v1 (Render, HTTPS)
 │                          ├─ verifies Supabase JWT via JWKS (cached)
 │                          ├─ require_viewer_can_see(user_id) on every /users/{id}/…
 │                          ├─ Postgres 16 (Supabase) via SQLAlchemy + Alembic
 │                          └─ Supabase Storage (private bucket) via service key → signed URLs ≤ 15 min
 └─ MapLibre Native ─────► PMTiles (admin-1, cities) + glyphs on a CDN
                            bundled simplified admin-0 GeoJSON (offline Countries view)
```

Principles:
- **The app never talks to Supabase data directly.** supabase-js handles authentication only. All user data goes through FastAPI, so privacy rules live in one place (prompt rule 5). Supabase tables are not exposed through PostgREST: RLS is enabled with no policies on every table, as defence in depth.
- **The backend owns the `users` row.** On the first authenticated request, FastAPI upserts `users` by `auth_subject` (the JWT `sub`).
- **Portable schema:** pytest keeps running on SQLite for speed. Models use portable types: `JSON().with_variant(JSONB, "postgresql")`, and case-insensitive usernames through a stored `username_lower` column with a unique index instead of `citext`. A separate CI job runs `alembic upgrade head` → `downgrade base` → `upgrade head` plus the test suite against PostgreSQL 16 in Docker (prompt §10).
- **One map engine.** MapLibre replaces react-native-maps (travel map in Phase 3, itinerary map in Phase 7). On web, `.web.tsx` files use `maplibre-gl`.

---

## 3. Phase-by-phase plan

### Phase 1: Foundations

**Mobile**
1. Install (all via `npx expo install`): `expo-dev-client`, `expo-haptics`, `react-native-reanimated`, `react-native-worklets`, `react-native-gesture-handler`, `@gorhom/bottom-sheet`, `@expo/vector-icons`, `expo-localization`, `i18next`, `react-i18next`, `@react-native-async-storage/async-storage`, `expo-system-ui`. Then run `npx expo-doctor`.
2. `app.json` → `app.config.ts` (dynamic env: API URL, Supabase URL/anon key per profile). `userInterfaceStyle: "automatic"`. Keep `scheme: "vromon"` and `package: "com.vromon.app"`.
3. `eas.json` with `development` (dev client, internal), `preview` (APK), and `production` (AAB) profiles. Writing it needs no login.
4. Design tokens: `mobile/src/ui/theme/tokens.ts` (dark from prompt §5.1, plus a matching light set), `ThemeProvider`, and `useTheme()`, driven by Appearance = System/Light/Dark. Replace `mobile/src/theme.ts` and the hard-coded colours in `app/_layout.tsx`.
5. `mobile/src/ui/haptics.ts`: one API (`haptics.selection()`, `.light()`, `.medium()`, `.success()`, `.warning()`, `.error()`). On Android it maps to `performAndroidHapticsAsync` (e.g. selection → `Segment_Tick`, light → `Virtual_Key`, medium → `Context_Click`/`Long_Press`, success → `Confirm`, error/warning → `Reject`); elsewhere it uses `selectionAsync`/`impactAsync`/`notificationAsync`. It respects the Haptics setting. The exact Android constants get tuned on a phone.
6. `mobile/src/ui/PressableScale.tsx` (Reanimated spring to 0.97 + haptic + Reduce Motion fallback). An ESLint `no-restricted-imports` rule bans `expo-haptics` outside `haptics.ts` and `Pressable` from `react-native` outside `src/ui/`.
7. Four-tab shell: `app/(tabs)/_layout.tsx` with Map · Trips · Friends · Settings, Material icons, and colours per prompt §6.1. Placeholder Map and Friends screens. The existing `(tabs)/trips.tsx` stays as Trips. The old `(tabs)/index.tsx` Explore list becomes the "Where to?" step of `trip/new`; its destination detail route stays.
8. i18n scaffolding: `mobile/src/i18n/` with `en.json` and a `bn.json` stub. Every string on touched screens moves into it.
9. Settings tab (local only): Appearance, Language, Haptic feedback, persisted in AsyncStorage.
10. Re-skin the existing screens and components (wizard, trip detail, itinerary, sheets, banners) to tokens. Behaviour is unchanged.
11. Tests: tab bar renders 4 tabs in order (no Passport), haptics wrapper (mocked), `PressableScale` fires a haptic plus `onPress`, token sets complete for light and dark.

**Backend**
12. Alembic: `backend/alembic/`, `env.py` reading `Settings.database_url`, and a **baseline revision equal to the current `create_all` schema** (autogenerate on an empty DB, then reviewed by hand). Startup stops calling `create_all` outside tests. Existing dev DBs get `alembic stamp head`. Add a Postgres CI job (upgrade, downgrade, upgrade).
13. Correct the stale version table in `docs/technology-decisions.md` (§19).

**Done when:** `npx expo run:android` installs the dev build on your phone, the tabs match `01-bottom-nav.jpg` (minus Passport), haptics fire, and all existing tests, lint, typecheck, expo-doctor, and pytest pass. `@gorhom/bottom-sheet` gets a smoke test on the device; if it fails, record the switch to `formSheet`.

### Phase 2: Accounts and privacy core

**Before this phase you need to:** create a Supabase project, enable Email and Google providers (a Google Cloud OAuth client for Android with the SHA-1 of the debug and EAS keystores), and share the project URL and anon key. The service-role key goes only in backend env vars.

- Backend: migration for `users`, `user_settings`; JWT verification dependency (`get_current_user`, JWKS cache, audience/issuer checks); `/me` GET/PATCH/DELETE, `/me/export`, `/me/settings`, `/usernames/{name}/available` (rate-limited with `slowapi`); `trips.user_id` migration per D4 (nullable → backfill → delete orphans in production → NOT NULL); every `/trips…` route scoped to the owner; `require_viewer_can_see()` (friends always come back empty until Phase 5); privacy-matrix tests (owner ✓, stranger → 404, writes by non-owner → 404).
- Account deletion: deletes Storage objects, visits, trips, friendships, then the Supabase auth user (admin API).
- Mobile: `@supabase/supabase-js`, `expo-secure-store`, SecureStore session adapter, Google sign-in via the Supabase OAuth flow (`expo-auth-session`/`expo-web-browser`; check the Supabase + Expo docs when this phase starts), auth gate in the root layout, Axios interceptor that attaches the access token and on 401 refreshes once, then signs out. Screens: sign in, sign up, forgot password, verify-email notice, onboarding (username → home country → visited countries → done), Settings profile/account rows, delete account with confirmation.
- A web deletion-request URL (a static page) for the Play Data safety form.

### Phase 3: World map

- `scripts/geo/`: download Natural Earth admin-0 and admin-1, **Bangladesh POV** (D5), and GeoNames `cities15000`. Normalise ISO codes (Natural Earth uses `-99` for some; fall back to `ISO_A2_EH`). Run tippecanoe → PMTiles for admin-1 and cities. Build a simplified admin-0 GeoJSON bundled in the app (target ≤ 1.5 MB). Generate `countries.json`/`regions.json`/`cities.json` and record versions and licences in `docs/data-sources.md`.
- Country list for D6: a `counts_toward_world` flag on `countries` (193 UN members + Holy See + Palestine).
- Backend: `countries`, `regions`, `cities`, `visits` migrations + seed command; `/geo/*` (public, cache headers); `/users/{id}/visits`, `PUT /me/visits`, `DELETE /me/visits/{type}/{code}`; `backend/app/services/stats/` with `/users/{id}/stats`.
- Mobile: MapLibre map, Countries/Regions/Cities layers, status colours via a `match` expression built from visits (tested builder), Map-view sheet (`08`), Add-place flow, feature sheet, the "also mark country?" rule, legend chips, offline query persistence, and an offline edit queue (last write wins per visit).
- Hosting for PMTiles and glyphs: a public Supabase Storage bucket (D1), behind the CDN Supabase provides. Range requests must work for PMTiles; this gets verified.

### Phase 4: Map themes

- `mobile/src/features/mapThemes/catalog.ts` from prompt §7, plus best-fit values for the ❓ cells, flagged `derived: true` (D8). Unit test for hex validity and unique IDs.
- Style JSON builder (land/water/border/label, `fill-pattern` images for Pencil hatch and Treasure dots drawn by us, `line-blur` for Glow). Odyssey hillshade needs a raster-DEM source, so it may slip to Phase 8.
- Map Theme screen (prompt §6.6): live preview, Map | Friends segment, Themes/Colors/Styles chips, snapping carousel, Apply → `PUT /me/settings` + local cache. `tier` on every item, lock UI behind `FEATURE_PREMIUM_LOCKS=false` (D2).
- WCAG AA check of label/legend contrast for every theme, as a unit test computing contrast ratios.

### Phase 5: Friends

- Backend: `friend_requests`, `friendships`, `blocks`, `devices`, `friend_code` migrations; search (prefix, discoverable only, blocked excluded, rate-limited); friend codes (opaque, rotatable); requests accept/decline/cancel; remove/block; `/users/{id}/compare`; push via Expo Push API. `require_viewer_can_see` now admits accepted friends (read-only). Full privacy matrix incl. blocked/unfriended → 404.
- Mobile: Friends tab (empty state per `12`), Add friend (search / scan QR / my code), friend detail, compare maps (`07`), tab badge, `expo-camera` with a permission explainer, `react-native-qrcode-svg`, `expo-sharing`/`expo-clipboard`, and `expo-notifications` registration.
- App Links: `https://<domain>/add/<code>` requires a domain you control, serving `/.well-known/assetlinks.json`. Until then, `vromon://add/<code>` works. (Open question Q2.)

### Phase 6: Photos

`photos` migration; `POST /me/photos` (Pillow re-encode, EXIF/GPS strip, thumbnail, upload to the private bucket); signed URLs ≤ 15 min after the privacy check; delete. Mobile: `expo-image-picker` (Android photo picker), `expo-image-manipulator` compression, `expo-image` display on place sheet, trips, and friend detail. Tests: GPS EXIF removed; a stranger gets 404; an expired URL fails.

### Phase 7: Trips

`trip_stops` migration (D7); `backend/app/services/stats/` trip maths (completed-only, duration = end − start + 1, weeks/months/years); `/me/trips/stats`. Trips tab (`10`) with a stats card (licensed or original image), All trip stats (`09`), Upcoming/Ongoing/Past, a trip card with stops, FAB → wizard (owned by the user, returns to Trips), the "mark as visited?" prompt, the itinerary map moved to MapLibre, and `react-native-maps` removed. Tests: the 20-day example and formulas; the planner suite still passes.

### Phase 8: Hardening and release

Accessibility (TalkBack pass, 48 dp, font scaling), performance (cold start < 2.5 s release build, 60 fps pan), Sentry (app + backend), Maestro suite (prompt §10 flow), EAS login + `eas build --profile production`, EAS Update channel, Play listing assets, Data safety, privacy policy and terms URLs, internal test track. Re-check the target API requirement (currently API 36, met by the SDK 57 defaults).

---

## 4. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| `@gorhom/bottom-sheet` 5.2.14 (last published 2026-05) not working with Reanimated 4.5 / RN 0.86 New Architecture | Sheets broken | Phase 1 device smoke test; fallback to Expo Router `formSheet` |
| MapLibre RN is a third-party native module outside Expo's version list | Build or API breaks | Pin 11.5.0, read its docs at install time, keep map code behind `features/map` |
| PMTiles sources have no offline cache in MapLibre Native | Regions/Cities need network | Countries bundled offline (prompt §4.5.5). If offline regions matter, switch to z/x/y MVT tiles, which use the ambient cache |
| Supabase sessions can exceed SecureStore's value size | Token storage failure | Encrypted-in-AsyncStorage fallback with the key in SecureStore (§17 of decisions) |
| Render free instances sleep | Slow first request | Acceptable for testing; a paid instance before release |
| Natural Earth ISO gaps (`-99`) and the Bangladesh POV file set differing from the default | Wrong country matching | Normalisation script with a test listing every unmatched feature |
| Postgres-only behaviour slipping past SQLite tests | Prod-only bugs | Postgres CI job from Phase 1 |
| Reference screenshots are from a third-party app | IP | Colour values and layout only; our own icons, patterns, images (prompt rule 10) |

---

## 5. Open questions (not blocking Phase 1)

| # | Question | Needed by |
|---|---|---|
| Q1 | Supabase project URL and anon key; Google OAuth client set up | Phase 2 |
| Q2 | A domain for App Links, privacy policy, terms, and the deletion page (e.g. the existing Vercel deployment) | Phase 5 (links), Phase 8 (policies) |
| Q3 | Bangla translations: who reviews them? | Before Bangla ships |
| Q4 | Image for the Trips stats card: supply one, or use an original illustration we draw | Phase 7 |
| Q5 | Expo account for EAS builds and Updates | Phase 8 (or earlier if you want cloud dev builds) |

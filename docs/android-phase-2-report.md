# Android Phase 2 Report: Accounts and Privacy

**Date:** 2026-10-12 · **Status:** waiting for the developer's on-device check
**Plan:** `docs/android-app-plan.md` §3 Phase 2 · **Decisions:** `docs/technology-decisions.md` §21

## 1. Summary

Vromon now has accounts. Sign-in is Supabase Auth (email and password, plus Google through the browser). Tokens are stored encrypted on the phone and verified by FastAPI against the project's ES256 JWKS. A new account claims a username (with a live availability check) and optionally picks a home country. Settings gained a profile card, profile editing, "Let people find me by username", sign out, data export (shared as a JSON file), and in-app account deletion. Preferences sync to the account. On the server, every trip route is owner-only: other users get 404, proven on all 15 trip routes. Migration `0002` adds `users`, `user_settings` and `trips.user_id`, with decision D4 for older trips.

## 2. Files

**Backend, new:** `app/core/auth.py`, `app/core/rate_limit.py`, `app/services/privacy.py`, `app/schemas/accounts.py`, `app/api/v1/endpoints/me.py`, `app/api/v1/endpoints/users.py`, `alembic/versions/20261012_0002_users_and_trip_ownership.py`, `tests/test_accounts.py`.
**Backend, modified:** `app/models/models.py` (User, UserSettings, Trip.user_id), `app/api/v1/endpoints/trips.py` (owner scoping), `rag.py` (sign-in, ownership, rate limits), `router.py`, `main.py`, `core/config.py`, `pyproject.toml`, `requirements.lock`, `README.md`, `tests/conftest.py` (test user, rate limits off, **isolated test database**), four test helpers, `tests/test_migrations.py`, `tests/test_phase6_generation.py`.
**Mobile, new:** `src/features/auth/` (`supabase.ts`, `secureSessionStorage.ts`, `session.ts`, `actions.ts`, `schemas.ts`, `AuthScreen.tsx`), `src/features/account/` (`useMe.ts`, `username.ts`, `useUsernameCheck.ts`, `UsernameField.tsx`), `src/features/geo/` (`countries.ts`, `CountryList.tsx`), `src/features/preferences/sync.ts`, `src/services/queryClient.ts`, `src/ui/TextField.tsx`, `src/ui/TextLink.tsx`; routes `app/(auth)/` (`_layout`, `sign-in`, `sign-up`, `check-email`, `forgot-password`), `app/auth/callback.tsx`, `app/auth/reset-password.tsx`, `app/onboarding.tsx`, `app/settings/` (`profile`, `home-country`, `delete-account`); `src/__tests__/auth.test.ts`.
**Mobile, modified:** `app/_layout.tsx` (sign-in gate, splash), `app/(tabs)/settings.tsx`, `src/services/api.ts` (token, refresh-on-401, `meApi`), `src/types/index.ts`, `src/ui/SettingsRow.tsx`, `src/i18n/{en,bn}.json`, `app.config.ts` (plugins: secure store, web browser, splash screen), `eslint.config.js`, `.env.example`, `package.json`.

## 3. Commands run

| Command | Result |
|---|---|
| `npm run typecheck` | pass |
| `npx eslint . --max-warnings 0` | pass (exit status checked directly) |
| `npm test` | 9 suites, **102 passed** (85 → 102) |
| `npx expo-doctor` | 21/21 |
| `pytest -q` | **276 passed**, 8 skipped (PostgreSQL-only) |
| `alembic check` (dev DB) | at `0002`, no drift |
| `./gradlew assembleDebug` (JDK 22) | BUILD SUCCESSFUL; installed on the realme RMX2170 |

## 4. How verified

| Feature | Verified on |
|---|---|
| Token verification (valid, expired, forged, wrong issuer/audience, HS256) | Backend tests with locally signed ES256 tokens |
| Live project | Its JWKS serves one ES256/P-256 key, the key ID the developer sent |
| Privacy matrix, export, delete, D4, rate limits | Backend tests |
| Gate: signed out → sign-in, new account → onboarding, deep link survives cold start | RNTL tests |
| Encrypted session storage (no plain-text tokens) | Unit test |
| Sign-in screen renders on device | realme RMX2170 screenshot. **Sign-up, email links, Google, onboarding and delete are not yet exercised on the device**: they need the Supabase dashboard steps below |

## 5. Deviations

- Onboarding has no "mark countries you've visited" step yet: that needs the map's country data (Phase 3).
- Google sign-in uses Supabase's browser OAuth (no Google SDK, no SHA-1 needed), not a native Google button.
- The country picker uses `i18n-iso-countries` (English and Bangla names) until the Natural Earth data arrives in Phase 3.
- The web page for deletion requests (Play Data safety) needs a domain; it moves to Phase 8.
- The backend runs on port 8001 locally, because a PHP server occupies 8000. `mobile/.env` points at `http://127.0.0.1:8001` over `adb reverse`.

## 6. Known issues and risks

- **Supabase's built-in email service is heavily rate-limited** (a few emails per hour). Fine for testing; production needs custom SMTP (Phase 8).
- Email links must be opened **on the phone** (PKCE: the code verifier lives on the device that started the flow).
- The first real account inherits the trips of the development stand-in user (decision D4, development only).

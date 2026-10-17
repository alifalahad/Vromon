# Android Phase 1 Report: Foundations

**Date:** 2026-10-12 · **Status:** approved by the developer on device ("feels working")
**Plan:** `docs/android-app-plan.md` §3 Phase 1 · **Decisions:** `docs/technology-decisions.md` §16–20

## 1. Summary

The app now runs as an Android **development build** (`com.vromon.app.dev`) instead of in Expo Go. It has the four-tab shell (Map · Trips · Friends · Settings) from `01-bottom-nav.jpg`, without Passport. A semantic design-token system supports Appearance = System / Light / Dark. All interaction goes through one haptics module and one `PressableScale` component, enforced by ESLint. i18n (English, plus a first Bangla pass for the new UI) is in place, and the Settings tab has local preferences. Every existing screen (Plan-a-Trip wizard, trip detail, itinerary, destination, sheets, panels) was re-skinned to the tokens without behaviour changes, and the itinerary sheets became gesture bottom sheets. On the backend, Alembic replaces `create_all`, and a baseline migration exactly matches the existing schema.

## 2. Files

**Mobile, new:** `app.config.ts` (replaces `app.json`), `eas.json`, `jest.setup.js`, `app/(tabs)/friends.tsx`, `app/(tabs)/settings.tsx`, `src/ui/` (`theme/tokens.ts`, `theme/ThemeProvider.tsx`, `theme/index.ts`, `haptics.ts`, `PressableScale.tsx`, `useReduceMotion.ts`, `Button.tsx`, `Fab.tsx`, `LargeTitle.tsx`, `SettingsRow.tsx`, `OptionSheet.tsx`), `src/features/preferences/store.ts`, `src/i18n/` (`index.ts`, `en.json`, `bn.json`), tests `tokens`, `haptics`, `PressableScale`, `navigation`.
**Mobile, modified:** `app/_layout.tsx`, `app/(tabs)/_layout.tsx`, `app/(tabs)/index.tsx` (Explore → Map placeholder; destinations moved into the wizard's "Where to?" step with "Browse places"), `app/(tabs)/trips.tsx`, `app/trip/new.tsx`, `app/trip/[id].tsx`, `app/itinerary/[id].tsx`, `app/destination/[id].tsx`, all `src/components/*`, `src/utils/dialogs.ts`, `eslint.config.js`, `package.json`, `.gitignore` (`/android`, `/ios`).
**Mobile, deleted:** `app.json`, `src/theme.ts`.
**Backend, new:** `alembic.ini`, `alembic/env.py`, `alembic/versions/20261012_0001_baseline_schema.py`, `app/db/migrations.py`, `tests/test_migrations.py`. **Modified:** `app/main.py` (startup runs `upgrade_to_head`), `Dockerfile` (copies Alembic files).
**Repo:** `.github/workflows/ci.yml` (PostgreSQL service for migration tests), `README.md` (dev-build run steps), `docs/technology-decisions.md`.

## 3. Commands run

| Command | Result |
|---|---|
| `npm run typecheck` | pass |
| `npx eslint . --max-warnings 0` | **Correction (Phase 2):** this was reported as passing, but `jest.setup.js` (added late in Phase 1) failed `no-undef` for the `jest` global. The final check piped `npm run lint` through `tail`, which hid the exit status. Fixed in Phase 2 (jest globals for that file). The `no-restricted-imports` probe result stands. |
| `npm test` | 8 suites, **82 passed** (36 existing + 46 new) |
| `npx expo-doctor` | 21/21 |
| `pytest -q` | **224 passed, 7 skipped** (+5 migration tests; the 4 new skips are the PostgreSQL variants) |
| `alembic current` / `alembic check` (dev DB) | `0001 (head)`, no drift |
| `npx expo export -p android` / `-p web` | both bundle |
| `./gradlew assembleDebug` | **BUILD SUCCESSFUL** with JDK 22. JDK 24 failed: AGP's prefab step treats the JDK 24 native-access warning (JEP 472) as an error. |

## 4. How verified

| Feature | Verified on |
|---|---|
| Dev build installs and runs | realme RMX2170 (realme 7 Pro) over USB; developer check |
| Tabs, haptics, appearance, language, sheets, re-skinned screens | Same device, developer check, plus RNTL tests for tab order, Settings sheet, language switch, haptics toggle, Friends empty state |
| Haptic mapping, PressableScale, token contrast | Unit tests |
| Migrations | Tests on SQLite. PostgreSQL runs in CI only (no local PostgreSQL, Docker daemon off); not yet run on GitHub |

## 5. Deviations

- **Accent text colour:** the sampled `#3379F3` fails AA as body text (3.1–3.7:1), so text uses a `link` token (`#6EA0F6`). Exceptions: white on `#3379F3` (4.06:1) and the active tab label, which matches the screenshot.
- **`textTertiary`:** `#9C9C9C` instead of the sampled `#858585` (AA).
- **AsyncStorage instead of MMKV** for preferences (decided in Phase 0).
- **Reduce Motion:** read through `AccessibilityInfo`, because Expo Router's test mocks lack Reanimated's `useReducedMotion`.
- **Translations:** existing screens (wizard, trip, itinerary) are still English-only. Their strings move to i18n when those screens are reworked in Phase 7.
- **Friends links:** the empty-state links show a "coming soon" notice until Phase 5, and there is no Add-friend FAB yet.

## 6. Known issues and risks

- First Metro start showed a Worklets version mismatch (0.10.1 vs 0.13.0) from a **stale shared Metro cache**. Fixed with `npx expo start --dev-client --clear`. If it reappears, clear the cache again.
- The Gradle first run auto-installed **Android NDK 27.1** and **CMake 3.22.1** into the SDK.
- Builds need **JDK 17–22** as `JAVA_HOME`. The system default JDK 27, and JDK 24, fail.
- `npm install` reports 64 audit findings in transitive dependencies (similar before Phase 1); not triaged.
- The lifespan test (`tests/test_rag.py`) migrates the git-ignored dev database `backend/vromon.db`, as it previously seeded it.

## 7. Needed before Phase 2

A Supabase project (URL, anon key, and the service-role key for the backend only), and Google sign-in configured (an Android OAuth client with the SHA-1 of the debug keystore).

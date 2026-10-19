# Android Phase 8 Report: Hardening (on this Mac and the test phone)

**Date:** 2026-10-18 · **Status:** done on the device by Claude; waiting for the developer's approval
**Plan:** `docs/android-app-plan.md` §3 Phase 8 · **Decisions:** `docs/technology-decisions.md` §27
**Scope agreed with the developer:** everything that needs no accounts. No deployment, cloud builds, store release or git. Those steps are in `docs/go-live.md`.

## 1. Summary

The app was hardened and checked on the realme phone:
- **Accessibility:** labels, touch targets and contrast are fixed, and large text now works at the phone's largest font size.
- **Release build:** it no longer asks for location, biometric or overlay permissions it never used, and it was measured for start-up time and smoothness.
- **Crash reporting (Sentry):** wired in the app and the backend, off until a Sentry account exists.
- **End-to-end tests:** the Maestro suite passes 7/7 on the phone.
- **Release material:** the privacy policy, terms, Play Data safety answers, store listing, store graphics and the go-live checklist are drafted.

The app still runs against the backend on this Mac; installing it on other phones needs the go-live steps.

## 2. Verified on the device (realme RMX2170, Android 12, 60 Hz)

| Check | Result |
|---|---|
| Release APK permissions (aapt2): camera, internet, network/Wi-Fi state, notifications (+ boot, wake lock), vibrate, badge | ✓; location, biometric, overlay, storage and microphone are absent |
| Release build runs standalone (no Metro), against the Mac's backend | ✓ (`04`) |
| Cold start, first frame (5 runs) | 1.35–1.49 s |
| Cold start, screen with tab bar (5 runs, screenshot polling) | 2.8–3.1 s, including up to ~0.4 s of capture delay: **at or just above the 2.5 s target** |
| Map pan (410 frames) | 0.24% janky; 50th/90th/99th percentile 21/24/25 ms (**below the 60 fps goal**, see §6) |
| Maestro suite, one run: sign in → 4 tabs, no Passport → mark Bangladesh → apply Rustic → add friend by code, friend accepts, compare maps → plan a trip from + → sign out | **7/7 passed in 5 min** |
| Largest font (scale 1.6): Trips, All trip stats, Settings, trip details, wizard | ✓ after the fixes in §3 (`01`–`03`) |
| Accessibility tree on 8 screens (labels, 48 dp targets) | ✓ after the fixes in §3 |

## 3. Bugs found and fixed

1. **The release APK asked for location** (from MapLibre), plus biometric and "draw over other apps" permissions, none of which Vromon uses. These are now blocked in `app.config.ts`.
2. **At the largest font size:**
   - Settings titles were cut off ("Appearanc…").
   - Wizard step names broke mid-word ("Budge t").
   - Stats card labels were cut off ("Durati…") and the trip card's date was cut off ("24–2…").
   - The Settings tab label was cut off ("Settin…").

   All of them now wrap, shrink or cap their scaling.
3. **TalkBack read an icon-font glyph** on every tab (", Map"). Tabs now have proper labels, and the Friends tab includes the request count.
4. **Settings switches** were 27 dp targets with a separate TalkBack element. The whole 64 dp row is now one switch.
5. **Contrast in the light appearance:** tertiary, link, success and warning text are slightly darker, to pass WCAG AA on the inset grey. Accent-coloured text in the Map view sheet and itinerary uses the text-safe blue.
6. **E2E suite:** the test order, a destination selector, the carousel swipe and an accept script were fixed, and every flow now starts fresh, so the suite runs reliably.

## 4. Commands run

| Command | Result |
|---|---|
| `npx tsc --noEmit` · `npx eslint . --max-warnings 0` | pass |
| `npm test` | 19 suites, **261 passed** (Phase 7: 213; new: contrast checks) |
| `npx expo-doctor` | 21/21 |
| `pytest -q` | **386 passed**, 8 skipped (Phase 7: 384; new: Sentry off/on) |
| `alembic check` | no drift |
| `maestro test .maestro` on the phone | 7/7 |
| `aapt2 dump permissions` on the release APK | as in §2 |

## 5. Files

**Mobile:**
- `app.config.ts` (blocked permissions; optional Sentry plugin; dev-only HTTP plugin)
- `plugins/withDevCleartext.js`, `metro.config.js` (Sentry), `src/services/monitoring.ts`
- `app/_layout.tsx` (Sentry init and wrap), `app/(tabs)/_layout.tsx` (tab labels)
- `src/ui/SettingsRow.tsx`, `src/ui/SegmentedControl.tsx`, `src/ui/theme/tokens.ts` (light-theme shades)
- `app/trip/new.tsx`, `src/features/trips/StatsCard.tsx`, `src/features/trips/TripCard.tsx`, `src/features/map/MapViewSheet.tsx`, `app/itinerary/[id].tsx`, `src/features/map/CountryMultiPicker.tsx`
- i18n, `jest.setup.js`, `package.json` (`@sentry/react-native` 7.11.0)
- Tests: `contrast.test.ts` (new), `navigation.test.tsx`
- `.maestro/` (the suite, subflows, scripts)

**Backend:**
- `app/core/monitoring.py`, `core/config.py` (Sentry settings), `main.py`
- `Dockerfile` (proxy headers)
- `pyproject.toml`, `requirements.lock` (`sentry-sdk` 2.71.0)
- `tests/test_monitoring.py`

**Docs:**
- `docs/go-live.md`
- `docs/legal/privacy-policy.md`, `docs/legal/terms.md` (drafts)
- `docs/play-store/data-safety.md`, `listing.md`, `assets/` (icon, feature graphic, 6 screenshots)
- `scripts/store/render_assets.py`
- `docs/technology-decisions.md` §27, this report, `docs/android-phase-8/`

## 6. Deviations and known issues

- **Not done, by your choice (needs accounts):**
  - EAS login and production build, EAS Update, Play internal track.
  - Sentry project, hosted privacy policy and terms.
  - Backend deployment.

  Steps: `docs/go-live.md`.
- **Start-up time:** the real screen appears after about 2.5–2.8 s, just above the 2.5 s target. The splash waits for the stored sign-in session and the account (`/me`). Showing the cached screen before that finishes would cut it; not done in this phase.
- **Map panning** runs at about 40–48 fps on this 60 Hz phone (median 21 ms per frame), with almost no janky frames (0.24%). The world map renders every country polygon; simplifying the low-zoom geometry would help.
- **TalkBack** was checked through the accessibility tree, not by listening with TalkBack on.
- **The inline "Invite" / "add via code" links** stay at the sentence's line height (a WCAG inline exception); the + button does the same at 64 dp.
- **Dark appearance:** white text on the accent is 4.06:1 and the active tab label uses the accent (approved Phase 1 exceptions).
- **Legal drafts** have `[TO FILL]` items (contact email, dates, governing law) and need review.
- **Store screenshots** come from a near-empty test account; screenshots from a demo account with more places would sell the app better.
- **The phone now has the release build** of the dev variant. It needs no Metro, but still needs the backend running on this Mac. For JS hot reload, reinstall the debug build.
- **E2E test accounts `e2e.ana` and `e2e.bob`** are kept for future runs; delete them when no longer needed.

## 7. Decisions needed

1. **Go live** (`docs/go-live.md`): backend host (Render recommended), app build (EAS or local) and distribution (APK link or Play). This is what lets your friend test without your Mac.
2. Fill in the legal `[TO FILL]` items, and decide where to host the policy and terms.
3. Still open: push (EAS + Firebase), an invite-link domain, the Phase 4 questions, the photo limits, and the city-name spelling.

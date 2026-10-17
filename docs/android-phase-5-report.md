# Android Phase 5 Report: Friends

**Date:** 2026-10-13 · **Status:** verified on device by Claude; waiting for the developer's approval
**Plan:** `docs/android-app-plan.md` §3 Phase 5 · **Decisions:** `docs/technology-decisions.md` §24

## 1. Summary

Vromon has friends. You can find people by username, by typing their code, by scanning their QR, or through a `vromon://add/<code>` invite link. Requests can be accepted, declined or cancelled. The Friends tab lists requests and friends (with countries and % of the world) and shows the empty state from `12`, and its tab icon carries a badge for incoming requests. A friend's profile shows their map in your theme, their stats and trips, and Compare maps (`07`: In common / You / Friend for Countries, Regions or Cities, with lists of places). Remove and Block sit in the overflow menu, and Settings has your friend code, blocked users and notification switches. The server enforces all of it: strangers, ex-friends and blocked users get 404 everywhere. Push notifications are implemented end to end, but they need an EAS project and Firebase before they can be delivered (§8).

## 2. Verified on the device (realme RMX2170 + a QA account as the "second phone")

The second phone was a throwaway Supabase account ("Rafi (QA)"), created with the admin API and driven over the API, the way a second device would be. It was deleted through the app's own account deletion afterwards.

| Feature | Result |
|---|---|
| New dev build (camera, notifications, clipboard, SVG) installs and runs | ✓ (15 min build) |
| Rafi finds @alif by username search and sends a request → badge "1" on the Friends tab | ✓ |
| Requests list → Accept → friend row "4 countries · 2.1% of the world" | ✓ |
| Friend profile: map in your theme, stats, trips, Friends since | ✓ |
| Compare maps: legend, Rafi-only countries in the Friend colour, counts, expandable flag lists | ✓ |
| Remove friend (overflow → confirm) → empty state; Rafi gets 404 on your visits at once | ✓ |
| Add friend → search "qa.r" → Add → "Requested"; Rafi accepts | ✓ |
| My code: QR + code; the screenshot's QR decodes to `vromon://add/WXZF7DVW` (OpenCV) | ✓ |
| Invite link `vromon://add/<code>` opens the preview with the right button | ✓ |
| Scan QR: explainer before the system prompt → live camera with a scan frame | ✓ (scanning a real QR needs a second screen; see §7) |
| Block (overflow → confirm): friendship ends; Rafi gets 404 on visits, code lookup and requests, and search shows nothing | ✓ |
| Settings: friend code row, Blocked users → Unblock (Rafi can find you again, still no access) | ✓ |
| Settings → Notifications: switches, plus "Push isn't set up in this build yet" | ✓ |
| Rafi sends a request with a lowercase code → Accept | ✓ |
| Account deletion of Rafi: friendships, requests, blocks, devices all 0 afterwards | ✓ |

## 3. Bugs found and fixed on the device

1. **Accepted on the other phone, still "Sent" here:** the lists were cached for 5 minutes and React Native has no window focus. The Friends tab now refreshes whenever it's shown, and the query focus manager follows the app coming to the foreground.
2. **Avatar showed "R(" for "Rafi (QA)":** initials now use letters and digits only (unit-tested, Bangla included).
3. **Profile username was centred** under a left-aligned name.
4. While testing: test files hanging Jest (left-over cache timers), and the test route table missing newer routes.

## 4. Commands run

| Command | Result |
|---|---|
| `npm run typecheck` · `npx eslint . --max-warnings 0` | pass |
| `npm test` | 16 suites, **191 passed** (Phase 4: 15 / 176) |
| `npx expo-doctor` | 21/21 |
| `pytest -q` | **318 passed**, 8 skipped (Phase 4: 288) |
| `alembic upgrade / downgrade 0003 / upgrade` on a fresh SQLite DB · `alembic check` | pass, no drift; dev DB at `0004` |
| Mutation check: privacy guard admits everyone | 5 privacy tests fail, as they should |
| PostgreSQL migration test | **not run** (Docker isn't running on this Mac); runs in CI |

## 5. Files

**Backend, new:** `app/api/v1/endpoints/friends.py`, `app/services/friends.py`, `app/services/push.py`, `app/schemas/friends.py`, `alembic/versions/20261013_0004_friends.py`, `tests/test_friends.py` (30 tests).
**Backend, changed:** `models.py` (+4 tables, 2 settings columns), `services/privacy.py` (friends admitted), `endpoints/users.py` (`/profile`, `/compare`), `endpoints/trips.py` (friend read access on GETs), `endpoints/me.py` (deletion, export), `schemas/accounts.py`, `core/config.py`, `core/rate_limit.py`, `api/v1/router.py`, `tests/conftest.py` (push off in tests).
**Mobile, new:** `app/friends/add.tsx`, `app/friends/[id].tsx`, `app/friends/compare/[id].tsx`, `app/add/[code].tsx`, `app/settings/blocked.tsx`; `src/features/friends/` (`friendCode.ts`, `queries.ts`, `push.ts`, `share.ts`, `useFriendActions.ts`, `useFriendNotifications.ts`, `PersonRow.tsx`, `QrScanner.tsx`, `CompareMap.tsx` + `.web.tsx`); `src/ui/Avatar.tsx`; `src/__tests__/friends.test.tsx`.
**Mobile, changed:** `app/(tabs)/friends.tsx` (rewritten), `_layout.tsx` (badge), `settings.tsx`, `app/_layout.tsx`, `app.config.ts` (camera and notifications plugins, optional EAS/Firebase), `src/services/api.ts`, `queryClient.ts`, `src/types/index.ts`, preferences `store.ts` / `sync.ts`, `auth/actions.ts`, `map/geoData.ts`, `app/map/theme.tsx`, i18n, `jest.setup.js`, tests.
**Docs:** `technology-decisions.md` §24, this report, `docs/android-phase-5/` (screenshots).

## 6. Deviations

- **No push delivery yet** (§8). The badge polls every 60 s and refreshes on focus instead.
- **No App Links:** invites use `vromon://add/<code>`. Messaging apps usually don't make custom-scheme links tappable, so the shared text includes the code to type (open question Q2: a domain).
- **Friends' trips are listed, not opened:** the server allows read-only access, but the trip screens still have owner-only actions. Opening a friend's trip read-only comes with the Trips rework in Phase 7.
- **Remove / Block use the system dialog** as the overflow menu (Android `Alert`), not a custom menu.
- **The Map Theme "Friends" preview stays a sample.** Using a real friend there is a small follow-up if you want it.
- **An invite link opened while signed out** is dropped after sign-in (not checked on the device).
- **Bangla:** the Friends screen labels are translated; longer explanations fall back to English, as on other screens.

## 7. Known issues and risks

- Scanning a QR code was not done on the device: it needs a second physical screen. The decode of the on-screen QR and the code parser (unit-tested) cover both ends; the camera view itself was shown working.
- The PostgreSQL migration test (partial unique index, boolean defaults) only runs in CI until Docker is started locally.
- Friend stats are computed per friend on every `GET /friends` (one query per friend). That's fine for tens of friends; it needs a batched query if lists get long.
- Search is a username prefix match only (the spec), not display names.

## 8. Decisions needed

1. **Push setup:** create an Expo account and EAS project (gives `EAS_PROJECT_ID`, open question Q5) and a Firebase project for Android (gives `google-services.json` and an FCM V1 service-account key uploaded to EAS). With those I can turn push on and test it on the phone. Or leave push for Phase 8?
2. **A domain for invite links** (Q2), so shared invites are tappable `https://…/add/<code>` App Links. The existing Vercel deployment could host it.
3. Still open from Phase 4: the light-mode Default map, the starting status colours, and the four names I gave the unnamed catalog cards (I've left all three as they are).

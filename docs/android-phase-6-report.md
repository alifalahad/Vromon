# Android Phase 6 Report: Photos

**Date:** 2026-10-17 · **Status:** verified on device by Claude; waiting for the developer's approval
**Plan:** `docs/android-app-plan.md` §3 Phase 6 · **Decisions:** `docs/technology-decisions.md` §25

## 1. Summary

You can add photos to a place (on the map's place sheet) and to a trip, view them full screen, and delete your own. Friends see your photos read-only, as a grid on your profile; strangers get nothing. Every upload is decoded and re-encoded on the server, so GPS, all other EXIF, XMP and comments are gone before anything is stored. The files sit in a private Supabase Storage bucket under random keys. The app only ever gets signed links that expire after 10 minutes, and only after the friendship check. Deleting a photo, a trip or the account removes the files too. The Android photo picker is used, so the app asks for no storage permission.

## 2. Verified on the device (realme RMX2170, Android 12, a QA account as the "second phone")

| Feature | Result |
|---|---|
| New dev build (expo-image, image picker, image manipulator) installs and runs | ✓ (12 min build) |
| App permissions: no storage or microphone permission, only CAMERA (QR) and the earlier ones | ✓ (`dumpsys package`) |
| Place sheet → Add → system photo picker ("This app can only access the photos you select") → pick 3 | ✓ |
| Upload progress tiles, then "PHOTOS · 3" with thumbnails from the bucket | ✓ |
| Viewer: swipe, "3 of 3", place and date; a photo stored rotated (EXIF orientation 6) shows upright | ✓ |
| Stored files (downloaded from Supabase): no EXIF, no GPS, no camera make; 2048 px / 480 px thumbnail; capture dates kept | ✓ |
| Delete from the viewer (warning confirm) → gone from the list and the bucket | ✓ |
| Trip detail → Add → photo appears under the trip | ✓ |
| QA user as a stranger: your photo list → 404 | ✓ |
| Became friends → friend profile shows a "PHOTOS · 1" grid; their photo opens with no Delete button | ✓ |
| QA user as a friend: lists your photos, opens the file, tries to delete it → 404 | ✓ |
| Unfriend from the phone → QA user gets 404 on your photos at once | ✓ |
| QA user's copied link after it expired → refused (400, "exp" check) | ✓ (§4) |
| An expired link that the CDN had cached → still refused | ✓ |
| The bucket's public URL for a file → refused (400) | ✓ |
| QA account deleted through `DELETE /me`: photo rows and files gone | ✓ |

## 3. Bugs found and fixed on the device

1. **Deleting the last photo in the viewer left a black screen.** The list shrank, but it stayed scrolled to the removed page. The viewer now steps back one photo first (re-tested: it shows the previous photo).
2. **Deleted photos linger for about a minute at Supabase's CDN** for links issued before the delete (measured 54–56 s, whatever `Cache-Control` the upload sends). Not fixable on our side; documented (§25) instead of the claim that deletion is instant.
3. While testing: a test-isolation bug in the backend suite. `test_itinerary_generation.py` clears all FastAPI overrides at teardown, which broke every later test module that uses the shared database. `conftest.py` now restores the shared override.
4. The remove-friend dialog now says photos are hidden too.

## 4. Commands run

| Command | Result |
|---|---|
| `npm run typecheck` · `npx eslint . --max-warnings 0` | pass |
| `npm test` | 17 suites, **202 passed** (Phase 5: 16 / 191) |
| `npx expo-doctor` | 21/21 (after `npx expo install --fix`: six Expo packages a patch behind) |
| `pytest -q` | **358 passed**, 8 skipped (Phase 5: 318) |
| `alembic upgrade head / downgrade 0004 / upgrade head` · `alembic check` | pass, no drift; dev DB at `0005` |
| Mutation checks: stop removing EXIF / privacy guard admits everyone | 2 / 3 photo tests fail, as they should |
| Live Supabase probes: private bucket, signed URL works, expires, deleted file can't be signed | pass |
| PostgreSQL migration test | **not run** (Docker isn't running on this Mac); runs in CI |

## 5. Files

**Backend, new:** `app/api/v1/endpoints/photos.py`, `app/services/photos/__init__.py`, `processing.py`, `storage.py`, `app/schemas/photos.py`, `alembic/versions/20261017_0005_photos.py`, `tests/test_photos.py` (40 tests).
**Backend, changed:** `models.py` (+`Photo`), `models/__init__.py`, `core/config.py` (photo settings, 15-minute ceiling enforced), `core/rate_limit.py`, `api/v1/router.py`, `endpoints/trips.py` (trip deletion handles photos), `endpoints/me.py` (account deletion removes files first, export lists photos), `tests/conftest.py` (local photo store; shared DB override restored), `pyproject.toml` + `requirements.lock` (Pillow 12.3.0), `README.md` (settings).
**Mobile, new:** `src/features/photos/` (`prepare.ts`, `queries.ts`, `uploads.ts`, `PhotoStrip.tsx` with `PhotoGrid`, `PhotoViewer.tsx`), `src/__tests__/photos.test.tsx`.
**Mobile, changed:** `src/features/map/PlaceSheet.tsx`, `app/trip/[id].tsx`, `app/friends/[id].tsx`, `src/services/api.ts` (`photosApi`), `src/types/index.ts`, `src/features/friends/queries.ts` (unfriending forgets photos), `src/features/auth/actions.ts` (sign-out clears image caches), `app.config.ts` (picker plugin, blocked permissions), `jest.setup.js`, i18n (en, bn), `package.json` / lock.
**Other:** `.gitignore` (`backend/media/`), `docs/technology-decisions.md` §25, this report, `docs/android-phase-6/` (screenshots).

## 6. Deviations

- **Gallery only, no in-app camera.** The prompt asks for photos, not capture; the picker includes the system's own camera shortcut on many phones.
- **Photos belong to a place or a trip, not to a visit date.** Clearing a visit keeps its photos. A country's sheet also shows the photos of its regions and cities.
- **The CDN delay after a delete** (§3.2): up to about a minute for links already handed out.
- **No pinch-to-zoom** in the viewer yet.
- **No photo grid on the Map Theme or Compare screens**: photos appear on the place sheet, trips and friend profile, as planned.

## 7. Known issues and risks

- **MapLibre "Failed to load source cities: … incorrect header check"** appeared once on the first launch after reinstalling (Phase 3 code, not Phase 6). The city dots still drew, and the backend's range responses decode correctly. It may be a client cache race; watch for it.
- **Sign-out clearing the image cache** is implemented but wasn't exercised on the device (it needs signing back in with your password).
- **Offline:** photo lists aren't cached to disk (their links expire), so photos don't show offline unless expo-image still holds them.
- **Android's "Don't keep activities":** if the system kills the app while the picker is open, that selection is lost (`getPendingResultAsync` isn't wired up).
- **Supabase free tier:** 1 GB storage and egress limits; at ~50–70 KB per photo plus thumbnail, roughly 15,000 photos.
- PostgreSQL migration test still only in CI.

## 8. Decisions needed

1. Still open from Phase 5: **push setup** (EAS project + Firebase) and **a domain for invite links**.
2. Still open from Phase 4: light-mode Default map, starting status colours, names of the four unnamed catalog cards.
3. **Photo limits:** 2000 per account and 15 MB per upload are my defaults. Change them if you like.

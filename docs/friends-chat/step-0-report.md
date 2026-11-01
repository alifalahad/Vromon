# Friends and Chat · Step 0 report

**Date:** 2026-10-27 · **Plan:** [friends-chat-plan.md](../friends-chat-plan.md) · **Mockups:** https://claude.ai/artifact/88qidwV6NKUSdmUofjXKg1

Step 0 was test accounts, an audit and decisions. No app code changed.

## 1. Test accounts

| | Account | State | How it was checked |
|---|---|---|---|
| A | `e2e.ana` | ✅ signs in | `scripts/e2e/session.py A --check` |
| B | `e2e.bob` | ✅ signs in, **new password set today** with the owner's OK (Supabase Admin API, after checking the id matched bob's email) | `scripts/e2e/session.py B --check` |
| A ↔ B | friends | ✅ | `GET /api/v1/friends` as A lists `e2e.bob`; as B lists `e2e.ana` |

- The credentials are in `mobile/.env.e2e.local`. Git ignores it (`mobile/.gitignore`: `.env*.local`, checked with `git check-ignore`). (Moved to `.env.e2e.local` at the repo root in step 3, because Metro bundled it from `mobile/`.)
- **New:** [`scripts/e2e/session.py`](../../scripts/e2e/session.py) `A|B [--check]` prints a fresh access token, or with `--check` who signed in. It never prints passwords. Run it with `backend/venv/bin/python`, because the system Python has no CA certificates.
- **New (before this step):** [`scripts/dev/readonly_proxy.py`](../../scripts/dev/readonly_proxy.py) is for checks on the owner's account. It listens on 8011, forwards reads and refuses every write. Port 8002 belongs to the friends' share.

## 2. Decisions

| # | Decision (owner, 2026-10-27) |
|---|---|
| C1 | Trip-room members **suggest**; only the owner changes the plan |
| C2 | Unsend for everyone within **1 hour** |
| C3 | "On the road" is **on by default**, with a setting to hide |
| C4 | **Live location** in trip rooms (step 8) |
| C5 | Photos in chat: **later** (not in step 8) |

New questions from the audit (recorded in the plan's section 4, with recommendations):
- **C6:** what **Want to go** does on an attraction. The Want list can't hold attractions (section 4, mockups 5–7).
- **C7:** whether "hide my trips" also hides them on your profile (section 5, finding 4).

## 3. What exists today

### Backend
- **Friends** (`endpoints/friends.py`, `services/friends.py`):
  - search, friend codes (rotatable), requests (send, accept, decline, cancel), `GET /friends`, remove;
  - blocks (`GET/POST/DELETE /blocks`), footprints, push tokens (`/me/devices`).
  - Helpers worth reusing: `friendship()`, `blocked_either_way()`, `friend_ids()`, `delete_social_data()`.
- **Privacy** (`services/privacy.py`):
  - `viewer_can_see` = the owner, or an accepted friend who isn't blocked; anyone else gets **404**;
  - `require_viewer_can_see` guards every `/users/{id}/…` route;
  - trips use `_load_trip(..., friends_may_read=True)` on 5 GET routes. **Step 7 adds trip-room members here.**
- **Friend-facing reads** (`endpoints/users.py`): `/users/{id}/trips`, `/trips/stats`, `/visits`, `/stats`, `/profile`, `/compare`. Photos: `/users/{id}/photos`, with signed links of at most 10 minutes.
- **Trips:**
  - `POST /trips/{id}/duplicate` is **owner-only**, so a friend can't copy your trip yet (step 4 adds `/copy`);
  - `POST /trips/{id}/days/{day_id}/items` adds a stop to a day (step 7's "Add to Day N");
  - `POST /trips/{id}/days/{day_id}/late` (+ undo) is the running-late flow (step 8).
- **Push** (`services/push.py`): the Expo Push API from a background task. **Not active**: no EAS project id or Firebase in the build, so the Friends badge polls instead (step 9 lists the owner's tasks).
- **Your data:**
  - `GET /me/export` lists profile, settings, trips, visits, friends, requests, blocks, devices and photos;
  - `DELETE /me` deletes each kind of data **explicitly** (photos first, trips, visits, `delete_social_data`, devices, user). Chat data needs its own explicit delete (finding 1).
- **Stack:**
  - FastAPI 0.142.2, Starlette 1.7.0, uvicorn 0.30.1 with `uvicorn[standard]`, so **`websockets` 16.1.1 is installed**;
  - the Dockerfile runs **one uvicorn process**, so an in-memory hub is enough;
  - slowapi 0.1.10 limits by IP; chat needs a per-user key (finding 8).
- **Tests:** two users at a time through the `act_as` fixture (`tests/test_friends.py`). The WebSocket sign-in has to be overridable the same way (step 2).

### App
- **Friends tab** (`app/(tabs)/friends.tsx`):
  - incoming requests (Accept/Decline), sent ones (Cancel), friends ("N countries · M% of the world");
  - an empty state with Invite / add via code, and a + button (Add friend);
  - pull to refresh, refresh on focus, and skeleton rows while loading.
- **Badge:** `useFriendRequests('in')` polls every 60 s (`(tabs)/_layout.tsx`).
- **Other screens:** Add friend (search, scan QR, my code), a friend's profile (`app/friends/[id].tsx`: map, stats tiles, Compare, photos, their trips, Remove/Block), Compare, and Settings → Blocked people (`app/settings/blocked.tsx`). Notification toggles are in the Settings tab (`notifyFriendRequests`, `notifyFriendAccepted`).
- **Data layer:** TanStack Query with a persisted cache. An **offline outbox** already exists for map edits (`src/features/map/visits.ts`): it flushes on start, on foreground and when the network returns (`expo-network`). The chat outbox can follow it.
- **Location:** `src/features/trips/today/useHere.ts` reads it **in the foreground only**, opt-in. There is no background location.
- **Reusable pieces:** `LocatorMap` (from the trip wizard), `Avatar`, `PressableScale`, the sheets, haptics, `usePlanFormat`.
- **Packages:** gesture-handler 2.32, reanimated 4.5, expo-location, expo-image-picker, expo-notifications, @gorhom/bottom-sheet. No NetInfo (the app uses `expo-network`) and no FlashList (an inverted FlatList is enough for chat).
- **Maestro** test IDs in flows 01, 04 and 07: `tab-friends`, `add-friend-fab`, `friend-search`, `friend-<username>`, `friend-trip-<id>`, `accept-/decline-/cancel-<username>`.

## 4. Mockup by mockup

| # | Element | Source today | Missing → step |
|---|---|---|---|
| 1 | Chats · Friends segment | Friends tab has one combined list | New layout → 3 |
| 1 | Requests row | `GET /friend-requests?direction=in` | — |
| 1 | On the road strip | Only per friend (`/users/{id}/trips`, N+1) | `GET /me/friends/on-the-road` + setting → 6 |
| 1 | Chat list, unread, "typing…" | — | Conversations API → 1; live events → 2; UI → 3 |
| 1 | Compose button | `GET /friends` for the picker | New screen → 3 (the add-friend button moves to the header; keep `add-friend-fab` or update flow 04) |
| 1 | Tab badge = unread chats + requests | Requests only | → 3 |
| 2 | Requests, friends, invite card | All exist | Message button → 3; "On a trip" line → 6. **Drop "2 friends in common"** (finding 5) |
| 3 | Profile header, stats tiles, Compare, their trips | All exist | Message → 3; "On a trip" chip → 6; Trips together → 7; Mute/Report in the menu → 5. "You've both been to…" can come from `/users/{id}/compare` |
| 3 | Divisions map on the profile | The profile map shows **countries** | Optional: a home-divisions view (finding 6) |
| 4 | No friends yet | The empty state and its actions exist | New illustration and buttons → 3 |
| 5 | Bubbles, ticks, typing | — | → 1–3 |
| 5 | Trip plan card | Trip summary fields; the cost from `/trips/{id}/budget` | Card + snapshot → 4 |
| 5 | Place card | Place fields (name, category, destination, visit length) | Card → 4; **Want to go** → C6 |
| 5 | Trip idea card | Destination fields; `LocatorMap` needs `latitude`, `longitude` and `region_code` (they exist, migration 0014) | Idea payload + votes → 4 |
| 5 | Reaction chip | — | → 5 |
| 6 | Share sheet | Your trips (`GET /trips`); Want list (visits) | "Want list" rows can only be destinations, not attractions (C6) → 4 |
| 7 | Press-and-hold menu | Add to a trip = `PUT /trips/{id}/must-dos` on your own trips | Reply, Report, Unsend → 5 |
| 8 | Chats and privacy | Blocked people and export exist; two friend notification toggles exist | New settings + delete all chats → 5; the trips setting → 6 |
| 9 | Share a trip | The trip screen's menu (Edit route, Budget, Rebuild, Duplicate, Delete) | Send a copy → 4; Plan together → 7; "Said I'm in" needs idea votes → 4 |
| 10 | Trip room | The countdown and plan summary exist (dock logic) | Members, invites, suggestions, system lines → 7 |
| 11 | On the trip | Today's location read (`useHere`) and running late exist | Check-in, "tell the trip room", live location → 8. Photo bubble and chip: **out (C5)** |

## 5. Findings for later steps

1. **SQLite doesn't enforce `ON DELETE CASCADE`.** No `PRAGMA foreign_keys=ON` anywhere, so in development and tests a missing delete passes silently, while Postgres would enforce it. Delete chat data explicitly in `DELETE /me` and on unfriend/leave (as `delete_social_data` does), and test it.
2. **Contrast:** the Friends tab badge and `Avatar` put white text on `accent` (#3379F3, 4.1:1, which fails AA for small text). Step 3 moves them to `accentStrong`. Avatars are one colour for everyone; a per-person palette, tested in `contrast.test.ts`, would make chats easier to scan.
3. **Want to go on attractions (C6).** The Want list holds countries, divisions and cities. Recommended: on an attraction card, **Want to go** marks its destination's division as Want and offers *Add to a trip* for the attraction itself. Saving single attractions is a separate feature.
4. **Hiding trips (C7).** Friends can already open all your trips from your profile. If the new setting only hid the "On the road" strip, your profile would still show that you're away. Recommended: one setting, "Show my trips to friends", that hides them everywhere friends see them (profile, strip, chat header, `/users/{id}/trips`).
5. **"Friends in common"** (mockup 2) isn't available, and showing it reveals friend lists. Drop it.
6. **The profile map** shows countries. Showing home divisions (as mockup 3 does) is optional polish, not needed for chat.
7. **Maestro:** the redesign moves Add friend into the header. Keep the `add-friend-fab` id on whatever adds a friend, or update flow 04; keep `friend-<username>` on rows in the Friends segment.
8. **Rate limits** today are per IP (slowapi). The 30-messages-a-minute limit needs a per-user key.
9. **Push** stays inactive until the owner sets up Firebase and EAS (step 9). Chat must be complete without it: live socket in the app, polling as a fallback.

## 6. Baseline before any chat code

- Backend: `pytest -q` → **558 passed, 9 skipped**. One warning, which comes from importing FastAPI's `TestClient` and predates this work.
- App: `npx jest` → **410 passed** (42 suites).
- Later steps compare against these numbers; any failure that appears is theirs to explain.

## 7. Files

- New: `scripts/e2e/session.py`, `docs/friends-chat/step-0-report.md`. `scripts/dev/readonly_proxy.py` and `docs/friends-chat-plan.md` were added before this step.
- Changed: `docs/friends-chat-plan.md` (status, decisions C1–C7, step 8 without photos, section 6), `mobile/.env.e2e.local` (bob's password; ignored by git).
- Not committed.

## Left open

- C6 and C7 to confirm in steps 4–6 (recommendations above).
- Mockup 11's photo bubble and chip stay in the canvas as a later idea (C5).

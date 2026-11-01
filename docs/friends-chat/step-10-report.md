# Friends and Chat · Step 10 report

**Date:** 2026-10-29 to 2026-11-01 · **Plan:** [friends-chat-plan.md](../friends-chat-plan.md), step 10 · **Status:** done. The plan is complete. What's left needs the owner (see "For the owner").

Step 10 asked for performance with a long chat and many chats, reconnect tests, an accessibility pass, a security review, docs, the Maestro suite and a read-only pass on the owner's account. Each part found real problems; all of them are fixed and tested.

## What was found and fixed

**Security and privacy (backend):**

- **A hidden trip opened by its id.** With "Show my trips to friends" off, the lists hid a trip, but any friend could still open it with `GET /trips/{id}`, and trip ids count up. Now a friend reads a hidden trip only if its owner sent it to them in a chat (a trip card or an invite, not unsent). The old test of this passed without ever sending the trip; it's replaced by two that fail with the old rule.
- **No limit on request size.** Any endpoint accepted a body of any size into memory. Now 1 MB of JSON, or a photo plus 64 KB (`app/core/body_limit.py`), and 413 otherwise.
- **The socket:** uvicorn read frames up to 16 MB before the app's 4 KB check. Now `--ws-max-size 16384` (Dockerfile and the share), at most 30 messages in 10 s per socket, and 5 sockets per person (a sixth closes the oldest).
- **The push token was in a URL** (`DELETE /me/devices/{token}`), so it would reach server logs. It's in the body now (`POST /me/devices/remove`).
- **Smaller:** a retried live-location start returned a 500 (now the first card, or 409); an invite note wasn't cleaned like a message (a NUL character broke PostgreSQL).

**Bugs that only PostgreSQL shows** (the test suite had only ever run on SQLite; it now runs on both):

- **The server couldn't start on a new database.** The seed keeps its ids, PostgreSQL's id sequences didn't move past them, and the next destination got id 1 again.
- **Deleting an account with a planned trip failed** with a foreign-key error: the account was deleted before its trips. This predates the chat work.
- **Four lists had no order** (destinations, places, restaurants, hotels): PostgreSQL returned them in any order.

**Performance** (release build on the realme):

| | Before | After |
|---|---|---|
| Flinging back through a 2,000-message chat: JavaScript frames | 23 fps, single frames up to 1,373 ms | 48 fps, up to 317 ms |
| The same: screen frames | 2.9% janky, 99th percentile 36 ms | 1.35% janky, 99th percentile 22 ms |
| The chat list with 104 chats, first draw | 692 ms | 89 ms (55 ms with 4 chats) |
| `GET /conversations` with 104 chats | 941 queries | 26 queries, same output byte for byte |

The causes: every bubble was rebuilt and drawn again on each page, minute and message; dates were parsed up to 16 times per message; Hermes made a new date formatter for every time label; the swipe-to-reply component was half of each bubble's cost; and the chat list drew every chat at once. Each is fixed: bubbles and rows are reused while unchanged, dates parsed once, formatters cached, a lighter swipe (it feels the same), and the list draws only what's on screen.

**Reconnects** (phone, 12 test messages):

- **Backend stopped mid-chat for ~25 s:** Ana's message waited ("Waiting for network") and was sent once, about 12 s after the restart; Bob's next message arrived live.
- **10 minutes in the background:** the 3 messages Bob sent meanwhile were there, once each, in order.
- **Airplane mode, 4 times** (through the share's tunnel, so the phone really lost its connection): Ana's message sent offline arrived once, about 6 s after airplane mode went off; Bob's message from while she was offline showed within 6–14 s.
- **Fixed:** when the network came back during a reconnect attempt, the app ignored the "network is back" signal, and that attempt could hang for a while before backing off up to 30 s. A new attempt now starts at once.
- **Fixed:** an older page that failed to load left its spinner spinning. Now it says "Couldn't load earlier messages" with Try again, and loads by itself when the connection is back.
- **Nothing was lost or doubled:** checked on the server and on the screen.

**Accessibility** (11 mockup screens, at 1.6× and in Bangla; TalkBack checked through the accessibility tree):

- **Icon glyphs were read aloud**, for example "[glyph], Reply" in menus and on the quick chips and cards. Icons are now skipped by screen readers app-wide (`src/ui/icons.ts`), and menu rows have names.
- **The chat header didn't say a chat was muted.** It does now.
- **Large text broke words:** "Banda/rban" in On the road and "Countrie/s" on a profile. Both fixed. The note fields clipped their hint; they now grow over several lines.
- **Bangla:** the 33 missing strings are added, with a test that every English string has Bangla with the same placeholders. Friend counts now use Bangla digits, and the old "Bangla covers only some screens" note is gone.

## How it was checked

- **Backend:** `pytest -q` passes on SQLite and on PostgreSQL 16 (`TEST_API_POSTGRES_URL`). 708 passed, 9 skipped on both (last run 2026-11-01). A fresh PostgreSQL database starts and seeds (11 destinations, 33,940 cities).
- **Tests that prove the fixes** (each fails with the bug put back):
  - hidden trips by id;
  - the body cap without `Content-Length`;
  - a socket that sends too much, or opens too many sockets;
  - the nudge during a hung attempt;
  - reused bubbles and rows;
  - the card's long-press area;
  - the failed older page.
- **App:** `tsc` and `expo lint` clean; Jest 564 tests in 58 suites (last run 2026-11-01, after every change; four clean full runs in a row).
  - The test timeout went from 1 s to 5 s for the whole suite (`jest.after-env.js`): a Today-screen test failed now and then when every core was busy.
  - One run before that change had one failure that wasn't captured; the runs since are clean.
- **Phone:** as above, plus swipe-to-reply by hand, and paging both ways (a new message reached the bottom while scrolled 2,000 messages back).
- **Maestro: the whole suite passed on the phone, 14 of 14 flows in 19 min 38 s** (2026-11-01), as e2e.ana with e2e.bob over the API, ending with Ana signed out (flow 99). It includes 11 (chat) and the new 12 (trip room: join from the invite, suggest a place, the owner adds it to Day 1, the place shows on the read-only trip). Four older flows assumed a day with no trip on it and failed once the test account had one; they now cope with either:
  - 06 and 12 pull the plan up before looking for stops;
  - 09 goes back a month when today isn't in the month the calendar opens on;
  - 10 accepts Today mode from the map's capsule on a trip day, and frames Bangladesh before marking by press and hold.
- **Read-only pass on the owner's account** (2026-11-01): the owner signed in to the dev app, routed through `scripts/dev/readonly_proxy.py`, and I looked at the Friends tab (On the road with three friends, two chats with read ticks), a chat (a poll with answers and a trip idea card) and Settings. All showed their real data correctly, and the app tried no write (the proxy refused none). The owner stays signed in; the screenshots stay out of the docs.

## Docs

- **`docs/architecture.md`:** step 10 limits, fixes and measurements.
- **`docs/technology-decisions.md`:** decision 31.
- **`docs/feature-inventory.md`:** a "Friends and chat" summary and step 10's table.
- **`docs/legal/privacy-policy.md`:** chats are stored on the server and are not end-to-end encrypted; "I'm here" and live location and their limits; who sees what; deletion and export.
- **`docs/legal/terms.md`:** chat rules and reporting.
- **`docs/play-store/data-safety.md`:** messages and location are now collected.
- **`docs/go-live.md`:** live chat on Render (one instance, a plan that doesn't sleep, keepalive, deploys); the Firebase steps.

## The friends' APK and the share

- **The share was restarted on 2026-11-01** with step 10's backend (the Mac had restarted, so the old links had stopped). New links:
  - APK: `https://fragrances-apparent-contest-federation.trycloudflare.com/vromon.apk`
  - API: `https://analog-shades-identification-arbitrary.trycloudflare.com`
- **The friends' APK was rebuilt with step 10** (2026-11-01 22:27, 107,031,820 bytes, "Vromon (Preview)"), without the measuring logs. The bundle was checked for step 10's code, and the share serves it. Install it over the old one.
- **Your phone** keeps the dev app's measuring build (release, with `EXPO_PUBLIC_PERF_LOG=1`), signed in to your account.

## For the owner

Things only you can do, most important first:

1. **Push notifications** (step 9): create a Firebase project and add the Android app (`com.vromon.app`); download `google-services.json` and set `GOOGLE_SERVICES_FILE` to it; set `EAS_PROJECT_ID` (`npx eas-cli@latest init`); upload the FCM V1 key to EAS (`eas credentials`). Then I rebuild and check a push on the phone.
2. **Decide how Sign out works** (step 3): today it ends every session of the account on every device. I recommend "this phone only" (a one-line change).
3. **Going live** ([go-live.md](../go-live.md)): a host on a plan that doesn't sleep, with exactly one instance (the live chat needs it); the Supabase database's connection string; the environment variables. Then fill in the `[TO FILL]` items of the privacy policy and terms, host them, and answer Play's Data safety form from [data-safety.md](../play-store/data-safety.md).
4. **Turn off "Disable permission monitoring"** in Developer options when you no longer want me to change phone settings (font size, location) over USB.
5. **Optional:**
   - check Ana's own live location on the phone (it needs a mock-location app chosen in Developer options, or your OK to share your real position);
   - free disk space (`~/.gradle/caches` is about 10 GB; the Mac has about 17 GB free).
6. **Nothing is committed.** Say when you want a commit.

Still open from earlier steps, unchanged:
- the "dates changed" line in trip rooms (nothing can change a trip's dates yet);
- whitespace-only re-wrapping in three screens from step 7.

Done in this step from your list: the large-font check (adb can set the font size now), the missing Bangla, and Maestro for the chat steps.

## Files

- **Backend:**
  - new: `app/core/body_limit.py`, `tests/test_body_limit.py`
  - changed:
    - `app/main.py`, `app/services/rooms.py` (hidden trips, `room_trip` loading), `app/services/cards.py`, `app/services/chat.py` (`seats`, deleted suggestions);
    - `app/api/v1/endpoints/chat.py` (batched list), `rooms.py` (live retry, invite note), `live.py` (limits), `friends.py` (push token), `me.py` (deletion order), `destinations.py` and `places.py` (order);
    - `app/services/live.py`, `app/schemas/friends.py`, `app/db/seeder.py`, `Dockerfile`;
    - tests: `conftest.py` (PostgreSQL mode), `test_on_the_road.py`, `test_chat_live.py`, `test_trip_rooms.py`, `test_on_the_trip.py`, `test_friends.py`, `test_chat_cards.py`, `test_accounts.py`
- **App:**
  - new: `src/features/chat/SwipeToReply.tsx`, `src/utils/dateFormat.ts`, `src/ui/icons.ts`, `jest.after-env.js`; tests `translations.test.ts`, `icons.test.tsx`
  - changed:
    - `src/features/chat/format.ts`, `queries.ts`, `socket.ts`, `useLiveChat.ts`, `MessageBubble.tsx`, `MessageMenu.tsx`, `ChatRow.tsx`, `cards/OnTripCards.tsx`;
    - `src/features/friends/OnTheRoadStrip.tsx`, `onTheRoad.ts`;
    - `src/ui/PressableScale.tsx`, `ActionSheet.tsx`, `src/utils/devPerf.ts`, `src/services/api.ts`;
    - `app/(tabs)/friends.tsx`, `app/(tabs)/settings.tsx`, `app/chat/[id].tsx`, `app/friends/[id].tsx`, `app/trip/invite/[id].tsx`, `app/share/send.tsx`, `app/trip/today/[id].tsx`, `app/_layout.tsx`;
    - `src/i18n/en.json`, `bn.json`, `package.json` (Jest setup);
    - tests: `chatFormat`, `chatCache`, `chatCards`, `chatScreens`, `chatSafety`, `liveSocket`
- **Maestro:** `.maestro/12-trip-room.yaml` and `scripts/room-invite.js`, `room-accept.js`, `room-cleanup.js`; `config.yaml`; `06-trip-screen.yaml` (looks for the day ribbon after pulling the plan up: a trip that's on today now has Today and Trip room buttons above it); `09-journey.yaml` (goes back a month when today isn't in the month the calendar opens on, and forward on a month's last day); `RangeCalendar.tsx` got `cal-prev` and `cal-next` test ids
- **Scripts:** `scripts/dev/seed_chat_perf.py` (a long chat and 99 more for a test account, and removing them); `scripts/dev/phone.sh` (stops when the notification shade is open); `scripts/share/start.sh` (`--ws-max-size`)
- **Docs:** as listed above

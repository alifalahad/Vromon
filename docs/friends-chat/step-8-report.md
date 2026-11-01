# Friends and Chat · Step 8 report

**Date:** 2026-10-29 · **Plan:** [friends-chat-plan.md](../friends-chat-plan.md), step 8 (mockup 11) · **Status:** done, with decisions C4 (live location in trip rooms) and C5 (no photos yet). One part of the "done when" was checked differently, with your agreement: Ana's own live location was started and stopped in tests, not on the phone. Bob shared and stopped his over the API instead, and the phone showed both live. See "How it was checked".

## What was built

**In a trip room, on the trip's days** (mockup 11):

- **I'm here** (a quick chip over the composer, and a tile in the + sheet) takes one reading through the usual location permission. The server snaps it to the nearest stop of the day's plan within 300 m:
  - the card says "Reached Inani Beach · 10:17 · planned for 10:42" (or "on time");
  - otherwise "Near Cox's Bazar" within 50 km of the destination, otherwise just "Checked in";
  - **the reading itself is never stored or shown to anyone.**
- **Running late:**
  - from the room's chip (10, 20, 30, 45 or 60 minutes);
  - and from Today mode: its running-late panel has a **Tell the trip room** switch (on by default when the trip has a room). Applying the change posts the card with "Sent from Today".
  - The card names the next stop: "Running about 30 min late for Inani Beach".
- **Live location** (+ sheet → Live location: for 15 minutes, for 1 hour, or until the end of the day):
  - a point a minute while Vromon is open, and no background tracking;
  - a bar with **Stop**: under the room's header in the room, and floating on every other screen while it runs;
  - the card shows a small map, "Near Inani Beach · until 10:35 AM" and View (the phone's maps app), then "Live location ended" with no map;
  - only the latest point is kept, never a history.
  - It's deleted on Stop, when it runs out, when you leave or are removed from the room, and with the room or the account.
  - The server refuses points outside the trip's days, and anyone who isn't in the room.
- **Quick chips and the two new tiles show only on the trip's days.** No photos (C5).

**Backend** (in [architecture.md](../architecture.md#on-the-trip-check-ins-running-late-live-location-step-8)):

- `checkin` and `late` cards, built by the server from what the phone sends;
- `POST`, `PUT` and `DELETE /conversations/{id}/live`;
- migration `0019` adds `live_locations`, and `app/services/ontrip.py` holds the rules.

## Found during the phone check

- **Faking the location from adb doesn't reach the app on this phone.**
  - With your permission, and "Disable permission monitoring" switched on by you, I set Android's test location providers to Inani Beach. They took effect: Android's own providers reported it.
  - But Vromon reads location through Google Play services, which ignores those providers. So the phone's check-in used its real position, and said only "Checked in" (no place): nothing about where you are was stored or shown.
  - I removed the fake providers straight away. You can switch "Disable permission monitoring" off again.
  - For future checks, faking a location on this phone needs a mock-location app chosen in Developer options, or the emulator.

## How it was checked

- **Backend:** `tests/test_on_the_trip.py` has 10 new tests, and `pytest -q` gives **690 passed, 9 skipped**. They cover:
  - check-ins: snapping within 300 m with early or late, near the destination, nothing far away, the reading not stored, trip rooms and trip days only;
  - running late: the next stop and the source;
  - live location: members only, trip rooms only, trip days only, up to a day, Stop deletes, expiry deletes, leaving deletes, sharing again ends the last card, and it can't be sent as a plain message.

  **To show the rules are tested, I broke two on purpose:**
  - leaving the room without deleting the live location fails a test;
  - ignoring the trip's dates at first failed nothing, because the date was also too far from today. I added a test with a trip that starts tomorrow, and now it fails.
- **App:** `tsc` and `expo lint` are clean, and Jest has **546 tests in 55 suites**:
  - `onTheTrip.test.tsx` (8): the card wording, the trip days, live location lengths, the chips, no location permission, starting live location and its bar with Stop, an ended card, and nothing before the trip;
  - one new Today test checks that running late tells the room.
- **On the phone** (the owner's realme, dev build, as e2e.ana, on "Step 8 test trip": Cox's Bazar, today and tomorrow, with Bob in the room):

| Check | Result | Screenshot |
|---|---|---|
| The room on a trip day: "day 1 of 2", and the I'm here / Running late chips | ✅ | [01](step-8/01-room-on-the-day.png) |
| Ana taps I'm here: the location permission, then her card "Checked in" (her real position was far away, and wasn't kept) | ✅ | |
| Bob checks in at Inani Beach over the API: "Reached Inani Beach · 10:17 · planned for 10:42" on Ana's phone | ✅ | [02](step-8/02-checkins.png) |
| Today mode: Running late? → 30 min with "Tell the trip room" on → Apply. Bob sees "running late 30 min for Inani Beach (from today)" | ✅ | [03](step-8/03-today-tell-room.png) |
| Bob shares his live location (API): the card with its map and "Near Inani Beach · until 10:35 AM" on Ana's phone | ✅ | [04](step-8/04-late-and-live.png) |
| Bob stops: the card says "Live location ended" with no map, and the server holds no point | ✅ | [05](step-8/05-live-ended.png) |
| The + sheet on a trip day (I'm here, Live location), and the live options | ✅ | [06](step-8/06-share-sheet-on-the-trip.png), [07](step-8/07-live-options.png) |
| Ana starting and stopping her own live location from the phone | not run | With the fake location not working, it would have shared your real position. You chose to have Bob share instead. Jest covers Ana's start, bar and Stop |

## The friends' APK and the share

- **The share was restarted with step 8's backend** (the database was migrated to `0019`). New links:
  - APK: `https://imports-enabled-junction-synopsis.trycloudflare.com/vromon.apk`
  - API: `https://wal-yet-cons-america.trycloudflare.com`
- **The APK was rebuilt with step 8** (2026-10-29 10:54, 106,991,016 bytes). The first build was cut off when the session ended. Before the second one I ran every check again, and the bundle was checked for step 8's text. The share serves it.

## For the owner

- **You can switch "Disable permission monitoring" off again** (Developer options). The fake location is already removed.
- **Install the new APK over the old one** from the link above.
- **Test data:** Ana's "Step 8 test trip" (trip 101, Cox's Bazar, 29–30 October) has a room with Bob, two check-ins, one running-late card, and Bob's ended live location.
- **Still open from step 3:** the sign-out scope, and the large-font check.

## Files

- **Backend:**
  - new: `app/services/ontrip.py`, `alembic/versions/20261029_0019_live_locations.py`, `tests/test_on_the_trip.py`
  - changed: `app/models/models.py` (`LiveLocation`), `app/schemas/chat.py` (`CheckinCardIn`, `LateCardIn`, `LiveStartIn`, `LivePointIn`), `app/services/cards.py` (the new cards), `app/services/live.py` (purging expired shares), `app/services/rooms.py` and `chat.py` (deleting on leave, room and account), `app/api/v1/endpoints/rooms.py` (live location), `chat.py`, `app/core/rate_limit.py`
- **App:**
  - new: `src/features/chat/onTheTrip.ts`, `liveShare.ts`, `LiveShareBar.tsx`, `cards/OnTripCards.tsx`, `src/__tests__/onTheTrip.test.tsx`
  - changed: `app/chat/[id].tsx` (chips, tiles, live options, the inline bar), `app/_layout.tsx` (the floating bar and the updates), `app/trip/today/[id].tsx` (Tell the trip room), `ShareSheet.tsx`, `cards/ChatCard.tsx`, `cards/CardFrame.tsx`, `cards/actions.tsx`, `format.ts`, `src/services/api.ts`, `src/types/index.ts`, `src/i18n/en.json` and `bn.json`, `src/__tests__/today.test.tsx`
- **Scripts:** `scripts/e2e/chat_as.py` describes check-in, late and live cards, and never prints a live point.
- **Docs:** `docs/architecture.md`, `docs/feature-inventory.md`, `docs/friends-chat-plan.md`

## Notes for step 9 (notifications)

- **Push for messages:** the room's check-ins, running late and live location are messages like any other. Running late and the start of a live location deserve a push; each point update doesn't.
- **Settings:** step 5's `notify_trip_rooms` and `notification_previews` are already stored; step 9 makes them do something.
- **Firebase isn't set up yet:** push needs the owner tasks listed in step 9.

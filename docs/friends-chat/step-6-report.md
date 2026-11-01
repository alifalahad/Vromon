# Friends and Chat · Step 6 report

**Date:** 2026-10-29 · **Plan:** [friends-chat-plan.md](../friends-chat-plan.md), step 6 (mockups 1 and 3) · **Status:** done. Decision C7 was confirmed by the owner: one setting hides your trips everywhere friends see them.

## What was built

**On the road**: friends who are on a trip today or leave within the next 14 days.

- **The strip** at the top of Chats (mockup 1), under the friend requests row:
  - a friend on a trip has a solid ring that fills as the trip goes on, with "Sylhet · day 2";
  - a coming trip has a dashed ring, with "Bandarban · tomorrow", a weekday within the week ("Sat"), or a date ("3 Dec");
  - screen readers hear "Rafi Ahmed, in Sylhet, day 2 of 3" or "Tanvir Hasan, Bandarban from Saturday";
  - tap opens your chat with them; hold (or the screen reader action "Open their trip") opens their trip, read-only;
  - the strip is hidden when nobody is away.
- **The chat header** shows "On a trip · Sylhet, day 2" (or "Trip to Bandarban · Sat") under the name, and screen readers hear it with the name.
- **The profile** shows the same line as a chip under "Friends since".
- **Show my trips to friends** (Settings → Chats and privacy; on by default, decision C3). Off hides your trips everywhere friends see them (decision C7):
  - the strip, the header line and the chip;
  - "Trips" on your profile, and the trip stats friends can read.

  A trip you send in a chat still opens, because you chose to share that one.
- **Trips together** on the profile needs trip rooms, which come in step 7, so it stays hidden until then.

**Backend:**

- `GET /me/friends/on-the-road?today=` (in [architecture.md](../architecture.md#on-the-road-step-6)) returns each friend's trip today, or their next one within 14 days, with day N of M.
  - Friends on a trip come first, then by when they leave.
  - Only accepted friends are included: never strangers, ex-friends, or anyone blocked either way.
- Migration `0017` adds `user_settings.share_trips_with_friends` (on by default). With it off:
  - `/users/{id}/trips` returns `[]` to friends;
  - `/users/{id}/trips/stats` counts no trips;
  - the profile's new `shares_trips` is false.

## Found and fixed during the phone check

1. **A friend's profile kept showing their trips after they hid them.** The server was right, but the app reused its cached profile and trip list for up to 5 minutes.
   - Now a friend's profile is always fetched again when it opens.
   - Their trips are dropped from the cache (which is saved on the phone) as soon as they're hidden.
   - A test shows the old behaviour fails.
2. **"Bandarban · S…" was cut off** in the strip. The line can now wrap to two lines, which Bangla needs too.
3. **The two Privacy notes ran into each other** in Chats and privacy. They are now one note with a blank line between.
4. **The step 5 finding about a "frozen" screen was probably a stale screenshot.** It came back in this step with no dialog involved: on this phone, `adb screencap` can return an old frame until something reads the screen's views.
   - `scripts/dev/phone.sh shot` now reads the views first, which makes the picture current.
   - Step 5's report has a correction note.

## How it was checked

- **Backend:** `tests/test_on_the_road.py` has 11 new tests, and `pytest -q` gives **664 passed, 9 skipped**. They cover:
  - day N of M; 14 days ahead but not 15; a trip that ended yesterday versus one ending today;
  - the current trip beating the next one, and the order;
  - the phone's date (and a far-off one not believed);
  - your own trips left out;
  - strangers, ex-friends and blocked people;
  - the setting hiding everything friends can see (and the owner still seeing their own), a trip sent in a chat still opening, and on by default.

  **To show the privacy tests work, I broke two rules on purpose:** with the setting ignored, the hiding test fails; without the block check, the stranger test fails.
- **App:** `tsc` and `expo lint` are clean, and Jest has **524 tests in 53 suites**:
  - `onTheRoad.test.tsx` (10): the labels and ring, the strip (tap, hold, screen reader action, hidden when empty), the chat header, the profile chip and hidden trips, the stale-profile case, and the setting;
  - `settingsSync.test.ts` now covers the new setting both ways.
- **On the phone** (the owner's realme, dev build, as e2e.ana, with e2e.bob over the API through `scripts/e2e/chat_as.py`):

| Check | Result | Screenshot |
|---|---|---|
| Bob's trip (made over the API, began yesterday): Ana's strip shows Bob with a ring two thirds round and "Sylhet · day 2" | ✅ | [01](step-6/01-on-the-road-strip.png) |
| Tap opens the chat; the header says "On a trip · Sylhet, day 2" | ✅ | [02](step-6/02-chat-header.png) |
| Bob's profile shows the chip and the trip | ✅ | [03](step-6/03-profile-chip.png) |
| Bob turns "Show my trips" off: Ana's strip, header line and chip are gone, and so is "Trips" on his profile (after fix 1) | ✅ | [04](step-6/04-hidden-strip.png), [05](step-6/05-hidden-header.png), [06](step-6/06-hidden-profile.png) |
| Bob's trip in 3 days: a dashed ring with "Bandarban · Sat" (after fix 2) | ✅ | [07](step-6/07-coming-trip-dashed.png) |
| Hold opens Bob's trip, read-only | ✅ | [08](step-6/08-hold-opens-trip.png) |
| Ana turns her own switch off: Bob no longer sees her Cox's Bazar trip; on again: he does | ✅ | [09](step-6/09-show-my-trips-off.png) |

Not run: Maestro (not required for this step).

## The friends' APK and the share

- **The share was restarted with step 6's backend** (the database was already migrated). The new endpoint answers through the tunnel and refuses without sign-in. New links:
  - APK: `https://indicators-located-fibre-slip.trycloudflare.com/vromon.apk`
  - API: `https://adjust-eval-demographic-attachments.trycloudflare.com` (the app finds it by itself)
- **The APK was rebuilt with step 6** (2026-10-28 21:17, 106,935,688 bytes). The bundle was checked for step 6's code and text, and the share serves it. The checks and the build ran one after the other this time, and the disk had room (about 13 GB free after the build).

## For the owner

- **Install the new APK over the old one** from the link above. The app doesn't update itself.
- **Test data:** Bob (e2e.bob) has a trip to Bandarban from 31 October (trip 100), so Ana's strip shows him with a dashed ring. Ana's own Cox's Bazar trip (1–3 November) shows in Bob's strip.
- **The dev app on your phone is still signed in as e2e.ana.**
- **Still open from step 3:** the sign-out scope, and the large-font check.

## Files

- **Backend:**
  - new: `app/services/on_the_road.py`, `alembic/versions/20261029_0017_share_trips.py`, `tests/test_on_the_road.py`
  - changed: `app/models/models.py`, `app/schemas/accounts.py` and `friends.py`, `app/api/v1/endpoints/friends.py` (the endpoint), `app/api/v1/endpoints/users.py` (the setting applied to trips, trip stats and the profile)
- **App:**
  - new: `src/features/friends/OnTheRoadStrip.tsx`, `onTheRoad.ts`, `src/__tests__/onTheRoad.test.tsx`
  - changed: `app/(tabs)/friends.tsx` (the strip), `app/chat/[id].tsx` (the header line), `app/friends/[id].tsx` (the chip, hidden trips, fetched again on opening), `app/settings/chats.tsx` (the switch), `src/features/friends/queries.ts` (`useOnTheRoad`, `useRoadTripOf`), `src/features/preferences/store.ts` and `sync.ts`, `src/services/api.ts`, `src/types/index.ts`, `src/i18n/en.json` and `bn.json`, `src/__tests__/settingsSync.test.ts`
- **Scripts:**
  - `scripts/e2e/chat_as.py` gained `newtrip`, `deltrip` and `road`;
  - `scripts/dev/phone.sh shot` now makes the picture current first.
- **Docs:** `docs/architecture.md`, `docs/feature-inventory.md`, `docs/friends-chat-plan.md` (status, C7), and the step 5 report's correction

## Notes for step 7 (trip rooms)

- **"Trips together"** on the profile should list the trip rooms you share with that friend. It goes where the chip and "Trips" already are in `app/friends/[id].tsx`.
- **`shares_trips` doesn't apply inside a trip room.** Members see the room's trip because they were invited to it.
- **`useOnTheRoad` is cached for 5 minutes** and refreshed whenever the Friends tab comes into view. A trip room's header could use the same list.

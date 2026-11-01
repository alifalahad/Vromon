# Friends and Chat · Step 7 report

**Date:** 2026-10-29 · **Plan:** [friends-chat-plan.md](../friends-chat-plan.md), step 7 (mockups 9 and 10) · **Status:** done, with decision C1 (members suggest; only the owner changes the plan). One item isn't built: the "dates changed" line, because nothing in Vromon can change a trip's dates yet.

## What was built

**Trip rooms**: a group chat for each trip, for planning it together.

- **Plan together** (mockup 9), from the trip's ⋮ menu, or "Invite friends" in the room:
  - friends who said "I'm in" to a trip idea for that destination come first and are already ticked, with "Said "I'm in" to Sreemangal"; "maybe" comes next;
  - a friend who's away says so, and someone already in the room or already invited can't be picked again;
  - an optional note, then "Invite 2 friends". The room opens with "You invited Rafi and Nusrat".
- **The invite** is a card in each friend's chat with the owner: **Join** / **Not now**. Once joined it says **Open trip room**; after leaving or being removed, "You're not in this trip room".
- **The room** (mockup 10):
  - the header names the trip, with its dates and who's in it ("1–3 Nov 2026 · you and Bob"); tapping it opens the trip;
  - the pinned **plan bar** ("The plan · 11 stops · in 4 days", then "Day 1 Sugandha Beach, Inani Beach · …") also opens the trip;
  - other people's bubbles carry their **name and face**. Each person has their own name colour, and all six pass AA contrast;
  - lines from Vromon are worded for whoever reads them: "You invited Bob" / "Ana invited you", "Bob joined", "Bob left", "Ana removed Cara", "You added Himchari National Park to Day 2";
  - the + sheet shares places, polls and ideas into the room. **An attraction shared in a room is a suggestion**:
    - the owner gets **Add to a day** (pick the day) and **Not this time**;
    - members see "Waiting for Ana";
    - afterwards everyone sees "Added to Day 2" or "Not this time".
  - the ⋮ menu: Open the trip, who's in the room (the owner can remove people), Invite friends (owner), Mute, Delete chat for me, and **Leave trip room** (members).
- **Elsewhere in the app:**
  - the trip screen has a **Trip room** button with an unread count;
  - the Trips tab lists friends' trips you joined under **With friends**;
  - a friend's profile lists **Trips together**;
  - a trip idea's **Plan this trip** now invites everyone who said "I'm in" once the wizard has saved the trip.

**Backend** (in [architecture.md](../architecture.md#trip-rooms-step-7)):

- migration `0018` adds `trip_members` and `trip_suggestions`, and `app/services/rooms.py` holds the rules;
- invite, join, leave or remove, accept or decline a suggestion, and the trips you joined;
- adding a suggestion uses the same code as adding a stop to a day.

## Privacy, as the server enforces it

- Only the owner invites, and only their own friends. One non-friend in the list means 403, and nobody is invited.
- Joined members read the trip and its plan. **Only the owner changes the plan:** a member's change or delete gets 404, and a member accepting a suggestion gets 403.
- Strangers and ex-members get 404 for the room, its messages, the trip and its members. An invite lapses if the two are no longer friends.
- Members who aren't friends see each other's name and face, nothing more.
- Messages from someone you blocked are hidden for you in rooms, including live ones (plan rule 2).
- Deleting a trip deletes its room. Deleting an account removes its memberships and the rooms of its trips.

## How it was checked

- **Backend:** `tests/test_trip_rooms.py` has 16 new tests, and `pytest -q` gives **680 passed, 9 skipped**. They cover:
  - invites: the card and the note, only friends, only the owner, no duplicates;
  - joining: the room's trip and members, the card updating, "With friends", no invite or no longer friends;
  - privacy: members can't edit, strangers and ex-members get 404, removing, non-friends see names, blocked senders hidden, a deleted trip, a deleted account;
  - suggestions: added to the chosen day, not this time, only catalogue places from this room, the plan not built yet, the room's own trip card shown to every member.

  **To show the rules are tested, I broke two on purpose:** letting members accept suggestions fails 2 tests; leaving ex-members in the room's chat fails 2.
- **App:** `tsc` and `expo lint` are clean, and Jest has **537 tests in 54 suites**:
  - `tripRooms.test.tsx` (11): the lines as each person reads them, the room's name and plan bar, the room screen as owner and as member, the invite card, and Plan together;
  - `contrast.test.ts` checks the six name colours.
- **On the phone** (the owner's realme, dev build, as e2e.ana, with e2e.bob over the API through `scripts/e2e/chat_as.py`), both ways round:

| Check | Result | Screenshot |
|---|---|---|
| **Ana owns the trip.** Plan together on her Cox's Bazar trip, Bob picked, invited: the room opens with its plan bar and "You invited Bob (E2E)" | ✅ | [01](step-7/01-plan-together.png), [02](step-7/02-room-opens.png) |
| Bob joins and suggests Himchari National Park (API): "Bob (E2E) joined", his name and face, and the suggestion with Add to a day / Not this time, all live | ✅ | [03](step-7/03-suggestion-for-owner.png) |
| Ana adds it to Day 2: "Added to Day 2", "You added Himchari National Park to Day 2", 10 → 11 stops | ✅ | [04](step-7/04-pick-a-day.png), [05](step-7/05-added-to-day-2.png) |
| On the server: Bob reads Day 2 with Himchari in it; Bob changing or deleting the trip gets 404, and accepting a suggestion gets 403 | ✅ | |
| **Bob owns the trip.** His invite in Ana's chat (Join / Not now, then his note); Join opens his Bandarban room | ✅ | [06](step-7/06-invite-cards.png), [07](step-7/07-joined-bobs-room.png) |
| Ana suggests Buddha Dhatu Jadi from the phone (+ → Place): she sees "Waiting for Bob (E2E)", not the add buttons | ✅ | [08](step-7/08-member-suggests-waiting.png) |
| Bob adds it to Day 1 (API): Ana sees "Added to Day 1" and "Bob (E2E) added Buddha Dhatu Jadi to Day 1" live | ✅ | [09](step-7/09-owner-added-live.png) |
| Ana opens Bob's trip from the plan bar: read-only, with a Trip room button | ✅ | [10](step-7/10-member-reads-trip.png) |
| Trips → With friends; the chat list's rooms; Trips together on Bob's profile | ✅ | [11](step-7/11-with-friends.png), [12](step-7/12-chat-list-rooms.png), [13](step-7/13-trips-together.png) |

- Not run on the phone: a trip idea's "Plan this trip" through the whole wizard (covered by Jest), leaving and removing (covered by pytest and Jest), and Maestro.
- The invite screen's title showed its raw key once. That was a stale screen after a hot reload, and it was right after restarting the app.

## The friends' APK and the share

- **The share was restarted with step 7's backend** (the database was migrated to `0018`). New links:
  - APK: `https://discounts-president-glucose-viruses.trycloudflare.com/vromon.apk`
  - API: `https://correct-dramatic-finances-ordered.trycloudflare.com`
- **The APK was rebuilt with step 7** (2026-10-28 22:03, 106,994,696 bytes). The bundle was checked for step 7's text and calls, and the share serves it.

## For the owner

- **Install the new APK over the old one** from the link above.
- **Test data now:**
  - Ana's Cox's Bazar trip (91) has a room with Bob in it, and Himchari National Park on Day 2;
  - Bob's Bandarban trip (100) has a plan, and a room with Ana in it, with Buddha Dhatu Jadi on Day 1.
- **A formatting note:** I ran the code formatter over three existing screens (`app/(tabs)/trips.tsx`, `app/trip/[id].tsx`, `app/friends/[id].tsx`), and it re-wrapped some long lines that weren't part of this step. There are no code changes in those lines, but the diff is noisier. I won't run it over existing files again.
- **Still open from step 3:** the sign-out scope, and the large-font check.

## Files

- **Backend:**
  - new: `app/services/rooms.py`, `app/api/v1/endpoints/rooms.py`, `alembic/versions/20261029_0018_trip_rooms.py`, `tests/test_trip_rooms.py`
  - changed: `app/models/models.py` (`TripMember`, `TripSuggestion`); `app/services/cards.py` (room-aware trip access, the invite card, suggestion state); `app/services/chat.py` (rooms open to members, blocked senders hidden); `app/services/live.py`; `app/api/v1/endpoints/chat.py` (`trip` and `members` on a room); `trips.py` (members read; a deleted trip's room); `me.py` (account deletion); `app/schemas/chat.py`; `app/core/rate_limit.py`; `app/api/v1/router.py`
- **App:**
  - new: `app/trip/invite/[id].tsx`, `src/features/chat/PlanBar.tsx`, `ideaAnswers.ts`, `cards/InviteCard.tsx`, `src/__tests__/tripRooms.test.tsx`
  - changed, chat: `app/chat/[id].tsx` (room mode), `MessageBubble.tsx` (names and faces), `format.ts` (lines per viewer, room names, `firstInRun`), `ChatRow.tsx`, `Composer.tsx` (placeholder), `queries.ts`, `cards/actions.tsx` (join, add to a day), `cards/PlaceCard.tsx` (suggestions), `cards/ChatCard.tsx`, `cards/CardFrame.tsx`, `cards/TripIdeaCard.tsx`
  - changed, elsewhere: `app/trip/[id].tsx`, `app/(tabs)/trips.tsx`, `app/friends/[id].tsx`, `app/trip/new.tsx` (`invite`), `app/_layout.tsx`, `src/services/api.ts` (`roomsApi`), `src/types/index.ts`, `src/ui/theme/tokens.ts` (`SENDER_NAMES`), `src/i18n/en.json` and `bn.json`
  - tests: `tripRooms` (new), and changes to `chatCards` and `contrast`
- **Scripts:** `scripts/e2e/chat_as.py` gained `invite`, `join`, `room`, `suggest`, `accept`, `tryedit`, `leave` and `roomsay`.
- **Docs:** `docs/architecture.md`, `docs/feature-inventory.md`, `docs/friends-chat-plan.md`

## Notes for step 8 (on the trip)

- **Check-ins, running late and live location all live in the room.** `rooms.room_of(trip_id)` finds it, and `rooms.system_line` posts its lines.
- **Running late from Today mode:** the room exists only after someone was invited. With no room, offer nothing.
- **Live location:** members are `rooms.room_audience(trip)`. The block rule in `live._message_event` should apply to location updates too.

# Friends and Chat · Step 4 report

**Date:** 2026-10-28 · **Plan:** [friends-chat-plan.md](../friends-chat-plan.md), step 4 · **Status:** done. Decision C6 was confirmed by the owner: "Want to go" on an attraction marks its division.

## What was built

Four kinds of card in chat, sent from the chat's + or from "Send to a friend", and acted on in place.

| Card | Shows | Buttons |
|---|---|---|
| **Trip plan** | Where, dates, stops, a locator map; "Bob's trip plan" when it isn't the sender's | Open plan (a friend's trip opens read-only); Copy to my trips (someone else's trip) |
| **Place** | An attraction, a destination, or a division, city or country from the map | Want to go; Add to a trip (an attraction); Plan a trip (a destination) |
| **Trip idea** | "Let's go to …", roughly when (a month, early, mid or late), how long, a note | I'm in / Maybe / Can't, who said what, Plan this trip |
| **Poll** | A question with 2–6 answers, one each or several | Tap to answer, tap again to take it back; counts and bars |

- **The server builds every card** (`app/services/cards.py`). The app sends only ids and the sender's own words; the snapshot (title, dates, counts at the time of sending) comes from the database, so a card can't claim anything that isn't true.
- **Nothing leaks about trips.** A trip card can be sent only for a trip the sender can see (their own, or a friend's), and only into a chat where everyone else can see it too: "Rafi can't see this trip: only its owner's friends can". The card is checked again for each viewer every time it's shown, in the message list, the chat list and the live events. Someone who can no longer see the trip (they unfriended its owner, or it was deleted) gets `{"available": false}` and nothing else, and the card says "No longer available". A place taken out of the catalogue is shown the same way.
- **Votes** (`PUT /conversations/{id}/messages/{mid}/vote`): one answer each unless the poll allows several. A trip idea's answers are 1 in, 2 maybe, 3 can't. `[]` takes your answer back. Answers go live to everyone in the chat. An unsent poll keeps no answers. The limit is 60 a minute per person.
- **Copy to my trips** (`POST /trips/{id}/copy`): any trip you can see becomes a draft of your own, with its dates, stops, preferences and must-dos. It doesn't copy the plan (you build your own), photos, feedback, or a friend's busy times (their own schedule). A copy of a trip that's already over doesn't ask "did you go?".
- **Want to go** (decision C6): an attraction or a destination marks its division; a division, city or country marks itself. A place already on your map (visited, lived, or wanted) isn't changed. It goes through the map's own outbox, so it works offline.
- **Add to a trip:** pick one of your coming trips to that destination, and its must-dos open with the place added. Saving keeps it, and it's no longer a place to skip. With no trip there, "Plan a new trip" opens the trip wizard with the place as a must-see.
- **Sharing:**
  - **The chat's +** (mockup 6): Trip, Place (the trip wizard's "Where to?" search), Trip idea and Poll, plus your coming trips and Want list one tap away. Photo and "I'm here" aren't offered: they're out of scope (C5) or come in step 8.
  - **"Send to a friend"** (mockup 9, "Send a copy"), from the trip's ⋯ menu, the map's place sheet and the destination screen. Tick friends, add a note, send: the card, then the note as its own message, into each friend's chat. One friend opens their chat.
- **Cards use the outbox like text:** a card shows at once, waits offline, and is sent once.

## Found and fixed during the phone check

1. **The poll and trip idea screens hid Send behind the keyboard** (a keyboard-avoiding view under a header). They now count the header's height.
2. **Android's autofill offered the owner's name in a poll answer.** Every free-text chat field (the message box, the poll's question and answers, the notes, the friend search) now has autofill off.
3. **"On your Want list" was cut off** in a half-width button. Card buttons now wrap to two lines, which Bangla needs too.
4. **"Copied to your trips · Open" vanished too soon** (after 4 s). A message with an action now stays for 8 s.
5. **A destination card's preview said "0 places"** while it was sending, a made-up number. It now shows the count only when the app knows it; the server's card always has it.

## How it was checked

- **Backend:** `tests/test_chat_cards.py` has 41 new tests, and `pytest -q` gives **638 passed, 9 skipped**. They cover:
  - every bad payload (a card with text, a client-sent snapshot, too many answers, repeats, a past month), with nothing saved;
  - snapshots built by the server for every card and place type;
  - a trip shared only where everyone can see it;
  - unfriending and deleting, which hide the card everywhere;
  - vote rules, live events, and copy rules.

  **To show the privacy tests work, I broke each rule on purpose:** without the per-viewer check, 2 tests fail; without the recipient check at send, 1 fails.
- **App:** Jest **490 tests in 51 suites** pass (26 new, counting two contrast checks for the card colours); `tsc` and `expo lint` are clean.
  - `chatCards.test.tsx` uses the real chat screen with every kind of card and every button.
  - `chatShare.test.tsx` covers what each card sends and shows, the chat list's line for a card, the poll screen and "Send to a friend".
  - `mustDosAdd.test.tsx` covers the place arriving among the must-dos; one wizard test covers starting with a must-see.
- **On the phone** (the owner's realme, dev build, as e2e.ana with e2e.bob over the API through `scripts/e2e/chat_as.py`):

| Check | Result | Screenshot |
|---|---|---|
| Bob sends a trip, two attractions, a destination, a division, a trip idea and a poll: all arrive live | ✅ | [01](step-4/01-idea-and-poll-from-bob.png) |
| Ana answers the poll; bob gets it live. Bob answers; ana's card updates live | ✅ | [02](step-4/02-poll-answer-live.png) |
| Ana says I'm in, bob says Maybe: "In: You · Maybe: Bob (E2E)"; Plan this trip opens the wizard at Sreemangal | ✅ | [03](step-4/03-idea-answers.png) |
| Place cards: "You've been" where ana has been; Want to go on Mymensingh and on a Rajshahi museum puts those divisions on her Want list (checked on the server) | ✅ | [04](step-4/04-place-cards.png), [05](step-4/05-want-to-go.png) |
| Add to a trip: only her coming Cox's Bazar trip is offered; its must-dos open with Laboni Beach; saved (on the server) | ✅ | [06](step-4/06-add-to-a-trip.png), [07](step-4/07-must-dos-with-the-place.png) |
| Copy to my trips on bob's trip: "Copied to your trips"; a draft with bob's dates in ana's trips (on the server) | ✅ | [08](step-4/08-copy-to-my-trips.png) |
| The + sheet; ana sends her trip, a poll, a trip idea and an attraction: all reach bob live | ✅ | [09](step-4/09-share-sheet.png), [10](step-4/10-trip-idea-composer.png) |
| Send to a friend from the trip menu, with a note: the card, then "Join us", in bob's chat | ✅ | [11](step-4/11-send-to-friends.png), [12](step-4/12-sent-with-a-note.png) |
| Send to a friend from the map's place sheet (Bangladesh): reached bob | ✅ | |
| Send to a friend from the destination screen (Rajshahi): the send screen opened with its card. Not sent: the phone was then in use | ⚠️ | |

Not run: Maestro (step 4's "done when" doesn't need it; the phone was in use).

## The friends' APK and the share

- The share was down. It was restarted with step 4's backend. New links:
  - APK: `https://variance-cycling-tri-cgi.trycloudflare.com/vromon.apk`
  - API: `https://filed-gabriel-yields-circuit.trycloudflare.com`

  The vote and copy endpoints answer through the tunnel.
- **Rebuilt the APK with step 4** (2026-10-28 15:59, 106,913,556 bytes). Its bundle was checked to contain step 4's text, including the last fix. The share serves it, and friends install it over the old one, keeping their data.

## For the owner

- **The friends' APK on your phone is still step 3's version.** It wasn't installed for you this time because you were using the phone: download it from the APK link above and install it over the old one.
- **The dev app on your phone is still signed in as e2e.ana.** Sign out there and in with your own account when you use it. Sign out still ends every session (that decision is open from step 3).
- **Step 3's open items still stand:** the sign-out scope, and the large-font check.

## Files

- **Backend:**
  - new: `app/services/cards.py`, `tests/test_chat_cards.py`
  - changed: `app/schemas/chat.py` (card inputs, votes), `app/api/v1/endpoints/chat.py` (cards, `PUT …/vote`), `app/api/v1/endpoints/trips.py` (`POST /trips/{id}/copy`, sharing Duplicate's code), `app/services/live.py` (events rendered per person), `app/core/rate_limit.py`
- **App:**
  - new cards in `src/features/chat/cards/`: `CardFrame`, `TripPlanCard`, `PlaceCard`, `TripIdeaCard`, `PollCard`, `ChatCard`, `actions`, `types`
  - new share code: `src/features/chat/ShareSheet.tsx`, `src/features/chat/share.ts`
  - new screens: `app/chat/share/trip.tsx`, `place.tsx`, `idea.tsx`, `poll.tsx`, `app/share/send.tsx`
  - changed, chat: `app/chat/[id].tsx`, `src/features/chat/MessageBubble.tsx`, `Composer.tsx`, `format.ts`, `outbox.ts`, `queries.ts`
  - changed, entry points: `app/trip/[id].tsx` (menu), `app/(tabs)/index.tsx` and `src/features/map/PlaceSheet.tsx` (place sheet), `app/destination/[id].tsx`
  - changed, must-dos and wizard: `app/trip/must-dos/[id].tsx` (`add`), `app/trip/new.tsx` (`mustSee`)
  - changed, shared: `app/_layout.tsx`, `src/services/api.ts`, `src/types/index.ts`, `src/ui/theme/tokens.ts` (`cardMine`, `cardMineText2`, `cardEyebrowMine`, `cardButtonMine`), `src/i18n/en.json`, `src/i18n/bn.json`
  - tests: `chatCards`, `chatShare`, `mustDosAdd`, and changes to `contrast` and `newTripScreen`
- **Scripts:** `scripts/e2e/chat_as.py` gained `trips`, `trip`, `place`, `idea`, `poll` and `vote`.
- **Docs:** `docs/architecture.md`, `docs/feature-inventory.md`, `docs/friends-chat-plan.md`

## Notes for step 5 (reactions, replies, safety)

- **Rendering:** `cards.render` is the one place a message becomes what a person sees. Reactions and reply previews belong there too, so they're checked the same way.
- **Message menu:** press-and-hold (mockup 7) will want "Want to go" and "Add to a trip" for place cards; `useCardActions()` already has both.
- **Live updates:** `message.updated` already carries votes; reactions can ride on it.
- **Test data:** chat 1 between e2e.ana and e2e.bob now has about 45 messages. Ana has a copied trip (95) and Laboni Beach as a must-see on trip 91. Mymensingh and Rajshahi are on her Want list.

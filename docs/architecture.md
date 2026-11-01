# Vromon — Architecture

**As built, end of Phase 11 (2026-10-12).**

## Overview

```
┌──────────────────────── Mobile app (Expo / React Native) ────────────────────────┐
│ Wizard (RHF+Zod) · Trips · Trip detail · Itinerary (day tabs, map, budget)        │
│ TanStack Query cache  ──►  typed Axios client (src/services/api.ts)               │
└───────────────────────────────────────┬───────────────────────────────────────────┘
                                        │ HTTP JSON  /api/v1
┌───────────────────────────────────────▼──────────── Backend (FastAPI) ───────────┐
│ endpoints: destinations · places · trips (CRUD, generate, edit, adapt, budget,   │
│            feedback) · rag (search, ask, explanation, ingest[admin])             │
│                                                                                  │
│  RecommendationService ──► ranked candidates (score + reasons)                   │
│        │                                                                         │
│        ├──► ItineraryService (greedy, deterministic) ──┐                         │
│        └──► CpSatItineraryService (OR-Tools CP-SAT) ───┼──► ConstraintValidator ─┤
│  EditingService / AdaptationService ───────────────────┘   (independent check)   │
│                                                                                  │
│  RAG: chunker → embeddings (Gemini | dummy) → vector store (JSON + numpy cosine) │
│       retrieval → grounded generation (Gemini structured output)                 │
│       → citation check → number check → sources from DB rows                     │
└───────────────────────────────────────┬──────────────────────────────────────────┘
                                        │ SQLAlchemy 2
                        SQLite (default) / PostgreSQL 16 (tested via Docker)
```

## Key design rules

1. **The validator never trusts a generator.** `constraint_validator.py` re-derives every hard rule from the database records: overlaps, opening hours, excluded places, duplicates, activity limit, must-visit, daily budget. Both schedulers and every edit are checked by it, and fault injection measures it (98/98 detected).
2. **The LLM never touches scheduling.** It only produces explanations and answers. Removing the LLM leaves planning fully functional, and a test proves it.
3. **Nothing is invented.** No fake LLM fallback, no invented sources or URLs, no hard-coded travel facts outside `data/seed`. Unknown values (transport cost) are shown as unknown.
4. **Determinism.** The greedy planner is deterministic (seeded meal choice). CP-SAT uses a deterministic work limit with interleaved parallel search, so the same request gives the same plan.

## Data model (SQLAlchemy)

`Destination` 1─* `Place` / `Restaurant` / `Hotel`
`Trip` 1─1 `TripPreference`, 1─1 `TripConstraint`, 1─* `Itinerary` (day) 1─* `ItineraryItem` (activity/meal), 1─1 `Feedback`
`SourceDocument` 1─* `DocumentChunk` (text, metadata, embedding JSON, embedding model)

Prices are per person in BDT. Trip budgets are totals for the group; the ranker uses the per-person daily share.

## Request flow: generate an itinerary

1. `POST /trips/{id}/generate?algorithm=cpsat`
2. Rank candidates (`RecommendationService`), pick meal restaurants and the hotel deterministically.
3. CP-SAT solves without touching the database. On `INFEASIBLE`/`UNKNOWN` it returns 422 with diagnostics, and the old itinerary is kept.
4. On success the old days are replaced and the new rows persisted.
5. `ConstraintValidator.validate()` runs, and its report is returned with the itinerary.

## Chat between friends (docs/friends-chat-plan.md)

Step 1 (2026-10-27): direct chats between friends, text only. Code: `app/api/v1/endpoints/chat.py`, `app/services/chat.py`, `app/schemas/chat.py`; tables from migration `0015`.

| Method and path | What |
|---|---|
| `GET /conversations` | Your chats that have a message you can see, newest first, with the other person, the last message, `unread_count`, `can_send` / `read_only_reason`, `other_read_up_to` and `muted_until` |
| `POST /conversations/direct` `{user_id}` | The chat with a friend, made the first time either of you opens it (one per pair). Not a friend: 404 |
| `GET /conversations/{id}` | One chat, as in the list |
| `GET /conversations/{id}/messages?before=&after=&limit=` | The newest messages, older ones with `before`, newer ones with `after` (catching up); oldest first, with `has_more` |
| `POST /conversations/{id}/messages` `{client_id, kind: "text", body}` | Send. Text is trimmed, 1–2,000 characters. The same `client_id` again returns the first message (200 instead of 201); in another chat, 409. 30 a minute per user |
| `DELETE /conversations/{id}/messages/{message_id}` | Unsend your own message within an hour: it stays, as `deleted` with no text |
| `POST /conversations/{id}/read` `{message_id}` | Read up to a message (only forward, never past the newest) |
| `PATCH /conversations/{id}/me` `{muted_until?, cleared_up_to_id?}` | Mute (`null` unmutes), or "delete chat" for you only |

**Rules (enforced on the server):**
- Only members see a chat. Anyone else gets 404, and so does a member who blocked the other person.
- Without a friendship (unfriended, or blocked by the other person, which isn't revealed) a direct chat is read-only: you can read it, but sending answers 403 (`read_only_reason: "not_friends"`). The same happens when the other account was deleted (`"account_deleted"`).
- Read ticks (`other_read_up_to`) show only when both people have `read_receipts` on (`/me/settings`).
- Unread counts skip your own messages, unsent ones and lines from Vromon itself (`kind: "system"`, no sender; `services.chat.post_system_message`).
- Times are sent with their UTC offset (`+00:00`).
- `/me/export` includes your chats and the messages you sent. `DELETE /me` deletes your messages, reactions, votes and memberships, and any chat left with nobody in it. SQLite doesn't enforce `ON DELETE`, so this is done in code.

### Live updates: `WS /api/v1/ws` (step 2)

Code: `app/api/v1/endpoints/live.py` (the socket) and `app/services/live.py` (the hub and the events).

1. **Sign in:** the app connects and, within 5 s, sends `{"type": "auth", "token": "<Supabase access token>"}`. The token never goes in the URL.
2. **Ready:** the server answers `{"type": "ready", "user_id": …}`. The app then catches up: it fetches the chat list and each open chat's newest page again and merges them by message id, so nothing shows twice (a gap bigger than a page starts the chat from the newest page; older ones load as you scroll). `GET /conversations/{id}/messages?after=<last id>` pages forward for other clients.
3. **Server to app**, only after the change is saved and only to members who can see the chat:

| Event | When | Who gets it |
|---|---|---|
| `message.created` `{conversation_id, message}` | A message is sent | Every member's apps; only the sender's apps get `client_id` back |
| `message.updated` `{conversation_id, message}` | A message is unsent | Every member's apps |
| `conversation.read` `{conversation_id, user_id, last_read_message_id}` | Someone reads further | Their own apps always; the others only when both have read receipts on |
| `conversation.updated` `{conversation_id}` | Muted or cleared (your apps); a friendship started or ended, a block, or an account deleted (both people) | Fetch the chat again (404 means it's gone for you) |
| `typing` `{conversation_id, user_id}` | Someone who can write there is typing | The other members; nothing is stored |
| `ping` | Every 25 s | The app can use it to notice a dead connection |

4. **App to server:** `{"type": "typing", "conversation_id": …}` (at most one every 3 s counts), and `{"type": "ping"}`, which is answered with `{"type": "pong"}`.

**Close codes:**
- **4401:** sign in again. The token was missing, bad, or has just expired; the socket closes at the token's expiry time.
- **1013:** try again later. Either the sign-in service couldn't be reached, so the app must not sign out, or the app fell 256 events behind.
- **1009:** the app sent a message bigger than 4 KB.

### In the app (step 3)

Code: `mobile/src/features/chat/`, the screens `app/chat/[id].tsx` and `app/chat/new.tsx`, and the Chats segment of `app/(tabs)/friends.tsx`.

- **Data:** TanStack Query keys `['chat', 'list']`, `['chat', 'conversation', id]` and `['chat', 'thread', id]` (`queries.ts`). Live events and your own sends change the cache directly. While the socket is down, the open chat polls every 10 s and the list every 20 s.
- **Socket** (`socket.ts`, started by `useLiveChat` in the root layout): signs in with its first message, reconnects with backoff (1 … 30 s), on return to the foreground and when the network comes back, and treats 60 s without a ping as a dead connection. After `ready` it refetches the chats and sends the outbox.
- **Outbox** (`outbox.ts`, AsyncStorage `vromon.chat-outbox`): a message shows at once with its own `client_id` (a UUID), so sending it again can never post it twice.
  - Offline, a server error, 401, 408 or 429: it waits ("Waiting for network") and goes again on reconnect, on return to the app, and every 15 s. It survives restarts.
  - Any other 4xx: "Not sent", with the server's reason.
  - Either way, a tap offers Try again or Delete. The outbox belongs to one account; another account's messages are never sent.
- **Saved on the device** (`services/queryClient.ts`): the query cache is one AsyncStorage entry (`vromon.query-cache`), and chats are part of it.
  - Each chat keeps only its newest 50 messages, because Android can't read back an entry over about 2 MB.
  - Data whose last refresh failed only for now (offline, the server down) is saved as the good data it still is, so a second offline start still shows the map, trips and chats.
  - A "no" from the server (such as a 404) drops it. Signing out clears it all.

### Cards (step 4)

Code: `app/services/cards.py` (backend), `mobile/src/features/chat/cards/` and `share.ts` (app).

**Sending:** `POST /conversations/{id}/messages` with `kind` trip, place, idea or poll and a `payload` of ids and the sender's own words:

| Kind | Payload sent | Snapshot stored |
|---|---|---|
| `trip` | `{trip_id}` | owner, title, destination, dates, days, travellers, stops, where |
| `place` | `{type, ref}`: attraction or destination (id), country, region or city (code) | name, kind, where, and an attraction's category and time there |
| `idea` | `{destination_id, month?, part?, days?, note?}` | the destination and where it is, with the rest as sent |
| `poll` | `{question, options[2–6], multiple}` | options numbered from 1 |

The server builds the snapshot; any field it didn't ask for is refused (422).

- **Who sees a trip card:** it can be sent only for a trip the sender can see, into a chat where everyone can see it. `cards.render` checks again for each viewer on every read (messages, the chat list, live events). Without access, or once the trip is deleted, the payload is just `{"available": false}`. A place gone from the catalogue is shown the same way.
- **Votes:** `PUT /conversations/{id}/messages/{mid}/vote {option_ids}`, in `poll_votes`. One answer unless the poll allows several; a trip idea's answers are 1 in, 2 maybe, 3 can't; `[]` takes the answer back. Messages carry `votes` (`{"2": [user ids]}`) and change live with `message.updated`. 60 a minute per user.
- **Copy:** `POST /trips/{id}/copy` (`trips.py`). Any trip you can see becomes a draft of your own, with dates, stops, preferences and must-dos. Not copied: the plan, photos, feedback, or someone else's busy times.
- **In the app:**
  - cards go through the chat outbox with a preview, so they show at once and wait offline;
  - "Want to go" uses the map's visit outbox, and an attraction or destination marks its division (decision C6);
  - "Add to a trip" opens `trip/must-dos/[id]?add=`, and the trip wizard takes `?mustSee=`.

### Reactions, replies and safety (step 5)

Code: `cards.py` (`react`, `check_reply`, and reactions and quotes in `render`), the endpoints in `chat.py`, and the `message_reports` table plus three `user_settings` columns from migration `0016`.

| Endpoint | What it does |
|---|---|
| `PUT /conversations/{id}/messages/{mid}/reaction` `{reaction}` | Your one reaction: `heart`, `thumbs_up`, `laugh`, `wow`, or `want` (on a place or a trip idea only). A new one replaces the old. Not on lines from Vromon (422) or unsent messages (409). 60 a minute |
| `DELETE …/reaction` | Takes your reaction back |
| `POST /conversations/{id}/messages` `{…, reply_to_id}` | A reply. The quoted message must be in the same chat and not cleared by you (404); not a line from Vromon (422) and not unsent (409) |
| `POST /messages/{mid}/report` `{reason, note?}` | Report someone else's message (also in a read-only chat). Reasons: spam, harassment, inappropriate, scam, other; a note of up to 500 characters. A copy of the message is kept with the report. Reporting it again returns the first report (200). 10 a minute |
| `GET /admin/reports?status=open\|all` | The reports, for whoever has `ADMIN_TOKEN` |
| `POST /me/chats/clear` | "Delete all my chats": every chat cleared for you only (`cleared_up_to_id` set to its newest message) |

- **What a message carries:** `reactions` (`{"heart": [user ids]}`) and `reply_to`, a preview of the quoted message (`{id, sender_id, kind, body, payload, deleted}`, body cut to 200 characters). Both are built by `cards.render` for each viewer, so a quoted trip card follows the same access rule as the card itself. Both change live with `message.updated`. Unsending a message drops its reactions and votes.
- **Settings:** `user_settings` gains `notify_messages`, `notify_trip_rooms` and `notification_previews` (all on by default), next to `read_receipts` (mutual: with it off you don't see anyone's either). Push for messages comes in step 9; until then the switches are only saved.
- **Account deletion** also deletes the reports you made and the reports about you.
- **In the app** (`MessageMenu.tsx`, `ReactorsSheet.tsx`, `reactions.ts`, `app/chat/report.tsx`, `app/settings/chats.tsx`):
  - press and hold a message for its menu: the reactions, then Reply, Copy, Add to a trip, Unsend (yours, within an hour) or Report… (someone else's);
  - swipe right to reply; the reply bar shows the quote, and the outbox keeps the quote so a reply waiting offline shows it too;
  - screen readers get the menu and Reply as actions on each message;
  - reactions and unsending show at once and go back if the server refuses;
  - the chat's ⋯ menu offers Mute (1 hour, 8 hours, always), View profile, Delete chat for me, Unfriend and Block;
  - Settings → Chats and privacy replaces the Settings tab's two friend notification switches.

### On the road (step 6)

Code: `app/services/on_the_road.py`, the endpoint in `friends.py`, and the `share_trips_with_friends` setting from migration `0017`.

| Endpoint | What it does |
|---|---|
| `GET /me/friends/on-the-road?today=` | Friends on a trip today or leaving within 14 days: `{friend, trip: {trip_id, destination, start_date, end_date, day, days, starts_in}}`. `day` is N of `days` while the trip is on, and null before it starts. Friends on a trip come first, then by when they leave. `today` is the phone's date (believed within a day of the server's). 30 a minute |

- **Which trip:** the one they're on today; if none, the next one starting within 14 days. Of two trips at once, the one that started last.
- **Who sees it:** accepted friends only. Strangers, ex-friends and anyone blocked either way get nothing.
- **`share_trips_with_friends`** (on by default; decisions C3 and C7): off hides your trips everywhere friends see them:
  - the On the road list;
  - `/users/{id}/trips`, which returns `[]`;
  - `/users/{id}/trips/stats`, which counts no trips;
  - the profile, whose `shares_trips` becomes false.

  A trip you send in a chat still opens, because you chose to share that one.
- **In the app** (`OnTheRoadStrip.tsx`, `onTheRoad.ts`, `useOnTheRoad` in `friends/queries.ts`):
  - one cached list feeds the strip at the top of Chats, the chat header line and the profile chip;
  - the strip is hidden when it's empty. Tap opens the chat; hold, or the screen reader action, opens their trip;
  - a friend's profile is always fetched again when it opens, and their trips are dropped from the cache once they hide them.

### Trip rooms (step 7)

Code: `app/services/rooms.py`, `app/api/v1/endpoints/rooms.py`, and the `trip_members` and `trip_suggestions` tables from migration `0018`. A room is the trip's `trip` conversation, made the first time the owner invites someone.

| Endpoint | What it does |
|---|---|
| `GET /trips/{id}/members` | Owner, invited and joined people; for the owner and joined members |
| `POST /trips/{id}/members` `{user_ids, note?}` | The owner invites their own friends. Each gets an `invite` card (and the note) in their direct chat with the owner, and the room gets "Ana invited Rafi". Anyone who isn't the owner's friend: 403, and nobody is invited. 20 a minute |
| `POST /trips/{id}/members/me/join` | Join a room you were invited to (only while still friends with the owner) |
| `DELETE /trips/{id}/members/{user_id}` | Leave (your own id; also turns an invite down), or the owner removes someone. They lose the room and the trip at once |
| `POST /trips/{id}/suggestions/{mid}/accept` `{day}` | The owner adds a place suggested in the room to a day, through the same code as adding a stop (`editing_service.add_place`); the room gets "Ana added X to Day N" |
| `POST /trips/{id}/suggestions/{mid}/decline` | The owner says "not this time" |
| `GET /me/trips/joined` | Friends' trips you joined ("With friends" in Trips) |

- **Who sees what:**
  - joined members read the trip and its plan (`rooms.can_read_trip`, used by `_load_trip` and trip cards);
  - only the owner changes it (decision C1). A member's edit gets 404, like a friend's, and a member accepting a suggestion gets 403;
  - strangers and ex-members get 404 for the room and the trip;
  - members who aren't friends see each other's name and avatar only;
  - messages from someone you blocked are hidden for you in rooms (rule 2), and so are their live events.
- **Rendering:**
  - an `invite` card carries `room: {status: owner|invited|joined|none, conversation_id}` for each viewer;
  - an attraction card in a room carries `suggestion: {status: open|added|declined, day}`;
  - system lines carry `actor`, `target`/`targets` (id and name at the time), `place` and `day`, and the app words them per viewer ("You invited…", "Ana added…");
  - `ConversationOut` gains `trip` (dates, stops, the first places by day for the plan bar) and `members`.
- **Deleting** a trip deletes its room (SQLite doesn't cascade). Deleting an account removes its memberships and the rooms of its trips.
- **Not built:** a "dates changed" line. Nothing in the app or API changes a trip's dates yet.
- **In the app:**
  - the room is `app/chat/[id].tsx` in room mode (header, `PlanBar`, names and faces on bubbles, the ⋮ menu with members, invite and leave);
  - `InviteCard`, the suggestion part of `PlaceCard`, `app/trip/invite/[id].tsx` ("Plan together", with "I'm in" friends first, from `ideaAnswers.ts`);
  - the trip screen's "Trip room" button, "With friends" in Trips, and "Trips together" on a profile;
  - a trip idea's "Plan this trip" invites everyone who's in once the wizard has saved the trip.

### On the trip: check-ins, running late, live location (step 8)

Code: `app/services/ontrip.py`; two new card kinds in `cards.py`; the live location endpoints in `endpoints/rooms.py`; the `live_locations` table from migration `0019`.

- **`checkin` card** (`POST …/messages` with `{lat, lon, date, time}`, trip rooms only, on a day of the trip):
  - the server snaps the reading to the day's nearest planned stop within 300 m and stores `{day, time, stop, place_id, planned, late_by}`;
  - otherwise it stores `{near: destination}` within 50 km of it, else `{near: null}`;
  - **the reading itself is never stored or shown.**
- **`late` card** (`{minutes 5–180, source: today|room, date, time}`): the server adds the day's next stop.
- **Dates:** the phone's `date` is believed only within a day of the server's, and must be one of the trip's days (422 otherwise).

| Endpoint | What it does |
|---|---|
| `POST /conversations/{id}/live` `{client_id, lat, lon, accuracy_m, date, until}` | Start sharing until a time at most a day ahead, in a trip room, on a trip day. Makes a `live` card; starting again ends the last one |
| `PUT /conversations/{id}/live` `{lat, lon, accuracy_m, date}` | The latest point (the app sends one a minute while open). Outside the trip's days: 422, nothing kept. 6 a minute |
| `DELETE /conversations/{id}/live` | Stop: the point is deleted |

- **What's kept:** `live_locations` holds one row per person per room, the latest point only, never a history.
- **When it's deleted:** on Stop, when someone leaves or is removed, with the room, with the account, and when it runs out. Expired rows are purged before the room is read or any live call runs. Every read also checks the time, so an expired point is never shown.
- **The `live` card** carries `{active, until, lat, lon, accuracy_m, updated_at, near}` while it runs, for room members only, and `{active: false, until}` after.
- **In the app** (`onTheTrip.ts`, `liveShare.ts`, `LiveShareBar.tsx`, `cards/OnTripCards.tsx`):
  - quick chips over the composer and two + sheet tiles on a trip day (no photos, decision C5);
  - Today mode's running late has "Tell the trip room";
  - live location: the persisted `useLiveShare` store, `useLiveShareUpdates` in the root layout (a point every 60 s while Vromon is in front, no background tracking), and a bar with Stop on every screen.

### Notifications for chats (step 9)

Code: `app/services/chat_push.py`, called after the response from sending a message, inviting to a trip room, adding a suggestion and starting a live location. It's sent through `push.queue_push`, which now takes a channel and a tag.

- **What sends one:**
  - a new message: text, a card, I'm here, running late, a live location starting;
  - a trip-room invite;
  - your suggestion added to the plan (to whoever suggested it).

  Reactions, answers, unsends, live location points and lines from Vromon don't.
- **Who gets one:** everyone else who can see the chat, unless they muted it (until the mute ends), blocked the sender, or turned the kind off in Chats and privacy. "Messages" covers direct chats, and "Trip rooms" covers rooms and room invites.
- **What it says:**
  - the title is the sender, or "Sender · Room" in a trip room;
  - the body is the text (up to 120 characters) or what the card is; with previews off, only "New message";
  - it's in English or Bangla, from the recipient's language setting.
- **One per chat:** Android channel `messages`, with `tag` and `collapseId` `chat-<id>`, so a new one replaces the one shown. The data is `{url: "/chat/<id>"}`.
- **In the app:**
  - the `Messages` channel is made when registering;
  - a tap opens only `/friends`, `/friends/<uuid>` or `/chat/<number>` (`safePath`);
  - while Vromon is open, a chat's push isn't shown. Instead, `ChatBanner` shows who and what for 4 s when the live socket brings a message for a chat that isn't open or muted (`bannerWorthy`), and a tap opens the chat. This works without push;
  - the Friends tab badge updates live from the same events.
- **Delivery needs** the owner's Firebase and EAS setup (`docs/technology-decisions.md`, Push). Until then, everything above runs, but Expo has no device to deliver to.

### Hardening and the full check (step 10)

**Limits on the server** (with the per-user rate limits from steps 1–8):

| What | Limit | What happens |
|---|---|---|
| A request body | 1 MB of JSON; a photo upload up to `PHOTO_MAX_UPLOAD_MB` plus 64 KB | 413 before the endpoint runs (`app/core/body_limit.py`), also for a body sent without `Content-Length` |
| A socket frame | 16 KB (`uvicorn --ws-max-size 16384`, in the Dockerfile and the share) | uvicorn refuses it before reading it |
| A socket message | 4,096 characters | closed with 1009 |
| Socket messages | 30 in 10 s (the app sends a typing hint at most every 3 s per chat) | closed with 1008 |
| Sockets per person | 5 | a sixth closes their oldest with 1013; the app reconnects |
| Push tokens | in the body, never a URL | `POST /me/devices/remove` replaced `DELETE /me/devices/{token}` |

**Fixed in step 10:**

- **Hidden trips by id.** `rooms.can_read_trip` now checks "Show my trips to friends": with it off, a friend reads a trip only if its owner sent it to them in a chat (a trip card or an invite they haven't unsent; `rooms.sent_to`). It applies to `GET /trips/{id}` and its plan, conditions, budget and route, to copying, and to cards. The owner can still send a hidden trip to a friend.
- **A retried live-location start** (the same `client_id`) returns the first card (200) instead of a 500; a double tap gives 409.
- **The invite note** is cleaned like a message (no NUL, one kind of line break).
- **SQLite only:** deleting an account also deletes what was decided about the places it suggested, so a reused message id can't inherit it.

**Performance:**

- `GET /conversations` loads every chat's seat, settings, read state, trip and last message together (`chat.seats`, `_conversations_out`): **26 queries for 104 chats instead of 941**, 17 ms on this Mac's SQLite. The output is byte-for-byte the same.
- `buildRows` gives back the same bubble and row objects while nothing about them changed (`WeakMap`s keyed by message and bubble), so `React.memo` and the list skip the rest of a long chat when an older page, a new message or the next minute arrives; `mergeMessages` keeps a refetched message's object when it hasn't changed. Chat list rows are memoized too (`ChatRow`, with `onOpen(id)`).
- An older page that fails (offline) says "Couldn't load earlier messages" with Try again, and loads by itself once the live connection is back; before, its spinner kept spinning.
- Measuring: a release build made with `EXPO_PUBLIC_PERF_LOG=1` logs `[perf] chat: … ms`, `[perf] chat list: … ms`, `[perf] older page: 50 messages in … ms` and `[perf] chat scroll: … fps …` (`src/utils/devPerf.ts`; `adb logcat -s ReactNativeJS`). `scripts/dev/seed_chat_perf.py` adds a 2,000-message chat and 99 more chats to a test account in the dev database, and removes them again.
- **Measured on the realme RMX2170** (release build with `EXPO_PUBLIC_PERF_LOG=1`, e2e.ana with the seed):

  | | Before step 10's changes | After |
  |---|---|---|
  | A 2,000-message chat: flinging back through all 40 pages, JavaScript frames | 23 fps, single frames up to 1,373 ms | 48 fps, up to 317 ms (about 170 ms when a new page draws) |
  | The same, screen frames (`dumpsys gfxinfo`) | 2.9% janky, 99th percentile 36 ms | 1.35% janky, 99th percentile 22 ms |
  | Building the rows of 2,000 messages | ~100 ms | 23 ms |
  | A page of 50 older messages from the server | | 69–251 ms, median 113 ms |
  | Opening the chat | | 190 ms from the cache, 274–496 ms from the network |
  | The chat list with 104 chats: first draw from the cache (4 chats: 55 ms) | 692 ms | 89 ms |
  | Scrolling that list | 0.8% janky frames, 99th percentile 19 ms | 0.8% janky frames, 99th percentile 19 ms, 57–61 fps |

  What made the difference, besides the bubbles above: dates parsed once per message in `buildRows` (it parsed each one up to 16 times); Intl formatters made once per language (`src/utils/dateFormat.ts`; Hermes builds one on every `toLocale…String`); a lighter swipe-to-reply (`SwipeToReply.tsx`: one gesture and one animated value per bubble, where `ReanimatedSwipeable` was half of each bubble's cost to draw); `PressableScale` with no press effect is a plain `Pressable`; and the Friends tab's chat list is a `FlatList` that draws only the rows on screen (it drew every chat at once).

**PostgreSQL.** `TEST_API_POSTGRES_URL=postgresql+psycopg://localhost/<empty db>` runs the whole API suite on PostgreSQL (`tests/conftest.py`). It passes, after fixing three bugs SQLite hid:
- the Cox's Bazar seed keeps its ids, and PostgreSQL's id sequences didn't move past them, so `load_destinations` failed on a new database and the server couldn't start (`seeder._sync_id_sequences`);
- deleting an account with a planned trip failed: the ORM deleted the user before the trip (nothing relates them), and the database's cascade from users to trips hit the plan's foreign keys (`delete_me` flushes the trips first);
- the destination, place, restaurant and hotel lists had no `ORDER BY`; they're ordered by id now.

## Deployment shapes

- **Local dev:** SQLite, `uvicorn --reload`, Expo Go on a phone.
- **Docker Compose:** PostgreSQL 16 (pgvector image) plus the backend image (`backend/Dockerfile`). Verified end to end.
- **Hosted:** see [deployment.md](deployment.md). The steps are documented but not executed from this repository.

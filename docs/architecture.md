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

## Where the traveller stays (docs/trip-upgrades, step 1)

Code: `app/services/stays.py`, the `trip_stays` table (migration `0030`), and the trip endpoints. Each row covers nights `first_night`..`last_night` (1-based) with one kind: `hotel` (a `hotel_id`), `home` (a family or friend's home: `lat`, `lon`, optional `label`; no cost), `none` (no night there: day trips from the trip's start point; no cost) or `undecided`. A trip's rows cover its nights once. A trip without rows sleeps in the hotel `stays.pick_hotel` chooses (decision D11: a priced hotel with a real name, at or near the budget's level, near the destination's centre; else the best-rated real-named one, cost unknown). Building a plan writes that choice down (`stays.freeze`), so the hotel doesn't change under a plan. Migration `0030` did the same for every trip that already had a plan, with the hotel it used then.

- **Each day:** day *d* starts at night *d−1*'s stay (day 1: night 1's) and ends at night *d*'s (the last day: the last night's). `stays.bases(db, trip)` gives a `TripBases` with `start(day)` / `end(day)`; everything that used "the trip's hotel" takes it (`trips._hotel` returns it).
- **"Finish by" means back at the stay** (D3): both planners leave the last visit time to get back, and move dinner earlier by the way back when needed. The day's `total_travel_time` includes the way back. The validator reports a day that gets back late after an edit as a soft `BACK_LATE`.
- **Budget:** the stay part is per stay (`detail.blocks`): hotel nights × rooms at their price; homes and day trips 0. Local travel runs from the day's start and back to its end. "Ways to save" offers a cheaper hotel per hotel stay; applying it rewrites the stays, and the undo restores them (`{"kind": "stays", …}`).
- **Privacy (D2):** to anyone but the trip's owner (trip-room members, friends who can read the trip), a home is `{kind: "home"}` with no name, coordinates or way back. The route leaves out its legs, the budget its label. A copy of a trip never takes the stays.

| Endpoint | What it does |
|---|---|
| `GET /trips/{id}/stays` | The stays (`chosen`: false while Vromon picks the hotel). Owner, or a reader with homes hidden |
| `PUT /trips/{id}/stays` `{stays: [...]}` | Owner only. Validates the cover (422), the hotel (404, or 422 when over 80 km away) and a home's place. Re-computes the legs of the days whose start or end moved (their stops keep their times). Returns the stays, those days, the validation and the budget before and after |
| `POST /trips` | Optional `stay` (one choice for all nights) or `stays` (night by night) |
| `GET /trips/{id}/itinerary` (and every day in other responses) | Each day has `start_base`, `end_base` (`{kind, name, latitude, longitude, hotel_id, estimate}`) and `return_leg` (`{from_item_id, minutes, km, mode, cost}`). `hotel` stays: night 1's hotel, for app versions before the stays |
| `GET /trips/{id}/days/{day_id}/route` | Adds a `from_base` leg (the day's start to its first stop) and a `to_base` leg (its last stop back to where you sleep), in the same single road request |

## Meals (docs/trip-upgrades, step 3)

Code: `app/services/meals.py`, migration `0031` (`trip_preferences.meals_json`, `itineraries.meals_json`, `itinerary_items.meal_source`), and the planners. Per meal (decision D6): `restaurant` (the default; as before), `own` (a 30-min "Packed lunch" where the traveller is, no restaurant and no leg to one; it costs `own_cost_per_person`, 0 when unset) or `stay` (breakfast before leaving the day's start, dinner after the way back to its end; never lunch; no cost). The trip's plan is in `trip_preferences.meals_json`; a day's own plan in `itineraries.meals_json` wins over it. NULL everywhere means every meal at a restaurant, and the planners take exactly the old path.

- **Rules:** `TripRules.meals` has each day's plan (`trip_rules.rules_for`). `breakfast_minutes` (60 / 30 / 0) sets when visits can start; `meal_starts` only reserves restaurant dinners and sizes lunch by its source.
- **Quick planner:** a packed breakfast is at the day's start; a packed lunch moves with the day like a restaurant lunch and is eaten at the stop just seen (it tries one more stop first when that's a park, a view or a beach and lunch still fits by 14:30); a packed dinner comes after the last stop, which keeps 30 min before the way back. Meals where you stay are added last (`meals.place_stay_meals`): breakfast ends when the traveller leaves (the first stop's start less the way there), dinner starts after getting back (not before 19:00). No breakfast there on a day 1 with an arrival time; no dinner there on the last day.
- **Optimiser (CP-SAT):** breakfast and lunch intervals take the source's length, a dinner interval only for restaurants, and a packed dinner keeps 30 min before the last arc back. `persist` writes the own and stay meals.
- **Edits:** `editing_service.sequence(day)` leaves meals where you stay out of reorder, move and add positions; `recompute_day` re-times them after every edit (`meals.sync_stay_meals`). `rebuild_meals` changes only the meals of a day when the plan changes (each takes the old meal's place; the day is re-timed from the first change). Running late doesn't move them; they follow.
- **Validation:** meals where you stay are outside the day on purpose (no window warnings); "back at the stay" counts a packed dinner eaten after the last stop; own and stay meals aren't placeholders.
- **Budget:** the food part counts restaurant meals at their price, own meals × `own_cost_per_person` × travellers, meals where you stay 0, and lists `by_source`. The AI estimate is told not to price meals the traveller won't buy.
- **A re-plan of the whole trip** keeps each day's own plan (read before the days are replaced).

| Endpoint | What it does |
|---|---|
| `PUT /trips/{id}/meals` | Owner only. The trip's plan; rebuilds the meals of the days without their own plan. Returns the plan, those days, the validation and the budget before and after |
| `PUT /trips/{id}/days/{day_id}/meals` `{meals}` | Owner only. One day's own plan; `null` follows the trip's again |
| `POST /trips` | Optional `meals` |
| `GET /trips/{id}/items/{item_id}/places-to-eat` | Restaurants open for an hour from the meal's start, nearest to the stop before it (up to 8). Readers too |
| `PUT /trips/{id}/items/{item_id}/restaurant` `{restaurant_id}` | Owner only. This one meal at that restaurant (an hour); the rest of the day moves as needed |
| `GET /trips/{id}/itinerary` | Items have `meal_source`; days have `meals` (their own plan) and `meal_plan` (what they follow) |

## The stay advisor (docs/trip-upgrades, step 4)

Code: `app/services/stay_advisor.py`, the `stay_suggestions` table (migration `0032`), and the trip endpoints. "Sleep somewhere else for nights a-b?" (decisions D4, D5):

- **What's looked at:** every run of nights now at one hotel that hasn't started (`first_open_night`: a night on today's date or before has). Candidate hotels:
  - priced, real-named, rated 3.5 or more when the rating is known (unknown is allowed and said), in the trip's currency, where a stay may be (the destination or within 80 km of it);
  - within 3 km of those days' stops (or their middle);
  - for a day out of town (its stops more than 25 km from the stay), also the 3 nearest hotels to its stops within 40 km (a must-see town: Mongla for the Sundarbans).
- **The numbers** (`evaluate`), against the plan as it is, on the days whose start or end changes:
  - **money_saved** = (current price - its price) × nights × rooms - the moves' bag-ride fares + the change in the day's ride fares (as the budget counts them, so Switch changes the budget by exactly this). It's `None` when the current price isn't known.
  - **minutes_saved** = road time to and from the stay now - then - the bag rides' minutes - 45 min per extra move.
  - **extra_moves** = the moves between stays it adds (or saves). Road time is the planner's (`ROADS`, prepared in one request).
- **Worth it** (`worth_it`, D4):
  - money ≥ max(৳1,000, 10% of that stay) with road time not worse by more than 30 min, or road time ≥ 60 min saved with money not worse by more than ৳500 a night;
  - a one-night stay between two moves only for ≥ 2 h a night;
  - best first by money + minutes × ৳5 (D5), at most 2, never two for the same night.
- **Kept** (`suggestions`): worked out again only when the plan's fingerprint changes (stays, dates, travellers, stops, meals, nearby hotel prices). Answers:
  - **Not now:** quiets those nights (any hotel) until the fingerprint changes.
  - **Don't suggest this:** hides that hotel for those nights until its money or time saving grows by more than 25%.
  - **Accepted:** it's the stay now; it comes back if the stays change back.
- **The budget:** ways to save list the open suggestions (`key: "stay"`, action `stay_advice`) instead of the old cheaper-hotel line. Local travel counts a ride with the bags on a day you move between stays (`budget.move_legs`).

| Endpoint | What it does |
|---|---|
| `GET /trips/{id}/stay-suggestions` | Owner only (it's about money): at most 2, with the hotel, the current one, the numbers and how they add up (`parts`) |
| `POST /trips/{id}/stay-suggestions/{sid}/accept` | Switch: the stays split (as `PUT /stays`; the days' legs, travel and meals where you stay follow, stops keep their times). `undo.stays` puts them back with `PUT /stays` |
| `POST …/{sid}/not-now`, `POST …/{sid}/dismiss` | The answers; return the suggestions left |

## Search anything and private stops (docs/trip-upgrades, steps 5–6)

Code: `app/services/place_search.py`, `app/core/names.py` (the name fold, shared with the data platform), `app/core/poi_kinds.py` with `poi-kinds.yaml` (kinds and their English and Bangla words, shared with the places index connector), migration `0034` (`places.owner_user_id`, `places.listed`, the `geocode_cache` table, a `(lat, lon)` index on `poi_index`). The "Add a stop" sheet's search (decision D10):

- **Reading the query:** lower case, Bangla digits, initials joined ("B.L." = "BL"). The last kind word is the kind ("Medical College" → college); a query of kind words only asks for the nearest of that kind.
- **Where:** the stop before the free time (`near_item_id`), else the day's centre, its start, or the destination. 25 km first; with fewer than 5 good results, the rest of that district, then exact names within a day's reach (80 km).
- **Sources and score:** Vromon's places of the destination → other places Vromon knows within 25 km (the next destination's sights, restaurants, hotels) → the places index (two passes: its stored keys for the whole area, then a close look at the best 300) → ORS geocoding (`ors_geocode_url`) only when the others found fewer than 5 good results. Score = name × 0.7 + nearness × 0.3 (+10 for the kind asked). Names match **word by word**: every word typed must match a word of the name (a slip in a long word counts, a different short word doesn't, the first letter must agree), checked as typed and folded (`search_key`: Bangla in Latin letters, sh/s, c/k, অ's o/a; vowels otherwise kept, so Bogura isn't Bagerhat).
- **Never empty:** the same name within 150 m once (the more trusted source); with nothing good, `did_you_mean` (3 closest names), `kind_results` (the 5 nearest of the kind asked or misspelt, within 60 km) and always `pin`.
- **The geocoder:** gets only the text and the area's centre. Results are kept 7 days by (query, area) in `geocode_cache` (no user id); 1 call per user per 2 s (in memory); a daily cap (`geocode_daily_cap`, 800) counted from today's cache rows, so every backend process shares it.
- **Private stops:** adding a result that isn't one of Vromon's places makes the traveller's own `places` row: `listed = false`, `owner_user_id`, source `poi` / `geocode` / `pin` / `restaurant` / `hotel`, a 60-minute visit, cost unknown, hours unknown (a restaurant's known hours are kept), checked only for Vromon's restaurants and hotels. The same result added again is reused. Road data between it and the day's stops is asked for **before** the request writes anything (on SQLite the road cache saves on its own connection and would wait for the request's lock).
- **Never offered to anyone else:** every query that offers places filters `listed = true`: the planner's candidates and the day's suggestions, destination places and counts, `/places` and recommendations, must-see checks, road preparation, chat place cards and room suggestions; the data platform's publish (demo hiding) and tidy, and the destination file sync, leave private rows alone. `GET /places/{id}` of a private place: its owner and the trip room's joined members, else 404. The AI budget and "More about this place" never send a private stop's name to the language model.

| Endpoint | What it does |
|---|---|
| `GET /trips/{id}/days/{day_id}/search?q=&near_item_id=&limit=&part=` | Owner only. Grouped results (`vromon`, `nearby`, `other`, `addresses`) with source, kind, distance and `checked`; `part=places` is fast and says whether `addresses_wanted`; `part=addresses` asks the geocoder (`geocoder`: used / cached / wait with `retry_after` / capped / off / unavailable) |
| `POST /trips/{id}/days/{day_id}/items` | Exactly one of `place_id`, `poi_id`, `geocode` (a result's token), `restaurant_id`, `hotel_id`, `pin {lat, lon, name}`; a place of another destination is fine when the day can reach it (80 km) |
| `POST /places/{id}/suggest` | The owner's private stop goes to the data platform's review queue (`new_entity`, entity type `app_place`, its name, place, kind and source; no user id); once while open |

## Rate your trip (docs/trip-upgrades, step 7)

Code: `app/services/reviews.py`, the `trip_reviews` and `review_items` tables (migration `0035`), the trip endpoints; in the app `src/features/trips/review/` and `app/trip/review/[id].tsx`. Decisions D7–D9:

- **When:** from the trip's first day, and any time after (D7); before it, 409 with the date. `today` is the phone's local date (`viewer_today`: within a day of the server's).
- **Who:** the owner and each joined member of the trip room, each with their own review (D8). Anyone else, a friend who can read the trip included, gets 404. No endpoint returns someone else's review (D9).
- **What:** five stars (`rating`, 1–5, null while only things one by one are rated) and an optional comment (280 characters); things one by one, each `good` or `bad` with an optional comment (280). The things come from the plan (`reviews.things`):
  - getting there: the route's first city to the destination, by the arrival stop's mode, keyed by that `trip_stops` row;
  - each day's places and meals at a restaurant (own food and meals where you stay aren't rated), keyed by the place or restaurant and the itinerary item;
  - hotels (one per hotel, with its nights) and stays with family or friends. A home is named only for the owner (D2); others see "With family or friends".
- **Saving** (`PUT`): partial. The rating and the comment change only when sent (null clears them). Each thing sent is set, or cleared with a verdict of null. The others are left alone. A thing that isn't in the plan is refused (422). `item_id` is a plain number, so a verdict follows its place or restaurant when the day is re-planned.
- **Deleting:** with the account (`reviews.delete_for`, a member's reviews in friends' rooms too) and with the trip. The ORM deletes the rows, since SQLite here doesn't enforce `ON DELETE CASCADE`. `/me/export` lists them (`trip_reviews`).
- **In the app:**
  - **"How was your trip?"** sits below "Rate this plan", from the first day, for the owner and room members. One tap on a star saves; then a summary with Edit and "Rate things one by one".
  - **The list:** "Mark all good / bad" sets every thing not rated yet; Save sends only the changes, and leaving with changes asks first (`usePreventRemove`). After Save the screen stays and says "Saved": going back in the same moment the guard switched off crashed react-native-screens.
  - **The Trips tab:** asks once, from the day after a trip ends, for two weeks, unless it's rated. "Not now" is kept on the phone (`rateReminderDismissed` in the preferences store).

| Endpoint | What it does |
|---|---|
| `GET /trips/{id}/review?today=` | Your review (or null) and the things to rate with your verdicts and comments |
| `PUT /trips/{id}/review?today=` | `{rating?, comment?, items?: [{target_type, target_id, item_id, verdict: good / bad / null, comment?}]}`; returns the same as `GET` |

## Deployment shapes

- **Local dev:** SQLite, `uvicorn --reload`, Expo Go on a phone.
- **Docker Compose:** PostgreSQL 16 (pgvector image) plus the backend image (`backend/Dockerfile`). Verified end to end.
- **Hosted:** see [deployment.md](deployment.md). The steps are documented but not executed from this repository.

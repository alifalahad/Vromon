# Friends and Chat: Step-by-Step Plan

**Mockups:** https://claude.ai/artifact/88qidwV6NKUSdmUofjXKg1 (11 screens on one canvas)
**Area:** the Friends tab (`mobile/app/(tabs)/friends.tsx`), a friend's profile, the trip screen, Settings
**Written:** 2026-10-27, against commit `89ec2fd` plus the uncommitted map-home and "Where to?" work

## Status

| Step | Status | Report |
|---|---|---|
| 0 Test accounts, audit, decisions | ✅ done 2026-10-27 | [step-0-report.md](friends-chat/step-0-report.md) |
| 1 Backend: conversations and text messages | ✅ done 2026-10-27 | [step-1-report.md](friends-chat/step-1-report.md) |
| 2 Backend: live updates (WebSocket) | ✅ done 2026-10-27, including through the share's tunnel | [step-2-report.md](friends-chat/step-2-report.md) |
| 3 App: Friends tab and chat | ✅ done 2026-10-27, including the friends' APK through the share | [step-3-report.md](friends-chat/step-3-report.md) |
| 4 Sharing: trip, place, trip idea, poll | ✅ done 2026-10-28 | [step-4-report.md](friends-chat/step-4-report.md) |
| 5 Reactions, replies, safety, Chats and privacy | ✅ done 2026-10-28 | [step-5-report.md](friends-chat/step-5-report.md) |
| 6 "On the road" and trips together | ✅ done 2026-10-29 | [step-6-report.md](friends-chat/step-6-report.md) |
| 7 Trip rooms: plan together | ✅ done 2026-10-29 | [step-7-report.md](friends-chat/step-7-report.md) |
| 8 On the trip: check-ins, running late, live location (photos later, C5) | ✅ done 2026-10-29 | [step-8-report.md](friends-chat/step-8-report.md) |
| 9 Notifications | ✅ done 2026-10-29 (push waits for Firebase) | [step-9-report.md](friends-chat/step-9-report.md) |
| 10 Hardening and the full check | ✅ done 2026-11-01 (Maestro 14/14 on the phone; owner tasks left: Firebase/EAS, the sign-out decision) | [step-10-report.md](friends-chat/step-10-report.md) |

## How to use this file

Run one step per session. Paste the step's **Prompt** block into the coding agent. The agent reads section 5 ("Rules for every step") first, builds the step, checks it, writes `docs/friends-chat/step-N-report.md`, and stops. Check the step on your phone, then approve it or ask for fixes before you start the next one.

The test accounts, and how to check things safely, are in section 6.

---

## 1. The idea

Friends in Vromon can already see each other's maps, trips and photos, and compare maps. What they can't do is **talk about a trip**. Today a Bangladeshi friend group plans a trip in WhatsApp or Messenger, and the plan gets lost in the scroll. Vromon's chat is chat **that knows about trips**: anything you share is a live card you can act on, and every trip can have its own room.

**Three things, nothing more:**

| | What | Why it matters |
|---|---|---|
| **Chat** | One-to-one with friends, in English or Bangla. Reply, react, "typing…", read ticks | Only friends can message you, so there is no spam and no strangers |
| **Share** | A trip plan, a place, a trip idea ("who's in?"), a poll, a photo, "I'm here" | Cards open the real thing in Vromon and act in one tap: *Want to go*, *Add to a trip*, *Copy the plan*, *Plan this trip* |
| **Trip rooms** | A group chat per trip: the plan pinned on top, suggestions the owner adds to a day in one tap; on the day itself, check-ins, "running late" and live location for a set time | Planning together without losing the plan in the scroll |

**What we keep from other apps, and how we change it:**

| From | Idea | Vromon version |
|---|---|---|
| WhatsApp, Messenger | Bubbles, ticks, reply, reactions, typing | The same basics, quieter. One extra reaction, **Want to go**, which also adds the place to your Want list |
| WhatsApp polls | Polls in a chat | Polls for dates and choices, plus a fixed **Trip idea** card: *I'm in / Maybe / Can't*. **Plan this trip** opens the trip wizard and invites the people who are in |
| Troupe | Group decisions per trip | A **trip room** per trip, made from the trip. A suggested place becomes a stop on a chosen day in one tap |
| Wanderlog | Shared itinerary | Members see the plan; in this plan only the owner changes it, and members suggest |
| Polarsteps | Friends follow where you travel | An **On the road** strip: friends who are on a trip now or soon (with a setting to hide yours) |
| Google Maps | Location sharing for a set time | **Live location** only in a trip room, only on the trip's days, for 15 min, 1 h or until the end of the day, with a banner and Stop |
| Nobody | Today mode in a group | **Running late** from Today mode posts to the trip room |

**Not in this plan** (later, if ever): chats with people who aren't friends, groups not tied to a trip, voice or video calls, voice notes, editing sent messages, end-to-end encryption, splitting costs, public links for people without the app, searching messages.

---

## 2. Design spec (from the mockups)

The mockups use the app's own tokens (`mobile/src/ui/theme/tokens.ts`), dark theme. **Names, places, numbers and times in them are samples**: everything in the app comes from the API (rule 2).

| Screen | Mockup |
|---|---|
| Friends tab: segment **Chats · Friends**, requests row, **On the road** strip, chat list, compose button | 1 |
| Friends segment: requests with Accept/Decline, friends with a Message button, invite card | 2 |
| A friend's profile: **Message** + Compare maps, their divisions map, **Trips together**, their trips | 3 |
| No friends yet | 4 |
| Chat: trip idea card, place card with a reaction, Bangla text, trip plan card, read ticks, typing | 5 |
| **Share with…** sheet: Trip, Place, Trip idea, Poll, Photo, I'm here; your trips; your Want list | 6 |
| Press and hold: reactions + **Want to go**; Reply, Add to a trip, Show on the map, Copy the name, Report | 7 |
| Chats and privacy (Settings) | 8 |
| Share a trip: **Plan together** / Send a copy, friend picker (who said "I'm in" first), note | 9 |
| Trip room while planning: pinned plan, poll, a suggestion with **Add to Day 2**, system lines | 10 |
| Trip room on the day: live-location banner, check-in, photos, live location card, "running late", quick chips | 11 |

**New tokens** (dark / light; add both to `contrast.test.ts`):

| Token | Dark | Light | Use |
|---|---|---|---|
| `bubbleMine` | `#2D6AE3` (= `accentStrong`) | `#2563D9` | Your text bubbles, white text. Never `accent` (#3379F3): white on it is 4.1:1 and fails AA for 16 px text |
| `bubbleTheirs` | `surface` `#333333` | `surfaceInset` `#E8E8EA` | Friends' bubbles |
| `cardMine` / `cardMineText2` | `#2B3B5C` / `#C9D6EE` | `#E3EBFA` / `textSecondary` | Cards you sent |
| `senderNames` | 6 colours, each 4.5:1 on `surface` (e.g. `#7FD6BE`, `#D7A6F0`) | 6 darker ones | Names above bubbles in trip rooms; also shown with the avatar, so colour is never the only signal |

- **Filled buttons and badges with white text use `accentStrong`.** Only one filled blue button per screen.
- **Bubbles:** radius 20, with the tail corner 6 (bottom-right yours, bottom-left theirs). Text 16/22. Time 11, inside the bubble, bottom-right. Group a run of messages from one person within 3 minutes and show the time once.
- **Cards:** 280–292 wide, radius 20, a 11/700 uppercase eyebrow ("TRIP PLAN", "TRIP IDEA", "POLL", "SUGGESTED FOR THE PLAN"), title 17/600, one grey line, then at most two buttons (38 high, pill).
- **Locator maps** on trip, idea and room cards reuse `src/features/trips/new/LocatorMap.tsx` (the chosen-destination card in the trip wizard).
- **Day separators:** a centred pill (Today, Yesterday, then "Mon 2 Nov"). **System lines** ("Nusrat joined", "You added Madhabpur Lake to Day 2") are centred, 12 px, no bubble.
- **Read ticks:** one tick sent, two ticks read (in `link` colour). A failed message shows a danger icon on that bubble and "Tap to retry", not a toast.
- **Composer:** + (share sheet), the text field ("Message", or "Message the trip room"), Send. 44 high.
- **Bangla:** message text uses the system font with Noto Sans Bengali as the fallback; dates and counts follow the app language (Bangla digits in Bangla).
- **Motion:** new messages slide up 8 px and fade in (160 ms); nothing else moves. Respect `useReduceMotion`.

---

## 3. How it works

### 3.1 Data (Alembic migrations from `0015`)

| Table | Columns (main ones) | Notes |
|---|---|---|
| `conversations` | `id`, `kind` (`direct`/`trip`), `direct_key` (unique, "smallerId:largerId"), `trip_id` (unique, FK trips ON DELETE CASCADE), `last_message_id`, `created_at`, `updated_at` | One direct conversation per pair; one room per trip |
| `conversation_members` | `conversation_id`, `user_id` (PK together), `role` (`owner`/`member`), `last_read_message_id`, `muted_until`, `cleared_up_to_id`, `joined_at` | "Delete chat" for one person sets `cleared_up_to_id` (messages up to that id are hidden for them); nothing is deleted for the others |
| `messages` | `id` (orders everything), `conversation_id`, `sender_id` (null for system lines), `client_id` (unique per sender, for retries), `kind`, `body` (≤ 2,000 chars), `payload` (JSON), `reply_to_id`, `created_at`, `deleted_at` | `kind`: text, trip, place, idea, poll, photo, checkin, live_location, system. Unsend clears `body` and `payload` and sets `deleted_at` |
| `message_reactions` | `message_id`, `user_id` (PK), `reaction` (heart, thumbs_up, laugh, wow, want) | One reaction per person per message |
| `poll_votes` | `message_id`, `user_id`, `option_id` | Polls and trip ideas (options in/maybe/out) |
| `trip_members` (step 7) | `trip_id`, `user_id`, `role`, `status` (`invited`/`joined`), `invited_by`, `created_at` | Owner + members of a trip room |
| `live_locations` (step 8) | `conversation_id`, `user_id`, `lat`, `lon`, `accuracy_m`, `updated_at`, `expires_at` | The latest point only, never a history; deleted on Stop or expiry |
| `message_reports` (step 5) | `id`, `message_id`, `reporter_id`, `reason`, `note`, `snapshot` (JSON), `created_at`, `status` | The snapshot keeps the reported content even if it's unsent |
| `user_settings` (+ columns) | `read_receipts`, `notify_messages`, `notify_trip_rooms`, `notification_previews`, `share_trips_with_friends` | All default `true` |

**Cards keep a snapshot** in `payload` (title, dates, counts at the time of sending) plus the id of the real thing. Opening a card always checks access again; if the trip or place is gone or no longer visible, the card says "No longer available".

### 3.2 API (under `/api/v1`, all signed in)

| Method and path | What |
|---|---|
| `GET /conversations` | My chats: the other person or the trip, last message preview, unread count, muted. Newest first |
| `POST /conversations/direct` `{user_id}` | Get or create the chat with a friend |
| `GET /conversations/{id}/messages?before=&after=&limit=` | Messages with reactions, my vote and reply previews |
| `POST /conversations/{id}/messages` `{client_id, kind, body?, payload?, reply_to_id?}` | Send. The same `client_id` twice returns the first message |
| `POST /conversations/{id}/read` `{message_id}` | Read up to here (only moves forward) |
| `DELETE /conversations/{id}/messages/{mid}` | Unsend, sender only, within 1 hour |
| `PUT` / `DELETE /conversations/{id}/messages/{mid}/reaction` | Set or remove my reaction |
| `PUT /conversations/{id}/messages/{mid}/vote` `{option_ids}` | Vote in a poll or answer a trip idea |
| `PATCH /conversations/{id}/me` `{muted_until?, cleared_up_to_id?}` | Mute, or clear the chat for me |
| `POST /messages/{mid}/report` `{reason, note?}` | Report |
| `GET /me/friends/on-the-road` | Friends on a trip now or within 14 days (step 6) |
| `POST /trips/{id}/members`, `POST /trips/{id}/members/me/join`, `DELETE /trips/{id}/members/{user_id}` | Invite, join, leave or remove (step 7) |
| `POST /trips/{id}/suggestions/{mid}/accept` `{day}` | The owner adds a suggested place to a day (same code as `POST /trips/{id}/days/{day_id}/items`); posts a system line (step 7) |
| `POST /trips/{id}/copy` | Copy a trip you can see into your own trips (step 4) |
| `WS /ws` | Live updates (step 2) |

### 3.3 Live updates

- One WebSocket per signed-in app, at `/api/v1/ws`. The first message must be `{"type":"auth","token":"<Supabase access token>"}` within 5 s, or the server closes with 4401. **No token in the URL** (URLs end up in logs).
- After a write commits, the server sends events to every member's open sockets: `message.created`, `message.updated` (unsend, reactions, votes), `conversation.read`, `conversation.updated`, `typing`, `live_location`.
- Typing is ephemeral: the app sends `{"type":"typing","conversation_id":…}` at most every 3 s while typing; nothing is stored.
- The server pings every 25 s (Render advises ping/pong; it has no fixed limit on socket length but closes them on deploys, with a 30 s grace period). The app reconnects with backoff (1, 2, 4 … 30 s) and when it comes back to the foreground, then fetches what it missed with `after=<last id>`.
- The hub is in memory, which is right for one server process. With more than one instance, add Postgres `LISTEN/NOTIFY` (Supabase Postgres has it). Write the hub behind a small interface so that swap is local.
- If the socket can't connect, the app polls: the chat list every 20 s while the Friends tab is open, and the open chat every 10 s.
- Cloudflare quick tunnels (`scripts/share/start.sh`) carry WebSockets, so friends using the shared APK get live chat too.

### 3.4 Privacy and safety rules (enforced on the server)

1. **Only accepted friends** can open a direct chat or send into one. A trip owner can invite only their own friends to a trip room; inside a room, members who aren't friends with each other see each other's name and avatar, nothing more.
2. **Unfriend:** the direct chat stays, read-only, with "You're no longer friends". **Block:** the chat disappears for the blocker; the blocked person can't send; neither sees anything new. Messages from someone you blocked are hidden for you in trip rooms too.
3. A stranger, or an ex-member, gets **404** for anything about a conversation (as the friends privacy matrix does today).
4. Messages are stored on our server: encrypted in transit (TLS) and at rest by the database provider, **not end-to-end encrypted**. The privacy policy (`docs/legal`) says so in plain words.
5. Limits: 2,000 characters a message, 30 messages a minute per user, polls with 2–6 options of up to 80 characters.
6. **Your data:** `/me/export` includes the messages you sent and the chats you're in. Deleting the account deletes your messages; system lines about you then say "a deleted account".
7. **Live location** only in trip rooms, only on the trip's days, only after you start it, for a set time, with a banner while it runs; only the latest point is kept, and it is deleted when sharing ends.
8. **Read receipts are mutual:** turn yours off and you don't see others'.
9. Push previews follow the setting: with previews off, a notification says only who wrote.

---

## 4. Decisions (answered by the owner on 2026-10-27, step 0)

| # | Question | Answer |
|---|---|---|
| C1 | Can trip-room members change the plan? | **No: members suggest, the owner adds** |
| C2 | Unsend for everyone: how long? | **1 hour** |
| C3 | Show "On the road" (your current and coming trips) to friends by default? | **Yes, with a setting to turn it off** |
| C4 | Live location in this plan? | **Yes, step 8, trip rooms only** |
| C5 | Photos in chat in this plan? | **Later**: not in step 8. Mockup 11's photo bubble and "Photos" chip are out of scope |

Two more questions came out of the audit; step 0's report recommends answers, to confirm in the step that needs them:

| # | Question | Recommendation | Step |
|---|---|---|---|
| C6 | The Want list holds countries, divisions and cities, not attractions. What does **Want to go** do on an attraction card? | **Confirmed by the owner in step 4:** mark its destination's division as Want (unless it's already on the map), and offer *Add to a trip* for the attraction itself | 4–5 |
| C7 | Does turning off "show my trips" also hide your trips on your profile? | **Confirmed by the owner in step 6:** yes, one setting hides your trips everywhere friends see them (a trip you send in a chat still opens) | 6 |

---

## 5. Rules for every step

1. Read `mobile/AGENTS.md`, `docs/architecture.md`, `docs/technology-decisions.md` and this file first. Routes stay in `mobile/app/`. Never hand-edit `android/`.
2. **No fake data in the app.** The mockups' names and numbers are samples. Every value comes from the API. If something has no source yet, hide it; never show a made-up value.
3. **Privacy is enforced on the server** (section 3.4). Every new endpoint gets tests for: member ✓, friend who isn't a member → 404, stranger → 404, blocked → 404 or 403 as specified, unfriended → read-only.
4. **Every string goes through i18n, in English and Bangla.** Bangla uses Bangla digits.
5. **Accessibility:** 48 dp touch targets; labels on icon buttons; AA contrast (new tokens in `contrast.test.ts`); every gesture has a non-gesture route (press-and-hold menus are also reachable through an accessibility action); a new message is announced politely, typing at most once.
6. **Test on the USB phone, never an emulator.** Writes only as the test accounts (section 6). The owner's own account (`alifalahadxi@gmail.com`) is for read-only checks, behind the read-only proxy.
7. Before you report a step as done, run `npm run typecheck && npm run lint && npm test` in `mobile/`, and `pytest -q` in `backend/` if the backend changed. New Alembic migrations must pass `tests/test_migrations.py`.
8. Do not commit, push or open a PR unless asked.
9. End with `docs/friends-chat/step-N-report.md`: what changed, which files, how each part was verified (test, API, phone), and what is left open. Update the Status table above. Then **stop**.

---

## 6. Test accounts and how to check safely

**Accounts:** `.env.e2e.local` at the repo root, which git ignores. Keep it out of `mobile/`: Metro bundled it from there and the dev app failed to load. Never copy passwords into docs, reports, commits or screenshots.

| | Username | Use |
|---|---|---|
| A | `e2e.ana` | Signed in **on the phone** for anything that writes |
| B | `e2e.bob` | The friend on the other side, **driven over the API** from the Mac |
| You | `alifalahadxi@gmail.com` | Read-only checks only, through the read-only proxy |

- A and B have been friends since 2026-10-22, so chat works between them straight away.
- **B's password** was set on 2026-10-27 in step 0, with the owner's OK. If it's ever lost, ask the owner before resetting it: the reset uses the Supabase Admin API with the service key from `backend/.env` (`PUT {SUPABASE_URL}/auth/v1/admin/users/{E2E_B_SUPABASE_ID}` with `{"password": …}`), and the new password goes into `.env.e2e.local`.
- **Tokens:** sign in with the password grant and the anon key from `mobile/.env`: `POST {SUPABASE_URL}/auth/v1/token?grant_type=password`. Step 0 adds `scripts/e2e/session.py A|B`, which prints a fresh access token (Maestro's `FRIEND_TOKEN`).
- **One phone, two people:** the phone is signed in as A. B's side runs from the Mac with `scripts/e2e/chat_as.py` (step 3): send a message, react, vote, start typing. That is how live updates are checked on a single phone.
- **The phone is the owner's real phone and gets real calls.** Before every adb tap or keypress, check that `adb shell dumpsys window | grep mCurrentFocus` shows the Vromon app, and that `adb shell dumpsys telephony.registry` reports `mCallState=0`. Send one input, then take a screenshot. Never chain taps across screens: a second tap where "Next" was can land on "Build plan" and create a real trip.
- **`scripts/dev/phone.sh`** (step 3) does those checks before every tap, swipe, key or character, and stops (exit 3) when something else is in front, such as Android's autofill popup over a sign-in field. Saving code can reload the app, so take a fresh screenshot after any edit before the next tap.
- **Switching the phone to A signs the owner out everywhere.** The app's Sign out uses supabase-js's default `scope: 'global'`, which ends every session of that account, including the friends' APK on the same phone (found in step 3). Tell the owner before signing their account out, and remind them to sign in again afterwards.
- **Read-only checks on the owner's account:** run `python3 scripts/dev/readonly_proxy.py` (it listens on 8011), then `adb reverse tcp:8001 tcp:8011`. Undo afterwards with `adb reverse tcp:8001 tcp:8001`. The proxy blocks every HTTP write and prints what it blocked. WebSockets don't pass through it, so live updates are checked as A, never on the owner's account.
- **Running the app:** see `docs/running-locally.md`. Backend on 8001 (`backend/venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8001`), Metro with `npx expo start --dev-client --clear`, `adb reverse` for 8081 and 8001. USB reconnects drop `adb reverse`.
- **Maestro:** flows live in `mobile/.maestro`; new ones are `11-chat.yaml` and `12-trip-room.yaml`, added to `flowsOrder` in `config.yaml`. Pass A's email and password, plus B's username, friend code and token (`-e EMAIL=… -e PASSWORD=… -e FRIEND_USERNAME=… -e FRIEND_CODE=… -e FRIEND_TOKEN=… -e API_URL=http://127.0.0.1:8001`). Run Maestro in the background, and sign A out at the end (flow 99). On the owner's phone, where the friends' APK also answers the Metro link, add `-e DEV_CLIENT=false`.

---

## Step 0: Test accounts, audit and decisions (no app code)

**Prompt**
```
Read docs/friends-chat-plan.md (sections 1–6) and open the mockups link in it.
1. Test accounts (section 6):
   - Ask the owner for permission to set e2e.bob's password, unless they give it to you.
     With permission, set it with the Supabase Admin API and save it in .env.e2e.local.
   - Write scripts/e2e/session.py: `python3 scripts/e2e/session.py A|B` prints an access token for that account,
     using .env.e2e.local and the anon key from mobile/.env. Never print passwords.
   - Check that A and B can both sign in, are friends (GET /friends), and that git ignores .env.e2e.local.
2. Audit, with no app code:
   - the friends code: mobile/app/(tabs)/friends.tsx, app/friends/*, src/features/friends/*,
     backend/app/api/v1/endpoints/friends.py, schemas/friends.py, services/push.py, the Friendship/Block/Device models,
     require_viewer_can_see, /me/export and account deletion;
   - how trips are shared today (friends see trips read-only) and the duplicate endpoint;
   - Today mode's "running late" flow and its location use (app/trip/today/[id].tsx);
   - the photo pipeline and signed URLs.
   For each mockup screen, list what it needs, where that comes from today, and what is missing.
3. Ask the owner the decisions in section 4 (C1–C5) and record the answers.
Write docs/friends-chat/step-0-report.md and stop.
```
**Done when:** both test accounts sign in, the report maps every mockup element to a source or a gap, and C1–C5 are answered.

---

## Step 1: Backend, conversations and text messages

**Prompt**
```
Follow docs/friends-chat-plan.md, Step 1 (sections 3.1, 3.2, 3.4). Rules in section 5.
- Migration 0015: conversations, conversation_members, messages, message_reactions, poll_votes
  (poll_votes and reactions are used from steps 4–5, but create them now), plus user_settings.read_receipts.
  Constraints: one direct conversation per pair (direct_key), client_id unique per sender.
- Endpoints for text only: GET /conversations, POST /conversations/direct, GET/POST messages
  (cursor paging with before/after, newest last), POST read, DELETE (unsend within 1 hour), PATCH /me (mute, clear).
  Unread counts, last-message previews and ordering come from the server.
- Privacy matrix tests in the style of tests/test_friends.py (the act_as fixture): friend ✓, stranger 404,
  blocked, unfriended (read-only, 403 on send), ex-member 404, unsend by someone else 403,
  unsend after 1 hour 403, clear for me hides only for me.
- Rate limit: 30 messages a minute per user (slowapi, keyed by user id); 2,000-character limit (422).
- Include messages in /me/export; delete them with the account.
- Add a service function `post_system_message(conversation, event, data)` for later steps.
Document the API in docs/architecture.md.
```
**Done when:** `pytest -q` passes with the new privacy matrix, and A can send B a message with curl (tokens from `scripts/e2e/session.py`).

---

## Step 2: Backend, live updates

**Prompt**
```
Follow docs/friends-chat-plan.md, Step 2 (section 3.3).
- WS /api/v1/ws. Authenticate with the first message ({"type":"auth","token":…}) within 5 s, or close with 4401.
  Verify the token like get_current_user does. Put that check behind a function the tests can override,
  the way act_as overrides get_current_user.
- An in-memory hub (user id → sockets) behind a small interface (publish(user_ids, event)).
  Send events only after the database commit:
  message.created, message.updated, conversation.read (only if both people have read receipts on),
  conversation.updated, typing.
- Ping every 25 s. Clean up on disconnect. Limit typing to 1 event every 3 s per user per conversation.
- Tests with TestClient.websocket_connect:
  auth required, events reach members only, a blocked user gets nothing,
  typing isn't stored, reconnect + GET …/messages?after=<id> returns what was missed.
- Check by hand that the socket works through a Cloudflare quick tunnel (scripts/share/start.sh), then stop the share.
Record the hub design and the multi-instance plan (Postgres LISTEN/NOTIFY) in docs/technology-decisions.md.
```
**Done when:** the WebSocket tests pass, and a message sent with curl as B shows up as an event on A's socket within a second.

---

## Step 3: App, the Friends tab and chat

**Prompt**
```
Follow docs/friends-chat-plan.md, Step 3, and mockups 1, 2, 3, 4 and 5 (text only; cards come in step 4).
- Tokens from section 2 (bubbleMine, bubbleTheirs, cardMine, senderNames) in tokens.ts and contrast.test.ts.
- Friends tab: segment Chats · Friends (Chats first); the requests row (opens the Friends segment);
  the chat list (avatar, name, preview with an icon for the kind, time, unread badge, muted icon);
  a compose button opening a friend picker (app/chat/new.tsx).
  The Friends segment keeps today's requests and friends list and adds a Message button per friend.
  The empty state follows mockup 4.
  Leave the On the road strip for step 6.
- Chat screen app/chat/[id].tsx:
  - an inverted FlatList with day separators and grouping (section 2);
  - optimistic send with client_id and an outbox that survives restarts ("Waiting for network", then Tap to retry);
  - read ticks, the typing indicator and Android Back;
  - mark as read when visible.
  Header: avatar, name, and "On a trip · <place>" only if step 6 data exists (hide it until then).
- src/features/chat/socket.ts: connect after sign-in, reconnect with backoff and on foreground,
  apply events to the TanStack Query cache, poll when the socket is down (section 3.3).
- The Friends tab badge: unread chats + friend requests.
- A friend's profile gets a Message button (mockup 3).
- scripts/e2e/chat_as.py: act as account B from the Mac: send text, mark read, start typing, list conversations.
- Maestro 11-chat.yaml: A opens the chat with B, sends a message, then B replies through the API driver
  (runScript or a pre-step) and A sees it.
Phone check as A, with B driven from the Mac: send, receive live, typing, read ticks, offline send then retry,
TalkBack on the message list, Bangla text, and large fonts.
```
**Done when:** A and B chat live on the phone, the outbox survives airplane mode, and tests, lint and Maestro 11 pass.

---

## Step 4: Sharing, with trip, place, trip idea and poll cards

**Prompt**
```
Follow docs/friends-chat-plan.md, Step 4, and mockups 5, 6 and 9 ("Send a copy" only; "Plan together" is step 7).
Backend:
- Message kinds trip, place, idea, poll.
  Validate payloads and keep a snapshot (section 3.1); only share a trip the sender can see.
- PUT …/vote for polls and ideas (single choice unless the poll allows several).
- POST /trips/{id}/copy for any viewer who can see the trip
  (copies stops, preferences and must-dos; not photos, feedback or members).
App:
- Card components (TripPlanCard, PlaceCard, TripIdeaCard, PollCard) with the locator map (LocatorMap).
- Card actions: Open plan; Copy to my trips; Want to go (existing visits API); Add to a trip (pick a trip, then must-dos);
  I'm in / Maybe / Can't; Plan this trip (the trip wizard with the destination, then an invite to who's in, once step 7 exists).
  Cards whose target is gone say "No longer available".
- The share sheet from the chat's + (mockup 6), plus "Send to a friend" entry points on:
  the trip screen's menu, the place sheet and the destination screen.
  These use a friend picker and an optional note.
Tests: payload validation, the snapshot, access on open, vote rules, copy.
Phone check as A with B over the API: each card both ways, and every action.
```
**Done when:** every card type can be sent, opened and acted on, and nothing leaks to someone who can't see the trip.

---

## Step 5: Reactions, replies, safety, and Chats and privacy

**Prompt**
```
Follow docs/friends-chat-plan.md, Step 5, and mockups 7 and 8.
- Reactions: heart, thumbs up, laugh, wow, and want. Want also adds the place or destination to your Want list.
  A chip under the message shows counts; long-press the chip to see who reacted.
- Press and hold a message (mockup 7). Swipe right to reply, with a quote in the composer.
  For your own messages: Unsend (within 1 hour). For others': Report… with reasons.
  Everything is also reachable through accessibility actions.
- message_reports plus an admin list behind ADMIN_TOKEN (GET /admin/reports).
- Mute (1 h, 8 h, always); Delete chat for me; block and unfriend behaviour (section 3.4, rule 2) in the chat header menu.
- Settings → Chats and privacy (mockup 8):
  - read receipts (mutual);
  - message text in notifications;
  - notify me about messages, trip rooms and friend requests (replaces today's two friend toggles);
  - the live location explanation;
  - blocked people;
  - download my chats (part of /me/export);
  - delete all my chats.
Tests for every rule.
```
**Done when:** the safety rules hold in tests and on the phone, and the settings change what A and B see.

---

## Step 6: "On the road" and trips together

**Prompt**
```
Follow docs/friends-chat-plan.md, Step 6, and mockups 1 and 3.
- GET /me/friends/on-the-road: friends whose trip is today or starts within 14 days.
  Return the destination, dates and day N of M.
  Respect user_settings.share_trips_with_friends (new, default true; add it to Settings → Chats and privacy).
- The On the road strip on the Chats segment:
  a ring shows how far through the trip they are; a dashed ring means the trip hasn't started.
  Tapping opens the chat with that friend; long press opens their trip.
  Hide the strip when it's empty.
- The chat header line "On a trip · Sylhet, day 2", and the same chip on the profile.
- The profile's "Trips together" (trip rooms you share, from step 7; hide it until then) and "Their trips" (already there).
Privacy tests: the setting off hides the trip from the strip, the header and the profile chip; strangers get nothing.
```
**Done when:** A sees B's trip (made for the test as B over the API) in the strip and the header, and B's setting hides it.

---

## Step 7: Trip rooms, planning together

**Prompt**
```
Follow docs/friends-chat-plan.md, Step 7, and mockups 9 and 10. Use the decision on C1 from step 0.
Backend:
- trip_members (status invited/joined) and invites:
  - POST /trips/{id}/members (owner only; each person must be the owner's friend)
    creates the trip's conversation if needed, and posts an invite card in each direct chat;
  - join and leave; the owner can remove a member.
- require_viewer_can_see admits joined members for that trip (read-only).
- POST /trips/{id}/suggestions/{message_id}/accept {day}: the owner adds a suggested place to a day,
  through the same code as POST /trips/{id}/days/{day_id}/items (add a stop to a day), and posts the system line "You added X to Day N".
- System lines: invited, joined, left, removed, added to Day N, dates changed.
App:
- Share a trip → "Plan together" (mockup 9): the friend picker puts people who said "I'm in" to a matching trip idea first.
- The room (mockup 10): the pinned plan bar (opens the trip), polls, suggestion cards with Add to Day N / Not this time
  for the owner (members see "Waiting for <owner>"), names and avatars on bubbles, and system lines.
- The trip screen gets a "Trip room" button with an unread badge. Trips you joined appear in the Trips tab under "With friends".
- "Plan this trip" on a trip idea now builds the trip and invites everyone who's in.
Privacy tests: non-members get 404; ex-members lose access; only the owner accepts suggestions; members can't edit the plan.
Phone check as A (owner) with B as a member over the API, then the other way round.
```
**Done when:** A plans a trip with B in a room, B's suggestion becomes a stop on the chosen day, and B can't change the plan.

---

## Step 8: On the trip, with check-ins, running late and live location

**Prompt**
```
Follow docs/friends-chat-plan.md, Step 8, and mockup 11. Use decisions C4 and C5.
- "I'm here" (check-in):
  - one location reading through the existing location permission flow, snapped to the nearest stop of today's plan within 300 m;
  - otherwise "near <destination>". Raw coordinates are never shown;
  - the card says whether you were early or late against the plan.
- Running late: the Today screen's running-late flow (POST /trips/{id}/days/{day_id}/late) gets "Tell the trip room",
  which posts the message (with "Sent from Today").
- Live location (only if C4 = yes; section 3.4, rule 7):
  - start from the room's + sheet with 15 min, 1 h or until the end of the day;
  - foreground updates every 60 s (no background tracking in this step);
  - a banner with Stop on every Vromon screen while sharing;
  - the card shows a small map and the time left;
  - the server rejects points outside the trip's dates and deletes on Stop, expiry or leaving the room.
- Photos: not in this step (C5 = later). Leave them out of the + sheet and the chips.
- Quick chips over the composer during a trip: I'm here, Running late.
Tests: live location access (members only, trip days only, expiry) and the check-in snapping.
Phone check as A, with the device location from adb when needed.
```
**Done when:** on a test trip that runs today, A can check in, post running late from Today, and share and stop live location, and B sees each over the API.

---

## Step 9: Notifications

**Prompt**
```
Follow docs/friends-chat-plan.md, Step 9.
Owner tasks first (list them in the report if they aren't done):
- create a Firebase project and add google-services.json (GOOGLE_SERVICES_FILE);
- set EAS_PROJECT_ID;
- upload the FCM V1 service-account key to EAS.
Without these, push isn't delivered (docs/technology-decisions.md, Push), and the app must still be complete without it.
- Push for new messages, trip-room invites and suggestions accepted. Respect mute and every setting in Chats and privacy.
  With previews off, say only who wrote.
- Android channel "Messages"; one notification per chat, updated, not stacked.
  Tapping opens the chat (extend useFriendNotifications' safe path check to /chat/<id>).
- In the app: when a message arrives in a chat that isn't open, show a small in-app banner; the tab badge updates live.
Tests: the push payloads, the preview setting, mute, and that the tap paths are validated.
Phone check (if Firebase is set up): B sends over the API while A's app is in the background.
```
**Done when:** the settings are respected in tests and, with Firebase set up, a message from B wakes A's phone and opens the chat.

---

## Step 10: Hardening and the full check

**Prompt**
```
Follow docs/friends-chat-plan.md, Step 10.
- Performance:
  - a chat with 2,000 messages scrolls smoothly (measure with EXPO_PUBLIC_PERF_LOG=1);
  - paging works both ways;
  - the chat list stays fast with 100 chats.
- Reconnects: kill the backend mid-chat, restart it; airplane mode; the app in the background for 10 min.
  Nothing is lost or duplicated.
- Accessibility pass with TalkBack, the largest font and Bangla, on every screen from the mockups.
- Security review of every new endpoint and of the socket (auth, membership, rate limits, payload sizes, no token in URLs).
- Docs:
  - docs/architecture.md and docs/technology-decisions.md;
  - docs/feature-inventory.md (a "Friends and chat" section);
  - docs/legal (the privacy policy: chats are stored on our server, not end-to-end encrypted; live location and its limits);
  - docs/go-live.md (Render WebSockets, keepalive, one instance).
- Maestro: 11-chat and 12-trip-room in config.yaml; run the whole suite as A on the phone, then sign A out.
- A final read-only pass on the owner's account through scripts/dev/readonly_proxy.py: the Friends tab, a chat, Settings.
Update the Status table and write the report.
```
**Done when:** the full suite passes on the phone, the docs are updated, and the report lists anything left open.

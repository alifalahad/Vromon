# Friends and Chat · Step 2 report

**Date:** 2026-10-27 · **Plan:** [friends-chat-plan.md](../friends-chat-plan.md), step 2 · **Status:** done, backend only. One hand check is left to the owner: the Cloudflare tunnel (see "Not done").

## What was built

A live connection for chat: `WS /api/v1/ws`. The app signs in on it once, then gets each change the moment it's saved:
- new messages;
- unsent messages;
- read ticks;
- typing;
- "this chat changed, fetch it again".

The protocol, events and close codes are in [architecture.md](../architecture.md#live-updates-ws-apiv1ws-step-2); the design is decision 30 in [technology-decisions.md](../technology-decisions.md).

- **Signing in:** the token is the first message, within 5 s, never in the URL.
  - A bad, missing or expired token closes with 4401. The socket also closes when the token expires; the app reconnects with a fresh one.
  - When the sign-in service can't be reached, the close code is 1013, so the app retries instead of signing out.
- **Hub** (`app/services/live.py`):
  - in memory, by user, with one ordered queue and one writer per socket;
  - safe to publish from the endpoints' worker threads;
  - a socket that falls 256 events behind is closed (1013), and the app catches up with `after=<id>`.
- **Events:**
  - sent after the commit, and only to members who can see the chat (a blocker gets nothing from it);
  - rendered per person (only the sender's apps get `client_id`);
  - read ticks follow the mutual read-receipts rule;
  - typing is never stored, counts at most once every 3 s, and only from people who can write there.
- **New hooks:**
  - friendship accepted, removed, blocked or unblocked → `conversation.updated` to both people;
  - account deleted → `conversation.updated` to the partners, and that account's sockets close;
  - mute or clear → `conversation.updated` to your other apps.
- **Database:** a socket never holds a database session while it waits. It opens short ones from the same `get_db` as the HTTP routes.
- **Keepalive:** uvicorn's protocol pings every 20 s, plus `{"type": "ping"}` from the server every 25 s. The app can ping too and gets a pong.

## Files

- **New:**
  - `backend/app/api/v1/endpoints/live.py`
  - `backend/app/services/live.py`
  - `backend/tests/test_chat_live.py`
  - `scripts/e2e/live_check.py`
- **Changed:**
  - `backend/app/api/v1/router.py`
  - `backend/app/api/v1/endpoints/chat.py` (events after each change)
  - `backend/app/api/v1/endpoints/friends.py` (accept, remove, block, unblock)
  - `backend/app/api/v1/endpoints/me.py` (account deletion)
  - `backend/app/schemas/chat.py` (`MessageOut.of`, shared by HTTP and events)
  - `backend/app/services/chat.py` (`partners`)
  - `docs/architecture.md`, `docs/technology-decisions.md`, `docs/friends-chat-plan.md`

## How it was checked

- **New tests** (`tests/test_chat_live.py`, 15). They replace only the token check; the hub, the events and the privacy rules are real. To show nothing arrived, a test pings the socket and expects the pong next.
  - **Signing in:** the token has to come first and be valid; when it can't be checked the app is told to try again (1013, not 4401); an expired token closes the socket; pings work both ways; an oversized message closes it.
  - **Events:**
    - a message reaches both members (with `client_id` only for the sender) and not a friend outside the chat;
    - unsend and reads are live, read ticks stay mutual, and a repeated read sends nothing;
    - typing reaches the other person, is limited and is never stored;
    - **a blocked user gets nothing**;
    - unfriending and re-friending refresh both apps;
    - mute updates only your own apps;
    - deleting an account closes its sockets and updates the partner;
    - after a reconnect, `after=<id>` returns exactly the missed messages.
  - **Hub:** a socket that falls behind is closed; closed sockets leave the hub.
- **Stable:** the 15 ran **10 times in a row, all passing** (about 1 s each). One hang during development came from a mistake in my own test (it waited for an event sent before the socket opened) and was fixed.
- **Whole backend:** `pytest -q` → **597 passed, 9 skipped** (582 + 15). The same old warning.
- **With real accounts on the dev backend:**
  - `scripts/e2e/live_check.py` (ana listening, bob sending): the message arrived **8–28 ms** after bob started sending, over six runs. The goal was under one second.
  - A bad token was closed with 4401 at once, and a socket that sent nothing was closed with 4401 after 5.0 s, using the real token check, not the test one.

## The APK's path (production mode, as `scripts/share/start.sh` runs it)

The friends' APK reaches a production-mode backend (`APP_ENV=production`, port 8002) through a Cloudflare tunnel. I ran that backend locally with the new code, checked it, and then stopped it:
- **Live message:** `live_check.py http://127.0.0.1:8002` → A got B's message **10 ms** after B started sending, with the real Supabase token check (no dev shortcuts in production mode).
- **Today's APK keeps working:** with ana's real token, `/me`, `/me/settings`, `/friends`, `/trips`, `/destinations`, `/conversations` and `/friend-requests` all return **200**.
- **Quiet sockets stay open:** a socket that received nothing for 70 s got the server's pings at **25 s and 50 s**, stayed open, and then received a message. Cloudflare closes connections that are silent for about 100 s, so the 25 s ping keeps a quiet chat open through the tunnel.
- **No middleware in production mode affects WebSockets:** only CORS is configured.

## Through the Cloudflare tunnel (the real share)

The owner allowed `scripts/share/start.sh` and `cloudflared tunnel` in `.claude/settings.local.json`, and the share was started as the owner would start it:
- **The address file friends' apps read** (`share/config.json` on Supabase) pointed at the new tunnel.
- **Live chat through the tunnel:** `live_check.py https://<api tunnel>` → A got B's message **89–105 ms** after B started sending, over 3 runs. Most of that is the trip Mac → Cloudflare → Mac.
- **A bad token through the tunnel:** closed with **4401**.
- **A quiet socket through the tunnel:** silent for **130 s**, longer than Cloudflare's roughly 100 s limit. The server's pings came at 25, 50, 75, 100 and 125 s; the socket stayed open, and the next message arrived.
- **The friends' APK on the owner's phone:** it was already the 2026-10-27 build (its checksum matches `scripts/share/apk/vromon.apk`). I opened it with `am start`, with no taps and no call in progress. It showed the new map, and its start made 9 requests through the share (`/me`, `/me/settings`, `/users/<id>/visits`, `/users/<id>/stats`, `/me/trips/stats`, `/trips`, `/friends`, `/friend-requests`, `/destinations`), **all 200**, all reads.

Nothing from step 2 is left to check. The APK has no chat screens yet (step 3), so it can't open the socket itself; the checks above use the same path it will.

## Notes for step 3 (the app)

- Connect after sign-in. Reconnect with backoff (1, 2, 4 … 30 s), when the app returns to the foreground, after a 4401 (with a fresh token; refreshing first if needed), and after 1013 (later).
- After `ready`, fetch each open chat with `after=<last id>` and refresh the chat list.
- If no `ping` arrives for about 60 s, treat the socket as dead.
- Send `typing` while the person types, at most every 3 s.
- `conversation.updated` → refetch that chat; a 404 means it's gone for you (for example, you blocked them).
- Messages are stored by id, so an event for a message the app already has (its own optimistic send, matched by `client_id`) replaces it rather than adding a copy.
- The test chat between e2e.ana and e2e.bob (chat 1) now has a few "Live check" messages from these runs.

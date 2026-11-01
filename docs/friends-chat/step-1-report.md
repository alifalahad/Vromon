# Friends and Chat · Step 1 report

**Date:** 2026-10-27 · **Plan:** [friends-chat-plan.md](../friends-chat-plan.md), step 1 · **Status:** done, backend only (no app changes)

## What was built

Direct chats between friends with text messages, on the server:
- open a chat with a friend (one per pair);
- send, list and page messages;
- unread counts and read ticks;
- unsend within an hour (decision C2);
- mute, and "delete chat" for yourself only;
- the privacy matrix from the plan's section 3.4.

The API and its rules are documented in [architecture.md](../architecture.md#chat-between-friends-docsfriends-chat-planmd); the design choices are decision 29 in [technology-decisions.md](../technology-decisions.md).

| Endpoint | |
|---|---|
| `GET /conversations` | Your chats with a visible message, newest first: other person, last message, unread count, `can_send` / `read_only_reason`, `other_read_up_to`, `muted_until` |
| `POST /conversations/direct` | Open the chat with a friend; anyone else 404 |
| `GET /conversations/{id}` | One chat |
| `GET` / `POST /conversations/{id}/messages` | Page with `before` / `after` / `limit` (oldest first, `has_more`). Send text: trimmed, 1–2,000 characters, idempotent on `client_id`, 30 a minute per user |
| `DELETE /conversations/{id}/messages/{message_id}` | Unsend your own message within 1 hour |
| `POST /conversations/{id}/read` | Read up to a message |
| `PATCH /conversations/{id}/me` | `muted_until` (null unmutes), `cleared_up_to_id` |

Also:
- `services.chat.post_system_message()` adds lines from Vromon itself, for later steps;
- `read_receipts` was added to `/me/settings`;
- chats are in `/me/export`, and `DELETE /me` removes your chat data.

## Files

- **New:**
  - `backend/alembic/versions/20261027_0015_chat.py`
  - `backend/app/api/v1/endpoints/chat.py`
  - `backend/app/services/chat.py`
  - `backend/app/schemas/chat.py`
  - `backend/tests/test_chat.py`
- **Changed:**
  - `backend/app/models/models.py` (5 chat tables, `UserSettings.read_receipts`)
  - `backend/app/api/v1/router.py`
  - `backend/app/api/v1/endpoints/me.py` (export, deletion)
  - `backend/app/core/rate_limit.py` (`user_or_ip`, `CHAT_SEND_LIMIT`)
  - `backend/app/schemas/accounts.py` (`read_receipts`)
  - `docs/architecture.md`, `docs/technology-decisions.md`, `docs/friends-chat-plan.md` (status, `cleared_up_to_id`)

## How it was checked

- **New tests** (`tests/test_chat.py`, 24): opening and sending, the privacy matrix, unsend, your own state, read receipts, paging, system lines, the per-user rate limit, and export.
  - **Privacy matrix:** a stranger can't open a chat; outsiders get 404 everywhere; after unfriending, the chat is read-only for both (403 on send); a blocker gets 404 while the blocked person sees "not friends"; a deleted account leaves a read-only chat without its messages, and the chat goes once both accounts are gone.
  - **Unsend:** your own message within an hour; not someone else's; not after an hour.
  - **Your own state:** clearing hides the chat for you only; clearing and reading only move forward; mute and unmute.
- **The rate-limit test can fail:** with the limit switched to per address, it fails (bob gets 429), so it really checks per user.
- **Whole backend:** `pytest -q` → **582 passed, 9 skipped** (558 before + 24). The skips are the PostgreSQL-only tests, as before. The one warning is the same as before.
- **PostgreSQL:** `tests/test_migrations.py` against a throwaway PostgreSQL 16 database on this Mac: **13 passed**, so migration 0015 builds exactly the model schema there too. The database was dropped afterwards.
- **With real accounts and curl** (dev backend on 8001, tokens from `scripts/e2e/session.py`):
  1. ana opened chat 1 with bob;
  2. ana sent "Hi Bob! Vromon chat, step 1 — চলো সিলেট যাই" → 201;
  3. bob's list showed the chat from e2e.ana with **unread 1** and that text;
  4. bob marked it read → 204;
  5. ana's view showed **`other_read_up_to` = 1** and `can_send: true`.
- **The dev database** (`backend/vromon.db`) was migrated to **0015** when the backend restarted. The migration only adds tables and a column, and the database was copied first: the copy is in this session's scratch folder, which a reboot clears. The only chat data in it is the test chat between e2e.ana and e2e.bob. Your own account wasn't used.

## Notes for later steps

- **Step 2 (live updates):** nothing is pushed to the app yet. Send, unsend and read must publish their events after commit.
- **Step 3 / 5 (app):** `PUT /me/settings` replaces every field, so once the app has a read-receipts switch, it must send `read_receipts` in every save. Otherwise saving another setting turns read receipts back on.
- **Step 7:** `services.chat.seat()` answers "not visible" for trip rooms until step 7 adds members and rules for them.
- **Other endpoints** still send naive UTC times (for example `friends_since`). Chat sends `+00:00`; the rest is unchanged.
- The API tests run on SQLite only (the shared test engine); PostgreSQL is covered for the migration, not for each endpoint.

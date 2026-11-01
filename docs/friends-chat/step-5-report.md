# Friends and Chat · Step 5 report

**Date:** 2026-10-28 · **Plan:** [friends-chat-plan.md](../friends-chat-plan.md), step 5 (mockups 7 and 8) · **Status:** done. Push for messages is step 9: the new notification switches are saved, but nothing sends message notifications yet.

## What was built

**Reactions, replies and safety in a chat** (mockup 7):

- **Press and hold a message** for its menu:
  - the reactions: heart, thumbs up, laugh and wow, plus **Want to go** on a place card or a trip idea;
  - then Reply, Copy, Add to a trip (an attraction), **Unsend** (your own message, within an hour, after asking) or **Report…** (someone else's).
  - In a read-only chat there are no reactions and no Reply, but Report… still works.
- **Reactions:**
  - you have one reaction per message; picking another replaces it, and picking yours again takes it back;
  - a chip under the message shows the counts; tap or hold it to see who reacted, and tap your own row to take yours back;
  - **Want to go** also puts the place on your Want list (an attraction or a trip idea's destination marks its division, as decided in C6);
  - reactions show at once and go back if the server refuses, with the reason.
- **Replies:** swipe a message right (or pick Reply). A bar above the message box shows what you're answering, and the sent message carries a quote of it.
  - A reply waiting offline already shows its quote.
  - A quote follows the same rule as the card it quotes: a trip card you can no longer see is quoted as "No longer available", and an unsent message as "Message removed".
- **Screen readers** get "Message options" and "Reply" as actions on each message (on a card, on its heading).
- **Report…** opens a screen with five reasons (spam, harassment, inappropriate, scam, something else) and an optional note.
  - The report keeps a copy of the message, so it can still be looked at after an unsend. Reporting it again changes nothing, and the person isn't told.
  - Reports are listed at `GET /admin/reports`, behind `ADMIN_TOKEN`.
- **The chat's ⋮ menu:**
  - Mute (1 hour, 8 hours, until you turn it back on) and Unmute; a muted chat shows a crossed-out bell next to the name;
  - View profile;
  - Delete chat for me (after asking; the other person keeps it);
  - Unfriend (while you're friends);
  - Block (after asking; then the chat closes).

**Settings → Chats and privacy** (mockup 8), from a new row in Settings, replaces the Settings tab's two friend notification switches. Everything is saved to the account.

| Setting | What it does |
|---|---|
| Read receipts | Mutual: with them off, friends don't see when you've read their messages, and you don't see theirs |
| Messages, Trip rooms, Friend requests | Which notifications you get. "Friend requests" covers requests and accepted ones (the two old switches) |
| Show message text | With it off, a notification only says who wrote |
| Live location | Explains when it's shared: only in trip rooms, only while you share it, and only the latest point is kept (it arrives in step 8) |
| Blocked people | The existing list |
| Download my chats | The data export, which includes your chats |
| Delete all my chats | Every chat emptied for you, after asking; the other people keep theirs |

**Backend:** the endpoints are listed in [architecture.md](../architecture.md#reactions-replies-and-safety-step-5). In short:

- `PUT`/`DELETE …/reaction`, `reply_to_id` on send, `POST /messages/{id}/report`, `GET /admin/reports` and `POST /me/chats/clear`;
- migration `0016` adds `message_reports` and three settings columns;
- `cards.render` adds reactions and quotes for each viewer, so they follow the same access checks as cards and change live through `message.updated`;
- deleting an account also deletes the reports it made and the reports about it.

## Found and fixed during the phone check

1. **A dialog shown while a screen closed froze the screen's picture.** After sending a report, a "Thanks" dialog opened while the app went back to the chat. Android then stopped redrawing the chat, but it still took touches.
   - The next sheet (the ⋮ menu) opened invisibly, and a tap meant for + landed on its hidden **Block** row. The Block question came up and was cancelled; nothing was blocked.
   - Now the report screen closes first, and the chat says "Report sent. Thanks for telling us." in its own message bar. Checked on the phone: the menu draws normally after a report.
   - **Send to a friend** (step 4) had the same pattern when sending to several friends. It now goes back only after its "Sent" dialog is closed.
   - **Correction (2026-10-29, step 6):** the same stale picture came back in step 6 with no dialog involved. On this phone, `adb screencap` can return an old frame until something reads the screen's views. So the menu was probably on the real screen all along, and only my screenshots were stale; the app may never have stopped redrawing. The change above is still sound: the message bar is a better place for "Report sent". The real lesson is to never tap from a screenshot that might be stale: `scripts/dev/phone.sh shot` now reads the views first, which makes the picture current.
2. **The Chats and privacy notes crowded the next heading,** and "With it off, a notification only says who wrote" sat under "Push isn't set up" instead of under "Show message text". The spacing is fixed, and the push note is now the first row of Notifications.

## How it was checked

- **Backend:** `tests/test_chat_safety.py` has 15 new tests, and `pytest -q` gives **653 passed, 9 skipped**. They cover:
  - reactions: one each, want only on places and ideas, none on unsent messages or Vromon's lines, live updates;
  - replies: in the same chat only, not to cleared, unsent or system messages, and a quoted trip card checked for each viewer;
  - reports: not your own, kept after an unsend, once each, admin token required;
  - delete all my chats, account deletion, and the settings round trip.

  **To show the quote rule is tested, I broke it on purpose** (quotes showing the card as stored): the leak test fails. With the rule back, all 15 pass.
- **App:** `tsc` and `expo lint` are clean, and Jest has **514 tests in 52 suites**:
  - `chatSafety.test.tsx` (22) drives the real chat, report and settings screens: reactions (with want), who reacted, swipe and screen-reader replies with quotes, Unsend within the hour only, Report…, read-only chats, the ⋮ menu (mute, always, unmute, delete for me, block, unfriend), the "Report sent" message, and every Chats and privacy switch;
  - `settingsSync.test.ts` gained 2 tests: the chat settings come from the account, and every save carries all of them. The second guards against a bug fixed during this step, where any settings save turned read receipts back on;
  - `chatShare.test.tsx` checks that Send to a friend goes back only after its dialog.
- **On the phone** (the owner's realme, dev build, as e2e.ana, with e2e.bob over the API through `scripts/e2e/chat_as.py`):

| Check | Result | Screenshot |
|---|---|---|
| Hold Bob's message: four reactions (no Want on text), Reply, Copy text, Report…; no Unsend | ✅ | [01](step-5/01-message-menu.png) |
| Ana's heart shows at once and reaches Bob live; Bob's laugh and his reply with a quote reach Ana live | ✅ | [02](step-5/02-reactions-and-reply-live.png) |
| The chip shows who reacted, with "Tap to remove" on Ana's own row | ✅ | [03](step-5/03-who-reacted.png) |
| Swipe right to reply: the bar shows the quote; Bob receives it as a reply to his message | ✅ | [04](step-5/04-swipe-to-reply.png), [05](step-5/05-reply-sent.png) |
| Ana's own message: Unsend asks first, shows "Message removed" at once, and Bob sees it removed | ✅ | [06](step-5/06-unsent.png) |
| Report… with a reason: in the admin list with a copy of the message; then "Report sent" in the chat (after the fix) | ✅ | [07](step-5/07-report.png), [10](step-5/10-report-sent.png) |
| ⋮ menu; Delete chat for me asks first (cancelled, to keep the test history) | ✅ | [08](step-5/08-chat-menu.png), [09](step-5/09-delete-for-me-asks.png) |
| Mute → For 8 hours: saved on the server (8 h ahead), bell shown; Unmute clears it | ✅ | [11](step-5/11-mute-choices.png), [12](step-5/12-muted.png) |
| Chats and privacy: read receipts off → Bob no longer sees Ana's reads, and Ana doesn't see Bob's; on → both back | ✅ | [13](step-5/13-chats-and-privacy.png) |
| Friend requests off and on: both friend notification settings change on the server | ✅ | |
| Block, Unfriend and Delete all my chats | not run on the phone | |

Block, Unfriend and Delete all my chats would end the friendship between the two test accounts or empty Ana's test history. Their rules are covered by pytest and Jest. Not run: Maestro (not required for this step).

## The friends' APK and the share

- **The share was restarted with step 5's backend.** The step 5 endpoints answer through the tunnel and refuse without sign-in or the admin token. New links:
  - APK: `https://potatoes-consist-luck-started.trycloudflare.com/vromon.apk`
  - API: `https://obviously-satisfactory-giant-age.trycloudflare.com` (the app finds it by itself)
- **The APK was rebuilt with step 5** (2026-10-28 20:09, 106,936,400 bytes). Its bundle was checked to contain step 5's text, including the "Report sent" fix, and the share serves it.
- **The first build failed: the Mac's disk was full** ("No space left on device", 4.4 GB free). I deleted only regenerable native build folders inside `mobile/node_modules` (`android/build`, and `android/.cxx/Debug` from the dev build), and the second build passed. Free space is now about 6.5 GB, which is too tight for the next native build. Gradle's cache (`~/.gradle/caches`, 9.9 GB) and anything else outside the project were left alone.

## For the owner

- **Install the new APK over the old one** from the link above, to get step 5. The app doesn't update itself.
- **The dev app on your phone is still signed in as e2e.ana.**
- **Free some disk space before the next APK build:** about 6.5 GB is left. Clearing `~/.gradle/caches` (9.9 GB, downloaded again when needed) is one option; that's your call.
- **Still open from step 3:** the sign-out scope, and the large-font check.

## Files

- **Backend:**
  - new: `alembic/versions/20261028_0016_chat_safety.py`, `tests/test_chat_safety.py`
  - changed: `app/models/models.py` (`MessageReport`, three settings columns), `app/schemas/chat.py` and `accounts.py`, `app/services/cards.py` (reactions, quotes), `app/services/chat.py` (account deletion), `app/api/v1/endpoints/chat.py`, `app/core/rate_limit.py`
- **App:**
  - new: `src/features/chat/MessageMenu.tsx`, `ReactorsSheet.tsx`, `reactions.ts`; `app/chat/report.tsx`, `app/settings/chats.tsx`; `src/features/account/exportData.ts` (the export, shared with Settings)
  - changed, chat: `app/chat/[id].tsx` (menus, replies, ⋮), `MessageBubble.tsx` (hold, swipe, quote, chip, screen reader actions), `Composer.tsx` (reply bar), `outbox.ts` (replies), `format.ts`, `state.ts` (`useChatNotice`), `cards/*` (screen reader actions on card headings), `cards/actions.tsx` (react, unsend)
  - changed, settings: `app/(tabs)/settings.tsx` (the new row, the old switches removed), `src/features/preferences/store.ts` and `sync.ts`
  - changed, shared: `app/_layout.tsx`, `app/share/send.tsx` (the dialog fix), `src/services/api.ts`, `src/types/index.ts`, `src/i18n/en.json`, `bn.json`
  - tests: `chatSafety` (new), `settingsSync`, `chatShare`
- **Scripts:** `scripts/e2e/chat_as.py` gained `react`, `reply`, `unsend`, `report` and `settings`.
- **Docs:** `docs/architecture.md`, `docs/feature-inventory.md`, `docs/friends-chat-plan.md`

## Notes for step 6

- **Test data:** chat 1 now has messages 51–54 from this check. Message 52 has a report (id 1), which is still open in the admin list. Message 53 is unsent.
- **Prefer a message on the screen underneath to a dialog while a screen is closing** (finding 1, and its correction).
- **The menus are ready for trip rooms:** `MessageMenu` takes its rows as a list, and `useChatCardActions` already has react and unsend.

# Friends and Chat · Step 3 report

**Date:** 2026-10-27 · **Plan:** [friends-chat-plan.md](../friends-chat-plan.md), step 3 · **Status:** done. Left to the owner: large fonts, and one decision about signing out (see "For the owner").

## What was built

Text chat between friends, in the app:
- **Friends tab:** Chats and Friends segments, the requests row, and a chat list with unread counts, read ticks and a compose button. The tab badge counts unread chats plus friend requests.
- **New message:** pick a friend (`app/chat/new.tsx`). A friend's profile and each row in the Friends segment have a Message button.
- **A chat** (`app/chat/[id].tsx`): day separators, runs of messages with the time and ticks on the last one, Bangla text, "typing…", read ticks, a read-only banner when you're no longer friends, and Android Back.
- **Live:** one socket per signed-in app (`socket.ts`, `useLiveChat.ts`). It reconnects with backoff, when the app comes back and when the network returns. When the socket is down, the open chat polls every 10 s and the list every 20 s.
- **Outbox** (`outbox.ts`): your message shows at once. Offline, it says "Waiting for network", survives restarts, and goes once the server is reachable. Its `client_id` means it can never be posted twice. Tapping a message that isn't sent offers Try again or Delete.
- **Offline:** chats are saved on the device with their newest 50 messages, so they open without a network.

How it fits together is in [architecture.md](../architecture.md#in-the-app-step-3).

## Found and fixed during the phone check

1. **The dev app wouldn't load.** Metro tried to bundle the test-accounts file, `mobile/.env.e2e.local`. It now lives at the repo root (`.env.e2e.local`, ignored by the root `.gitignore`), and the scripts read it there.
2. **Offline, the app forgot what it had saved.** A refresh that failed offline removed that data from the saved copy. After one offline session, the next offline start showed an empty map and "Couldn't load your account". This bug predates chat. Now the last good data is kept when a refresh fails for a temporary reason (offline, server down), and dropped only on a real "no" such as a 404 (`services/queryClient.ts`).
3. **Chats weren't saved for offline use.** They are now, trimmed to the newest 50 messages per chat. The whole cache is one AsyncStorage entry, and Android can't read back an entry over about 2 MB.
4. **A failed chat list said "No chats yet."** It now says "Couldn't load your chats." and offers Try again.
5. **Loading placeholders showed above saved chats** while friend requests were still loading. They now show only when there is nothing to show.
6. **A waiting message couldn't be tapped.** The plan asks for "Waiting for network", then "Tap to retry". Tapping now opens "Not sent yet: It sends by itself when you're back online", with Try again, Delete and Cancel. A refused message's dialog gives the server's reason, and screen readers no longer hear "Not sent" twice.
7. **TalkBack stopped twice on each message:** once on the bubble, and again on its selectable text. Now it stops once, on "Bob (E2E), 10:57 AM: …".
8. **The same person had different avatar colours** on different screens (blue on a profile, brown in chats). Every avatar now gets its person's colour.
9. **Message on a profile gave no feedback** until the server answered. A chat that's already in your list now opens at once, because there's one chat per pair and its id never changes. A new chat shows a spinner on the button.
10. **Maestro on this phone:** the launch subflow ignored `-e DEV_CLIENT=false`, so the Metro link opened an "open with" chooser (the friends' app answers that link too). Fixed. Flow 11 now also checks the Read tick, and closes the keyboard before Back.

## How it was checked

- **Jest:** 464 tests in 48 suites pass, 6 of them new tonight. The new ones cover offline saving (`offlineCache.test.ts`), the failed list, and retrying or deleting a waiting message. Running the offline test against the old saving rule fails, as it should. `tsc` and `expo lint` are clean.
- **Maestro 11** (`-e DEV_CLIENT=false`) **passed on the phone:** compose, pick bob, send, bob reads and answers through the API, the answer arrives live, the message says Read, Back to the chat list.
- **On the phone, as e2e.ana, with e2e.bob driven from the Mac** (`scripts/e2e/chat_as.py`):

| Check | Result | Screenshot |
|---|---|---|
| Chat list: bob, the last message, 12 unread; the tab badge | ✅ | [01](step-3/01-chat-list.png) |
| bob typing shows as "…" | ✅ | [02](step-3/02-typing.png) |
| bob's Bangla message with an emoji arrives live, within a second | ✅ | [03](step-3/03-live-bangla.png) |
| ana types: bob's socket gets `typing` every 3 s; ana sends: bob gets it live | ✅ | |
| bob reads: ana's tick turns double, live | ✅ | [04](step-3/04-read-ticks.png) |
| Offline (backend unreachable), restarted twice: the saved chat and "Waiting for network" are still there | ✅ | [05](step-3/05-offline-after-restart.png) |
| Tapping it: "Not sent yet" with Try again, Delete, Cancel | ✅ | [06](step-3/06-not-sent-yet.png) |
| Back online, no tap: sent 9 s later, exactly once | ✅ | [07](step-3/07-sent-after-reconnect.png) |
| A message queued at 10:59 and offline for 12 hours, through two restarts and a USB reconnect: sent once at 23:11 | ✅ | |
| TalkBack reading (accessibility tree): Back, the profile, one stop per message ("You, 11:17 PM: Offline test 2. Sent"), Message, Send | ✅ | |
| Message on bob's profile opens the chat | ✅ | |
| Large fonts | ⚠️ not checked | the phone doesn't let adb change the font size |

## The friends' APK and the share

- **The share's tunnels had died** at about 12:19, after a stretch with no network activity (probably the Mac sleeping), and Cloudflare deleted them. I restarted the share, which republished the address file. New links:
  - APK: `https://based-home-ceramic-funeral.trycloudflare.com/vromon.apk`
  - API: `https://dual-lip-ment-toddler.trycloudflare.com`

  Quick-tunnel links change on every restart.
- **Rebuilt the APK** with everything above (23:47; the release bundle was checked to contain tonight's last edits). The share serves it (106,846,916 bytes, matching the build).
- **Through the tunnel:** `live_check.py` delivered a message in 91 ms.
- **Installed it over the old one on the owner's phone** and checked it as ana:
  - the chat list, bob typing, and his Bangla message arriving live ([08](step-3/08-apk-through-tunnel.png));
  - ana's reply reaching bob;
  - the Read tick.

  Then I signed ana out.

## For the owner

- **Sign in again on the phone, in both the dev app and the friends' app.** When I signed your account out of the dev app to test as ana, supabase-js's default sign-out (`scope: 'global'`) ended every Vromon session for your account, including the friends' app and any other device. Nothing was deleted.
- **Decision:** should Sign out end only this phone's session (`signOut({ scope: 'local' })`, as most apps do), with "sign out everywhere" kept for later as its own button? I recommend it. It's a one-line change in `src/features/auth/actions.ts`, plus an APK rebuild.
- **Large fonts:** set Settings → Display → Font size to the largest, open Friends and a chat, and check that nothing is cut off.
- **Maestro 04 and 07** were updated for the new segments but not run tonight: 04 removes and re-adds the friendship between ana and bob.

## Files

- **New:**
  - app: `mobile/app/chat/[id].tsx`, `mobile/app/chat/new.tsx`
  - `mobile/src/features/chat/`: `format.ts`, `outbox.ts`, `state.ts`, `queries.ts`, `socket.ts`, `useLiveChat.ts`, `ChatRow.tsx`, `MessageBubble.tsx`, `Composer.tsx`
  - tests: `chatFormat`, `chatCache`, `chatOutbox`, `liveSocket`, `chatScreens`, `offlineCache` (`mobile/src/__tests__/`)
  - Maestro: `mobile/.maestro/11-chat.yaml`, `scripts/chat-text.js`, `scripts/reply-message.js`
  - scripts: `scripts/e2e/chat_as.py` (send, read, typing, messages, list, listen), `scripts/dev/phone.sh` (safe input to the test phone)
- **Changed:**
  - Friends and chat screens: `app/(tabs)/friends.tsx`, `app/(tabs)/_layout.tsx` (badge), `app/_layout.tsx` (live socket, routes), `app/friends/[id].tsx` (Message)
  - avatar colours: `app/(tabs)/settings.tsx`, `app/settings/blocked.tsx`, `app/add/[code].tsx`, `src/features/friends/PersonRow.tsx`, `src/features/map/PlaceSheet.tsx`, `src/ui/Avatar.tsx`
  - shared code: `src/ui/Fab.tsx`, `src/ui/theme/tokens.ts`, `src/services/api.ts` (`chatApi`, `isTemporaryError`), `src/services/queryClient.ts`, `src/types/index.ts`, `src/i18n/en.json` and `bn.json`
  - tests: `contrast`, `friends`, `navigation`
  - Maestro: `04-friend-by-code.yaml`, `07-friend-trip.yaml`, `config.yaml`, `subflows/launch.yaml`
  - scripts: `scripts/e2e/session.py`, `scripts/e2e/live_check.py` (the accounts file's new place)
  - `.gitignore`
  - docs: `docs/architecture.md`, `docs/feature-inventory.md`, `docs/sharing-with-friends.md`, `docs/friends-chat-plan.md`

## Notes for step 4 (sharing cards)

- **Phone input:** use `scripts/dev/phone.sh`: one input, then a screenshot. Saving code can reload the app, so take a fresh screenshot after any edit. Run Maestro with `-e DEV_CLIENT=false` on this phone.
- **Saved data:** chats are now saved on the device. Card payloads must stay small JSON, and the newest-50 trim applies to them too.
- **New message kinds** need a bubble in `MessageBubble.tsx`, a line in `preview()` (`format.ts`) for the chat list, and an accessibility label.
- **Known gap:** the chat list shows the last *sent* message, not one still waiting in the outbox.
- **The test chat** between e2e.ana and e2e.bob (chat 1) now has about 25 test messages.

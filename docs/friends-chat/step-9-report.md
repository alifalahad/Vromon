# Friends and Chat · Step 9 report

**Date:** 2026-10-29 · **Plan:** [friends-chat-plan.md](../friends-chat-plan.md), step 9 · **Status:** done in code and tests. **Push can't reach a phone yet:** the owner tasks below aren't done. The app is complete without them: messages arrive live, with an in-app banner and the badge.

## Owner tasks (not done yet)

Push is delivered only after these three tasks ([technology-decisions.md](../technology-decisions.md), Push):

1. **Create a Firebase project** and add the Android app (`com.vromon.app`, and `com.vromon.app.dev` for the dev build). Download `google-services.json` and set `GOOGLE_SERVICES_FILE` to its path when building.
2. **Set `EAS_PROJECT_ID`** (from `npx eas-cli@latest init`).
3. **Upload the FCM V1 service-account key to EAS** (`eas credentials`, Android, push notifications).

After that, rebuild the APK. The phone check is: Bob sends over the API while Ana's app is in the background, and the notification should open the chat.

## What was built

**Push for chats and trip rooms** (`app/services/chat_push.py`):

- **What sends one:**
  - a new message: text, a card, I'm here, running late, a live location starting;
  - a trip-room invite;
  - your suggestion added to the plan ("Ana added Madhabpur Lake to Day 2", sent to whoever suggested it).

  Reactions, answers, unsends, live location points and lines from Vromon don't.
- **Every setting is respected:**
  - mute (until it ends) and blocks;
  - **Messages** (direct chats) and **Trip rooms** (rooms and room invites) from Chats and privacy;
  - **Show message text**: with it off, the notification is only "Ana · New message".
- **The words:** the sender is the title ("Ana", or "Ana · Cox's Bazar Trip" in a room), and the body is the text (up to 120 characters) or what a card is ("Shared a place: Lawachara National Park", "Suggested Madhabpur Lake for the plan"). They follow the recipient's language, English or Bangla.
- **One notification per chat:** the Android channel is "Messages", and the notification's `tag` and `collapseId` are `chat-<id>`, so a new one replaces the one shown instead of stacking.

**In the app:**

- The **Messages** notification channel is made when the phone registers for push.
- **Tapping a notification** opens the chat. The check of the tap path now also allows `/chat/<number>`, and still rejects anything else (other paths, other sites, odd characters).
- **While Vromon is open**, a chat's push isn't shown. A small **banner** at the top says who and what for 4 seconds, and tapping it opens the chat. It comes from the live socket, so it works without push.
  - No banner for your own messages, for the chat you're in, for a muted chat, or for lines from Vromon.
- **The Friends tab badge** updates live from the same events (it already did).

## How it was checked

- **Backend:** `tests/test_chat_push.py` has 10 new tests, and `pytest -q` gives **700 passed, 9 skipped**. They check the payloads:
  - who it goes to, the title and body, the channel, tag and tap path, and never the sender;
  - previews off, Bangla;
  - Messages off, mute and an ended mute, blocks in a room;
  - the Trip rooms switch, a room's name, suggestions and "added to Day 2", invites;
  - a live location's start but not its points; no push for reactions or unsends.

  **To show the settings are tested, I broke two on purpose:** ignoring mute fails 1 test, and ignoring the preview setting fails 2.
- **App:** `tsc` and `expo lint` are clean, and Jest has **551 tests in 56 suites**. `chatNotifications.test.tsx` (5) covers the tap paths (allowed and rejected), quiet chat pushes while open, when a banner is due, and the banner itself (from the socket, what it says, the tap, going away, a trip room).
- **On the phone:** not run. The phone was disconnected, and push needs Firebase anyway. The banner is covered by Jest.

## The friends' APK and the share

- **The share was restarted with step 9's backend.** New links:
  - APK: `https://der-lawyers-national-surrounding.trycloudflare.com/vromon.apk`
  - API: `https://train-reviews-painting-cloud.trycloudflare.com`
- **The APK was rebuilt with step 9** (2026-10-29 11:14, 107,021,532 bytes). The bundle was checked for step 9's text and paths, and the share serves it. It still has no Firebase, so it can't receive push yet.

## For the owner

- **The three Firebase and EAS tasks above,** when you want push on phones.
- **Install the new APK over the old one** from the link above.
- **Your list for later** (kept as you asked):
  - sign-out scope;
  - the large-font check;
  - Ana's own live location on the phone;
  - switch off "Disable permission monitoring";
  - the "dates changed" line;
  - the formatting churn in three screens;
  - missing Bangla `friends.*` strings;
  - Maestro for steps 4–9;
  - disk space.

## Files

- **Backend:**
  - new: `app/services/chat_push.py`, `tests/test_chat_push.py`
  - changed: `app/services/push.py` (channel, tag and collapseId); `app/api/v1/endpoints/chat.py` (push after a send); `app/api/v1/endpoints/rooms.py` (push for invites, added suggestions, and live location starting)
- **App:**
  - new: `src/features/chat/ChatBanner.tsx`, `src/__tests__/chatNotifications.test.tsx`
  - changed: `src/features/friends/push.ts` (the Messages channel); `useFriendNotifications.ts` (`safePath`, quiet chat pushes while open); `src/features/chat/queries.ts` (`bannerWorthy`); `state.ts` (`useChatBanner`); `app/_layout.tsx` (the banner); `src/i18n/en.json` and `bn.json`
- **Docs:** `docs/architecture.md`, `docs/feature-inventory.md`, `docs/friends-chat-plan.md`

## Notes for step 10 (hardening and the full check)

- With Firebase set up, check that tapping a notification from a killed app opens the chat. That path is `getLastNotificationResponseAsync`.
- Maestro flows for chat, rooms and the banner are still to write.

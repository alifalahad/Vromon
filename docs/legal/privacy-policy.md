# Vromon Privacy Policy

> **Draft for review (2026-10-17; friends and chat added 2026-10-29).** Before publishing: fill in the `[TO FILL]` items, have it reviewed, and host it at a public URL (Google Play requires one). It describes the app as built; update it whenever what the app collects changes. Google Play's Data safety form must match it: since chat, it includes **messages** and, when someone uses "I'm here" or live location, **approximate and precise location**.

**Last updated:** [TO FILL: publication date]
**Contact:** [TO FILL: a support email address that you read]

Vromon is a travel app: you plan trips, mark the places you have been on a world map, keep photos of them, share your map with friends you choose, chat with them, and plan trips together. This policy explains what Vromon stores, why, who can see it, and how to delete it.

## What we collect

| Data | When | Why |
|---|---|---|
| **Email address**, and your Google account's email if you sign in with Google | When you create an account | Signing in, password reset |
| **Username, display name, home country** | When you set up your profile | So friends can recognise you; your home country personalises the map |
| **Places on your map**: countries, regions and cities you mark as visited, want to visit, or lived in, with optional dates and notes | When you mark a place | Your travel map and statistics |
| **Trips**: destination, dates, number of travellers, budget, interests and pace, stops and how you travel between them, itineraries, feedback | When you plan a trip | Planning itineraries and trip statistics |
| **Photos** you choose to add to a place or trip | When you add one | Showing them to you and your friends |
| **Friends**: your friend code, friend requests, friendships, blocked accounts | When you use Friends | The friends features |
| **Chats**: the messages you send to friends (text, and cards for a trip, a place, a trip idea or a poll), your replies, reactions and poll answers, how far you have read, and each chat's mute and "delete for me" state | When you chat | Delivering your messages and showing your chats on all your devices |
| **Trip rooms**: who you invited to plan a trip together, who joined, places members suggested and whether you added them to the plan | When you plan together | Planning a trip with friends |
| **"I'm here" and "Running late"**: the stop of today's plan you are at (or "near" the destination) and the time, or by how many minutes you are late | Only when you send one in a trip room | Telling the trip room |
| **Live location**: your latest position and its accuracy, while you share it | Only while you share it in a trip room | Showing the trip room where you are |
| **Reports**: the message you report, why, and an optional note | When you report a message | Reviewing reported messages |
| **Settings**: language, appearance, map theme, notification and chat privacy choices | When you change them | Keeping them the same on all your devices |
| **Push notification token** for your device | If you allow notifications | Telling you about friend requests, new messages, trip-room invites and places added to a plan (trip reminders don't use it) |
| **Crash reports**: device model, Android version, app version, and where the app failed | Only if crash reporting is switched on in the build you use | Fixing bugs |

We do **not** collect your contacts or any advertising identifier. We never track your location in the background.

**Your location reaches our server only when you send it to a trip room yourself:**

- **"I'm here"** reads your location once, when you tap it. Our server matches it to the nearest stop of that day's plan (within 300 metres), or says you are "near" the destination, and only that is posted. **The position itself is not stored**, and nobody sees it.
- **Live location** shares your position with the trip room's members, for 15 minutes, an hour or until the end of the day (never more than 24 hours), and only on the trip's dates. While you share, the app sends your latest position about once a minute **while Vromon is open on your screen**; it doesn't track you in the background. Our server keeps only the latest position, and deletes it the moment you tap Stop, the time runs out, or you leave the room. A bar on every screen shows that you are sharing, with a Stop button.

**Today mode's location stays on your phone.** During a trip, Today mode can use your location to work out when to leave for your next stop, but only if you turn on "Use my location" there, and only while that screen is open (never in the background). The calculation happens on your phone, and that location is never sent to Vromon's server or anyone else, and never stored. Turning the switch off, or signing out, stops it.

**Trip reminders are made on your phone.** "Leave in 10 minutes" and the evening-before weather note are local notifications scheduled on your device from your plan and the forecast. They need no push token, and signing out cancels them. The camera is used only to scan friend QR codes on your phone; camera images are not stored or sent. Photos are chosen through Android's photo picker, so the app can only see the photos you pick.

**Location data is removed from your photos.** Every photo is re-encoded on our server before it is stored, and all hidden metadata is deleted, including GPS location, camera details and the original file's comments. Only the date the photo was taken is kept.

## Who can see your data

Accounts are private. There is no public profile.

- **You** see everything in your account.
- **Friends you accept** can see, read-only, your username, display name, map, travel statistics and photos, and your trips, including "On the road" (the trip you are on, or one starting within 14 days). Turn off Settings → Chats and privacy → "Show my trips to friends" and they see none of your trips, except one you send them in a chat yourself. They cannot change anything. Removing or blocking someone ends their access immediately.
- **The people in a chat** see its messages. You can only start a chat with a friend; if you stop being friends, the chat stays readable but nobody can send in it. Someone you block can't see your chat with them or message you, and their messages in a shared trip room are hidden from you. Read ticks show only when both of you have "Read receipts" on; "typing…" is never stored.
- **A trip room's members** (people you invited who joined) can read that trip and its plan and suggest places; only you change the plan. Whoever leaves, or is removed, loses access at once.
- **Other people** can find your username, display name and avatar only by searching for your username (search matches the start of a username; you can turn this off in Settings → Privacy & friends → "Let people find me by username") or with your friend code. They see nothing else.
- Photo links given to the app expire within 10 minutes. After you delete a photo, a link someone already received may keep working for about a minute because of our storage provider's cache.

## Service providers

We use these providers to run Vromon. They process data only to provide their service to us:

- **Supabase**: sign-in, database and photo storage.
- **[TO FILL: hosting provider, e.g. Render]**: runs the Vromon server.
- **Google (Gemini API)**: when you tap "Why?" on an itinerary item, that item and your trip's destination, length, budget, interests and pace are sent to generate the explanation. Your name, email and photos are never sent.
- **Expo and Google Firebase Cloud Messaging**: deliver push notifications, if you allow them. A message notification carries the sender's name and the start of the message (up to 120 characters), unless you turn off Settings → Chats and privacy → "Show message text": then it says only who wrote.
- **OpenRouteService (HeiGIT)**: road distances and driving times between the places and hotels of a destination, and from your trip's starting city. Only those points are sent, never anything about you.
- **Open-Meteo**: the weather and sea forecast for your trip's destination and its beaches. Only the destination's coordinates are sent.
- **Google Maps**: "Directions" in Today mode opens Google Maps with your next stop's location. From then on Google Maps' own privacy policy applies; Vromon sends it nothing else.
- **Sentry**: receives crash reports, if crash reporting is on.
- **Map tiles**: when you view maps, your phone downloads map images from OpenFreeMap (street maps) and Amazon Web Services (terrain). Like any website, these servers see your IP address and which map area is requested.

We do not sell your data and do not use it for advertising.

## Keeping and deleting your data

- Your data is kept while you have an account.
- **Messages:** you can unsend your own message for everyone within an hour of sending it. "Delete chat" (and Settings → Chats and privacy → "Delete all chats") removes a chat's messages for you only; the other people keep their copy, as on a phone. A reported message is kept with its report, as it was, even if it is unsent later, so it can be reviewed.
- **Live location** is deleted when you stop sharing, when the time runs out, or when you leave the trip room. "I'm here" positions are never stored.
- **Delete your account** in Settings → Your data → Delete account. Your profile, map, trips (with their trip rooms), photos (the files too), friends, requests, blocks, devices and settings are deleted immediately and permanently, and so is your sign-in. So are the messages you sent, your reactions and answers, your place in other people's trip rooms, your live location, and reports made by you or about you. Messages other people sent you stay with them.
- **Export your data** in Settings → Your data → Export my data (also in Settings → Chats and privacy) to get a copy as a JSON file, including the chats you are in and the messages you sent.
- You can also ask for deletion at [TO FILL: web page or email for deletion requests], without the app.

## Security

All traffic between the app and our servers is encrypted (HTTPS, and the live chat connection over secure WebSockets). Sign-in tokens are kept in your phone's secure storage. Photos are stored in a private bucket and are only reachable through short-lived links that our server hands out after checking who is asking.

**Chats are not end-to-end encrypted.** Messages are stored on our server so they reach all your devices and so reported messages can be reviewed. They are protected in transit and on the server, and only the people in a chat can read it through the app, but Vromon's server can read them. We look at messages only when one is reported to us, or when the law requires it.

## Children

Vromon is not directed at children under 13, and we do not knowingly collect data from them.

## Changes

If this policy changes, the new version will be posted at the same address with a new date. Significant changes will also be announced in the app.

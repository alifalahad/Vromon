# Vromon Privacy Policy

> **Draft for review (2026-10-17).** Before publishing: fill in the two `[TO FILL]` items, have it reviewed, and host it at a public URL (Google Play requires one). It describes the app as built; update it whenever what the app collects changes.

**Last updated:** [TO FILL: publication date]
**Contact:** [TO FILL: a support email address that you read]

Vromon is a travel app: you plan trips, mark the places you have been on a world map, keep photos of them, and share your map with friends you choose. This policy explains what Vromon stores, why, who can see it, and how to delete it.

## What we collect

| Data | When | Why |
|---|---|---|
| **Email address**, and your Google account's email if you sign in with Google | When you create an account | Signing in, password reset |
| **Username, display name, home country** | When you set up your profile | So friends can recognise you; your home country personalises the map |
| **Places on your map**: countries, regions and cities you mark as visited, want to visit, or lived in, with optional dates and notes | When you mark a place | Your travel map and statistics |
| **Trips**: destination, dates, number of travellers, budget, interests and pace, stops and how you travel between them, itineraries, feedback | When you plan a trip | Planning itineraries and trip statistics |
| **Photos** you choose to add to a place or trip | When you add one | Showing them to you and your friends |
| **Friends**: your friend code, friend requests, friendships, blocked accounts | When you use Friends | The friends features |
| **Settings**: language, appearance, map theme, notification choices | When you change them | Keeping them the same on all your devices |
| **Push notification token** for your device | If you allow notifications | Telling you about friend requests (trip reminders don't use it) |
| **Crash reports**: device model, Android version, app version, and where the app failed | Only if crash reporting is switched on in the build you use | Fixing bugs |

We do **not** collect your device's location, your contacts, or any advertising identifier.

**Your location stays on your phone.** During a trip, Today mode can use your location to work out when to leave for your next stop, but only if you turn on "Use my location" there, and only while that screen is open (never in the background). The calculation happens on your phone. Your location is never sent to Vromon's server or anyone else, and it is never stored. Turning the switch off, or signing out, stops it.

**Trip reminders are made on your phone.** "Leave in 10 minutes" and the evening-before weather note are local notifications scheduled on your device from your plan and the forecast. They need no push token, and signing out cancels them. The camera is used only to scan friend QR codes on your phone; camera images are not stored or sent. Photos are chosen through Android's photo picker, so the app can only see the photos you pick.

**Location data is removed from your photos.** Every photo is re-encoded on our server before it is stored, and all hidden metadata is deleted, including GPS location, camera details and the original file's comments. Only the date the photo was taken is kept.

## Who can see your data

Accounts are private. There is no public profile.

- **You** see everything in your account.
- **Friends you accept** can see, read-only, your username, display name, map, travel statistics, photos and trips. They cannot change anything. Removing or blocking someone ends their access immediately.
- **Other people** can find your username, display name and avatar only by searching for your username (search matches the start of a username; you can turn this off in Settings → Privacy & friends → "Let people find me by username") or with your friend code. They see nothing else.
- Photo links given to the app expire within 10 minutes. After you delete a photo, a link someone already received may keep working for about a minute because of our storage provider's cache.

## Service providers

We use these providers to run Vromon. They process data only to provide their service to us:

- **Supabase**: sign-in, database and photo storage.
- **[TO FILL: hosting provider, e.g. Render]**: runs the Vromon server.
- **Google (Gemini API)**: when you tap "Why?" on an itinerary item, that item and your trip's destination, length, budget, interests and pace are sent to generate the explanation. Your name, email and photos are never sent.
- **Expo**: delivers push notifications, if you allow them.
- **OpenRouteService (HeiGIT)**: road distances and driving times between the places and hotels of a destination, and from your trip's starting city. Only those points are sent, never anything about you.
- **Open-Meteo**: the weather and sea forecast for your trip's destination and its beaches. Only the destination's coordinates are sent.
- **Google Maps**: "Directions" in Today mode opens Google Maps with your next stop's location. From then on Google Maps' own privacy policy applies; Vromon sends it nothing else.
- **Sentry**: receives crash reports, if crash reporting is on.
- **Map tiles**: when you view maps, your phone downloads map images from OpenFreeMap (street maps) and Amazon Web Services (terrain). Like any website, these servers see your IP address and which map area is requested.

We do not sell your data and do not use it for advertising.

## Keeping and deleting your data

- Your data is kept while you have an account.
- **Delete your account** in Settings → Your data → Delete account. Your profile, map, trips, photos (the files too), friends, requests, blocks, devices and settings are deleted immediately and permanently, and so is your sign-in.
- **Export your data** in Settings → Your data → Export my data to get a copy as a JSON file.
- You can also ask for deletion at [TO FILL: web page or email for deletion requests], without the app.

## Security

All traffic between the app and our servers is encrypted (HTTPS). Sign-in tokens are kept in your phone's secure storage. Photos are stored in a private bucket and are only reachable through short-lived links that our server hands out after checking who is asking.

## Children

Vromon is not directed at children under 13, and we do not knowingly collect data from them.

## Changes

If this policy changes, the new version will be posted at the same address with a new date. Significant changes will also be announced in the app.

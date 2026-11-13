# Vromon — Feature Inventory

**Last updated:** 2026-10-12 (Week 2: Phase 5 approved; Phase 6 generation/display audit and fixes)
**Rule:** a feature is ✅ only if its behaviour was verified by an automated test or a recorded manual or automated UI run. "Implemented" without verification is marked ⚠️.

Legend: ✅ verified · ⚠️ implemented, verification pending (needs you or a device) · 🟡 partial · ❌ not implemented

## Demo features (from the plan's Phase 10 list)

| # | Feature | Status | Where | How it was verified |
|---|---|---|---|---|
| 1 | Six-step trip wizard | ✅ | `mobile/app/trip/new.tsx`, `src/features/tripForm.ts` | Jest schema/step tests; headless-Chrome run through all 6 steps (2026-10-12) |
| 2 | Budget presets (৳15k / 25k / 50k + custom) | ✅ | wizard step 3 | Screenshot run; payload mapping test |
| 3 | Interests and travel pace | ✅ | wizard step 4 | Jest ("at least one interest", valid travel styles); screenshot run. *Before Phase 10 the mobile app never sent interests.* |
| 4 | Daily time window / activity limit | ✅ | wizard step 5; both planners; validator | Backend tests; Jest time-order checks |
| 5 | Must-visit and excluded places | ✅ | wizard step 5 (tap to cycle); planners; validator | `test_phase10_editing.py`, `test_optimizer.py`; screenshot run. Default planner now tries must-visits first (fixed in Phase 10). |
| 6 | Multi-day itinerary | ✅ | both planners | Backend tests; e2e run (3-day trip) |
| 7 | Opening-hour constraints | ✅ | both planners; validator `OUTSIDE_OPENING_HOURS` | `test_optimizer.py::TestBaselineFixes`, solver tests |
| 8 | Budget-aware ranking | ✅ | `recommendation_service.py` (budget_match weight) + hard daily cap | Phase 4 tests; `TestDailyCapWithMeals` |
| 9 | Restaurant and hotel suggestions | 🟡 | meals are assigned to restaurants (seeded, deterministic); the hotel is picked by accommodation category | Shown in the timeline and budget. **No ranked hotel or restaurant choice list in the app.** |
| 10 | Match scores and explanations | ✅ / ⚠️ | score + ranking reasons on each card and in "Why?"; sourced AI explanation via `/rag/.../explanation` | Ranking part: screenshot run. AI part ⚠️: UI handles "not configured" correctly; a live Gemini answer is untested (no API key). |
| 11 | Day tabs and timeline | ✅ | `mobile/app/itinerary/[id].tsx` | Screenshot run |
| 12 | Map markers and routes | ⚠️ native / ✅ web fallback | `src/components/TripMap.tsx` (react-native-maps), `TripMap.web.tsx` | Android bundle builds; web fallback screenshot. **The native map must be checked on your phone.** Routes are straight lines (labelled), not road routes. |
| 13 | Budget breakdown and trip summary | ✅ | `GET /trips/{id}/budget`, `BudgetPanel.tsx`, trip screen | `TestBudget`; screenshot run |
| 14 | Regenerate a day | ✅ | `POST /trips/{id}/days/{day}/regenerate` | `TestRegenerateDay` (changes places, keeps must-visit, no extra rows, others untouched); UI run |
| 15 | Remove / replace activities | ✅ | `DELETE …/items/{id}`, `GET …/alternatives`, `POST …/replace` | `TestRemove`, `TestReplace`; UI run |
| 16 | Adapt an itinerary | ✅ | relax / reduce_budget / avoid_crowds / energise | `TestAdapt`; UI run. *"energise" was a silent no-op before Phase 10.* |
| 17 | Duplicate, save, view, delete trips | ✅ | trips list + trip screen | `TestSavedTrips`; UI run (duplicate) |
| 18 | Feedback ratings and tags | ✅ | `FeedbackForm.tsx`, `/trips/{id}/feedback` | `TestSavedTrips`; UI run (submit, reload, update) |
| 19 | Responsive / PWA behaviour | ❌ (replaced) | — | The real app is a native Expo app; its web build runs (`npm run web`), but there is no PWA manifest or service worker. The demo's PWA is preserved in `demo/`. |
| 20 | Demo API behaviour | ✅ | `/api/v1/...` equivalents (see below) | Backend suite |

## Week 2 · Phase 5: mobile ↔ backend integration (re-verified 2026-10-12)

See [`phase-5-report.md`](phase-5-report.md). "UI run" = headless Chrome driving the web build against a live backend on a scratch database.

| Feature | Status | Where | How it was verified |
|---|---|---|---|
| Destinations loaded from `GET /destinations` with loading / empty / error + Retry | ✅ | `app/(tabs)/index.tsx` | UI run; network-error + Retry run with the backend stopped and restarted |
| **Destination screen: real places with category filter** (new) | ✅ | `app/destination/[id].tsx`, `src/features/places.ts` | UI run (25 places, Beach filter); `places.test.ts` |
| "Plan a trip here" preselects the destination (was ignored before) | ✅ | `app/trip/new.tsx` | UI run |
| Wizard: real-calendar dates, end ≥ start, ≤ 30-day trips (backend limit) | ✅ | `src/features/tripForm.ts` | `tripForm.test.ts`; UI run (2026-02-31, reversed, 52-day range all blocked) |
| Retry when destinations or places fail to load inside the wizard | ⚠️ | `app/trip/new.tsx` | Typecheck/lint only; not triggered in the UI run |
| Backend 422 errors name the field (`max activities per day: …`) | ✅ | `src/services/api.ts` `errorMessage` | `utils.test.ts` with real FastAPI 422 bodies captured from the API |
| Failed submit keeps the answers and says the trip was not saved | ⚠️ | `app/trip/new.tsx` | Not triggered in the UI run (client validation already blocks the known 422s). Check by stopping the backend before tapping Create trip |
| Trip persisted and confirmed with the real ID ("Trip #N saved") | ✅ | `app/trip/[id].tsx` | UI run → `GET /trips/{id}` and SQLite row match the form (dates, interests, must-visit, excluded) |
| API URL documented per platform (web, iOS Sim, Android Emulator, phone) | ✅ | `README.md`, `mobile/.env.example` | Docs |
| Same flow on a physical phone / native emulator | ⚠️ | — | Android bundle builds; needs your device |

## Week 2 · Phase 6: generate, persist, retrieve and display (2026-10-12)

See [`phase-6-report.md`](phase-6-report.md). Backend items are covered by `backend/tests/test_phase6_generation.py` (19 tests); "UI run" = headless Chrome on the web build against a live backend with a scratch DB.

| Feature | Status | Where | How it was verified |
|---|---|---|---|
| Typed generate / itinerary responses (Pydantic `GenerateResponse`, `ItineraryResponse`) with `status` = valid / valid_with_warnings / invalid | ✅ | `schemas.py`, `trips.py` | Tests; OpenAPI |
| Per-activity category, currency and `cost_source` (data / placeholder); hard and soft violations carry `item_id` | ✅ | `trips.py`, `constraint_validator.py` | Tests |
| Missing-data disclosures (severity `info`): placeholder meal prices, other currencies, straight-line travel times | ✅ | `constraint_validator.py` | Tests; UI run (placeholder meals) |
| Empty day flagged (`NO_ACTIVITIES`); activity past the user's day end always flagged (was silent up to 90 min) | ✅ | `constraint_validator.py` | Tests |
| No eligible places → explicit 422 *before* anything is deleted (was: old plan wiped, meal-only days saved as "valid") | ✅ | `trips.py` | Tests (heuristic + CP-SAT); UI run (error + Try again; saved days unchanged) |
| Repeated generation replaces the single current itinerary; overlapping requests cannot leave duplicate days (reproduced `[1,1,2,2]` before the fix) | ✅ | `trips.py` `_clear_itinerary` + row lock | Tests (repeat ×4, stale concurrent request); UI run (`replaced_previous`); DB row counts |
| Planner crash leaves the saved itinerary intact | ✅ | transaction | Test (injected failure → 500, old days unchanged) |
| Budget: known total vs placeholder vs estimated; other currencies excluded; incomplete reasons listed | ✅ | `GET /trips/{id}/budget`, `BudgetPanel.tsx` | Tests; UI run |
| Displayed match score is the real ranking score (was up to 115%: day-theme bonus stored) | ✅ | both planners | Test; optimizer comparison re-run reproduces published totals |
| Itinerary screen: overview (dates, days, status, cost), dated day tabs, empty-day note, category, honest cost labels, inline warnings | ✅ | `app/itinerary/[id].tsx`, `utils/itinerary.ts` | Jest (helpers); UI run |
| Hard problems always visible; preference warnings and data limitations separated | ✅ | `ValidationBanner.tsx` | Jest; UI run (invalid plan) |
| Trip screen: "replaced your previous itinerary", status, Try again on failure; Budget Retry | ✅ / ⚠️ | `app/trip/[id].tsx`, `BudgetPanel.tsx` | UI run (replace, Try again shown); Budget Retry not triggered |
| Same flow on a physical phone | ⚠️ | — | Android bundle builds; needs your device |

## Features added after the demo

| Feature | Status | Notes |
|---|---|---|
| Independent constraint validation shown in the app | ✅ | Banner on the itinerary and after every edit; backend revalidates after each change |
| Planner choice: Standard (greedy) / Optimized (CP-SAT) | ✅ | Trip screen; infeasible requests show the solver's diagnostics |
| Grounded Q&A (`POST /rag/ask`) | ⚠️ backend only | No mobile screen; a live LLM is untested (no key) |
| Semantic search (`GET /rag/search`) | ✅ backend | Dummy embeddings unless a key is configured |
| Input validation (times, place IDs, destination, trip length, must/excluded overlap) | ✅ | Phase 11, `test_security_validation.py` |
| Partial trip updates (PATCH changes only the sent fields) | ✅ | Phase 11 fix; previously reset unsent fields to defaults |
| CORS from configuration; admin token for ingestion | ✅ | Phase 11 |
| PostgreSQL 16 | ✅ | Phase 11: full e2e flow and restart idempotency via Docker |
| Docker Compose stack | ✅ | Phase 11: built and verified |
| CI workflow | ⚠️ | Same commands verified locally on a clean copy; not yet run on GitHub |
| Live AI explanations / RAG evaluation | ⚠️ | Waiting for a Gemini API key |

## Map home redesign (2026-10-23 to 2026-10-26)

Plan: [map-home-redesign-plan.md](map-home-redesign-plan.md). Reports: [map-home/](map-home/). "Phone" = checked on the realme, read-only on the owner's account.

| Feature | Status | Where | How it was verified |
|---|---|---|---|
| Bangladesh's 8 divisions (Mymensingh), correct Bangla names, offline copy | ✅ | `scripts/geo/prepare.py`, migration 0013, `assets/geo/home-regions.json` | pytest, Jest, phone |
| Opens on the home country; home ⇄ world; Map sheet (view, layers, theme) | ✅ | `app/(tabs)/index.tsx`, `MapSheet.tsx` | Jest, phone |
| Division taps open their sheet (was broken) | ✅ | `WorldMap.tsx` | phone |
| Story capsule and "Your story" panel | ✅ | `StoryCapsule.tsx`, `StoryPanel.tsx` | Jest, phone |
| Dock: today / coming trip / Want idea / friends / nudge | ✅ today (phone) · ⚠️ coming trip, idea, friends (Jest only) | `Dock.tsx`, `dockState.ts` | Jest; phone for "today" |
| Destination country and division (`/destinations`) | ✅ | migration 0014, `destination_places.py` | pytest, phone |
| Trip trails, coming-trip arc, plannable dots, Want pulse | ✅ dots (phone) · ⚠️ trails and arc (Jest only: no finished multi-stop trip on the phone) | `tripGeo.ts`, `TripLayers.tsx` | Jest, phone |
| Place sheet: trips there, friends there, plan, outline | ✅ | `PlaceSheet.tsx` | Jest, phone |
| Today's route on the map | ✅ | `todayGeo.ts`, `TodayLayers.tsx` | Jest, phone (live trip) |
| Press and hold to mark | ✅ opening and cancelling (phone) · ⚠️ choosing (Jest only) | `QuickMark.tsx` | Jest, phone |
| Friends layer and `GET /me/friends/footprints` (privacy on the server) | ✅ | `friends.py`, `FriendLayers.tsx` | pytest (privacy cases), phone |
| Replay your years | ✅ | `app/map/replay.tsx` | Jest, phone |
| Share poster (1080×1920) | ✅ | `Poster.tsx` (`react-native-view-shot`) | phone (share sheet opened, nothing sent) |
| Maestro flow 10 (map home) | ⚠️ written, not run | `.maestro/10-map-home.yaml` | needs the E2E accounts |

## Trip wizard · "Where to?" search (2026-10-26)

The sideways row of destination cards became one search field, in the way travel apps do it on phones: a full-screen search view (Material 3, Booking, Airbnb), recent searches first, at most 8 rows (Baymard), the typed text in bold (NN/g), and a "nothing found" state that says what Vromon covers. "Phone" = checked on the realme, on the owner's account, with no trip left behind.

| Feature | Status | Where | How it was verified |
|---|---|---|---|
| Search field on step 1; the chosen destination as a card with a locator map and "Change" | ✅ | `app/trip/new.tsx`, `LocatorMap.tsx` | Jest, phone |
| Full-screen search: Recent, From your Want list, all destinations by division | ✅ | `DestinationSearch.tsx` | Jest, phone |
| Finds names in English and Bangla, other spellings (Chittagong, Srimangal) and typos (sylet) | ✅ | `whereSearch.ts` | Jest; phone (typing Bangla on the phone not tried) |
| Finds a destination from a division (Barishal → Kuakata), a district (Moulvibazar → Sreemangal, 25 km) or an attraction (Ratargul → Sylhet) | ✅ | `whereSearch.ts` | Jest, phone |
| Picking an attraction makes it a must-see | ✅ | `app/trip/new.tsx` | Jest (on the must-dos step); phone (the note on step 1) |
| Nothing found: what Vromon covers, "Did you mean …?", see all | ✅ | `DestinationSearch.tsx` | Jest, phone |
| Android Back closes the search | ✅ | `DestinationSearch.tsx` | phone |
| Maestro flows 05 and 09 use the search | ⚠️ updated, not run | `.maestro/05-plan-trip.yaml`, `.maestro/09-journey.yaml` | they create trips, so they need the E2E accounts |

## Friends and chat (steps 1–10, done 2026-11-01)

What the Friends tab does now, in one place ([friends-chat-plan.md](friends-chat-plan.md); the steps' tables below have the details, and [step 10's report](friends-chat/step-10-report.md) the full check).

| Area | What you can do | Status |
|---|---|---|
| Friends | Add by username, code or QR; requests; a friend's profile with Message, Compare maps, their trips and Trips together; remove, block | ✅ |
| Chats | Direct chats with friends only: text (Bangla too), day separators, read ticks (mutual setting), typing, offline sending that delivers once | ✅ |
| Cards | Share a trip, a place, a trip idea (I'm in / Maybe / Can't) or a poll; Send to a friend from trips, places and the map | ✅ |
| Messages | React (Want to go adds to your Want list), reply with a quote, unsend within an hour, report; mute, delete for me, unfriend, block from the chat | ✅ |
| On the road | Friends on a trip today or leaving within 14 days; the chat header and profile say so; "Show my trips to friends" hides all of it | ✅ |
| Trip rooms | Plan together: invite friends, they join, suggest places, the owner adds them to a day; the pinned plan; Trips → With friends | ✅ |
| On the trip | I'm here (snapped to a stop, the point isn't kept), Running late (also from Today), live location for 15 min, 1 h or the day | ✅ |
| Notifications | In-app banner and live badge; push for messages, invites and added places, respecting mute, blocks and every setting | ✅ in the app / ⚠️ push needs Firebase and EAS (owner) |
| Settings | Chats and privacy: read receipts, show my trips, message and room notifications, message text in notifications, blocked people, download my chats, delete all chats | ✅ |
| Privacy and safety | Enforced on the server and tested (members only, 404 for strangers, blocks, read-only after unfriending, hidden trips stay hidden even by id) | ✅ |

## Friends and chat · step 3, the app (2026-10-27)

Text chat between friends ([friends-chat-plan.md](friends-chat-plan.md), step 3; report in [friends-chat/step-3-report.md](friends-chat/step-3-report.md)). "Phone" = checked on the realme as e2e.ana, with e2e.bob driven from the Mac (`scripts/e2e/chat_as.py`).

| Feature | Status | Where | How it was verified |
|---|---|---|---|
| Friends tab: Chats · Friends, requests row, chat list with unread counts and ticks, compose button | ✅ | `app/(tabs)/friends.tsx`, `ChatRow.tsx` | Jest, phone |
| New message: pick a friend | ✅ | `app/chat/new.tsx` | Jest, Maestro 11 |
| A chat: day separators, runs, Bangla text, read-only when no longer friends | ✅ | `app/chat/[id].tsx`, `MessageBubble.tsx`, `format.ts` | Jest; phone (not the read-only case) |
| Live: messages, typing and read ticks both ways | ✅ | `socket.ts`, `useLiveChat.ts`, `queries.ts` | Jest, phone, Maestro 11 |
| Offline: "Waiting for network", kept across restarts, sent once when back; tap to try again or delete | ✅ | `outbox.ts` | Jest; phone (12 hours offline and two restarts, then delivered exactly once) |
| Chats open offline: saved on the device with the newest 50 messages each; a refresh that fails offline no longer drops saved data (map, trips and chats) | ✅ | `services/queryClient.ts` | Jest; phone (two offline restarts) |
| Tab badge: unread chats + friend requests | ✅ | `app/(tabs)/_layout.tsx` | Jest, phone |
| Message button on a friend's profile | ✅ | `app/friends/[id].tsx` | Jest |
| TalkBack: one stop per message, read as "Bob, 10:57 AM: …" | ✅ | `MessageBubble.tsx` | accessibility tree on the phone; TalkBack itself not switched on |
| Large fonts | ⚠️ not checked | | the phone doesn't let adb change the font size |

## Friends and chat · step 4, sharing cards (2026-10-28)

Trip, place, trip idea and poll cards ([friends-chat-plan.md](friends-chat-plan.md), step 4; report in [friends-chat/step-4-report.md](friends-chat/step-4-report.md)). "Phone" = checked on the realme as e2e.ana, with e2e.bob driven from the Mac.

| Feature | Status | Where | How it was verified |
|---|---|---|---|
| Trip card: Open plan, Copy to my trips (a draft of your own) | ✅ | `cards/TripPlanCard.tsx`, `POST /trips/{id}/copy` | pytest, Jest, phone |
| A trip card only where everyone can see the trip; "No longer available" once they can't | ✅ | `services/cards.py` | pytest (with the rule broken on purpose, the tests fail) |
| Place card: Want to go (an attraction marks its division, C6), Add to a trip, Plan a trip | ✅ | `cards/PlaceCard.tsx`, `cards/actions.tsx` | Jest, phone (checked on the server) |
| Trip idea: I'm in / Maybe / Can't, who said what, Plan this trip | ✅ | `cards/TripIdeaCard.tsx` | pytest, Jest, phone (live both ways) |
| Poll: one answer or several, counts and bars, live | ✅ | `cards/PollCard.tsx` | pytest, Jest, phone (live both ways) |
| The chat's + sheet: Trip, Place, Trip idea, Poll, your trips, your Want list | ✅ | `ShareSheet.tsx`, `app/chat/share/*` | Jest, phone |
| Send to a friend from the trip menu, the map's place sheet and the destination screen; several friends and a note | ✅ | `app/share/send.tsx` | Jest; phone (the destination screen as far as the send screen) |
| Cards sent through the outbox: at once, offline, once | ✅ | `outbox.ts`, `share.ts` | Jest |
| Maestro | ⚠️ not run | | not required for this step; the phone was in use |

## Friends and chat · step 5, reactions, replies and safety (2026-10-28)

Mockups 7 and 8 ([friends-chat-plan.md](friends-chat-plan.md), step 5; report in [friends-chat/step-5-report.md](friends-chat/step-5-report.md)). "Phone" = checked on the realme as e2e.ana, with e2e.bob driven from the Mac.

| Feature | Status | Where | How it was verified |
|---|---|---|---|
| Press and hold a message: heart, thumbs up, laugh, wow, and Want to go (places and trip ideas; also adds to your Want list) | ✅ | `MessageMenu.tsx`, `cards/actions.tsx`, `PUT …/reaction` | pytest, Jest, phone (live both ways) |
| Reaction chip under the message; tap or hold it to see who reacted, and take yours back | ✅ | `MessageBubble.tsx`, `ReactorsSheet.tsx` | Jest, phone |
| Swipe right (or Reply) to reply, with a quote; a quote of a trip you can't see says "No longer available" | ✅ | `Composer.tsx`, `outbox.ts`, `services/cards.py` | pytest (the leak case), Jest, phone |
| Unsend your own message within an hour, after asking | ✅ | `DELETE …/messages/{mid}` | pytest, Jest, phone (Bob sees it removed) |
| Report… with reasons and a note; a copy of the message is kept; admin list behind `ADMIN_TOKEN` | ✅ | `app/chat/report.tsx`, `POST /messages/{mid}/report`, `GET /admin/reports` | pytest, Jest, phone (in the admin list) |
| Menu and Reply as screen reader actions | ✅ | `MessageBubble.tsx`, card headings | Jest |
| Chat ⋮ menu: Mute 1 h / 8 h / always, Unmute, View profile, Delete chat for me, Unfriend, Block | ✅ | `app/chat/[id].tsx` | Jest; phone (mute and unmute on the server, delete as far as its question; block and unfriend not run on the phone) |
| Settings → Chats and privacy: read receipts (mutual), notifications for messages, trip rooms and friend requests, message text in notifications, live location explained, blocked people, download my chats, delete all my chats | ✅ | `app/settings/chats.tsx`, `POST /me/chats/clear` | pytest, Jest; phone (read receipts change what A and B see; Friend requests saves both flags; delete all not run on the phone) |
| Message push respects these settings | ⏳ step 9 | | the switches are saved now |

## Friends and chat · step 6, On the road (2026-10-29)

Mockups 1 and 3 ([friends-chat-plan.md](friends-chat-plan.md), step 6; report in [friends-chat/step-6-report.md](friends-chat/step-6-report.md)). "Phone" = checked on the realme as e2e.ana, with e2e.bob driven from the Mac.

| Feature | Status | Where | How it was verified |
|---|---|---|---|
| On the road strip on Chats: a ring for how far through the trip, a dashed ring before it; tap opens the chat, hold opens their trip; hidden when empty | ✅ | `OnTheRoadStrip.tsx`, `GET /me/friends/on-the-road` | pytest, Jest, phone |
| Chat header line "On a trip · Sylhet, day 2" (or "Trip to … · Sat") | ✅ | `app/chat/[id].tsx` | Jest, phone |
| The same chip on the profile | ✅ | `app/friends/[id].tsx` | Jest, phone |
| Show my trips to friends (on by default, C3); off hides the strip, the header line, the chip and the profile's trips (C7) | ✅ | `app/settings/chats.tsx`, `services/on_the_road.py` | pytest (with the rule broken on purpose, the tests fail), Jest, phone (both ways) |
| Trips together on the profile | ✅ step 7 | `app/friends/[id].tsx` | phone |

## Friends and chat · step 7, trip rooms (2026-10-29)

Mockups 9 and 10 ([friends-chat-plan.md](friends-chat-plan.md), step 7; report in [friends-chat/step-7-report.md](friends-chat/step-7-report.md)). "Phone" = checked on the realme as e2e.ana, with e2e.bob driven from the Mac, both ways round.

| Feature | Status | Where | How it was verified |
|---|---|---|---|
| Plan together: invite friends to a trip's room ("I'm in" friends first and ticked), with a note | ✅ | `app/trip/invite/[id].tsx`, `POST /trips/{id}/members` | pytest, Jest, phone |
| Invite card in the friend's chat: Join / Not now, then Open trip room | ✅ | `cards/InviteCard.tsx` | pytest, Jest, phone |
| The room: plan bar, members in the header, names and faces on bubbles, lines from Vromon worded for each person | ✅ | `app/chat/[id].tsx`, `PlanBar.tsx`, `MessageBubble.tsx`, `format.ts` | Jest, phone |
| Suggestions: the owner adds one to a chosen day or says "not this time"; members see "Waiting for …" | ✅ | `cards/PlaceCard.tsx`, `POST /trips/{id}/suggestions/{mid}/accept` | pytest (with the rule broken on purpose, the tests fail), Jest, phone (both ways) |
| Members read the trip, can't change it; strangers and ex-members get 404 | ✅ | `services/rooms.py`, `_load_trip` | pytest, phone (over the API) |
| Leave, remove, members list; the room goes with the trip and with a deleted account | ✅ | `endpoints/rooms.py` | pytest, Jest |
| Trip screen: Trip room button with unread count; Plan together in the owner's menu | ✅ | `app/trip/[id].tsx` | phone |
| Trips tab: With friends | ✅ | `app/(tabs)/trips.tsx`, `GET /me/trips/joined` | pytest, phone |
| A trip idea's Plan this trip invites everyone who's in | ✅ | `TripIdeaCard.tsx`, `app/trip/new.tsx` | Jest (the wizard part not on the phone) |
| "Dates changed" line | ⏳ | | nothing changes a trip's dates yet |

## Friends and chat · step 8, on the trip (2026-10-29)

Mockup 11 ([friends-chat-plan.md](friends-chat-plan.md), step 8; report in [friends-chat/step-8-report.md](friends-chat/step-8-report.md)). "Phone" = checked on the realme as e2e.ana, with e2e.bob driven from the Mac.

| Feature | Status | Where | How it was verified |
|---|---|---|---|
| "I'm here": snapped to the day's stop within 300 m (early or late against the plan), else near the destination; the reading never kept | ✅ | `services/ontrip.py`, `cards/OnTripCards.tsx` | pytest; Jest; phone (Ana's check-in from the phone, Bob's snapped one shown) |
| Running late from the room's chip, and from Today with "Tell the trip room" ("Sent from Today") | ✅ | `onTheTrip.ts`, `app/trip/today/[id].tsx` | pytest, Jest, phone (Bob sees it over the API) |
| Live location: 15 min / 1 h / end of day, a point a minute in the foreground, a bar with Stop on every screen, a card with a small map and time left | ✅ | `liveShare.ts`, `LiveShareBar.tsx`, `POST/PUT/DELETE …/live` | pytest (members only, trip days only, expiry, leaving), Jest; phone (Bob's share and stop seen live; Ana's own sharing not run, to keep the owner's real position private) |
| Quick chips and + sheet tiles only on the trip's days; no photos (C5) | ✅ | `app/chat/[id].tsx`, `ShareSheet.tsx` | Jest, phone |

## Friends and chat · step 9, notifications (2026-10-29)

([friends-chat-plan.md](friends-chat-plan.md), step 9; report in [friends-chat/step-9-report.md](friends-chat/step-9-report.md).)

| Feature | Status | Where | How it was verified |
|---|---|---|---|
| Push for new messages, trip-room invites, suggestions added; mute, blocks and every Chats and privacy switch respected; previews off says only who wrote; English or Bangla | ✅ built / ⚠️ not delivered | `services/chat_push.py` | pytest (with mute and previews broken on purpose, the tests fail). Delivery waits for Firebase and EAS (owner tasks) |
| One notification per chat (`messages` channel, replaced by the next) | ✅ built | `push.py`, `friends/push.ts` | pytest (payload) |
| A tap opens the chat; only safe in-app paths | ✅ | `useFriendNotifications.ts` | Jest |
| In-app banner for a message in a chat that isn't open; the badge updates live | ✅ | `ChatBanner.tsx`, `queries.ts` | Jest; phone not run (the phone was disconnected) |

## Friends and chat · step 10, hardening and the full check (2026-10-29/30)

([friends-chat-plan.md](friends-chat-plan.md), step 10; report in [friends-chat/step-10-report.md](friends-chat/step-10-report.md).) "Phone" = the realme, release build of the dev app.

| Feature | Status | Where | How it was verified |
|---|---|---|---|
| A 2,000-message chat scrolls smoothly; older pages load as you scroll; a new message reaches the bottom while you're far back | ✅ | `format.ts` (bubbles and rows given again), `queries.ts`, `SwipeToReply.tsx`, `dateFormat.ts` | phone: 48 fps, 1.35% janky frames; Jest |
| 100 chats: the list opens and scrolls fast | ✅ | `app/(tabs)/friends.tsx` (a `FlatList` now), `ChatRow.tsx`; `GET /conversations` in 26 queries | phone: 89 ms from the cache; pytest; Jest |
| Older messages that couldn't load: a message and Try again, and again by itself when back online | ✅ | `app/chat/[id].tsx` | Jest; seen on the phone |
| Reconnects: backend restarted mid-chat, airplane mode, 10 minutes in the background: nothing lost or doubled | ✅ | `socket.ts` (a nudge restarts a stuck attempt) | phone (12 messages, each once); Jest |
| TalkBack: no icon glyphs read aloud, every button named, the muted state in the chat header | ✅ | `src/ui/icons.ts`, `ActionSheet.tsx`, `MessageMenu.tsx`, `MessageBubble.tsx` | accessibility tree on the phone (11 screens); Jest |
| Largest font (1.6×) and Bangla on the mockup screens | ✅ | `OnTheRoadStrip.tsx`, `app/friends/[id].tsx`, note fields | phone, both languages |
| Every English string has Bangla, with the same placeholders | ✅ | `src/i18n/bn.json` (33 added), `translations.test.ts` | Jest |
| Server limits: request size, socket frames, messages and sockets per person; push tokens out of URLs | ✅ | `app/core/body_limit.py`, `live.py`, `friends.py` | pytest |
| Hidden trips don't open by their id | ✅ | `rooms.can_read_trip` | pytest (fails with the old rule) |
| The whole backend suite on PostgreSQL; a new database starts | ✅ | `tests/conftest.py`, `seeder.py`, `me.py` | pytest on PostgreSQL 16 |
| Maestro 12: a trip room from the invite to Day 1; the whole suite | ✅ | `.maestro/12-trip-room.yaml` (and 06, 09, 10 made safe on trip days) | the whole suite on the phone: 14/14 passed |
| A read-only look at the owner's account (Friends, a chat, Settings) | ✅ | `scripts/dev/readonly_proxy.py` | phone: real data shown right, no write tried |

## Trip upgrades (steps 1–8, done 2026-11-13)

([trip-upgrades/README.md](trip-upgrades/README.md); reports in [trip-upgrades/reports/](trip-upgrades/reports/).) "Phone" = the realme; step 8 checked everything together on a release build of the dev app, as test account A.

| Feature | Status | Where | How it was verified |
|---|---|---|---|
| Where you stay, night by night: a hotel, family or friends (a place on the map), no night there, or not decided | ✅ | `services/stays.py`, `StaysSheet`, the plan's "Tonight" line | pytest; Jest; phone (trip 123: hotel nights 1–2, "Uncle's house" night 3) |
| Meals: at a restaurant, your own food (a packed lunch) or where you stay, for the trip or one day | ✅ | `services/meals.py`, `MealsSheet` | pytest; Jest; phone (day 2 packed lunch at ৳150, day 3 breakfast and dinner where you stay) |
| The stay advisor: "sleep somewhere else for nights a–b?" with what it saves, Switch / Not now / Don't suggest this | ✅ | `services/stay_advisor.py`, the plan's advice card | pytest; Jest; phone (trip 121: Hotel Ambassador, saves ৳4,200 and 8 min; Switch took the total from ৳25,170 to ৳20,970) |
| The places index: 179,490 places of every kind from Overture Maps | ✅ | `data-platform` connector `overture_pois`, `poi_index` | data platform pytest; the first load's quality report |
| Search anything when adding a stop: Vromon's places, what Vromon knows nearby, other places (not checked), addresses, a pin | ✅ | `services/place_search.py`, `AddStopSheet` | pytest; Jest; phone (90–390 ms a search on the phone; a museum added, "Not checked") |
| Rate your trip: one tap on the stars, then things one by one; only you see it | ✅ | `services/reviews.py`, `app/trip/review/[id].tsx`, the Trips tab reminder | pytest (privacy matrix); Jest; phone |
| The plan, map, Today, budget and AI budget agree on one trip that uses everything | ✅ | step 8: the way there, own food and the day's line fixed | phone and API (trip 123: ৳24,900; getting there ৳2,380 by bus everywhere) |
| Bangla and the largest text (1.6×) on every new screen | ✅ | step 8: meal titles, categories, the time column, the meal choices | phone, both languages |
| A trip opened 10 times in a release build: the plan sheet drawn every time | ✅ | | phone (10 of 10) |
| Maestro 13 (stays and meals), 14 (search anything), 15 (rate a trip) | ✅ | `.maestro/13-…`, `14-…`, `15-…` | the whole suite on the phone: 17 of 17 (flows 01, 04, 05, 06, 07, 12 and the sign-out subflow updated) |

## Demo endpoint → real API mapping

| Demo | Real (`/api/v1`) |
|---|---|
| `GET /api/destinations`, `/{dest}/places/restaurants/hotels` | `GET /destinations`, `/destinations/{id}/places\|restaurants\|hotels` |
| `GET /api/places`, `/places/{id}`, `POST /places/recommendations` | same paths under `/api/v1` |
| `POST/GET/PUT/DELETE /api/trips…` | same; update is `PATCH` |
| `POST /trips/{id}/generate`, `/regenerate` | same, plus `?algorithm=heuristic\|cpsat` |
| `GET /trips/{id}/itinerary` | same, plus a `validation` report |
| `POST /trips/{id}/days/{dayId}/regenerate` | same (fixed: must-visit kept; no phantom day) |
| `DELETE /trips/{id}/items/{itemId}` | same (fixed: item must belong to the trip; must-visit protected) |
| `POST /trips/{id}/adapt` | same, now reports `changes` and `validation` |
| `POST/GET /trips/{id}/feedback`, `POST /trips/{id}/duplicate` | same |
| — | **new:** `GET /trips/{id}/budget`, `GET /trips/{id}/items/{id}/alternatives`, `POST /trips/{id}/items/{id}/replace`, `/rag/*` |

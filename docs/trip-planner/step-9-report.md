# Trip Planner Step 9 Report: Today Mode

**Date:** 2026-10-19 · **Status:** built; checked on the phone; waiting for your approval
**Plan:** `docs/trip-planner-plan.md`, step 9 · **Design:** the "Today on the trip" mockup from step 1 (`docs/trip-planner/mockups/Today.dc.html`) · **Screenshots:** `docs/trip-planner/step-9/`
**Decision taken (decision 5):** you said "use my location". It's opt-in, only while Today mode is open, and never stored. It goes further than the plan asked: your location never leaves the phone at all.

## 1. What changed

### Getting to Today mode

- **The Trips tab:** the next-trip card opens Today mode while you're on the trip, and from the evening before it starts. Before then it opens the plan.
- **The trip screen:** a blue **Today** button under the dates, and "Today" in the ⋯ menu, while you're on the trip.
- **"Full plan"** at the top of Today mode opens the trip screen.

### The screen

- **Now:** an orange card with "NOW · 13:00", the stop you're at ("Lunch · Ocean View Café"), "Until 13:14 · 14 min left", and a bar for how far through it you are.
  - Between stops it says "Free time · until …".
  - Before the day starts: "Your day starts at 09:00".
  - After the last stop: "That's today done".
  - Before the trip: "STARTS TOMORROW", and the first day as planned.
- **Next: "Leave by 13:00"**, then how and from where ("Walk · about 13 min · from Lunch · Ocean View Café") and "for Beach Volleyball at Laboni at 13:14". How it's worked out:
  - **"Leave by"** = the next stop's start − the travel − the usual traffic then (17:00–20:00 ×1.4, 08:00–10:00 ×1.3), rounded down to 5 minutes. When traffic adds time it says "USUAL TRAFFIC +12 MIN". It's never called "live", because there's no live traffic source.
  - **The travel comes from**, in this order:
    1. **Your location**, if you turned it on. When you're within 500 m of the stop you're leaving from, it uses the plan's road time; otherwise the straight line × 1.3 at local speeds (walk up to 1 km, else CNG).
    2. **The plan's road time** from the previous visit.
    3. **The straight line** from a meal or from your hotel.
  - **More than 40 km from the stop** (not there yet): it uses the plan instead of your location and says "You're far from …, so this is from your plan."
  - **When "leave by" falls before the current stop ends**, it says so: "That's 14 min before Lunch · Ocean View Café ends." (The plan leaves no time to travel after a meal "on the way"; this makes that visible.)
  - **When the time has passed:** "Leave now", in red, with "You're 10 min behind".
- **Directions** opens Google Maps with the next stop (walking or driving).
- **Running late?** "Push the rest of the day back" by 15 min, 30 min or 1 h:
  - **Preview first:** for example "Beach Volleyball at Laboni moves to 13:44. Sugandha Beach moves to 15:24. Seagull Beach moves to 17:27."
  - **The rules:**
    - the next stop not yet started moves by the delay; the ones after it move only if they must (free time absorbs it);
    - **must-sees and pinned stops never move** ("… stays at 17:30");
    - a stop that would then run past its closing time, the end of your day, or into a must-see or pinned stop is dropped, with the reason ("Inani Beach is dropped: it closes at 18:00").
  - **Apply** shows "3 stops moved · Undo". **Undo** puts every time back, and puts dropped stops back where they were.
- **Three switches**, all off until you turn them on. Each asks for its permission only when you turn it on:
  - **"Use my location for “leave by”"**: only while this screen is open; never saved or sent.
  - **"Remind me 10 min before leaving"**: a notification, "Leave in 10 minutes for Inani Beach", with "Leave by 12:50: CNG, about 40 min. Your visit starts at 13:30." There's one for every stop from today to the end of the trip, and they're rescheduled when the plan changes.
  - **"Tell me the evening before if bad weather is coming"**: at 19:00 the evening before a day whose forecast has storms, rain, strong wind or rough sea at your stops ("Tomorrow: a weather warning · Storms likely 15:00–17:00 at Sunset Boat Ride.").
- **Reminders without a push server:** they're local notifications scheduled on the phone, and tapping one opens Today mode. Signing out cancels them all and turns the three switches off.
- **The rest of today:** each stop with its time, a ✓ when done, and a tag for any weather warning ("STORM RISK").

### Privacy

- **Location:** while in use only (precise or approximate, your choice in Android's dialog). Background location is removed from the app. The position is used on the phone for the estimate and is never sent to Vromon's server, the road service or anyone else, and never stored.
- **Updated documents:**
  - **`docs/legal/privacy-policy.md`:** the location and trip reminders paragraphs. I also added OpenRouteService, Open-Meteo and Google Maps (Directions) as services; steps 5 and 6 had left them out.
  - **`docs/play-store/data-safety.md`:** location is processed on the device only, so under Play's definitions it isn't "collected".
- **Exact alarms:** the app now declares `SCHEDULE_EXACT_ALARM` so "leave in 10 minutes" isn't delayed. It's granted at install up to Android 13 (your phone is on 12). From Android 14 the person allows "Alarms & reminders"; the switch then shows a hint with "Open settings". `USE_EXACT_ALARM` isn't used: Play allows it only for alarm-clock and calendar apps.

### How it's built

- **Backend:**
  - **`services/itinerary/late_service.py`:** the push-back, applying it and undoing it.
  - **Endpoints:** `POST /trips/{id}/days/{day_id}/late` (`{now, minutes, apply}`; without `apply` it's a preview) and `POST …/late/undo`. The undo only restores this day's own stops, and only places of the trip's destination.
- **App:**
  - **`app/trip/today/[id].tsx`:** the screen.
  - **`src/features/trips/today/`:** `today.ts` (now and next, travel estimates, usual traffic, "leave by", directions), `useHere.ts` (location), `settings.ts` (the three switches, this phone only), `reminders.ts` and `useTripReminders.ts` (scheduling), `useReminderTaps.ts`.
- **Native change:** `expo-location` (while in use only) and `SCHEDULE_EXACT_ALARM`. The dev app was rebuilt twice and installed on your phone; `android/` is regenerated by prebuild, not edited by hand.
- **In both languages:** all wording in English and Bangla (Bangla digits too).

## 2. Checked on the phone (the test account e2e.ana)

I made a test trip running today (19–21 Oct) in the test account. The development build can set the clock, so the screen was opened at 13:00 and at 12:50:

- **01:** "NOW · 13:00 · Lunch · Ocean View Café · Until 13:14 · 14 min left", "Leave by 13:00", "Walk · about 13 min · from Lunch · Ocean View Café", "for Beach Volleyball at Laboni at 13:14", Directions, Running late?, and the three switches off.
- **02, Running late (30 min):** "Beach Volleyball at Laboni moves to 13:44. Sugandha Beach moves to 15:24. Seagull Beach moves to 17:27."
- **03, Apply:** "3 stops moved · Undo". "Leave by" became 13:30 for 13:44. **Undo** gave "Changed back.", with the volleyball at 13:14 again.
- **04, at 12:50:** "That's 14 min before Lunch · Ocean View Café ends." The date reads "Mon 19 Oct".
- **Location:**
  - Turning it on showed Android's permission dialog ("Only this time" was chosen), then "from where you are".
  - The phone isn't in Cox's Bazar, and this showed a bug: about 20 hours by CNG, and "leave by" wrapped round past midnight to "16:40". Fixed: further than 40 km from the stop, it uses the plan and says so; past-midnight times show "Leave now".
  - No screenshots of this were kept, because they'd show roughly where you are.
- **Reminders:**
  - Turning them on asked for notification permission, and the phone then had the "leave" alarms for the coming days of the test trip.
  - The first build gave them a 1-hour window, so a reminder could come up to an hour late. Fixed with exact alarms (`SCHEDULE_EXACT_ALARM`); the phone now lists them with `exactAllowReason=permission`.
  - **A live reminder:** on a second test trip I pushed dinner back to 20:55 with the "late" endpoint. Leave by 20:35 meant a reminder at 20:25. The phone posted "Leave in 10 minutes for Dinner at Marine Drive Barbeque" at **20:25:25** with the app in the background. You saw it on the phone too.

## 3. Problems found and fixed

1. **Far away = "leave by" wrapped round midnight:** the plan is now used when you're more than 40 km from the stop.
2. **Reminders could be up to an hour late:** exact alarms now.
3. **A straight line overestimates near the stop you're at** (74 min instead of the 40-minute road): within 500 m of that stop, the plan's road time is used.
4. **"Leave by" before the current stop ends** wasn't explained: it now says so.
5. **The date read "Mon, Oct 19":** now "Mon 19 Oct".
6. **Notifications only showed while the app was open after the friend-push setup:** trip reminders now set up their own display handler.
7. **Maestro flows 06 and 08** tapped the next-trip card, which now opens Today mode while a trip is on: they now go on with "Full plan" when that happens.

## 4. Commands run

- **Backend:** `pytest` gives **523 passed**, 8 skipped. The new `tests/test_trip_planner_step9.py` has 13 tests:
  - a preview changes nothing;
  - the next stop moves by the delay and later ones only if they must;
  - started stops stay;
  - pinned stops and must-sees never move;
  - what can't fit is dropped with its reason;
  - undo restores every time and stop exactly;
  - undo after the day changed is refused;
  - undo can't add a place from elsewhere;
  - bad input is refused;
  - nothing left today means nothing moves.
  - The full suite also ran with a guard that fails on any network call: no calls.
- **App:** `jest` gives **315 passed** (26 suites); `tsc` and `eslint` are clean. The new `today.test.tsx` has 22 tests:
  - now and next;
  - "leave by" from the plan, with the usual traffic, from your location, near the stop before, far away, and before midnight;
  - the reminders' times;
  - scheduling once, and only in the future;
  - only Today paths are opened from a tap;
  - the screen: now, leave by, leave now, running late with preview, apply and undo;
  - location refused, location on;
  - reminders on.
- **Maestro:** flows 00–07 and 99 passed in one run. Flow 08 failed there because it opened my one-day "reminder test" trip (no other day to move a stop to). After I deleted my two test trips (78 and 79) from the test account, flow 08 passed.

## 5. Files

- **Backend:**
  - **New:** `services/itinerary/late_service.py`, `tests/test_trip_planner_step9.py`.
  - **Changed:** `endpoints/trips.py` (the two "late" endpoints).
- **App:**
  - **New:** `app/trip/today/[id].tsx`, `src/features/trips/today/` (6 files), `src/__tests__/today.test.tsx`.
  - **Changed:**
    - `app/(tabs)/trips.tsx` and `app/trip/[id].tsx` (the ways in);
    - `app/_layout.tsx` (the route, reminder taps);
    - `src/features/auth/actions.ts` (sign-out cancels reminders);
    - `src/features/trips/dates.ts` (`addDays`);
    - `app.config.ts` (`expo-location`, exact alarms, no background location);
    - `jest.setup.js`;
    - types, API, en/bn strings;
    - Maestro `06-trip-screen.yaml` and `08-rearrange.yaml`.
- **Docs:** `docs/legal/privacy-policy.md`, `docs/play-store/data-safety.md`.

## 6. Known issues and limits

- **Traffic is the usual pattern**, not live (as in step 6).
- **Your location gives a straight-line estimate** (× 1.3) unless you're at the stop before; nothing is sent to a road service, by design.
- **Reminders follow the plan**, not your location: they're scheduled ahead, when the app can't read where you'll be.
- **Reminders are only rescheduled when the app is open**, so a plan changed on another phone updates them the next time you open Vromon.
- **The evening-before weather note** uses the forecast as it was the last time the app was open.
- **From Android 14**, on-time reminders need "Alarms & reminders" allowed for Vromon. The app can't check this without another native module, so it shows the hint to everyone on 14 and later.
- **Not checked by hand:** Today mode in Bangla, at the largest font, and with TalkBack.

## 7. What I need from you

1. **Install:** your phone already has the new dev build (it adds location). **Sign in again**: the tests used the test account.
2. **Try it tomorrow on your trip:** open the Trips tab, tap your trip, then try "Use my location" and "Remind me 10 min before leaving".
3. **Approve step 9**, or tell me what to change.
4. **Step 10 (more destinations)** needs a decision from the plan (decision 6): which destinations first, and who checks prices and opening hours.

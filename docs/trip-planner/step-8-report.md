# Trip Planner Step 8 Report: Trips Tab

**Date:** 2026-10-19 · **Status:** built; checked on the phone; waiting for your approval
**Plan:** `docs/trip-planner-plan.md`, step 8 · **Design:** the "Trips tab" mockup from step 1 (`docs/trip-planner/mockups/Main.dc.html`) · **Screenshots:** `docs/trip-planner/step-8/`
**Decisions:** none were needed. You didn't take up the "edit the trip's budget" option I mentioned after step 7, so it isn't in this step.

## 1. What changed

### The next trip, on top

- **Which trip:** the one you're on, or else the soonest upcoming one.
- **The card:** a sunset-orange card with a small sea-and-sun drawing. It shows:
  - **How soon:** "NEXT TRIP · TOMORROW", "IN 5 DAYS", "STARTS TODAY", or "ON NOW · DAY 2 OF 3" during the trip.
  - **Where and when:** "Cox's Bazar", "Tue 20 – Fri 30 Oct · 5 travellers".
  - **The weather** from the forecast:
    - "32° · clear", or the first storm or rain it expects ("31° · storms likely Thu");
    - "The forecast shows about two weeks before" for trips further away.
  - **"Open plan"**, with "2 stops on day 1" (today's day during the trip) and the budget ("৳24,060 of ৳25,000").
  - **A trip without a plan** says "Plan not built yet".
- **Tapping anywhere on the card** opens the trip.
- **Contrast:** white on the orange is 5.1:1 (AA).

### Stats, then the other trips

- **The stats card** matches the mockup: finished trips, days, countries and cities in one row, and "All trip stats".
  - Continents and the other figures are on the "All trip stats" screen, as before.
  - It's hidden when you have no trips.
- **Upcoming, On now and Past** use compact cards:
  - a tile (waves for coming trips; for a past trip, its first photo);
  - the name and "Sun 25 – Mon 26 Oct · 2 days";
  - the route with flags when a trip has several stops ("🇧🇩 Dhaka → 🇮🇳 Kolkata");
  - "Plan not built yet" in amber.
- **A past trip** shows "N photos" when it has any (one request for all your photos, grouped by trip). On the right:
  - **"On your map"** ✓ when all its places are on your map;
  - **"Mark visited"** otherwise. One tap marks every stop's city and country, as the old banner did. The banner is gone; the button is on each past trip now.
- **No trips yet:** a "Plan your first trip" card with a short line and a "Plan a trip" button.
- **The "+" button** is now the mockup's extended "+ Plan a trip".

## 2. Checked on the phone

**With the test account e2e.ana** (screenshots in `step-8/`):

- **The next trip (01):** "NEXT TRIP · IN 5 DAYS", "Cox's Bazar Trip", "Sat 24 – Sun 25 Oct · 2 travellers", "33° · clear" (the live forecast), "Open plan", "5 stops on day 1", and "৳9,840 of ৳25,000". The stats card is under it.
- **Upcoming (02):** the compact cards, with "Plan not built yet" in amber and the route "🇧🇩 Dhaka → 🇧🇩 Cox's Bāzār".
- **A past trip:** I made a finished trip in the test account through the API (10–12 Oct).
  - It showed "Mark visited". One tap gave "3 places marked on your map" (03).
  - The card then showed "✓ On your map" (04).
- **Fixed after the first look:**
  - "Mark visited" on the right squeezed the name ("Cox's Bazar Tr…") and wrapped the dates. "Mark visited" and "On your map" now sit under the text (screenshot 04 is the new layout; 03 still shows the old one behind the dialog).
  - The route could break a flag away from its town name; they now stay together.
- **Maestro, the full suite 00–99, passed in one run** (10 of 10 flows).

**Also, your own trips, only looked at (no screenshots saved, nothing changed):** your phone was signed in to your account, so the first look was at your Trips tab. It showed "NEXT TRIP · TOMORROW", "Tue 20 – Fri 30 Oct · 5 travellers", "32° · clear", "2 stops on day 1" and your budget, all as designed. The test sign-in then signed your account out.

## 3. Commands run

- **App:** `jest` gives **293 passed** (25 suites); `tsc` and `eslint` are clean. `trips.test.tsx` was rewritten for the new tab:
  - the next trip and its countdown, with no plan requests for a trip without a plan;
  - the weather line with the first storm, the stops and the budget;
  - the compact cards with the route;
  - photos and "Mark visited" in one tap;
  - "On your map";
  - the first-trip card.
- **Backend:** unchanged in this step.

## 4. Files

- **New:** `src/features/trips/NextTripCard.tsx`, `src/features/trips/useMarkVisited.ts`.
- **Rewritten:** `app/(tabs)/trips.tsx`, `src/features/trips/StatsCard.tsx`, `src/features/trips/TripCard.tsx` (the compact card; `StopList` stays for the trip details), `src/__tests__/trips.test.tsx`.
- **Changed:**
  - `src/ui/Fab.tsx` (optional label);
  - en/bn strings;
  - Maestro `06-trip-screen.yaml` and `08-rearrange.yaml`, which open "the next trip or the first trip" (the next trip is now the card on top).
- **Removed:** `src/features/trips/MarkVisitedBanner.tsx`. The old stats card picture (`assets/trips/stats-card.jpg`) is no longer used. I left the file; say if you want it deleted.

## 5. Known issues and limits

- **The weather on the card** is for the destination, from the same forecast as the Conditions screen; it only appears once the trip has a plan.
- **"Mark visited"** shows on every past trip with places not yet on your map, including ones you said "Not now" to before (that choice was in the old banner).
- **Not checked by hand:** the tab in Bangla, at the largest font, and with TalkBack.

## 6. What I need from you

1. **Sign in again on your phone:** the test signed your account out to use the test account.
2. **Approve step 8**, or tell me what to change.
3. **Step 9 (Today mode)** needs one decision from the plan: **location while the app is open**, opt-in and never stored, used only for "leave by" from where you are. My recommendation is yes, opt-in. Your Cox's Bazar trip starts tomorrow, so Today mode would be useful soon.

# Step 9 report: Trips tab and trip stats, rebuilt

**Date:** 2026-11-16. **Status:** done. **Mockups:** frames 15 (TripsTab), 16 (TripsCardStates), 17 (TripStats) and 21 (TripsTabDark) of https://claude.ai/artifact/RMjDbAXaeW6DNQKAY8pBNN.

The Trips tab now has a fixed header and a next-trip card in the look's hero colour, with three states. One line of numbers opens a new "Your trips so far", where every number opens the trips behind it. The floating "+ Plan a trip" button, the stats card and the old stats screen are gone.

## 1. What changed

### The header (`src/ui/TabHeader.tsx`, new)

- **"Trips" stays at the top,** clear of the status bar, and the list scrolls under it. Once something is under it, a hairline shows.
- **On the right:** "+ New trip" as a blue-tint pill. It keeps the floating button's test ID (`plan-trip-fab`), so the Maestro flows that start a trip from it are unchanged.
- **For step 10:** the header has a slot for the account picture, left empty for now.
- **Built to be reused:** the other tabs can use the same header in step 10.

### The next-trip card (`NextTripCard.tsx`, rebuilt; frames 15 and 16)

It's the first thing on the tab, in the look's hero colour (navy; `cards.ts`'s orange stays only on Today's "Now" card until step 15).

- **Before the trip:**
  - **The picture:** where it goes, drawn on the phone from the app's own shapes (`PlacePicture.tsx`, new): the coast and the districts around the place in the Default map's colours, with a marigold dot. It fades into the card.
  - **Over the picture:** "NEXT TRIP" and the weather ("26° · rain likely Mon") when the forecast reaches the trip.
  - **The details:** the name, dates and travellers; the days to go in large marigold numbers; a ticket line; "Day 1 starts 09:00 · Laboni Beach"; the budget as planned of the total, with a meter (marigold and "Budget · over" when over).
  - **The buttons:** "Open plan →" and Invite (the trip's "Plan together" screen).
- **On the trip:**
  - "ON NOW" with the weather; which day ("Day 4 of 4"); today's date and how many stops are done; what's next and when to leave ("Leave by 08:50 · 7 min by CNG"). These come from the same helpers as Today and the map, so they agree.
  - Its main button says what it opens, "Open today", with "Full plan" beside it. Before, the button said "Open plan" and opened Today.
- **No plan yet:**
  - A white card: "NEXT TRIP · In 21 days", the name, "The days aren't planned yet." and "Build the plan".
  - The plan is built right there, and the plan opens when it's ready.
- **Every tap:** the whole card opens what its main button opens, and every button responds.
- **TalkBack:** the card isn't one big button, so it can reach each button inside.
- **Bangla and large text:** when "Open today" and "Full plan" don't both fit, "Full plan" goes under the main button, full width. That happens at 1.6×; in Bangla at normal size they share the row.

### The numbers (`TripNumbers.tsx`, new; frame 15)

- **One line:** "11 trips · 31 days · 1 country · 4 cities", with each word agreeing with its number ("1 trip", "1 city"). It opens "Your trips so far".
- **No finished trip yet:** it says so.
- **Replaces** the four-number card and its "All trip stats".

### The list (frame 15)

- **Each trip:** a date block (day and month; grey for finished trips), the name, the dates and the length. It replaces `TripCard`, in the same file as the route list `StopList`.
- **Kept:** "Plan not built yet" on a coming trip without a plan, and "Mark visited" / "On your map" on finished ones.
- **Removed:** the photo tiles. Photos are still in each trip's details.
- **Sections:** On now / Upcoming / With friends / Past. Pull to refresh, loading, error and the first-trip card stay.
- **The "Rate your trip" card** now sits under the numbers, so it never pushes the next trip down (step 0's finding).

### "Your trips so far" (`app/stats/trips.tsx`, rebuilt; frame 17)

- **The finished trips:**
  - how many and the days away, each scrolling down to the list;
  - the days a trip;
  - below them, "11 more coming up. Next: Khulna Trip, in 4 days". It opens the Trips tab, or "Plan a trip" when nothing is coming.
- **Where you went:**
  - "1 country · 4 cities";
  - a country opens its page (step 2's), and a city opens its trips.
- **By year:** each year with a bar, its trips and days; a year opens its trips.
- **Finished trips:**
  - each with a picture of the place;
  - "Longest" on the longest;
  - each opens its plan.
- **A year's or a city's trips:** the same screen given `?year=2026` or `?city=…`, titled "2026" or "Cox's Bazar", with "9 trips · 24 days" and the list.
- **No finished trip yet:** the card says so, and what's coming still shows.
- **Taken out:** no weeks, months or years with decimals, and no "How you travelled" (D9b).
- **From the Map dashboard:** its Trips and Days tiles now open this screen. Their own trips list is gone.

### The backend (`services/stats/trips.py`, `schemas.py`)

- **Every number comes with its trips:**
  - `finished` (the last to end first);
  - each country's and city's `trip_ids` (the most visited first);
  - each year's `trip_ids` (the newest year first).

  The app shows those trips, so each number is the length of its list.
- **Fixed: where a trip starts was counted as a place you went.**
  - The app saves "from Dhaka" as the trip's first stop, so every trip from Dhaka counted Dhaka as a city visited.
  - Now the first stop of a trip with more stops, when it has no arrival day and no way of getting there, is left out.
  - For test account A, cities went from 5 to 4.
- **City names as people write them:** "Cox’s Bāzār" from GeoNames is now "Cox's Bazar".
- **Removed from the answer:** weeks, months, years, continents, the most visited country and how you travelled. Nothing uses them any more.

### Taken away

- **Code:** `StatsCard.tsx`, the old stats screen's content, the floating button, the photo tiles in the list, and the Map dashboard's trips list (`map/list/trips`).
- **Strings:** 36, in both languages: the old stats screen's, the stats card's, the old card's, and the map list's.

## 2. How each number was checked (test account A, 16 Nov)

| Number | From the server | The trips in the database |
|---|---|---|
| Finished trips | 11 | 122, 107, 106, 105, 103, 102, 91, 90, 77, 53, 52: all ended before 16 Nov |
| Days away | 31 | 3+3+2+3+3+3+3+4+3+2+2 |
| Days a trip | 2.8 | 31 ÷ 11 |
| Countries | 1 | Bangladesh |
| Cities | 4 | Cox's Bazar (9 trips), Khulna (122), Srimangal and Sylhet (90). Dhaka was the 5th before the fix: it's where trips 122, 90 and 77 start |
| Coming up / on now | 11 / 1 | 134, 132, 131, 130, 129, 121, 120, 119, 118, 117, 95 / 123 (Khulna, 13–16 Nov) |

On the phone, each list had as many trips as its number: Cox's Bazar 9 (24 days), 2026 11 (31 days).

## 3. How it was checked on the phone

On the USB phone, dev build:
- test account A (finished trips, one on now, coming ones and drafts);
- test account B for the card before a trip, since A is on a trip today.

| Checked | Result |
|---|---|
| The header | "Trips" and "New trip" stay at the top while the list scrolls under them, with the hairline; nothing slides under the status bar. "New trip" opens New trip. |
| On the trip (A, Khulna, day 4 of 4) | As frame 16: "ON NOW · 29° · cloudy", "Mon 16 Nov · 0 of 7 stops done", "Day 4 of 4", next "Breakfast · Doi Ghor, Leave by 08:50 · 7 min by CNG", "Open today →" and "Full plan". |
| Before the trip (B, Cox's Bazar in 55 days) | As frame 15: the map picture with the marigold dot and "NEXT TRIP", "55 days to go", "Day 1 starts 10:39 · Inani Beach", "৳13,280 of ৳20,000" with its meter. Open plan, Invite ("Plan together") and the card itself each opened the right screen. |
| The numbers | "11 trips · 31 days · 1 country · 4 cities" (A); "1 trip · 2 days · 1 country · 1 city" (B). Each opened "Your trips so far". |
| The list | Date blocks; "On your map" and "Mark visited" on finished trips; the end of the list clear of the tab bar. |
| "Your trips so far" | As frame 17. "11 trips" scrolled to the list; Cox's Bazar opened its 9 trips; 2026 its 11; Bangladesh its country page; "coming up" the Trips tab; a finished trip its plan. |
| With the "Rate your trip" card (B) | Under the numbers; the next trip stays first; nothing covered. |
| Bangla | The header, the card ("এখন চলছে", "দিন ৪ / ৪ দিনের মধ্যে", "রওনা দিন ০৮:৫০"), the numbers "১১ ট্রিপ · ৩১ দিন · ১ দেশ · ৪ শহর", and "Your trips so far" with Bangla digits. |
| Largest text (1.6×) | Nothing cut off, in English and Bangla. |
| Light and dark | Both (the phone is in dark mode; light was set in the app, then put back to System). |

**Found on the phone, fixed:**
- **In Bangla, the main button was cut off.** "আজকের দিন খুলুন" was squeezed by "পুরো পরিকল্পনা" beside it. Now:
  - "Open today" is "আজ খুলুন" in Bangla;
  - neither button shrinks;
  - "Full plan" goes under the main button when both don't fit.
- **At 1.6× the main button's words became tiny.** The same change fixed it.

The phone was left on test account A, in English, with Appearance System, text size 1.0 and the Rustic theme.

## 4. Checks

| Check | Result |
|---|---|
| `npx tsc --noEmit` | clean |
| `npx eslint . --max-warnings 0` | clean |
| `npx jest` | 757 of 757 passed |
| `pytest -q` | 832 passed, 9 skipped |
| Maestro | `06-trip-screen` passed (it opens the next trip from `next-trip`). `01-tabs` passed: its first run failed later, on the Explore tab (the tap on Explore didn't register; the Trips tab's checks had passed), and its second run passed whole. |

New tests:
- **Jest, `trips.test.tsx`, rewritten for this step:**
  - the header and its hairline;
  - the card's three states and every button;
  - which card a trip gets;
  - the weather;
  - the numbers in words, also in Bangla;
  - "Mark visited";
  - the first-trip card;
  - "Your trips so far": every number opening its trips, and as many rows as trips;
  - a city's and a year's trips;
  - no finished trip.
- **Jest, contrast:** the hero card's new colours.
- **pytest:**
  - where a trip starts isn't a place you went (in the maths and through the API);
  - the trips behind each number;
  - names as people write them.

## 5. Left open

- **A trip with dates in the past counts as finished, even with no plan.** Account A's drafts 90, 77 and 53 count. "This trip didn't happen" (D19) is step 16; until then the dates decide.
- **"Mark visited" also marks where the trip started.** For a trip from Dhaka, Dhaka is marked visited (`mark_trip_visited`). The stats now leave it out, but marking doesn't; worth the same rule.
- **The evening before a trip,** the card is still "before" ("1 day to go", Open plan). Today mode opens on the trip's first day.
- **The account picture** in the header is step 10's.

## Files

- New:
  - `mobile/src/ui/TabHeader.tsx`
  - `mobile/src/features/trips/PlacePicture.tsx`
  - `mobile/src/features/trips/TripNumbers.tsx`
  - `mobile/src/features/trips/soFar.ts`
- Rebuilt:
  - `mobile/app/(tabs)/trips.tsx`
  - `mobile/app/stats/trips.tsx`
  - `mobile/src/features/trips/NextTripCard.tsx`
  - `mobile/src/features/trips/TripCard.tsx` (`TripRow`)
- Removed: `mobile/src/features/trips/StatsCard.tsx`
- Changed:
  - `mobile/app/map/dashboard.tsx`, `mobile/app/map/list/[kind].tsx`
  - `mobile/src/types/index.ts`
  - `mobile/src/ui/LineIcon.tsx` (invite, arrow right)
  - `mobile/src/ui/theme/tokens.ts` (the hero card's colours)
  - `mobile/src/i18n/en.json`, `bn.json`
  - `mobile/src/__tests__/trips.test.tsx`, `contrast.test.ts`
- Backend:
  - `backend/app/services/stats/trips.py`
  - `backend/app/schemas/schemas.py`
  - `backend/tests/test_trips_phase7.py`
- `docs/ui-refresh/prompts.md` (Status table; rule 13 now has your co-author line), this report

## Git

Committed by the agent on `main`, ending with `Co-authored-by: mdsulaimanshakil <mdsulaimanshakil@gmail.com>`, with no Claude co-author line. Nothing was pushed.

# Step 14 report: The trip plan, redesigned

**Date:** 2026-11-18. **Status:** done. **Mockups:** frames 28 (PlanBefore), 29 (PlanDay) and 30 (PlanStop) of https://claude.ai/artifact/7f9GgTspfJmCSJ49MLseTt. **Decisions:** D17, D23.

A day now reads from top to bottom as a journey: leave where you stay, the stops and the rides between them, free time, back, and where you sleep tonight. The sheet's top says where the trip is ("In 4 days"), what it costs against your budget, and each day's sky. A stop's sheet shows its time with 15 minutes less or more, the weather then, the price for one and for the group, and the hours. Every new or re-timed plan has its times on whole 5 minutes: 10:40, not 10:39.

## 1. The sheet's top (`src/features/trips/plan/PlanTop.tsx`, new; frames 28 and 29)

- **The name with where the trip is:** "In 6 days", "Tomorrow", "Day 2 of 3", "Finished".
  - One function decides it from the trip's dates and the phone's date: `planPhase` in `src/features/trips/dates.ts`. It uses the same rule as the Trips tab and the server's `trip_phase`.
  - Before the trip the chip is amber, during it blue, after it grey.
- **The trip room:** a round button beside the chip, with its unread count (it was a pill under the dates).
- **Today:** the "Today" pill stays on the days of the trip (`open-today`).
- **The dates and travellers** on their own line.
- **The budget row** replaces the small meter: "≈ ৳20,540 of ৳25,000", the meter, "৳4,460 left". It opens Budget.
  - Close to the budget it says "Only ৳1,200 left" in amber; over it, "৳21,160 over" in red. The words say it, not only the colour.
  - "≈" shows when part of the total is an estimate. The numbers are Budget's own (its total, what's left and its status).
- **Day tabs:** "Day 1", "Sun 22", and the day's sky when the forecast reaches that day.
  - Beyond the forecast (about 16 days ahead) there's no sky icon, never a guess.
  - More than three days scroll sideways, and the chosen day stays in view.

## 2. The day in a line

- **The line:** "4 places, 2 meals · ≈ ৳2,780 for 2 · 2 h on the road".
  - **Places and meals** are counted apart. The old line called meals "stops".
  - **The money** is Budget's "By day" for that day (its food, tickets and rides for the group), taken from the budget the screen already loads. The two screens now always agree. The old line left the rides out.
  - **For one traveller** it says "for you".
  - **The road time** is the day's total time on the road.
- **The chips under it:**
  - "No warnings", or "1 thing to know" / "N things to know". These are the words of the Conditions screen it opens; the chip used to say "N warnings".
  - Sunset and the sea. Each opens Conditions on that day.

## 3. The day as a timeline (frame 29)

Every row keeps what it did and its test ID; only the look changed.

| Row | Now |
|---|---|
| Getting there (day 1) | "Getting there: Dhaka → Cox's Bazar", "Plane · about 3 h 15 min · ≈ ৳6,410 each". It opens the Getting there screen, as before. |
| From where you stay | "08:55 From Hotel Beach Way · 2 min by CNG", with the time you leave. |
| A stop | See the list after this table. |
| A ride | A dotted line under the badges, then "CNG · 35 min · 16 km" and "≈ ৳480" (or "Free"). It opens the same "how to get there" sheet. Slow-traffic and boat notes stay under it. |
| Free time | A dashed row, "Free time · 45 min" with "Add". Add opens Add a stop at that point in the day. On a friend's trip it has no Add. |
| Back | "20:10 Back at Hotel Beach Way · 6 min by CNG · ≈ ৳180", with the time you're back. |
| Breakfast or dinner where you stay | Its time, then "Breakfast where you stay · 45 min · No cost". |
| Tonight | A card at the end of the day: "Tonight: Hotel Beach Way", "৳5,000 a night · nights 1 and 2", "Change". On the last day: "Last day: leave from …". A friend sees the name only. |

**A stop** shows, in order:
- its time, how long, and under them the weather in the hour it starts;
- the number badge, blue for a place and orange for a meal;
- the name;
- the kind and an honest price: "Free entry", "৳100 each", "Price not known";
- then, only when true: "For you: beaches", "Your must-do at sunset", "keeps its time", "Not checked yet", and any problem in amber or red, in words;
- the grip, only on a stop that can be dragged.

**Other changes in the timeline:**
- **The ride comes before the free time.** Free time is spent at the next place, as in the frame ("16:15 Free time · 45 min" after a 15-minute walk). It used to come before the ride.
- **The day ribbon is gone,** with its tests and its two helpers. The timeline shows the same thing.
- **Leaving and getting back** are on the 5 minutes: leaving on the mark before (you're not late), back on the mark after.

**Where I didn't copy the frame:**
- **"keeps its time" on a must-do.** The frame shows "Your must-do at sunset · keeps its time" with no grip. In the app a must-do with a time can still be moved by a drag or a reorder; only "Keep this time" holds a stop where it is. So the line says "Your must-do at sunset", and adds "keeps its time" (and drops the grip) only when "Keep this time" is on. See section 10.
- **"about" on the rides.** The frame's ride line has no "about" ("CNG · 35 min · 16 km"), so the screen follows it. TalkBack still hears "about 35 minutes". Distances in the rides are "16 km", "1.5 km", "1 km" (no ".0").

## 4. Under the day

- **"Add a stop":** a wide tinted button (`add-stop`). It adds at the end of the day, before dinner when the day ends with one, as before.
- **"Not quite right?"** (`src/features/trips/plan/ChangePlan.tsx`, new):
  - "The whole trip": More relaxed, Cheaper, Quieter, Fuller, with "Changes every day. Your must-dos stay."
  - "Only this day": "New ideas for day 1".
  - The same actions, confirmation and test IDs as before (`change-*`, `new-ideas`).

## 5. About this trip (`src/features/trips/plan/AboutTrip.tsx`, new; replaces `TripDetails.tsx`)

One list. Each row shows what's set now and opens the screen or sheet that changes it:

| Row | Second line (example) | Opens |
|---|---|---|
| Your must-dos | "Kolatoli Beach at sunset · busy Sat 21 · 18:00–19:00", or "None yet" | The must-dos screen |
| Where you stay | "Hotel Beach Way, both nights" | The stays sheet |
| Meals | "Best places to eat" | The trip's meals sheet |
| Planning together | "Invite friends to the trip room", or "3 people in the trip room" | The invite screen |
| Route | "Dhaka → Cox's Bāzār" | Edit route |
| Photos | "None yet", or "3 photos" | Opens in place, with Add for your own trip. There's no screen of a trip's photos. |
| Your preferences | "Beach, Nature · Balanced · 09:00–20:00" | Nothing: it's information only. There's no screen to change it. |

- **On a friend's trip** the rows can be read but not pressed. Where you stay and Planning together aren't shown, as before (only the owner has them).
- **Under the list:** where the plan's numbers come from, then the feedback form ("Rate this plan"). The rating card stays where it was until step 16.
- **The note's wording:** "Distances and driving times come from OpenStreetMap roads. Walking, rickshaw and CNG times, and the fares, are estimates without traffic."
  - The frame said "road times". I checked `backend/app/services/routing/modes.py`: only the distance and the driving time come from the road service.
  - A day without road data still says the old "straight-line estimates" sentence.

## 6. A stop's sheet (`StopSheet.tsx`, frame 30)

- **The top:** the stop's number badge and name, "Nature · Day 2, Sat 21 Nov" (with "★ 4.5" only when the rating is known), and a round Close button.
- **The time card:** "11:05 – 12:35", "1 h 30 there", 15 minutes less and more (quick taps send one change), and "Keep this time".
- **The facts, only those that are known:**
  - **The weather then:** "29° and partly cloudy then · rain possible (32%)". "Rain likely" from 60%, the same threshold as the server's warnings; "rain unlikely" under 30%.
  - **The price** for one and for the group: "৳100 each · ৳200 for 2". An unknown price says "Price not known" and gives no group figure.
  - **The hours:** "Open 09:00–17:00", or "Hours not checked".
  - **"Usually busy"** or "Usually quiet", when known.
- **Problems** in amber or red, in words.
- **"Why it's here"** with green ticks, then the place's description and "More about this place".
- **The buttons:**
  - Directions (blue) and Swap; then Move to another day (it opens the 30-day grid from step 8) and Remove.
  - "Suggest this place to Vromon" on your own unchecked stop.
- **Where the place comes from:** "From Wikidata · checked", "From Vromon's list · checked", "From open map data (OpenStreetMap, Overture Maps) · not checked yet".
- **A friend's stop:** the time and the facts, and Directions; nothing to change.
- **Both heights stay** (62% and 92% of the screen).

## 7. Times on whole 5 minutes (D23, the server)

- **One family of helpers** in `backend/app/services/itinerary/trip_rules.py`: `on_five` (the next mark), `before_five` (the mark before), `on_five_between` (the next mark if it still fits, else the one before).
- **The optimiser (CP-SAT):** a stop's start can only be a multiple of 5. The latest lunch and dinner sit on the mark before the end of the day.
- **The quick planner, meals where you stay, and every edit** round a start up to the next mark. The edits are: a new order, a longer stay, running late, a new stop, and a changed ride.
  - A busy time that ends off the mark (11:17) is cleared to the next mark (11:20).
  - A stop that keeps its time isn't moved. Lengths aren't rounded.
- **Existing plans** change when they're next re-timed, not by a migration.
- **New server tests:** `backend/tests/test_five_minutes.py` (10).
  - New plans from both planners, with default meals, meals where you stay and your own food: every time on the mark, no stop starting before the ride to it ends, and no hard problem (opening hours, overlaps, the day's hours, back late).
  - A busy time off the mark.
  - The edits listed above, with a kept stop left where it was.
- **Changed test:** `test_meals.py` now expects breakfast where you stay to end on the mark before you leave.

## 8. Found on the phone and fixed

1. **The weather went missing after a plan changed.** A rebuild gives the days new IDs, and a reorder changes the hour each stop starts. The screen kept the old conditions until it was reopened: "Forecast later" and no weather on the stops. A plan change now refreshes them too (new test in `tripConditions.test.tsx`).
2. **"From catalog · checked".** "catalog" is the name of Vromon's own data, not a word for travellers. It now says "From Vromon's list · checked" (Bangla: ভ্রমণের তালিকা). A source with no traveller's name isn't shown at all.
3. **A restaurant's address showed under "Why it's here".** Only reasons are under that heading now; a description stands on its own.
4. **The sun on the grey day tabs was too faint.** It's a darker marigold now in light mode (#B86E00), 3:1 on the tabs and the sheet (contrast test added).
5. **The budget row with an older answer from the server** (only the planned total) would have stopped the screen. It now falls back to that total.

## 9. How it was checked

### On the phone (test account A, dev build, then the release build)

| What | Result |
|---|---|
| A 3-day trip (129, Cox's Bazar 22–24 Nov), dark, your 0.9 | The top, the day line, the chips, the timeline, Tonight, Add a stop, "Not quite right?" and "About this trip". The rows were compared with frame 29 rendered at 3×: the time column, 30-dp badges, the dotted rides under the badges, the dashed free time, the grips. |
| Rebuild (⋮ → Rebuild the whole plan) | All 18 start times on the 5 minutes (checked through the server too). The day reads 08:55, 09:00, 10:00, 10:40, 12:40, 13:50, 15:50, 18:55. |
| A stop's sheet at both heights | Inani Beach: "Beach · Day 1, Sun 22 Nov", "10:40 – 12:40", "26° and rain then · rain possible (32%)", "Price not known", "Hours not checked", the reasons. At full height: Directions, Swap, Move to another day, Remove. |
| Add into free time | Add after Teknaf Beach opened Add a stop with places near Teknaf. Teknaf Game Reserve landed in that free time: "CNG · 41 min · 29 km ≈ ৳840", starting 16:35. Its problems showed in red and amber words with a red ring. The day line and "1 thing to know" changed at once. |
| A 30-day trip (134) | "In 22 days". The tabs scroll; Day 12, picked after scrolling, stays in view. No sky on the tabs: the forecast doesn't reach December yet. |
| A friend's trip (test account B's trip 55, opened on A's phone) | The read-only notice and no ⋮ menu. No Add in free time, no grips, no Add a stop, no "Not quite right?". Tonight without price or Change. About this trip to read only. The stop sheet has the facts and Directions only. |
| Light mode | The top and the rows as in frames 28 and 29 (amber phase chip, red "over" in words, orange meal badges). |
| Bangla at 0.9 and 1.0 | "আর ৪ দিন", "৩টি জায়গা, ৩ বেলা খাবার · ২ জনের ≈ ৳৪,৯৫০ · পথে ২ ঘ ৩০ মি", "অবসর · ৪০ মি" with "যোগ করুন", Bangla digits throughout. |
| Bangla at 1.6× | Nothing cut. Long names wrap, "৳২১,১৬০ বেশি" moves under the total, and the stop sheet's time wraps onto two lines. |
| Your phone afterwards | Text size 0.9, English, Appearance "Same as the phone". |
| Release build: open the trip 10 times | 10 of 10 twice. The first round ran offline, because the phone's USB port forwarding had dropped. The plan was drawn every time from the app's saved copy, with the weather marked "4 h ago". Online again: 10 of 10, the server got the fresh requests, and the weather was current. The release bundle was checked for the step's new words before installing. |
| Maestro (release build, `DEV_CLIENT=false`) | The nine flows that open a trip all pass. 05, 06 (with its fix below), 07, 08, 09, 12 and 14 passed the first time. 13 and 15 failed where this step moved things, and pass after their fix: 13 looked for "Tonight" at the top of the day (now the flow scrolls to the card at its end), and 15 tapped the rating card's "one by one" button after the card had grown below the screen edge (now the flow scrolls to it). The two failed runs had left their trips on account A (143, 144): deleted. |

### Checks

| Check | Result |
|---|---|
| `npx tsc --noEmit` | clean |
| `npx eslint . --max-warnings 0` | clean |
| `npx jest` | 822 of 822 passed (76 files; 794 after step 13). |
| Backend `pytest` | 845 passed, 9 skipped. |

**New and changed tests:**
- **`planDay.test.tsx` (26):**
  - the phase for each phase (with Bangla);
  - the budget row ok, close, over and exact;
  - the tabs' sky in and beyond the forecast;
  - the day line's three numbers (one traveller; no budget yet; Bangla);
  - places and meals counted; leaving and back on the mark;
  - each row kind (a stop with and without weather and price, a must-do with and without "keeps its time", For you and a problem, rides, free time with and without Add, Tonight with its nights);
  - the stop sheet with and without a forecast, a price and hours, rain likely, a friend's sheet, the source's names, a meal's description;
  - "Not quite right?";
  - "About this trip" for the owner and for a friend, and where you stay in words.
- **`tripPlan.test.tsx`:**
  - the phase on the screen and the day line with Budget's money;
  - the budget row and the rows in timeline order;
  - leaving and back times;
  - a friend's trip: no Add, no grips, no change card, a read-only stop sheet.
- **`tripConditions.test.tsx`:** a stop's weather at its hour, and the conditions asked again after the plan changes.
- **`contrast.test.ts`:** the phase chip, the badges, the Tonight card, the bed icon and the sun.
- **Updated for the new words and rows:** `stays`, `meals`, `searchAnything` ("Price not known"), `tripLegs`, `tripPlanEdit` ("1 h 30 there"), `tripReview` (AboutTrip).
- **Maestro:**
  - `06-trip-screen` looks for the day's line (`day-stats`) instead of the removed ribbon;
  - `13-stay-and-meals` scrolls to "Tonight" at the end of the day;
  - `15-rate-trip` scrolls to the rating card's "one by one" button.

## 10. Left open

- **The server's problem messages are English in Bangla.** For example: "Day 1: 'Teknaf Game Reserve' is scheduled 16:35-19:05 but is open 09:00-17:00." This was so before this step: they come from the server as sentences. The fix is to send a code and its values and write the words in the app, as the conditions already do.
- **The ride to dinner after the last visit isn't shown or counted.** After Teknaf Beach the plan says "Free time · 3 h 5 min" before dinner, but dinner is back in Cox's Bazar, about 70 km away in a straight line.
  - The same happens with a lunch between two visits: the ride "runs through" the meal.
  - This is how the planner has modelled meals since trip planner step 3, so it needs a planner change.
- **A must-do with a time can still be moved** by a drag or a reorder; only "Keep this time" holds a stop. If must-dos with a time should always hold, the server's re-timing and the drag would both treat them as kept. The line could then say "keeps its time" for them, as the frame does.
- **Older plans** keep times like 10:39 until they're re-timed (rebuilt, rearranged or changed), as the plan said.
- **USB port forwarding drops** when the phone reconnects. On-phone checks need `adb reverse` for ports 8001 and 8081 again (it happened twice today).
- **The friends' APK** wasn't rebuilt (not asked this time). This step changes the server too (D23), so it would need the server restarted as well.

## Files

- **New:**
  - `src/features/trips/plan/PlanTop.tsx`, `ChangePlan.tsx`, `AboutTrip.tsx`
  - `src/__tests__/planDay.test.tsx`
  - `backend/tests/test_five_minutes.py`
- **Removed:** `src/features/trips/plan/DayRibbon.tsx`, `TripDetails.tsx`
- **Changed (app):**
  - `app/trip/[id].tsx`
  - `src/features/trips/plan/PlanRows.tsx`, `StopSheet.tsx`, `GettingThere.tsx`, `timeline.ts`, `colors.ts`, `usePlanFormat.ts`
  - `src/features/trips/stays/BaseRow.tsx`, `TonightRow.tsx`
  - `src/features/trips/meals/StayMealRow.tsx`
  - `src/features/trips/conditions/ConditionChips.tsx`
  - `src/features/trips/dates.ts`
  - `src/features/photos/PhotoStrip.tsx` (it can leave out its heading)
  - `src/i18n/en.json`, `bn.json`
- **Changed (tests):** `src/__tests__/tripPlan`, `tripPlanEdit`, `tripConditions`, `tripLegs`, `stays`, `meals`, `searchAnything`, `tripReview`, `contrast`; `.maestro/06-trip-screen.yaml`, `13-stay-and-meals.yaml`, `15-rate-trip.yaml`
- **Changed (server):**
  - `backend/app/services/itinerary/trip_rules.py`, `cpsat_scheduler.py`, `itinerary_service.py`, `editing_service.py`, `late_service.py`
  - `backend/app/services/meals.py`
  - `backend/tests/test_meals.py`
- **Docs:** `docs/ui-refresh/prompts.md` (the Status table), this report

## Git

Committed by the agent on `main`, ending with `Co-authored-by: mdsulaimanshakil <mdsulaimanshakil@gmail.com>`, with no Claude co-author line. Nothing was pushed.

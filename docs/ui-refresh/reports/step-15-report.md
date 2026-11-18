# Step 15 report: On the trip, the plan and Today

**Date:** 2026-11-18. **Status:** done. **Mockups:** frames 31 (PlanOnTrip) and 32 (TripToday) of https://claude.ai/artifact/7f9GgTspfJmCSJ49MLseTt. **Decision:** D20 (keep both screens).

On a trip day the plan now shows where you are in the day without opening anything else:
- the plan opens on today's tab;
- a "Now" card says what's on, until when, and when to leave for the next stop;
- the day's finished stops shrink to "Done" rows.

Today has the same look as the rest of the app and can still do everything it could. "Now" and "Leave by" can no longer disagree, on either screen.

## 1. One rule for "Now" (`src/features/trips/today/today.ts`)

A new function, `nowView`, decides what "Now" says from the day's state and its "leave by". The plan's card and Today both use it.

| State | When | It says |
|---|---|---|
| Time to leave | "leave by" has come for a stop that hasn't started, whatever else is on | "Time to leave", "For Inani Beach", or "For Inani Beach · 10 min late" (in amber) |
| At a stop | a stop is on | "Radiant Fish World", "Until 11:40 · 40 min left", with a progress line |
| Free time | between stops | "Free time", "Until 11:55, then leave for Vimutti Vipassana Meditation Centre" |
| Before the day | before the first stop | "Not started yet", "Your day starts at 09:00" |
| On the way back | after the last stop, until you're back | "On the way back", "Back at Hotel Beach Way about 20:00" |
| Done | after that | "That's today done", "Nothing more planned today." |

- **The contradiction step 0 found is fixed.** "Now" said "Free time, until 18:38" while the card under it said "Leave now 15:35, you're 1 h 18 min behind".
  - Free time now ends when it's time to leave, not when the next stop starts.
  - Once "leave by" has passed, both screens say it's time to leave and how late.
  - Tests cover:
    - free time;
    - on time;
    - 5 minutes late;
    - an hour late;
    - the next stop already started (the plan then has you there, and "leave by" moves on to the stop after it);
    - being at a stop when it's time to leave for the next (time to leave wins).
- **Fixed on the way: the time you're back.** Today counted dinner where you stay as part of the outing. So after a last visit at 15:00 and dinner at the stay at 19:00, it said you'd be back after dinner.
  - The way back now starts at the last stop.
  - It's rounded up to the 5 minutes like the plan's "Back at" row. Today said "19:57" where the plan said "20:00".

## 2. The plan on a trip day (`app/trip/[id].tsx`, frame 31)

- **The top:**
  - It opens on today's tab.
  - The chip says "Day 1 of 3" in green with a dot (it was blue in step 14).
  - The line under the name is today's date: "Wed 18 Nov · 2 travellers".
- **The tabs:** days gone by say "Done" with a tick; today's says "Today". Later days show their date and sky as before.
- **The Now card** (`src/features/trips/today/NowCard.tsx`, new, shared with Today) takes the place of the day's line and chips on today's tab:
  - "NOW · 11:00";
  - what's on and until when, with a thin progress line;
  - then "Leave by 11:40", the next stop and its ride ("Vimutti Vipassana Meditation Centre · CNG 21 min"), and Directions;
  - after the last stop, the way back to where you sleep, with Directions there;
  - "Today ›" on the card opens the Today screen.
  - Another day's tab shows the day's line and chips as before. Today opens from the pill under the name there, as it does from the evening before the trip.
- **The timeline:**
  - **Finished stops** become short rows with a tick and "Done". They still open the stop's details, read only.
  - **The stop that's on** has a blue outline and "Now". **The next one** has "Next". **Its ride** shows the time to leave in blue ("11:40").
  - **Rides already taken, free time that's over, and "From <where you stay>"** once you've left are not shown.
  - **Breakfast or dinner where you stay that's over** is a "Done" row too.
- **Moving stops:**
  - Finished stops and the one that's on can't be dragged and have no grip. TalkBack's move actions skip them too.
  - Nothing can be dropped above the stop that's on. The drag keeps its landing line below it.
  - Later stops and later days work as before.
- **The map:** finished stops' pins are quieter (faded).
- **For checking a trip day**, the plan accepts the same dev-only clock in its link as Today (`vromon://trip/<id>?at=HH:MM&date=YYYY-MM-DD`), in development builds only. The phone's clock is never touched.

## 3. Today (`app/trip/today/[id].tsx`, frame 32)

- **The Now card** is in the hero colour (it was the orange "sunset" card), with the weather now in a chip ("☁ 24°") that opens Conditions. The weather is the forecast hour that has begun, shown when the forecast reaches today.
- **The "Leave by" card:**
  - the time large ("11:40") and "in 1 h 10 min", or "Leave now" and "You're 10 min behind" in red;
  - beside it "NEXT · 12:05", the stop, and its ride ("CNG · 21 min · 19.2 km · from Radiant Fish World");
  - the notes as before: usual traffic, far away, must leave before this stop ends;
  - Directions and "Running late?".
  - At large text the next stop goes under the time instead of beside it. At 1.6× in Bangla the stop's name was breaking mid-word.
- **"Running late?"** keeps its panel, its preview, "Tell the trip room" and Undo, in the same card style.
- **"The rest of today"** is one list of what's still to come (what's on now is in the Now card):
  - the next stop has "Next";
  - a stop with a warning says so in amber ("Rain likely 15:00–17:00") and opens Conditions;
  - the way back has its row: "Back at Hotel Beach Way · CNG · 2 min · ≈ ৳90".
  - The evening before the trip it shows the whole first day ("The day").
- **The three switches** are in one card:
  - "Work out 'leave by' from where I am", with "Only while this screen is open. Never saved or sent.";
  - the two reminders.
- **"Full plan"** is the blue-tint pill in the header. Its words stop growing at 1.2× so the title isn't squeezed to "আ…".
- **Not built:** "Spent today" is step 19's.

## 4. One rule for the phase everywhere

Step 14's `planPhase`/`tripPhase` (`src/features/trips/dates.ts`) is now the only place that compares a trip's dates with today.

- **On the plan:** the Today pill and the ⋮ menu's Today use it. Today still opens from the evening before ("Starts tomorrow").
- **On Today:** "Starts tomorrow" / "Starts in N days" use it.
- **Elsewhere, which compared the dates by hand before:**
  - the map's dock (now, next, planned places);
  - the map's trails of finished trips;
  - chat ("on the trip", trips to share, places to add to a trip);
  - the Trips tab (trips with friends, past trips);
  - "How was your trip?" reminders;
  - "mark as visited?".

## 5. How it was checked

### On the phone (test account A, the dev build)

Test account A had no trip under way, so I made one: trip 144, Cox's Bazar, 18–20 Nov, planned by the app's planner. All its times were on the 5 minutes. I deleted it afterwards.

**Real time** (23:28, the phone's clock):

| What | Result |
|---|---|
| The plan | Opens on "Day 1 Today", with the green "Day 1 of 3" and "Wed 18 Nov · 2 travellers". The Now card says "That's today done". Every stop is a "Done" row. |

**Set by the dev-only clock in the link** (the phone's clock untouched):

| What | Result |
|---|---|
| 07:30, before the day | "Not started yet · Your day starts at 09:00", "Leave by 08:55 · Breakfast · … · CNG 4 min" with Directions. The timeline still has "08:55 From Hotel Beach Way". |
| 11:00, at a stop (frame 31) | "Radiant Fish World", "Until 11:40 · 40 min left", the progress line, "Leave by 11:40". Breakfast "Done", the stop with its blue outline and "Now", the ride with "11:40", the next stop "Next". |
| 11:50, late | The plan: "Time to leave · For Vimutti Vipassana Meditation Centre · 10 min late", "Leave now". Today at the same time: the same words on its Now card, and "Leave now · 11:40 · You're 10 min behind". |
| Running late on Today | 15 min previewed ("…moves to 12:20…"), applied: "4 stops moved", and both cards agreed ("Free time, until 11:55" over "Leave by 11:55 · in 5 min"). Undo: "Changed back.", times as before. |
| 14:30, the map | Stops 1–4 faded; the one on now and later ones bright. |
| 14:30, dragging the next stop above the one that's on | No landing line above it; let go: the order on the server was unchanged. |
| 19:57, after the last stop | "On the way back · Back at Hotel Beach Way about 20:00", with Directions to the stay. |
| Dark at your 0.9 | All of the above. |
| Light | The plan at 11:00 compared with frame 31: the same chip, card, Done row, "Now" and "Next" pills and ride time. |
| Bangla at 1.6× | The plan: "দিন ১/৩", "দিন ১ আজ", "রওনা দেওয়ার সময়", "…-এর জন্য · ১০ মি দেরি", "এখনই রওনা দিন". Today: found and fixed the squeezed next stop and the squeezed title (section 3). |
| Your phone afterwards | English, "Same as the phone", text size 0.9. |

**Not on the phone:**
- **Turning the reminders on.** It would show Android's notification permission prompt for the dev app, which has never been allowed on your phone. Allowing it is your decision, and a refusal can stick.
  - The switch rows and their words were checked.
  - The "on" path (it asks, then schedules "Leave in 10 minutes") is covered in Jest.
- **The weather chip's tap to Conditions.** The chip was checked on the phone; the tap is in Jest.

### Checks

| Check | Result |
|---|---|
| `npx tsc --noEmit` | clean |
| `npx eslint . --max-warnings 0` | clean |
| `npx jest` | 839 of 839 passed (76 files; 822 after step 14). The first full run had the four new trip-day tests time out: an earlier test in the file ends by switching back to real timers, after which their date couldn't be set. They now set their own clock. |
| Maestro (dev build, `DEV_CLIENT=false`) | The nine flows that open a trip or Today all pass: 05, 06, 07, 08, 09, 12, 13, 14, 15. On the way, see the notes below this table. |
| Backend | not changed in this step |

**Maestro, on the way to all nine passing:**
- **Flow 09** expected the day's line on a trip that starts today. That day now has the Now card, and late at night all its stops are done and can't be changed. It now checks the Now card and rearranges on tomorrow.
- **Its failed run** left its trip (dated today) behind. Flows 06 and 08 then opened that trip, so they now accept a trip that's under way (06: the day line or the Now card; 08: works on day 2).
- **I deleted that trip through the server** while the app still had it in its list. For a while, opening it spun on "Today" (see section 6). Once the list refreshed, both passed.
- **Flow 14** failed once behind the dev build's error panel about the saved cache (section 6). It passed on the next run.

**New tests:**
- **`today.test.tsx`:**
  - what "Now" says (free time until leave by; on time; 5 minutes late; an hour late; the next stop already started, then the way back, then done; at a stop when it's time to leave; before the day; the way back not counting dinner where you stay);
  - Today's screen: the late state on both cards, free time until leave by, the evening before ("STARTS TOMORROW"), the weather chip opening Conditions;
  - the list showing only what's still to come.
- **`tripPlan.test.tsx`, on a trip day** (the clock set to the trip's first day):
  - the Now card, Today from it, and no day line;
  - the tabs and the timeline's Done, Now and Next rows, and the ride's leave time;
  - no grip or TalkBack moves on what's on now, and nothing moving above it;
  - free time, then time to leave;
  - another day's tab.
- **`contrast.test.ts`:** the Now card's words, the "Now" and "Next" pills, the green chip and "Done".

## 6. Left open

- **The weather button on the trip.** Frame 31 shows "29° · Now · Rain from 15:00". The phase table gives that to Conditions (step 17); the button shows the day's weather as before.
- **The budget row on the trip.** Frame 31 shows "৳10,160 spent of ৳25,000". That's step 19 (noting what you spent); until then it shows the plan against the budget.
- **"Leave by" from where you are** is worked out only while Today is open (its privacy promise). So with location on, Today's time can differ from the plan's Now card, which is always from the plan.
- **From step 14, still open:** after the day's last visit, the ride to a dinner restaurant isn't shown, so the free time before dinner includes it.
- **The app's saved cache can outgrow what Android reads back.**
  - **What happened:** found by Maestro flow 14. The dev build opened with "Row too big to fit into CursorWindow" while restoring its saved query cache. Its error panel covered the screen, so the flow couldn't find "New trip".
  - **Why:** the whole cache is one AsyncStorage entry, and Android can't read one back past about 2 MB. Test account A had gathered many trips, forecasts and road lines from the test runs. This isn't new in this step: the saved queries didn't change.
  - **What it does to a traveller:** the library then throws the cache away, so it heals itself. But that start has no saved trips, which means a slower start and nothing offline.
  - **Suggested fix:** cap what's saved, dropping the biggest and quickest to refetch first (the day's road lines, then forecasts).
- **A deleted trip opened from a stale list spins on "Today".** Today waits on the trip and its plan, and shows an error only when the plan fails, not when the trip itself is gone. Seen only when a trip was deleted through the server behind the app's back. Worth saying "This trip isn't there any more" instead.
- **The friends' APK** wasn't rebuilt (not asked).

## Files

- **New:** `src/features/trips/today/NowCard.tsx`
- **Changed (app):**
  - `app/trip/[id].tsx`, `app/trip/today/[id].tsx`
  - `src/features/trips/today/today.ts`
  - `src/features/trips/plan/PlanRows.tsx`, `PlanTop.tsx`, `DayMap.tsx`, `useStopDrag.ts`
  - `src/ui/theme/tokens.ts` (`heroLink`, `heroWarning`)
  - `src/i18n/en.json`, `bn.json`
- **The phase rule:**
  - `src/features/trips/dates.ts`
  - `src/features/chat/onTheTrip.ts`, `src/features/chat/cards/actions.tsx`, `app/chat/[id].tsx`
  - `src/features/map/dockState.ts`, `src/features/map/tripGeo.ts`
  - `src/features/trips/review/review.ts`
  - `app/(tabs)/trips.tsx`
- **Tests:** `src/__tests__/today.test.tsx`, `tripPlan.test.tsx`, `contrast.test.ts`
- **Maestro flows:**
  - `06-trip-screen`: the day line, or the Now card on a trip day.
  - `08-rearrange`: on a trip that's under way, it works on day 2 and moves the stop to the other day.
  - `09-journey`: checks the Now card, then rearranges on tomorrow, because today's finished stops can't change.
- **Docs:** `docs/ui-refresh/prompts.md` (the Status table), this report

## Git

Committed by the agent on `main`, ending with `Co-authored-by: mdsulaimanshakil <mdsulaimanshakil@gmail.com>`, with no Claude co-author line. Nothing was pushed.

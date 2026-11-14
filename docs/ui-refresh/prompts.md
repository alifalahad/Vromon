# UI refresh: one prompt per step

**Written:** 2026-11-13, against `main` at `af9dddb` (clean working tree).
**From:** the owner's nine points and 19 phone screenshots of 2026-11-13, plus two requests for the whole app (the account picture on every tab; a more polished look).
**Area:** the Map tab, the New trip screens, the trip screen (the plan, Today, Conditions, Budget), the Trips tab, Explore, Settings. Mostly `mobile/`; steps 5, 9, 11, 12, 14 and 16–19 also touch `backend/`.
**Mockups:** https://claude.ai/artifact/RMjDbAXaeW6DNQKAY8pBNN (40 frames: 1–21 approved 2026-11-13; 22–27, Explore and Settings, and 28–40, the trip plan, Conditions and Budget before, on and after the trip, approved 2026-11-14. See "The look" below for how to read them.)

## Status

| Step | Your point | What | Status | Report |
|---|---|---|---|---|
| 0 | all | Look at today's screens, try the globe, make mockups, answer the decisions (no app code) | ✅ done 2026-11-13 (look approved; D1–D14 answered); Explore and Settings frames (D15, D16) and the trip plan, Conditions and Budget frames (D17–D23) added 2026-11-14 | [step-0-report.md](reports/step-0-report.md) |
| 0b | (whole app) | The look's foundations: colours, the title font, the tab bar, the Default map colours | not started | |
| 1 | 1 | Map: a globe when zoomed far out | not started | |
| 2 | 2 | Map: the top-left button and a travel dashboard in place of "Your story" | not started | |
| 3 | 3 | Map: the Map sheet's switches and themes, and a new Map Theme screen | not started | |
| 4 | 4 | New trip: weekday only under the dates; type the number of travellers | not started | |
| 5 | 5 | New trip: getting there (optional, precise location, ways to get there) | not started | |
| 6 | 6 | Must-dos: type the busy time's From and To | not started | |
| 7 | 7 | Trip screen: the row of buttons over the map | not started | |
| 8 | 8 | Trip screen: drag and drop that works for long trips | not started | |
| 9 | 9 | Trips tab and trip stats, rebuilt | not started | |
| 10 | (all tabs) | The account picture, top right on every tab's front page | not started | |
| 11 | (screenshots 3, 5) | The hotel list: only places to stay | not started | |
| 12 | (asked 2026-11-14) | Explore, redesigned: "Your country" and "The world" | not started | |
| 13 | (asked 2026-11-14) | Account and settings, redesigned | not started | |
| 14 | (asked 2026-11-14) | The trip plan: the sheet, the day as a timeline, a stop's sheet | not started | |
| 15 | (asked 2026-11-14) | On the trip: the plan's "Now" card and Today | not started | |
| 16 | (asked 2026-11-14) | After the trip: the trip as it was; "This trip didn't happen" | not started | |
| 17 | (asked 2026-11-14) | Conditions, before, on and after the trip | not started | |
| 18 | (asked 2026-11-14) | Budget, redesigned | not started | |
| 19 | (asked 2026-11-14) | What you really spent: noting it, Budget on and after the trip | not started | |
| 20 | (whole app) | Polish pass, full checks, the friends' APK | not started | |

Steps 1–9 have the same numbers as your nine points.

## How to use this file

1. Run **one step per session**. Copy the step's **Prompt** block and paste it into the coding agent (or say "start step N of the UI refresh").
2. The agent reads "Rules for every step" below, the step's section, the mockups and the previous report. It builds the step, checks it on the phone, writes `docs/ui-refresh/reports/step-N-report.md`, updates the Status table above, and **stops**.
3. You check the step on your phone ("You check" in each step), then approve it or ask for fixes.
4. The agent never commits or pushes. Each report ends with the git commands for you.

**Order.** Step 0 is done. Run step 0b next: it puts the approved colours and the title font into the app's theme, so the whole app changes together and every later step builds on the same base. Steps 1–9 don't depend on each other, so after 0b you can run them in any order. Step 10 comes after step 9 (it uses the fixed header that step 9 builds). Steps 11, 12 and 13 are independent. The trip's own steps run in this order: 7 and 8 first, then 14, then 15 and 16 in either order. Step 17 needs step 7. Step 18 is independent. Step 19 needs step 18 (and uses step 15's Today and step 16's finished trip: where one isn't built yet, step 19 leaves that row out and says so). Step 20 is last. Step 1 (the globe) has the most unknowns and adds a library with native code; steps 4 and 6 are the smallest; steps 14, 17 and 19 are the largest.

## What the screenshots showed

The screenshots aren't in the repository (two of them show your profile photo). This is what each one showed, so a later session can find the same screen.

| # | Screen | What it showed |
|---|---|---|
| 1 | New trip, step 1 | Under the From and To date fields: "Friday, Nov 20" and "Sunday, Nov 22" (circled in red), tight against the Travellers card. Travellers: − 2 +. |
| 2 | New trip, step 1, lower | "Getting there": "Start from my current location", "Where from?" search, "How do you like to travel?" with Plane, Train, Bus, Car, "Launc…" (cut off), "Suggest by my budget". |
| 3, 5 | New trip, step 2, the hotel list | Every hotel reads "Standard · Price not known". A sweet shop (হক মিষ্টান্ন ভান্ডার) is in the hotel list. |
| 4 | New trip, step 2 | Budget: the amount's hint is cut to "Type an"; "≈ ৳50 each" under an empty amount (2 travellers, 5 nights). "Your day": "finish by" wraps and its time drops to a second line. |
| 6 | The stays sheet, "All 5 nights" | Let Vromon pick, With family or friends, Day trip (chosen), Decide later, then the hotels. |
| 7 | "Where do they live?" | The place picker with the keyboard open. |
| 8 | The Meals sheet | Breakfast and Dinner have three choices, Lunch has two. |
| 9 | Map tab, zoomed far out | The flat world map. A black wedge shows past its bottom edge. Top left: "3 countries · 1.5% of the world". |
| 10 | "Your story" | "YOUR STORY / Your Bangladesh / 3 of 8 divisions", the eight divisions as boxes, four number tiles, "New places each year". |
| 11 | The Map sheet | "On the map": Trip trails, Places Vromon can plan, Friends (switches). "Theme": Default, Midnight, Serenity, Rustic, "All themes". |
| 12 | Map Theme | A sample map of Europe, Map / Friends, Themes · Colors · Styles, a sideways row of striped cards, Apply. |
| 13 | "A time you're busy" | Day 1–3, From and To as rows of half-hour chips (16:00, 16:30, 17:00…), "What is it?", "Keep Day 1 16:30–21:30 free". |
| 14 | Trip screen | Over the map: back arrow, "Updated 22 min ago" with a refresh icon, a fit button, ⋮. Below them: Satellite, 3D, Full map. |
| 15 | Trip screen, dragging a stop, 3 days | A "Drop on a day to move it there" box with Day 2 and Day 3, covering the trip's name. |
| 16 | The same on a 30-day trip | The box holds Day 2 … Day 30 and covers the whole screen. |
| 17 | Trips tab, scrolled a little | The "Trips" title has slid up under the status bar. An orange next-trip card. A card with 2 Trips, 9 Days, "1 Countries", "1 Cities" and "All trip stats". The "+ Plan a trip" button covers part of a trip row. |
| 18, 19 | All trip stats | Travel time: 9 total days, 1.29 weeks, 0.30 months, 0.02 years. Average 4.5 days. Longest trip, most visited country, trips per year, how you travelled. "Only finished trips count." |

## Decisions (answered by the owner on 2026-11-13)

A step follows the answer in the last column.

| # | Question | Answer |
|---|---|---|
| D1 | **The globe: how?** | The installed map library can't draw a globe (step 0 checked). Vromon draws its own, on the phone, from the country shapes in the app. **A library with native code is fine (Skia, or something better if it exists); rebuilding the apps is not a problem. No API call, nothing fetched.** |
| D2 | **The dashboard, and what stays from "Your story"** | A full screen opened from the top-left button, as in frames 3–5. **Replay and the poster both stay**, as two small buttons at the bottom. |
| D3 | **Map Theme** | **As in frame 7:** all themes first, then "Make your own" (colours, map style). The Map / Friends switch becomes a "With a friend" button on the preview. |
| D4 | **Travellers: the largest number you can type** | 50, as today (`MAX_TRAVELLERS`). Not asked; the default stands. |
| D5 | **Getting there: which lines come off which maps?** | **Off the trip's own maps only.** The dotted line to the next trip on the Map tab stays (frame 1). The way there stays as the "Getting there" card on day 1, the journey screen and the budget line. |
| D6 | **Typed times: where?** | **The busy time in step 6.** The other times (the day's start and finish, arriving and leaving, a must-see's time) get it in step 20 if the owner likes it on the phone: ask then. |
| D7 | **Trip screen, the row over the map** | **As in frames 11–12:** the weather button (the largest) on the left; one map-options button, Full map and ⋮ on the right. No back arrow. Refreshing the weather moves to the weather screen. |
| D8 | **Dragging to another day** | **The strip of frames 13–14 is right. A far move (day 1 to day 10) must also be easy and smooth:** the strip scrolls by itself, faster the longer the finger stays at its edge, and the thin track under the chips is a fast lane (sliding along it jumps through the days). |
| D9 | **Trips tab: what doesn't work?** | **"Don't hide anything. Everything should show every time."** Nothing on the tab may be covered by something else or slide under the status bar; nothing important may need a scroll or a second tap to find. Step 0 found: the "+ Plan a trip" button covers "All trip stats" until you scroll; scrolled content shows under the status bar; during a trip "Open plan" opens Today. |
| D9b | **Stats and the "New trip" button** | **As in frames 15 and 17:** one line of numbers on the Trips tab opens "Your trips so far"; "New trip" sits in the header. **"How you travelled" is not important: leave it out.** The stats screen shows only what matters, and looks the part (frame 17 was redone after this answer). No weeks, months or years with decimals. |
| D10 | **The account picture** | 32 dp picture in a 48 dp touch area, the same spot on all four tabs, opens Settings (frames 1, 15, 18, 19). As asked; not a question. |
| D11 | **Things seen in screenshots 3–8** | **Fix the hotel list: hotels must be places to stay, not a restaurant or a shop** (step 11, which also looks at every row reading "Standard · Price not known"). The budget hint, the "Your day" row and the lunch choices were not chosen: leave them. |
| D12 | **The look** | **Approved:** the look of the 21 frames (see "The look" below). |
| D13 | **The Default map colours** | **Light-blue water and pale land become Default; today's grey stays in the list as "Classic".** |
| D14 | **A title font** | Part of D12: Anek Bangla for titles and large numbers, in English and Bangla. One font file bundled with the app; body text stays the phone's own font. |
| D15 | **Explore's first half** (owner, 2026-11-14) | **It says "Your country", not "Bangladesh".** It shows the home country from the profile. The switch reads "Your country" and "The world"; the card below still names the country. |
| D16 | **Explore and Account settings** (owner, 2026-11-14) | **Both are redesigned too**, in the approved look: frames 22–25 (Explore) and 26–27 (Settings). Approved by the owner on 2026-11-14. |
| D17 | **The trip plan, Conditions and Budget** (owner, 2026-11-14: "our best feature is the trip itinerary"; "this may change during trip and after trip") | **All three are redesigned for three phases: before, on and after the trip.** Frames 28–40, approved by the owner on 2026-11-14. Frame 11's sheet was redrawn to match frame 28. The logic behind them is fixed in the same steps (14–19). |
| D18 | **Noting what you spent** | **Yes, add it.** The traveller notes an amount (one tap from the day's plan, or typed). Budget then shows what's spent against the plan, on the trip and after it (step 19). |
| D19 | **A trip that was planned but not taken** | **Yes: "This trip didn't happen".** Such a trip is not counted in "Your trips so far", is not offered for rating or for the map, and stays in the list marked "Not taken" (step 16). |
| D20 | **Today and the plan on a trip day** | **Keep both screens.** Today stays the quick screen for the day; the plan gets a "Now" card (step 15). The Trips tab card keeps "Open today" and "Full plan". |
| D21 | **A finished trip's plan** | Read-only, kept as it was. "Plan it again" makes a copy with new dates. Drawn in frame 33 and approved with it. |
| D22 | **The weather for a day that's over** | Shown "as it was", from the weather service's records, on the trip and after it. No warnings for such a day. Drawn in frames 33 and 36 and approved with them. |
| D23 | **Times in a plan** | On whole 5 minutes (10:40, not 10:39), as the frames show. Not asked: the agent's choice, so the plan reads like one a person wrote. Say if exact minutes should stay. |

## The look (approved 2026-11-13)

The frames are the reference. Read one with the Artifact tool: `action: read`, the mockups link, `path: project/<file>`. Each file is plain HTML with every colour and size written inline. Copy the numbers from there; don't round them.

| Frame | File | Screen |
|---|---|---|
| 1 | `Main.dc.html` | Map home: the travel button, the account picture, the map buttons, the tab bar |
| 2 | `MapGlobe.dc.html` | The globe |
| 3, 4, 5 | `MapDashboard.dc.html`, `MapCountry.dc.html`, `DashboardEmpty.dc.html` | "Your travels", a country's page, a list with nothing yet |
| 6, 7 | `MapSheet.dc.html`, `MapTheme.dc.html` | The Map sheet, Map theme |
| 8, 9 | `NewTripWhen.dc.html`, `NewTripGettingThere.dc.html` | New trip: weekday only, typed travellers, getting there before and after a start |
| 10 | `BusyTime.dc.html` | A time you're busy |
| 11, 12 | `TripScreen.dc.html`, `TripLayers.dc.html` | Trip screen: the top row, the map options. Frame 11's sheet was redrawn on 2026-11-14 to match frame 28: step 7 builds the top row, step 14 the sheet |
| 13, 14 | `TripDrag3.dc.html`, `TripDrag30.dc.html` | Moving a stop to another day |
| 15, 16, 17 | `TripsTab.dc.html`, `TripsCardStates.dc.html`, `TripStats.dc.html` | Trips tab, the next-trip card's other states, "Your trips so far" |
| 18, 19 | `ExploreHeader.dc.html`, `FriendsHeader.dc.html` | The account picture on Explore and Friends (18 was redrawn to match frame 22) |
| 20, 21 | `MapHomeDark.dc.html`, `TripsTabDark.dc.html` | Dark appearance |
| 22, 23 | `ExploreHome.dc.html`, `ExploreMore.dc.html` | Explore, "Your country": the top, then districts by division and GI foods |
| 24 | `ExploreWorld.dc.html` | Explore, "The world" |
| 25 | `ExploreDistrict.dc.html` | A district's page |
| 26, 27 | `Settings.dc.html`, `SettingsProfile.dc.html` | Account and settings (the whole page), Edit profile |
| 28, 29, 30 | `PlanBefore.dc.html`, `PlanDay.dc.html`, `PlanStop.dc.html` | The plan before the trip (the sheet pulled up), a whole day from top to bottom, a stop's sheet |
| 31, 32 | `PlanOnTrip.dc.html`, `TripToday.dc.html` | On the trip: the plan with its "Now" card, Today (the whole page) |
| 33 | `PlanAfter.dc.html` | After the trip: the trip as it was |
| 34, 35, 36 | `ConditionsBefore.dc.html`, `ConditionsOnTrip.dc.html`, `ConditionsStates.dc.html` | Conditions before the trip and on it (whole pages), and its other states |
| 37, 38, 39, 40 | `BudgetBefore.dc.html`, `BudgetOnTrip.dc.html`, `BudgetAdd.dc.html`, `BudgetAfter.dc.html` | Budget before the trip, on the trip, noting what you spent, after the trip |

Frames 28–40 follow one example trip (Cox's Bazar, Fri 20 – Sun 22 Nov, two travellers, a ৳25,000 budget) before it starts, at 11:30 on its second day, and after it ends. Their numbers add up across the frames, so a step can check its sums against them.

### The trip's three phases (frames 28–40)

The phase comes from the trip's dates and the phone's date: before (today is earlier than the first day), on the trip (the first day to the last, both included), after. One function decides it (step 14); nothing else compares dates.

| | Before | On the trip | After |
|---|---|---|---|
| The chip beside the trip's name | "In N days", "Tomorrow" | "Day X of Y" | "Finished", or "Not taken" |
| The weather button | The chosen day's forecast, or "Forecast from <date>" | Today: now, and the next rain. Other days: forecast, or as it was | As it was |
| The budget row | "≈ ৳… of ৳…", what's left | "৳… spent of ৳…" (the plan's estimate if nothing is noted) | "It cost ৳…", under or over (the plan's estimate if nothing is noted) |
| The top of the sheet | The day's line and chips | The "Now" card on today's tab | "Your trip" with your rating, the map offer, "Plan it again" |
| The day's rows | Can be changed | Done, now, next; later stops can be changed | Read-only, with your ratings |
| Conditions | The forecast, what to know, "Move to …" and "Keep" | Now, the next hours, the rest of today | Each day as it was |
| Budget | The plan against your budget, ways to save | Spent so far, today, what's still to come | What it cost against the plan |

The system behind the frames (step 0b puts it into `mobile/src/ui/theme/tokens.ts`; names there may differ):

| | Light | Dark |
|---|---|---|
| Background | `#F3F5F9` | `#0B111A` |
| Card | `#FFFFFF` | `#141C28` |
| Inset (chips, quiet buttons) | `#EEF1F6` | `#1C2634` |
| Line | `#E1E6EE` | `#253142` |
| Text | `#0F1B2D` | `#EEF2F7` |
| Second text | `#46546A` | `#A9B4C3` |
| Quiet icons | `#5F6C82` | `#8794A7` |
| Blue (buttons, selected) | `#2459D6` | `#2F6BE6` |
| Blue text and links | `#1D4BB8` | `#8AB4F8` |
| Blue tint | `#E7EEFC` | `#17284A` |
| Hero card (the next trip, the dashboard's top) | `#0F1B2D` | `#16233A` |
| Second text on the hero | `#B9C6DA` | `#B9C6DA` |
| Marigold (the one highlight: countdowns, "On now") | `#FFB547` | `#FFB547` |
| Good / its tint | `#157F4B` / `#E3F4EB` | check contrast when added |
| Good as text on its tint | `#0E6238` | check contrast when added |
| Warning: text / icon / tint | `#8A5300` / `#B26A00` / `#FFF1D6` | check contrast when added |
| Danger: text / tint | `#B3261E` / `#FDECEA` | check contrast when added |
| On the hero card: good / warning text / the meter and its track | `#7BD8A5` / `#FFD08A` / `#6FA0FF` on `rgba(111,160,255,0.26)` | the same |
| Visited / lived on the map | `#F08E35` / `#A6540F` | `#F1AD48` / `#C2701B` |
| Budget's five parts, always in this order: getting there, stay, food, tickets, local travel | `#2459D6`, `#E8703A`, `#14A38B`, `#EDA100`, `#D9628F` | `#4C86F0`, `#E0703C`, `#1FA98C`, `#C98500`, `#D9628F` |
| The lighter track behind each part's bar | `#D9E3F8`, `#FBE0D3`, `#D2EFEA`, `#FBECC8`, `#F8DDE7` | choose a darker step of each and check it |

- **Type:** titles and large numbers in Anek Bangla 700 (screen titles 24, tab titles 32, hero numbers 40–46); everything else in the phone's font (16 body, 13–14 second lines, 12.5 bold with wide spacing for small section labels).
- **Shapes:** cards 20–22, hero cards and sheets 28, buttons fully round (50–54 high), chips fully round. Touch targets 48.
- **Depth:** cards barely lift (`0 1px 2px` at 5%); things over a map and hero cards lift clearly.
- **Marigold is used sparingly** and never as text on white. Every colour pair still has to pass `contrast.test.ts`.
- **One hero per screen.** Everything else is a quiet white card.
- **Charts and meters** (Conditions, Budget):
  - One measure per drawing. Two measures get two drawings that share the hours or the days, never two scales on one.
  - Thin marks: bars at most 24 dp thick, rounded 4 dp at the value's end and square at the baseline; lines 2 dp; a 2 dp gap between pieces that touch.
  - A few values are written on the drawing (the highest, the first and last), not every one. Numbers and labels use the text colours, never a bar's or a line's colour. Inside a piece of the Budget bar the text is white on the blue and `#0F1B2D` on the other four.
  - The five part colours are used in their order, never by size, and only for Budget's parts. Both sets were checked on 2026-11-14 for people who see colours differently, each on its card colour; the yellow is faint on white, so every part also has its name and amount beside it.
  - Good, warning and danger colours always come with an icon or words.
  - A meter's track is a lighter step of its fill.

## Rules for every step

### Building

1. **Read first:** `mobile/AGENTS.md`, `docs/architecture.md`, this file (Decisions with your answers, these rules, the step's section), the mockups, and the previous step's report. Routes live in `mobile/app/`. Never hand-edit `mobile/android/`.
2. **Follow the mockup and the answers.** Where the mockup and this file disagree, the mockup wins (it's what the owner approved); say so in the report.
3. **Minimal.** A step removes what it replaces: the old component, its strings, its tests. No new screen where an existing one can be changed.
4. **No fake data.** Every number comes from the API or the traveller. Unknown stays unknown and says so. A count that opens a list must match the list.
5. **Theme tokens only** (`mobile/src/ui/theme/tokens.ts`): no colour, size or radius written by hand in a screen. New colour pairs go into `src/__tests__/contrast.test.ts` (AA).
6. **Every string through i18n**, English and Bangla, Bangla digits (`usePlanFormat`, `localDigits`). `src/__tests__/translations.test.ts` keeps passing.
7. **Accessibility:** 48 dp touch targets, labels on icon buttons, colour never the only signal, a route without gestures for every gesture, nothing cut off at the largest text (1.6×).
8. **Maps:** a map that gets things mounted over it afterwards uses `androidView="texture"` (as `DayMap.tsx` does). MapLibre can't shape Bangla text: names on the map stay English.
9. **Test IDs:** keep an ID when the thing still exists. When one goes or changes, update every Maestro flow (`mobile/.maestro`) and Jest test that uses it, in the same step.
10. **Formatting:** there's no prettier config. Format only files you create (`prettier --single-quote --print-width 160 --trailing-comma all`). Edit existing files by hand in their own style.
11. **Dependencies:** `npx expo install`. Read the Expo docs for the installed SDK (57) before using an Expo API. Before adding a library with native code, say so and wait for the owner's yes: it means rebuilding the dev app and the friends' APK.
12. **Before reporting a step done**, run what GitHub CI runs:
    - `mobile/`: `npx tsc --noEmit`, `npx eslint . --max-warnings 0`, `npx jest`. Baseline 2026-11-13: 657 passed.
    - `backend/` (when touched): `venv/bin/python -m pytest -q`. Baseline: 825 passed.
    - Run them once before changing anything and note the numbers.
13. **Do not commit, push or open a PR.** End the report with the git commands for the owner.
14. **End the step** with `docs/ui-refresh/reports/step-N-report.md`: what changed and why, the files, how each part was checked (tests, phone screenshots described in words), what's left open. Update the Status table. Then stop.

### Testing safely

- **The phone is the owner's real realme** (USB, `adb -s b5649424`); never an emulator. It gets real calls: before every tap, check Vromon is in front and no call is active (`scripts/dev/phone.sh` does this). One input, then a screenshot.
- **Writes only as the test accounts** (`.env.e2e.local` at the repo root; `python3 scripts/e2e/session.py A|B` prints a token). Never print the passwords.
- **The owner's account is read-only:** `backend/venv/bin/python scripts/dev/readonly_proxy.py` (port 8011), then `adb reverse tcp:8001 tcp:8011`; undo with `adb reverse tcp:8001 tcp:8001`. Signing the phone into a test account signs the owner out everywhere: tell the owner first.
- **Running the app:** `docs/running-locally.md`. Backend on port 8001, Metro with `npx expo start --dev-client --clear`, `adb reverse` for 8081 and 8001 (a USB reconnect drops them). Builds and Maestro run in the background.
- **Release builds** hide and show different bugs than debug builds. For anything about maps, sheets or things drawn over a map, also check a release build of the dev app (`./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a` in `mobile/android`) and repeat the action 8–10 times. After a change to only `en.json` / `bn.json`, delete the bundle folders first (`android/app/build/generated/assets/react/release`, `…/generated/res/react/release`, `…/intermediates/sourcemaps/react/release`) or the old strings ship.
- **Drags on the phone:** `adb shell "input motionevent DOWN x y; sleep 0.8; input motionevent MOVE x y2; …; input motionevent UP x y2"` (`input draganddrop` doesn't work with the gesture library).
- **Each visual step is checked** in light and dark, in Bangla, and at the largest text (`adb shell settings put system font_scale 1.6`, back to `1.0` afterwards).

---

## Step 0: Look, try, mock up, decide (no app code)

**Done 2026-11-13** ([report](reports/step-0-report.md)). Kept here for the record.

**Goal:** you see the new look on one page and answer D1–D11 before anything is built.

### Prompt

```
Start step 0 of docs/ui-refresh/prompts.md. Read the whole file first. No app code in this step.

1. Look at today's screens on the phone (dev app; the owner's account through the read-only proxy, or
   test account A with the owner's OK): every screen named in steps 1–10. Note anything that differs
   from the "Today" lines in this file.
   Trips tab (D9): try every tap, at the top and scrolled: the next-trip card and "Open plan", the
   four numbers, "All trip stats", each trip row, "+ Plan a trip". Write down exactly what fails or
   is hard to hit.

2. The globe (D1), one hour at most: can the installed map library (@maplibre/maplibre-react-native
   11.5.0, native Android 13.6.1) draw a globe? Read its docs for those versions, then try it on the
   phone with a temporary edit to mobile/src/features/map/WorldMap.tsx (the style's projection).
   Undo the edit before the step ends. Report yes or no, and what turning and zooming felt like.

3. Mockups: one page (an Artifact) with phone-sized frames, light and dark, using the app's own
   tokens (mobile/src/ui/theme/tokens.ts) and real example data:
   - Map tab: the globe; the top-left button; the account picture; the dashboard (home, a country's
     page, an empty tile); the Map sheet; the Map Theme screen;
   - New trip: the dates with weekday only and the typed travellers; "Getting there" before and after
     a start is chosen; the busy-time sheet;
   - Trip screen: the row over the map and the layers panel; dragging a stop on a 3-day and a
     30-day trip;
   - Trips tab: the fixed title, the next-trip card (before the trip, on the trip, no plan yet), the
     numbers line, the list; the stats screen;
   - the account picture on Explore, Trips and Friends.
   One look for all of them: spacing, type sizes, corners, button heights, sheet headers.

4. Ask the owner D1–D11 (two or three at a time, each with its recommendation and the mockup frame
   it concerns). Write the answers into the Decisions table.

Put the mockups link at the top of this file. Write reports/step-0-report.md (what was looked at,
the globe result, the Trips tab findings, the answers), update the Status table, stop.
```

### Done when
- The mockups link is at the top of this file and you've said the look is right (or what to change).
- D1–D11 each have an answer.

### You check
The mockup page: is this the app you want? Say what to change before step 1 starts.

---

## Step 0b: The look's foundations (the whole app)

**Goal:** the approved colours, the title font and the tab bar are in the app, so every screen changes together and the later steps only change layout.

**Today:** `mobile/src/ui/theme/tokens.ts` holds the colours (grey background `#F5F5F5`, blue `#2563D9`, near-black text), sizes and radii; every screen reads them through `makeStyles`. No font is bundled: titles use the phone's font. The tab bar is in `mobile/app/(tabs)/_layout.tsx`. The Default map theme is grey (`THEMES` in `src/features/mapThemes/catalog.ts`); a light-blue base map already exists in the same file as the "Default" map style. The orange next-trip and "Now" cards take their colour from `src/ui/theme/cards.ts`.

### Prompt

```
Start step 0b of docs/ui-refresh/prompts.md (the look's foundations). Read the rules, "The look",
D12–D14, frames 1, 15, 20 and 21, and reports/step-0-report.md.

1. Colours: put the look's light and dark values into tokens.ts. Keep the token names; add the few
   new ones (the hero card, the second text on it, marigold, the blue tint). Update
   contrast.test.ts for every pair the frames use. Where a pair fails, adjust the shade and say
   which one in the report.
2. The title font: Anek Bangla (SIL Open Font License), bundled with the app so it needs no network
   (expo-font; read the Expo 57 docs for the way to embed it). One `title` font token, used by
   LargeTitle, screen titles and large numbers. Check Bangla text and Bangla digits in it, and that
   nothing is cut at 1.6×. Add its licence where the app lists licences.
3. Shapes and depth: radii, button heights and shadows per "The look", through the tokens and the
   shared pieces in src/ui (Button, Fab, the card style). No screen gets numbers of its own.
4. The tab bar per frame 1: the selected tab's icon sits on a blue-tint pill. The labels keep
   today's rule (they grow up to 1.25×).
5. The Default map (D13): the Default theme takes the light-blue base map with the orange marks;
   today's grey becomes a theme named "Classic". Someone who had Default keeps "Default" and so
   gets the new colours; nobody's saved theme breaks (normalizeUserMapTheme in resolve.ts, the
   preferences sync). catalog.ts stays pure data; rebuild the thumbnails if
   scripts/map-themes/build.py needs it. Dark appearance per frame 20.
6. The orange cards (cards.ts) stay until steps 9, 15 and 20 replace them; make sure they still pass
   contrast on the new background.
7. Go through every screen of the app once, light and dark, for what the new colours break (text
   on tinted chips, borders that vanish, buttons over maps). Fix through tokens and shared pieces.
8. All checks (rules). Phone as test account A: the four tabs, a trip, New trip, a chat, Settings;
   light, dark, Bangla, 1.6×. Release build of the dev app. Maestro 03-theme-rustic and
   10-map-home still pass.

Write reports/step-0b-report.md, update the Status table, give the git commands, stop.
```

### Done when
- Every screen has the new colours and titles in both appearances, with no screen changed by hand.
- The map opens light blue; "Classic" is in the theme list; a saved theme still loads.
- All contrast tests pass.

### You check
Open each tab, a trip and Settings in light and dark. Does it already feel like the mockups, before any layout has changed?

---

## Step 1: Map, a globe when zoomed far out (your point 1)

**You asked:** zoomed out further, the map becomes a globe you can turn in any direction, without any API. Zoomed in, it works as now.

**Today:** `mobile/src/features/map/WorldMap.tsx` is one flat map for every zoom. The earth button flies to zoom 1.6 (`WORLD_ZOOM`); past the map's edge it shows a black wedge (screenshot 9). Zoom levels are in `levels.ts` (below 4.6 a tap marks a country). The country shapes and name points are bundled: `mobile/assets/geo/countries.json`, `country-labels.json`. Step 0 found that the installed map library (MapLibre Native 13.6.1 for Android) has no globe: there is none in its code, and the project's news of August 2026 speaks only of a proposed change, not a release. The bundled countries are 242 shapes with 38,134 points; projecting all of them and building their outlines takes 5.4 ms a frame in Node on the Mac, and the phone's JavaScript engine will be several times slower. So re-projecting every shape on every frame is not the way.

### Prompt

```
Start step 1 of docs/ui-refresh/prompts.md (the globe). Read the rules, D1 and its answer, the
mockup (frame 2), and reports/step-0-report.md (what the globe check found).

Goal: zoomed out past the world view, the Map tab shows the earth as a globe that turns in any
direction under a finger. Zooming in brings back today's flat map, unchanged. Nothing is fetched for
the globe: it draws from the shapes bundled in the app.

1. How it's drawn, per D1 (the map library has no globe; a library with native code is allowed;
   nothing is fetched). Frame 2 is the look:
   - recommended: @shopify/react-native-skia. Draw the world once on the phone as a flat picture
     (longitude across, latitude down) from the bundled countries in the theme's colours, the
     marked ones in theirs; redraw it only when a mark or the theme changes. A small shader wraps
     that picture onto a sphere, so turning costs the same however detailed the shapes are, and the
     shading and the glow at the rim come from the same shader. Names are drawn over it at their
     projected points. Read the Skia docs for the installed Expo SDK before starting;
   - first spend half an hour on whether something fits better (a 3D view through expo-gl, for
     example); say in the report why Skia or the other was chosen;
   - if the shader route fails on the phone, fall back to projecting simplified shapes each frame
     with Skia paths, and say so;
   - add the library with npx expo install, rebuild the dev app, and at the end of the step rebuild
     the friends' APK (ask the owner before replacing it).
2. Behaviour:
   - the flat map hands over to the globe below a zoom threshold (tune it on the phone), with a short
     cross-fade (none with reduced motion); pinching in on the globe hands back to the flat map at
     the place under the fingers;
   - a drag turns the globe on both axes, with a little momentum;
   - colours come from the active map theme (useMapTheme): land, water, borders, and the status
     colours by today's zoomed-out rule (a country is coloured when it, or anything in it, is marked:
     withImpliedCountries in style.ts);
   - country names on the facing side only, hidden where they'd be too small or overlap;
   - a tap on a country opens its place sheet and press-and-hold opens the quick mark, as today;
   - the earth button (map-home-toggle) shows the globe turned to the home country; the home button
     and a second tap on the Map tab go home, as today;
   - the Friends layer's country colours show on the globe if that's cheap; otherwise say it's left out;
   - the poster's picture still comes from the flat map at home.
3. Accessibility: the globe has a label; marking without gestures stays possible through "+" (Add a
   place).
4. Jest: the projection (a point on the facing side, the far side hidden, after a turn), the
   hand-over threshold, a tap finding the right country. Maestro 10-map-home taps map-home-toggle
   twice to frame Bangladesh: keep it passing.
5. Phone: turn in every direction, hand over 10 times each way, tap and press-and-hold countries,
   two themes, dark, Bangla, largest text. Release build of the dev app as well (rules).

Write reports/step-1-report.md, update the Status table, give the git commands, stop.
```

### Done when
- Zooming out ends on a globe; a finger turns it any way; zooming in returns to the same flat map as before.
- Marked countries have their colours on the globe; tapping one opens its sheet.
- No black area anywhere at any zoom. The phone in flight mode shows the same globe.

### You check
Zoom out until the globe appears, spin it, tap Australia, zoom into Bangladesh. Does the hand-over feel natural?

---

## Step 2: Map, the top-left button and a travel dashboard (your point 2)

**You asked:** a more professional top-left button. Under it, a dashboard whose tiles can be tapped: Countries shows which you've visited; a country shows the places, divisions and cities you've visited in it; the same for every tile. No "Your story", no "Your Bangladesh".

**Today:** `mobile/src/features/map/StoryCapsule.tsx` (a ring and "3 of 8 divisions / 3 countries"; on a trip day it shows the day and opens Today). It opens `StoryPanel.tsx`: the "Your Bangladesh" header, the divisions as boxes, four number tiles that can't be tapped, "New places each year", Replay and the poster. The data: your marks (`useVisits`: countries, regions, districts, cities, each with a status and dates), `useTravelStats`, `useTrips`, `useTripStats`. Tests: `storyCapsule.test.tsx`, `storyPanel.test.tsx`, Maestro `10-map-home.yaml`.

### Prompt

```
Start step 2 of docs/ui-refresh/prompts.md (the travel dashboard). Read the rules, D2 and D9b with
their answers, the mockup, and the previous report.

1. The top-left button (StoryCapsule.tsx), restyled per the mockup. It keeps its test ID, its numbers
   update the moment a place is marked (offline too), and on a trip day it still shows the day and
   opens Today.
2. The dashboard, a screen (app/map/dashboard.tsx) that replaces StoryPanel. No country in its title.
   Tiles, each a real count that opens a list:
   - Countries: the countries visited and lived in (flag, name, the status as a word, the year first
     visited when known), the Want list apart. A country opens its page: its divisions or regions,
     districts, cities, and the places from your finished trips there, each with its status. First
     see whether app/explore/country/[iso2].tsx can be that page.
   - Divisions (the home country's regions; "Regions" elsewhere, regionWord in home.ts): "3 of 8",
     each opens its districts and cities.
   - Districts, Cities: the lists, grouped by country.
   - Trips and Days on the road: the trips behind the number; a trip opens.
   - Want list: the places; a place opens on the map.
   Every row has "Show on map": the dashboard closes and the map frames the place.
   A tile whose list can't be built from real data isn't shown. A count and its list always agree
   (one function gives both; test it).
3. Empty states say what to do ("No cities yet. Press and hold a city on the map to mark it").
4. Replay and the poster per D2.
5. Remove StoryPanel, its strings and its tests once nothing uses them; keep what replay and the
   poster need from story.ts. Update Maestro 10-map-home.
6. Jest for the lists (counts match, statuses, Bangla names and digits, empty states) and the
   navigation. Phone, read-only on the owner's account: every tile, a country page, "Show on map".

Write reports/step-2-report.md, update the Status table, give the git commands, stop.
```

### Done when
- Every tile opens the list behind its number, and the numbers match the lists.
- A country's page shows what you've visited inside it.
- "Your story" and "Your Bangladesh" are gone from the app and from the code.

### You check
Tap the top-left button, then Countries, then Bangladesh. Are your three divisions there? Tap "Show on map" on one.

---

## Step 3: Map, the Map sheet and the Map Theme screen (your point 3)

**You asked:** the theme UI is bad: make it more dynamic and usable, and keep what's meaningful. Modern buttons for Trip trails, Places Vromon can plan, and Friends. Themes better organised. A completely different Map Theme screen that's easy to use.

**Today:** `mobile/src/features/map/MapSheet.tsx`: three rows with switches, then four small theme swatches and "All themes". `mobile/app/map/theme.tsx`: a sample map of Europe, a Map / Friends switch, Themes · Colors · Styles, a sideways row of striped cards, Apply. The catalogue is `src/features/mapThemes/catalog.ts` (pure data, also read by `scripts/map-themes/build.py`); the choosing logic is `resolve.ts`; the choice is saved in preferences and synced. Tests: `mapSheet.test.tsx`, `mapThemeScreen.test.tsx`, `mapThemes.test.ts`, Maestro `03-theme-rustic.yaml` and `10-map-home.yaml`.

### Prompt

```
Start step 3 of docs/ui-refresh/prompts.md (the Map sheet and Map Theme). Read the rules, D3 and its
answer, the mockup, and the previous report.

1. The Map sheet (MapSheet.tsx), per the mockup:
   - the three layers as large toggle tiles (icon, name, one line of what it does), on or off shown
     by more than colour, each a switch for screen readers; Friends only when there are friends, as
     today;
   - themes as small pictures of a real map in that theme (land, water, a visited area), the chosen
     one marked; choosing applies at once with the sheet open, as today; a link to all themes.
2. The Map Theme screen (app/map/theme.tsx), rebuilt per the mockup and D3:
   - the preview shows the traveller's own map (home country framed, their real marks); a labelled
     sample only when nothing is marked;
   - one page, top to bottom: all themes in a grid, each a small map picture with its name; then
     "Make your own" with the colours (visited, want, lived shown as named swatches) and the map
     styles (their thumbnails);
   - a tap changes the preview at once; Apply stays in reach at the bottom; a way back to Default;
     leaving without Apply changes nothing;
   - the friend colours per D3.
3. Keep catalog.ts as pure data with no imports, and resolve.ts's rules (a theme, or colours plus a
   style). Premium locks stay as they are (FEATURE_PREMIUM_LOCKS).
4. Tests: update mapSheet, mapThemeScreen and mapThemes tests; new colour pairs into the contrast
   test. Maestro 03-theme-rustic and 10-map-home updated for changed IDs.
5. Phone: switch each layer and see the map change; pick each theme from the sheet; in Map Theme pick
   a theme, then a colour set, then a style, Apply, reopen. Dark, Bangla, largest text. Release build:
   open and close the sheet 10 times over the map.

Write reports/step-3-report.md, update the Status table, give the git commands, stop.
```

### Done when
- The three layer buttons show clearly whether they're on, and the map changes at once.
- Map Theme is one organised page; finding and applying a theme takes two taps.
- The preview is your own map.

### You check
Open the layers button on the map: can you tell at a glance what's on? Open all themes: can you find Rustic and apply it without thinking?

---

## Step 4: New trip, weekday only and typed travellers (your point 4)

**You asked:** under From and To, write only the day ("Friday", not "Friday, Nov 20"). In Travellers, touching the number lets you type it.

**Today:** `mobile/src/features/trips/new/DateRangeFields.tsx` builds the line under each date with the weekday, day and month. Travellers is a − / + stepper in `mobile/app/trip/new.tsx` (`Stepper`, test ID `travellers`), from 1 to `MAX_TRAVELLERS` (50, in `newTrip.ts`).

### Prompt

```
Start step 4 of docs/ui-refresh/prompts.md (weekday only, typed travellers). Read the rules, D4 and
its answer, the mockup, and the previous report.

1. DateRangeFields.tsx: the line under each date is the weekday alone, in the app's language
   ("Friday", "শুক্রবার"). Give it room: in the screenshot it touched the card below. Test IDs
   date-start-weekday and date-end-weekday stay.
2. Travellers (app/trip/new.tsx): touching the number makes it a number field: number pad, the
   old value selected, Bangla digits accepted (as BudgetCard's digitsOnly does). 1 to the largest
   in D4. Empty or out of range goes to the nearest allowed value when the field is left, with a
   short line saying so. − and + keep working. The budget suggestion and every "for N travellers"
   line follow at once. The keyboard never covers the field (the pattern in
   src/features/trips/CitySearch.tsx). For screen readers it's a labelled field with its limits.
3. If travellers can be changed anywhere else in the app, the same control goes there.
4. Jest: the weekday text in English and Bangla; typing 12, 0, 99, ১২ and nothing; − and + after
   typing. Existing tests that use the travellers IDs keep passing.
5. Phone as test account A: both changes, in Bangla and at the largest text.

Write reports/step-4-report.md, update the Status table, give the git commands, stop.
```

### Done when
- The lines read "Friday" and "Sunday".
- Tapping the 2 lets you type 12; the budget's "for 12 travellers" follows.

### You check
New trip: pick dates, tap the travellers number, type 12.

---

## Step 5: New trip, getting there (your point 5)

**You asked:** make "Getting there" optional. If you choose a start, suggest the vehicles to reach the destination separately. No route in the final map. Detect the current location precisely. Work on this section properly: it hasn't had attention yet.

**Today:** in `mobile/app/trip/new.tsx` the section has "Start from my current location" (`locateMe`: balanced accuracy, labelled only "Your location"), a city search, and "How do you like to travel?" chips that show before any start is chosen ("Launch" is cut off). The backend plans the way there door to door in `backend/app/services/journey.py` (plane, train, bus, car, launch; each fare says how sure it is), but only for a saved trip (`GET /trips/{id}/journey`, shown in `app/trip/journey/[id].tsx`). On the trip screen the way there is a card on day 1 (`GettingThere.tsx`). The Map tab draws a dashed line to the next trip (`upcomingLine` in `TripLayers.tsx`).

### Prompt

```
Start step 5 of docs/ui-refresh/prompts.md (getting there). Read the rules, D5 and its answer, the
mockup, and the previous report. This step touches the backend.

1. Optional: the section says "optional" like "First and last day". A traveller who skips it gets a
   plan as before; find out what the plan and the budget do today with no start, and make them say
   plainly that the way there isn't counted.
2. The start:
   - "Use my current location", precise: high accuracy (as src/features/chat/liveShare.ts asks for),
     waiting a few seconds for a good fix; the place is named ("Near Zero Point, Khulna"), not "Your
     location"; when the fix is rough the card says how rough ("within about 300 m"); "Adjust on the
     map" opens the place picker (src/features/places/PlacePicker.tsx) on that point;
   - or search for a place;
   - the location is asked for once, on the tap, and kept only as the trip's start. Permission
     refused: a clear line, and search still works.
   Naming a point needs the backend: see what exists (nearest_city_stop in trips.py, district_of in
   journey.py, the geocoder behind place search) before adding anything.
3. Ways to get there, shown only once a start and a destination are chosen, as its own card: every
   way the journey service finds, the recommended one first with its reason (fastest within your
   budget, or the cheapest), each with its time, its fare for one person and how sure the fare is.
   The traveller taps one, or leaves "Let Vromon choose by my budget". The old chips go.
   This needs journey options before a trip exists: a read-only endpoint over journey.plan() that
   saves nothing (signed-in users only). Changing the destination, dates, travellers or budget asks
   again. No way found: say so, and the plan goes on without it.
4. What's sent when the trip is built stays the same shape (origin or origin_point, transport_modes,
   transport_by_budget in newTrip.ts), so the built trip uses the chosen way. Check the day-1 card,
   the journey screen and the budget agree with what was picked.
5. Per D5: find every map that draws the way from the start to the destination (the trip's route
   screen app/trip/route/[id].tsx, DayMap, the Map tab's dashed line) and remove the ones D5 names.
6. i18n, accessibility. Jest: the section with no start, with a start, with no way found, a way
   picked; the payload. Pytest: the new endpoint (signed out: refused; nothing written; the same
   options the saved trip then shows).
7. Phone as test account A. "Use my current location" reads the phone's real position: ask the
   owner before testing it, and use it only for a test trip on account A.

Write reports/step-5-report.md, update the Status table, give the git commands, stop.
```

### Done when
- You can go to the next step without touching "Getting there".
- Choosing a start shows the ways to get there with times and fares; the one you pick is the one in the plan and the budget.
- "Use my current location" names where you are.
- The trip's maps show no line from your start to the destination.

### You check
New trip to Cox's Bazar: tap "Use my current location" (is the place right?), look at the ways there, pick the train, build the plan, open day 1 and the budget.

---

## Step 6: Must-dos, type the busy time (your point 6)

**You asked:** no rows of fixed times: write the From and To yourself. A more professional, friendlier, better-looking sheet.

**Today:** `mobile/src/features/trips/new/BusySheet.tsx`: day chips, then From and To as sideways rows of half-hour chips from 06:00 to 23:30, a label field, and a button that states the result. It opens from `MustDosEditor.tsx` (New trip, step 3) and `app/trip/must-dos/[id].tsx`. The backend reads the times as "HH:MM" (`parse_busy` in `backend/app/services/itinerary/trip_rules.py`). The same chip grid (`src/ui/TimeSheet.tsx`) is used for the day's start and finish, arriving and leaving, and a must-see's time.

### Prompt

```
Start step 6 of docs/ui-refresh/prompts.md (the busy time). Read the rules, D6 and its answer, the
mockup, and the previous report.

1. A typed time field, src/ui/TimeField.tsx: hours and minutes as two boxes, in the manner of the
   date fields (DateRangeFields.tsx): number pad, moves on by itself, the old value selected, Bangla
   digits accepted. Any minute. It shows time the way the rest of the app does (usePlanFormat's
   time).
2. BusySheet.tsx rebuilt per the mockup:
   - the day as chips with the date ("Day 2 · Sat 21"), the chosen one in view on long trips;
   - From and To side by side, typed, with how long that is ("5 h");
   - "All day" as one switch;
   - "What is it?" stays optional;
   - mistakes said in words next to the field (it ends before it starts; it's outside your day);
   - the button still states the result ("Keep Day 1 16:30–21:30 free");
   - the keyboard never covers the fields or the button.
   If a busy time can be edited after it's added, the sheet opens with its values; if it can only be
   removed and added again today, make it editable.
3. The planner: both planners (CP-SAT and the fallback) must respect a busy time at any minute.
   Pytest with 16:10–17:25; fix what rounds.
4. Per D6: only the busy time now, or TimeSheet's other uses too.
5. Jest: typing times (valid, impossible like 25:70, To before From, Bangla digits), All day, the
   button's text, saving. Phone as test account A: add a busy time on day 2 from New trip and from
   an existing trip's must-dos, build, and see nothing planned then.

Write reports/step-6-report.md, update the Status table, give the git commands, stop.
```

### Done when
- From and To are typed; any minute works.
- The plan leaves exactly that time free.

### You check
Must-dos, "A time you're busy": type 16:10 to 21:45 on day 1, build the plan, look at day 1.

---

## Step 7: Trip screen, the row of buttons over the map (your point 7)

**You asked:** one button for all the map features, as in Google Maps. Remove the back button. Replace "Updated 22 min ago" with a weather icon. Keep Full map separate as before. Arrange all of these at the top, looking better, with the weather button the largest.

**Today:** in `mobile/app/trip/[id].tsx` the top row is: back (`trip-back`), the "Updated … ago" pill with refresh (`conditions-pill`, `conditions-refresh-pill`), fit the day (`trip-fit`), ⋮ (`trip-menu`). `mobile/src/features/trips/plan/DayMap.tsx` draws its own second row: Satellite, 3D, Full map. The day's weather also shows as chips in the plan sheet (`ConditionChips.tsx`). The weather screen (`app/trip/conditions/[id].tsx`) already refreshes on pull-down. Maestro `09-journey.yaml` uses `conditions-pill`.

### Prompt

```
Start step 7 of docs/ui-refresh/prompts.md (the row over the trip map). Read the rules, D7 and its
answer, the mockup, and the previous report.

1. One row at the top of the trip screen (app/trip/[id].tsx), per the mockup and D7:
   - the weather button, the largest: the selected day's sky icon and temperature; a mark when the
     day has a warning; a quieter look when the data is old or the phone is offline, with a label
     that says how old. It opens the weather screen on that day. Refreshing lives there;
   - one layers button: a small panel with the map type (Default, Satellite), 3D on or off, and
     "Show the whole day";
   - Full map, its own button;
   - ⋮ for the owner, as today.
2. The back arrow goes. Make sure the phone's back always leaves the screen: from Full map it
   returns to the plan first; with a sheet open it closes the sheet first; a trip opened from a link
   or a chat card goes back to where it came from.
3. DayMap.tsx loses its own row of buttons; satellite and 3D are driven from the panel. Recalculate
   the room kept at the top when framing the day (and for the stay's pin). The map's credit ("i")
   stays visible and reachable.
4. The weather chips in the plan sheet: keep what the top button doesn't say (sunset, sea, warnings);
   drop what it repeats, per the mockup. The rest of the sheet in frame 11 (the chip beside the
   name, the budget row, the day tabs' sky icons, the "From …" row) is step 14's: leave the
   sheet's other content as it is. The button's other states (now, as it was, too early) are
   step 17's.
5. Test IDs and Maestro 09-journey updated. Jest for the row (owner and visitor, no forecast yet,
   offline, a warning) and the panel.
6. Phone as test account A: every button; back from each state; a trip opened from the Trips tab,
   from a chat card and from the map. Release build: open the trip 10 times and check the row and
   the plan sheet are drawn every time.

Write reports/step-7-report.md, update the Status table, give the git commands, stop.
```

### Done when
- One row: a large weather button, layers, Full map, ⋮. No back arrow, no "Updated … ago".
- Satellite and 3D are inside the layers button; Full map is still one tap.
- The phone's back always gets you out.

### You check
Open a trip. Tap the weather, come back. Tap layers, switch to Satellite and 3D. Tap Full map, then back.

---

## Step 8: Trip screen, drag and drop for long trips (your point 8)

**You asked:** friendlier drag and drop. On a trip with many days you can barely see what you're dragging. Better looking.

**Today:** `mobile/src/features/trips/plan/useStopDrag.ts`: press and hold lifts a stop; a line shows where it lands; dropping on a day chip moves it to that day. The chips are a box at the top of `mobile/app/trip/[id].tsx` (`drop-days`) that wraps: with 3 days it covers the trip's name (screenshot 15), with 30 it covers the screen (screenshot 16). Without gestures: the stop's sheet has "move to another day" (`StopSheet.tsx`). Maestro `08-rearrange.yaml`.

### Prompt

```
Start step 8 of docs/ui-refresh/prompts.md (drag and drop). Read the rules, D8 and its answer, the
mockup, and the previous report.

1. Where to drop, per D8: one strip of day chips at the top, the same height for any trip length.
   Each chip has the day and its date ("Day 4 · Mon 23"). It opens with the days around the current
   one in view, and scrolls by itself when the finger nears its left or right edge. The chip under
   the finger grows, fills and gives a tick; a line says what a drop does ("Move to Day 4"). The
   current day isn't a target. The plan stays visible below the strip.
   The chips' places are measured for the drop (useStopDrag's setChip): they now move while the
   strip scrolls, so measure accordingly.
   A far move must be as easy as a near one (D8): while the finger rests at the strip's edge it
   scrolls, faster the longer it stays; and the thin track under the chips (frame 14) is a fast
   lane: sliding the finger along it runs through all the days. Day 1 to day 10 is one drag with
   no waiting.
2. The lifted stop: a clear shadow and a slight lift, the others dimmed a little; the landing line
   easier to see, with the time the stop would get; the list still scrolls near the top and bottom.
   With reduced motion, no scaling or sliding.
3. Easier to find: a grip on each stop that can be moved (pinned and fixed ones show why they
   can't); a one-time hint the first time a plan opens ("Press and hold a stop to move it"), kept in
   preferences.
4. After a move to another day: a snackbar "Moved to Day 4" with Undo, if the same API can move it
   back; if it can't, say so in the report.
5. Without gestures: the stop sheet's "Move to another day" becomes a day picker that works for 30
   days.
6. Jest: the strip for 2, 7 and 30 days, which chip a point lands on while the strip is scrolled,
   the hint shown once, undo. Maestro 08-rearrange keeps passing.
7. Phone as test account A, with real drags (rules): a 3-day trip and the longest trip the app
   allows (make one on account A). Reorder within a day; move to the next day; move from day 1 to day 10 and to
   the last day, timing each; cancel a drag. Bangla and the largest text.

Write reports/step-8-report.md, update the Status table, give the git commands, stop.
```

### Done when
- On a 30-day trip, the drop strip is one row and the plan stays visible while dragging.
- You can reach any day while dragging, day 10 as easily as day 2, and you can undo.
- It's clear from looking at a stop that it can be moved.

### You check
On a long trip, press and hold a stop on day 1 and drop it on day 12.

---

## Step 9: Trips tab and trip stats, rebuilt (your point 9)

**You asked:** rebuild the Trips tab with a beautiful design. The next-trip card should matter more to a traveller: change its colour and its layout. It isn't workable now: make it workable. "Trips" should stay fixed when scrolling. "All trip stats" should really work. Remove what isn't needed: minimal.

**Today:** `mobile/app/(tabs)/trips.tsx` is one scrolling list with the title inside it, so the title scrolls away (and slides under the status bar, screenshot 17). `NextTripCard.tsx`: an orange card (`SUNSET_CARD` in `src/ui/theme/cards.ts`, shared with Today mode's "Now" card) with a countdown, dates, weather, "Open plan", the day's stops and the budget. `StatsCard.tsx`: four numbers for finished trips ("1 Countries") and a link to `app/stats/trips.tsx`, which shows days as weeks, months and years with decimals, the average, the longest trip, the most visited country, trips per year and how you travelled; none of it can be tapped. The numbers come from `backend/app/services/stats/trips.py` (finished trips only). The "+ Plan a trip" button floats over the list. Maestro flows 01, 04, 06, 08 and 09 use `next-trip` or `trip-stats-card`.

### Prompt

```
Start step 9 of docs/ui-refresh/prompts.md (the Trips tab). Read the rules, "The look", D9 and D9b
with their answers, frames 15, 16, 17 and 21, reports/step-0-report.md (what didn't work on this
tab), and the previous report.

1. Nothing hidden (D9): nothing on this tab is covered by another element, nothing slides under the
   status bar, and nothing important needs a scroll or a second tap to find. Check it at the top,
   mid-scroll and at the end of the list, with the "Rate your trip" card showing and without it,
   at 1.6× and in Bangla.
2. A fixed header, src/ui/TabHeader.tsx (frame 15): the title stays at the top while the list
   scrolls under it, clear of the status bar, with a hairline once something is under it. On the
   right: "New trip" as a pill, then a slot (step 10 puts the account picture there). The floating
   "+ Plan a trip" button goes.
3. The next-trip card, rebuilt per frames 15 and 16, the first thing the eye lands on:
   - before the trip: a picture of where it is (the destination's map, drawn from the app's own
     shapes, or its photo when Explore has one), the days to go, the name, dates and travellers,
     the forecast, how day 1 begins, the budget as planned of the total, "Open plan", and
     "Invite" when the trip can be shared;
   - on the trip: "On now", which day, what's next and when to leave; its main button says what
     it opens ("Open today"), with "Full plan" beside it. Today's "Open plan" opened Today;
   - no plan yet: says so, with "Build the plan";
   - the card and each button respond every time.
   The card's colour comes from the look (the hero card), not cards.ts. Today's own "Now" card
   changes in step 15 (frame 32): leave it here.
4. The numbers (frame 15): one line of real numbers with correct grammar ("1 country"), opening
   "Your trips so far".
5. "Your trips so far" (frame 17) replaces "All trip stats": the finished trips, days away and
   days a trip, with what's coming up; where you went (countries and cities, each opens); by year
   (a year opens its trips); the finished trips, the longest marked, each opens. No "How you
   travelled" (D9b), no weeks, months or years with decimals. With no finished trip yet it says
   so and shows what's coming. It's also where the Map dashboard's Trips and Days tiles lead
   (step 2). Check each number against the database for test account A; fix the backend where
   it's wrong (pytest).
6. The list (frame 15): a date block, the name, the dates and length; pull to refresh, loading,
   error and the first-trip state stay.
7. Remove what's replaced (StatsCard, the old stats screen, the floating button, their strings).
8. Maestro: flows 01, 04, 06, 08 and 09 use next-trip or trip-stats-card; flows 05, 09, 13, 14
   and 15 start a trip from plan-trip-fab, which goes. Keep an ID where the thing still exists
   (give the header's "New trip" the plan-trip-fab ID, or update the five flows). Jest: the header, the card's three states, the numbers and
   their lists.
9. Phone as test account A (it has finished, current and coming trips): scroll, every tap on the
   card and the numbers, a draft trip, dark, Bangla, largest text.

Write reports/step-9-report.md, update the Status table, give the git commands, stop.
```

### Done when
- "Trips" stays at the top while the list scrolls.
- The next-trip card tells you what you need before and during the trip, and every tap on it works.
- Every stats number opens the trips behind it, and matches them.
- Nothing on the tab is ever covered or hidden, and nothing is there without a reason.

### You check
Scroll the Trips tab. Tap the next-trip card and its button. Tap each number.

---

## Step 10: The account picture on every tab (for all pages)

**You asked:** an account picture on every tab's front page, always in the same place at the top right, the size of Google's.

**Today:** only the Map tab has it (`mobile/app/(tabs)/index.tsx`: a 42 dp picture in a 48 dp glass circle, `map-profile-button`, opens Settings). Explore, Trips and Friends have none. Maestro `01-tabs.yaml` and `subflows/sign-out.yaml` use `map-profile-button`.

### Prompt

```
Start step 10 of docs/ui-refresh/prompts.md (the account picture). Read the rules, D10 and its
answer, frames 1, 15, 18 and 19, and reports/step-9-report.md (the fixed header).

1. src/ui/AccountButton.tsx: the picture at 32 dp inside a 48 dp touch area, the initials when
   there's no photo, a label for screen readers, opens Settings.
2. The same spot on all four tabs' front pages: the same distance from the top (below the status
   bar) and from the right edge, so it doesn't move when switching tabs. On Trips, Friends and
   Explore it sits in the fixed header (TabHeader from step 9; Friends and Explore take that header
   too); on the Map it floats over the map on glass. Anything already at the top right of a tab
   moves left of it.
3. Not on inner screens (a trip, a chat, settings).
4. map-profile-button stays on the Map tab; the others get account-button-<tab>. Maestro 01-tabs
   and the sign-out subflow keep passing; 01-tabs also checks the button on each tab.
5. Jest: the button with and without a photo; each tab shows it. Phone: switch through the four
   tabs and watch the picture stay put; tap it on each. Bangla and the largest text.

Write reports/step-10-report.md, update the Status table, give the git commands, stop.
```

### Done when
- The picture is on Map, Explore, Trips and Friends, in the same place and size, and opens Settings.

### You check
Tap through the four tabs watching the top right corner.

---

## Step 11: The hotel list, only places to stay (screenshots 3 and 5)

**You asked:** hotels need to be residential: places to stay, not a restaurant.

**Today:** New trip's stays sheet lists the destination's hotels (`mobile/src/features/trips/stays/StaysSheet.tsx`; the data comes from the backend's destinations, loaded by the data platform). In your screenshots every row read "Standard · Price not known", and a sweet shop (হক মিষ্টান্ন ভান্ডার, Barishal) was in the list. Of 937 hotels only 82 had a price when this was last counted (trip upgrades, D11). In Bangladesh many restaurants are called "Hotel …", while places to stay often say "Residential" or "আবাসিক": the word "hotel" in a name proves nothing.

### Prompt

```
Start step 11 of docs/ui-refresh/prompts.md (the hotel list). Read the rules, D11 and its answer,
and docs/trip-upgrades/decisions.md D11 (priced, real-named hotels first). This step touches the
data platform and the backend.

1. Find where each hotel row comes from (the data platform's sources and its publish step, the
   backend's hotels and destinations code), and how the sweet shop in Barishal became a hotel.
   Count how many hotels look like places to eat or shops: by the source's own category, and by
   words in the name, English and Bangla (restaurant, sweets, biryani, মিষ্টান্ন, রেস্তোরাঁ, ভান্ডার…).
   Put the numbers and ten examples in the report.
2. The rule, in the data platform, not in the app: a hotel is a place to stay. Decide from the
   source's category first; a name only tips a doubtful row; a row still in doubt goes to review,
   not into the list. Tests with real rows of both kinds.
3. A wrongly listed row that is a real restaurant or shop moves to where it belongs if the
   platform has a place for it; otherwise it leaves the hotels. Trips that already chose such a
   row as their stay keep working: say how many there are, and change nobody's trip.
4. Run it on a copy of the database first. Back up the real one before running on it (rules).
5. The rows in the app (StaysSheet), per the look: when the price isn't known the row still says
   something true and useful (its kind: hotel, resort, guest house, rest house; its area or how
   far from the centre) instead of the same "Standard · Price not known" on every row. Priced and
   rated ones stay first.
6. The same list wherever hotels are offered ("Choose another", the stay advisor).
7. Pytest for the rule and the endpoints; jest for the rows. Phone as test account A: the hotel
   lists of Barishal, Khulna, Cox's Bazar and Kuakata.

Write reports/step-11-report.md, update the Status table, give the git commands, stop.
```

### Done when
- No restaurant, sweet shop or other shop is offered as a place to stay.
- A hotel without a price still tells you something about itself.

### You check
New trip to Barishal, "Where you'll stay": is every row a place you could sleep?

---

## Step 12: Explore, redesigned (asked 2026-11-14)

**You asked:** redesign the Explore section with the best UI, and call its first part "Your country", not "Bangladesh".

**Today:** `mobile/app/(tabs)/explore.tsx` is one long page: a search box; Bangladesh over a satellite picture (the picture is a single map tile that shows mostly India and Nepal); "Districts by division" with chips and photo cards; 40 GI foods; then the world: continents, the most populous countries, the largest cities; sources at the bottom. It is hard-wired to Bangladesh (`useBangladesh`), whatever the home country is. District photos come from Wikimedia Commons with a credit, or a satellite picture when there's none. The GI register has Bangla names only. Vromon can plan 66 destinations; they have no photos of their own. The other screens are `app/explore/districts.tsx`, `district/[slug].tsx`, `district-map/[slug].tsx`, `country/[iso2].tsx` and `continent/[name].tsx`. Maestro `01-tabs.yaml` opens the tab; there are no Jest tests for Explore.

### Prompt

```
Start step 12 of docs/ui-refresh/prompts.md (Explore). Read the rules, "The look", D15 and D16,
frames 18 and 22–25, and the previous report. Mostly the app; small additions to the backend where
a frame needs something the API doesn't give yet.

1. The Explore tab (app/(tabs)/explore.tsx), per frames 22–24:
   - a fixed header: the search box, with the account picture's place beside it (step 10 fills
     it; if step 10 is done, keep its button);
   - under it a switch: "Your country" | "The world". Today's one long page becomes these two. The
     choice is remembered while the app is open;
   - search works from both, as today (districts, countries, cities).
2. "Your country" is the home country from the profile (home_country_iso2; Bangladesh until one is
   chosen). No country's name is written into the screen (D15).
   For Bangladesh (frames 22 and 23):
   - the hero: a satellite picture framed on the country itself (ask the same Esri service for
     the country's own box; keep its credit on the picture), "Your country" over the name, the
     facts line, "You've been to N of 64 districts" from the traveller's own marks, and
     "All districts";
   - "Ready to plan": the places Vromon can plan, each with its district's photo and counts and
     "Plan a trip" (New trip opens with that destination chosen). Join destinations to their
     districts for this (a district's page already lists its trip_destinations); add what the
     API needs, with tests;
   - "Districts by division": the division chips, then the districts as photo cards (the first
     large, the rest two to a row), each with its counts, the traveller's mark (Visited, Lived,
     Want) and "You can plan it" where a destination lies in it;
   - "Foods with a home": the GI foods, in Bangla as the register gives them, with the district in
     the app's language; each opens its district;
   - sources and photo credits stay reachable at the end of the page.
   For any other home country: its facts, its largest cities and what the traveller has marked
   there, from GET /explore/countries/{iso2}. No district sections, nothing invented. Say in the
   report what such a page shows.
3. "The world" (frame 24): the hero with the catalogue's counts and "You've been to N" (it opens
   Your travels once step 2 is done; the map until then); the continents as tiles, with how many
   countries the traveller has visited in each; "Most people" (countries) and the largest cities,
   each row with the traveller's mark when there is one.
4. A district's page (app/explore/district/[slug].tsx), per frame 25: the photo across the top
   with its credit (the satellite picture when there's no photo); the name in both languages, the
   division and the area; "Plan a trip here" when Vromon can plan it; "Mark" (visited, lived,
   want: the same marking as the map, useMarkPlace); the four counts, each jumping to its
   section; the map card (the existing render) with the neighbours named; then sights, stays
   ("from ৳… a night" and the date checked, where the hotel publishes a rate), GI foods and
   products, neighbours, upazilas, sources. Every photo keeps its credit.
5. The other Explore screens (all districts, a division, a continent, a country, the full-screen
   district map) take the same header, cards and rows. None gets a layout of its own.
6. Flags stay emoji, as the app shows them today.
7. Keep the test IDs (explore-search, explore-home, explore-bangladesh, district-card-…,
   continent-…, district-screen, district-map-card, district-plan-trip, district-back). Add Jest
   tests: the switch, a home country that isn't Bangladesh, the marks on the cards, the hero's
   count, the district page's sections with and without a photo.
8. Phone as test account A: both halves; search; a district with a photo and one without; one
   Vromon can plan and one it can't; mark a district and watch its card and the hero's count
   change; another home country (set it in Settings, then set it back); offline with saved data;
   dark, Bangla, 1.6×.

Write reports/step-12-report.md, update the Status table, give the git commands, stop.
```

### Done when
- Explore opens on "Your country" with a picture that is your country; "The world" is one tap away.
- Your own marks show on Explore: the count in the hero, and Visited on the cards.
- A district's page lets you plan a trip there or mark it, without going back to the map.
- With another home country, Explore shows that country, and nothing made up.

### You check
Open Explore. Is the first thing you see your country? Tap a division, open a district, tap "Plan a trip here". Then switch to "The world".

---

## Step 13: Account and settings, redesigned (asked 2026-11-14)

**You asked:** redesign account settings with the best UI.

**Today:** `mobile/app/settings/index.tsx`, opened from the account picture: a profile row; "Privacy & friends" (My friend code, Let people find me by username, Chats and privacy); "Preferences" (Language, Appearance, Map Theme, Haptic feedback, Distance units); "Account" (the email, Sign out); "Your data" (Export my data, Delete account); "About" (Version, Licences & data). The rows come from `src/ui/SettingsRow.tsx`. Edit profile is `app/settings/profile.tsx` (photo through `AvatarPicker`, display name, username with a check, home country). Inner screens: `home-country.tsx`, `chats.tsx`, `blocked.tsx`, `delete-account.tsx`. Sign out ends every session of the account on every device (an open decision from an earlier plan). Maestro's sign-out subflow uses the `settings-…` IDs; Jest has `settingsSync.test.ts`.

### Prompt

```
Start step 13 of docs/ui-refresh/prompts.md (account and settings). Read the rules, "The look",
D16, frames 26 and 27, and the previous report. The app only.

1. Settings (app/settings/index.tsx), per frame 26:
   - the top is who you are: on the hero card the photo, name, username and home country; three
     numbers from the traveller's own data (countries, home regions, finished trips) that open
     Your travels (step 2; the map until then); "Edit profile" and "Friend code";
   - then grouped cards, an icon on every row: Preferences (Language, Appearance, Map theme with
     a small picture of the chosen theme, Distances, Vibrate on taps); Privacy and friends (Let
     people find me by username; Chats and privacy, with a line saying what's inside); Your data
     (Download my data; Delete account, in the danger colour and saying so in words); About
     (Licences and data sources, Version);
   - Sign out is its own button at the end, with the email under it. It keeps a confirmation
     that says what it really does today: it ends every session of the account, on every
     device. Don't change that behaviour in this step;
   - where the frame's wording differs from today's ("Vibrate on taps", "Distances in", "Same as
     the phone", "Download my data", "Licences and data sources"), the frame's wording goes in,
     in English and Bangla.
2. Edit profile (app/settings/profile.tsx), per frame 27: the photo with a camera badge (the
   existing AvatarPicker: add, change, remove); Name; Username with its check shown inside the
   field (yours, free, taken, checking); "Your country", with the line that says what it changes
   (the map and Explore open on it); the email, shown but not editable; Save fixed at the
   bottom, active only when something changed and is valid. Leaving with unsaved changes asks
   first.
3. The pickers (language, appearance, units) and the inner screens (home country, Chats and
   privacy, blocked people, delete account) take the same cards, rows, switches and buttons.
   src/ui/SettingsRow.tsx stays the one place a row is defined.
4. Every switch is the app's Toggle; every row is at least 48 dp; icons are decoration, hidden
   from screen readers; nothing is signalled by colour alone.
5. Keep the test IDs (settings-profile, settings-friend-code, settings-discoverable,
   settings-chats, settings-language, settings-appearance, settings-map-theme, settings-haptics,
   settings-units, settings-sign-out, settings-delete-account, settings-licences). Jest: the
   page signed in and with sign-in switched off (the account rows hide, as today), the three
   numbers, the profile form's states. settingsSync.test.ts keeps passing.
6. Phone as test account A: every row and picker; change the name and save; try a taken
   username; change the home country and set it back; dark, Bangla, 1.6×. Sign out only on the
   test account, never on the owner's.

Write reports/step-13-report.md, update the Status table, give the git commands, stop.
```

### Done when
- Settings opens on you: your photo, name and travel numbers, with "Edit profile" one tap away.
- Every setting is found in a group that makes sense, and each row shows its current value.
- Sign out and Delete account can't be hit by mistake and say what they do.

### You check
Tap your account picture. Change your name in Edit profile and save. Change the language and back.

---

## Step 14: The trip plan, the heart of the app (asked 2026-11-14)

**You asked:** "our best feature is the trip itinerary": when a plan is opened, make it the most beautiful and the easiest to use.

**Today:** `mobile/app/trip/[id].tsx` (1,604 lines) shows the plan in a sheet over the map (`plan-sheet`): the trip's name and dates with a small budget meter (`trip-budget`), a "Today" pill on trip days (`open-today`), a trip-room pill (`open-trip-room`), day tabs (`day-tabs`), stay advice, the day's line (`day-summary`, `day-stats`), "Tonight: …" (`TonightRow`), the condition chips, the day ribbon (`DayRibbon`), "Getting there" on day 1, must-sees that didn't fit, "Needs attention", then the rows (`plan-rows`: `StopCard`, `LegRow`, `FreeRow` in `src/features/trips/plan/PlanRows.tsx`, `BaseRow` in `stays/`, `StayMealRow` in `meals/`), "Add a stop", "Change the whole plan" with four chips and "New ideas for this day", and "Trip details" (`TripDetails.tsx`: route, must-dos, preferences, photos, feedback, rating). A stop opens `StopSheet.tsx`. Found on 2026-11-14 in the test trips:
- times like 10:39, 13:51 and 18:58;
- the day's line counts meals as "stops", and its money ("৳600 each") leaves the rides out, so it disagrees with Budget's "By day";
- places in the plan have no photos (`image_url` is empty), so the design doesn't use any.

### Prompt

```
Start step 14 of docs/ui-refresh/prompts.md (the trip plan). Read the rules, "The look" with the
phase table, D17 and D23, frames 11, 28, 29 and 30, and the previous report. Steps 7 and 8 come
first (the top row, the drag strip): if one isn't done, stop and say so. The app, plus one small
backend change (7).

1. The sheet's top, per frames 28 and 29 (app/trip/[id].tsx):
   - the trip's name with the phase chip on its right: "In N days", "Tomorrow", "Day X of Y",
     "Finished". One function decides the phase from the trip's dates and the phone's date
     (src/features/trips/dates.ts; the same rule as trip_phase in the backend's trip stats).
     A trip with a trip room keeps a round room button with its unread badge beside the chip
     (not drawn in the frames: the size and style of the buttons over the map);
   - the dates and travellers on their own line;
   - the budget row (it replaces the small meter): "≈ ৳… of ৳…", the meter, "৳… left", opening
     Budget. Amber and red as the budget's status says, with words, never colour alone;
   - day tabs: the weekday and date, and the day's sky icon when the forecast reaches it. More
     days than fit scroll sideways and the chosen day stays in view.
2. The day's line: the day in words as today, then "4 places, 2 meals · ≈ ৳… for N · … on the
   road". The money is the day's food, tickets and rides for the group, the same number as
   Budget's "By day" (take it from the budget the screen already loads). The road time is the
   day's total_travel_time. Then the chips: warnings ("No warnings" or "N things to know"),
   sunset, the sea. Each opens Conditions on that day.
3. The day as a timeline, per frame 29. Keep every row's behaviour and test ID; change how it
   looks:
   - day 1: the "Getting there" card (step 5 decides what it opens);
   - "From <where you stay>" with the time you leave, and "Back at …" with the time you're back;
   - a stop: the time, how long, and under them the weather in the hour it starts (when the
     forecast has it); the numbered badge (blue for a place, orange for a meal, as on the map);
     the name; one line with the kind and the price in honest words ("Free entry", "৳100 each",
     "Price not known"); then, only when true: "For you: …", "keeps its time" (for a must-do,
     with when), "Not checked yet", and a problem in amber or red with its words. The drag
     handle shows only on a stop that can be dragged;
   - a ride between two stops: a dotted line under the badges, the way, the time, the
     distance, "≈ ৳…"; it opens the same sheet as today. Slow-traffic and boat notes stay;
   - free time: a dashed row with "Add", which opens Add a stop at that place in the day;
   - the day ends with "Tonight: …" as a card (the price a night when known, which nights,
     "Change"); on the last day, where you leave from. TonightRow moves down here.
   The day ribbon (DayRibbon) goes: the timeline shows the same thing. Remove it with its tests.
4. Under the day: "Add a stop"; then "Not quite right?" with two labelled parts: "The whole
   trip" (More relaxed, Cheaper, Quieter, Fuller, with "Changes every day. Your must-dos
   stay.") and "Only this day" ("New ideas for day N"). The same actions and confirmations as
   today.
5. "About this trip" replaces the long "Trip details": one list, each row with what's set now
   on its second line, opening the screen or sheet that already exists (must-dos, where you
   stay, meals, planning together, the route, photos, your preferences). The feedback form
   stays at the end. The rating card moves in step 16; until then leave it where it is.
6. A stop's sheet (StopSheet.tsx), per frame 30: the number and name; the time with "15 minutes
   less" and "15 minutes more", and "Keep this time"; the weather then; the price for one and
   for the group; the hours ("Hours not checked" when unknown); busy or quiet when known; "Why
   it's here"; Directions, Swap, Move to another day, Remove; where the place comes from.
   Nothing unknown is shown as if known (rating_known, cost_known, hours_known).
7. Backend, small: times on whole 5 minutes (D23). Today a stop can start at 10:39 or 13:51.
   Every place that writes a start or end time (grep "start_time =" under
   backend/app/services/itinerary/ and in meals.py) goes through one helper that rounds a
   start up to the next 5 minutes. Lengths stay as they are. A stop that keeps its time is
   not moved. Existing plans change when they are next re-timed, not by a migration. Tests: a
   newly timed day has no time off the 5 minutes; no stop starts before the ride to it ends;
   the checks (opening hours, busy times, back late) still pass.
8. Jest: the phase chip for each phase; the day line's three numbers; each row kind; a stop
   with and without a forecast, a price and hours; the read-only view for a friend. Maestro
   flows that open a trip still pass (they use trip-title, day-tab-N, stop-N, add-stop,
   plan-sheet).
9. Phone as test account A: a 3-day and a 30-day trip; every row kind; add into free time;
   the sheet at both heights; a friend's trip (read-only); dark, Bangla, 1.6×. Release build:
   open the trip 10 times.

Write reports/step-14-report.md, update the Status table, give the git commands, stop.
```

### Done when
- A day reads from top to bottom as a journey: leave, stops and rides, free time, back, tonight.
- The numbers in the day's line match Budget.
- A newly timed plan has no time like 10:39.
- Nothing a traveller could do before is gone, except the day ribbon.

### You check
Open a trip, pull the plan up and read one whole day. Tap a stop, a ride and a free time. Compare the day's money with Budget's "By day".

---

## Step 15: On the trip: the plan and Today (asked 2026-11-14)

**You asked:** the plan changes during the trip.

**Today:** on a trip day the plan screen looks as it did before the trip, plus a "Today" pill. Today is its own screen (`app/trip/today/[id].tsx`, its logic in `src/features/trips/today/today.ts`): an orange "Now" card, "Leave by", Directions (Google Maps), "Running late?" (`POST /trips/{id}/days/{day_id}/late`, with Undo), three switches, the rest of the day. Seen on the phone in step 0: the Now card said "Free time, until 18:38" while the card under it said "Leave now 15:35, you're 1 h 18 min behind". `onTrip` in `[id].tsx` is true from the day before the trip.

### Prompt

```
Start step 15 of docs/ui-refresh/prompts.md (on the trip). Read the rules, "The look" with the
phase table, D20, frames 16, 31 and 32, and the previous report. Step 14 comes first. The app
only.

1. The plan screen on a trip day, per frame 31:
   - it opens on today's day; the chip says "Day X of Y"; finished days' tabs say "Done" and
     today's says "Today";
   - on today's tab a "Now" card takes the place of the day's line and chips: the time, what's
     on now and until when, with a thin progress line; then "Leave by HH:MM", the next stop,
     the ride, and Directions. "Today" on the card opens the Today screen. Between stops it
     says where you're going; after the last stop, the way back to where you sleep; before
     the day starts, when it starts. Use today.ts for all of it: don't write the logic twice;
   - in the timeline: finished stops become short rows with a tick and "Done"; the stop that's
     on has a blue outline and "Now"; the next has "Next", and its ride shows the leave-by
     time. Finished and current stops can't be dragged, and nothing can be dropped above the
     current stop. Later stops and later days work as before;
   - on the map the finished stops' pins are quieter.
2. The contradiction found in step 0: once the leave-by time has passed, "Now" must not say
   "Free time, until …". It says it's time to leave and how late, on the card and on Today.
   Fix it in today.ts, with tests for: on time, 5 minutes late, an hour late, the next stop
   already started.
3. Today (app/trip/today/[id].tsx), per frame 32: the Now card in the hero colour with the
   weather now (it opens Conditions); the "Leave by" card with the next stop, the ride,
   Directions and "Running late?"; "The rest of today" as one list, where a stop with a
   warning says so and opens Conditions; the way back; the three switches in one card ("Work
   out 'leave by' from where I am" with its privacy line, and the two reminders). "Running
   late?" keeps its panel, preview, "Tell the trip room" and Undo, in the same card style.
   The row "Spent today" is step 19's: don't build it here.
4. One rule for the phase everywhere (step 14's function). Today still opens from the day
   before the trip ("Starts tomorrow"), as now.
5. Keep the test IDs (open-today, today-now, today-next, today-leave-by, today-directions,
   today-late, today-late-*, today-use-location, today-remind-leave, today-remind-weather,
   today-item-*, today-full-plan, today-back). Jest for the Now card's states on both screens
   and for the timeline's states. Maestro flows that use Today still pass.
6. Phone as test account A, on a test trip whose dates include today (make one as account A
   if none is under way). Don't change the phone's clock: check on the phone the states the
   real time allows, and cover the rest in Jest with a set clock; say in the report which is
   which. Running late with Undo; reminders on; dark, Bangla, 1.6×.

Write reports/step-15-report.md, update the Status table, give the git commands, stop.
```

### Done when
- On a trip day the plan shows where you are in the day without opening anything else.
- "Now" and "Leave by" never disagree.
- Today looks like the rest of the app and can do everything it could.

### You check
On a trip day (or a test trip dated today): open the plan and read the Now card. Tap "Today". Tap Directions. Try "Running late?" and Undo.

---

## Step 16: After the trip: the trip as it was (asked 2026-11-14)

**You asked:** the plan changes after the trip.

**Today:** a finished trip's screen is the same as a planned one: every stop can still be dragged, swapped and removed. "How was your trip?" sits at the very bottom of the sheet (`TripReviewCard`, from the trip's first day); "Rate things one by one" is `app/trip/review/[id].tsx`. The offer to mark the trip's cities visited is on the Trips tab (`TripCard.tsx`, `useMarkVisited`, `POST /trips/{id}/mark-visited`, `visited_prompt`). "Duplicate" in ⋮ copies the trip with the same dates (`_copy_trip` in `backend/app/api/v1/endpoints/trips.py`). Every trip whose dates have passed counts as taken, even a plan that was never used: in "Your trips so far" (`summarize` in `backend/app/services/stats/trips.py`), in the rating reminder and in the map offer.

### Prompt

```
Start step 16 of docs/ui-refresh/prompts.md (after the trip). Read the rules, "The look" with
the phase table, D19 and D21, frame 33, and the previous report. Step 14 comes first. The app
and the backend.

1. A finished trip's screen, per frame 33:
   - the chip says "Finished";
   - "Your trip" in the hero colour: days, places (the plan's stops that are places) and the
     kilometres on the road there (the plan's rides added up, from and back to the stay
     included). Under them your rating: the stars (one tap saves, as today), the word, "Edit",
     and "Rate things one by one" with how many are rated. Not rated yet: "How was your
     trip?" with empty stars and "One tap is enough. Only you see it." This is TripReviewCard
     moved up and restyled; it leaves the bottom of the sheet;
   - the budget row: until step 19 it shows the plan's estimate ("≈ ৳… of ৳…");
   - "Put this trip on your map?" while visited_prompt is unanswered: what it will mark, "Mark
     visited", "Not now". The same call as the Trips tab's offer; answering in one place
     removes it in the other;
   - "Plan it again" and "Send to a friend". "Plan it again" makes a copy and asks for new
     dates before the copy is built (today's Duplicate keeps the old dates, which for a
     finished trip makes a second finished trip);
   - the days, read-only: no drag handle, no Add, no "Not quite right?", rides don't open, a
     stop's sheet has no time buttons, Swap, Move or Remove. Each stop shows your Good or Bad
     and your comment when you rated it, or "Rate", which opens "Rate things one by one" at
     that stop. A line says the plan is kept as it was.
   A friend who was in the trip room sees the same, with their own rating. A friend who wasn't
   sees the plan read-only with no rating card, as today.
2. "This trip didn't happen" (D19):
   - backend: trips get not_taken (a date and time, empty by default; an Alembic migration,
     after backing up the database file as earlier migrations did). PATCH /trips/{id} accepts
     not_taken true or false from the owner, only once the trip's last day has passed (409
     before; use the phone's date the app sends, as the review endpoints do). It is in the
     trip and trip-summary answers and in the data export;
   - a trip marked so is not counted anywhere in trip stats (summarize and the lists behind
     "Your trips so far"), is never offered for rating (reviews check_open, the reminder) or
     for the map (mark-visited answers 409). Ratings it already has stay stored and hidden;
   - the app: ⋮ on a finished trip has "This trip didn't happen", with a short confirmation
     that says what it changes. The screen then shows the chip "Not taken", no "Your trip"
     card and no map offer, and keeps "Plan it again". ⋮ then has "It did happen" to undo.
     The Trips tab lists it with "Not taken".
   Tests: stats with and without such a trip; the 409s; the reminder; undo.
3. The ⋮ menu on a finished trip: Budget, Send to a friend, Plan it again, This trip didn't
   happen, Delete. No "Rebuild", "Edit route", "Meals" or "Plan together".
4. Jest: the recap's numbers; rated and not rated; the map offer in each state; read-only
   rows; a trip that wasn't taken. Maestro: the flows that rate a trip (review-star,
   review-save, the reminder) follow the card to its new place.
5. Phone as test account A, on a finished test trip: rate, edit, rate one thing; mark visited
   and see the map; "Plan it again" with new dates; mark a trip not taken, check "Your trips
   so far", undo. Dark, Bangla, 1.6×.

Write reports/step-16-report.md, update the Status table, give the git commands, stop.
```

### Done when
- A finished trip opens on what it was and how you found it, and nothing in it changes by accident.
- "Plan it again" gives a copy with new dates.
- A trip that wasn't taken is out of your numbers, and can be put back.

### You check
Open a finished trip. Rate it. Tap "Plan it again" and choose dates. Mark an old unused plan "didn't happen" and look at "Your trips so far".

---

## Step 17: Conditions, before, on and after the trip (asked 2026-11-14)

**You asked:** the weather section (Conditions) made beautiful and easy to use; it changes during and after the trip.

**Today:** `app/trip/conditions/[id].tsx`: "Updated … ago" with Refresh, day chips, the day in one card, "N things to know" (warnings with "Move to …" and "Keep"), the weather at your stops, "By the hour" as a row of small cards, the sea, "Also checked". The data is `GET /trips/{id}/conditions` (`backend/app/services/conditions/service.py`; Open-Meteo through `openmeteo.py`; kept 30 minutes in `conditions_cache`). Found on 2026-11-14:
- a day that's over has no weather, and the screen then says "The forecast reaches 29 Nov. This day's weather appears about two weeks before", which is wrong for yesterday;
- there is one forecast for the whole trip, at the destination's centre. A stop 26 km or 66 km from town (both are in the test trips) gets the town's weather under "At your stops", and its rain warnings come from the town's sky;
- nothing says what the weather is now.

### Prompt

```
Start step 17 of docs/ui-refresh/prompts.md (Conditions). Read the rules, "The look" with the
phase table and the chart rules, D22, frames 34, 35 and 36 (and the weather button in frames
28, 31 and 33), and the previous report. Step 7 comes first (it builds the weather button).
The backend first, then the app.

Backend (backend/app/services/conditions/):
1. The weather where the stop is. Group the trip's stops by a spot about 11 km wide (their
   coordinates rounded to 0.1°; a meal uses its restaurant's; a stop without coordinates uses
   the destination's centre). Fetch one forecast per spot: read Open-Meteo's docs for asking
   for several places in one request and use that if it exists, else one request per spot,
   at most 8 spots a trip (the rest use the nearest fetched spot). Cache per spot as today.
   Each stop's weather, and its rain, storm and wind warnings, come from its own spot. The
   day's summary and "by the hour" come from the spot of the day's first place.
2. Days that are over. Ask Open-Meteo for past days too (its past_days setting: read the docs
   for how far back it goes) whenever a trip has started, so a finished day comes back with
   the weather as it was. Each day gets when: "past", "today" or "coming", worked out from
   the phone's date (a today parameter, as GET /review has; the server's date when it's
   missing). A past day also gets recorded: true and rain_mm for the day, and no warnings or
   checks. A day older than the service returns has in_forecast false and when "past".
3. Now. When one of the trip's days is today, also ask for the current weather and return
   now: { time, temp, code } for today's spot.
4. A day the forecast doesn't reach yet gets opens_on: the date its forecast will appear.
   The forecast's length stays in one constant in the backend; the app doesn't repeat it.
5. Tests with saved Open-Meteo answers (no network in tests): two spots with different rain;
   a trip under way with a finished day; a trip that ended; now present and absent; a day
   beyond the forecast; a failed refresh keeps the last copy and stale stays true.

App (app/trip/conditions/[id].tsx and src/features/trips/conditions/):
6. The screen per frame 34: the title with Refresh as an icon button (pull to refresh stays);
   the place and "updated … ago" with the dot; the days as a strip of cards (the date, the
   sky, high and low, a mark when the day has something to know; more days than fit scroll);
   the day in one look in the hero colour (the sky in words, the temperature, the rain in
   words, then sunrise, sunset and the sea); "N things to know" as cards with "Move to <day>",
   "Keep" and the source line; "You kept these" with "Show again"; "By the hour"; "At your
   stops"; the sea; "Also checked"; the last line.
7. "By the hour" is one figure of three strips that share the hours 06 to 22 (frame 34): the
   temperature as a line, with its highest, first and last values written on it; the chance
   of rain as thin columns from one baseline, the hours at 60% or more in the blue and the
   rest in a lighter blue, the highest written above; and where your stops start, as their
   numbers. Follow the chart rules in "The look". Sliding a finger along the figure reads one
   hour in a line above it (time, sky, temperature, chance); the same hours stay reachable
   one by one for a screen reader. Draw it with react-native-svg.
8. On a trip day, per frame 35: the strip says "Today" and "done"; the hero is "Now" (from
   now, else this hour's forecast) with the next rain in words ("Rain likely from 15:00
   (70%)", or "No rain expected today") and "Dry for …"; "The next hours" (six, from now);
   "For the rest of today" (only warnings for stops still to come; "Move to tomorrow" when
   the drier day is tomorrow); "At the stops still to come", with one line for what's behind
   you; "Tomorrow" as a row that opens that day; the evening-before reminder switch (the same
   setting as on Today).
9. The other states, per frame 36: a day the forecast doesn't reach ("The forecast opens on
   <opens_on>", with sunrise and sunset from the date); a day that's over ("as it was": the
   sky, high and low, rain or none; no warnings); a day too old to have weather ("The weather
   for this day isn't kept"); no connection (the last copy with its age and "Try again").
   After the trip every day is "as it was".
10. The weather button on the trip screen (step 7) follows the same states: the day's
    forecast; on today's tab "Now" and the next rain; "As it was" for a finished day; a
    calendar and "Forecast from <date>" when it's too early; quieter, with its age, when the
    copy is old. The day tabs' sky icons use the recorded weather for finished days.
11. Keep the test IDs (conditions-updated, conditions-refresh, cond-day-N, cond-summary,
    warning-<code>, warning-move, warning-keep, cond-hours, cond-chip-*). Jest: each state of
    the hero, the strip and the button; the figure's labels; move and keep.
12. Phone as test account A: a trip two weeks away, one within the forecast with a warning
    (if no test trip has one, say so and show that state in Jest only), one under way, one
    finished; refresh; no connection (stop the backend or drop the adb reverse for 8001:
    don't switch the phone to aeroplane mode); dark, Bangla, 1.6×.

Write reports/step-17-report.md, update the Status table, give the git commands, stop.
```

### Done when
- Conditions tells you in one look what the day will be like and what to do about it, and on the trip what's happening now.
- A stop far from town shows its own weather.
- Yesterday shows what the weather was, not "no forecast yet".

### You check
Tap a trip's weather button before the trip, and again on a trip day. Slide a finger along "By the hour". Look at a finished day.

---

## Step 18: Budget, redesigned (asked 2026-11-14)

**You asked:** the budget section made beautiful and easy to use.

**Today:** `app/trip/budget/[id].tsx` from `GET /trips/{id}/budget` (`full_budget` in `backend/app/services/budget/service.py`): the total against your budget with a five-colour bar, the five parts, the AI estimate card, "By day", "Ways to save" (applied in one tap, with Undo). Found on 2026-11-14 in the test trips:
- Food reads as an exact price (no ≈) although every meal in the plan had a default ৳300: a meal counts as an estimate only when it has no restaurant at all, not when its restaurant's price isn't known;
- Tickets reads "৳0" when not one entry price is known (11 of 11 unknown in one trip);
- a cheaper hotel is offered with "Rated 3.5 (now 3.5)" although neither rating is known (`rating_known` is false; 3.5 is a default).

### Prompt

```
Start step 18 of docs/ui-refresh/prompts.md (Budget). Read the rules, "The look" with the
chart rules and the five part colours, frame 37 (and the budget row in frame 28), and the
previous report. The backend first, then the app.

Backend (backend/app/services/budget/service.py, with a test for each):
1. Food is an estimate whenever a meal's price is a default: a meal at a restaurant whose
   price isn't known (cost_known false, or the item's cost_source is "placeholder") counts
   like a meal without a restaurant. The part then has estimate true, a range, and how many
   of its meals are guesses; the day it's on is marked an estimate too.
2. Tickets: when no entry price is known at all (none paid, none free, some unknown) the part
   is known false, with reason "no_price" and how many places, and adds nothing. The app says
   so instead of "৳0".
3. Ways to save never compare or show a rating that isn't known. A cheaper hotel is offered
   on its price; its rating is added only when both ratings are known.
4. Check the other numbers still agree after 1 to 3: total, low, high, left, status, and the
   older fields the trip screen reads (estimated_total). Run the existing budget tests and
   the Maestro budget flow.

App (app/trip/budget/[id].tsx), per frame 37:
5. The top in the hero colour: "The plan costs about", the amount (≈ when any part is an
   estimate), "of your ৳… budget" with "Change" (a small sheet with a typed amount: the
   budget field from New trip, saved through the trip's PATCH), the meter, one status line
   with an icon and words (left; only … left; could reach …; over by …), the likely range,
   then "Each" and "Of it, estimated".
6. "Where it goes": one bar 28 dp tall in pieces (2 dp gaps, 4 dp corners, each part's share
   written inside when it fits, nothing when it doesn't), then the five parts as rows that
   are also its key: the colour, the name, where the number comes from, the amount. A part
   that isn't known has no colour and no piece of the bar, and says why ("Add where you start
   from to see this", "… price not known", "Entry prices aren't known for N places"). Several
   stays keep their lines under Stay. The five colours are in "The look".
7. "By day": one bar a day in the blue, the amount at its end, and the note that getting
   there and the stay are counted once above.
8. "Ways to save": one kind of card for every way (a cheaper stay, another town for some
   nights, skipping a paid stop, rickshaws for short rides): what changes, what it costs in
   time or comfort, "Save ৳…", Apply, with Undo in the snackbar as today.
9. The AI estimate keeps every state it has (ask, reading, the answer with its range and "Use
   ৳… as my budget", failed, not set up), in one quiet card under the ways to save.
10. A friend's trip is read-only: no Change, no Apply.
11. Keep the test IDs (budget-total, budget-status, budget-part-<key>, budget-stay-<key>,
    budget-save-<key>, budget-apply-<key>, budget-snackbar). Jest: each status; an unknown
    part of each kind; the bar's pieces and labels; a friend's view.
12. Phone as test account A: a trip under its budget, one close to it, one over (change the
    budget to get there); apply and undo each way to save the trips offer; dark, Bangla, 1.6×.

Write reports/step-18-report.md, update the Status table, give the git commands, stop.
```

### Done when
- The first thing you read is what the plan costs and whether it fits.
- A number that is a guess says so, and a number that isn't known isn't shown as ৳0.
- Applying a way to save changes the plan and the numbers, with Undo.

### You check
Open Budget on a planned trip. Tap "Change", set a lower budget and watch the status. Apply one way to save and undo it.

---

## Step 19: What you really spent (asked 2026-11-14)

**You asked:** Budget changes during and after the trip, and you said yes to noting what you spend (D18).

**Today:** Vromon knows only what the plan costs. Nothing records what was paid, so on the trip and after it Budget shows the same estimate as before.

### Prompt

```
Start step 19 of docs/ui-refresh/prompts.md (what you spent). Read the rules, "The look" with
the phase table and the chart rules, D18, frames 38, 39 and 40 (and the rows in frames 31, 32
and 33), and the previous report. Step 18 comes first. The backend first, then the app.

Backend:
1. A table for what the traveller notes, trip_expenses: the trip (deleted with it), who noted
   it, the day (a date), the amount (more than 0, in the trip's currency, for the whole
   group), the part (getting_there, stay, food, tickets, local, shopping, other), a note (80
   characters at most, may be empty), and, when it came from the plan, the stop or the ride
   it pays for (emptied if that stop is later removed; the note stays). An Alembic
   migration, after backing up the database file.
2. Endpoints under /trips/{id}/expenses, for the owner only: list (newest first), add,
   change, delete. The day may be from the day before the trip to the day after it. A friend
   who can read the trip gets 404 here: spending is private.
3. GET /trips/{id}/expenses/suggestions?day=…: the day's plan as things to pay for that have
   no note yet: each meal and paid stop (its price × the travellers) and each ride (its fare
   × the vehicles needed, the same sum the budget uses), each with a short name, its part,
   and the stop or ride it belongs to. Nothing whose price isn't known.
4. GET /trips/{id}/budget gains, for the owner only: spent { total, by_part, by_day, today,
   count }, to_come and projected. to_come is: for getting there and for the stay, what's
   planned minus what's noted for that part, never below 0; for food, tickets and rides, the
   plan's amounts for the days after today plus what's left of today's. projected is spent
   plus to_come. The phone's date comes as today (as GET /review has it). All of it is empty
   for a trip with no notes.
5. The data export and account deletion include the notes (as trip reviews do, in
   backend/app/api/v1/endpoints/me.py).
6. Tests: each endpoint and its limits; the sums; to_come before, on and after the trip; a
   removed stop keeps its note; a friend sees none of it; export and deletion.

App:
7. "What did you spend?" (frame 39), a sheet: the amount, typed on the number keyboard (Bangla
   digits work), "for all N of you"; "From today's plan": the suggestions as chips, where one
   tap fills the amount, the part and the note, and all three can still be changed; "What
   for" (the seven parts); a note; the day (today, or another day of the trip); Save. Opening
   a note you made shows the same sheet with Delete.
8. Budget on the trip (frame 38): the hero says "Spent so far" with the amount, your budget,
   the meter, what's left, and one line with what is still to come by the plan and where that
   would end. "Today" with today's notes and "Add what you spent". "Spent of what's planned":
   the five parts, each a bar in its own colour on its lighter track, with "৳… of ≈ ৳…"; a
   part over its plan says "৳… over" with an icon. "By day": what was spent as a bar and the
   plan as a mark, with the small key under it. "Everything you noted" opens the full list by
   day; each note opens the sheet. The ways to save and the AI estimate aren't shown once the
   trip has started.
9. Budget after the trip (frame 40): "The trip cost", under or over your budget in words,
   "Each", "Against the plan"; "The plan and what you spent" as a table (a row for each part,
   "Not in the plan" for shopping and other, "All together"); "By day"; "The biggest costs";
   "Everything you noted". Notes can still be added and changed.
10. When nothing was noted: on the trip the hero shows the plan ("The plan costs about") with
    "Add what you spent" under it; after the trip, the last card of frame 40 ("By the plan,
    about ≈ ৳…", "You didn't note what you spent", "Add what you spent"). Never a "৳0 spent"
    that reads as a fact.
11. The same numbers elsewhere: the plan sheet's budget row on a trip day ("৳… spent of ৳…")
    and after the trip ("It cost ৳…", under or over), per frames 31 and 33; Today's row
    "Spent today" with "Add" (frame 32); the day's line on a finished day ("… spent that
    day"). With no notes these keep the plan's estimate. If step 15 or 16 isn't built yet,
    leave its row out and say so.
12. Jest: the sheet (a suggestion, typed, edit, delete); each Budget state with and without
    notes; the rows elsewhere. A new Maestro flow: add a note from Budget, see the total
    change, delete it.
13. Phone as test account A, on a test trip under way and a finished one: note from a
    suggestion and by typing; edit; delete; a part going over its plan; nothing noted; dark,
    Bangla, 1.6×.

Write reports/step-19-report.md, update the Status table, give the git commands, stop.
```

### Done when
- On the trip, two taps note a cost, and Budget shows what's spent, what's left and what's still to come.
- After the trip, Budget shows what it cost against the plan.
- A trip with no notes still shows honest numbers: the plan's, said to be the plan's.

### You check
On a trip day open Budget, tap "Add what you spent", choose a suggestion and save. Look at the numbers. After the trip, open Budget again.

---

## Step 20: Polish pass, full checks, the friends' APK (the whole UI)

**You asked:** make the whole UI more beautiful and polished.

### Prompt

```
Start step 20 of docs/ui-refresh/prompts.md (polish and full checks). Read the rules, "The look",
every earlier report's "left open" list, D6 with its answer, and the mockups.

1. One pass over every screen against the mockup's look: spacing, type sizes, corners, icon style,
   button heights, sheet headers, and the loading, empty and error states. List what differed and
   what was changed. Don't redesign a screen the owner didn't ask about: bring it in line.
2. D6: ask the owner whether the typed time boxes of step 6 should replace the chips for the
   other times (the day's start and finish, arriving and leaving, a must-see's time), and do it
   if yes. Then everything earlier reports left open. The remaining orange cards (cards.ts)
   take the look's hero card.
3. The whole app once more, as test account A on a release build of the dev app: light and dark,
   Bangla, the largest text, reduced motion, and what a screen reader reads on each changed screen
   (adb shell uiautomator dump --compressed).
4. All checks (rules), and the whole Maestro suite on the phone, in the background.
5. Update docs/architecture.md and docs/feature-inventory.md for what steps 0b–19 changed.
6. The friends' APK: ask the owner first; back up the current one (scripts/share/apk/), rebuild,
   check it on the phone.

Write reports/step-20-report.md with what's still open, update the Status table, give the git
commands, stop.
```

### Done when
- Every screen follows one look.
- All test suites and the Maestro suite pass; the release build behaves like the debug build.
- Nothing is left open that you haven't seen in a report.

### You check
Use the app for ten minutes as you normally would. Anything that still looks off goes into a short list for one more pass.

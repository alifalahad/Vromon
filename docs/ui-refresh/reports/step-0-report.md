# Step 0 report: the look, the globe check, and the decisions

**Date:** 2026-11-13. **Status:** done. No app code was changed.

- **Mockups:** https://claude.ai/artifact/RMjDbAXaeW6DNQKAY8pBNN (40 frames: 21 on 2026-11-13, 19 more on 2026-11-14). The owner approved the look and all 40 frames.
- **Decisions:** D1–D23 are answered and written into [prompts.md](../prompts.md).
- **The globe:** the installed map library can't draw one. Vromon draws its own; the owner allows a library with native code.
- **The plan grew:** a new step 0b (the look's foundations), step 11 (the hotel list), step 12 (Explore), step 13 (Account and settings), and steps 14–19 (the trip plan, on the trip, after the trip, Conditions, Budget, what you spent); the polish pass is now step 20. Sections 8 and 9 cover what was added on 2026-11-14.

## 1. What was looked at on the phone

The dev app was signed out when the step began, so it was signed in as test account A. Nobody was signed out, and the owner's own account (in the friends' app) was not touched. A read-only proxy sat between the phone and the backend for the whole look, so nothing could be written.

Opened and looked at: sign-in, the Map tab, the Trips tab (at the top and scrolled), "All trip stats", Today (reached through "Open plan"), the trip screen, and the Explore tab.

**Not opened:** New trip, the busy-time sheet, the Map sheet, Map Theme, "Your story", and a drag. For those I relied on the owner's 19 screenshots of today and on the code. Where a later step finds the screen differs from its "Today" line, the screen wins.

Differences from the "Today" lines in prompts.md:

| Where | What |
|---|---|
| The phone | It runs in dark appearance; the owner's screenshots were light. Both are in the mockups. |
| Trips tab | A "Rate your trip" card sits above the next-trip card when a finished trip hasn't been rated, pushing the next trip down. |
| Trips tab | During a trip, "Open plan" opens Today, not the plan. The button doesn't say so. |
| Explore tab | It has a search bar at the top, not a title. The account picture goes beside the search bar (frame 18). |

## 2. The Trips tab: what doesn't work (D9)

Tried on test account A, which is on a trip today:

| Tried | Result |
|---|---|
| "All trip stats" at the top of the list | The "+ Plan a trip" button covers the right half of the link. The uncovered half works. |
| Scrolling the list | Content slides up under the status bar; the "Trips" title scrolls away. |
| "Open plan" on the next-trip card | Opens Today (the trip is on). Works. |
| "Full plan" from Today | Opens the trip screen. Works. |
| "All trip stats" | Opens. Nothing on that screen can be tapped. |

**Not tried:** the four numbers, the trip rows, and "+ Plan a trip" itself.

The owner's answer covers it: "Don't hide anything. Everything should show every time." Step 9 is written around that.

## 3. The globe (D1)

**The installed map library has no globe.**

- `@maplibre/maplibre-react-native` 11.5.0 has no projection setting.
- Its native library for Android (MapLibre Native 13.6.1, read from the Gradle cache) has no globe in its code: the word doesn't occur in the compiled library, and its Java classes have no way to choose a projection.
- The project's own news of August 2026 says a globe for MapLibre Native has been proposed as a change, not released ([newsletter](https://maplibre.org/news/2026-09-02-maplibre-newsletter-august-2026/), [roadmap page](https://maplibre.org/roadmap/maplibre-native/globe-view)).

Because of that I did not make the temporary edit on the phone that the step's prompt described: a setting the library doesn't read can't show anything.

**What our own globe costs.** The bundled countries are 242 shapes with 38,134 points. Projecting all of them onto a sphere and building their outlines took 5.4 ms a frame, measured in Node on the Mac. The phone's JavaScript engine is slower; I estimate several times, and did not measure it. So redrawing every shape on every frame is not a safe plan.

**The owner's answer:** a rebuild is not a problem; use Skia or something better; no API call.

**What step 1 now says:** draw the world once as a flat picture on the phone, and let a small shader wrap it onto a sphere (Skia). Turning then costs the same however detailed the shapes are. Step 1 first spends half an hour checking whether another library fits better, and has a fallback if the shader fails on the phone. This is my recommendation from reading, not something I ran.

## 4. The mockups

21 frames on one page: Map tab (7), New trip (3), trip screen (4), Trips tab and the account picture (5), dark (2).

- **The maps in the frames are real shapes.** The Bangladesh map, the globe and the Cox's Bazar day map were drawn from the app's own bundled map files by a small script, and I checked those pictures before using them. Streets on the day map are stand-ins.
- **I have not seen the finished frames myself.** The canvas tool asks not to render-check unless the owner asks. The owner has looked and approved the look. If a frame looks broken, tell me which.
- **The numbers and names are examples.** A step shows only what the app's data really has (rule 4). The frames contain things a step must confirm exist before showing them: the count of places in a country, "since 2003", "within about 20 m", a train's departure time, "rain on day 2".

What the frames propose beyond the nine points, all inside the approved look:

| Proposal | Frame | Why |
|---|---|---|
| Navy, blue and one marigold highlight; white cards | all | One calm look; the map and the next trip carry the colour. |
| Anek Bangla for titles and big numbers | all | One title font for English and Bangla. One bundled font file; body text stays the phone's font. |
| Light-blue Default map; grey becomes "Classic" (D13) | 1 | The grey map was the dullest thing on the first screen. Both colour sets already exist in the app. |
| The selected tab on a blue pill | 1 | Clearer than colour alone. |
| The next-trip card as a ticket with the destination's map | 15, 16 | The countdown and the place are what a traveller looks for. |
| "New trip" in the header, no floating button | 15 | Nothing can cover the list (D9). |
| A date block on each trip row | 15, 17 | The date is the first thing you look for in a list of trips. |
| "Mark" on places you haven't visited | 4 | A dashboard that only shows can also do the one obvious thing. |

After the owner's answer on D9b, frame 17 was redone: "How you travelled" is gone; the top is a hero with trips, days and what's coming; "Where you went" opens countries and cities.

## 5. The decisions

Asked in three rounds on 2026-11-13. The full table is in prompts.md; in short:

| # | Answer |
|---|---|
| D1 | Own globe; Skia or better; rebuilding is fine; no API call. |
| D2 | Dashboard as in frames 3–5; Replay and the poster both stay. |
| D3 | Map theme as in frame 7. |
| D4 | 50 travellers at most (not asked; the default stands). |
| D5 | The way there comes off the trip's maps only; the dotted line on the Map tab stays. |
| D6 | Typed times for the busy time now; the others later, if liked. |
| D7 | The trip's top row as in frames 11–12; no back arrow. |
| D8 | The strip of frames 13–14 is right, and a far move (day 1 to day 10) must be easy and smooth. |
| D9 | Don't hide anything; everything shows every time. |
| D9b | Frames 15 and 17 are right; "How you travelled" is not important; make the stats screen more beautiful, with what matters. |
| D10 | 32 dp picture, 48 dp touch area (as asked; not a question). |
| D11 | Fix the hotel list: hotels must be places to stay. The other three things were not chosen. |
| D12 | The look is approved. |
| D13 | Light-blue Default; grey stays as "Classic". |
| D14 | The title font, as part of the look. |

## 6. What changed in prompts.md

- The mockups link, the Status table, the answered Decisions table (D12–D14 added).
- A new section, "The look": which frame is which file, how a step reads a frame, and the colours, type and shapes behind the frames.
- **Step 0b (new):** the colours, the title font, the tab bar and the Default map go into the app first, so every screen changes together.
- **Step 1:** rewritten for a globe of our own with Skia.
- **Step 8:** a far move must be as easy as a near one.
- **Step 9:** rewritten around "nothing hidden", frames 15–17, and the stats screen without "How you travelled".
- **Step 11 (new):** the hotel list, only places to stay. In Bangladesh many restaurants are called "Hotel …", so the rule goes into the data, not the app.
- **The polish pass** moved to the end (step 20 after the additions of 2026-11-14).

## 7. Left open

- The frames were approved as a look. Layout details may still change when each step is seen on the phone.
- Today's orange "Now" card takes the hero colour: drawn in frame 32, built in step 15.
- The dark frames cover the Map tab and the Trips tab only. The other screens follow the dark colours in "The look".

## 8. Added on 2026-11-14: Explore and Account settings

The owner asked for Explore and Account settings to be redesigned too, before the next step, and for Explore's first half to say "Your country" instead of "Bangladesh". Six frames were added to the mockup page and approved the same day. No app code was changed.

| Frame | Screen | What's new |
|---|---|---|
| 22 | Explore, "Your country" | A switch, "Your country" and "The world", splits today's one long page in two. The hero is a satellite picture of the country itself, with "You've been to 5 of 64 districts". "Ready to plan" puts the places Vromon can plan on the first screen. |
| 23 | Districts and foods | Division chips, then districts as photo cards (the first large), with "Visited" from your marks and "You can plan it". GI foods in Bangla, as the register gives them. |
| 24 | Explore, "The world" | Continents as tiles with your visits, then the most populous countries with your marks. |
| 25 | A district | The photo across the top, "Plan a trip here" and "Mark" as the two actions, four counts, the map, then sights. |
| 26 | Account and settings | The top is who you are, with your travel numbers. Grouped cards with an icon and the current value on every row. Sign out on its own at the end. |
| 27 | Edit profile | The photo with a camera badge, name, username with its check inside the field, "Your country", Save fixed at the bottom. |

Frame 18 (the account picture on Explore) was redrawn to match frame 22.

**The content is real.** Before drawing, I read what Explore shows from the local backend as test account A (read only): the divisions and districts with their counts, the photos and their credits, the GI foods, the continents, countries and cities, and Bandarban's page. The photos in the frames are the ones the app already shows, credited on the canvas.

**Found while reading the data** (each is in step 12's "Today" or noted here for later):

- The Bangladesh hero picture is a single map tile that shows mostly India and Nepal. Step 12 asks the same service for a picture framed on the country.
- Explore is hard-wired to Bangladesh, whatever the home country is. D15 changes that.
- The GI register has Bangla names only; in English the app has nothing else to show. Step 12 shows them in Bangla.
- Destinations have no photos of their own. Step 12 joins them to their districts.
- Two district photos are poor choices: Chattogram's is a drawn map, and Cox's Bazar's is an aquarium. That is a data matter, not part of step 12. Say if you want it looked at.

**Wording proposed in frame 26**, which step 13 puts in: "Vibrate on taps" (Haptic feedback), "Distances in" (Distance units), "Same as the phone" (System), "Download my data" (Export my data), "Licences and data sources".

**In prompts.md:** D15 and D16 added; frames 22–27 in "The look"; step 12 (Explore) and step 13 (Account and settings) are new; the polish pass moved to the end.

**Not done:** I did not open Explore's inner screens or Settings on the phone for this (the phone was back on its home screen, so I left it alone). The frames rest on the code and the data. As before, I have not seen the published frames myself.

## 9. Added on 2026-11-14: the trip plan, Conditions and Budget

The owner said the trip plan is the app's best feature and asked for it, the weather section (Conditions) and the budget to be designed as well: before, on and after the trip, with the logic behind them fixed or written into the prompts. 13 frames were added and approved the same day. No app code was changed: every logic fix is written into steps 14–19.

| Frame | Screen | What's new |
|---|---|---|
| 28 | The plan, before the trip | The trip's name with a chip that says where it stands ("In 6 days"). The budget as its own row. Day tabs with the day's sky. The day as a timeline with the rides drawn between the stops. |
| 29 | A whole day | Every kind of row from top to bottom: getting there, leaving the stay, stops, rides, free time with "Add", back, "Tonight", then "Not quite right?" and "About this trip". |
| 30 | A stop | Its time with "15 minutes less / more" and "Keep this time", the weather then, the price, the hours, why it's in the plan, and the four actions. |
| 31 | The plan, on the trip | "Day 2 of 3". A "Now" card: what's on, how long is left, when to leave for the next stop, Directions. Finished stops ticked, the current one outlined. |
| 32 | Today | The same look: Now, "Leave by" with Directions and "Running late?", the rest of today, the spending row, the three switches in one card. |
| 33 | The plan, after the trip | "Finished". Your trip in three numbers with your rating, what it cost, "Put this trip on your map?", "Plan it again", and the days kept as they were with your Good or Bad on each stop. |
| 34 | Conditions, before the trip | The days as a strip, the day in one look, what to know with "Move to Sunday" and "Keep", the hours as a small chart (temperature, chance of rain, when your stops start), the weather at each stop, the sea, what else was checked. |
| 35 | Conditions, on the trip | Now, the next rain in words, the next six hours, what to know for the rest of today, tomorrow. |
| 36 | Conditions, other states | Too early for a forecast, a day that's over ("as it was"), no connection. |
| 37 | Budget, before the trip | What the plan costs against your budget, where it goes (one bar in five parts with their rows), by day, ways to save, the AI estimate. |
| 38 | Budget, on the trip | Spent so far, today's notes with "Add what you spent", spent of what's planned for each part, by day. |
| 39 | Noting what you spent | The amount, one-tap suggestions from the day's plan, what it was for, a note, the day. |
| 40 | Budget, after the trip | What the trip cost, the plan beside what you spent, by day, the biggest costs, and what shows when nothing was noted. |

Frame 11's sheet was redrawn to match frame 28.

**What the frames rest on.** Before drawing I read three of test account A's trips from the local backend (read only): one finished (Cox's Bazar), one under way (Khulna, day 2 of 4) and one a week away (Khulna), each with its plan, conditions, budget and review. The frames then follow one example trip (Cox's Bazar, Fri 20 – Sun 22 Nov, two travellers, ৳25,000) so the numbers add up from frame to frame. Its places, times and prices are examples.

**Found in the logic** while reading the code and those trips. Each is in a step's "Today" and is fixed in that step:

| Where | What | Step |
|---|---|---|
| The plan | Times like 10:39, 13:51 and 18:58. | 14 |
| The plan | The day's line counts meals as "stops", and its money leaves the rides out, so it disagrees with Budget's "By day". | 14 |
| Today | "Free time, until 18:38" while the card below says "Leave now 15:35, you're 1 h 18 min behind" (seen on the phone on 2026-11-13). | 15 |
| A finished trip | It can still be dragged and changed like a planned one. | 16 |
| Past trips | Every trip whose dates have passed counts as taken, even an unused plan. | 16 |
| Conditions | A day that's over has no weather, and the screen says the forecast "appears about two weeks before". | 17 |
| Conditions | One forecast for the whole trip, at the destination's centre: stops 26 km and 66 km away show the town's weather. | 17 |
| Conditions | Nothing says what the weather is now. | 17 |
| Budget | Food reads as exact although every meal had a default ৳300. | 18 |
| Budget | Tickets reads "৳0" when no entry price is known. | 18 |
| Budget | A cheaper hotel is offered with "Rated 3.5 (now 3.5)" when neither rating is known. | 18 |
| Budget | Nothing records what was really paid. | 19 |

Places in a plan have no photos in the data, so the design doesn't use any.

**The owner's answers** (asked once, after the frames were up):

| # | Answer |
|---|---|
| D17 | Frames 28–40: "Yes, build these." |
| D18 | Noting what you spent: yes, add it. |
| D19 | "This trip didn't happen": yes, add it. |
| D20 | Today and the plan: keep both screens. |
| D21 | A finished trip's plan is read-only; "Plan it again" makes a copy with new dates (drawn in frame 33, approved with it). |
| D22 | A day that's over shows the weather as it was (frames 33 and 36, approved with them). |
| D23 | Times on whole 5 minutes. Not asked: my choice, written so it can be changed. |

**In prompts.md:** D17–D23; frames 28–40, the three phases as a table, the warning and danger colours, the five Budget colours and the chart rules in "The look"; steps 14–19 are new; the polish pass is step 20; step 7 now says which parts of frame 11 belong to steps 14 and 17.

**Checked:** the five Budget colours passed a check for people who see colours differently, in light and in dark, each on its card colour. The yellow is faint on white, so every part also has its name and amount beside it.

**Not done, and not known:**
- The phone was not used for this. The frames rest on the code, the data and the screenshots of 2026-11-13.
- I have not seen the published frames myself (the canvas tool's rule). If one looks broken, say which.
- The new frames are in light appearance only. Dark follows "The look"; the warning and danger colours have no dark values yet.
- Step 17 relies on two things in the weather service I did not read up on in this session: asking for past days, and asking for several places at once. Its prompt tells the agent to read the service's docs first.
- Steps 14, 17 and 19 are large. If one doesn't fit a session, its report should say where it stopped.

## For the owner

- **The phone:** the dev app is signed in as test account A. Your own account in the friends' app is as it was.
- **The phone's ports** (`adb reverse`) are empty right now: the USB connection reset at some point. The next step adds 8081 and 8001 again before using the dev app.
- The read-only proxy is stopped. Nothing was written to the database, except that reading three trips' conditions on 2026-11-14 refreshed the saved weather copy (`conditions_cache`), as opening Conditions in the app does.
- Still open from earlier plans, unchanged: the Firebase and EAS setup for push, the sign-out scope, the disk space.

## Files

- `docs/ui-refresh/prompts.md` (new in this plan; updated in this step)
- `docs/ui-refresh/reports/step-0-report.md` (this file)

## Git

```
git add docs/ui-refresh
git commit -m "UI refresh: prompts for steps 0-20, step 0 report (mockups, decisions)"
```

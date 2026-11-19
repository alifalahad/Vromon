# Step 17 report: Conditions, before, on and after the trip

2026-11-19, on the `ui-refresh` branch. Committed there before step 18 began, at the owner's choice (see Git); not pushed.

Conditions now tells you each day in one look, whichever side of the trip you're on (frames 34–36):
- **Before a day:** what it will be like, what to know and what to do about it, "By the hour", your stops, the sea and what else was checked.
- **On a trip day:** the weather now, the next rain and how long it stays dry, the next hours, what's left to know for the rest of today, and the stops still to come.
- **After a day:** the weather as it was, from the weather service's records, with no warnings.

A stop far from town now gets its own weather.

## 1. The weather where the stop is (backend)

- **Spots:** a trip's stops are grouped into spots about 11 km wide (coordinates rounded to 0.1°).
  - A meal uses its restaurant's coordinates.
  - A stop without coordinates uses the destination's centre.
- **One request for all of a trip's spots.** Open-Meteo's docs (read 2026-11-19) allow comma-separated latitudes and longitudes, and the answer is then a list, one result per place in the order asked. Each result carries the weather model's own grid point, not the coordinates sent, so results are matched by their order.
- **At most 8 spots a trip:** the ones with the most stops. Any other stop uses the nearest fetched spot.
- **Cached per spot, as before:** 30 minutes, Refresh after 2. If a fetch fails, the last copy is used, marked stale.
- **Each stop's weather and its rain, storm and wind warnings come from its own spot.** The day's summary and its hours come from the spot of the day's first place.
- **Checked with the real saved answers:** a stop at Teknaf Wildlife Sanctuary, 66 km from town, gets Teknaf's rain, while a town beach the same afternoon stays dry.

## 2. Days that are over, today, and to come (backend)

- **Which day is which:** the conditions request now takes `today`, the phone's date, as the review endpoints do. It's used when it's within a day of the server's date; otherwise the server's date is used. Each day comes back as `when`: "past", "today" or "coming".
- **Past days:** once a trip has started, the request asks for the days before today too. `past_days` goes back 92 days, per the docs. It's asked in three sizes (7, 31 or 92 days), so one copy per spot serves every trip that started within that many days.
- **A day that's over** comes back `recorded`, with its high, low, sky and the rain that fell (`rain_mm`). It has no warnings, no checks and no hours (D22).
- **Older than the records:** a day more than 92 days ago has `in_forecast` false. A trip that ended that long ago asks the service nothing at all.
- **Now:** on a trip day, `now` gives the weather now at that day's first place: `{ time, temp, code }`, from Open-Meteo's 15-minute data.
- **Too early:** a day the forecast doesn't reach yet gets `opens_on`, the date its forecast appears. The forecast's length (16 days) lives in one constant, `openmeteo.FORECAST_DAYS`; the app doesn't repeat it.
- **Moving a stop to a drier day** is offered only for days still to come (section 8).
- **`forecast_until` stays** in the answer, for the friends' APK (the app before this step).

## 3. The Conditions screen (frames 34–36)

The screen is `app/trip/conditions/[id].tsx`, with its parts in `src/features/trips/conditions/`.

- **The header:** "Conditions" with Refresh as an icon button; pull to refresh still works. Under it, the place and "updated … ago" with a dot, green when fresh and amber when offline.
- **The days as a strip of cards (`DayStrip`):**
  - each card has the date, the sky, the high and the low;
  - the chosen day is blue, and a marigold dot marks a day with something to know;
  - on a trip, days gone by are quiet and say "done", and today's says "Today";
  - three fit across; more days scroll, keeping the chosen one in view.
- **The day in one look, the one hero card (`ConditionsHero`):**
  - before the day: the sky in words ("Rain in the afternoon", "Rain on and off", "Thunderstorms likely", or the sky), the high, "Low 23° · 70% chance at 15:00", then sunrise, sunset and the sea;
  - the other states are in sections 5 and 6.
- **"N things to know":** each warning is a card with its reason, then "Sunday is dry at that time." when a drier day exists, "Move to Sunday", "Keep" and its source line. "You kept these" has "Show again".
- **"By the hour":** section 4.
- **The rest:** "At your stops" with each stop's number, time, sky, temperature and chance of rain; the sea; "Also checked"; the last line.
- **The sky icons are the frames' own (`SkyIcon`):** a marigold sun with rays, a white cloud with a quiet edge, and blue rain lines. They're used on the screen, the weather button and the day tabs. The icon font's weather glyphs are filled shapes of another weight. A storm (a marigold bolt), fog and night (a moon) aren't in the frames; they're drawn the same way.

## 4. "By the hour" (`HourFigure`)

One figure of three strips sharing the hours 06 to 22, drawn with react-native-svg per the chart rules:
- **Temperature:** a 2 dp line over a faint fill, with its highest value marked and written, and the first and last values written at the ends.
- **Chance of rain:** thin columns from one baseline, rounded at the top and square at the baseline. Hours at 60% or more are in the blue and the rest in a lighter blue. The highest chance is written above its column, and the hours are written underneath.
- **When your stops start:** each stop's number in its own colour (blue places, orange meals).
- **Reading one hour:** sliding a finger along the figure (or tapping it) reads one hour in the line above: "15:00: Rain, 27°, 70% chance of rain". A dashed line marks that hour on the drawing.
- **Screen readers:** each strip is read as one sentence, then the hours one by one.

## 5. On a trip day (frame 35)

- **The hero card:**
  - "NOW · 11:30" and the weather now, from the service's own reading while it's under 90 minutes old, otherwise this hour's forecast;
  - "High 29° · low 23°";
  - the next rain on a warm tint, "Rain likely from 15:00 (70%)", or "No rain expected for the rest of today" on a quiet one;
  - then "Dry for" ("3 h 30 min", "The rest of today", or "Rain: Likely now"), the sunset and the sea.
- **"The next hours":** six cells, now and the five after it. "Now" is on the blue tint and shows the same reading as the hero card; a likely hour's chance is on a warm tint.
- **"For the rest of today":** only warnings for stops that haven't ended yet. "Move to tomorrow" appears when the drier day is tomorrow.
- **"At the stops still to come":** the stops still ahead, then a line such as "Stops 1 and 2 are done. You're at stop 3 now."
- **"Tomorrow · Sun 22":** a row with its high and low, its sky and its warnings. It opens that day.
- **"Tell me the evening before if bad weather is coming":** the same setting as Today's. As on Today, turning it on asks to send notifications first. Only the trip's owner sees it.

## 6. The other states (frame 36)

- **A day the forecast doesn't reach yet:** "The forecast opens on Wed 25 Nov", "Forecasts reach about two weeks ahead.", and sunrise and sunset worked out from the date. Under it, "Nothing to know yet", because rain, storm and sea warnings come with the forecast (section 8).
- **A day that's over, on the trip or after it:** "DAY 1 · WED 18 NOV · AS IT WAS", its sky, the high, then "Low 24° · 13 mm of rain" (or "· no rain"), and "Recorded weather from Open-Meteo. Days that are over have no warnings." Nothing else is shown for that day. After the trip, every day is like this.
- **A day too old:** "The weather for this day isn't kept", and "Weather records go back about three months."
- **No connection:** the last copy stays on screen, with a card "Offline · Showing the forecast from 2 h ago" and "Try again". This shows when the phone can't reach Vromon, and when the weather service couldn't be asked.

## 7. The weather button and the day tabs (step 7's button)

- **A day to come:** its sky, its high, and "Low 24°", with a dot when the day has a warning. Unchanged, except the icon.
- **Today's tab (frame 31):** the weather now, "Now", and "Rain from 15:00" in the warning colour, or "Dry today" / "Rain now".
- **A day that's over (frame 33):** its sky, its high, and "As it was".
- **Too early:** a calendar and "Forecast from 25 Nov".
- **Older than the records:** "Not kept".
- **When the copy is old:** quieter, with its age, as before.
- **The day tabs:** their sky icons are the frames' icons now. A day that's over has none (section 9).
- **The day's chips on the plan** ("No warnings", sunset, sea) aren't shown for a day that's over.

## 8. Found and fixed on the way

- **"Move to …" could suggest a day that was already over** on a trip under way: the drier day was searched among all the trip's days. It's now only a day still to come.
- **"Offline" only showed when the server's own refresh failed.** With the phone unable to reach Vromon, the screen kept the last copy without saying so. That's the case frame 36 draws, and this step's own check of no connection. The card now shows for both.
- **"Nothing to worry about: no rain … expected" was shown for days the forecast doesn't reach.** For those it now says "Nothing to know yet", and that warnings about rain, storms and the sea come with the forecast.
- **At the largest text (Bangla, 1.6×), found on the phone:**
  - **The hero's words** were squeezed into five lines beside a 90 dp temperature. At 1.3× and above the words go under it, and the temperature stops growing at 1.2×.
  - **A stop's row** broke "১৮:৫৫" in two and cut the name. At 1.3× and above, the stop's weather goes under its name.
  - **The weather button's second line** cut "আজ শুকনো" (Dry today) to "আজ …". It may now take two lines.
- **The strip's marigold dot on a white card** was 1.8:1 against the card. It now has a darker marigold ring (3:1, in `contrast.test.ts`); on the blue card the ring is blue, as in the frame.
- **The updated line** named the trip ("Cox's Bazar Trip") where the frame names the place. It names the place now.
- **"Now" in the next hours** showed the hour's forecast (26°) under a hero card that said 27°. Both now show the same reading.
- **Tests could reach the real weather service:** in this step, a fake that didn't cover the new request let one test ask Open-Meteo. The backend tests now refuse the weather service unless a test supplies its own answer (`conftest.py`).

## 9. Where this differs from the prompt or the frames

- **The day tabs' sky for days that are over:** the prompt says to use the recorded weather. Frames 31 and 33 draw no sky on a finished day ("✓ Done", or the date alone). The mockup wins: there's no icon; the recorded weather is on the weather button and in Conditions.
- **The temperature line's colour:** it's the frame's `#E8703A`, which is also Budget's "stay" colour in light. The chart rules keep the five part colours for Budget only; frame 34 wins.
- **The lighter rain columns** (the frame's `#A9C0F0`) are under 3:1 against white. Their values are written, read hour by hour, and shown on a slide; the likely hours are in the strong blue.
- **The sea cell** shows only when the day has a beach or boat stop. Frame 34's Cox's Bazar day has one.
- **"Now"** comes from Open-Meteo's own reading (15-minute data, cached up to 30 minutes) while it's under 90 minutes old; otherwise it comes from this hour's forecast.
- **"For the rest of today"** keeps a warning for the stop you're at until it ends. The prompt says "stops still to come".
- **The line over "By the hour"** ("Slide a finger along the hours to read one", then the hour) and the dashed hour line aren't drawn in frame 34. They're the reading the prompt asks for.
- **The screen's title** is the app's own header. At 1.6× in Bangla it shortens to "আবহাওয়া…".

## 10. How it was checked

### On the phone (test account A, the dev build)

- **Trips used:**
  - the test account's own: Khulna (119, from tomorrow) and Cox's Bazar (134, from 10 Dec);
  - two made for this check through the API and deleted afterwards: Cox's Bazar 18–20 Nov (147, under way) and 15–17 Nov (148, over).
- **No test trip had a warning on a day to come?** Khulna does: two on its first day, one on its third.

| What | Result |
|---|---|
| Under way, today (dark) | "Wed 18 · done", "Today", "Fri 20". "NOW · 13:58", 27°, Cloudy, "High 27° · low 23°", "No rain expected for the rest of today", "Dry for: The rest of today", "Sunset 17:09". The next hours from now. "For the rest of today: Nothing to worry about at the stops still to come." Stop 4 (dinner, 18:55) still to come, and "Stops 1 and 2 are done. You're at stop 3 now." "Tomorrow · Fri 20: 30° / 23° · cloudy · no warnings". The reminder switch was looked at, not turned on: it would ask the owner's phone for notifications. |
| The day that's over | "DAY 1 · WED 18 NOV · AS IT WAS", the rain icon, 25°, Rain, "Low 24° · 13 mm of rain", the note; nothing else. |
| The day to come | "DAY 3 · FRI 20 NOV", 30°, Cloudy, "Low 23° · 26% chance at 17:00", sunrise and sunset; "Nothing to worry about"; By the hour (23° at 06, a high of 30°, 26° at 22; columns all under 60%, 26% written; stops 1–5); At your stops; Also checked. |
| Sliding along the figure | A sideways slide read "19:00: Cloudy, 27°, 23% chance of rain" with the dashed line at 19:00, and the page didn't move. |
| The weather button | Under way: "27° · Now · Dry today". Over: "30° · Cloudy · As it was". Khulna (from tomorrow): the rain icon with the warning dot, "24° · Rain · Low 22°". From 10 Dec: the calendar, "Forecast from 25 Nov". |
| A day with warnings (Khulna, 20 Nov) | "Rain on and off", "Low 22° · 96% chance at 06:00". "2 things to know": "Rain likely 19:00–22:00 (94%)", "Affects stop 5, Sundarbans South Wildlife Sanctuary, which is outdoors. Sunday is dry at that time.", "Move to Sunday", "Keep" (neither pressed), the source; then "After dark …". The strip marks 20 and 22 Nov. |
| Too early (Cox's Bazar from 10 Dec) | 30 cards marked "Later" with the calendar; "The forecast opens on Wed 25 Nov", "Forecasts reach about two weeks ahead.", "Sunrise 06:19 · Sunset 17:11 · From the date". This check found the "Nothing to worry about" problem (section 8). |
| Refresh | The icon: "updated just now". |
| No connection | The phone's port forward to the server dropped (`adb reverse --remove tcp:8001`), then Refresh. Result: the amber dot and "Offline · Showing the forecast from just now · Try again", with the forecast still there. Forward restored, then Try again: back to "updated 1 min ago". |
| Light | Khulna's day as in frame 34: the navy hero card on the grey ground, white cards, the blue chosen day with its marigold dot, the brown warning icons on their warm circles, the orange temperature line, the blue columns (all at 60% or more that day, 96% written). |
| Bangla at 1.6× | Found the three large-text problems in section 8. After the fixes: the hero card's words under the temperature, stops whole with their weather under them, the button "২৭° · এখন · আজ শুকনো", "পূর্বাভাস ২৫ নভেম্বর থেকে" over three lines, the figure's numbers and hours in Bangla digits. |
| Afterwards | Trips 147 and 148 deleted (404 after; test account A back to its 27 trips; the app's list refreshed, "12 trips · 35 days"). The phone back to English, "Same as the phone", text size 1.0 (as I found it). |

### Checks

| Check | Result |
|---|---|
| `npm run typecheck` | clean, also without the generated route types (as CI runs it) |
| `npx eslint . --max-warnings 0` | clean (the whole app) |
| `npx jest --ci` | 880 of 880 passed (78 files; 859 after step 16). One run had a time-out in `dragStrip.test.tsx` (step 8, not touched here). Alone it passed, and so did the full run after. |
| `venv/bin/python -m pytest -q` (backend) | 869 passed, 9 skipped (858 after step 16) |
| Maestro (dev build, `DEV_CLIENT=false`) | The flows over the changed screens pass: 09 (the journey: the weather button opens Conditions, `conditions-updated`), 06 (a trip before it starts) and 16 (a finished trip). See the note below this table. |

**Maestro, on the way:** 09 failed once, on day 2's line of numbers, with the plan sheet gone. I had formatted five of this step's files while it ran, and Metro sent them to the phone mid-flow, which rebuilt the trip screen. Doing the same steps by hand worked. Rerun with nothing edited, 09 passed (354 s). Test account A has its 27 trips again: the failed run's trip was deleted.

**New tests:**
- **Backend, `tests/test_conditions_spots_and_days.py` (11).** They use Open-Meteo's own answers, saved in `tests/fixtures/openmeteo/` (fetched 2026-11-19 at 13:15 for the town and Teknaf, with 7 days before today). They cover:
  - two spots with different rain;
  - both spots in one request, with past days and "now" asked for;
  - the day's summary from its first place;
  - at most 8 spots, the rest using the nearest;
  - a trip under way, with yesterday recorded (its rain in mm) and "now" today;
  - a trip that ended;
  - "now" only on a trip day;
  - a day beyond the forecast, with the date it opens;
  - a trip older than the records, which asks the service nothing;
  - the phone's date within a day, and not a week off;
  - a failed refresh keeping the last copy, stale both times;
  - a spot's copy serving the next request.
- **Backend, `tests/test_trip_planner_step6.py`:** its fake weather service answers the new request, with a spot that can have weather of its own. Its trips stay "to come".
- **App, `conditionsDays.test.tsx` (13):**
  - the rules (which day is which, a day's state and words, the highest chance, the next rain, "dry for", the next hours, the weather now);
  - on a trip day: the hero card, the strip and its labels, the next hours, the rest of today with "Move to tomorrow", the stops still to come and the "done" line, tomorrow, the reminder switch;
  - as it was; rain that fell; offline from the server; no connection on Refresh; too early; too old;
  - a finger reading one hour.
- **App, `tripConditions.test.tsx`:** the screen before the day (frame 34) and Refresh in the header.
- **App, `tripTopBar.test.tsx`:** each look of the weather button (forecast, now, as it was, too early, not kept, old).
- **App, `contrast.test.ts`:** the step 17 colour pairs in both appearances.
- **The test IDs** that flows and tests use are kept: `conditions-updated`, `conditions-refresh`, `cond-day-N`, `cond-summary`, `warning-<code>`, `warning-move`, `warning-keep`, `cond-hours`, `cond-chip-*`, `trip-weather`.

## 11. Left open

- **The planner's own weather** (keeping outdoor stops out of the rain while it plans) still uses one forecast at the destination's centre. The prompt asked for Conditions.
- **Today's "Now" card** (the Today screen) still shows this hour's forecast, not the service's own reading.
- **The Trips tab's next-trip card** still draws the weather with the icon font's glyphs.
- **A day that's over keeps only its summary,** not its hours, as frame 36 draws it.
- **"Showing the forecast from just now"** reads oddly when the last copy is under a minute old.
- **A vertical scroll that starts on the figure** reads the hour under the finger before the page scrolls (harmless).
- **The screen's title** shortens to "আবহাওয়া…" at 1.6× in Bangla.
- **The friends' APK** wasn't rebuilt. Until it is, it shows the old screen; the server still sends what that screen reads.
- **Still open from step 16:** SQLite reuses a deleted trip's number (trips 147 and 148 here had numbers used earlier today).

## Files

- **New:**
  - app: `src/features/trips/conditions/ConditionsHero.tsx`, `ConditionsParts.tsx`, `DayStrip.tsx`, `HourFigure.tsx`, `SkyIcon.tsx`, `dayView.ts`;
  - backend: `tests/test_conditions_spots_and_days.py`, `tests/fixtures/openmeteo/two_spots.json`, `one_spot.json`.
- **Changed (app):**
  - `app/trip/conditions/[id].tsx` (rebuilt), `app/trip/[id].tsx` (the button's clock, no chips on a day that's over);
  - `src/features/trips/plan/TripTopBar.tsx` (the button's states), `PlanTop.tsx` (the tabs' sky);
  - `src/services/api.ts` (`today`), `src/types/index.ts`, `src/ui/theme/tokens.ts` (`heroWarningTint`, `chartTemp`, `chartRainSoft`);
  - `src/i18n/en.json`, `bn.json`: new `conditions.*` and `plan.weatherA11yWas`, `plan.weatherA11yNow`; removed 17 Conditions strings nothing used any more.
- **Changed (backend):**
  - `app/services/conditions/openmeteo.py` (`forecast_spots`, `FORECAST_DAYS`, `PAST_DAYS_MAX`), `service.py` (spots, days, now, opens_on);
  - `app/api/v1/endpoints/trips.py` (`today`), `app/models/models.py` (the cache's description; no migration).
- **Tests:**
  - backend `tests/conftest.py` (no weather service in tests), `tests/test_trip_planner_step6.py`;
  - app `conditionsDays.test.tsx` (new), `tripConditions.test.tsx`, `tripTopBar.test.tsx`, `contrast.test.ts`.
- **Docs:** `docs/ui-refresh/prompts.md` (the Status table), this report.

## Git

Committed by the agent on `ui-refresh`, ending with `Co-authored-by: mdsulaimanshakil <mdsulaimanshakil@gmail.com>`, with no Claude co-author line. Not pushed. The owner pushes; since 2026-11-19 they also commit. When step 18 was asked for with this step still uncommitted, they chose to have it committed first, so the two steps stay separate commits.

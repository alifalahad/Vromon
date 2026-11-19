# Step 19 report: What you really spent

2026-11-19, on the `ui-refresh` branch, committed there at the owner's word ("go to the next step and commit"); not pushed. Step 18 was committed before this step began (c269865).

On the trip, two taps note a cost: "Add what you spent", one of today's plan, Save. Budget then shows what's spent, what's left and what's still to come by the plan. After the trip it shows what the trip cost against your budget and the plan. With nothing noted, it shows the plan's numbers and says they're the plan's: never "৳0 spent".

## 1. The numbers (backend)

- **A table for the notes, `trip_expenses`** (migration 0038, after backing up the database to `backend/vromon-backup-2026-11-19-before-expenses.db`):
  - the trip (deleted with it) and who noted it;
  - the day;
  - the amount for the whole group, more than 0, in the trip's currency;
  - the part: getting_there, stay, food, tickets, local, shopping or other;
  - a note of 80 characters at most (may be empty);
  - what it pays for, when it came from the plan: the stop (`item_id`), or a ride (`ride`: "to" that stop, "back" to where you sleep, "move" to the next stay that day).
- **A removed stop keeps its note:**
  - The link is emptied. PostgreSQL does it through the foreign key (`ON DELETE SET NULL`).
  - SQLite doesn't enforce that here, and a new stop could get the old id. So the ORM empties the link when a stop is deleted, and the bulk delete that clears a plan before it's made again does it first.
- **Endpoints under `/trips/{id}/expenses`, the owner's only.** A friend who can read the trip gets 404: spending is private.
  - `GET` lists the notes, the newest day first.
  - `POST` adds one; `PATCH /{expense_id}` changes one; `DELETE /{expense_id}` deletes one.
  - The day may be from the day before the trip to the day after it.
  - Changing a note's day lets go of the stop it paid for, unless a new one is given.
  - A trip that didn't happen takes no notes (409).
- **`GET /trips/{id}/expenses/suggestions?day=…`** gives the day's plan as things to pay for that have no note yet, in the day's order:
  - each meal (its price × the travellers);
  - each paid stop (its price × the travellers);
  - each ride: its fare × the vehicles needed, from the budget's own legs, so the sums agree;
  - the ride back to where you sleep, and the move with your bags to the next stay.

  Nothing whose price isn't known is offered: a meal priced at the default, a place without an entry price, a free stop, food where you stay.
- **`GET /trips/{id}/budget?today=…`** now also gives, for the owner (the services/expenses rules):
  - **`spent`:** total, by part, by day, today and count. By day leaves out getting there and the stay, which are the trip's costs and not a day's, so a day stands beside its plan (food, tickets and rides). Frames 38 and 40 add up that way.
  - **`to_come`:** for getting there and the stay, the plan minus what's noted for that part, never below 0. For food, tickets and rides, the plan for the days after today, plus today's plan minus today's notes for those parts, never below 0.
  - **`projected`:** spent plus `to_come`.

  All three are null with no notes, and for a friend. Frame 38's numbers come out exactly: ৳10,160 spent, ৳10,210 to come, near ৳20,370.
- **The data export** includes the notes (`trip_expenses`). **Deleting the account** deletes them.

## 2. The screens (app)

- **"What did you spend?" (`AddSpentSheet`, frame 39):**
  - **The amount** for the whole group, on the number keyboard. Bangla digits work, and the field shows the app's digits. Beside it: "for you", "for both of you", "for all N of you".
  - **"From today's plan":** the suggestions as chips ("CNG to Himchari National Park ≈ ৳1,620", "Lunch ≈ ৳900"). One tap fills the amount, what for and the note, and ticks the chip; all three can still be changed. On another day it says "From the plan for Fri 13 Nov".
  - **"What for":** the seven parts. **A note.** **The day:** "Today, Thu 19 Nov" with Change, which opens the trip's days from the day before to the day after.
  - **Save ("Save ৳1,620")** stays at the bottom of the sheet. With the keyboard up it sits just above it.
  - **Opening a note you made** shows the same sheet, titled "What you spent", with Delete. Delete has Undo in the snackbar.
- **Budget on the trip, with notes (frame 38):**
  - **The hero:** "SPENT SO FAR", the amount, "of your ৳… budget", the meter, "✓ ৳… left" (or "⚠ Over by ৳…"), and "By the plan, about ৳… is still to come. That would end near ৳…". When that end is over the budget, "⚠ That would be ৳… over your budget".
  - **"Today · Thu 19":** "৳1,500 of ≈ ৳4,820", a meter, today's notes (when, what, how much; each opens the sheet), and "Add what you spent". A note for getting there or the stay says "Stay · for the whole trip": it isn't in today's sum.
  - **"Spent of what's planned":** the five parts, each a bar in its colour on its lighter track, with "৳1,500 of ≈ ৳6,790". A part over its plan says "⚠ ৳2,000 over" in red. A part with nothing noted says "Nothing noted · plan ≈ ৳4,780"; one the plan couldn't price says "plan not known".
  - **"By day":** what was spent as a bar, the plan as a mark, the amounts at the end ("Not yet" for a day to come, "Nothing noted" for one gone by), and the key under it.
  - Then "Everything you noted" with the count, and the footnote "Spent is what you noted. Planned amounts with ≈ are estimates."
  - **Ways to save and the AI estimate** aren't shown once the trip has started.
- **Budget on the trip, nothing noted:** the plan as before the trip ("THE PLAN COSTS ABOUT ≈ ৳…", Change), with "Add what you spent" on the hero card. Then where it goes and by day.
- **Budget after the trip, with notes (frame 40):**
  - **The hero:** "THE TRIP COST", "✓ ৳… under your budget" (or over, or "Right on your budget"), "Each" and "Against the plan".
  - **"The plan and what you spent":** a table with a row for each part ("৳20 more", "As planned", "৳1,250 less", or "Nothing noted"), "Not in the plan" for shopping and other, and "All together".
  - Then "By day", "The biggest costs" (each opens the sheet), and "Everything you noted". Notes can still be added and changed.
- **Budget after the trip, nothing noted:** frame 40's last card ("BY THE PLAN, ABOUT ≈ ৳25,770", "You didn't note what you spent, so this is the plan's estimate.", "Add what you spent"), then where it goes and by day.
- **"Everything you noted"** (`app/trip/budget/noted/[id].tsx`, new; no frame): every note by day, the newest first, each day's total and each note's part. Each note opens the sheet; "Add what you spent" is at the end.
- **The same numbers elsewhere:**
  - **The plan's budget row (frames 31 and 33):** on a trip day "৳13,500 spent of ৳35,000 · ৳21,500 left"; after the trip "It cost ৳20,500 of ৳25,000" and "৳4,500 under your budget" in green (or over, in red). Without notes it keeps the plan's estimate. After the trip that reads "By the plan ≈ ৳… of ৳…", under or over in words (Jest).
  - **Today (frame 32):** "Spent today: ৳1,500", "The plan for today is ≈ ৳4,820" and "Add", or "Nothing noted today yet" without notes.
  - **A day that's over:** "4 places, 2 meals · ৳1,800 spent that day". With nothing noted that day, the plan's money stays.
- **A friend's trip** shows the plan only: nothing to add, no Change.
- **New colours** in `tokens.ts`:
  - each part's lighter track (the frames' values in light; in dark, each part's colour at 28% on the card);
  - the grey of "Not in the plan";
  - `accentTrack`, the frames' track behind a blue meter on a card. It's used by the plan's budget row too, which had the paler blue tint.
- **New line icons:** the frames' calendar and wallet. The plan's budget row now uses this wallet too.

## 3. Found and fixed on the way (on the phone)

- **The chosen part's bolder word** (frame 39's 500 weight) made its chip wider and pushed the parts onto a third line on the 360 dp phone. Save then sat half off the screen. The chosen part keeps the regular weight now, with only its inverted colours.
- **Save below the form:** at 360 dp the chips and the day pushed it out of view. It's in the sheet's footer now, always in view and above the keyboard while typing.
  - **The note field** was then hidden under Save while typing. It scrolls up into view when it's focused.
  - **The days Change opens** were also hidden under Save. They scroll into view.
  - **The sheet** raised over the keyboard reached under the status bar. It stops below it now.
- **Wording:**
  - "Nothing yet of ≈ ৳4,780" now reads "Nothing noted · plan ≈ ৳4,780".
  - "not in the plan" for tickets now reads "plan not known": the tickets are in the plan; their prices aren't known.
  - "≈" was left at the end of a line, away from its amount. It's joined to the amount now.
- **"Against the plan ৳20,970 less"** after noting one bus fare: it compared one note with the whole plan. Now it compares each part you noted against its plan, plus shopping and other. With every part noted, that's the totals' difference (frame 40: ৳670 less).
- **Today's card listed a ৳12,000 hotel** under "৳1,500 of ≈ ৳4,820". It now says "Stay · for the whole trip".
- **A note without words** in "The biggest costs" read "Getting there / Getting there · Fri 13 Nov". It now reads "Getting there / Fri 13 Nov".
- **After deleting the last note** (Maestro flow 17's first run), Budget switched back to the plan but kept its scroll position from before, so the plan's hero was above the screen. Budget now starts at the top when it switches between the plan, on the trip and after it.
- **At the largest text (Bangla, 1.6×):**
  - **A note's time** ("২৩:২৬") broke over two lines, and the note was cut short. At 1.3× and above the time leads the line under the note, and the note is whole.
  - **The table after the trip** broke "পরিকল্পনা" and "স্থানীয় যাতায়াত" mid-word and ran the numbers together. At 1.3× and above each row stacks, with "Plan … · Spent …" under its words.

## 4. Where this differs from the prompt or the frames

- **Suggestions are the budget's own legs, as the prompt says.** The budget counts rides to the stops, not to a meal, so frame 39's "CNG to lunch" doesn't appear. The ride back to where you sleep and the move to the next stay do.
- **Test account A's trips have no meal or ticket suggestions:** their restaurants' prices and entry prices aren't known, so only rides are offered (the prompt's "nothing whose price isn't known"). Meals and tickets were checked in the backend and Jest tests.
- **≈ on a suggestion:** on rides, and on meals at a restaurant (an average price). Tickets and your own food have none. Frame 39 shows ≈ on its two kinds, a meal and rides.
- **The chosen part's word isn't bolder** (section 3).
- **Save sits in a footer** (section 3). It looks the same as frame 39 when everything fits.
- **Today's sum leaves out getting there and the stay,** by the frames' own rule for "By day". Such a note in today's list says so.
- **"Against the plan"** compares the parts noted (section 3).
- **States the frames don't draw:**
  - a part over its plan after the trip: "⚠ ৳… more", in red;
  - a part with nothing noted: "Nothing noted" and "–";
  - a day gone by with nothing noted: "Nothing noted".
- **"The biggest costs" say the part and the day** ("Stay · Sat 14 Nov"). Frame 40's "2 nights" and "2 seats, both ways" aren't things a note knows.
- **"Everything you noted" is a new screen.** No frame draws it; it uses the same rows as Today's card.
- **Noting starts on the trip's first day:** frame 37 has no Add before the trip. A note can still be dated the day before, for a bus ticket bought then.
- **Amounts are whole taka** on the number keyboard; the server takes paisa too.
- **A trip that didn't happen** takes no notes. The server answers 409, and the app shows no Add.

## 5. How it was checked

### On the phone (test account A, the dev build, dark unless said)

Two test trips were made through the API as test account A: Cox's Bazar 147 (18–20 Nov, under way; its budget raised to ৳35,000) and 148 (14–16 Nov, finished). Both start from Dhaka by bus, so getting there is planned.

| What | Result |
|---|---|
| Nothing noted, on the trip | Budget: "Cox's Bazar · day 2 of 3 · 2 travellers", "THE PLAN COSTS ABOUT ≈ ৳26,970", "✓ ৳8,030 left", "Add what you spent" on the hero, no ways to save, no AI card. The plan's row: "≈ ৳26,970 of ৳35,000 · ৳8,030 left". |
| From a suggestion | The sheet: three rides from today's plan. "CNG to Himchari National Park ≈ ৳1,620", one tap: 1620, Local travel, the note filled, the chip ticked. Save: "Noted ৳1,620". "SPENT SO FAR ৳1,620", "৳33,380 left", "about ৳21,330 is still to come … near ৳22,950" (checked by hand against the plan). Today "৳1,620 of ≈ ৳4,820" with the note at 23:18. |
| Change it | The note opened from Today: "What you spent", Delete beside Save, the ride gone from the suggestions (already noted). Typed 1500, with Save above the keyboard: "Changed", ৳1,500, ৳33,500 left. |
| Typed, over its plan | 12000, Stay, "Hotel Beach Way": ৳13,500 spent; "Stay ৳12,000 ⚠ ৳2,000 over" with a full bar; nothing more to come for the stay (to come ৳11,450). |
| Delete and Undo | From "Everything you noted": Delete → "Deleted · Undo" → Undo → "Put back." |
| Today and the plan | Today: "Spent today: ৳1,500 · The plan for today is ≈ ৳4,820 · Add" (frame 32). The plan's row: "৳13,500 spent of ৳35,000 · ৳21,500 left". |
| After the trip, nothing noted | "Cox's Bazar · 14–16 Nov · 2 travellers", "BY THE PLAN, ABOUT ≈ ৳25,770", "You didn't note what you spent…", "Add what you spent". |
| After the trip, with notes | One note through the sheet: ৳4,800 for getting there on Fri 13 (the day before the trip, picked with Change; that day has no plan, so no suggestions). Five more through the API. "THE TRIP COST ৳20,500", "৳4,500 under your budget", "Each ৳10,250", "Against the plan ৳5,270 less" (checked by hand). The table: getting there "৳20 more", stay "As planned", food "৳1,250 less", tickets "Nothing noted", local "৳4,390 less", "Not in the plan · Shopping 350", "All together ≈ 25,770 · 20,500". By day with Sun 15 past its plan mark; the biggest costs; "Everything you noted 6". The plan: "It cost ৳20,500 of ৳25,000 · ৳4,500 under your budget", and day 1 "2 places, 3 meals · ৳1,800 spent that day". |
| Light | Frames 38, 39 and 40 rendered at the phone's width and put beside the phone's screens: the same layout, colours and words, apart from the differences in section 4 (and the meter track, fixed). |
| Bangla, and at 1.6× | Every screen in Bangla with Bangla digits; the sheet showed a typed amount as "২৫০". At 1.6×: the large-text fixes in section 3; then the hero, today, the parts, by day (stacked), the sheet (Save in view), and the table (stacked) whole. |
| Afterwards | The app back to English (its own setting, as it was), text size 1.0, dark mode (the owner's). Trips 147 and 148 are left on test account A for the owner's own check (section 6). |

### Checks

| Check | Result |
|---|---|
| `npx tsc --noEmit` | clean, with the generated route types and without them (as CI runs it) |
| `npx eslint . --max-warnings 0` | clean (the whole app) |
| `npx jest` | 914 of 914 passed (79 files; 890 after step 18) |
| `venv/bin/python -m pytest -q` (backend) | 884 passed, 9 skipped (875 after step 18; the 9 new ones pass) |
| The migration tests on PostgreSQL 16 (throwaway, as CI runs them) | 13 passed: 0038 up and down, and the schema matches the models. The new spending tests on PostgreSQL too, through `TEST_API_POSTGRES_URL`: 9 passed (PostgreSQL empties a removed stop's link itself). |
| Maestro (dev build, `DEV_CLIENT=false`) | New flow 17 passes (241 s): it notes ৳1,250 from Budget, sees "SPENT SO FAR ৳1,250", deletes the note, sees the plan again, and deletes its trip. Its first run stopped at that last check: back on Budget the plan's hero was above the screen (section 3); the trip it left was deleted through the API. Flow 06, which now accepts Budget's spent view, passes (132 s). |

**New tests:**
- **Backend, `tests/test_trip_expenses.py` (9):**
  - add, list newest first, change, delete, and a note of another trip not reachable;
  - the limits: the days allowed, more than 0, the seven parts, 80 characters, what a note may pay for, a new day letting go of its stop, a trip that didn't happen;
  - suggestions: prices × travellers, the budget's rides (fare × vehicles, their sum against the day's local travel), the day's order, noted ones gone, a hand-made note taking nothing away, nothing without a known price, none for a day off the plan;
  - no notes, no numbers;
  - the sums and what's to come on the trip (frame 38's rule), with a part noted beyond its plan;
  - before and after the trip;
  - a removed stop keeps its note, one by one and when the plan is made again;
  - a friend gets 404 and no numbers;
  - the export and the account deletion.
- **App, `tripSpent.test.tsx` (20):**
  - Budget on the trip: the hero, today, the parts, by day, no ways to save, the full list's link;
  - a part over its plan;
  - an end over the budget;
  - nothing noted;
  - a friend's trip;
  - after the trip: the table, by day, the biggest costs;
  - after the trip with nothing noted;
  - a trip that didn't happen;
  - the sheet: a suggestion, typed in Bangla digits on another day, changed, deleted;
  - the full list, also at 1.6×;
  - the plan's row in each state;
  - a finished day's line;
  - the rules in `spent.ts`.
- **App, `today.test.tsx` (+2):** "Spent today" with Add opening the sheet on today, and nothing noted.
- **App, `tripBudget.test.tsx`:** its trip is now a month ahead (Budget before the trip), with a router.
- **App, `contrast.test.ts`:** the tracks, the chosen part, the plan's mark, the grey, the blue meter's track.
- **Maestro, new `17-spent.yaml`** (with `scripts/spent-trip.js`): it makes its own Kuakata trip under way through the API, then notes ৳1,250 from Budget, sees "SPENT SO FAR ৳1,250", deletes the note from "Everything you noted", sees the plan again, and deletes the trip. Flow 06 now accepts Budget's spent view on a trip under way with notes.

## 6. Left open

- **Undo after deleting a note** puts it back as a new note, so its time is the time of the undo.
- **No meal or ticket suggestions** on the test trips (section 4): checked in tests only.
- **The plan's budget row on a 360 dp phone** puts "৳… left" on a line of its own when the amounts are long ("৳13,500 spent of ৳35,000").
- **Test trips 147 (under way until 20 Nov) and 148 (finished)** are on test account A, with notes, for the owner's own check ("You check" in the prompt). Delete them when done.
- **The friends' APK** wasn't rebuilt.

## Files

- **New:**
  - backend: `alembic/versions/20261119_0038_trip_expenses.py`, `app/services/expenses.py`, `tests/test_trip_expenses.py`;
  - app: `src/features/trips/budget/spent.ts`, `AddSpentSheet.tsx`, `SpentParts.tsx`, `app/trip/budget/noted/[id].tsx`, `src/__tests__/tripSpent.test.tsx`;
  - Maestro: `.maestro/17-spent.yaml`, `.maestro/scripts/spent-trip.js`.
- **Changed (backend):**
  - `app/models/models.py` (`TripExpense`, the trip's notes, a removed stop's link emptied) and `app/models/__init__.py`;
  - `app/api/v1/endpoints/trips.py` (the endpoints; spent on the budget; the plan's bulk delete lets go of notes first);
  - `app/api/v1/endpoints/me.py` (export, deletion);
  - `app/services/budget/service.py` (each leg says where it goes).
- **Changed (app):**
  - `app/trip/budget/[id].tsx` (the three phases);
  - `app/trip/today/[id].tsx` ("Spent today");
  - `app/trip/[id].tsx` (the row's phase, a day's spent);
  - `src/features/trips/plan/PlanTop.tsx` (the row on and after the trip, the day's line);
  - `src/features/trips/budget/BudgetParts.tsx` (the hero's Add);
  - `src/services/api.ts`, `src/types/index.ts`;
  - `src/ui/theme/tokens.ts`, `src/ui/LineIcon.tsx`;
  - `src/i18n/en.json`, `bn.json` (`spent.*`, two part names);
  - `jest.setup.js` (the sheet mock draws a footer);
  - tests: `tripBudget.test.tsx`, `today.test.tsx`, `contrast.test.ts`;
  - Maestro: `.maestro/06-trip-screen.yaml`.
- **Docs:** `docs/ui-refresh/prompts.md` (the Status table), this report.

## Git

Committed by the agent on `ui-refresh`, ending with `Co-authored-by: mdsulaimanshakil <mdsulaimanshakil@gmail.com>`, with no Claude co-author line. Not pushed.

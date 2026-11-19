# Step 18 report: Budget, redesigned

2026-11-19, on the `ui-refresh` branch. Committed there before step 19 began, at the owner's word (see Git); not pushed. Step 17 was committed before this step began (d48bad4).

The first thing Budget says now is what the plan costs and whether it fits, and a number that's a guess says so:
- **Food:** priced at the default for an unknown restaurant, it's an estimate with its guesses counted.
- **Tickets:** with no entry price known, they read "not known", not "৳0".
- **A cheaper hotel:** offered on its price, never on a default 3.5 rating.

## 1. The numbers (backend, `services/budget/service.py`)

- **Food is an estimate whenever a meal's price is the default.**
  - **Before:** a meal counted as a guess only when it had no restaurant at all. A meal at a restaurant whose prices aren't known got the same default ৳300, and food read as exact.
  - **Now:** one rule, `meal_is_guess`, decides it for the budget and for the itinerary's `cost_source`. Your own food and meals where you stay are never guesses.
  - **What changes:** the food part becomes an estimate with a range and says how many meals are guesses (`placeholder_meals`); the days with those meals are estimates too.
- **Tickets with no entry price known at all** (none paid, none free, some unknown) are `known: false`, with reason `no_price` and how many places. They add nothing. With some prices known, the rest are still counted as not known.
- **A cheaper stay is offered on its price.** The save carries both hotels' ratings (`ratings: { to, from }`) only when both are known. The current hotel's rating is no longer passed on when it isn't known, in the suggestion or in the stay part.
- **The other numbers still agree:** total, low, high, left, status, `estimated_total` and `remaining`. A test covers them, and the existing budget tests pass unchanged.
- **The notes the API gives** say the right thing: meals "have no known price (no restaurant, or its prices aren't known)"; tickets "are not included (entry prices aren't known for N places)".

What this shows on test account A's real trips: every Cox's Bazar trip's food became an estimate (8 of 8 meals guessed). Their tickets became "not known" (10 places).

## 2. The screen (`app/trip/budget/[id].tsx`, frame 37)

- **Under the title:** "Cox's Bazar · 2 travellers · 3 days · 2 nights".
- **The hero (`BudgetHero`):**
  - "THE PLAN COSTS ABOUT" ("THE PLAN COSTS" when nothing is a guess) and the amount, with ≈ when any part is a guess.
  - "of your ৳25,000 budget" with **Change**.
  - The meter, in the blue from "The look".
  - One status line with an icon and words, then the likely range:
    - "✓ ৳4,190 left · likely ৳18,650 to ৳24,050";
    - "⚠ Only ৳1,190 left";
    - "⚠ ৳3,190 left · could reach ৳24,050";
    - "⚠ Over by ৳810", in coral.
  - Then "Each" and "Of it, estimated".
- **Change (`ChangeBudgetSheet`):** a small sheet with New trip's own budget card: a typed amount in any currency, or Budget, Comfort and Luxury for these travellers and days. It's saved through the trip's PATCH; the numbers come again, and the snackbar says "Your budget is now ৳22,000".
- **"Where it goes" (`WhereItGoes`):**
  - **The bar:** one bar 28 dp tall in pieces (2 dp gaps, 4 dp corners). Each part's share is written inside when it fits, white or navy as "The look" says, and nothing when it doesn't.
  - **The key:** the five parts as rows that are also the bar's key: the colour, the name, where the number comes from, and the amount.
  - **A part that isn't known** has no colour and no piece, and says why: "Add where you start from to see this", "Hotel X · price not known", "Entry prices aren't known for 10 places".
  - **Several stays** keep their lines under Stay.
- **"By day":** a blue bar a day (square at the start, rounded at the end), the amount at its end, and the note that getting there and the stay are counted once above.
- **"Ways to save":** one kind of card for every way:
  - **The card:** what changes, what it costs in time or comfort, "Save ৳…" ("Save about" for a guess), and Apply, with Undo in the snackbar as before.
  - **Each way's wording:**
    - a cheaper stay: "Hotel Regal Palace instead of Hotel Beach Way · ৳2,250 a night · 10 min less on the road";
    - another town: "Sleep in Inani for nights 2–3";
    - skip a paid stop: "Skip …";
    - rickshaws: "Rickshaw instead of CNG for 4 short rides · About 35 min slower in all".
- **The AI estimate:** keeps every state it has (ask, reading, the answer with its range and "Use ৳… as my budget", failed, not set up). It's one quiet card under the ways to save: "Not sure what to set as your budget?" and "Estimate with AI".
- **A friend's trip:** no Change and no Apply.
- **The five part colours** are in `tokens.ts` (they were written into the screen before), with the words that go on them.
- **Test IDs kept:** `budget-total`, `budget-status`, `budget-part-<key>`, `budget-stay-<key>`, `budget-save-<key>`, `budget-apply-<key>`, `budget-snackbar`.
- **New test IDs:** `budget-change`, `budget-change-amount`, `budget-change-save`, `budget-bar`, `budget-piece-<key>`, `budget-day-<n>`.

## 3. Found and fixed on the way

- **At the largest text (Bangla, 1.6×), on the phone:**
  - **"By day":** the day's name broke mid-word ("বৃহ / স্পতি / ২৬") and the longest day's amount ran off the card. At 1.3× and above, each day's date and amount share a line with its bar under them. The date column also grows for Bangla's longer names at any size.
  - **New trip's budget card,** in the Change sheet: the amount ran past the field's left edge ("২৫,০০০" read "৫,০০০"), and "আরামদায়ক" (Comfort) broke mid-word. Both now stop growing at 1.3×, and a level's name stays on one line. New trip has the same card, so it's fixed there too.
  - **A way to save** puts Apply under its words at 1.3× and above.
- **The meal note** still says "placeholder", the API's own word (`placeholder_meals`), which an existing test reads.

## 4. Where this differs from the prompt or frame 37

- **A cheaper stay's card no longer has "Not now", "Don't suggest this" and "Why?" in Budget.** The prompt asks for one kind of card for every way. Those answers stay on the plan's stay card, where the suggestion is also shown.
- **"Save about ৳5,530" for a cheaper stay** (frame 37 says "Save ৳2,400"). The server marks a stay's saving as a guess because it includes the rides from the new hotel; the room price alone is exact.
- **A part with no colour** keeps an empty square outline where its colour would be, so the names stay lined up.
- **"Over by ৳…" is in coral on the hero card.** "The look" gives only green and amber for words on the hero card; "over" is the one serious state, and it has its icon and words too. The colour is in `contrast.test.ts` (8:1).
- **The AI card's text** keeps "today's market prices" (frame 37 says "market prices").

## 5. How it was checked

### On the phone (test account A, the dev build)

| What | Result |
|---|---|
| Under budget, dark (Cox's Bazar 146, ৳25,000) | "THE PLAN COSTS ABOUT ≈ ৳20,810", "of your ৳25,000 budget · Change", the blue meter, "✓ ৳4,190 left · likely ৳18,650 to ৳24,050", "Each ≈ ৳10,410", "Of it, estimated ≈ ৳10,810". The bar: stay 48%, food 23%, local 29%. Getting there and tickets without colour, saying why. Food "8 prices are guesses ≈ ৳4,800". Local "CNG, 12 rides". By day: three bars. One way to save. The AI card. The closing note. |
| Change | The sheet with New trip's card (৳ BDT 25,000, the three levels, "≈ ৳12,500 each"), Save off until the amount changes. Typed 22000, Done, Save: "⚠ Only ৳1,190 left" and "Your budget is now ৳22,000". Then 24000: "⚠ ৳3,190 left · could reach ৳24,050". Then 20000: "⚠ Over by ৳810", in coral, the meter full. Put back to ৳25,000 afterwards. |
| Apply and Undo, a cheaper stay (146) | "Hotel Regal Palace instead of Hotel Beach Way · ৳2,250 a night · 10 min less on the road · Save about ৳5,530". Apply: "Staying at Hotel Regal Palace · Undo", local travel ≈ ৳5,980, and nothing left to save on. Undo: "Changed back.", the numbers as before. |
| Apply and Undo, rickshaws (Khulna 120) | "Rickshaw instead of CNG for 4 short rides · About 35 min slower in all · Save about ৳100". Apply: "Rickshaws on the short rides · Undo", local "CNG and rickshaw, 13 rides ≈ ৳9,300", Fri 27 ≈ ৳1,160. Undo: "Changed back.", "CNG, 13 rides ≈ ৳9,400", ≈ ৳1,260, the card back. |
| Skipping a paid stop | No test trip offers it: none has a stop with a known paid entry. Shown in Jest only. |
| Light | Compared with frame 37: the navy hero card on the grey ground, the marigold heading, the blue meter, the green tick, the white cards with the orange, green and pink pieces, the empty squares for parts not known. |
| Bangla at 1.6× | Found the three large-text problems in section 3. After the fixes: the hero's amount on one line, "বদলান" under the budget, the status and cells wrapping whole, the bar's Bangla percentages, every part row, "By day" with the dates whole, the save card with "প্রয়োগ করুন" under it, the AI card, and the Change sheet with "২৫,০০০" whole and the three levels on one line each. |
| Afterwards | The phone back to English, "Same as the phone", text size 1.0. Trip 146's budget back to ৳25,000; its stays back as they were (Undo). |

### Checks

| Check | Result |
|---|---|
| `npm run typecheck` | clean, also without the generated route types (as CI runs it) |
| `npx eslint . --max-warnings 0` | clean (the whole app) |
| `npx jest --ci` | 890 of 890 passed (78 files; 880 after step 17). One run had a time-out in `today.test.tsx` (not touched here). Alone it passed, and so did the full run after. |
| `venv/bin/python -m pytest -q` (backend) | 875 passed, 9 skipped (869 after step 17). The first full run failed one existing test, which looks for "placeholder" in the meal note; the note keeps that word now (section 3). |
| Maestro (dev build, `DEV_CLIENT=false`) | Flow 06 (it opens Budget from the trip's ⋮ and checks `budget-total` and `budget-part-stay`) passes (139 s). Its first run stopped earlier, on the trip screen: the stop it tapped lay in the gesture bar at the screen's foot, and the screen dimmed with no sheet. By hand, a stop's sheet opened normally, and the next run passed. The trip screen isn't changed in this step. |

**New tests:**
- **Backend, `tests/test_budget_guesses.py` (6):**
  - a meal at a restaurant with unknown prices is a guess, with its count, its range, its days and the itinerary's `cost_source`;
  - your own food and meals where you stay are not;
  - no entry price known means tickets aren't known and add nothing;
  - some known: the rest are counted as not known;
  - ratings only when both are known;
  - the numbers agree (total, low, high, left, status, `estimated_total`, `remaining`).
- **App, `tripBudget.test.tsx`** (the screen's tests, rewritten): the hero, each status, nothing guessed, the bar's pieces and labels, an unknown part of each kind, tickets partly known, meals where you stay, by day, each way to save applied and undone, ratings only when both are known, another town, Change (typed and a level), a friend's view, Bangla. The AI estimate's tests are unchanged.
- **App, `contrast.test.ts`:** the step 18 pairs in both appearances.

## 6. Left open

- **Undo after applying a cheaper stay** puts the stays back, but the stay advisor then offers a different hotel. The one applied stays "accepted" (trip upgrades step 4). Seen on trip 146: after Undo, "Grand Beach Resort" was offered instead of Hotel Regal Palace.
- **The number keyboard covers Save in the Change sheet**, as in step 16's date sheet: Done first, then Save.
- **No test trip has a paid stop to skip** (no entry price is known in their places), so skipping was checked in Jest only.
- **Maestro flow 06 once tapped a stop at the screen's foot** (in the gesture bar), and the stop's sheet didn't come up; the run after passed. Worth watching: the flow scrolls only until the stop is "visible", which includes there.
- **The friends' APK** wasn't rebuilt.

## Files

- **New:**
  - app: `src/features/trips/budget/budgetView.ts`, `BudgetParts.tsx`, `ChangeBudgetSheet.tsx`;
  - backend: `tests/test_budget_guesses.py`.
- **Changed (app):**
  - `app/trip/budget/[id].tsx` (rebuilt);
  - `src/features/trips/budget/AIBudgetCard.tsx` (one quiet card);
  - `src/features/trips/new/BudgetCard.tsx` (its field's test ID; large text);
  - `src/types/index.ts`, `src/ui/theme/tokens.ts` (the five part colours and the words on them, the hero's meter, track, green and coral);
  - `src/i18n/en.json`, `bn.json`: new `budget.*`; four reworded as in frame 37; 12 removed that nothing used any more.
- **Changed (backend):** `app/services/budget/service.py`, `app/services/stay_advisor.py` (the current hotel's rating only when known), `app/api/v1/endpoints/trips.py` (one rule for a guessed meal; the notes).
- **Tests:** app `tripBudget.test.tsx`, `contrast.test.ts`.
- **Docs:** `docs/ui-refresh/prompts.md` (the Status table), this report.

## Git

Committed by the agent on `ui-refresh`, ending with `Co-authored-by: mdsulaimanshakil <mdsulaimanshakil@gmail.com>`, with no Claude co-author line. Not pushed. The owner asked for it with step 19 ("go to the next step and commit"), so the two steps stay separate commits.

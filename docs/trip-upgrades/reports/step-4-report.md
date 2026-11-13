# Step 4 report: the stay advisor, a better place to sleep for later nights

**Date:** 2026-11-12. **Status:** built and tested (pytest, jest, typecheck, lint, the API as test accounts A and B), and checked on the phone as test account A.

## What changed

| Where | Change |
|---|---|
| Data | Migration `0032_stay_suggestions`: one row per suggestion (trip, nights, hotel). It holds the numbers when last worked out, the plan's fingerprint then, and the traveller's answer (`open` / `accepted` / `not_now` / `dismissed`). It goes with the trip and the account. Backup first: `backend/vromon-backup-2026-11-12-before-stay-advice.db` (ignored by git). |
| Advisor | `app/services/stay_advisor.py`. **Looks at:** every run of nights now at one hotel that hasn't started. **Candidate hotels:** near those days' stops (3 km), or for a day out of town the 3 nearest hotels to its stops within 40 km (the "Mongla for the Sundarbans" rule). **Numbers:** money, road time and moves, as design.md §4 (see "Differences" for the rides). **Rule:** D4's thresholds, ৳5 a minute (D5), at most 2 suggestions, never two for the same night. A one-night stay between two moves is suggested only for 2 h a night or more. **Caching:** worked out again only when the plan's fingerprint changes. **Answers:** "Not now" quiets those nights until the plan changes. "Don't suggest this" hides that hotel for those nights until its saving grows by more than 25%. |
| API | `GET /trips/{id}/stay-suggestions`, and `POST …/{sid}/accept`, `…/not-now`, `…/dismiss`. Owner only, reads included (friends and room members 404). **Accept** splits the stays through the same code as `PUT /stays`: the days' legs, travel and meals where you stay follow, and stops keep their times. It returns `undo.stays` for Undo. |
| Budget | **Ways to save:** lists the open suggestions in place of the old "cheaper hotel" line (one source of truth). Applying one (`stay_advice`) is Switch, with Undo. **Local travel:** now counts the ride with your bags on a day you move between stays, so the budget after Switch matches the card. |
| Trip screen | **The card,** above the day it starts on: "Sleep at Hotel jalico for nights 1–3? Hotel jalico, ৳750 a night instead of ৳2,800. Saves ৳6,160 and 6 min on the road. No extra move: you'd stay there from the start." with **Why?**, **Switch**, **Not now** and **Don't suggest this**. **Switch:** snackbar "Staying at Hotel jalico" with Undo (`PUT /stays` with the old stays). **Refresh:** the card reloads after every edit. **Screen readers** get the card as one sentence. |
| Budget screen | The same card in Ways to save, with the same three buttons. Switch goes through the budget's apply-and-undo. |
| Strings | `stayAdvice.*` in English and Bangla. The "Why?" link uses the colour for text on the soft accent: plain link blue was 3.9:1 there, now checked in `contrast.test.ts`. |

**Files:**
- Backend:
  - New: `alembic/versions/20261112_0032_stay_suggestions.py`, `app/services/stay_advisor.py`, `tests/test_stay_advisor.py` (14 tests).
  - Changed: `app/models/{models,__init__}.py`, `app/api/v1/endpoints/trips.py`, `app/services/budget/service.py`, `tests/test_trip_planner_step7.py` (the two "cheaper hotel" tests now use the advisor, on a trip in the future).
- App:
  - New: `src/features/trips/stays/{advice.ts,StayAdviceCard.tsx}`, `src/__tests__/stayAdvice.test.tsx`.
  - Changed: `app/trip/[id].tsx`, `app/trip/budget/[id].tsx`, `src/services/api.ts`, `src/types/index.ts`, `src/i18n/{en,bn}.json`. Tests: `tripPlan`, `tripBudget`, `contrast`.
- Docs: `docs/architecture.md` ("The stay advisor").

## How it was checked

**Tests:**
- Backend `pytest -q`: **792 passed, 9 skipped** (778 before; 14 new). `test_stay_advisor.py` uses a made-up Khulna (the town, Karamjal and Mongla about 38 km south) and covers:
  - the Mongla case, with the numbers;
  - a hand calculation;
  - a cheaper hotel next door;
  - a tiny saving (not suggested);
  - a known bad rating (never);
  - no hopping every night;
  - nights already started;
  - "Don't suggest this" until +25%;
  - "Not now" until a change, and that it quiets those nights for any hotel;
  - Switch keeping every stop's time (a pinned one too), with Undo;
  - dinner where you stay following the new stay;
  - the budget's ways to save;
  - the owner-only matrix (friend, room member and stranger 404).
- App `jest`: **62 suites, 623 tests pass** (8 new: the card's words, "Why?", one sentence, the trip screen, the budget screen, contrast). `tsc` and `eslint app src` are clean.

### Worked example 1: a night in Mongla (made-up world, from `test_the_numbers_match_a_hand_calculation`)
4 days, 2 travellers (1 room). Days 1–2 are in town, day 3 is the Sundarbans gate and Mongla port, day 4 is Mongla ghat. All nights are at Hotel City Inn (৳2,500). The candidate is Hotel Pashur in Mongla (৳2,800, rating not known). Road times are the planner's estimate (straight line at 30 km/h).
- **Road time:** sleeping in Mongla for night 3 touches day 3's end and day 4's start and end. That's 236 min of rides to and from the stay now, against 11 from Mongla.
- **Moving:** one move. The bag ride from town to Mongla takes 76 min (38 km, CNG ৳1,430); packing and checking out and in counts 45 min.
- **Minutes saved** = 236 − 11 − 76 − 45 = **104 min**.
- **Money saved** = (2,500 − 2,800) × 1 night × 1 room − ৳1,430 bag ride + (৳4,410 − ৳280) in daily rides = **৳2,400**.
- **Shown:** "Sleep in Bagerhat for night 3? Hotel Pashur, ৳2,800 a night instead of ৳2,500. Saves ৳2,400 and 1 h 44 min on the road. One extra check-out and check-in."

### Worked example 2: a cheaper hotel in town (real data, trip 121 on test account A)
Khulna, 4–7 Dec, 2 travellers, all nights at Hotel Royal International Ltd. (৳2,800). The Sundarbans South Wildlife Sanctuary is a day-3 must-see; day 1 is Pankhali and Dhangmari.
- **Room:** ৳2,800 × 3 nights × 1 room = ৳8,400 now, against Hotel jalico (300 m away, ৳750, rating not known) at ৳750 × 3 × 1 = ৳2,250.
- **Rides:** road time to and from the stay on days 1–4 is 46 min now and 40 min from jalico. All the rides those days cost ৳9,820 now and ৳9,810 from there.
- **No move:** it's every night from the first.
- **Money saved** = 8,400 − 2,250 + (9,820 − 9,810) = **৳6,160**, and **6 min**.
- **The budget agrees:** the total went from ৳25,420 to ৳19,260 after Switch, exactly ৳6,160.
- **Nothing else qualifies:** no priced hotel is within 40 km of the Sundarbans sanctuary, so nothing is suggested for that day.

**Over the API (trip 121):**
- A gets one suggestion, Hotel jalico for nights 1–3, which is also first in the budget's ways to save.
- **B (a friend):** `GET /stay-suggestions` → 404, and B's budget has no `stay` entry.

**On the phone** (dev app, test account A, trip 121):
- **The card:** above day 1, with the text in worked example 2 and Why? / Switch / Not now / Don't suggest this.
- **Why?** opens a sheet that adds it up in plain words: "Now: ৳2,800 a night × 3 nights × 1 room = ৳8,400." / "Hotel jalico: ৳750 … = ৳2,250." / the road and the rides / "All together: Saves ৳6,160 and 6 min on the road." / the rule and ৳5 a minute.
- **Switch:** "Tonight: Hotel jalico", "From Hotel jalico · 9 min", the budget at ৳19,260, and "Staying at Hotel jalico · Undo". **Undo** put Royal International back (৳25,420), and the card came back.
- **Not now** on jalico at first brought up the next hotel (Ambassador) straight away. That felt like nagging, so "Not now" now quiets those nights for any hotel until the plan changes (and a test checks it). After that: "Hidden until your plan changes", and no card.
- **After a plan change** (day 1's lunch packed), the jalico card came back.
- **Don't suggest this** on jalico: it went, and Ambassador ("saves ৳4,200 and 8 min") was offered, as designed (that answer is about one hotel).
- **Budget screen, Ways to save:** the same Ambassador card with the same buttons, above "Rickshaw instead of CNG".

## Differences from the prompt, and why
- **Unrated hotels are allowed** (a known rating under 3.5 isn't). No hotel in the data has both a price and a known rating, so "rating ≥ 3.5" alone would never suggest anything. The card says "rating not known".
- **The rides from the stay count in the money too** (as the old cheaper-hotel line did). Without them, Switch would change the budget by a different amount than the card says.
- **The budget counts the bag ride on a moving day.** The card charges it, so the budget does too; trips that already moved between stays (steps 1–2) see that ride in local travel now.
- **"Must-see town" is the nearest hotels to a far day's stops** (up to 3 within 40 km). The data has no list of gateway towns.
- **Switch keeps the stops' times**, as `PUT /stays` does (step 1's decision). The legs, travel and meals where you stay follow. A day that now gets back late shows `BACK_LATE` with "Re-plan this day".
- **No release-build check:** nothing changed on the map; the card and sheet are the same components as before.

## Left open
- **No Mongla suggestion on real data:** there's no hotel in or near Mongla with a price. The owner's data follow-up from D11 (more room rates) applies here too.
- **The app caches a trip for 5 minutes,** so a change made elsewhere (another phone, the API) shows later. Every change made in the app refreshes at once.
- **Long trips** look at runs within the first 14 nights.
- **The phone's dev app is still signed in as test account A** (trip 121 has the Ambassador card open, jalico dismissed, day 1's lunch packed). Sign in with your own account when you're done.

## Git commands for the owner
```bash
cd ~/Codes/Vromon
git add -A
git commit -m "Trip upgrades step 4: the stay advisor, a better place to sleep for later nights"
git push origin main
```
Steps 1–3 aren't committed yet either; they share files with this step, so this one commit holds steps 1–4.

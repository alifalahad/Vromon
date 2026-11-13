# Step 7 report: rate your trip

**Date:** 2026-11-13. **Status:** built and tested (pytest, jest, typecheck, lint, the API as test accounts A and B), checked on the phone as test account A, and run the way GitHub CI runs it, PostgreSQL migration tests included. Two bugs found on the phone are fixed (below).

## What changed

| Where | Change |
|---|---|
| Data | Migration `0035_trip_reviews`. **`trip_reviews`:** one per trip and traveller; rating 1–5, or null while only things one by one are rated; a comment of up to 280 characters. **`review_items`:** a place, a meal at a restaurant, a hotel, a stay with family or friends, or getting there, marked `good` or `bad`, with an optional comment (280). The old `feedback` table stays as "Rate this plan". Backup first: `backend/vromon-backup-2026-11-13-before-trip-reviews.db` (ignored by git). |
| Rules | `app/services/reviews.py`. **When:** from the trip's first day (D7); before it, 409 ("You can rate this trip from its first day, 4 Dec."). The phone's date counts when it's within a day of the server's. **Who:** the owner and each joined trip-room member, each with their own review (D8). Anyone else gets 404, including a friend who can read the trip. Nobody ever gets someone else's review (D9). **The things to rate**, from the plan: getting there (the route's first city to the destination, by its mode), each day's places and meals at a restaurant (not your own food or meals where you stay), the hotels (with their nights) and stays with family or friends. A home is named only for the owner (D2). |
| API | `GET /trips/{id}/review` gives your review, or null, and the things to rate with your verdicts. `PUT /trips/{id}/review` saves only what's sent: the stars and comment change only when sent (null clears them), each thing sent is set or cleared (verdict null), and the rest is left alone. Something that isn't part of the trip is refused. A verdict follows its place or restaurant when the day is re-planned. `/me/export` lists your reviews (`trip_reviews`). Deleting the account deletes them, a member's reviews in friends' trip rooms included; deleting the trip deletes its reviews. |
| Trip screen | **"How was your trip?"** sits below "Rate this plan", from the trip's first day, for the owner and room members. **One tap on a star saves.** Then a summary with Edit (the stars and an optional comment) and **"Rate things one by one · 19 rated"**. "Only you see your rating." **For screen readers** the stars are one adjustable control (swipe up or down). |
| Rating screen | `app/trip/review/[id].tsx`. **Layout:** the trip's stars and comment, then getting there, each day ("Day 1 · Fri 13"), and where you stayed. **Each row:** Good 👍 / Bad 👎, a labelled radio pair; tap the chosen one again to clear it. "Add a comment" opens a field (280). **"Mark all good" / "Mark all bad"** set every thing not rated yet. **Save** sends only what changed; the screen then stays and shows "Saved. Only you see it." **Leaving** with unsaved changes asks once. |
| Trips tab | A one-time **"Rate your trip to Khulna?"** card, from the day after a trip ends, for two weeks, with **Rate** and **Not now**. "Not now" is for good, kept on the phone per trip (`rateReminderDismissed` in the preferences store). A trip already rated isn't asked about. Never a push. It covers your trips and friends' trips you joined. |
| Strings | `review.*` in English and Bangla. New Good/Bad colours are checked in `contrast.test.ts`. |

**Files:**
- Backend:
  - New: `alembic/versions/20261113_0035_trip_reviews.py`, `app/services/reviews.py`, `tests/test_trip_reviews.py` (9 tests).
  - Changed: `app/models/{models,__init__}.py`, `app/api/v1/endpoints/{trips,me}.py`.
- App:
  - New: `src/features/trips/review/{review.ts,Stars.tsx,TripReviewCard.tsx,RateTripReminder.tsx,colors.ts}`, `app/trip/review/[id].tsx`, `src/__tests__/tripReview.test.tsx` (15 tests).
  - Changed: `src/features/trips/plan/TripDetails.tsx`, `app/trip/[id].tsx`, `app/(tabs)/trips.tsx`, `app/_layout.tsx`, `src/features/preferences/store.ts`, `src/services/api.ts`, `src/types/index.ts`, `src/i18n/{en,bn}.json`, `src/__tests__/contrast.test.ts`.
- Docs: `docs/architecture.md` ("Rate your trip").

## How it was checked

**As GitHub CI runs it** (`.github/workflows/ci.yml`):
- **Backend** `python -m pytest -q` with `TEST_POSTGRES_URL` on a temporary PostgreSQL 16: **825 passed, 3 skipped**. The 13 migration tests ran on PostgreSQL; on SQLite alone six are skipped. They cover migrations 0030–0035: the schema they build matches the models exactly, down to nothing and back, and running them twice changes nothing.
- **App:**
  - `npm run typecheck`: clean, run without the git-ignored route types, as in CI.
  - `npx eslint . --max-warnings 0`: clean. Running it the CI way caught an unused variable in a new test that would have failed CI.
  - `npm test -- --ci`: **64 suites, 655 tests pass**.
- **Data platform** `pytest`: 62 passed (not in CI).

**Backend tests** (`tests/test_trip_reviews.py`):
- the things to rate come from the plan (the packed lunch isn't one);
- one tap, then changing the stars, then clearing the comment;
- "Mark all good", then two bad with comments;
- partial updates leave untouched things alone, and clearing removes the verdict and its comment;
- a verdict follows its place when the day is re-planned;
- the first-day rule (with the phone's date);
- validation: stars 0 and 6, comments of 281 characters, "great" as a verdict, an unknown kind, something not in the trip;
- the privacy matrix (owner ✓; a joined member ✓, with their own review, never the owner's; an invited friend who hasn't joined, a friend who can read the trip and a stranger: 404 for reading and saving);
- the export, deleting with the account, and deleting with the trip.

**App tests** (`tripReview.test.tsx`):
- the card shows from the first day only, and not to a friend reading the trip;
- one tap saves; Edit adds a comment;
- the adjustable stars for screen readers;
- the list by day with labelled Good/Bad;
- "Mark all good", then two bad with a comment: only those changes are sent, then "Saved";
- leaving with changes asks once;
- before the first day, it says when rating opens;
- the Trips card: from the day after the end, not on the last day, not after two weeks, not for a rated trip; "Not now" for good, and checked again the next day.

**API:** test account B, a friend who can read A's trip, gets **404** for A's review, reading and saving.

**On the phone** (dev app, test account A). The new trip **122, Khulna, 13–15 Nov**, was made for this, since rating opens on the first day and A's other trips start later.
- **One tap** on the 4th star of "How was your trip?": "Only you see your rating", ★★★★ "Very good".
- **"Rate things one by one":** getting there "Dhaka → Khulna · Bus", "Day 1 · Fri 13" with KFC, Pankhali Dolphin Sanctuary, … and where you stayed. 19 things.
- **"Mark all good"**, then the bus **Bad, "The bus was late"** and KFC **Bad, "Cold food"**. Saved: 4 stars, 17 good, 2 bad with their comments (checked over the API).
- **Reopened:** "19 rated", and the two comments were there.
- **Changed the stars to 5:** "Saved. Only you see it."
- **Changed one thing and pressed back:** "Leave without saving?" once; Leave dropped the change.
- **Edit on the card:** added "Lovely trip". The card shows ★★★★★ "Excellent", "Lovely trip", 19 rated.

## Bugs found while testing (fixed)

1. **The app crashed after Save** on the rating screen. In the same moment, the "unsaved changes" guard switched off (which updates the screen's header) and the screen went back. react-native-screens then threw "ScreenStackFragment added into a non-stack container" and the process died. The rating had been saved. Now the screen stays after Save and says "Saved"; the back arrow returns as usual. Saving and leaving afterwards no longer crash.
2. **Deleting a trip left rows behind.** The step-4 stay suggestions and (before the fix) the review items relied on the database's `ON DELETE CASCADE`, which SQLite here doesn't enforce. The ORM now deletes them. A test checks that deleting a trip leaves no reviews, review items or stay suggestions.

## Differences from the prompt, and why

- **The trip's comment is limited to 280 characters, like each thing's.** The prompt gives 280 for comments; I used it for both.
- **"Getting there"** is the route's arrival stop, by its mode ("Dhaka → Khulna · Bus"). The journey itself isn't stored; the route is.
- **Getting there is named by the trip's destination** ("Cox's Bazar", not the place database's "Cox’s Bāzār").
- **The rating screen also has the trip's stars and comment at the top,** so the Trips tab's "Rate" opens one place for everything.
- **The Trips card asks for two weeks after the trip ends,** then stops. The prompt says "the day after it ends"; an old trip shouldn't suddenly ask.
- **After Save the rating screen stays and shows "Saved"** instead of going back (bug 1).

## Left open

- **Test account A now has trip 122** (Khulna, 13–15 Nov, rated 5 stars, with "Lovely trip" and 19 things rated). Delete it after step 8 if you like.
- **The phone's dev app is still signed in as test account A.** Sign in with your own account when you're done.
- Ratings aren't used for anyone's recommendations (D9: a later decision).

## Git commands for the owner

Nothing from steps 1–7 is committed yet, so this one commit holds them all. GitHub CI runs on the push to `main`:

```bash
cd ~/Codes/Vromon
git status                      # the changes; the database and its backups are ignored
git add -A
git commit -m "Trip upgrades steps 1-7: stays, meals, stay advisor, places index, search anything, rate your trip"
git push origin main
```

To see CI: GitHub → the repository → **Actions** → the "CI" run for this commit. It has two jobs, `backend` (pytest, with PostgreSQL for the migrations) and `mobile` (`npm ci`, typecheck, eslint with no warnings, jest). With the GitHub CLI: `gh run watch` or `gh run list --limit 3`.

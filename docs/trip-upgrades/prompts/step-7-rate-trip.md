# Step 7: Rate your trip

**Goal:** from the trip's first day, one tap (five stars) rates the whole trip. Optionally, the traveller marks things one by one as good or bad, or marks all at once and changes a few, each with an optional comment. Nothing is required, and ratings stay private.
**Depends on:** step 0 (D7–D9 as decided). Independent of steps 1–6; meals and stays from steps 1–3 appear in the list if they exist.

## Prompt

```
Follow docs/trip-upgrades: features.md F4, design.md §2 (0035), §3 (review row), §5 (step 7 row), decisions D7–D9
(as answered in decisions.md: any time during the trip; everyone who went; good/bad with an optional comment,
no sharing), rules.md.

Backend:
1. Migration 0035_trip_reviews (trip_reviews with rating + comment; review_items with verdict good/bad + comment).
   The old feedback table stays as "Rate this plan". Migration test.
2. API:
   - GET /trips/{id}/review returns your review (or null) plus the rateable things built from the plan: places, meals
     at restaurants, stays at hotels, a family/friend stay, the journey from "Getting there". Each has its target and
     itinerary item id, and your verdict and comment if any.
   - PUT /trips/{id}/review creates or updates: rating 1–5 and comment for the trip, and a partial list of item
     verdicts (good / bad / null to clear) with comments. Only what the traveller touched is sent.
   - Open from the trip's first day (D7); before it, 409 with a clear message.
   - The owner and the trip room's members each have their own review (D8); others 404. Reviews are private: no
     endpoint returns someone else's review (D9).
   - Include reviews in /me/export; delete them with the account.
   - Tests: privacy (owner, member, friend 404, stranger 404); validation (rating range, comment ≤ 280, verdict values,
     the first-day rule); a member's review separate from the owner's; partial updates keep untouched items;
     clearing a verdict.

App:
3. Trip screen, bottom of the plan sheet, from the trip's first day: a "How was your trip?" card (five stars, an
   optional comment, Save) below "Rate this plan" (which stays as it is). Once saved: a short summary with Edit and
   "Rate things one by one".
4. app/trip/review/[id].tsx: the items by day (places, meals, stays, getting there). Each row has Good 👍 / Bad 👎
   (a two-option toggle that can be cleared) and an optional comment field that opens on tap. "Mark all good" /
   "Mark all bad" set every unrated item; the traveller then changes the few that differ. Save sends only what changed.
   Leaving with unsaved changes asks once.
5. The Trips tab: a one-time card the day after a trip ends, "Rate your trip to <destination>?", with Rate and Not now
   (dismissed for good; stored per trip in the preferences store). Skip it if the trip is already rated.
6. i18n en/bn, accessibility (the toggles are labelled radio pairs; the card's stars are adjustable), jest tests (the
   card shows from the first day, "Mark all", only changed items sent, the one-time Trips card); typecheck, lint, jest.

Phone, as test account A, on a trip whose first day is today or earlier: rate it in one tap; open "Rate things one by
one"; mark all good, then change two to bad with comments; save, reopen, check it's all there; change the stars. The
Trips-tab reminder's timing is checked in a jest test (change the stored date), not on the phone.

Write reports/step-7-report.md, update the Status table, give the git commands, stop.
```

## Done when
- One tap rates a trip from its first day. Everything else is optional and quick.
- Item verdicts and comments save and reload, and nobody but the author can read them.

## The owner checks
- During a trip, rating it takes one tap.
- "Mark all good", then changing a couple to bad with a comment, feels quick.

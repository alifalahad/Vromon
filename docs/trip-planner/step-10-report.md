# Trip Planner Step 10 Report: More Destinations

**Date:** 2026-10-19 · **Status:** built; checked on the phone; waiting for your approval
**Plan:** `docs/trip-planner-plan.md`, step 10 · **Data report:** `docs/trip-planner/data-quality.md` · **Screenshots:** `docs/trip-planner/step-10/`

**Decision taken (decision 6, first destinations):** your four, Dhaka, Khulna (with Bagerhat's mosques), Tangail and Sylhet, plus six of mine for variety across the country:

- Chattogram (the port city and its beaches);
- Bandarban and Rangamati (the hill tracts);
- Sreemangal (tea gardens and Lawachara);
- Kuakata (the southern beach);
- Rajshahi (with Puthia's temples).

**Still open: who checks prices and opening hours.** You didn't say, so nothing imported has been checked by a person. The app says so: "Not checked yet", "Price unknown", "Hours not checked".

## 1. What changed

### The data, and where it comes from

- **The plan said OpenStreetMap.** All the public OpenStreetMap query servers (Overpass) were down or refusing requests from here today, so I used two other open sources:
  - **Wikivoyage** (CC BY-SA 4.0): each town's description, and the listings on its page (See, Do, Buy, Eat, Drink, Sleep) with coordinates, opening hours and prices where they're given;
  - **Wikidata** (CC0): notable sights around the town (museums, mosques, temples, forts, palaces, zamindar houses, parks, national parks, lakes, waterfalls, beaches…), only those in Bangladesh.
  - OpenStreetMap can be added to the same importer later.
- **The importer** (`backend/scripts/import_destinations.py`) writes one reviewable file per destination (`data/destinations/<name>.json`) and the data report:
  - **Unknown stays unknown:** an opening time or a price is filled in only when the source states it in a form it can read ("9AM–5PM", "Tk 20", "Free"); otherwise it stays empty, never guessed. Prices in other currencies are left unknown, never converted by guess.
  - **Merged duplicates:** the same sight from both sources ("Mazar Khan Jahan Ali" / "Mausoleum of Khan Jahan Ali") becomes one place.
  - **Inside Bangladesh and near the town:** Wikidata searches a smaller area than the town's own Wikivoyage listings, so Bandarban doesn't take Chattogram's sights and Sylhet doesn't take Meghalaya's waterfalls.
  - **Variety:** no one kind of place fills more than 40% from Wikidata (Dhaka was nearly all mosques before this).
  - **Polite to the sources:** a named user agent, one request at a time, waiting when told to, and a week's cache outside the repo.
- **What came in:**

  | Destination | Places | Restaurants | Hotels |
  |---|---|---|---|
  | Dhaka | 40 | 0 | 0 |
  | Chattogram | 40 | 20 | 10 |
  | Rajshahi | 33 | 1 | 9 |
  | Khulna | 17 | 0 | 1 |
  | Sylhet | 15 | 0 | 5 |
  | Sreemangal | 14 | 0 | 2 |
  | Rangamati | 8 | 0 | 0 |
  | Tangail | 7 | 0 | 0 |
  | Bandarban | 7 | 0 | 0 |
  | Kuakata | 7 | 0 | 0 |

  - **Gaps:** few places have hours or prices (see the data report). Where there are no restaurants, meals use the planner's existing "price unknown" placeholder.
  - **Thin data:** Tangail, Bandarban, Kuakata and Rangamati are thin. Their Wikivoyage pages list few places with coordinates, and Bandarban's best-known sights (Nilgiri, Boga Lake) aren't on its page with coordinates.

### In the database

- **Migration 0012** adds:
  - to destinations: where the data comes from (credit, sources) and whether a person has checked it;
  - to places, restaurants and hotels: whether the price, the hours and the rating are known, where each came from, and whether it's been checked.
- **Loading:** `app/db/destinations.py` loads the files at startup (and with `python -m app.db.destinations`):
  - a file that hasn't changed is skipped;
  - a place that disappears from a file is hidden, never deleted (trips may point to it);
  - unknown values get a planning default and are marked unknown: opening hours 09:00–17:00 for planning, entry price ৳0 not counted, a neutral rating that's never shown.

### In the planner and the app

- **Honest ranking:** an unknown rating counts as neutral and is never given as a reason ("Excellent rating" only for real ratings); the same for an unknown price ("Fits your budget" only for real prices).
- **Honest labels:**
  - **Price:** "Price unknown" on stop cards, in stop details and in "Add a stop", never "Free".
  - **Hours:** "Hours not checked" in stop details and the must-see picker.
  - **Rating:** not shown when unknown.
  - **Source:** stop details say "From Wikivoyage · not checked yet".
- **Budget:**
  - the stay says "Hotel Golden City · price not known" and isn't counted;
  - tickets say "· 3 prices unknown";
  - the cheaper-hotel saving only compares hotels with known prices;
  - the planner prefers a hotel whose price is known.
- **New trip:**
  - the destinations are a row of cards you scroll sideways (11 now), each imported one marked "Not checked yet";
  - a line under the row says the newer destinations come from Wikivoyage and Wikidata and that many prices and hours are unknown.
- **Unchanged and working:** getting there, the weather, the roads, Today mode and the budget all work for the new destinations, because they're keyed by the destination's coordinates and nearest city.

## 2. Checked on the phone (the test account)

- **01, the destination row:** "Sylhet · 15 places · Not checked yet", chosen and scrolled into view, with the note about the sources and "When" right below.
  - This uses the same link as "Plan a trip here" on a destination's page; a chosen destination far along the row now scrolls into view, which it didn't at first.
- **02, the Sylhet plan:**
  - "Culture morning, culture afternoon", the weather (32° / 21°, sunset 17:16) and real road legs ("CNG · about 7 min · 3.3 km · ≈ ৳130");
  - "Price unknown" on the stops and on breakfast (there are no Sylhet restaurants in the data);
  - the budget meter at ৳8,890 of ৳25,000 (without the stay: the hotels' prices are unknown).
- **03, a stop's details:** "Shah Jalal Dargah · Culture", "Hours not checked", "Price unknown", no rating, the Wikivoyage description, and "From Wikivoyage · not checked yet". The reasons don't mention a rating or the budget.
- **Interests and distance:** with Nature picked, day 1 was still mostly culture. Sylhet's nature sights (Ratargul, Bichanakandi, Madhabkunda) are 30–60 km out, and the planner keeps a day's travel short. The data allows it; better day trips belong in a later step.
- **The first layout (a grid of 11 big cards)** pushed "When" off the screen: changed to the sideways row.
- **Maestro:** the full suite 00–99 passed in one run (10 of 10 flows), with the new destination row.

## 3. Commands run

- **Backend:** `pytest` gives **549 passed**, 8 skipped. The new `tests/test_trip_planner_step10.py` has 26 tests:
  - hours and prices read only when plainly stated (taka only);
  - listings by section (bus companies in "Get in" left out);
  - categories (the name first);
  - the same sight from two sources;
  - loading: unknowns marked, an unchanged file skipped, a removed place hidden;
  - all 10 shipped files load;
  - the new destinations listed as not checked, with credit;
  - both planners plan Sylhet;
  - no made-up ratings or price reasons;
  - the budget saying what it doesn't know.
  - The full suite also ran with a guard that fails on any network call: no calls.
  - One older test had to change: it excluded every place in the database, which is now more than one destination's.
- **Migration 0012:** upgrade, downgrade and upgrade on a copy of the dev database; `alembic check` is clean. The dev database is upgraded and loaded.
- **App:** `jest` gives **317 passed**; `tsc` and `eslint` are clean. New tests: imported destinations marked "Not checked yet" with the note; the budget's "price not known" and "prices unknown".

## 4. Files

- **New:**
  - **Data:** `data/destinations/sources.json` (the list and the areas) and 10 destination files.
  - **Backend:** `backend/scripts/import_destinations.py`, `app/services/destinations/importer.py`, `app/db/destinations.py`, `alembic/versions/20261020_0012_imported_destinations.py`, `tests/test_trip_planner_step10.py`.
  - **Docs:** `docs/trip-planner/data-quality.md`.
- **Changed:**
  - **Backend:** `models.py`, `schemas.py`, `main.py` and `seeder.py` (loading), `endpoints/trips.py` and `endpoints/destinations.py` (the new fields; an unknown price counts as a placeholder), `recommendation_service.py`, `itinerary_service.py` (the hotel), `budget/service.py`, one older test.
  - **App:** `app/trip/new.tsx` (the destination row, the chosen one scrolled into view), `StopSheet.tsx`, `AddStopSheet.tsx`, `PlacePickerSheet.tsx`, `app/destination/[id].tsx`, `places.ts`, `app/trip/budget/[id].tsx`, types, en/bn strings, two test files.

## 5. Known issues and limits

- **Nothing imported has been checked by a person.** Opening hours, entry fees, and whether a place is still open all need checking; the data report lists what to check first.
- **Ratings are unknown for every imported place,** and neither source has them. The ranking falls back on your interests, the pace and the travel time.
- **Several destinations are thin** (Tangail, Bandarban, Kuakata, Rangamati: 7–8 places), and most have no restaurants or hotels yet.
- **OpenStreetMap isn't used yet,** because its query servers were down. It would add many restaurants and hotels (without prices).
- **Unknown opening hours are planned as 09:00–17:00:** a place open later, or closed one day a week, isn't known.
- **The pictures on the destination cards** are the same drawing for every town.
- **Wikivoyage text** may only be reused with credit (CC BY-SA). The credit is stored with each destination and shown as "From Wikivoyage"; a fuller credits page belongs in step 11.

## 6. What I need from you

1. **Who checks prices and opening hours** (decision 6, second half)? Someone who knows these towns, or an agreed source per town. Until then the app labels them as not checked.
2. **Any destinations to swap** for others?
3. **Sign in again on your phone:** the test signed your account out.
4. **Approve step 10**, or tell me what to change. Step 11 (hardening) is the last step and needs no decision.

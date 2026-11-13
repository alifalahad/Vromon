# Step 6 report: search anything in free time

**Date:** 2026-11-13. **Status:** built and tested (pytest, jest, typecheck, lint, the API as test account A), timed on a copy of the real database, and checked on the phone as test account A. While testing on the phone I found 9 bugs and fixed them; they're listed below.

## What changed

| Where | Change |
|---|---|
| Names | The name fold (`match_key`, `name_similarity`, `bn_to_latin`, `clean`) moved from the data platform into the backend, `app/core/names.py`. The data platform re-exports it, so both fold names with the same code (`vromon_data/text.py`). New for search: `search_text` (as typed: lower case, Bangla digits, "B.L." = "BL") and `search_key` (folded, but vowels kept apart: Bogura isn't Bagerhat). `rapidfuzz` added to the backend (`pyproject.toml`, `requirements.lock`). |
| Kinds | `poi-kinds.yaml` moved from `data-platform/source-registry/` to `backend/app/core/`, with its reader `app/core/poi_kinds.py`. The backend's Docker image doesn't include the data platform, and search reads the kind words at run time. The places index connector reads the same file. |
| Data | Migration `0034_private_places`: `places.owner_user_id` (deleted with the account) and `places.listed` (every existing place: listed). It also adds a `(lat, lon)` index on `poi_index` and a `geocode_cache` table (query, rounded area, results, when; no user id). Backup first: `backend/vromon-backup-2026-11-13-before-private-places.db` (ignored by git). |
| Search | `app/services/place_search.py`. **Reading the query:** the last kind word is the kind ("Khulna Medical College" → college); kind words alone ask for the nearest of that kind; a misspelt kind ("colege") is guessed for "Colleges near you". **Where:** distances are from the stop before the free time, else the day's centre. **Sources:** Vromon's places, then other places Vromon knows within 25 km (sights of the next destination, restaurants, hotels), then the places index (step 5), then ORS addresses. **When it widens:** with fewer than 5 good results, the rest of the district, then exact names within a day's reach. **Score:** name × 0.7 + nearness × 0.3, +10 for the kind asked. **Names match word by word:** every word typed must match a word of the name. **Never empty:** "Did you mean", the kind near you, and always a pin. **Duplicates:** the same name within 150 m is kept once. |
| Geocoder | ORS geocoding at `ors_geocode_url` (`https://api.openrouteservice.org/geocode/search`, the existing key). **When:** only when the places found fewer than 5 good results, only for 3+ letters, and not for a kind. **Limits:** kept 7 days in `geocode_cache`; 1 call per person per 2 s; a daily cap of 800 (free quota 1,000), counted from the cache so both backends share it. **What leaves the server:** only the text and the area's centre. |
| API | `GET /trips/{id}/days/{day_id}/search?q=&near_item_id=&limit=&part=` (owner only). `part=places` is fast and says whether addresses are worth asking for; `part=addresses` asks ORS. **`POST …/items`** also takes `poi_id`, `geocode` (a result's token), `restaurant_id`, `hotel_id` or `pin {lat, lon, name}`. It makes the traveller's own place (listed = false, a 60-minute visit, cost and hours unknown) and adds it like any stop, within 80 km of the day. **`POST /places/{id}/suggest`** puts the owner's stop in the data platform's review queue (`new_entity`, `app_place`; its name, place, kind and source, no user id). **`GET /places/{id}`** of a private place: owner and trip-room members only. `/me/export` lists `private_places`; deleting the account deletes them. |
| Never offered | `listed = true` added to: the planner's candidates and the day's suggestions, destination places and counts, `/places` and recommendations, must-see checks, road preparation, chat place cards and room suggestions. The data platform's publish (demo hiding) and tidy, and the app's destination file sync, leave private places alone. The AI budget and "More about this place" never send a private stop's name to the language model. |
| App: the sheet | `AddStopSheet`. **Box empty:** the suggestions, as before. **Typing:** results under headings (Vromon's places / More nearby / Other places (not checked) / Addresses). Each row has a kind icon, "2.4 km from Rupsha Bridge" and a "Not checked" badge when it isn't Vromon's checked data. **Addresses** are asked only after a short pause, with a spinner for that part. **"Did you mean"** names (tap to search) and **"Colleges near you"** show only when nothing was found. **"Put a pin on the map"** is always at the end: the step-2 map picker (search an area or move the map), then a name. "Adding …" shows while a new stop's roads are fetched. |
| App: elsewhere | **"Not checked" badge** on stop cards, Today mode and the stop sheet. **Map pins:** those stops are hollow (a blue ring, a blue number). **Stop sheet:** shows the kind ("College", "Your pin"), "Your own stop … Only you and your trip room see it" and **"Suggest this place to Vromon"**. Strings in English and Bangla, including every kind (one and many). A new colour pair for the badge is checked in `contrast.test.ts`. |

**Files:**
- Backend:
  - New: `app/core/{names.py,poi_kinds.py,poi-kinds.yaml}`, `app/services/place_search.py`, `alembic/versions/20261113_0034_private_places.py`, `tests/test_place_search.py` (18 tests).
  - Changed: `app/api/v1/endpoints/{trips,places,destinations,rooms,me,rag}.py`, `app/core/config.py`, `app/db/destinations.py`, `app/models/{models,catalog,__init__}.py`, `app/schemas/schemas.py`, `app/services/{cards.py,budget/ai.py,itinerary/editing_service.py,recommendation/recommendation_service.py,routing/__init__.py}`, `pyproject.toml`, `requirements.lock`.
- Data platform: `vromon_data/{text.py,publish.py,connectors/overture_pois.py}`, `source-registry/sources.yaml`, `README.md`, `tests/{test_text,test_publish}.py`.
- App:
  - New: `src/features/places/{kinds.ts,NotCheckedBadge.tsx}`, `src/__tests__/searchAnything.test.tsx` (12 tests).
  - Changed: `src/features/trips/plan/{AddStopSheet,PlanRows,StopSheet,DayMap}.tsx`, `colors.ts`, `app/trip/[id].tsx`, `app/trip/today/[id].tsx`, `src/services/api.ts`, `src/types/index.ts`, `src/i18n/{en,bn}.json`.
  - Tests: `contrast`, `tripPlan`, `tripLegs`, `tripPlanEdit`, `tripConditions`.
- Docs: `docs/architecture.md` ("Search anything and private stops"), `docs/trip-upgrades/design.md` (the kinds file's place).

## How it was checked

**Tests:**
- Backend `pytest -q`: **810 passed, 9 skipped** (792 before; 18 new). They use made-up towns in empty corners of the map, a fake geocoder and no network, and cover:
  - "BL College" first, and not "BSL … College" nearer;
  - "college" / "colleges" / "কলেজ" giving the nearest colleges;
  - a typo, still typing, Bangla, "hospitel";
  - the four groups, and places already in the trip not offered;
  - nonsense never empty;
  - the geocoder only when needed, its cache, the 2-second limit, the daily cap, no key;
  - adding each kind of result (index, address, pin, restaurant, the next destination's sight): times, rides, the route, reuse, once per trip;
  - what can't be added;
  - the privacy matrix (the owner; a room member sees the stop; a friend and a stranger get 404 and are never offered it in destination places, `/places`, suggestions, recommendations or search; nobody can add it by id);
  - "Suggest to Vromon";
  - the export;
  - the destination file sync leaving it alone;
  - roads asked for before anything is written;
  - the language model never getting a private stop.
- Data platform `pytest`: **62 passed**. New: both sides fold 24 Bangladeshi names the same way, Bogura/Bagerhat included. The publish test now also checks that demo hiding and tidying leave a traveller's places alone.
- App `jest`: **63 suites, 638 tests pass** (623 before). `tsc` and `eslint` are clean.

**Speed** (45 searches each, three rounds of 15 queries, on a migrated copy of the real database):

| Where | p50 | p95 | Slowest |
|---|---|---|---|
| Khulna (trip 121) | 34 ms | **61 ms** | 69 ms |
| Dhaka (about 81,000 places within 25 km, the densest area) | 286 ms | **387 ms** | 495 ms |
| With the geocoder (3 real ORS calls; 2 other queries didn't need it) | 1.24 s | 1.53 s (the slowest of 3) | 1.53 s |

The first Dhaka run was 685 ms p95; reading only 4 columns in the first pass brought it to 387 ms. The geocoder's time is ORS's own response. The app shows the places first and waits only for the address part.

**Adding a stop from outside the list** takes about 3 s the first time: ORS works out the roads between it and the day's stops. The same place again takes about 20 ms.

**Before and after** (the step-0 baseline: trip 117, day 1, near its first stop, Boro Bazar):

| Search | Before (step 0) | After |
|---|---|---|
| college | 0 results | 8: Khulna Art Academy 0.6 km, Cadets Of City College 0.7 km, … |
| BL College | 0 | 7: **Govt. B.L College, Khulna 1.7 km** first |
| Sonadanga | 0 | 8: Shonadanga 1.3 km, Sonadanga Eidgah 1.7 km, Sonadanga Lake 1.9 km, … |
| hospital | 0 | 8: Mohammadnagar Hospital 0.2 km, Khulna General Hospital 0.5 km, … |

**On the phone** (dev app, test account A, Khulna trip 121, day 4, free time after Shahid Hadis Park at 15:34):
- **Searches:**
  - "BL College": Govt. B.L College, Khulna · College · 1.9 km from Shahid Hadis Park · Not checked.
  - "college": the nearest colleges, 0.0–0.2 km from the stop before.
  - "Sonadanga": the lake, Eidgah, Thana and R/A, 0.3–0.5 km.
  - "hospital": Manipal AFC Hospital, Sami Hospital, Gazi Medical College Hospital, ….
  - **Bangla**, typed through the phone's Ridmik keyboard: "ব্রজলাল কলেজ" found Govt. Brajalal College (4.6 km) and the Bangla listings. Even the keyboard's misspelt "সনাদাংা" found Sonadanga.
  - **Typo** "Brojolal Colege": Govt. Brajalal College first.
  - "KDA Avenue": an Addresses group (street, 0.9 km).
  - "Boyra Bazar": the market, then three streets under Addresses.
- **Added, one of each kind:**
  - From the places index: Govt. B.L College, 15:39.
  - An address: KDA Avenue, 16:43.
  - A pin: put on the map and named "Nanu bari", 17:50, shown as "Your pin".
  - A restaurant from "More nearby": New Azmiri Kacchi Kitchen, trip 120 day 1, 15:14, with no badge (it's Vromon's).
  - **What each got:** a ride from the stop before, the budget's rides (৳24,820 → ৳25,170 = ৳130 + ৳110 + ৳110), "Added … · Undo", and the free time after it shortened.
- **Map:** the three new stops are hollow pins, the others solid.
- **Today mode** (7 Dec at 16:00, the dev clock): "Now: Govt. B.L College, Khulna · Not checked", "Leave by 16:35 · CNG 4 min · 2.5 km", "for KDA Avenue at 16:43 · Not checked", and the badge in the rest of the day.
- **Stop sheet of the pin:** "Your pin", the badge, "Your own stop … Only you and your trip room see it", "Hours not checked", "Price unknown", "From your pin · not checked yet". **"Suggest this place to Vromon"** showed "Sent to Vromon's team. Thank you!". The review queue has the task: `new_entity / app_place / open`, name "Nanu bari", its place, kind pin, no user id.

## Bugs found while testing on the phone (all fixed)

1. **Roads for a new stop were never saved.** The request had already written the new place, so SQLite kept the road cache (a separate connection) waiting 5 s, and then it gave up. The add took 6 s and the stop's legs stayed straight-line guesses. Now the roads are asked for before anything is written: the leg is a real road and the add takes about 3 s. A test checks the order.
2. **The plan sheet sometimes never appeared** when a trip opened on top of another trip (a link, or Today's "Full plan"). The screen showed only the map; tapping a day did nothing. The sheet thought it was open (its position was right), but its opening animation had run while the screen was being swapped in and was never drawn. Now the sheet slides in once the screen has finished opening, with a 0.7 s fallback. **Before:** the failing sequence failed 3 times out of 3. **After:** 6 out of 6 were fine. A jest test covers it. This bug was older than this step.
3. **A Vromon restaurant added from search said "Not checked"** on its card. Now the badge is only for data Vromon hasn't checked; such a restaurant is your own stop but checked, with no "Suggest" button.
4. **"Did you mean" stayed under a found address.** It now shows only while nothing was found.
5. **Typing slowly asked ORS for every partial word.** Addresses are now asked for only after a pause, never for 1–2 letters, and stale lookups are cancelled. "Boyra Bazar" reached ORS only as the whole name.
6. **An address 47 km away** ("Azmiri, Dhaka division") was offered from Khulna. The limit is now 30 km. A geocoder "venue" showed the sightseeing icon; it now shows a plain place icon.
7. **"More about this place" would send a pin's name ("Nanu bari") to the AI.** It's hidden for your own stops, and the server refuses (422).
8. **"hospital" matched "Hotel The Capital" in Dhaka:** folded, "hospital" looks like "capital". A word must now start with the same letter.
9. **Dhaka search was 685 ms at p95.** Reading fewer columns in the first pass brought it to 387 ms.

## Differences from the prompt, and why

- **Moved, not copied:** the name fold and the kinds file now live in the backend, and the data platform imports them (the data platform already imports the backend).
- **Migration 0034 does a little more:** the address cache table (shared by both backends, for the daily cap) and a location index on `poi_index` (for the 25 km area).
- **Name score:** rapidfuzz's WRatio let "Chalna College-University" beat "Govt. B.L College" for "BL College", because partial matching rewards the shared word "college". Names are now matched word by word (rapidfuzz `ratio` per word), on the name as typed and folded.
- **"The whole country for exact names" became "within a day's reach (80 km)":** a stop must be one the day can get to. The add endpoint enforces the same 80 km.
- **Restaurants and hotels found by search** become the traveller's own place (source `restaurant` / `hotel`, checked, keeping a restaurant's known hours). A stop must be a `places` row, and a visit isn't a meal.
- **A Vromon place from the "Vromon's places" group** wasn't added on the phone. Every unused Khulna sight on trip 121 is in the Sundarbans, 100+ km away. That path is the same as before, and the tests cover it (the next destination's sight was added in a test).
- **Bangla on the phone** was typed through the phone's Bangla keyboard (adb can't type Bangla). I switched it back to English afterwards.

## Left open (for the owner)

- **Friends who can read a trip see its private stops** like any stop (name and pin). A pin can be personal ("Nanu bari"), but it isn't hidden from them the way a home stay is (D2). Room members are meant to see it. **Your call:** hide private stops from friends who aren't in the room?
- **Open map data quality:**
  - Some listings sit away from the real place. "Govt. B.L College, Khulna" is about 5 km from the campus at Daulatpur; "Govt BL College, Doulatpur" is on it.
  - Some kinds are Overture's, not common sense ("Sonadanga Eidgah" is filed as a church).
  - Short forms ("BUET") match only when a listing uses them.
- **Speed:** a stop from outside the list takes about 3 s the first time (ORS road data). Addresses take about 1.2–1.5 s (ORS).
- **Two pins at the same spot** draw their numbers over each other (on day 4, "Nanu bari" sits on breakfast's pin). This was already so before.
- **The test account's trips now have the added stops:**
  - Trip 121, day 4: Govt. B.L College, KDA Avenue, the "Nanu bari" pin. The day is over its pace (7 sights; max 4), which it says.
  - Trip 120, day 1: New Azmiri Kacchi Kitchen.
  - **The review queue has the "Nanu bari" suggestion:** reject it in review, it's a test.
- **The phone's dev app is still signed in as test account A.** Sign in with your own account when you're done.

## Git commands for the owner
```bash
cd ~/Codes/Vromon
git add -A
git commit -m "Trip upgrades step 6: search anything in free time (places index, addresses, pins), private stops, and the plan sheet that sometimes didn't show"
git push origin main
```
Steps 1–5 aren't committed yet either, so this one commit holds steps 1–6. The database and its backups aren't in git. The new migration runs when the backend starts, or with `vromon_data db migrate`.

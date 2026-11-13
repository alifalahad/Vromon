# Design: how things work today, and how they will work

Line numbers are as of 2026-11-12 and will drift; search for the names.

## 1. Today (audited 2026-11-12)

### Stay
- **One hotel per trip.** `trip_preferences.hotel_id` if the traveller chose one, else `ItineraryService._pick_hotel()` (`backend/app/services/itinerary/itinerary_service.py`, about line 477) takes the best-known hotel at the accommodation level, price known first.
- **The planner** uses that hotel as the start of each day. In the quick planner, `last_point = hotel` and the first leg's travel time comes from it (about lines 351 and 414–423). In the CP-SAT planner (`cpsat_scheduler.py`) it is node 0 of each day's circuit, but its docstring says *"return to the hotel is not counted"*. So "finish by" ignores the way back.
- **The budget** (`backend/app/services/budget/service.py`): stay = hotel price × nights × rooms (2 travellers a room). Local travel = every leg of every day, including the hotel to the first stop and the last stop back to the hotel (`day_legs`, about line 75). "Ways to save" (`ways_to_save`, about line 196) can suggest **one cheaper hotel for the whole trip**, applied through `POST /trips/{id}/budget/save`.
- **The AI budget** (`budget/ai.py`) is given the accommodation level and published room rates.
- **The app:** the trip screen and its day map (`mobile/src/features/trips/plan/DayMap.tsx`) never show the hotel, and the plan list has no "back to the hotel" row. Today mode uses `itinerary.hotel` (lat/lon) for "leave by" (`src/features/trips/today/today.ts`, `src/features/map/useTripToday.ts`). The budget screen (`app/trip/budget/[id].tsx`) shows the stay line and the cheaper-hotel saving.
- `GET /trips/{id}/itinerary` returns `hotel` (endpoints/trips.py, about line 458). `GET /trips/{id}/days/{day_id}/route` (about line 755) returns the legs between stops only.

### Meals
- Three meals a day from `MEAL_SLOTS` (Breakfast 08:00, Lunch 12:30 and movable, Dinner 19:00; 60 min each), each at a restaurant picked by `_pick_meal` / `_meal_item_at` (`itinerary_service.py`, about lines 56 and 533). The budget's food part = meal cost × travellers. There's no way to opt out of a restaurant.

### Rating
- **"Rate this plan"** (`mobile/src/components/FeedbackForm.tsx`): five stars, 8 fixed tags, an optional note. One per trip, shown in `TripDetails.tsx` to the owner whenever the trip has a plan. Stored in the `feedback` table (`trip_id, rating, tags_json, comment`), via `POST/GET /trips/{id}/feedback`.
- Nothing rates single places, meals or stays. Nothing happens after the trip ends (`tripPhase()` in `src/features/trips/dates.ts` knows it's `past`).

### Search in free time
- `AddStopSheet.tsx` → `GET /trips/{id}/days/{day_id}/suggestions?q=` → `suggestions_for_day()` (`backend/app/services/itinerary/editing_service.py`): a **substring match on the place name**, only among this destination's ranked places. It returns an empty list when nothing matches.
- A stop must be a `places` row: `itinerary_items` has `place_id` / `restaurant_id` but no coordinates of its own.
- **Data that exists:** the catalog (`attractions`, `service_places` = hotels and restaurants from Overture's lodging and food categories only, `connectors/service_places.py` about line 98), published into `places`, `hotels` and `restaurants`. The OpenStreetMap snapshots in `data-platform/raw/osm_overpass` are only rivers and transport hubs. No general places (colleges, offices…) and **no geocoder** anywhere. The backend has the ORS key (`ORS_API_KEY`) for routing only. `rapidfuzz` is in the data platform but not the backend. The data platform's Overture download imports `duckdb`, which `data-platform/pyproject.toml` doesn't list.

---

### Audit findings (step 0, 2026-11-12; details in reports/step-0-report.md)
- **All hotel call sites** go through `trips.py` `_hotel(db, trip)` (line 1434: 22 callers) and `_get_hotel_info` (1678), plus `itinerary_service.py` (173, 351, 414–423), `cpsat_scheduler.py` (107, 301, 588, 614), `trip_rules.py` (218–232 `start_range`, 356–448 `unplaced`/`_why`), `editing_service.py` (`recompute_day` 69 and 7 callers), `late_service.py` (122, 161), `adaptation_service.py` (65), `rooms.py` (278), `budget/service.py` (75, 161, 205–225, 286–297, 352), `budget/ai.py` (accommodation level and rates). In the app: `useTripToday.ts:44`, `app/trip/today/[id].tsx:88`, the budget screen, and `src/types/index.ts` (445, 633, 661, 670).
- **Who reads a trip besides its owner** (`rooms.can_read_trip`): trip-room members and friends (when the owner shares trips, or sent this one). They can call 8 endpoints: `GET /trips/{id}`, `POST /trips/{id}/copy`, `GET …/itinerary` (returns `hotel` with coordinates), `…/conditions`, `…/days/{day}/route`, `…/budget` (names the hotel), `POST …/budget/ai`, `GET …/journey`. A copy doesn't take the hotel or the start point. **A family/friend home must be redacted in all of them (D2).**
- **Hotel prices:** only 82 of 937 active hotels have a known price. At the Standard level, 57 destinations have hotels but only 15 have any priced one (Khulna: 24 Standard, 0 priced). `_pick_hotel` takes the first by id when none is priced, which in Khulna is "বয়রা,খুলনা", an area name. So stays are often unpriced, and the stay advisor can only compare priced hotels (D11).
- **Baseline trip** (test account A, trip 117, Khulna, 3–5 Dec, 2 travellers, Comfort): each day ends with dinner in the city at 19:00–20:00, then 4–9 min back to the hotel (back at 20:04–20:09). The long trip back comes earlier, from far sights (Dhangmari Wildlife Sanctuary 45 km / 90 min, Mosjidkur Mosque 46 km / 93 min) to town, absorbed by the gap before dinner but never counted.
- **Free-time search:** "college", "BL College", "Sonadanga", "hospital" all return 0 results.
- **The budget treats a meal without a restaurant as a placeholder estimate** (`budget/service.py` 146–151). Step 3's "own" and "stay" meals need `meal_source` so they aren't counted as guesses.
- **Geocoding:** ORS geocoding works with the existing key at `https://api.openrouteservice.org/geocode/search` (not under `api.heigit.org/openrouteservice`, which returns 404). Near Khulna it finds venues ("Mohashin College", "Shishu Hospital") and areas ("Sonadanga"), but "BL College" gives places around the college (its pond, its Shaheed Minar), so the places index is still needed.
- **Libraries:** `rapidfuzz` is in `data-platform/.venv` only; `duckdb` and `pyarrow` are in neither venv.

## 2. Data (Alembic migrations from `0030`)

Use the next free numbers in this order; the names are suggestions.

| Migration | Tables / columns | Step |
|---|---|---|
| `0030_trip_stays` | **`trip_stays`**: `id, trip_id → trips (cascade), first_night int, last_night int` (1-based nights, inclusive), `kind` (`hotel` / `home` / `none` / `undecided`), `hotel_id → hotels (SET NULL)`, `label` (≤ 80, for `home`), `lat`, `lon` (for `home`), `created_at, updated_at`. Constraint: a trip's nights are covered once, with no gaps or overlaps (checked in the service; tested). **Backfill:** every trip with a plan gets one `hotel` stay covering all its nights, with `hotel_id` = `trip_preferences.hotel_id`, or the hotel `_pick_hotel` would choose. `trip_preferences.hotel_id` stays for now (read by old app versions in the friends' APK) and is kept equal to night 1's hotel. | 1 |
| `0031_meal_plan` | `trip_preferences.meals_json`: `{"Breakfast": "restaurant"|"own"|"stay", "Lunch": …, "Dinner": …, "own_cost_per_person": number|null}`; `itineraries.meals_json` (nullable): the same shape, a per-day override. `itinerary_items`: new `meal_source` (`restaurant` / `own` / `stay`, null for non-meals). | 3 |
| `0032_stay_suggestions` | **`stay_suggestions`**: `id, trip_id, first_night, last_night, hotel_id, money_saved, minutes_saved, extra_moves, status` (`open` / `accepted` / `not_now` / `dismissed`), `fingerprint` (the plan state it was computed for), `shown_numbers_json, created_at, updated_at`. Unique `(trip_id, first_night, last_night, hotel_id)`. | 4 |
| `0033_poi_index` | **`poi_index`**: `id` (source id), `source` (`overture`), `name`, `name_bn`, `category` (Overture's), `kind` (Vromon's friendly word: college, school, hospital, market, bank, office, mosque…), `lat, lon, district_id` (admin unit), `confidence, updated_at`, `name_key` (folded with `match_key`). Indexed on `(district_id, kind)` and `name_key`. Bulk-loaded by the data platform, never edited by the API. | 5 |
| `0034_private_places` | `places.owner_user_id` (nullable → users, cascade), `places.listed` bool (default true). A stop from outside Vromon's list becomes a `places` row with `source` = `poi` / `geocode` / `pin`, `listed = false`, `owner_user_id` = the traveller. Unlisted places are never ranked, suggested, published or shown to anyone but the owner and the trip's room members. | 6 |
| `0035_trip_reviews` | **`trip_reviews`**: `id, trip_id, user_id, rating 1–5, comment, created_at, updated_at`, unique `(trip_id, user_id)`. **`review_items`**: `id, review_id → trip_reviews (cascade), target_type` (`place` / `restaurant` / `hotel` / `stay_home` / `journey`), `target_id, item_id` (the itinerary item, when there is one), `verdict` (`good` / `bad`), `comment` (≤ 280), `created_at, updated_at`. The old `feedback` table stays as "Rate this plan". Private to their author (D9). | 7 |

Every new table is included in `/me/export` and deleted with the account. Home stays (`kind = home`) are **personal data**: exported only to their owner.

---

## 3. API (under `/api/v1`, all signed in)

| Method and path | What | Step |
|---|---|---|
| `GET /trips/{id}/stays` | The stays, night by night. The owner sees everything. Others who can read the trip see `home` as `{kind: "home"}` with no label, lat or lon. | 1 |
| `PUT /trips/{id}/stays` | Replace them (owner only): validates the cover, re-times the affected days (pinned stops stay), returns the stays, the changed days and the budget delta. | 1 |
| `GET /trips/{id}/itinerary` | Each day also gets `start_base` and `end_base` `{kind, name, lat, lon}` (redacted for non-owners as above), and a `return_leg` `{minutes, km, cost}`. `hotel` stays for old app versions (night 1's hotel or null). | 1 |
| `GET /trips/{id}/days/{day_id}/route` | Also the leg from `start_base` to the first stop and from the last stop to `end_base`, flagged `kind: "from_base"` / `"to_base"`. | 1 |
| `PUT /trips/{id}/meals` | The trip's meal plan; re-builds the meal items of the affected days only. | 3 |
| `PUT /trips/{id}/days/{day_id}/meals` | One day's override (`null` clears it). | 3 |
| `GET /trips/{id}/stay-suggestions` | The open suggestions (computed on demand and cached by fingerprint). | 4 |
| `POST /trips/{id}/stay-suggestions/{sid}/accept` / `…/not-now` / `…/dismiss` | Accept splits the stays (as `PUT /stays` would); the others change the status. | 4 |
| `GET /trips/{id}/days/{day_id}/search?q=&near_item_id=&limit=` | Search anything (section 6). Returns grouped results; the response is never empty. | 6 |
| `POST /trips/{id}/days/{day_id}/items` | Accepts, as well as `place_id`, a `poi_id`, a `geocode` result token, or `{pin: {lat, lon, name}}`. It creates the private place, then adds it like any place. | 6 |
| `POST /places/{id}/suggest` | Optional: puts an unlisted place in the data platform's review queue. | 6 |
| `GET / PUT /trips/{id}/review` | Your trip review and item verdicts (create or update; partial updates allowed). Open from the trip's first day (D7); owner and room members, each their own (D8); others 404. Never shown to anyone else (D9). | 7 |

Privacy tests for every new endpoint, in the style of `tests/test_friends.py` (`act_as`): owner ✓; trip-room member reads, can't write; friend with trips shared reads, redacted; stranger → 404; blocked → 404.

---

## 4. Planner and budget changes

### Where a day starts and ends (step 1)
- Day *d* starts at the stay of night *d−1*. Day 1 starts at night 1's stay, since arrival is handled by "Getting there".
- Day *d* ends at the stay of night *d*. The last day, which has no night, ends at the last night's stay, and "Getting there" handles the way home.
- `kind = none` (day trip) means the trip's origin (`trip_preferences.origin_lat/lon`), or the destination centre when unknown.
- `kind = undecided` means the destination centre, as an estimate, with the leg marked `estimate: true`.
- **Both planners** get a start point and an end point per day, instead of one hotel:
  - In `itinerary_service.py`, the first leg is from `start`, and filling stops reserves `travel(last, end)` before `day_end`.
  - In `cpsat_scheduler.py`, the circuit becomes a path from `start` to `end`, and the return leg counts against the day window (D3).
- `recompute_day(day, hotel)`, `late_service`, `day_legs` and the Today mode server bits take the day's start and end instead of `hotel`. Search for every `_hotel(db, trip)` and `_pick_hotel` caller and replace each one.

### Stay costs (step 1)
- Stay = Σ over nights of that night's hotel price × rooms. `home` and `none` nights cost 0. The budget part lists them: "2 nights with family (no cost)". An `undecided` night with no hotel shows "not chosen yet" and isn't counted, as today's `no_hotel` does.
- **Picking a hotel when the traveller hasn't (D11):** a priced hotel with a real name (not an area name like "বয়রা,খুলনা"), near the trip's stops, at the budget's level, else the nearest level. If none is priced, the best-rated real-named one, with the cost "unknown". Never a guessed price.
- "Ways to save"'s cheaper-hotel saving applies **per stay block**. It's superseded by the stay advisor in step 4, which shows there too.

### Meals (step 3)
- For each meal slot of a day, look at the day override, else the trip's plan:
  - `restaurant`: as today.
  - `own`: an item `item_type = "meal"`, `meal_source = "own"`, no restaurant, 30 min. Lunch is placed at the stop where the traveller is at 12:30–14:30 (a scenic or park stop preferred). Cost = `own_cost_per_person × travellers` or 0.
  - `stay`: breakfast at the day's start base before the first leg, dinner at the end base after the way back. No restaurant leg. Cost 0. This makes `stay` dinners move the "finish by" boundary: dinner happens after you're back.
- The budget's food part counts each source separately: "4 restaurant meals · 2 packed · 2 where you stay".
- The AI budget prompt gets the meal plan, so it doesn't price meals the traveller won't buy.

### Stay advisor (step 4)
- **Candidates:** active hotels with known prices, rating ≥ 3.5, within 3 km of a later day's stops centroid, or in the same place as a must-see town (Mongla for the Sundarbans). Blocks of ≥ 1 night, never night 1 when the trip starts today.
- **Numbers per candidate block**, compared with the current plan:
  - `money_saved = (current price − candidate price) × nights × rooms − transfer cost`. The transfer is one leg between the two stays by the cheapest sensible local mode.
  - `minutes_saved = Σ over the block's days (base→first stop + last stop→base, now vs. candidate) − transfer minutes − 45` (packing, check-out, check-in).
  - `extra_moves` = 1 per block (2 if the traveller must come back to the old stay).
- **Suggest when** (D4): (`money_saved ≥ max(৳1,000, 10% of the block's current stay)` and `minutes_saved ≥ −30`) or (`minutes_saved ≥ 60` and `money_saved ≥ −৳500 × nights`). Never more than one move every 2 nights unless `minutes_saved ≥ 120` per night. Show at most 2 suggestions, best combined score first. The score: money + minutes × the traveller's time value; ৳5 a minute by default, so that time counts.
- **Re-evaluated** when the plan's fingerprint changes (stays, dates, stops, travellers, hotel prices). A `dismissed` suggestion returns only if its money or minutes saving grows by more than 25%. `not_now` returns on the next change.

---

## 5. App changes (by step)

| Step | Where | What |
|---|---|---|
| 2 | New trip, step 2 | A **"Where you'll stay"** row (like the interests row) opening a sheet: Hotel (recommended by budget) · With family or friends · Day trips (no night) · Decide later. "Different places on different nights" opens the per-night editor. The budget card reacts at once (a home stay → stay cost 0). |
| 2 | Trip screen | A **Stay** row in the plan sheet's header area for the current day ("Tonight: Hotel Castle Salam · Change"), the per-night editor sheet, a stay pin (bed / house icon) on `DayMap`, the return leg drawn and listed ("Back to … · 25 min · ৳80"), and the start leg from the stay. |
| 2 | Today mode | "Leave by" from the day's start base, and a "Back to …" line at the end of the day. |
| 2 | Budget screen | Stay lines per block, with "no cost" for family/friends. |
| 3 | New trip, step 2 | A **"Meals"** row ("Best places to eat" by default) opening a sheet: per meal, Restaurant / Bring my own / Where I stay, with an optional amount per person for own food. |
| 3 | Trip screen | The day menu gets **"Meals today"** (the per-day override). Meal rows show their source: a restaurant card, "Packed lunch (your own)", "Breakfast where you stay". The "Places to eat nearby" link stays. |
| 4 | Trip screen | The **suggestion card** above the affected day, with [Switch] [Not now] [Don't suggest this], the numbers, and a "Why?" sheet showing how they were worked out. The same suggestion in the budget's **Ways to save**. |
| 6 | Add a stop sheet | **Grouped results:** Vromon's places / More nearby / Other places (not checked) / Addresses, with distance and a source badge. "Did you mean…", "Colleges near you", and **"Put a pin on the map"** (a full-screen map picker, then a name). Unlisted stops show a small "Not checked" badge on their card and pin. |
| 7 | Trip screen (from the trip's first day), Trips tab | **"How was your trip?"** card (stars, optional comment); the optional "Rate things one by one" screen (`app/trip/review/[id].tsx`): per item Good 👍 / Bad 👎 and a comment, "Mark all good / bad" then change a few. A one-time "Rate your trip?" card on the Trips tab the day after it ends. |

**Map overlays:** every map that gets an overlay mounted after the map must use `androidView="texture"` (see `DayMap.tsx`). The default GLSurfaceView hid the plan sheet in release builds (fixed 2026-11-12).

---

## 6. Search anything (steps 5 and 6)

**Step 5: data.** A new data-platform connector, `overture_pois`, is like `service_places` but takes **all Overture place categories** inside Bangladesh (DuckDB on Overture's S3, `confidence ≥ 0.4`). It writes the raw parquet plus its manifest and loads `poi_index`:
- `district_id` via `admin_lookup.py`;
- a `kind` from a category map (`backend/app/core/poi-kinds.yaml` since step 6, read by search too: Overture category → friendly kind, with English and Bangla words, for example `college_university` → college / কলেজ / বিশ্ববিদ্যালয়);
- `name_key` from `vromon_data.text.match_key`.

Lodging and food rows are skipped, because the catalog has them, reviewed. Add `duckdb` to `data-platform/pyproject.toml`. Licence: CDLA-Permissive-2.0 (Overture), with ODbL-derived parts, credited in the app's sources screen as "© OpenStreetMap contributors, Overture Maps Foundation". A quality report gives counts by kind and district, plus a spot check of 20 known places in Khulna, Dhaka and Sylhet.

**Step 6: search.** `backend/app/services/place_search.py`:
1. **Normalise:** lowercase, Bangla digits → ASCII, the data platform's spelling fold (move `match_key` / `name_similarity` into a small module the backend can import, or copy it with a test that keeps them equal). Add `rapidfuzz` to the backend.
2. **Read intent:** if a word is a kind ("college", "কলেজ", "hospital", "atm", "bazar"), keep the kind and search the remaining words as a name.
3. **Area:** the day's stops and base. "Near" = distance from the stop before the free time (`near_item_id`), else the day's centroid. Search within 25 km first, then the destination's district, then the whole country for exact name matches only.
4. **Sources**, each scored by `name score (0–100, rapidfuzz WRatio on name and name_bn) × 0.7 + nearness (0–100) × 0.3`, plus a bonus for an exact kind match:
   1. Vromon places of this destination (listed, active);
   2. other catalog places within 25 km (published attractions, service places);
   3. `poi_index`;
   4. ORS geocoding (`https://api.openrouteservice.org/geocode/search`, a setting of its own, `ors_geocode_url`, since routing uses `api.heigit.org`; `focus.point` = the area centre, `boundary.country=BD`, `size=5`), called only when the first three give fewer than 5 results with score ≥ 60. Results are cached 7 days by `(query, area)`, at most 1 call per user per 2 s, and the daily total is capped below the free quota.
5. **Merge:** drop near-duplicates (same `name_key` within 150 m, keeping the more trusted source) and group by source.
6. **Never empty:** if nothing scores ≥ 50, return `did_you_mean` (the 3 closest names in the area), `kind_results` (the 5 nearest of the guessed kind) and `pin: true` (the app offers "Put a pin on the map").
7. **Performance:** p95 under 600 ms without the geocoder and 1.5 s with it, measured on the dev backend with the real database (log the timings in the report).

**Privacy:** the geocoder gets only the text and the area centre. Queries aren't stored with the user's id (rate limiting keeps a counter only).

---

## 7. Strings and accessibility

- Every new string is in `src/i18n/en.json` and `bn.json`; numbers via `usePlanFormat` (Bangla digits); money via the trip's currency helpers (`src/features/trips/new/currency.ts`).
- Stay and meal choices are radio groups; the suggestion card's numbers are read as one sentence; the pin picker has a non-gesture route (search an area, then "Use this place"); good/bad toggles are labelled radio pairs.
- New colour tokens (stay pin, "not checked" badge) are added to `contrast.test.ts`.

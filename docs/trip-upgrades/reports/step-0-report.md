# Step 0 report: audit, test accounts and decisions

**Date:** 2026-11-12. **App code changed:** none. **Data written:** one test trip on test account A (trip 117), kept as the baseline for later steps.

## 1. Test accounts

| Check | Result |
|---|---|
| `scripts/e2e/session.py A --check` | e2e.ana signs in (token 3600 s) |
| `scripts/e2e/session.py B --check` | e2e.bob signs in |
| `GET /api/v1/friends` as A | lists `e2e.bob` |
| `.env.e2e.local` ignored by git | yes (`.gitignore:3`, `.env*.local`) |

The baseline below was made **over the API as A**, not on the phone. Signing the phone into A would have signed the owner out of every Vromon app (global sign-out). Phone checks start in step 2.

## 2. Audit

### Where "the trip's hotel" is used (step 1 replaces each with the day's start and end, or a price per night)

| Where | Lines | Needs in future |
|---|---|---|
| `endpoints/trips.py` `_hotel(db, trip)` | 1434 (definition) and 22 callers: 477, 520, 543, 616, 662, 683, 803, 810, 842, 855, 878, 962, 1036, 1097, 1358; `_get_hotel_info` 1678, used by the itinerary (445) and 1060 | per-day start/end; the itinerary's `hotel` kept for old apps |
| `endpoints/rooms.py` | 278 (owner adds a suggested place) | the day's start/end |
| `itinerary_service.py` | 173 (pick), 351 (`last_point = hotel`), 414–423 (first leg), `_pick_hotel` 477–495 | start/end per day; the return leg inside "finish by" (D3); D11 picking |
| `cpsat_scheduler.py` | 107 `hotel_latlon`, 301–304 (node 0), 588, 614; docstring line 39 "return to the hotel is not counted" | a path from start to end |
| `trip_rules.py` | 218–232 `start_range` (first stop's earliest start from the hotel), 356–448 `unplaced`, `_why`, `suggest` | the day's start |
| `editing_service.py` | `recompute_day` 69 (first leg from the hotel) and callers 254, 286, 329, 404, 593, 738; `add_place` 460 | start/end |
| `late_service.py` | 122, 161 | start/end |
| `adaptation/adaptation_service.py` | 65 | start/end |
| `budget/service.py` | `day_legs` 75 (from and back to the hotel), stay 122–131, legs 161, `ways_to_save` 205–225, `apply_save` (hotel) 286–297, 352 | price per night; legs per day's start/end |
| `budget/ai.py` | accommodation level and room rates (5, 54, 69, 94, 100) | the stays |
| App | `useTripToday.ts:44`, `app/trip/today/[id].tsx:88` (leave by), budget screen (`budget/[id].tsx` 94, 288–320), `src/types/index.ts` 445, 633, 661, 670 | the day's start base |

`GET /trips/{id}/days/{day}/route` (trips.py 755) returns only stop-to-stop legs. "Getting there" (`_getting_there`, about 1319) ends at the destination's centre, not the hotel.

### Who else reads a trip (for D2)
`rooms.can_read_trip` (rooms.py 54): the owner, joined trip-room members, and friends (when the owner shares trips, or sent this trip in a chat). These endpoints use `friends_may_read=True`:

| Endpoint | Line | Exposes the stay? |
|---|---|---|
| `GET /trips/{id}` | 147 | preference (hotel_id) |
| `POST /trips/{id}/copy` | 273 | no: the copy doesn't take hotel_id or the origin (checked) |
| `GET …/itinerary` | 442 | **yes**: `hotel` with name and coordinates |
| `GET …/conditions` | 734 | check in step 1 |
| `GET …/days/{day}/route` | 762 | not today; it will (the from/to base legs) |
| `GET …/budget` | 1002 | **yes**: the hotel's name in the stay part |
| `POST …/budget/ai` | 1014 | the accommodation level |
| `GET …/journey` | 1289 | the start point (origin) |

Chat trip cards (`services/cards.py`) re-check `can_read_trip` per viewer and don't carry the hotel today.

### Meals
`MEAL_SLOTS` (itinerary_service.py 56): Breakfast 08:00, Lunch 12:30 (movable inside `LUNCH_RANGE`/`LUNCH_STRETCH`), Dinner 19:00, 60 min each. Restaurants come from `_pick_meal` (497) and `_meal_item_at` (533), with cost from `_meal_cost` (89). CP-SAT has a `MEAL_BONUS` and `meal_cost_per_day`. **The budget counts a meal with no restaurant as a placeholder estimate** (budget/service.py 146–151). Step 3 must mark own/stay meals (`meal_source`) so they're not priced as guesses.

### Rating
`FeedbackForm.tsx` ("Rate this plan": 5 stars, 8 tags, a note) is shown in `TripDetails.tsx:123` for `mine && hasPlan`, at any time, not only after the trip. Table `feedback` (models.py 835); `POST/GET /trips/{id}/feedback` (trips.py 917, 938). `tripPhase()` is in `src/features/trips/dates.ts:42`.

### Search in free time
`AddStopSheet.tsx` → `tripsApi.suggestions` (api.ts 256) → `GET …/days/{day}/suggestions` (trips.py 886) → `suggestions_for_day` (editing_service.py 496): a lowercase substring of the place name, among this destination's `ranked_places` (166) not already used (`used_place_ids` 92). A stop needs a `places` row (`add_place` 460; `itinerary_items` has no coordinates).

### Data for "search anything"
- `data-platform/raw/osm_overpass`: 65 river files and 2 transport-hub files only.
- `raw/overture_places`: 2 parquet files (4.8 MB each), filtered to lodging and food (`connectors/service_places.py` 98–102).
- Libraries: `rapidfuzz` only in `data-platform/.venv`; `duckdb` and `pyarrow` in neither venv (the Overture connector imports duckdb; `pyproject.toml` doesn't list it).
- **ORS geocoding works** with the existing key at `https://api.openrouteservice.org/geocode/search` (HTTP 200). Under routing's `https://api.heigit.org/openrouteservice/geocode/search` it's HTTP 404. Near Khulna (focus 22.8456, 89.5403):

| Query | Top results |
|---|---|
| BL College | B.L college shidminar, BL College Pond, B.L College Hall Pond (around the college, not the college itself) |
| Sonadanga | Sonadanga (locality, Khulna) |
| college | Mohashin College, Ahsanullah college, College mosque, Degree College |
| hospital | Shishu Hospital, Pyrimid Hospital, Daps Hospital, Dighalia Hospital |

### Hotel prices (new finding, D11)

| Level | Destinations with hotels | …with a priced one | Hotels | Priced |
|---|---|---|---|---|
| Budget | 13 | 13 | 26 | 26 |
| Standard | 57 | 15 | 899 | 46 |
| Luxury | 7 | 7 | 12 | 10 |

Only 82 of 937 active hotels have a price (66 destinations). In Khulna, all 24 Standard hotels are unpriced, so `_pick_hotel` took the first by id: "বয়রা,খুলনা", which is an area name, not a hotel. So the baseline trip's stay cost is "unknown".

## 3. Baseline (test account A, trip 117)
Khulna, 3–5 Dec 2026, 2 travellers, Comfort (৳25,000), Balanced, 09:00–20:00, built with `algorithm=cpsat` (status valid).

| Day | Last sight, ends | Its way back to the hotel | Dinner (city) | Then back at the hotel | Past "finish by" 20:00 |
|---|---|---|---|---|---|
| 1 | Pankhali Dolphin Sanctuary, 16:46 | 46 min / 23.0 km | 19:00–20:00 | 20:06 | 6 min |
| 2 | Dhangmari Wildlife Sanctuary, 16:48 | 90 min / 45.2 km | 19:00–20:00 | 20:09 | 9 min |
| 3 | Mosjidkur Mosque, 16:50 | 93 min / 46.4 km | 19:00–20:00 | 20:04 | 4 min |

**Reading it:** because every day ends with a fixed dinner in the city near the hotel, today's plans run only 4–9 minutes past "finish by". The real way back, 46–93 minutes from the far sights to town, falls in the gap before dinner, which the planner leaves but never counts. D3 matters most when dinner isn't at a restaurant (step 3: "where I stay", "own"), and for drawing the way back. Travel times are the planner's own estimates (`_travel_minutes`). The budget's stay part is `{"reason": "no_price", "hotel": "বয়রা,খুলনা", "nights": 2}`, and Ways to save is empty.

**Free-time search** (day 1, near its first stop): "college" → 0, "BL College" → 0, "Sonadanga" → 0, "hospital" → 0.

## 4. Decisions (recorded in decisions.md)
- D1–D6, D8, D10 as recommended.
- **D7 changed:** a trip can be rated any time during the trip and after.
- **D9 changed:** items are rated good or bad with an optional comment; no highlights, no sharing.
- **D11 added:** prefer priced, real-named hotels near the stops; else "unknown", never a guess.

## 5. Changes made to the plan
- `design.md`: a new §1 "Audit findings" (above); the D11 picking rule in §4; `ors_geocode_url` in §6; the simpler rating in §2 (0035), §3 and §5.
- `features.md` F4 rewritten for D7/D9; `README.md` summary and step 7 line; `decisions.md` answers and the D7/D9/D11 rows.
- `prompts/step-1` (D11 picking, compare with trip 117), `step-6` (the geocoding URL), `step-7` (rewritten for good/bad, private, from the first day), `step-8` (no highlights).
- Outside the plan, found while preparing it: `mobile/.maestro/config.yaml` listed flow 02 by its old name; fixed.

## 6. Open items for the owner
- **Hotel prices:** ask the data collector to gather more room rates (the `hotel_websites` connector), especially Standard-level hotels. Until then many stays show "cost unknown", and the stay advisor (step 4) can only compare priced hotels.
- Test trip 117 on account A is kept as the baseline. Delete it after step 8 if you like.
- Nothing is committed. To commit:
  ```bash
  cd ~/Codes/Vromon
  git add -A
  git commit -m "Trip upgrades step 0: audit, baseline and decisions"
  git push origin main
  ```

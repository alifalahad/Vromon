# Step 6: Search anything in free time

**Goal:** the "Add a stop" search finds any place: Vromon's, the wider catalog, the places index, addresses, or a pin. Results are ranked by match and nearness, and the sheet never ends at "nothing found". A stop from outside Vromon's list works like any other and stays private.
**Depends on:** step 5 (poi_index). Uses step 2's PlacePicker.

## Prompt

```
Follow docs/trip-upgrades: features.md F5, design.md §2 (0034), §3 (search rows), §6 "Step 6: search", §5 (step 6
row), decision D10, rules.md.

Backend:
1. Add rapidfuzz to the backend. Make the data platform's match_key / name_similarity importable by the backend
   (move them into a small shared module both use, or copy them with a test asserting both give the same results on
   a list of Bangladeshi names, including Bogura/Bagerhat).
2. Migration 0034_private_places (places.owner_user_id, places.listed). Every query that offers places to others
   (ranked_places, suggestions_for_day, publish, catalog APIs, explore, recommendations) filters listed = true.
   Test that an unlisted place never leaks: another user's suggestions, search and explore.
3. backend/app/services/place_search.py, as design.md §6 steps 1–7: normalise, kind words (from poi-kinds.yaml's
   English and Bangla words), the area, the four sources with the score formula, ORS geocoding (settings ors_geocode_url =
   https://api.openrouteservice.org/geocode/search, which works with the existing ORS_API_KEY; routing's api.heigit.org
   base returns 404 for geocoding) with a 7-day cache, a per-user 1-call-per-2-s limit and a daily cap, merge and dedup, and the
   never-empty fallbacks (did_you_mean, kind_results, pin).
4. API: GET /trips/{id}/days/{day_id}/search?q=&near_item_id=&limit= (grouped results with source, kind, distance,
   a checked flag); POST /trips/{id}/days/{day_id}/items accepts poi_id / a geocode token / pin {lat, lon, name} and
   creates the private place (source poi/geocode/pin, listed false, owner = user, 60-min visit, cost unknown, hours
   unknown), then adds it like any place; POST /places/{id}/suggest puts an unlisted place in the data platform's
   review queue (a review task "new_entity" with its source).
   Privacy matrix: owner ✓; room members see the stop, others 404.
5. Tests:
   - "BL College" finds the college;
   - "college" alone gives the nearest colleges;
   - a typo finds it;
   - a Bangla query works;
   - a nonsense query returns did_you_mean / kind_results / pin and is never empty;
   - the geocoder is called only when needed, and the cache works (mocked, no network in tests);
   - the rate limit;
   - adding each kind of result makes a working stop (travel legs, the route, Today).
   Log p95 timings on the real database copy in the report.

App:
6. AddStopSheet.tsx: keep the suggestions when the box is empty; when typing, show the grouped results (Vromon's
   places / More nearby / Other places (not checked) / Addresses), each with its distance from the stop before
   ("2.4 km from Rupsha Bridge"), a kind icon, and a "Not checked" badge outside Vromon's data. At the end, always
   show "Put a pin on the map" (PlacePicker, then a name) and, when there are fallbacks, "Did you mean …" and
   "Colleges near you". Results load fast (debounce as today), with a spinner for the geocoder part only.
7. Stop cards, map pins and Today mode show unlisted stops with the badge. A stop's sheet has "Suggest this place to
   Vromon" for unlisted ones.
8. i18n en/bn, accessibility (results are a list with headings; the pin picker has a non-gesture route), jest tests;
   typecheck, lint, jest.

Phone (test account A, a Khulna trip):
- search "BL College", "college", "Sonadanga", "hospital", a Bangla name, and a typo;
- add one of each kind of result to free time;
- check the map, the legs and Today mode;
- put a pin and name it;
- "Suggest to Vromon".
Repeat the step-0 baseline searches and put the before/after side by side in the report.

Write reports/step-6-report.md, update the Status table, give the git commands, stop.
```

## Done when
- The step-0 searches that found nothing now find the right places, and no search ends empty.
- Stops from outside Vromon's list work like any stop, and nobody else is ever offered them.

## The owner checks
- In Khulna free time, "BL College" (or any college you know) shows up, close places first, and you can add it.
- A search for something that doesn't exist still offers "Put a pin on the map".

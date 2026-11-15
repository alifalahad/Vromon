# Step 5 report: New trip, getting there

**Date:** 2026-11-15. **Status:** done. **Mockups:** frames NewTripWhen and NewTripGettingThere of https://claude.ai/artifact/RMjDbAXaeW6DNQKAY8pBNN.

"Getting there" on New trip is now optional and has its own design: where you start (your current location, named and said how precise; or a city), then the ways there with times and fares before the trip exists. The one you pick is what the plan, the day-1 card and the budget use.

## 1. What changed

### Optional (prompt point 1)

- **The section:** "Getting there" says "optional", like "First and last day". Until it's added it's one quiet card ("Where do you start from? Add it to see the ways there and their fares · Add"), as in frame NewTripWhen. Next works without touching it.
- **What happened before without a start:** the plan built as usual with no way there. The day-1 card was simply missing, and the budget's line read "Add where you start from to see this", without saying it was left out of the total.
- **Now:**
  - Day 1 says "Getting there isn't counted in this plan." (`app/trip/[id].tsx`).
  - The budget line reads "Not counted: you didn't say where you start from".
  - The plan itself is unchanged.

### The start (point 2)

- **"Use my current location":**
  - **Precise:** the most accurate fix the phone gives within 6 seconds, at Android's highest accuracy (`preciseFix`). It stops early once a fix is within 25 m, and falls back to one plain reading if nothing comes.
  - **Named:** the server names the point, never "Your location". It uses the nearest of Vromon's own places or transport hubs within 700 m ("Near Shahid Hadis Park, Khulna"). Otherwise the subdistrict and district ("Khan Jahan Ali, Khulna", "Tejgaon, Dhaka"); outside Bangladesh, the nearest city ("Near Kolkata"). Bangla names when the app is in Bangla.
  - **How rough:** the card says it: "Your location, within about 10 m", rounded the way people say it (10 m, 300 m, 1.2 km).
  - **Adjust on the map** opens the place picker on that point; the moved point is named again ("Set on the map").
- **What names a point (and what doesn't):**
  - What already existed: `nearest_city_stop` (GeoNames: only 139 places in Bangladesh, too coarse), `district_of` (district polygons), and the places index behind search. That index (Overture) is too noisy to name a place by: an airport listed as "Airarabia,dhaka", paint dealers as markets.
  - So the new `app/services/place_name.py` uses only curated names (Vromon's places, transport hubs) plus the subdistrict polygons that were already in the database.
  - The position never goes to an outside service.
- **Or a city,** searched as before.
- **Asked once:** location permission is asked on the tap only. The point is kept only as the trip's start. Refused: "Vromon can't see your location. Allow it in Settings, or search for a city.", and search still works.

### Ways to get there (point 3)

- **When it shows:** once there's a start and a destination, as its own card (frame NewTripGettingThere). It lists every way the journey service finds: "Khulna to Cox's Bazar · one way, for one person".
- **Vromon's pick comes first,** badged, with its reason in the app's language: "Fastest that fits your budget", or "The cheapest way". The server now sends a `reason_code` for this, and the Getting there screen uses it too, so Bangla no longer shows the English reason.
- **Each way** shows:
  - its time;
  - its fare for one person, said as sure as it is: "about ৳1,195" for an estimate, an exact amount when every fare is official, "about ৳11,600 for the car" for a hired car, "part of the way not priced" when a leg has no fare;
  - for a train its departure ("Train at 22:15"), and for a plane "Check flights and fares with the airline".
  - "'About' means an estimate, not a booked fare." closes the card.
- **Choosing:** "Let Vromon choose by my budget" is a switch, on by default. Tapping a way picks it and turns the switch off; turning it on again lets Vromon choose. The old "How do you like to travel?" chips are gone.
- **New endpoint `POST /trips/journey-options`** (signed in only, saves nothing): runs `journey.plan()` on the answers so far. It shares the destination lookup with the saved trip's `GET /trips/{id}/journey`, so the trip built from the same answers shows the same ways (tested).
- **Asked again** when the destination, start, dates, travellers or budget change.
- **No way found:** "Vromon can't find a way there from this start yet. The plan goes on without it."

### What's sent (point 4)

The payload has the same shape: `origin` or `origin_point`, `transport_modes`, `transport_by_budget`. A way picked sends `transport_modes: [mode]` and `transport_by_budget: false`; Vromon choosing sends `[]` and `true`.

On the phone, a trip from Dhaka with Plane picked showed:

- day 1: "Getting there from Dhaka by plane";
- the budget: "Plane, Dhaka ⇄ Cox's Bazar, 2 seats ≈ ৳25,640" (the card's about ৳6,410 a person one way, for 2, there and back);
- the Getting there screen: Plane first with "Your choice".

### Lines on the trip's maps (point 5, D5)

None to remove:

- **The trip's only map** is DayMap on the trip screen. It draws a day's stops and the legs to and from the stay, never the trip's start. The "home" stay is a family or friends' stay, not your start. Checked on the phone with the Dhaka trip: only the Cox's Bazar stops.
- **The route screen** (`app/trip/route/[id].tsx`) is a list with no map.
- **The Building screen's line** is a drawing between four dots.
- **The Map tab's dotted line** to the next trip stays (D5).

### Icons

The frame's own line drawings for the start (crosshair), bus, train, plane and car, added to `LineIcon`.

### Taken away

The old getting-there block in `app/trip/new.tsx` (its location code, the `MODES` chips and 12 styles) and six strings no longer used (`newTrip.fromHere`, `yourLocation`, `locationDenied`, `locationFailed`, `howTravelHint`, `from`). The journey screen still uses `howTravel`, `travelModes` and `byBudget`, so they stay.

## 2. How it was checked

On the USB phone, as test account A (dev build, the dev backend restarted with the new code).

| Checked on the phone | Result |
|---|---|
| The section untouched | One "Getting there · optional" card; Next goes on. |
| Start: Dhaka (search) | "Starting from Dhaka, Bangladesh · Change". Ways: Bus (Vromon's pick, 7 h 40 min, about ৳1,195, "Fastest that fits your budget"), Plane (3 h 15 min, about ৳6,410, check with the airline), Car (5 h, about ৳11,600 for the car). |
| Plane picked, plan built | The switch turned off, Plane checked. Day 1, the budget and the Getting there screen all say plane (above). The day map shows no line from Dhaka. |
| A trip with no start (trip 121) | Day 1: "Getting there isn't counted in this plan." Budget: "Not counted: you didn't say where you start from". |
| "Use my current location" (with your OK) | "Khan Jahan Ali, Khulna", "Your location, within about 10 m", with Adjust on the map and Change. The start was cleared afterwards and no trip was built from it. |
| Bangla at 1.6× | The start card, the subtitle, the switch and every way wrap whole, with Bangla digits: "বাস · Vromon-এর পছন্দ · ৭ ঘ ৪০ মি · প্রায় ৳১,১৯৫". |

There's no train from Dhaka or Khulna to Cox's Bazar in Vromon's timetable data, so "pick the train" wasn't possible. Plane was the non-default way tested.

The backend was also asked directly from near Shahid Hadis Park in Khulna: bus (pick, about ৳1,700), plane, car.

Afterwards the phone was set back: English, normal text size, Appearance System, Rustic.

## 3. Checks

| Check | Result |
|---|---|
| Before starting | Jest 703 passed (step 4); pytest 826 passed, 9 skipped |
| `npx tsc --noEmit` | clean |
| `npx eslint . --max-warnings 0` | clean |
| `npx jest` | 713 of 713 passed (10 new in `gettingThere.test.tsx`: the section with no start, opening and "Not now", your location named with its precision, permission refused, rounding, the ways with pick and reasons and fares, a way picked and back to Vromon choosing, asked again on travellers and budget, no way found, Bangla) |
| `pytest -q` | 829 passed, 9 skipped (3 new in `test_journey.py`: the ways before the trip save nothing and match the saved trip's ways, a way picked comes first as the choice; a start, a known destination and sign-in are needed; a point named from Vromon's own places, in English and Bangla) |
| Maestro `05-plan-trip` | passed on the phone |

`tripBudget.test.tsx` now expects the new "Not counted" line. Maestro 05 no longer taps the removed "Bus" chip: it scrolls to the optional card and goes on.

## 4. Left open

- **No trains to Cox's Bazar** come up from Dhaka or Khulna: Vromon's timetable data has no service there, though the Cox's Bazar Express exists. That's the journey data, not this screen.
- **"Near …" names come only from Vromon's places and hubs within 700 m.** Elsewhere the subdistrict and district stand in ("Khan Jahan Ali, Khulna"). Some subdistricts have no Bangla name in the data, so Bangla shows their English name.
- **The fare per person divides a hired car's fare by the travellers**, as the journey service always has. The card says "for the car" for the whole car.

## Files

- New: `backend/app/services/place_name.py`, `mobile/src/features/trips/new/GettingThereSection.tsx`, `mobile/src/__tests__/gettingThere.test.tsx`
- `backend/app/services/journey.py` (`reason_code`), `backend/app/api/v1/endpoints/trips.py` (`POST /trips/journey-options`, `_destination_point`), `backend/app/api/v1/endpoints/geo.py` (`GET /geo/where`), `backend/tests/test_journey.py`
- `mobile/app/trip/new.tsx`, `mobile/app/trip/[id].tsx` (day-1 line), `mobile/app/trip/journey/[id].tsx` (reason in the app's language), `mobile/src/features/trips/new/newTrip.ts` (`journeyAnswers`, the start's precision), `mobile/src/services/api.ts`, `mobile/src/types/index.ts`, `mobile/src/ui/LineIcon.tsx`
- `mobile/src/i18n/en.json`, `bn.json`; `mobile/src/__tests__/tripBudget.test.tsx`; `mobile/.maestro/05-plan-trip.yaml`
- `docs/ui-refresh/prompts.md` (Status table), this report

## Git

Committed by the agent on `main`, with no co-author line. Nothing was pushed.

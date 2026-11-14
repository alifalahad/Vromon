# Step 2 report: the top-left button and "Your travels"

**Date:** 2026-11-14. **Status:** done. **Mockups:** frames 1, 3, 4 and 5 of https://claude.ai/artifact/RMjDbAXaeW6DNQKAY8pBNN.

"Your story" and "Your Bangladesh" are gone. The top-left button on the Map tab now opens "Your travels": a screen of numbers, each opening the list behind it. A country opens its own page with what you've visited inside it.

## 1. What changed

### The top-left button (`StoryCapsule.tsx`, frame 1)

- A white pill with a 40 dp ring in the map theme's "visited" colour, the number in the title font, "2 of 8 divisions" and the countries under it, and a chevron.
- On the globe or zoomed out it reads "2 countries" with "1% of the world · 1 continent". The share and continents come from the server's count, so they are left out until loaded.
- Counted from your marks, so it changes the moment a place is marked, offline too. Its test ID is kept.
- On a trip day it still shows the day and opens Today.

### "Your travels" (`app/map/dashboard.tsx`, frame 3)

- **The top:** "The world so far" with your countries, the share of the world and continents, and a small globe of your marks (the same drawing as step 1's globe, still). It opens Countries.
- **The tiles:** Countries; Divisions "2 of 8" with a bar (Regions for a home country other than Bangladesh; left out when that country's regions aren't in the app); Districts "0 of 64" (Bangladesh only); Cities; Trips ("10 finished", "6 coming up"); Days on the road. Then the Want list. Then **Replay your map** and **Make a poster** (D2).
- **One function per number:** every number is the length of the list it opens (`features/map/travels.ts`), and the tests check each pair.
- **What counts:** what you marked yourself, as the server's stats count it. A city in Nepal doesn't make Nepal a country you've been to unless you marked Nepal.

### The lists (`app/map/list/[kind].tsx`, frames 4 and 5)

- **Countries:** flag, name, the status as a word, the year first visited. The Want countries are in their own part. A country opens its page.
- **Divisions or regions:** those you've been to, with "0 of 4 districts" and the year. Then "Not visited yet" with **Mark** (Visited, Lived, Want) or "Want to go", and "Trip in 6 days" when a coming trip goes there. A division opens its own list: its districts (with Mark) and the cities you marked in it.
- **Districts:** grouped by division.
- **Cities:** grouped by country.
- **Trips:** finished trips, each opening the trip. The Days tile opens the same list.
- **Want list:** places of every kind, each with what it is and its country.
- **Show on map:** every place row has it (the map-pin button). The dashboard closes and the map frames the place: a country, division or district by its outline, a city or another country's region by its point.
- **Empty lists:** each says how to fill it ("Zoom in on the map, then press and hold a city to mark it", frame 5), with "Open the map".

### A country's page (`app/map/country/[iso2].tsx`, frame 4)

- **The top:** a small map of the country drawn from the shapes in the app (Bangladesh's divisions in their status colours, your marked cities as dots), the status ("Lived here", "Visited"), and "Show on map".
- **Tabs:** Divisions or Regions ("2/8"), Districts (Bangladesh), Cities, and Places. Places are the places in your finished trips' plans there, each with its trip and day. They are loaded with the page, so the number on the tab is right before you open it.
- **Not Explore's country page:** the step asked to check whether that page could serve. It shows Wikidata facts (capital, population, largest cities) and needs a connection, while this one shows your own marks and works offline. Turning one into the other would have mixed two jobs, so this is a page of its own.

### The backend

- **New: `GET /geo/places?regions=…&cities=…`.** It returns names and points for the regions and cities you marked: a mark stores only a code, and the app has names for countries and Bangladesh's divisions and districts only. Unknown codes are left out; at most 500 of each.
- **In the app:** the answer is kept in the app's saved cache, so the lists read offline once loaded. Without it, a city reads "A city (its name loads with a connection)".
- **Tests:** one new test.

### Taken away

- `StoryPanel.tsx` and its test.
- Its strings ("Your story", "Your Bangladesh", per-year bars, and the rest).
- The helpers only it used (`placesPerYear`, `undatedCount`, `wantCount`).
- What Replay and the poster need from `story.ts` stays.
- "Opens your story" became "Opens today on your trip" (the button's hint on a trip day).

### Maestro

`10-map-home.yaml` now expects "Your travels" (`travels-screen`), checks the Countries tile and goes back. On a trip day it still expects Today.

## 2. How it was checked

The step asks to check on the owner's account through the read-only proxy. I didn't: switching the dev app between your account and the test account means signing out, and signing you out ends all your sessions (an open decision). I used test account A, which has real marks: 2 countries, 2 divisions visited, 5 wanted, 2 cities, 10 finished trips.

| Checked on the phone | Result |
|---|---|
| The button | "2 countries · 1% of the world · 1 continent" on the globe, with the chevron. Tapping it opens "Your travels". |
| "Your travels" | 2 countries, 2 of 8 divisions, 0 of 64 districts, 2 cities, 10 finished, 6 coming up, 28 days, 5 on the Want list. |
| Countries, Divisions, Cities, Trips, Want list | Each lists exactly what its number counts. |
| Divisions | Sylhet and Chattogram visited, with "0 of 4 districts" and the year. Six not visited; Khulna says "Trip in 6 days". |
| Sylhet's own list | Its 4 districts with Mark; no cities, with the empty state. |
| Show on map (Habiganj) | The dashboard closed and the map framed Habiganj. |
| Mark (Rangpur, Want) | Rangpur moved to "Want to go" at once. I removed the mark afterwards through the API. |
| Bangladesh's page | The map with Sylhet and Chattogram coloured and a city dot. Tabs 2/8, 0/64, 2, 8. The Places tab lists 8 places from the Cox's Bazar trips with trip and day. |
| Make a poster | Back on the map, the poster made from home. |
| Replay your map | Opens Replay. |
| Bangla, light, 1.6× | Dashboard, divisions and Bangladesh's page; Bangla digits. One fix came from this: the tiles read "২ / ৮" in Bangla instead of "২ ৮টির মধ্যে". |

**Found on the phone and fixed:**
- Long names broke mid-word ("Mymensin gh") on rows with a status chip, a map button and a chevron. On rows that open a page, the status word moved into the second line.
- The Places tab showed "0" before it was opened. Its plans now load with the page.

The test account was put back to English, System appearance and normal text size.

## 3. Checks at the end

| Check | Result |
|---|---|
| `npx tsc --noEmit` | clean |
| `npx eslint . --max-warnings 0` | clean |
| `npx jest` (whole suite) | 685 of 685 passed (13 new for this step). |
| `backend: pytest -q` | 826 passed, 9 skipped (825 before, plus the lookup test). |
| Maestro `03-theme-rustic`, `10-map-home` | both passed on the phone. |

**A test fixed outside this step:** `chatCache.test.ts` ("a page of older messages…") failed in two full runs, in step 1 and here, and passed every time on its own. It read the screen's data right after loading older messages; on a busy run the new value lands a moment later. It now waits for the 100 messages, as the line before it already waits for the first 50. Only the test changed.

## 4. Left open

- **"Show on map" for another country's region** frames its point, not its outline: the app has outlines only for Bangladesh's divisions.
- **Friends** aren't on "Your travels": the step didn't ask for them.
- **"Make a poster"** closes "Your travels" and shows the poster over the map, as it did from "Your story".
- **Frame 2's top-left text** ("3 countries · 1.5% of the world · 2 continents") is now what the button shows on the globe.

## Files

- New: `mobile/app/map/dashboard.tsx`, `mobile/app/map/list/[kind].tsx`, `mobile/app/map/country/[iso2].tsx`, `mobile/src/features/map/travels.ts`, `travelPlaces.ts`, `mapRequest.ts`, `TravelParts.tsx`, `TravelKit.tsx`, `mobile/src/__tests__/travels.test.tsx`
- `mobile/src/features/map/StoryCapsule.tsx`, `WorldMap.tsx` (`show`), `globe/Globe.tsx` (`GlobeImage`), `story.ts`; `mobile/app/(tabs)/index.tsx`; `mobile/app/_layout.tsx`
- Removed: `mobile/src/features/map/StoryPanel.tsx`, `mobile/src/__tests__/storyPanel.test.tsx`
- `mobile/src/i18n/en.json`, `bn.json`; `mobile/src/services/api.ts`; `mobile/src/__tests__/story.test.ts`; `mobile/.maestro/10-map-home.yaml`
- `backend/app/api/v1/endpoints/geo.py`, `backend/app/schemas/geo.py`, `backend/tests/test_geo_visits.py`
- `mobile/src/__tests__/chatCache.test.ts` (waits for the loaded messages)
- `docs/ui-refresh/prompts.md` (Status table), this report

## Git

Committed by the agent on `main`, with no co-author line. Nothing was pushed.

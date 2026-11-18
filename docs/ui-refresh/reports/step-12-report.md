# Step 12 report: Explore, redesigned

**Date:** 2026-11-18. **Status:** done. **Mockups:** frames 18 (ExploreHeader), 22 (ExploreHome), 23 (ExploreMore), 24 (ExploreWorld) and 25 (ExploreDistrict) of https://claude.ai/artifact/RMjDbAXaeW6DNQKAY8pBNN. **Decisions:** D15, D16.

Explore is now two halves under a switch, "Your country" and "The world". Your country is the home country from your profile; the screen itself never names a country. Your own marks (Visited, Lived, Want to go) show everywhere in Explore. A district's page lets you plan a trip there or mark it without going back to the map.

## 1. The Explore tab (`app/(tabs)/explore.tsx`)

- **The header** is fixed: the search field, then your account picture (frame 18; step 10's header).
- **The switch** "Your country | The world" (frame 22) sits under it.
  - It's the existing segmented control in a smaller size (`compact`), in the frame's colours: a darker track, a white thumb, and the half not chosen in the second text colour.
  - **Your choice is remembered while the app is open,** but not after it's closed (`exploreState.ts`). Explore opens on Your country.
- **Search** works from both halves, as before: districts, countries and cities.
  - Results are now one card of rows, each with your mark when there is one.
  - A district opens its page; a country or a city opens the country's page.

## 2. Your country (`src/features/explore/YourCountry.tsx`)

The home country is `home_country_iso2` from your profile, or Bangladesh until one is chosen. No country's name is written into the screen (D15): the switch and the small label say "Your country", and the card shows the country's name.

### Bangladesh (frames 22 and 23)

- **The picture** is Esri's satellite picture of the country itself.
  - Before, the whole picture was a single map tile, mostly India and Nepal.
  - Now the app asks the same Esri service for Bangladesh's own box, worked out from the country shapes already in the app (`countrySatellite` in `marks.ts`).
  - The credit "Satellite picture: Esri" is on the picture.
- **On the picture:**
  - "YOUR COUNTRY" with the flag;
  - the name;
  - the facts line: "Capital Dhaka · 171M people · 8 divisions · 64 districts";
  - "You've been to **N** of 64 districts", with N in the highlight colour and a bar under it;
  - "All districts".
- **The count** is the districts you've marked Visited or Lived. It's the same list as the travel dashboard's District count, so the two always agree.
  - At 0 the bar is empty. An earlier version showed a sliver of orange at 0, which I fixed on the phone.
- **Ready to plan:** the places Vromon can plan.
  - Each card has its district's photo and counts, and "Plan a trip", which opens New trip with that place already chosen.
  - Tapping the rest of the card opens the district.
  - The first 12 are shown; "See all 66" opens every one, grouped by division.
  - **The order (my choice):** places in districts you've marked Want to go come first, then those with the most sights.
  - **Two places aren't district towns:** Kuakata is in Patuakhali and Sreemangal in Moulvibazar. Their cards say "In Patuakhali" and "In Moulvibazar", because the counts are their district's.
  - **Names:** places to plan have English names only. When a place is its district's town, the card uses the district's own name, so Bangla shows "ঢাকা", not "Dhaka".
- **Districts by division:**
  - The division chips: the chosen one is navy, the others white with an outline.
  - Under them, the division's districts as photo cards. The district with the most sights gets the large card; the rest are two to a row.
  - Each card has its counts and your mark ("✓ Visited", "Lived", "Want to go") as a word with an icon.
  - The large card also has "You can plan it" and names the sight its photo shows ("… · Bagakain Lake").
- **Foods with a home:** the 40 GI foods.
  - Each card has the name in Bangla as the register gives it, and its district in the app's language.
  - Tapping one opens its district.
- **At the end:** the sources and the photo credits.

### Any other home country

From `GET /explore/countries/{iso2}` and your own marks. Nothing is invented: no districts, no "Ready to plan", no GI foods.

- **The picture:** Esri's satellite picture of that country, worked out the same way as Bangladesh's.
- **On it:**
  - "YOUR COUNTRY" with the flag, the name, and "Capital … · … people";
  - "You've been to N cities here", or "Mark the places you've been on the map" when there are none;
  - "Your travels here", which opens that country's page in Your travels (step 2, frame 4).
- **What you've marked here:** your marked cities and regions in that country, with your mark. When there are none, it says so.
- **Largest cities in …:** the 12 largest, each with your mark.
- **Facts about …:** opens Explore's country page (capital, people, area, currency, languages).

## 3. The world (`src/features/explore/TheWorld.tsx`, frame 24)

- **The card at the top:**
  - "The world", and "229 countries and territories · 7 continents" (the catalogue's counts);
  - "You've been to **N**", the number of countries you've marked Visited or Lived;
  - a still globe of your marks (the dashboard's, step 2).
  - Tapping it opens Your travels.
- **By continent:** a tile for each continent.
  - Each tile has its number of countries and, where you've been, "· 2 visited" with an orange outline.
  - The flags of its largest countries are shown beside the name.
- **Most people:** the 10 most populous countries ("1.4B people · Asia"), each with your mark. "All countries" opens all of them.
- **Largest cities:** the 10 largest ("37M people · Japan"), each with your mark. "All cities" opens the top 100.

## 4. A district's page (`app/explore/district/[slug].tsx`, frame 25)

- **The photo across the top,** with its credit (the sight's name, then the photographer and licence).
  - Without a photo of its own: the satellite picture, credited "Satellite picture: Esri".
  - **On it:** the back button; the share button ("Send to a friend", the chat's existing place card); the name; then the other language's name, the division and the area.
- **"Plan a trip here"** opens New trip with the place chosen.
  - Where two places can be planned (Patuakhali has Kuakata; Moulvibazar has Sreemangal), it asks which.
- **"Mark"** opens Visited, Lived, Want to go, and "Not marked" once it's marked. This is the map's own marking, so the map, the dashboard and Explore all change together.
  - Once marked, the button shows the mark ("✓ Visited").
- **The four counts** (Sights, Stays, Places to eat, Upazilas) each jump to their section.
- **The map card:** the existing render, with "Next to …" naming the neighbouring districts, and "Open the map".
- **Sights:** those with a photo as cards; the rest as rows (five, then "Show N more").
- **Stays:** every hotel in the district.
  - Those with a published room rate come first: "Hotel · from ৳2,645 a night · checked 5 Nov 2026".
  - The others say "Room rate not published".
  - The first 10 come with the page; "Show 20 more" fetches the next ones, until the list holds as many as the count ("30 of 46 shown").
- **Places to eat:** the same, with what sort of place each is (Restaurant, Café, Fast food…).
- **Then:** GI foods and products, neighbours, upazilas, sources, and the photo and map credits.
- **Once you scroll past the photo,** a strip of the page's colour covers the status bar, so the page doesn't run under its icons.

## 5. The other Explore screens

| Screen | Now |
|---|---|
| All districts (`districts.tsx`) | Explore's division chips and district cards, with your marks. With `?show=plan`, it's "Ready to plan", See all: every place, by division, as Plan cards. |
| A continent, or the whole world (`continent/[name].tsx`) | The compact switch (Countries / Cities) and Explore's rows with your marks. `world` lists every country and the 100 largest cities. |
| A country (`country/[iso2].tsx`) | Laid out like a district's page: the photo (Esri's picture of the country when Wikidata has none), "Mark" (and "All districts" for Bangladesh), the facts, and its largest cities with your marks. |
| The full-screen district map | Unchanged. It's a full-screen picture viewer (zoom, save, share) with its own dark controls. It shares no cards or rows with the others. |

Flags stay emoji, as before. The old photo card (`PhotoCard.tsx`) is gone; nothing uses it now.

## 6. The server (small additions, with tests)

- **`GET /explore/bangladesh`** now also lists `destinations`: each place Vromon can plan, with the district it lies in.
  - It's matched by the district's outline (point in polygon).
  - A point just off a simplified coast falls back to the nearest district whose box holds it.
  - **On the real database, all 66 places land in a district:** 64 district towns, Kuakata in Patuakhali and Sreemangal in Moulvibazar.
  - A district's own page uses the same function, so the two can't disagree.
- **`GET /explore/districts/{slug}`:**
  - now returns all of the district's sights (before: 40 at most);
  - and the first 10 hotels (priced first, cheapest first) and the first 10 places to eat (new: `restaurants`).
- **`GET /explore/districts/{slug}/places?kind=accommodation|food&offset=&limit=`** (new) returns the rest page by page, with `total`, the same number as the district's count.
  - Places to eat are paged in the database: Dhaka alone has 1,986. A page takes 0.2 s.
  - Hotels (368 at most in one district) are sorted by their room rates first.
- The catalogue's `_service_places` takes an `offset`, with a stable order.

## 7. How it was checked

### On the phone (test account A, dev build)

| What | Result |
|---|---|
| Explore opens on Your country | Satellite picture of Bangladesh with "Satellite picture: Esri"; "You've been to 0 of 64 districts" (the account had no districts marked); Ready to plan; districts by division; GI foods; sources and credits at the end. |
| The world | "229 countries and territories · 7 continents", "You've been to 2", the globe; Asia outlined with "48 countries · 2 visited". Continent names were cut off on this 360 dp phone ("N. Ame…"); fixed by putting the count under the name and the flags (two for the longer names) beside it. |
| Search | "Bandar": Bandarban (Chattogram Division) first, then cities with their country and population. |
| A district with a photo (Bandarban) | Photo with its credit, "Plan a trip here", Mark, 38 / 46 / 9 / 7, the map with "Next to Chattogram, Cox's Bazar, Rangamati". The Stays count jumps to Stays. "Show 20 more" went from "10 of 46 shown" to "30 of 46 shown". |
| A district without a photo (Barguna) | Satellite picture, "স্যাটেলাইট ছবি: Esri", in Bangla at 1.6×. |
| Mark a district | Bandarban marked Visited: the button showed "✓ Visited", its card in Chattogram showed "✓ Visited", and the count went from 0 to 1 of 64. Then set back to "Not marked". |
| Dark and light | Both, against frames 22 and 23. |
| Bangla | Every half and the district page. Fixed on the phone: the Ready to plan cards showed English names and cut off their counts. |
| Largest text (1.6×) | Fixed on the phone: the large card's name was cut by "You can plan it" (now at the card's top corner at large text), small cards' counts were cut (now two lines), and continent names broke ("আফ্রি…"; the flags now keep their size and are left out at large text). After the fixes, nothing was cut. |

| Another home country | Test account A's home country set to Nepal in Settings: Explore showed Nepal's own satellite picture, "Capital Kathmandu · 29.2M people", "Mark the places you've been on the map", "Your travels here", "Nothing marked here yet", Nepal's 12 largest cities, "Facts about Nepal" and the sources. No districts, no Ready to plan. Then set back to Bangladesh (the server confirms `BD`). |
| Offline with saved data | The phone's route to the server removed, the app restarted: Explore opened from what it had saved, the satellite picture included. A district never opened before (Dhaka) said "Couldn't load this…" with "Try again" and the back button; with the server back, "Try again" loaded it. |

**Not on the phone:** a district Vromon can't plan. None exists in the real data, since all 64 districts have a place to plan. It's checked in Jest.

### Checks

| Check | Result |
|---|---|
| Backend `pytest -q` | 835 passed, 9 skipped (833 before; 2 new) |
| `npx tsc --noEmit` | clean |
| `npx eslint . --max-warnings 0` | clean |
| `npx jest` | 781 of 781 passed (768 before) |

**New tests:**
- **Backend, `test_explore_api.py`:**
  - places to plan are joined to their district (an inactive one isn't listed);
  - a district's hotels and places to eat come page by page: each once, the hidden ones never, the priced hotel first, the totals equal to the counts.
- **Jest, `explore.test.tsx` (11):**
  - a district's code;
  - the order of a division and of Ready to plan;
  - countries visited by continent;
  - the hero's picture covering Bangladesh;
  - the switch (remembered);
  - the hero's count changing when a district is marked;
  - your marks on the cards;
  - the world's count and continents;
  - another home country (Japan: no districts, its cities, your marks there);
  - a district's page with a photo (credit, counts, sections, Plan) and without one (Esri credit, nothing to plan, Mark shows Visited).
- **Updated:** `accountButton.test.tsx` (Explore now needs your marks); `contrast.test.ts` (the new colours).

## 8. New colours (`tokens.ts`, checked in `contrast.test.ts`)

| Token | Light | Dark | For |
|---|---|---|---|
| `segmentTrack` | `#E6EAF1` | `#1C2634` | the switch's track (frame 22) |
| `markTint` / `onMarkTint` | `#FFF1D9` / `#7A4300` | `#3D2A10` / `#FFC97A` | "Visited" and "Lived" as a chip; "· 2 visited" on a continent |
| `photoShade`, `onPhoto`, `onPhotoSecondary` | `#0F1B2D`, `#FFFFFF`, `#E3E9F2` | the same | the shade at a photo's foot and the words on it |
| `linkOnWhite` | `#1D4BB8` | the same | "Open the map" on its white button, in both appearances |

## 9. Where the mockups and the prompt differ, and my choices

- **"You can plan it" is only on the large card,** as in frame 23. The prompt asked for it on every card where a place lies, but all 64 districts now have one, so it would say the same thing on every card.
  - Your marks are on every card.
  - Screen readers hear "You can plan it" on every card that has a place to plan.
- **Ready to plan's order** is mine: the places you want to go first, then the most sights.
- **"Stays" counts every hotel in the district** (Bandarban: 46). New trip's "Where you'll stay" lists the hotels within 6 km of the place (step 11), so its numbers are smaller. Both are true, about different areas.
- **"Send to a friend"** sends the district's place to plan as a chat card (the chat's existing card). It isn't shown where there is nothing to plan.

## 10. Left open

- **Data:**
  - Chattogram's "photo" on Wikimedia is a map of the district, so its card shows a map.
  - Some photo credits are long sentences from Wikimedia ("Rocky Masum This work was made by…").
  - Sights' descriptions are English only (Wikidata), so they show only in English.
- **The phone** is left on the dev app, test account A, English, home country Bangladesh, the Map tab. It has dark mode on and text size 0.9, as I found it when I came back. I didn't set either; earlier I had switched it to light mode and 1.6× for these checks.

## Files

- **App:**
  - New: `src/features/explore/ExploreParts.tsx`, `YourCountry.tsx`, `TheWorld.tsx`, `MarkedHere.tsx`, `marks.ts`, `exploreState.ts`, `src/__tests__/explore.test.tsx`
  - Changed: `app/(tabs)/explore.tsx`, `app/explore/district/[slug].tsx`, `districts.tsx`, `continent/[name].tsx`, `country/[iso2].tsx`, `src/features/explore/api.ts`, `src/ui/SegmentedControl.tsx`, `src/ui/theme/tokens.ts`, `src/i18n/en.json`, `bn.json` (Explore's strings only; 16 old ones removed), `src/__tests__/contrast.test.ts`, `accountButton.test.tsx`
  - Removed: `src/features/explore/PhotoCard.tsx`
- **Backend:**
  - Changed: `app/api/v1/endpoints/explore.py`, `catalog.py`, `app/schemas/explore.py`, `tests/test_explore_api.py`
- `docs/ui-refresh/prompts.md` (the Status table), this report

## Git

Committed by the agent on `main`, ending with `Co-authored-by: mdsulaimanshakil <mdsulaimanshakil@gmail.com>`, with no Claude co-author line. Nothing was pushed.

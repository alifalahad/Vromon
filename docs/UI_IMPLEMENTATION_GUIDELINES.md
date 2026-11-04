# Vromon UI Implementation Guidelines (phased)

**Date:** 2026-11-05 · **Applies to:** `mobile/` (Expo / React Native) and the backend endpoints it needs.
**Goal:** a Bangladesh-first travel planner with its own professional identity, built on real, sourced data. The app must stop looking like a visited-countries tracker ("Been"-style) and stop depending on 11 hand-picked towns.

Work phase by phase. Each phase ends with tests, a check on the owner's phone (vivo V2425A, USB), screenshots in `docs/ui/phase-N/`, and a short report.

---

## 0. What is wrong today (audit, 2026-11-05)

| Problem the owner sees | Cause in the code |
|---|---|
| "Only 11 places / dummy data" | Trip planning reads the old `destinations` table (11 towns). The catalog has 1,005 approved attractions in 64 districts, but `publish places` only fills those 11 towns, so 657 approved places never reach the planner. Hotels and restaurants for most towns are still Wikivoyage samples or demo rows. |
| Esri map "not showing correctly", no satellite | `EXPO_PUBLIC_ESRI_API_KEY` is empty in `mobile/.env`, so the app falls back to OpenFreeMap and hides the Satellite button. The world map, friend map and theme previews don't use Esri at all yet. |
| No 3D district maps in the app | The 128 maps exist only as files in `data-platform/exports/maps/`. There is no endpoint or screen for them. |
| Onboarding asks "Where have you been?" | Step 3 (`app/onboarding.tsx`, `CountryMultiPicker`). Home is country only; there's no division or district. |
| The map doesn't show where I live or what I visited, by area | Visits are stored for countries, divisions (regions) and cities, not districts. Home isn't drawn on the map. |
| Looks like "Been" | The world-percentage headline, map themes, story/poster cards and stats-first home follow that app's pattern. |

---

## 1. Product direction and information architecture

**Positioning:** "Plan and record travel in Bangladesh, with real, checked information". Explore and plan come first; the travel map is one tab, not the identity.

**Tabs (bottom bar, 4):**

| Tab | Purpose | Replaces |
|---|---|---|
| **Explore** | Divisions → districts → attractions, foods and how to get there; search in Bangla and English | Part of today's map home |
| **Trips** | Plan, edit and follow trips (today's trip planner, redesigned) | Trips tab |
| **My map** | Home and visited areas, coloured by level (country → division → district) | World map home |
| **Profile** | Account, friends, settings, sources and licences | Profile and settings |

Friends and chat stay reachable from Trips (shared trips) and Profile. The badge goes on the tab, not on a floating dock.

---

## 2. Visual identity (the design system)

### 2.1 Principles
1. **Calm and editorial.** Content first, few colours, generous whitespace, no decorative gradients or glows.
2. **Trust is visible.** Every fact shows how sure it is (Verified / Official / Estimate / Unknown) in one consistent, small form.
3. **Minimal by default.** Show the 2–3 facts that matter; the rest is one tap away ("Details").
4. **Bangla is first-class.** Bangla typography, Bangla digits and dates in Bangla mode; never a mix within one line.
5. **Maps serve the task.** Clean basemap, our data on top, one accent colour for "you".

### 2.2 Tokens (`mobile/src/ui/theme`)

| Token | Light | Dark | Use |
|---|---|---|---|
| `brand` | `#0E6B5C` (river green) | `#3FB59E` | Primary actions, "you" on maps |
| `accent` | `#C8553D` (terracotta) | `#E07A5F` | One highlight per screen at most (e.g. today's stop) |
| `ink` / `textPrimary` | `#1C2321` | `#ECEFEE` | Body text |
| `textSecondary` | `#5B6663` | `#A5B0AD` | Labels, metadata |
| `surface` | `#FFFFFF` | `#161B1A` | Cards, sheets |
| `canvas` | `#F5F4F0` | `#0E1211` | Screen background |
| `line` | `#E3E1DA` | `#2A3130` | Dividers, 1 px |
| `status.verified` | `#2E7D32` | `#66BB6A` | Trust chip |
| `status.estimate` | `#B26A00` | `#FFB74D` | Trust chip |
| `status.unknown` | `#6B7280` | `#9CA3AF` | Trust chip |
| `water` | `#2F80C0` | `#64B5F6` | Rivers, boat legs |

Contrast is at least 4.5:1 for text (checked by a unit test over all text/background pairs).

**Typography:**
- English: **Inter**, 400/500/600.
- Bangla: **Noto Sans Bengali**, already shipped for maps (OFL).
- Scale: Display 28/34, Title 20/26, Body 16/24, Label 14/20, Caption 12/16.
- No more than 3 sizes per screen.

**Spacing:** 4 px grid; screen padding 20; card padding 16; list row height at least 56. **Radius:** 12 for cards, 20 for sheets, 999 for chips. **Elevation:** flat cards with a 1 px `line` border; shadows only on floating sheets.

**Icons:** one outline set (MaterialCommunityIcons outline variants), 20/24 px, never coloured except status.

**Motion:** 150–250 ms ease-out. Respect Reduce Motion (already supported).

### 2.3 Data presentation rules (everywhere)

| Data | Show | Never |
|---|---|---|
| A fact with a source | Value, plus a small trust chip ("Official", "Verified", "Estimate"). Tap the chip for source, licence and date. | A long source sentence under every value |
| Unknown | "Not known yet", greyed, with "Help us" when a correction flow exists | A guessed or default number |
| Fares | Amount, class, and fare type chip (Official / Regulated / Operator / Estimate), plus the checked date | One "cheapest fare" across different fare kinds |
| Times | Local time; "+1 day" for overnight; off day as a weekday chip | 24 h and 12 h mixed on one screen |
| Distances | "262 km by road" plus an "Estimate" chip; official chart km labelled "Official chart" | Calculated and official distances without labels |
| Numbers in Bangla mode | Bangla digits (০১২…), ৳ before the amount | Latin digits in Bangla text |
| Lists | Up to 5 items, then "See all (n)" | Endless lists on a summary screen |
| Empty states | One line saying why, plus one action | Illustration-only empty screens |

The components that enforce this (`TrustChip`, `FactRow`, `FareRow`, `TimeRange`, `EmptyState`) are built in Phase U0 and are the only way screens show these values.

---

## 3. Phases

### Phase U0: Foundations (design system and components)
- **Tokens:** replace the current palette and type ramp with §2.2 and keep the dark theme. Map-theme catalog colours move under My map only.
- **Components:** `Screen`, `Header`, `Card`, `ListRow`, `Chip`, `TrustChip`, `FactRow`, `FareRow`, `TimeRange`, `SegmentedTabs`, `Sheet`, `EmptyState`, `Skeleton`, `SearchField`, `Select` (searchable dropdown), `MapControls` (Map/Satellite toggle, locate, zoom to fit).
- **Tests:** a component gallery screen (dev only) for screenshots, unit tests for contrast and Bangla digits, and an ESLint rule that blocks raw colours and font sizes outside the theme.
- **Acceptance:** the gallery renders in both languages and themes on the phone; there are no raw colour literals in `src/features` (lint).

### Phase U1: Real data everywhere (backend + app)
- **Destinations = districts:**
  - The trip planner accepts any of the 64 districts (and later upazilas).
  - `POST /trips` takes `district_slug`. The planner reads attractions from the catalog (published, with location) instead of the 11-town `places` table, through an adapter that keeps the planner's internal interface unchanged.
  - The 11 old towns stay as aliases (Sreemangal → Moulvibazar district, Kuakata → Patuakhali district).
- **Search** across districts, upazilas and attractions, in Bangla and English (`/catalog/attractions?q=`, `/catalog/admin-units`).
- **Hotels and restaurants:**
  - Show only sourced rows, with a trust chip.
  - Where there are none, the plan says "Find food nearby" and offers no fake restaurant.
  - Remaining demo rows are hidden.
- **Planner fixes from the phone test:**
  - Pick meals near the surrounding stops, never across water.
  - Offer the boat as the faster choice where a road loops round the water.
  - Show boat legs in plan text for meal legs too.
- **Acceptance:**
  - A trip can be planned for any district with real attractions.
  - No demo data is visible.
  - A Maheshkhali day keeps lunch on the island.

### Phase U1b: Getting there from where you are (car, bus, train, plane, boat)

A trip starts where the traveller is and offers every way to get there that our data supports, each labelled by how sure it is. This replaces today's `getting_there`, whose fares come from formulas (bus = km × ৳3/50 km, train = ৳2.2/km, plane = ৳3,500 + ৳8/km). Those are invented fares, which guideline §2.2 forbids, so they are removed.

**Start point:**
- **"Use my current location"** asks for foreground location once. The trip keeps only the start district and a point rounded to about 1 km, never a GPS track (same privacy rule as Today mode).
- **"Choose a place"** offers a district, upazila, station, bus terminal or airport.

**Options, one card per mode,** all side by side and never merged into one "cheapest" number:

| Mode | Built from (our datasets) | Shows | When data is missing |
|---|---|---|---|
| **Car** | Road route from the start point to the destination (`journey_calculations`; OpenRouteService now, OSRM later) | Distance, driving time (Estimate chip), the route line on the map; ferries on the way if the route uses one | "No road route known" |
| **Bus** | Nearest bus terminals at both ends (`transport_hubs`), road time between them; BRTA regulated fare for the route (`fare_products`, fare type *Regulated*) | Departure and arrival terminals, road time (Estimate), regulated non-AC fare with the chart date | Fare: "Check with the bus company" (until the BRTA charts are transcribed) |
| **Train** | Stations near both ends (`transport_hubs`) and **direct services between them** in the published timetable (`train_services`); class fares from the official chart (`fare_products`, *Official*) | Train name and number, departure → arrival ("+1 day" when overnight), off day; **trains whose off day is the travel date are left out**; fares by class; "Book at eticket.railway.gov.bd" | "No direct train in the published timetable"; fares "Not published yet" |
| **Plane** | Airports near both ends (8 domestic airports with scheduled service) | Both airports, road time to and from them (Estimate), airline links | Schedule and fare: "Check with the airline" (not held: date-specific) |
| **Boat** | Ferry/launch ghats (`transport_hubs`) when the destination is across water | Ghats, water distance, estimated time | "Check the local schedule at the ghat" |

Every card also shows the short road legs **to** the station, terminal or airport and **from** it to the destination (Estimate), so the total door-to-door picture is visible.

**Choosing an option:**
- It becomes the trip's **"Getting there"** block, before day 1 starts, on the timeline and on the map: road legs solid, train legs as a rail line between stations, flights as an arc, boat legs dashed blue.
- The return journey is chosen the same way.
- The day plans that follow keep their road and boat legs (from the routing fix).

**Backend:** `GET /api/v1/journeys/options?from_lat=&from_lon=&to=<district>&date=` returns the cards above from `transport_hubs`, `train_services`, `fare_products` and the routing service. Each value carries its kind (Official / Regulated / Estimate / Not known), source and checked date. The `trips` table stores the chosen option (mode, hubs, service id if a train) and the rounded start point.

**Data gaps this phase must show honestly, not hide:**
- **Eastern-zone trains** (Dhaka ↔ Chattogram, Sylhet, Mymensingh …) are missing: the eastern timetable is a scanned PDF. Until it is transcribed, train cards for those routes say "Timetable not yet available".
- **Bus fares** await the BRTA chart transcription. Bus operators, AC fares and departure times need a partnership (Shohoz / BDTickets).
- **Flights:** airports only; no schedules or fares.
- **Multi-leg journeys** with a transfer (bus to Dhaka, then train to Sylhet) come after direct options work.

**Acceptance (on the phone):**
- From the phone's current location, a trip to Rajshahi or Dinajpur (western zone) shows car (road route), bus (terminals and fare status), train (real trains on that date, off-day trains removed), plane (airports, "check with the airline").
- Choosing the train adds it to the timeline and the map.
- A trip to Sylhet shows the eastern-timetable gap message instead of an invented train.
- No formula fare appears anywhere.

### Phase U2: Onboarding rewrite
- **Step 1:** username (as now).
- **Step 2, "Where's home?":** cascading selects:
  1. **Country** (searchable).
  2. If Bangladesh: **Division** → **District** → *(optional)* **Upazila**. Each list comes from `/catalog/admin-units?level=…&parent=…`, in the app language.
  3. Other countries: country only for now. Their regions come from `regions` later.
- **Delete step 3 "Where have you been?"** (`CountryMultiPicker` in onboarding). Visited places are added later from My map.
- **Backend:** `users.home_country_iso2` stays. Add `home_admin_unit_id` (the most specific unit chosen) with a migration (one nullable column). `PATCH /me` accepts it.
- **Acceptance:** sign-up on the phone takes 2 steps; the selects work in Bangla and English; home is saved and shown on Profile.

### Phase U3: My map (home and visits by level)
- **Basemap:** Esri (with key) streets / satellite toggle. Without a key: OpenFreeMap streets, and the toggle explains that satellite needs the Esri key.
- **Levels by zoom:**
  - **Zoomed out (world):** the home country filled in `brand`, visited countries in a lighter tint.
  - **Bangladesh view:** divisions. Home division is outlined and filled; visited divisions are tinted.
  - **Zoomed in:** districts, from the app's bundled `home-districts.json` and `/catalog/admin-units/{slug}?geometry=true`. Home district is filled; visited, planned and want-to-go districts are tinted by status.
- **Select:** tapping an area opens a sheet with its name, status (Home / Visited / Want / Planned), "Mark as…", and "Explore {district}".
- **Visits model:** add district visits (`place_type = 'district'`, code = admin-unit slug); division and country rollups are computed, not typed twice.
- **Legend:** one small legend (Home, Visited, Want, Planned).
- **Remove "Been"-style elements:** the "% of world" headline, poster and story cards move to Profile → Stats (optional, off the home screen).
- **Acceptance:** home shows correctly at all three zooms on the phone; marking a district visited colours it at once and rolls up to its division.

### Phase U4: Explore and district pages (with the 3D district map)
- **Explore home:**
  - Search.
  - A division strip.
  - "Popular districts", ranked by published attractions with evidence, not by guesses.
- **District page:**
  1. **Hero:** the district's 3D map image. Backend: serve `map_exports` (published) at `/catalog/maps/{district}?lang=bn|en` as an image from object storage or static files, with its credits. Tap for full screen, pinch to zoom, and the credits.
  2. **Facts:** division, area, neighbouring districts (tappable), each with a trust chip.
  3. **Attractions by category:** cards with a photo (licensed, with credit) or a category icon, name, upazila and trust chip; "See all".
  4. **Food:** GI-registered specialities with the "Official GI" chip.
  5. **Getting there:** from the user's home district, using `/catalog/journeys/plan`: road estimate, trains (official, with off days), airports and missing-data notes.
  6. **Plan a trip here:** the primary button.
- **Attraction page:** photo and credit, facts with trust chips (hours and fee usually "Not known yet"), map, "Add to trip", source list.
- **Acceptance:** all 64 district pages open on the phone with a map image, at least the published attractions, and sources.

### Phase U5: Trips redesign
- **Trip screen:**
  - Map on top (Esri streets / satellite).
  - A sheet with day tabs and a timeline of stops and legs.
  - Legs use `FareRow`/`TimeRange` and show mode icons (car, CNG, walk, **boat** with "check local schedule").
- **3D view:**
  - A "3D" toggle tilts the map (pitch 50°) and adds terrain hillshade, where the basemap supports it.
  - A true globe view comes when MapLibre's mobile globe ships, or by moving to Mapbox. That decision is recorded, not hidden.
- **Trip list:** cards with district, dates, travellers and a progress bar; no decorative artwork.
- **Acceptance:** the Cox's Bazar test trip shows road and boat legs consistently on the map and in the text; satellite works with the key.

### Phase U6: Polish, accessibility and QA
- Consistency audit against §2: spacing, sizes, chips, empty states.
- TalkBack pass and largest font size on every new screen; contrast test.
- Performance: cold start under 2.5 s; map at 60 fps on the vivo; images cached.
- Bangla copy reviewed by a person; one glossary for place and transport terms.
- Maestro flows updated: onboarding (2 steps), explore a district, plan a trip, mark a district visited.
- **Acceptance:** all flows pass on the phone; screenshots of every screen in both languages and themes in `docs/ui/phase-6/`.

---

## 4. Owner inputs needed

| Input | Needed for |
|---|---|
| **Esri API key** (ArcGIS Location Platform, free tier, *Basemaps* privilege only) in `mobile/.env` as `EXPO_PUBLIC_ESRI_API_KEY` | Esri streets and satellite (U3, U5) |
| Approve the identity in §2 (colours, fonts, tab structure), or name changes | U0 |
| Upazila in onboarding: optional or required? | U2 |
| Bangla copy reviewer | U6 |

## 5. Order and size

U0 → U1 → U1b → U2 → U3 → U4 → U5 → U6.
- **U1 and U1b** (real places, and getting there from your location by car, bus, train, plane and boat) are the core of the trip planner.
- **U2** (onboarding) is the quickest visible fix.
- **U4** brings the district maps into the app.

To make U1b complete, the data platform still needs:
1. The eastern-zone timetable transcribed.
2. The railway fare-chart station names transcribed.
3. The BRTA bus charts transcribed. Each phase is its own branch and commits, and nothing is merged without the phone check.

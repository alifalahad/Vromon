# Vromon Bangladesh Dataset Implementation Plan

**Written:** 2026-11-04 (updated the same day with the reference-site review, source catalog and world expansion)
**Based on:** [Vromon_Bangladesh_Data_Pipeline_Guideline.md](../Vromon_Bangladesh_Data_Pipeline_Guideline.md), a review of the current repository (branch `sulaiman`, commit `4564797`), the reference sites in §2a, and a first check of candidate sources (§5.0, §8).
**Status:** Proposal. The open decisions in §7 need answers before Phase 1 starts.

Every source named here is a **candidate to verify in Phase 0**. None counts as usable until a working download, API or document has been tested and its terms checked (guideline §4, §18). §5.0 records what the first check on 2026-11-04 actually confirmed.

---

## 1. What the guideline asks for

- **The goal is a trustworthy, source-traceable data platform, not a big record count.** "500 verified destinations beat 10,000 fabricated ones."
- **Twelve connected data domains.** Admin geography, destinations, media, transport hubs/operators/routes/services/schedules/fares, trains, road journeys, food, accommodation, facilities, RAG corpus, map layers.
- **One provenance model under all of it.** Source registry, immutable raw snapshots, staging, curated records, field-level source claims, a human review queue, versioned fares and timetables.
- **Two map products.** An interactive map, and 64 districts × 2 languages of static 3D maps generated from real GIS data.
- **A strict order.** Phase 0 (audit and source catalog) first, then stop for approval before Phase 1.

## 2. Where the repo stands against the guideline

| Area | What exists now | Gap |
|---|---|---|
| Database | SQLite in dev, PostgreSQL 16 + pgvector in Docker (`docker-compose.yml`), 19 Alembic migrations | No PostGIS. Integer primary keys. No provenance tables. |
| Admin geography | 8 divisions in `regions` (ISO `BD-A…BD-H`), geoBoundaries ADM1 (CC0) and ADM2 (CC BY 3.0 IGO, BBS/OCHA). 64 districts with official spellings and Bangla names in `BD_DISTRICTS` (`scripts/geo/prepare.py`). | Districts exist only as a simplified mobile GeoJSON, not in the database. No upazilas or unions. No boundary geometry stored. |
| Destinations | `destinations` = 11 *trip-base towns*. `places` holds 188 attractions, plus 21 restaurants and 27 hotels from Wikivoyage/Wikidata (`backend/app/services/destinations/importer.py`). There are `cost_known`/`hours_known`/`checked` flags. | The guideline's "destination" means an *attraction*, and our `destinations` means a *town*. Places aren't assigned to district or upazila. Provenance is one `sources_json` blob per destination, not per field. |
| Demo data | `data/seed/coxsbazar.json`: 25 places, 10 restaurants, 8 hotels, with illustrative ratings, review counts and hours | This breaks guideline §2.2. It must be classed as demo and kept out of the published catalog. |
| Defaults | `Place.rating` defaults to 4.0 and opening hours to 08:00–18:00 (the planner treats unknown hours as 09:00–17:00) | The database must store `null` plus a status. Planning defaults belong in the planner, not in stored data. |
| Transport | Local mode estimates in `backend/app/services/routing/modes.py` (rickshaw/CNG/car fares, labelled as estimates). Road times from ORS go into `route_cache`. | No hubs, operators, routes, services, schedules, fares or trains. |
| Road network | ORS free key. PROJECT_STATUS already says to replace it with self-hosted OSRM. | No network version recorded with calculations. |
| RAG | `source_documents` / `document_chunks`, embeddings stored as JSON | No license, publisher, published date, source FK or version on documents. |
| Maps | MapLibre on mobile, PMTiles, AWS Terrain Tiles hillshade, a credits policy in `docs/data-sources.md` | No district map pipeline. No map-layer registry. |

**Conclusion:** the geo build (`scripts/geo`) and the "unknown stays unknown" importer are good foundations to reuse. The new work is mostly the provenance layer, PostGIS, and every transport domain.

## 2a. What the reference sites show (reviewed 2026-11-04)

These sites were reviewed only to learn **which fields** a Bangladesh travel product needs. They are not sources: their data, text, images and maps must not be copied (guideline §4.3).

| Page | Fields it shows | Sources it cites |
|---|---|---|
| unseenbd.com/en/explore?district=… | Place name, district, category ("Rivers and haors", "History and heritage", "Places of worship"), short description, best months; filters by district, kind and month | None |
| unseenbd.com/en/routes | Per Dhaka→district row: road distance (km), number of direct trains, "from" fare | None on the index |
| unseenbd.com/en/route/dhaka-to-… | <ul><li>Distance with the road taken (e.g. "via Jamuna Bridge")</li><li>Per mode: duration, starting fare or "not known", and what the time covers</li><li>Bus: Dhaka departure points, arrival terminal, time range, fares by bus size and AC/non-AC, **fare basis** ("BRTA chart, non-AC, per seat" vs "set by the company"), operators and their bus types, route variants with towns passed and boarding points, last-checked date</li><li>Train: separate outbound and return tables (name, number, departure, arrival, duration, off day, fare)</li><li>Air: airports, flight time, daily flights, airlines, ground distance from the airport, last-checked date</li><li>Nearby places; where to buy tickets</li></ul> | RHD distance tool (gis.rhd.gov.bd/dmt), BRTA fare page (brta.gov.bd), news (bdnews24), airline schedule pages (US-Bangla, Novoair, Air Astra); tickets: eticket.railway.gov.bd, Shohoz, Biman, US-Bangla, Novoair |
| unseenbd.com/en/trains | Train name and number, origin and destination, direction, departure and arrival, daily or weekly off day | Mentions Bangladesh Railway; no timetable version or date |
| unseenbangladesh.com/bangladesh-maps | 64 district 3D maps in Bangla and English (sold); a 50-map thematic bundle (JPG + PDF, 2160×2700) | Bundle credits NASA, USGS, Copernicus, WorldClim, BBS, NOAA, JRC, WorldPop, OpenStreetMap. Personal-use terms; no resale or re-upload. |

**What this adds to our model:**
- **Two distances, kept apart.** The route page shows 263.1 km as the headline but says the BRTA chart gives 268 km for the same route. This is exactly the guideline §3.4 split: `official_chart_distance_km` (with its source) versus `calculated_distance_km` (with engine and network version).
- **Fare basis on every fare.** `fare_type` must separate `regulated` (BRTA chart, non-AC) from `operator_published` (AC, company-set). Store the bus size too, because BRTA fares differ by seat count (e.g. 51-seat vs 40-seat).
- **Route variants.** A route needs a `via` description, the ordered towns passed, and boarding points per operator (`transport_route_stops` plus `operator_boarding_points`).
- **Train directions.** Outbound and return are separate tables, which confirms one `train_services` row per direction.
- **Air legs.** Store `daily_frequency` per route and the ground distance from the airport to the destination, as a calculated journey leg.
- **Ticket sources.** A small `ticket_channels` table (mode, operator, official or partner, URL) lets the app say where to buy tickets without selling them.
- **A visible "last checked" date** on every mode block, which our `verified_at` / `last_checked` fields already cover.

## 3. Design decisions (recommended)

**D1. Build a new catalog next to the existing tables instead of repurposing them.**
- The new attraction table is called `attractions`, not `destinations`, which already means "trip town".
- A **publish adapter** projects approved attractions into the existing `places` table, so the trip planner, recommendations and mobile app keep working unchanged.
- The current 188 places are re-imported through the pipeline as claims with status `needs_review`.

**D2. Make PostGIS required for the data platform only.**
- Change the Docker database to a custom image (`FROM postgis/postgis:16-3.x` plus the `postgresql-16-pgvector` package), because no official image ships both. Supabase, the planned production database, supports both extensions.
- Geometry lives only in pipeline-owned tables. The app's existing tables keep their `lat`/`lon` floats, so the backend test suite can still run on SQLite.

**D3. Keep one migration history.**
- New tables go in `backend/alembic/versions/` and models in `backend/app/models/`.
- Pipeline code lives in a new top-level `data-platform/` package (`vromon_data`) that imports the backend models.
- The heavy GIS dependencies (geopandas, shapely, pyproj, rasterio, pyogrio, osmium, pdfplumber, rapidfuzz) go in `data-platform/pyproject.toml`, which keeps them out of the API's Docker image.

**D4. Use UUID primary keys for every new table.**
- Old tables keep their integer keys.
- External IDs (Wikidata QID, OSM `node/123`, geoBoundaries shapeID, HDX pcode, BBS geocode, ISO 3166-2) go in an `entity_external_ids` table.

**D5. Build curated values from claims.**
- Every fact enters as a `source_claims` row tagged with the job that created it.
- The curated record is the *resolved* view of accepted claims plus human decisions. Rollback = reject that job's claims and re-resolve.
- Per-field status (`verified` / `unknown` / `needs_verification` / `stale`) is stored in a `field_status` JSON column on the curated row. There is no single `verified=true` flag.

**D6. Keep raw files out of Git.**
- Raw files go in `data-platform/raw/` (git-ignored).
- Committed manifests record URL, fetch time, sha256 and a license snapshot.
- Raw files move to object storage (Supabase Storage or S3) later.

**D7. Design for the world now, fill Bangladesh first.** A few choices are cheap now and expensive to change later:
- `country_iso2` on every entity.
- Admin units by level, not by Bangladesh-specific tables.
- Names in an `entity_names` table (entity, language code, name, kind = official/common/alias/transliteration). `name_en` and `name_bn` stay as convenience columns for Bangladesh.
- A currency on every fare and an IANA time zone on every hub and schedule.
- A generic GTFS connector, since GTFS is how most of the world's transit schedules are published (§8).

### Suggested layout

```text
data-platform/
├── README.md
├── pyproject.toml
├── source-registry/
│   ├── sources.yaml
│   └── source-assessments/
├── schemas/                 # exported JSON Schemas
├── vromon_data/
│   ├── cli.py               # run / publish / rollback / report
│   ├── common/              # connector base, artifacts, jobs, claims
│   ├── connectors/          # geography, tourism, railway, bus, water, aviation, osm, wikidata
│   ├── normalization/
│   ├── matching/            # dedup, alias and transliteration keys
│   ├── validation/
│   ├── publish/             # claim resolution, adapter into places/hotels/restaurants
│   ├── geospatial/
│   └── map_generation/
├── raw/                     # git-ignored; manifests committed
├── processed/
├── exports/
└── tests/
```

## 4. The shared foundation: pipeline and provenance

### 4.1 Tables (built first; every domain depends on them)

| Table | Purpose |
|---|---|
| `data_sources` | The fields from guideline §4.4: access method, license, `terms_review_status`, `reliability_class`, freshness |
| `source_artifacts` | One immutable raw file or API response: URI, sha256, bytes, fetched_at, storage path, license snapshot |
| `ingestion_jobs` / `ingestion_job_errors` | Connector name and version, dry_run, status, start/end, counts (fetched, parsed, valid, rejected, duplicate, review) |
| `staging_records` | job_id, source_id, source_record_id, entity_type, raw JSON, normalized JSON, `record_hash`, validation errors, match status, target entity |
| `source_claims` | The guideline §6.2 fields plus `job_id` |
| `entity_external_ids` | (entity_type, entity_id, provider, external_id), unique per provider |
| `review_tasks` | Type (duplicate, coordinate conflict, missing district, fare conflict, schedule change, license, image match), payload, status, decision, reviewer, reason |
| `verification_events` | An audit log: who, when, old value, new value, source, reason |

### 4.2 Connector framework

- **Interface:** a `SourceConnector` base class with `discover`, `fetch(dry_run)`, `parse`, `normalize`, `validate`, `report` (guideline §5.3). One connector per source or source family.
- **CLI:**
  - `python -m vromon_data run <connector> [--dry-run] [--resume <job>]`
  - `python -m vromon_data publish <entity>`
  - `python -m vromon_data rollback <job>`
  - `python -m vromon_data report`
- **Change detection:**
  - Compare `record_hash` per `(source_id, source_record_id)` with the previous job, giving added, changed and removed events.
  - A record that disappears from a source creates a review task. It is never deleted.
- **Validation:** Pydantic models plus exported JSON Schemas, covering every rule in guideline §6.4:
  - coordinates inside the Bangladesh extent, with an island/offshore exception list (Saint Martin's, Nijhum Dwip, char areas)
  - the point must fall inside its district (PostGIS `ST_Contains`, with a buffer for coastal points)
  - fare ≥ 0 and a currency is present
  - effective-to ≥ effective-from
  - stop order is unique per service direction
  - Unicode NFC
  - blank, 0 and null are kept distinct
- **Review:**
  - Phases 1–2: a CLI that exports review CSVs and imports the decisions.
  - From Phase 2 on: a small admin-only web page behind the existing `ADMIN_TOKEN`.
  - Later: the full guideline §16 dashboard.

### 4.3 Matching and duplicate detection

- **Name keys are for matching only.** Display names are never changed.
  - Apply NFC, case-fold, and strip punctuation and generic words ("Beach"/"সৈকত", "Zila"/"জেলা", "Upazila"/"উপজেলা").
  - Add a Bangla↔Latin transliteration key (ICU `Bengali-Latin`) so "Shah Jalal Dargah" and "শাহজালাল দরগাহ" can match.
  - Keep ZWJ/ZWNJ in the stored text; they matter in Bangla.
- **Candidate rule:** same district, distance under a per-category threshold (about 300 m for a building, a few km for a forest or beach), name similarity from `pg_trgm` or rapidfuzz, and shared aliases.
- **Linking:**
  - An identical external ID (the same QID or OSM ID) links automatically.
  - **Everything else becomes a `review_tasks` row. Nothing merges automatically because names look similar.**

## 5. Dataset by dataset

### 5.0 Bangladesh source catalog (first check, 2026-11-04)

These are **original sources**: the office that creates or updates the data. Aggregators and travel sites are only for finding them.

"Checked" means the page was opened on 2026-11-04 and the listed content was seen. "Not reached" means automated access failed and the source must be checked by hand. Several `.gov.bd` sites failed with *"unable to verify the first certificate"*: they serve an incomplete TLS certificate chain. Connectors must fix this by adding the missing intermediate certificate to the trust store, **not** by turning TLS verification off.

| Data | Original source | What is there | Status | Terms | Planned use |
|---|---|---|---|---|---|
| Admin boundaries (division → union) | BBS, via HDX OCHA COD-AB `cod-ab-bgd` | ADM0–ADM3 (newest listing) or ADM0–ADM4 with unions (older listing), with pcodes | Listings seen; version and levels to confirm on HDX | CC BY IGO (to confirm) | Production geometry and codes |
| Admin boundaries | geoBoundaries BGD ADM1–ADM3 | Already used for ADM1/ADM2 | In use | CC0 / CC BY 3.0 IGO | Cross-check |
| **Tourist places (official)** | **64 district portals: `https://<district>.gov.bd/pages/tourist-spot`** (national portal platform; upazila portals likely the same) | One table per district: name, how to get there (যাতায়াত), on-site contact, location with upazila, photos, detail page. Gaibandha: 9 spots. | **Checked** (gaibandha.gov.bd) | Footer: "© সর্বস্বত্ব সংরক্ষিত" (all rights reserved); no reuse policy | **Ask a2i / Cabinet Division for written permission.** Until then: discovery and fact checking only (names, upazila); no copying of text or photos. |
| Lodging (official list) | District portals: "জেলায় রাত্রীযাপনের জন্য সরকারি ও বেসরকারি প্রতিষ্ঠান" page; Parjatan motels | Government and private lodging per district | District page **checked**; parjatan.gov.bd **not reached** | All rights reserved | Same as above |
| District heritage and foods | District portal "জেলার ঐতিহ্য"; DPDT Geographical Indication (GI) register | Heritage text; GI-registered products | Portal page seen; GI register to find | Portal: all rights reserved | Food-district links: GI register first, portal as evidence |
| Tourist places (national) | Bangladesh Tourism Board (tourismboard.gov.bd); Bangladesh Parjatan Corporation (parjatan.gov.bd) | Unknown | **Not reached** (certificate error) | Unknown | Check by hand in Phase 0 |
| Protected monuments, parks | Department of Archaeology; Forest Department (protected areas) | Gazette lists (PDF) | To find | Gazettes are public notices | Official category and status |
| **Train timetables** | **Bangladesh Railway, railway.gov.bd** → "ট্রেন সার্ভিস": all trains, Eastern zone, Western zone, international | Official schedules (Bangla) | **Checked**; site footer says it was updated 2026-11-04 | No terms page; a disclaimer only | Production source; parse, then review against the original |
| **Train fares** | railway.gov.bd → "টিকিটের মূল্য তালিকা" (Eastern, Western); reservation charge page | Official fare files per zone | **Checked** (file format to confirm) | As above | Production fares by class and segment |
| Train data (old) | data.gov.bd "Intercity Train Routes Bangladesh" | One PDF, modified 2017-01-18, license not specified | Checked | Not specified | **Do not use**: stale |
| Train tickets | eticket.railway.gov.bd (run by Shohoz) | Live seats and fares | Not tested | Ticketing terms | Link out only; no scraping |
| **Bus fares (regulated)** | BRTA (brta.gov.bd) route-wise fare chart; Road Transport and Highways Division gazette (per-km rate) | Non-AC regulated fare per seat by route, with route km. News reports a rate of Tk 2.40/km for inter-district routes from 22 Sep 2026; **confirm against the gazette**. | brta.gov.bd **not reached** (certificate); news seen | Gazette = public notice | Production `regulated` fares and official chart distances |
| Bus fares (AC, operators) | Operator websites; Shohoz, BDTickets | Operator-set fares, boarding points | No public API found | Platform terms | Partnership or manual capture with date |
| Road distance (official) | RHD Distance Matrix Tool, gis.rhd.gov.bd/dmt | Interactive start/via/end route tool | **Checked**; no API, download, version or terms shown | Unknown | Ask RHD for the distance table or road network; meanwhile `calculated` distances from OSRM on OSM |
| Launch and ferry | BIWTA (routes, per-km fare rate, special-service notices); BIWTC (ferries) | Notices, fare charts | Official chart not found online; news only | Unknown | Phase 0: find notices; operator confirmation |
| Domestic flights | US-Bangla (usbair.com/flight-schedule), Novoair (flynovoair.com flight schedules), Air Astra (TTInteractive timetable), Biman (biman-airlines.com) | Published schedules | Cited by the reference site; Biman returned **403** to automated access | Airline terms | Schedules with dates; fares link out only |
| Airports | CAAB; OurAirports (public domain) | Airport list, codes | To check | — | Hubs |
| Roads, rail lines, waterways, POIs | OpenStreetMap via the Geofabrik Bangladesh extract | Full map data, daily updates | Known | ODbL (share-alike) | Matching, hubs, routing, map layers |
| Places (open) | Wikidata (CC0); Overture Maps Places (CDLA-Permissive 2.0, with Foursquare rows under Apache 2.0; contains no OSM data) | Names, coordinates, categories | Overture license confirmed from its docs | As stated | Discovery and coordinates |
| Elevation | Copernicus DEM GLO-30; SRTM | DEM | To check | Free with attribution | Map terrain |

### How the data is collected (by type of source)

1. **Open datasets with files or APIs** (HDX, geoBoundaries, Geofabrik OSM, Wikidata, Overture, Copernicus): automated connectors, re-run on a schedule, with change detection.
2. **Official web pages and PDFs** (railway.gov.bd, BRTA, BIWTA, gazettes, district portals): a connector downloads the file and stores the raw snapshot. Parsing (pdfplumber, assisted by AI) produces `needs_review` records, and a person checks them against the original before publishing. Re-check on each notice.
3. **Permission requests** (a2i / Cabinet Division for the district portals, BRTA, BIWTA, RHD, Bangladesh Railway): a formal letter asking to reuse the data, ideally as a file. Official permission turns a "facts only" source into a production one.
4. **Partnerships** (Shohoz, BDTickets, airlines, launch operators): data feeds for operator fares and schedules that aren't published openly.
5. **Human confirmation**: a call or visit to an operator or site, recorded as a `verification_event` with date, person and method.
6. **User correction reports**: users flag errors in the app. Reports go to `review_tasks` and are never published directly.

### A. Administrative geography (Phase 1)

- **Tables:**
  - `admin_units`: level = country/division/district/upazila/union/paurashava/city_corporation/ward, parent_id, name_en, name_bn, slug, centroid, status, valid_from/valid_to
  - `admin_unit_aliases`
  - `admin_boundaries`: MultiPolygon in EPSG:4326 plus simplified variants, area in km² computed in a projected CRS, source artifact
  - codes stored in `entity_external_ids`
- **Sources:**
  - geoBoundaries ADM1–ADM3 (ADM1 and ADM2 are already used)
  - HDX / OCHA COD-AB Bangladesh, from BBS, with pcodes
  - BBS geocodes
  - Bangla names cross-checked against the district `.gov.bd` portals
- **Risks:**
  - Bangladesh officially has about 495 upazilas, but some datasets include city thanas and come out at 500+. The reconciliation needs explicit review.
  - Spelling conventions (Chattogram/Chittagong) become aliases, not separate records.
  - The existing `regions` codes `BD-A…H` must be linked so current visits keep their meaning.
- **Tests:**
  - Polygons are valid (repair with `ST_MakeValid` and log it).
  - No unexplained gaps or overlaps between districts.
  - Each district lies inside its division.
  - Exactly 8 divisions and 64 districts.
  - Neighbors come from `ST_Touches` and are checked for islands.

### B. Tourist attractions (Phase 2)

- **Tables:**
  - `attractions`: all the guideline §3.2 fields, with `division_id`/`district_id`/`upazila_id` and `location_precision`
  - `attraction_categories` plus translations
  - related tables: `attraction_aliases`, `attraction_amenities`, `attraction_facilities`, `attraction_seasonality`, `attraction_access_restrictions`, `attraction_relations`
- **Sources, in order of use:**
  1. Wikidata SPARQL (CC0): instances located in Bangladesh of attraction-type classes. Used for discovery, coordinates, aliases and official site links.
  2. OSM `tourism=*`, `historic=*`, `natural=*`, `leisure=park` from the Geofabrik Bangladesh extract (ODbL).
  3. Existing Wikivoyage listings (CC BY-SA). Any description text reused must stay attributed and share-alike.
  4. District and upazila portal pages (`/pages/tourist-spot`, see §5.0). This is the best official Bangla source and has the same table layout in every district, so one connector covers all 64. The portals say "all rights reserved", so until a2i / Cabinet Division gives permission it is used for discovery and fact checking only.
  5. Department of Archaeology protected-monument lists and Forest Department protected-area lists (gazettes/PDFs).
- **License flags to resolve:**
  - **OSM ODbL is share-alike for derived databases.** A published catalog that mixes in OSM data must be offered under ODbL.
  - **WDPA/Protected Planet restricts commercial use.** Don't use it without permission.
- **Pilot:** the same 4 districts as the map pilot (hill: Bandarban; coastal: Cox's Bazar, replacing the demo data; riverine: e.g. Barishal; flat: e.g. Rajshahi). Run the full cycle there, from fetch through review to publish, before scaling to all 64.
- **Descriptions:** use source text with attribution, or AI summaries labelled "summary of [source]" with status `ai_extracted_awaiting_review`. They are never published as verified facts.

### C. Media (Phase 2, alongside B)

- **Table:** `attraction_media`, with every guideline §8 field plus sha256 and `role` (primary/secondary/illustrative).
- **Sources:**
  - Wikimedia Commons, through the Wikidata `P18` image property and Commons categories, checking each file's own license.
  - Openverse for discovery only.
- **Rules:**
  - Nothing is displayed without a recorded license and author.
  - A low-confidence image match creates a review task.
  - AI artwork is flagged `illustrative` and never shown as a photo.

### D. Transport hubs and operators (Phase 4)

- **Tables:**
  - `transport_hubs`: type = bus_terminal/bus_stop/railway_station/airport/launch_terminal/ferry_ghat/boat_landing/local_stand, plus geometry and admin links
  - `transport_operators`
- **Sources:**
  - OSM: `railway=station`, `aeroway=aerodrome`, `amenity=bus_station`, `amenity=ferry_terminal`
  - Bangladesh Railway station list
  - CAAB airport list
  - BIWTA lists of river ports and ghats
- **Matching:** station names vary a lot (Kamalapur / Dhaka), so the alias and matching machinery from B applies.

### E. Trains (Phase 5)

- **Tables:**
  - `trains`: name in BN/EN
  - `train_services`: number and direction. **Each direction is its own row; schedules are never mirrored.**
  - `timetable_versions`: effective from/to, plus the source artifact
  - `service_stops`: sequence, arrival, departure, `day_offset` for overnight runs
  - `service_operating_days`: off day
  - fares held in the shared `transport_fare_products`
- **Source:** railway.gov.bd timetable pages (all trains, Eastern and Western zones, international) and fare files (Eastern and Western zones), plus notices. The data.gov.bd train PDF dates from 2017 and is not used.
  - Parse them with pdfplumber, assisted by AI table extraction.
  - Every extracted service gets status `needs_review` and is compared against the official PDF before publishing.
- **Fares:**
  - Use a class-wise segment fare when the official document gives one.
  - If only an official per-km tariff exists, store the result as fare type `calculated_from_official_tariff`. It is never shown as a published fare.
  - The e-ticket site is out of scope unless its terms allow access.

### F. Road network and journeys (Phase 6)

- **Tables:**
  - `road_network_versions`: the Geofabrik extract date plus sha256
  - `journey_calculations`: every guideline §3.4 field
- **Engine:** self-hosted OSRM or Valhalla on the Bangladesh extract. It replaces the ORS free key.
- **Approach:** compute a hub-to-hub matrix (OSRM `table`) and cache it with the network version. Recompute when the version changes. These are calculations with metadata, not 4,032 hand-stored facts.
- **Official distances are a separate field.** Route distances from the BRTA fare chart are stored as `official_chart_distance_km` with their source. An RHD distance table, if RHD provides one, is stored the same way. The app shows both with labels and never mixes them.
- **Existing cache:** `route_cache` gets `network_version` and `provider` columns so old results can be invalidated.

### G. Bus (Phase 6)

- **Tables:** `transport_routes`, `transport_route_stops`, `transport_services`, `transport_schedules`, `transport_fare_products`.
- **Fare products** carry `fare_type` (regulated / operator_published / platform_displayed / human_confirmed / historical / estimated), class, AC/non-AC, bus size (seat count), boarding point, effective dates and verification method.
- **Routes** carry a `via` description, the ordered towns passed, and per-operator boarding points (§2a).
- **Sources:**
  - BRTA fare-rate gazette notifications. These are per-km regulated rates, so any figure derived from them is labelled "regulated rate × official distance".
  - Operator websites: captured by hand, with dates.
  - Ticket platforms only with an agreement.
- **Existing estimates:** the rickshaw/CNG figures in `modes.py` are recorded as `fare_type=estimated`, which matches what the app already shows.

### H. Water transport (Phase 6)

- **Sources:** BIWTA launch routes and timetables, BIWTC ferry routes, operator confirmation.
- **Seasonality:** monsoon suspensions, and government visitor limits on routes such as Saint Martin's. These go in `transport_schedules.seasonal_status` and `attraction_access_restrictions`, with effective dates.
- **Fares:** by cabin or deck class, with effective period.

### I. Air (Phase 6)

- **Stored:** airports (from D), domestic routes with `daily_frequency`, and published schedules from Biman, US-Bangla, Novoair and Air Astra (§5.0), each with a checked date. The ground leg from the airport to the destination is a calculated journey segment.
- **Not stored:** search prices are never stored as fares. At most, a dated `platform_displayed` snapshot if terms allow; otherwise a "check with airline" link.

### J. Food, accommodation, facilities (Phase 8)

- **Food:**
  - `local_foods` plus `food_place_associations`, and every association needs a source.
  - Strong official source: the Geographical Indication (GI) register of the Department of Patents, Designs and Trademarks.
  - District portals list famous foods, but those go through review.
- **Accommodation and restaurants:** these map onto the existing `hotels`/`restaurants` tables through the same publish adapter. Sources are OSM plus Wikivoyage, with `verified_at` dates.
- **Facilities:** OSM (hospital, pharmacy, ATM, police), the DGHS health facility registry, and tourist police contacts. Phone numbers get verification dates.

### K. RAG corpus (Phase 9)

- **Changes:** extend `source_documents` with `source_id`, publisher, `published_at`, `retrieved_at`, license, language, version and `superseded_by`. Every chunk inherits that metadata.
- **On Postgres:** switch the embeddings to a pgvector column.
- **Rule:** fares and schedules are answered from SQL, never from chunks. The answer builder must prefer structured facts and show the source of any conflict.

### L. Map layers and district maps (Phase 3 pilot, Phase 7 for all 64)

- **Tables:**
  - `map_layers`: the guideline §7.5 fields
  - `map_exports`: district, language, all input layer and dataset versions, render config hash, credits
- **Inputs:**
  - **DEM:** Copernicus DEM GLO-30 (free with attribution), with SRTM as a fallback. One version recorded per export.
  - **Rivers:** OSM waterways, cross-checked with BWDB / HydroRIVERS.
  - **Roads and rail:** OSM.
  - **Destinations and foods:** curated records only.
- **Tooling:** QGIS/PyQGIS layouts. The deciding reason is Bangla text: QGIS shapes Bangla correctly through HarfBuzz, and matplotlib does not. Hillshade comes from GDAL, plus restrained extrusion. Flat districts get a 2.5D look, never invented relief.
- **Interactive map:** reuse MapLibre and PMTiles, which the mobile app already uses. Districts and attractions are added as tile layers built from curated data.

## 6. Phase sequence

| # | Phase | Main outputs | Gate before moving on |
|---|---|---|---|
| 0 | Audit and source discovery | `docs/REPOSITORY_AUDIT.md`, `docs/SOURCE_CATALOG.md`, `docs/DATA_GAP_ANALYSIS.md`, `data-platform/source-registry/sources.yaml`, `docs/PHASE_1_PLAN.md`. Every source above tested for real access and terms. | Owner approval. Unclear licenses listed. |
| 1 | Foundation and geography | PostGIS image; provenance tables (§4.1); `data-platform/` skeleton with CLI, dry-run and rollback; admin units for division, district and upazila; data dictionary; tests | 8/64/~495 units traceable to a named source, geometry checks pass, re-run makes no duplicates |
| 2 | Attractions pilot (4 districts) | Wikidata and OSM connectors; re-import of the existing 188 places; dedup and review; publish adapter into `places`; media | Every published record has a claim trail; the app still works; demo Cox's Bazar data replaced |
| 3 | Map pilot (can run in parallel with 2) | DEM and river layers, QGIS templates, 8 pilot maps, credits | Map can be regenerated from versioned inputs |
| 2b | Attractions for all 64 districts | Scaled ingestion, coverage report | Coverage shown with verification status, not just counts |
| 4 | Hubs and operators | Hub DB, hub search API | Every hub has a source |
| 5 | Trains | Versioned timetables, class fares, train API and UI data | Sampled against official PDFs |
| 6 | Road, bus, water, air | OSRM, journey cache, fare products by type | Estimates never shown as confirmed |
| 7 | All district maps | 64 maps, up to 128 language variants, regeneration command | Only reviewed labels |
| 8 | Food, accommodation, facilities | GI-backed foods, facilities | Each record has a review path |
| 9 | RAG and journey planner | SQL-first answers, multi-mode journeys | No invented answers when data is missing |
| 10 | Operations | Scheduled checks, stale alerts, weekly quality report, backups | Team can run it without manual re-imports |
| 11 | World expansion (§8) | Admin units and attractions per country from open sources; GTFS transit; airports; flight schedules through a licensed provider | Same quality gates as Bangladesh, country by country |

### First concrete tasks

1. Write the Phase 0 documents. Most of the repository audit is in §2 above.
2. Write a source probe script that tests each candidate URL or API and records the result in `sources.yaml`.
3. Build the PostGIS Docker image and check that pgvector still loads.
4. Add the provenance migration (§4.1).
5. Build the admin geography connector, reusing the downloads in `scripts/geo/build.sh`.

## 7. Open decisions

1. **Naming:** add a new `attractions` catalog that feeds `places`, instead of changing `destinations`?
2. **PostGIS:** switch the Docker database image and require PostgreSQL for the pipeline, with SQLite kept for app tests?
3. **OSM share-alike:** a published catalog that mixes in OSM data must be shared under ODbL. Accept this, or keep OSM to matching and enrichment only?
4. **Pilot districts:** Bandarban, Cox's Bazar, Barishal and Rajshahi, or others?
5. **Reviewers:** nothing is published without a person approving it. Who works the review queue, and how much time can they give? That sets the real pace more than the code does.
6. **Permission letters:** who sends the requests to a2i / Cabinet Division (district portals), BRTA, BIWTA, RHD and Bangladesh Railway? These requests decide whether the best official Bangladesh sources can be used in production.
7. **Partnerships:** contact Shohoz / BDTickets / airlines for fare and schedule feeds, or show only official regulated fares plus "check with operator"?
8. **World budget:** worldwide flight schedules and fares are paid data (§8). Is there a budget, or does world expansion start with places and public transit only?

## 8. World expansion: sources (Phase 11)

Same rules as Bangladesh: original sources, recorded licenses, nothing invented. Global sources come first because they cover every country with one connector each. National sources (tourism boards, rail operators) are added country by country.

| Data | Source | Coverage | License / access | Notes |
|---|---|---|---|---|
| Admin boundaries | geoBoundaries; HDX COD-AB (where available); Natural Earth (already used) | Global | Mostly open (license per country) | **Avoid GADM**: non-commercial license |
| Attractions and POIs | Wikidata | Global | CC0 | Best for identity, aliases in many languages, coordinates, official site links |
| Attractions and POIs | OpenStreetMap (Geofabrik regional extracts) | Global, updated daily | ODbL (share-alike) | Same share-alike question as decision 3 |
| Places | Overture Maps Places | Global; Meta ~60M rows, Foursquare ~3.8M (Oct 2026 docs) | CDLA-Permissive 2.0; Foursquare rows Apache 2.0 with NOTICE | Contains no OSM data, so no share-alike |
| Travel text | Wikivoyage (dumps) | Global | CC BY-SA | Text must stay attributed and share-alike |
| World Heritage sites | UNESCO World Heritage List (whc.unesco.org data) | Global | Check UNESCO terms | Authoritative status and IDs |
| Cities, populations | GeoNames (already used) | Global | CC BY 4.0 | — |
| Photos | Wikimedia Commons | Global | Per-file license | Same rules as §5 C |
| Public transit, rail, bus, ferry schedules | Mobility Database (MobilityData): ~6,000 GTFS / GTFS-Realtime / GBFS feeds in 99+ countries, checked daily; Transitland | Strong in Europe, the Americas and parts of Asia; thin in South Asia | License per feed | One generic GTFS connector covers them all |
| Airports | OurAirports | Global | Public domain | Codes, coordinates, runways |
| Flight schedules | Licensed providers (e.g. OAG, Cirium; cheaper APIs such as AeroDataBox, AirLabs) | Global | Paid | **Amadeus Self-Service APIs were shut down on 17 Jul 2026**; only Amadeus Enterprise remains |
| Flight fares | Booking or affiliate APIs (e.g. Duffel, Skyscanner / Travelpayouts affiliate programs) | Global | Commercial terms | Date-specific: show live with the search date, never store as a fixed fare |
| Road routing | OSRM / Valhalla on OSM regions | Global | ODbL data | A planet-wide engine is heavy; run it per region |
| Elevation | Copernicus DEM GLO-30 | Global | Free with attribution | — |

**Order for the world:** places and admin units first (all open), then public transit through GTFS, then flights through a paid provider if the budget allows. Intercity bus and boat data outside GTFS is national and comes country by country.

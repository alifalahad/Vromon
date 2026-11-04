# Data Platform Progress

Phase reports in the guideline's format (§17). The plan is in `docs/DATASET_IMPLEMENTATION_PLAN.md`; the tables are described in `docs/DATA_DICTIONARY.md`.

---

## Phase 0: audit and source discovery (2026-11-04) ✅

Deliverables:
- `docs/REPOSITORY_AUDIT.md`
- `docs/SOURCE_CATALOG.md`
- `docs/DATA_GAP_ANALYSIS.md`
- `docs/PHASE_1_PLAN.md`
- `data-platform/source-registry/sources.yaml`: 31 sources
- `probe-results.json`: 33 of 37 URLs reachable; every source's status is backed by a live probe

Findings:
- **Bangladesh Railway** publishes timetable no. 54 (in effect since 10 Mar 2025) and fare charts as PDFs.
- **BRTA** published its fare chart as PDFs in Aug 2026.
- **All 64 district portals** list tourist spots, but they are all rights reserved.
- **HDX** downloads sit behind a bot challenge, which the pipeline doesn't bypass.
- **Wikimedia** requires contact details in the User-Agent; this was set up with the owner's consent.

## Phase 1: foundation and administrative geography (2026-11-04) ✅

**Implemented:**
- The `data-platform/` package with:
  - a connector contract
  - a job runner: dry run, change detection, removed records sent to review, failed runs rolled back
  - raw snapshots with sha256 manifests
  - source claims and claim resolution
  - rollback, review queue and audit log
  - quality report and CLI
- Migration `0020`, which adds 13 new tables and changes no existing ones.

**Sources accessed:**
- geoBoundaries API and files (release `9469f09`)
- the repo's curated name tables
- 72 `.gov.bd` portal home pages, used for their titles only

**Counts:**

| | Fetched | Accepted | Rejected | Review |
|---|---|---|---|---|
| Divisions | 8 | 8 | 0 | 0 |
| Districts | 64 | 64 | 0 | 0 (25 geometry questions resolved, see below) |
| Sub-districts | 544 | 544 | 0 | 0 |
| Bangla names (divisions + districts) | 72 | 71 verified | 0 | 1 (Rangamati: portal says "রাঙ্গামাটি পার্বত্য") |

**Geometry checks:** 0 km² of overlaps and 0 km² of gaps for districts against divisions and for sub-districts against districts. The neighbour relation is symmetric (328 pairs) and every district has a neighbour. The full report is at `data-platform/quality-reports/geography-2026-11-04.*`.

**Finding and fix:** geoBoundaries ADM1 (2015, Wikimedia Commons) doesn't line up with ADM2 (2020, BBS/OCHA). 25 districts sat only 69–95% inside their division, and 4,748 km² inside the divisions belonged to no district.
- All 64 division memberships were checked by name (Barishal 6, Chattogram 11, Dhaka 13, Khulna 10, Mymensingh 4, Rajshahi 8, Rangpur 8, Sylhet 4).
- Division outlines are now the union of their districts.

**Still unavailable:**
- Bangla names for the 544 sub-districts.
- Whether each sub-district is an upazila or a city thana; geoBoundaries doesn't say. HDX COD-AB has this, but its download needs a person (`vromon_data artifact add`).

**Tests:** 26 data-platform tests and 6 catalog API tests. Backend suite: **713 passed, 10 skipped** (baseline 707).

## Phase 2: attraction pilot (2026-11-04) ✅ (awaiting review)

**Implemented:**
- Attraction catalog: migration `0021` (`attraction_categories`, `attractions`, `attraction_media`).
- Connectors:
  - `wikidata_attractions`: per-district SPARQL; district and sub-district set by point-in-polygon; gazetteer noise filtered out.
  - `commons_media`: Commons photos with their licences.
- Name matching across scripts and spellings: Bangla↔Latin transliteration, generic place words, place types, location suffixes.
- Duplicate detection, which opens review tasks and never merges.
- Spreadsheet review (`review export` / `review import`).
- Publish adapter into `places`. Loader rows are protected, Cox's Bazar's demo places are hidden once replacements are approved, and a place is hidden when its attraction is unpublished.
- Attraction quality report.
- Read-only API `/api/v1/catalog/*`, which serves only published records and gives the source of every field.

**Sources accessed:**
- Wikidata SPARQL (4 districts)
- Commons API
- the four pilot districts' portal tourist-spot lists, all pages, used for names as review evidence

**Counts (pilot: Bandarban, Cox's Bazar, Barishal, Rajshahi):**

| | Bandarban | Cox's Bazar | Barishal | Rajshahi | Total |
|---|---|---|---|---|---|
| Candidates awaiting review | 59 | 41 | 15 | 27 | **142** |
| Licensed photos | 21 | 18 | 11 | 21 | 71 |
| No Bangla name | 33 | 12 | 2 | 3 | 50 |
| Official portal spots | 17 | 15 | 24 | 9 | 65 |

- **Skipped:** 48 Wikidata items with no English or Bangla name, and 2 unnamed gazetteer peaks.
- **Review tasks: 189 open.** 142 new attractions, 39 points near a district border, 7 possible duplicates, and 1 name conflict.
- **Published: 0.** Every record waits for a person, as the guideline requires.

**Coverage gap:** many official portal spots are missing from Wikidata or spelled differently, for example Nilachal, Nilgiri, Boga Lake / Bagakain Lake, and several Barishal zamindar houses and temples. They're listed per district in `quality-reports/attractions-2026-11-04.md` for a person to add or match.

**Licence notes:**
- Portal text and photos are not copied; only names are compared.
- Wikidata facts are CC0.
- Photos are linked to Commons with their own licence and credit.

**Next step for the owner:** review `data-platform/exports/pilot-review-2026-11-04.csv` (fill in `decision` and `reason`), then:

```
python -m vromon_data review import exports/pilot-review-2026-11-04.csv --reviewer "<name>"
python -m vromon_data publish places
```

## Phase 4: transport hubs (2026-11-04) ✅

**Implemented:** migration `0022` (new tables only):
- `transport_operators`, `transport_hubs`
- `timetable_versions`, `trains`, `train_services`, `service_stops`
- `fare_products`, `journey_calculations`

**Connectors:** `ourairports_bd`, `osm_hubs_bd` (Overpass).

**Counts:**

| Hub type | Count |
|---|---|
| Railway stations | 493 |
| Railway halts | 5 |
| Bus terminals | 659 |
| Ferry/launch terminals | 253 |
| Airports | **8** (matches the 8 domestic airports on Novoair's schedule page) |

- 713 hubs have a Bangla name.
- 52 hubs near a district border went to review.
- 422 OSM objects were skipped because they had no name or type.

**Licence:** OSM (ODbL) is used for hubs by the owner's decision; every hub carries its source and reliability class in `field_status`. Airports come from OurAirports (public domain).

**Known limitation:** OSM often maps one station twice (as a node and as an area). Timetable matching treats candidates within 1 km as one station.

## Phase 5: trains (2026-11-04) ✅ (awaiting sample check)

**Implemented:**
- `vromon_data.pdftext`, a decoder for Bangla government PDFs whose fonts lack a Unicode map. It reverses the font's own GSUB rules (ligatures, phala and reph forms) and restores Unicode order. On the western timetable it leaves **0 undecoded glyphs**.
- `bd_railway_timetable`: the official timetable pages give the version (**time table no. 54, in effect 2025-03-10**) and link the PDFs.
- `bd_railway_fares_east`: the eastern fare chart.

**Counts:**
- **Western zone:** 174 train services (one per direction, as printed), with number, name, off day and times; overnight arrivals are flagged.
  - 89 services are linked to station hubs at both ends.
  - 10 printed station names are unmatched (2 are in India).
  - 1 row was unparsed and 3 were rejected by validation.
- **Eastern zone timetable:** a **scanned image**. It needs OCR or transcription, and nothing was guessed.
- **Eastern fare chart:** 364 station pairs, **4,004 class-wise fares** (8 plain classes; snigdha, AC seat and AC berth with VAT), each with the official distance.
  - Station names are printed in a legacy font encoding, so 167 names wait for a person to transcribe them in `source-registry/bd-railway-fare-station-names.csv`.
  - 204 printed totals differ from fare + VAT by rounding; they're kept as printed, with a note.
- **Western fare chart:** a scanned image (needs transcription).

**Review:**
- `timetable_sample`: 12 rows to compare with the PDF. Approving it publishes the version.
- `unmatched_station`: each unmatched name comes with suggested hubs.
- `transcription`: the station-name file for the fare chart.

**API:** `/api/v1/catalog/hubs`, `/catalog/trains`, `/catalog/fares`, serving published records only.

## Phase 6: road, bus, air, water (2026-11-04) 🟡 (partly blocked, see below)

**Road (done):**
- `district_journeys_ors`: **4,032 district pairs, 3,906 routable** via openrouteservice. Each is stored with engine, profile, network description and date, and always flagged as an estimate.
- The district point is its most populous GeoNames town; 6 districts use their bus terminal instead.
- 126 pairs ORS can't route stay unknown.
- **Check:** Dhaka → Gaibandha comes out at **262.5 km**, against the reference site's 263.1 km (calculated) and BRTA's chart figure of 268 km (official). The two kinds stay separate (`journey_calculations.distance_km` vs `fare_products.official_distance_km`).

**Bus (blocked on transcription):** all four BRTA fare-chart PDFs (Aug 2026) are **scanned images**.
- `transcribed_fares` imports rows a person types from a chart (`vromon_data fares template`), as `regulated` fares with chart URL, page and transcriber, and status `needs_review`.
- AC and operator fares have no open source (partnership needed).

**Air (blocked):** US-Bangla and Novoair schedule pages load their data in the browser from a search form; no static schedule exists and their terms don't cover automated use.
- Airports are hubs.
- Schedules need a partnership or a licensed provider.
- Fares are date-specific, so they're link-out only.

**Water (blocked):** no BIWTA launch timetable or fare chart was found online; the BIWTA site has notices only. The same transcription importer works for launch charts.

## Phase 3: district map pilot (2026-11-04) ✅ (awaiting owner check)

**Implemented:**
- The `vromon_data.maps` renderer: real DEM hillshade with restrained exaggeration, OSM rivers, neighbours from adjacency, published attractions only (plus a watermarked draft for reviewers), and a legend, scale bar, north arrow, credits and version.
- Bangla labels shaped with HarfBuzz.
- A credits JSON and a `map_exports` row for every image (migration `0023`).

Details are in `docs/MAP_PIPELINE.md`.

**Pilot:** Bandarban (hill), Cox's Bazar (coastal), Barishal (riverine), Rajshahi (flat), in Bangla and English, plus Bangla drafts.

**Checking the map found a real data bug:** Wikidata peaks in Myanmar and India had been placed in the nearest Bangladesh district.
- Points more than about 1 km outside every district are now excluded: 22 attractions, plus hubs on the same rule.
- The 20 such records already imported went to review; none were deleted.

## Phase 7: all district maps (2026-11-04) 🟡 running

- `maps render --all` is rendering 64 districts × 2 languages in the background (`data-platform/exports/maps-all.log`).
- Every export stays `needs_review` until the owner approves the pilot.

## Phase 8: food, accommodation, facilities (2026-11-04) 🟡

**Done: GI register.** `dpdt_gi_register` imports the official DPDT list of registered Geographical Indications: **67 products, 48 food or agricultural**.
- 50 are linked to a district by the product's own name (e.g. রাজবাড়ীর ক্ষীর চমচম → Rajbari) and published.
- 8 are linked only through the applicant and wait for review.
- 9 are national.
- API: `/api/v1/catalog/foods`.

**Not done:**
- **Accommodation and restaurants:** the only official lists (district portal lodging pages) are all rights reserved, so this needs the a2i permission. The existing Wikivoyage listings stay as they are.
- **Facilities** (hospitals, police, ATMs): OSM is possible (the same hub pattern) but not imported in this pass.

## Phase 9: RAG, search and journey planner (2026-11-04) ✅

- **Journey planner:** `/api/v1/catalog/journeys/plan?from=&to=` returns, per mode:
  - the road estimate (engine, profile, network, date)
  - published direct trains between the two districts' stations
  - the airports, with "check with the airline" for schedules
  - published fares by type
  - a `missing` list for every gap

  Nothing is merged into one unexplained number.
- **RAG documents** now record publisher, licence, data source, retrieval date, language and version (migration `0023`, nullable columns on `source_documents`).
- **Questions about fares or timetables** get a warning that these come from the dated, versioned tables, not from passages.
- **Search** in Bangla and English across attractions and hubs (`q=`).

## Phase 10: operations (2026-11-04) ✅

- `source-registry/schedule.yaml` sets each connector's freshness window and stale limits.
- `ops due` / `ops run-due` run what's due; one failure doesn't stop the rest.
- `ops stale` marks published fares older than 120 days and timetables older than 365 days as `stale`, which the API stops serving.
- `ops weekly` writes `quality-reports/weekly-<date>.md`.
- `ops backup` makes a consistent SQLite copy plus the manifests and registry.
- `scripts/data-platform/run-scheduled.ps1` is for Windows Task Scheduler. The runbook (procedures, failure handling, restore) is `docs/OPERATIONS_RUNBOOK.md`.

# Phase 1 Plan: foundation and administrative geography

**Date:** 2026-11-04. Follows `docs/DATASET_IMPLEMENTATION_PLAN.md` §4 and §5 A.

## Decisions taken (owner, 2026-11-04)

| # | Decision |
|---|---|
| 1 | New catalog tables (`attractions`, …) beside the existing ones; a publish adapter feeds `places`. `destinations` keeps its meaning. |
| 2 | **PostGIS deferred.** Docker's engine is not running on the dev machine, and the app's tests run on SQLite. Geometry is stored as GeoJSON text (simplified, with the tolerance recorded) plus a reference to the raw file. Spatial work uses shapely in the pipeline. The tables are designed so a PostGIS geometry column can be added later without changing IDs. |
| 3 | OSM is used for matching, hubs, routing and maps only; published attraction facts come from Wikidata and official sources. |
| 4 | Pilot districts: Bandarban (hill), Cox's Bazar (coastal/island), Barishal (riverine), Rajshahi (flat). |
| 5 | Cox's Bazar demo places are replaced after the new records are reviewed. |
| 6 | Wikimedia User-Agent contact comes from `VROMON_BOT_CONTACT` in the git-ignored `data-platform/.env`. |

## Findings that shape Phase 1

- **HDX COD-AB downloads are behind an AWS WAF challenge** (`x-amzn-waf-action: challenge`). The pipeline does not bypass it. A manual-file import path (`vromon_data artifact add`) lets a person download the file in a browser and import it with full provenance.
- **geoBoundaries** (GitHub raw, open) gives ADM1 8, ADM2 64, ADM3 544. The ADM3 file has no parent field, so each unit's district is assigned spatially.
- **All 64 district portals** were found at `https://<name>.gov.bd/`. Their page titles give the official Bangla district name, which is the evidence for `name_bn` claims (a name is a fact, not copyrighted text). Bangla names are compared after Unicode NFC, which decomposes ড় and য়.

## Build list

1. **Migration `0020`** adds these tables:
   - provenance: `data_sources`, `source_artifacts`, `ingestion_jobs`, `ingestion_job_errors`, `staging_records`, `source_claims`, `entity_external_ids`, `review_tasks`, `verification_events`, `entity_names`
   - geography: `admin_units`, `admin_boundaries`, `admin_adjacency`

   Only new tables are added; nothing existing changes.
2. **`data-platform/vromon_data`** contains:
   - the connector base and job runner: dry-run, change detection, claims, rollback
   - an artifact store with sha256 manifests
   - registry sync
   - claim resolution
   - the CLI
3. **Connectors:**
   - `geoboundaries_bgd`: divisions, districts, sub-districts
   - `bd_district_portals`: official Bangla district names and the portal directory
   - `hdx_cod_ab_bgd`: reads a manually downloaded file when one is present
4. **Checks:**
   - geometry valid (repaired and logged when not)
   - counts of 8 / 64 / 544
   - every district inside its division and every sub-district inside a district
   - district gaps and overlaps measured
   - adjacency from shared borders
   - Unicode NFC
   - re-run makes no duplicates
   - dry run writes nothing
   - rollback restores the previous state
5. **Link** the existing `regions` (`BD-A…BD-H`) through `entity_external_ids` (provider `iso3166-2`).

## Acceptance

- The administrative hierarchy is traceable to named sources with licences.
- It passes the geometry checks.
- Re-running is safe.
- The backend test suite still passes.

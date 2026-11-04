# Data Dictionary (data platform)

Tables written by `data-platform/` (models: `backend/app/models/catalog.py`). Existing app tables are described in `docs/architecture.md`.
This file grows with each phase.

## Status values

| Where | Values |
|---|---|
| Entity `status` | `imported`, `needs_review`, `published`, `rejected`, `inactive` (guideline §6.1; `stale` and `disputed` arrive with fares and timetables) |
| `field_status[field].status` | `verified` (a claim was checked: official portal match, human review), `imported` (accepted claim, not checked), `needs_review` (only proposed claims), `unknown` (no source says) |
| Claim `status` | `proposed`, `accepted`, `rejected`, `superseded` |
| Review task `status` | `open`, `approved`, `rejected`, `deferred`, `superseded` (no longer raised by a later run) |
| Job `status` | `running`, `succeeded`, `failed`, `rolled_back` (dry runs leave no job) |

## Provenance

| Table | Key columns | Notes |
|---|---|---|
| `data_sources` | `source_id` PK, licence, `terms_review_status`, `reliability_class`, `recommended_use`, `fetch_policy` | Mirror of `source-registry/sources.yaml` (`vromon_data registry sync`) |
| `source_artifacts` | `id`, `source_id`, `uri`, `sha256` (unique per source), `storage_path`, `fetched_at`, `license_snapshot` | File under `data-platform/raw/`; manifest line in `data-platform/manifests/<source>.jsonl` |
| `ingestion_jobs` | `id`, `connector`, `connector_version`, `status`, `counts`, `started_at`, `finished_at` | One per real run |
| `ingestion_job_errors` | `job_id`, `stage`, `source_record_id`, `message` | |
| `staging_records` | `source_id`, `entity_type`, `source_record_id`, `record_hash`, `raw`, `normalized`, `change`, `status`, `target_entity_id` | `change`: added / changed / unchanged against the last successful run |
| `source_claims` | `entity_type`, `entity_id`, `field_name`, `claimed_value` (`{"v": …}`), `source_id`, `retrieved_at`, `verified_at`, `verification_method`, `confidence`, `status`, `job_id` | Curated value = best accepted claim (reliability class, then most recent) |
| `entity_external_ids` | `entity_type`, `provider`, `external_id` (unique), `entity_id` | Providers so far: `geoboundaries`, `iso3166-2` |
| `entity_names` | `entity_type`, `entity_id`, `lang`, `name`, `kind`, `match_key` | Kinds: `official`, `alias`, `official_portal_title` |
| `review_tasks` | `task_type`, `entity_id`, `payload`, `priority`, `status`, `reviewer`, `reason` | `vromon_data review list / decide` |
| `verification_events` | `entity_id`, `field_name`, `old_value`, `new_value`, `method`, `reviewer`, `reason` | Audit log |

## Administrative geography

| Table | Column | Meaning |
|---|---|---|
| `admin_units` | `id` | UUID, stable |
| | `country_iso2` | `BD` |
| | `level` | `division`, `district`, `subdistrict` (upazila or city thana; the source doesn't distinguish) |
| | `parent_id` | Division for a district, district for a sub-district (largest area overlap) |
| | `name_en` | Official spelling (vromon_curated) for divisions and districts; geoBoundaries name for sub-districts |
| | `name_bn` | Divisions and districts: verified against portal titles (71 of 72; Rangamati under review). Sub-districts: unknown for now |
| | `slug` | `bd-division-<name>`, `bd-district-<name>`, `bd-<district>-<name>`; never changes once set |
| | `centroid_lat`, `centroid_lon` | Centroid, or a point inside the shape when the centroid falls outside |
| | `area_km2` | Geodesic area (WGS84) |
| | `field_status` | Per-field source and status |
| `admin_boundaries` | `geometry_geojson` | Simplified (0.0005° ≈ 50 m), EPSG:4326. Full geometry: `artifact_id` + `feature_ref` (`union:ADM2:<id>` for divisions) |
| | `is_current`, `was_repaired` | Older boundaries are kept, not current |
| `admin_adjacency` | `unit_id`, `neighbor_id`, `shared_border_km`, `method` | Both directions stored; corner touches under 50 m excluded |

## Sources of the current geography (2026-11-04)

- **geoBoundaries gbOpen BGD**, release commit `9469f09`.
  - ADM2 (CC BY 3.0 IGO, from BBS/OCHA): the 64 districts.
  - ADM3 (CC BY 3.0 IGO, from BBS/OCHA): the 544 sub-districts.
  - ADM1 (CC0): membership and ISO codes only, because its 2015 outlines don't match the 2020 districts.
- **Division outlines** are the union of each division's districts.
- **Names:** official spellings and Bangla from `vromon_curated`, with the Bangla checked against 72 `.gov.bd` portal titles.

# Vromon data platform

The pipeline that builds Vromon's source-traceable Bangladesh travel data: source registry, connectors, raw snapshots, claims, review, publishing.
Plan: `docs/DATASET_IMPLEMENTATION_PLAN.md`. Rules: `Vromon_Bangladesh_Data_Pipeline_Guideline.md`.

## Set up (Windows, from the repository root)

```powershell
py -3.11 -m venv data-platform\.venv
data-platform\.venv\Scripts\python -m pip install -e backend -e data-platform
```

Put the contact sent to Wikimedia in `data-platform/.env`, which is git-ignored:

```
VROMON_BOT_CONTACT=you@example.org
```

The pipeline uses the app's database (backend `DATABASE_URL`, default `backend/vromon.db`). Override it with `VROMON_DATABASE_URL`.

## Commands (run in `data-platform/`)

```powershell
.venv\Scripts\python -m vromon_data registry check      # validate sources.yaml
.venv\Scripts\python -m vromon_data probe               # test every source URL
.venv\Scripts\python -m vromon_data db migrate          # schema to the latest migration
.venv\Scripts\python -m vromon_data registry sync       # sources.yaml -> data_sources
.venv\Scripts\python -m vromon_data run --list
.venv\Scripts\python -m vromon_data run geoboundaries_bgd --dry-run
.venv\Scripts\python -m vromon_data run geoboundaries_bgd
.venv\Scripts\python -m vromon_data run vromon_admin_names
.venv\Scripts\python -m vromon_data run bd_portal_names
.venv\Scripts\python -m vromon_data report geography
.venv\Scripts\python -m vromon_data jobs
.venv\Scripts\python -m vromon_data review list
.venv\Scripts\python -m vromon_data review decide <task-id> approve --reviewer NAME --reason "…"
.venv\Scripts\python -m vromon_data rollback <job-id> --reason "…"
.venv\Scripts\python -m pytest tests
```

## How a run works

1. `fetch` saves each file the source returns, unchanged, under `raw/<source>/<date>/`. Its checksum goes in `manifests/<source>.jsonl`.
2. `parse` and `normalize` turn the file into records.
3. `validate` either rejects a record or sends it to review.
4. Each record is compared with the last successful run: added, changed or unchanged. Records that have disappeared become review tasks and are never deleted.
5. Records are matched to existing entities by an identical external ID only. Similar names are never enough.
6. Every field becomes a **claim** with its source and dates. The curated value is the best accepted claim, and `field_status` says where it came from.
7. `--dry-run` does everything and then rolls back. A failed run is rolled back and logged. `rollback <job>` undoes one import.

## Access rules

- **Web pages:** robots.txt is obeyed, with at least 2 seconds between requests to a host.
- **Documented APIs and bulk downloads** (`fetch_policy: usage_policy`): the provider's usage policy applies.
- **TLS:** always verified, using the operating system's certificate store (needed for `.gov.bd` certificate chains).
- **No bypassing:** challenges, logins and paywalls are never bypassed. HDX's download challenge is handled by a person downloading the file in a browser.

## The places index (`overture_pois`)

Every kind of place in Bangladesh but hotels and restaurants (colleges, schools, hospitals, banks, markets, offices,
places of worship…) from Overture Maps, for "search anything" near a trip's stops (docs/trip-upgrades, steps 5–6).
Kinds come from the backend's `app/core/poi-kinds.yaml` (search reads the same file). Each run downloads the latest release (one DuckDB query on
Overture's open S3, about 2 minutes), keeps the parquet in `raw/` with its manifest, and replaces the index's
Overture rows in one transaction:

```bash
.venv/bin/python -m vromon_data db migrate
.venv/bin/python -m vromon_data run overture_pois                 # the latest release
.venv/bin/python -m vromon_data run overture_pois --params '{"release": "2026-10-21.0", "parquet": "path/to/saved.parquet"}'
```

Run it on a copy of the database first (`VROMON_DATABASE_URL=sqlite:////path/to/copy.db`), then back up the real one.
The quality report of the first load is `quality-reports/pois-2026-11-13.md`.

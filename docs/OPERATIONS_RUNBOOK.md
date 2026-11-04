# Data Platform Operations Runbook

For whoever keeps Vromon's data current. Commands run in `data-platform/` with its venv (`.venv\Scripts\python -m vromon_data …`). Setup is in `data-platform/README.md`.

## Every day: scheduled runs

`scripts/data-platform/run-scheduled.ps1` runs these steps:

1. **`ops run-due`** runs every connector whose last success is older than `source-registry/schedule.yaml` allows. A failed connector is recorded and the others still run.
2. **`ops stale`** marks published fares and timetables that are past their check window as `stale`. The API then stops serving them as current.
3. **`ops weekly`** writes `quality-reports/weekly-<date>.md` (on Mondays).

Register it once with Windows Task Scheduler (daily, 03:00):

```powershell
schtasks /Create /TN "Vromon data" /SC DAILY /ST 03:00 /TR "powershell -NoProfile -ExecutionPolicy Bypass -File E:\Vromon\scripts\data-platform\run-scheduled.ps1"
```

On Linux or a server, use cron:

```
0 3 * * * cd /srv/vromon/data-platform && .venv/bin/python -m vromon_data ops run-due && .venv/bin/python -m vromon_data ops stale
```

## Every week: read the report and work the review queue

1. Open `quality-reports/weekly-<date>.md` and look at failed jobs, open reviews, due connectors, and sources never fetched.
2. Export the review queue, decide each row, and import it:

   ```
   review export exports/review.csv
   review import exports/review.csv --reviewer "<name>"
   ```

3. Publish approved attractions into the app with `publish places`.

## When a run goes wrong

| Symptom | What to do |
|---|---|
| A job `failed` | `jobs` shows the error. Curated data is untouched, because a failed run rolls back. Fix the cause and re-run. |
| A bad import got through | `rollback <job-id> --reason "…"` rejects its claims, restores the previous values and keeps the history |
| Overpass 429/502 | The public server is busy. The map renderer retries with back-off and otherwise leaves rivers out with a note. Re-run later. |
| Wikimedia 403 | `VROMON_BOT_CONTACT` is missing from `data-platform/.env` |
| `.gov.bd` certificate error | Python's own certificates are being used instead of the OS store. Check that `truststore` is installed. Never turn verification off. |
| HDX download blocked | It's a bot challenge. Download the file in a browser, then run `artifact add hdx_cod_ab_bgd <file>`. |
| Many `source_record_removed` reviews | A source dropped records. Check them before rejecting anything; nothing has been deleted. |

## Backups and restore

**Backup:** `ops backup` copies the database (a consistent SQLite online backup, safe while the app runs), the manifests and the registry to `data-platform/backups/<time>/`. Copy that folder off the machine.

Raw snapshots (`data-platform/raw/`) can be fetched again from their manifest URLs. Keep a copy of them too, because sources change.

**PostgreSQL:**

```
pg_dump --format=custom --file vromon-$(date +%F).dump "$DATABASE_URL"
```

**Restore (SQLite):**
1. Stop the backend.
2. Replace `backend/vromon.db` with `backups/<time>/vromon.db`.
3. Start the backend. Migrations run at startup.

**Restore (PostgreSQL):**

```
pg_restore --clean --dbname "$DATABASE_URL" vromon-<date>.dump
```

After a restore, run `report geography` and `ops weekly` to confirm the counts.

## Owner actions that unblock data

| Action | Unblocks |
|---|---|
| Review `exports/pilot-review-*.csv` | 142 pilot attractions; Cox's Bazar demo data gets replaced |
| Approve the `timetable_sample` task (12 rows against the PDF) | 174 western-zone train services |
| Transcribe `source-registry/bd-railway-fare-station-names.csv` | 4,004 eastern-zone train fares |
| Transcribe the BRTA charts (`fares template`) | Regulated bus fares |
| Letter to a2i / Cabinet Division | Reuse of district portal tourist-spot, lodging and heritage data |
| Ask RHD for its distance table; BIWTA for launch charts | Official road distances; launch fares |
| Approve the district map pilot | Publishing the 128 district maps |

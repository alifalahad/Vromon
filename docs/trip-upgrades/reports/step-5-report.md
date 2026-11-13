# Step 5 report: data, an index of every kind of place in Bangladesh

**Date:** 2026-11-13. **Status:** built, tested, run on a copy of the database (twice), then on the real one after a backup. **179,490 places** loaded; the spot check found **20 of 20** known places.

## What changed

| Where | Change |
|---|---|
| Data platform | `duckdb` added to `pyproject.toml` and installed in `.venv` (2.0.0). |
| Data | Migration `0033_poi_index` and its model `PoiIndex` (`app/models/catalog.py`). Columns: `id` (Overture's), `source`, `name`, `name_bn`, `category` (Overture's), `kind` (Vromon's word), `lat`, `lon`, `district_id` (admin unit), `confidence`, `name_key`, `updated_at`. Indexes: (district, kind), `name_key`, source. Never edited by the API. |
| Kinds | `data-platform/source-registry/poi-kinds.yaml` maps all 247 Overture categories of this release to 42 friendly kinds. **Categories:** college, school, madrasa, hospital, clinic, diagnostic, pharmacy, bank, ATM, market, shopping mall, mosque, temple, church, pagoda, park, government office, police, post office, bus station, train station, airport, ferry terminal (ghat), fuel… **Words:** each kind has English and Bangla words for step 6 ("college", "কলেজ", "bazar", "হাট", "atm"). **Name words** make a generic category specific: "Govt. Brajalal College" under place_of_learning → college, "বড় বাজার" under shopping → market. A hospital in the name beats a school or college category. Lodging and food are skipped (the catalog has them, reviewed). |
| Connector | `vromon_data/connectors/overture_pois.py`, source `overture_pois` in `sources.yaml` (CDLA-Permissive-2.0; OpenStreetMap-derived rows ODbL). **Download:** one DuckDB query on Overture's open S3 for the Bangladesh box, confidence ≥ 0.4. The parquet is kept in `raw/` with its manifest. **Each place gets:** the district (a new fast `AdminLookup.district_of`), the kind, `name_key` (`text.match_key`) and the Bangla name from Overture's common names. **Dropped:** places outside Bangladesh and closed ones. **Duplicates:** the same place listed twice at about the same spot is kept once. **Writing:** a run replaces the source's rows in its transaction; a failure rolls back and the old rows stay. Records aren't staged one by one (it would add hundreds of megabytes); the job, the artifact and the counts are the provenance. |
| App | The credit in Settings → Licences & data: "Places to search near your stops (colleges, markets, offices…): © OpenStreetMap contributors, Overture Maps Foundation (CDLA-Permissive-2.0)", in English and Bangla. |
| Docs | `data-platform/README.md` (how to run it), `data-platform/quality-reports/pois-2026-11-13.md`. |

**Files:**
- Backend: `alembic/versions/20261112_0033_poi_index.py`, `app/models/{catalog,__init__}.py`.
- Data platform: `pyproject.toml`, `source-registry/{sources.yaml,poi-kinds.yaml}`, `vromon_data/connectors/{overture_pois.py,__init__.py}`, `vromon_data/admin_lookup.py`, `tests/test_overture_pois.py`, `README.md`, `quality-reports/pois-2026-11-13.md`, `manifests/overture_pois.jsonl`.
- App: `mobile/src/i18n/{en,bn}.json`.

## How it was checked

**Tests:**
- Data platform `pytest`: **61 passed** (6 new). They use a small fixture parquet and cover:
  - kinds from categories and from name words, a hospital beating a school, and lodging and food skipped;
  - districts, Bangla names and dropped duplicates;
  - low confidence, closed and outside Bangladesh all skipped;
  - unmapped categories listed;
  - the raw file and its manifest kept;
  - a rerun replacing the rows;
  - a failed run leaving the old rows.
- Backend `pytest -q`: **792 passed, 9 skipped** (the migration test included).

**Runs:**
1. **On a copy of your database:** loaded 179,490 places in about 30 s (peak memory about 400 MB). The first try failed safely: the copy wasn't migrated yet, and the run rolled back as designed.
2. **A rerun on the copy:** the same 179,490 rows; the rows were replaced and the stored download reused.
3. **The real database:** backup `backend/vromon-backup-2026-11-13-before-poi-index.db` (ignored by git), then `db migrate` and the run (job `d5913432…`). Same counts.

| | |
|---|---|
| Overture rows in the box (confidence ≥ 0.4) | 413,636 |
| Outside Bangladesh / lodging and food / duplicates / closed | 186,013 / 47,963 / 166 / 4 |
| **Loaded** | **179,490** (41,541 with a Bangla name) |
| Database size | 293.7 MB → 368.0 MB (**+74 MB**) |
| Districts with places | all 64 (Dhaka 74,743 … Magura 268); Khulna 3,491, Bagerhat 846, Sylhet 6,058, Cox's Bazar 2,519 |

**By kind (largest):** shop 27,281, office 25,853, service 16,568, school 14,993, college 10,186, education 8,126, historic site 6,910, government office 6,755, other 6,745, community 5,702, hospital 5,254, clinic 5,084, bank 4,665, market 3,046, shopping mall 2,599, mosque 2,374, madrasa 2,308, pharmacy 2,053. The full table is in the quality report.

**Spot check, 20 known places: all found, in their districts.**

| Khulna | Dhaka | Sylhet |
|---|---|---|
| Govt. Brajalal College (college) | University of Dhaka (college) | Sylhet MAG Osmani Medical College (college, and its hospital) |
| Khulna University (college) | Dhaka Medical College Hospital (hospital) | Shahjalal University of Science and Technology (college) |
| KUET (college) | BUET (college) | Dargah of Hazrat Shahjalal (place of worship) |
| Khulna Medical College & Hospital (hospital) | Baitul Mukarram National Mosque (mosque) | Osmani International Airport (airport) |
| New Market Khulna (shopping mall) | Kamalapur Railway Station (train station) | |
| Khulna Railway Station (train station) | Bangladesh National Museum (museum) | |
| Sonadanga Bus Stand (bus station) | | |
| Khulna Zilla School (school) | | |
| Shahid Hadis Park (as "Shahid Hadis Park Pond", historic site) | | |
| Rupsha Bridge (bridge) | | |

## Differences from the prompt, and why
- **Overture's schema changed:** this release has `taxonomy` instead of `categories`. The connector reads `basic_category`, which both have. The existing hotel/restaurant connector also uses `basic_category`, so it still works.
- **No per-record staging:** the pipeline normally keeps a staging row per record. For 180,000 places that's hundreds of megabytes of JSON, so this connector loads in bulk. Each run still has its job, counts, stored download, manifest and rollback.
- **Name words and "beats" in the kinds file:** the categories alone put most bazars under "shopping" and many colleges under "place of learning". Words in the name fix those.

## Left open (for step 6 and later)
- **Parts of big places are listed separately** ("Department of History, Government Brajalal College", "Hall, Khulna University."). Search should rank the main name first.
- **Some kinds follow Overture's category, not common sense:** "Shahid Hadis Park Pond" is a historic site, and one "Rupsha Bridge" listing is a park. Listings aren't checked by a person.
- **Rerunning for a new Overture release:** `vromon_data run overture_pois` takes about 2 minutes to download, then 30 s. Monthly would do; there's no schedule entry yet.
- **The phone's dev app is still signed in as test account A.** Nothing in this step needs the phone.

## Git commands for the owner
```bash
cd ~/Codes/Vromon
git add -A
git commit -m "Trip upgrades step 5: an index of every kind of place in Bangladesh (Overture Maps)"
git push origin main
```
The raw Overture download (`data-platform/raw/`) and the database (`backend/vromon.db`, its backups) aren't in git; only the manifest line (`data-platform/manifests/overture_pois.jsonl`) and the quality report are. On another computer, run `vromon_data db migrate` and `vromon_data run overture_pois` to build the index there. Steps 1–4 aren't committed yet either; this one commit holds steps 1–5.

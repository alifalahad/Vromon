# Step 5: Data, an index of every kind of place in Bangladesh

**Goal:** a searchable index of colleges, schools, offices, banks, markets, hospitals, places of worship and so on (everything except hotels and restaurants, which the catalog already has, reviewed), loaded by the data platform, so step 6 can find "BL College" in Khulna.
**Depends on:** step 0 (D10). Independent of steps 1–4.

## Prompt

```
Follow docs/trip-upgrades: features.md F5, design.md §2 (0033) and §6 "Step 5: data", decision D10, rules.md
(data platform runs on a copy first, then a backup, then the real database).

1. data-platform/pyproject.toml: add duckdb (the Overture connectors import it). Install into data-platform/.venv.
2. Migration 0033_poi_index (backend/alembic) and its model. Migration test.
3. data-platform/source-registry/poi-kinds.yaml: Overture categories → a friendly kind, with English and Bangla words
   (college_university → college: "college", "university", "কলেজ", "বিশ্ববিদ্যালয়"; hospital; clinic; pharmacy;
   school; bank; atm; market (bazar, হাট, বাজার); shopping_mall; mosque; temple; church; pagoda; park; government
   office; bus station; ferry terminal; police; post office; …). List the unmapped categories in the run report,
   and give them kind "other".
4. Connector vromon_data/connectors/overture_pois.py (sources.yaml entry, licence CDLA-Permissive-2.0 with an ODbL
   note): like service_places' Overture download, but all categories except lodging and food, inside Bangladesh,
   confidence ≥ 0.4. It saves the raw parquet and its manifest, then loads poi_index:
   - district via admin_lookup.py;
   - kind from the YAML;
   - name_key via text.match_key;
   - name_bn from Overture's common names when there's a Bangla one.
   Reruns replace the source's rows in one transaction (rollback on failure, as other connectors do). Tests with a
   small fixture parquet: mapping, district, dedup, rerun.
5. Run it on a copy of the database first. Then:
   - check counts by kind and by district;
   - look for 20 known places (e.g. BL College, Khulna University, Khulna Medical College Hospital, New Market
     Khulna, Dhaka University, Sylhet MAG Osmani Medical College…) and note found / not found and its kind;
   - check the database size before and after.
   If it's fine, back up the real database and run it there.
6. Quality report: data-platform/quality-reports/pois-YYYY-MM-DD.md (counts, the spot check, size, unmapped
   categories). Add the credit line to the app's sources list ("© OpenStreetMap contributors, Overture Maps
   Foundation") where other data credits are shown.

Write reports/step-5-report.md, update the Status table, give the git commands (and note that raw data and the
database aren't in git), stop.
```

## Done when
- `poi_index` holds the places, with sensible kinds, and the spot check finds most of the 20 known places.
- The data platform's tests pass, and the run is repeatable.

## The owner checks
- The report's spot check: are your test places there (colleges, markets you know in Khulna)?

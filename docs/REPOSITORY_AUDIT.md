# Repository Audit (data platform, Phase 0)

**Date:** 2026-11-04 · **Branch:** `sulaiman` · **Commit audited:** `4564797`
**Scope:** what exists today that the Bangladesh data pipeline (guideline: `Vromon_Bangladesh_Data_Pipeline_Guideline.md`) must reuse, protect or replace.

## 1. Stack

| Part | Technology | Notes |
|---|---|---|
| API | Python 3.11, FastAPI, SQLAlchemy 2, Pydantic 2 | `backend/`; endpoints under `/api/v1` |
| Database | SQLite (dev, `backend/vromon.db`), PostgreSQL 16 + pgvector (Docker, production plan: Supabase) | 19 Alembic migrations (`0001`–`0019`), run at startup by `app/db/migrations.py` |
| Mobile | Expo / React Native, MapLibre, PMTiles | `mobile/`; Bangla and English UI |
| RAG | Own chunker, embeddings (Gemini), retrieval, grounded generation | Vectors stored as JSON text |
| Routing | OpenRouteService (free key) + `route_cache` | Straight-line fallback |
| Tests | pytest | Baseline on 2026-11-04: **707 passed, 10 skipped** (`backend/`, 3 min 35 s) |

Docker is installed on this machine but its engine was not running during the audit, so PostGIS could not be used locally (see `docs/PHASE_1_PLAN.md`).

## 2. Existing data, classified

| Data | Where | Records | Class | Evidence |
|---|---|---|---|---|
| Countries, regions, cities | `data/geo/*.json` → `countries`, `regions`, `cities` | 195+ countries; BD 8 divisions; GeoNames cities ≥ 15k | **Sourced** | `docs/data-sources.md` (Natural Earth, geoBoundaries ADM1 CC0, GeoNames CC BY 4.0) |
| Bangladesh districts (shapes) | `mobile/assets/geo/home-districts.json` | 64 | **Sourced** (simplified 1 %) | geoBoundaries ADM2, CC BY 3.0 IGO; official spellings and Bangla names in `scripts/geo/prepare.py` `BD_DISTRICTS` |
| 10 imported destinations | `data/destinations/*.json` → `destinations`, `places`, `restaurants`, `hotels` | 188 places, 21 restaurants, 27 hotels | **Sourced, unverified** (`checked: false`) | Wikivoyage (CC BY-SA 4.0) and Wikidata (CC0), fetched 2026-10-19; unknown prices/hours kept unknown |
| Cox's Bazar | `data/seed/coxsbazar.json` | 25 places, 10 restaurants, 8 hotels | **Demo** | File says "illustrative and not independently verified"; ratings and review counts are invented |
| Local transport fares | `backend/app/services/routing/modes.py` | 3 fare formulas (rickshaw, CNG, car) | **Estimate** | Labelled as estimates in the app |
| Road times | `route_cache` | runtime cache | **Calculated** | ORS, no network version recorded |
| RAG documents | `source_documents`, `document_chunks` | runtime | **Mixed** | No licence or publisher fields |

## 3. Features the pipeline touches

- **Trip planner** reads `destinations` (11 trip towns) and `places.destination_name`. It must keep working, so the new catalog feeds `places` through a publish adapter (plan D1); `destinations` keeps its meaning.
- **Planner defaults**: `Place.rating` defaults to 4.0 and hours to 08:00–18:00, but `rating_known` / `hours_known` / `cost_known` flags already mark unknowns. The adapter writes `False` for these when the catalog has no value.
- **Map home** uses `regions` codes `BD-A…BD-H`; new admin units link to them through `entity_external_ids` (provider `iso3166-2`), so existing visits keep their meaning.
- **Destination importer** (`backend/app/services/destinations/importer.py`) already follows "unknown stays unknown"; its Wikivoyage parser is reused.

## 4. What the pipeline must not do

- Drop or rename existing tables or columns.
- Change `destinations` semantics.
- Publish anything without a source claim and an approved review.
- Touch user data (trips, visits, chat, photos).

## 5. Gaps (summary; detail in `docs/DATA_GAP_ANALYSIS.md`)

No provenance tables, no admin units below division in the database, no attraction catalog with district/upazila, no transport network, no trains, no fares, no map-layer registry, no source fields on RAG documents.

# Vromon — Architecture

**As built, end of Phase 11 (2026-10-12).**

## Overview

```
┌──────────────────────── Mobile app (Expo / React Native) ────────────────────────┐
│ Wizard (RHF+Zod) · Trips · Trip detail · Itinerary (day tabs, map, budget)        │
│ TanStack Query cache  ──►  typed Axios client (src/services/api.ts)               │
└───────────────────────────────────────┬───────────────────────────────────────────┘
                                        │ HTTP JSON  /api/v1
┌───────────────────────────────────────▼──────────── Backend (FastAPI) ───────────┐
│ endpoints: destinations · places · trips (CRUD, generate, edit, adapt, budget,   │
│            feedback) · rag (search, ask, explanation, ingest[admin])             │
│                                                                                  │
│  RecommendationService ──► ranked candidates (score + reasons)                   │
│        │                                                                         │
│        ├──► ItineraryService (greedy, deterministic) ──┐                         │
│        └──► CpSatItineraryService (OR-Tools CP-SAT) ───┼──► ConstraintValidator ─┤
│  EditingService / AdaptationService ───────────────────┘   (independent check)   │
│                                                                                  │
│  RAG: chunker → embeddings (Gemini | dummy) → vector store (JSON + numpy cosine) │
│       retrieval → grounded generation (Gemini structured output)                 │
│       → citation check → number check → sources from DB rows                     │
└───────────────────────────────────────┬──────────────────────────────────────────┘
                                        │ SQLAlchemy 2
                        SQLite (default) / PostgreSQL 16 (tested via Docker)
```

## Key design rules

1. **The validator never trusts a generator.** `constraint_validator.py` re-derives every hard rule from the database records: overlaps, opening hours, excluded places, duplicates, activity limit, must-visit, daily budget. Both schedulers and every edit are checked by it, and fault injection measures it (98/98 detected).
2. **The LLM never touches scheduling.** It only produces explanations and answers. Removing the LLM leaves planning fully functional, and a test proves it.
3. **Nothing is invented.** No fake LLM fallback, no invented sources or URLs, no hard-coded travel facts outside `data/seed`. Unknown values (transport cost) are shown as unknown.
4. **Determinism.** The greedy planner is deterministic (seeded meal choice). CP-SAT uses a deterministic work limit with interleaved parallel search, so the same request gives the same plan.

## Data model (SQLAlchemy)

`Destination` 1─* `Place` / `Restaurant` / `Hotel`
`Trip` 1─1 `TripPreference`, 1─1 `TripConstraint`, 1─* `Itinerary` (day) 1─* `ItineraryItem` (activity/meal), 1─1 `Feedback`
`SourceDocument` 1─* `DocumentChunk` (text, metadata, embedding JSON, embedding model)

Prices are per person in BDT. Trip budgets are totals for the group; the ranker uses the per-person daily share.

## Request flow: generate an itinerary

1. `POST /trips/{id}/generate?algorithm=cpsat`
2. Rank candidates (`RecommendationService`), pick meal restaurants and the hotel deterministically.
3. CP-SAT solves without touching the database. On `INFEASIBLE`/`UNKNOWN` it returns 422 with diagnostics, and the old itinerary is kept.
4. On success the old days are replaced and the new rows persisted.
5. `ConstraintValidator.validate()` runs, and its report is returned with the itinerary.

## Deployment shapes

- **Local dev:** SQLite, `uvicorn --reload`, Expo Go on a phone.
- **Docker Compose:** PostgreSQL 16 (pgvector image) plus the backend image (`backend/Dockerfile`). Verified end to end.
- **Hosted:** see [deployment.md](deployment.md). The steps are documented but not executed from this repository.

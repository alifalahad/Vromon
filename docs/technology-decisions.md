# Vromon — Technology Decisions

**Date:** 2026-10-10

---

## Decision Record

### 1. Backend Framework: FastAPI

**Choice:** FastAPI (same as demo)
**Reason:** Already proven in demo, excellent async support, automatic OpenAPI docs, Pydantic v2 native integration. No reason to change.

### 2. Database: PostgreSQL + pgvector + PostGIS

**Choice:** PostgreSQL 16+ with pgvector and PostGIS extensions
**Reason:** Required for vector similarity search (RAG embeddings) and geographic queries. SQLite cannot support these. For local development, SQLite fallback with feature flags where PostgreSQL is unavailable.
**Driver:** `psycopg` (async-capable, modern PostgreSQL adapter)

### 3. ORM: SQLAlchemy 2.x + Alembic

**Choice:** SQLAlchemy 2.x with Alembic migrations
**Reason:** Demo already uses SQLAlchemy 2.x. Alembic adds version-controlled schema changes required for a production system.

### 4. Mobile Framework: React Native + Expo (SDK 52+)

**Choice:** Expo with Expo Router for file-based navigation
**Reason:** Specified in requirements. Expo simplifies build/run. Expo Router provides Next.js-like file-based routing.

### 5. LLM Provider: Google Gemini

**Choice:** Google Gemini via the official `google-genai` SDK (pinned `>=2.25.0,<3`; 2.25.0 installed)
**Default model:** `gemini-3.6-flash` (configurable via `LLM_MODEL`)
**Reason:** Free tier available for students, supports JSON structured output against a Pydantic schema, good multilingual (English + Bangla) support. Provider code lives behind `app/services/llm/provider.py` (`LLMProvider` interface) so it can be swapped.
**Phase 8 update (2026-10-11):** The original default `gemini-2.0-flash` reached its announced shutdown date (2026-06-01) per Google's deprecations page, so the default was changed. Verify the model ID is available to your key before demonstrating.

### 6. Embedding Model: Google text-embedding-004

**Choice:** `gemini-embedding-001` via the same `google-genai` SDK, truncated to 768 dimensions (`output_dimensionality`)
**Reason:** Good multilingual support, same API key as the LLM (single credential), 768 dims keeps vectors compatible with the existing store and pgvector. Documents use task type `RETRIEVAL_DOCUMENT`, queries `RETRIEVAL_QUERY`.
**Phase 8 update (2026-10-11):** `text-embedding-004` was shut down on 2026-01-14 per Google's deprecations page. `gemini-embedding-001` has an announced shutdown of 2028-05-14. The stored model name includes the dimension (e.g. `gemini-embedding-001-768`), and ingestion re-embeds any chunk produced by a different model.

### 7. Constraint Solver: Google OR-Tools CP-SAT

**Choice:** `ortools` Python package (pinned `>=9.15.6755,<10`; 9.15.6755 installed, released 2026-01-14). It pulls in `pandas`, `protobuf`, `absl-py` and `immutabledict`.
**Reason:** Specified in requirements. CP-SAT handles discrete scheduling problems well. The deterministic greedy baseline remains the default; CP-SAT is opt-in via `?algorithm=cpsat`.
**Phase 9 decision (2026-10-12):** The search is bounded by CP-SAT's *deterministic* work limit (`OPTIMIZER_DETERMINISTIC_LIMIT`, default 5.0) with `interleave_search` across 8 workers, so the same request yields the same schedule. A wall-clock limit alone gave different schedules on repeated runs. A wall-clock cap (`OPTIMIZER_TIME_LIMIT_SECONDS`, default 15) is a safety net, and the response flags `reproducible: false` if it is hit.

### 8. API Client (Mobile): Axios

**Choice:** Axios with typed wrapper
**Reason:** Well-tested HTTP client, interceptor support for auth/error handling, TypeScript types available.

### 9. State Management: TanStack Query + Zustand

**Choice:** TanStack Query for server state, Zustand for local UI state
**Reason:** TanStack Query provides caching/retry/invalidation for API data. Zustand is lightweight for shared UI state (trip wizard form data). No Redux overhead.

### 10. Form Handling: React Hook Form + Zod

**Choice:** React Hook Form for form state, Zod for validation schemas
**Reason:** Specified in requirements. RHF is performant (no unnecessary re-renders), Zod provides TypeScript-first schema validation.

### 11. Maps (Mobile): react-native-maps

**Choice:** `react-native-maps` 1.27.2 (installed with `npx expo install`, so the version matches SDK 57)
**Reason:** It is included in Expo Go (no native build or API key needed for development, per the SDK 57 docs). A Google Maps Android key is required only for store or standalone builds (`app.json` → `plugins.react-native-maps.androidGoogleMapsApiKey`). It has no web support, so `TripMap.web.tsx` shows a stop list with OpenStreetMap links on web.
**Routes:** dashed straight lines between stops in visiting order, labelled as such. No road-routing provider is used, so no route geometry or road travel times are claimed.

### 12. Python Package Management: pyproject.toml + pip

**Choice:** `pyproject.toml` with `pip freeze` for lockfile
**Reason:** Modern Python packaging standard. No need for Poetry/PDM complexity for a student project.

---

## Versions (Locked)

| Package | Version |
|---|---|
| Python | 3.14.x |
| FastAPI | >=0.115.0 |
| SQLAlchemy | >=2.0.31 |
| Pydantic | >=2.10.0 |
| Alembic | >=1.13.0 |
| Uvicorn | >=0.30.0 |
| psycopg[binary] | >=3.2.0 |
| pgvector | >=0.3.0 |
| google-genai | >=2.25.0,<3 (2.25.0 installed) |
| ortools | >=9.15.6755,<10 (9.15.6755 installed) |
| httpx | >=0.28.1 (required by google-genai) |
| pytest | >=8.2.0 |
| Node.js | 24.x |
| Expo SDK | 52+ |
| TypeScript | 5.x |
| React Native | 0.76+ |

### 13. Grounded generation safeguards (Phase 8)

**Choice:** Custom, framework-free pipeline in `app/services/rag/generation.py`; no LangChain/LlamaIndex.
**Reason:** The pipeline is ~300 lines; a framework would add dependencies without a concrete benefit. Safeguards: retrieval relevance gate (`RAG_MIN_SCORE`), structured output schema, citation validation against labels actually given to the model, numeric-value grounding check (prices/hours/ratings must appear in cited sources), and source references built from database rows only.

### 14. Mobile testing (Phase 10)

**Choice:** `jest` ~29.7 + `jest-expo` ~57.0 (`"jest": {"preset": "jest-expo"}`), `@testing-library/react-native` 14.1 with `test-renderer` ~1.2 (the version RNTL recommends for React 19.2). Scripts: `npm test`, `npm run typecheck`.
**Note:** RNTL v14 made `render` and `fireEvent` async; tests must `await` them.
**Lint (Phase 11):** `eslint` 9 + `eslint-config-expo` ~57 (flat config, `eslint.config.js`); `npm run lint` and `npx eslint . --max-warnings 0` pass.

### 15. Reproducibility and delivery (Phase 11)

- **Python lock:** `backend/requirements.lock` (`pip freeze` of the tested venv). Verified by a clean install into an empty venv, then the full test suite.
- **PostgreSQL:** `psycopg[binary]` 3.3.6, `pgvector` (Python) 0.5.0. The app runs on PostgreSQL 16 (`pgvector/pgvector:0.8.0-pg16`), verified end to end via Docker. The pgvector extension is available but not used yet; vectors are still JSON plus numpy.
- **Containers:** `backend/Dockerfile` (python:3.11-slim, non-root, healthcheck) and root `docker-compose.yml` (db + backend). Both verified.
- **CI:** `.github/workflows/ci.yml` (actions/checkout@v7, setup-python@v7, setup-node@v7). The same commands were run locally on a clean copy. **The workflow has not run on GitHub yet**; it runs on the first push.

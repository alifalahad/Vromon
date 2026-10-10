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

**Choice:** Google Gemini via `google-genai` SDK
**Reason:** Free tier available for students (Gemini 2.0 Flash), supports structured outputs, good multilingual (English + Bangla) support. Configurable to switch providers.

### 6. Embedding Model: Google text-embedding-004

**Choice:** `text-embedding-004` via Gemini API
**Reason:** 768-dimensional vectors, good multilingual support, same API key as LLM (single credential), free tier available. Compatible with pgvector.

### 7. Constraint Solver: Google OR-Tools CP-SAT

**Choice:** `ortools` Python package
**Reason:** Specified in requirements. CP-SAT handles discrete scheduling problems well. Deterministic baseline heuristic implemented first as fallback.

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

**Choice:** `react-native-maps` with Google Maps provider
**Reason:** Standard for React Native maps. Requires Google Maps API key for Android. Apple Maps available on iOS as fallback.

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
| google-genai | >=1.0.0 |
| ortools | >=9.10 |
| httpx | >=0.27.0 |
| pytest | >=8.2.0 |
| Node.js | 24.x |
| Expo SDK | 52+ |
| TypeScript | 5.x |
| React Native | 0.76+ |

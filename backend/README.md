# Vromon Backend

FastAPI service for trip planning: data API, explainable ranking, two itinerary
schedulers (greedy baseline and OR-Tools CP-SAT), an independent constraint
validator, itinerary editing, and grounded RAG explanations (Google Gemini).

## Requirements

- Python **3.11**
- SQLite works out of the box. PostgreSQL is optional (see below).
- A Gemini API key is optional. Without one, everything except `/api/v1/rag/ask` and AI
  explanations works, and retrieval uses a non-semantic dummy embedding.

## Setup

```bash
cd backend
python3.11 -m venv venv
venv/bin/pip install -r requirements.lock      # exact tested versions
venv/bin/pip install -e . --no-deps            # the app package itself
cp ../.env.example .env                        # then edit .env if needed
```

`requirements.lock` pins the versions the test suite passed on. `pyproject.toml` holds the
looser ranges. After an intentional upgrade, rerun the tests and regenerate the lock with
`venv/bin/pip freeze --exclude-editable > requirements.lock`.

## Run

```bash
venv/bin/uvicorn app.main:app --reload                      # http://127.0.0.1:8000
venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000    # reachable from a phone on the same Wi-Fi
```

- API docs: http://127.0.0.1:8000/docs. Health: `GET /health`.
- On first start the app creates its tables, loads `data/seed/*.json` (Cox's Bazar sample data), and ingests the same records for RAG. All three steps are idempotent.

## Configuration (`backend/.env`)

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | `sqlite:///./vromon.db` | `postgresql+psycopg://user:pass@host:5432/vromon` for PostgreSQL |
| `APP_ENV` | `development` | `production` disables unauthenticated admin endpoints |
| `CORS_ORIGINS` | localhost dev ports | Comma-separated browser origins allowed to call the API |
| `ADMIN_TOKEN` | *(empty)* | Required as `X-Admin-Token` for `POST /api/v1/rag/ingest` outside development |
| `LLM_PROVIDER` / `LLM_API_KEY` / `LLM_MODEL` | – / – / `gemini-3.6-flash` | Grounded answers and explanations |
| `EMBEDDING_PROVIDER` / `EMBEDDING_API_KEY` / `EMBEDDING_MODEL` | – / – / `gemini-embedding-001` | Semantic retrieval |
| `RAG_MIN_SCORE`, `RAG_TOP_K` | `0.55`, `5` | Evidence threshold (calibrate with the RAG evaluation) |
| `OPTIMIZER_DETERMINISTIC_LIMIT`, `OPTIMIZER_TIME_LIMIT_SECONDS`, `OPTIMIZER_WORKERS` | `5.0`, `15`, `8` | CP-SAT search limits |

## Tests

```bash
venv/bin/python -m pytest -q                                   # offline; no API keys used
VROMON_LIVE_TESTS=1 venv/bin/python -m pytest tests/test_rag_live.py -v   # live Gemini (billable)
```

The test session forces dummy embeddings and no LLM, even if `.env` contains keys.

## Main endpoints (`/api/v1`)

| Area | Endpoints |
|---|---|
| Data | `GET /destinations`, `/destinations/{id}/places\|restaurants\|hotels`, `GET /places`, `POST /places/recommendations` |
| Trips | `POST/GET /trips`, `GET/PATCH/DELETE /trips/{id}`, `POST /trips/{id}/duplicate` |
| Itinerary | `POST /trips/{id}/generate?algorithm=heuristic\|cpsat` (replaces the trip's current itinerary; returns `status` and `replaced_previous`; 422 if no place is eligible), `GET /trips/{id}/itinerary` (re-validated on read), `GET /trips/{id}/budget` (known vs placeholder totals, `incomplete_reasons`) |
| Editing | `DELETE /trips/{id}/items/{item}`, `GET …/alternatives`, `POST …/replace`, `POST /trips/{id}/days/{day}/regenerate`, `POST /trips/{id}/adapt` |
| Feedback | `POST/GET /trips/{id}/feedback` |
| RAG | `GET /rag/search`, `GET /rag/status`, `POST /rag/ask`, `POST /rag/trips/{id}/items/{item}/explanation`, `POST /rag/ingest` (admin) |

## Layout

```
app/
  api/v1/endpoints/   HTTP layer (destinations, places, trips, rag)
  core/               settings, logging, exceptions
  db/                 engine/session, seed loader
  models/, schemas/   SQLAlchemy models, Pydantic schemas
  services/
    recommendation/   explainable weighted ranking
    itinerary/        greedy scheduler, CP-SAT optimizer, validator, editing
    adaptation/       relax / reduce_budget / avoid_crowds / energise
    rag/              chunking, embeddings, vector store, retrieval, grounded generation
    llm/              Gemini provider behind a small interface
tests/                pytest suite
```

## Known limitations

- The schema is created with `create_all` at startup. **There are no Alembic migrations yet**, so schema changes on an existing database need a manual migration or a fresh database.
- Vectors are stored as JSON and compared in Python (numpy). This is fine for the seed data, but pgvector is not used yet.
- There is no authentication. The API is meant for a single-user demo on a trusted network.

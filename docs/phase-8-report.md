# Phase 8 Report: Grounded RAG Generation and Integration

**Date:** 2026-10-11
**Status:** Implemented and self-checked (2026-10-12). Phase 9 was authorised next; see `phase-9-report.md`.

---

## 1. What Phase 8 adds

Vromon can now answer travel questions and explain itinerary activities with an LLM. Answers are built **only from retrieved evidence**, and every sentence cites real ingested records.

```
question ──► retrieve (embeddings) ──► relevance gate ──► Gemini (structured JSON)
                                           │                     │
                                   no evidence?            claims + labels
                                           ▼                     ▼
                                insufficient_evidence   citation check ─► number check
                                  (LLM not called)                │
                                                                  ▼
                                      answer built from surviving claims
                                    + sources built from DB rows (never from LLM output)
```

| Safeguard | What it prevents |
|---|---|
| Relevance gate (`RAG_MIN_SCORE`) | Calling the LLM when nothing relevant was retrieved |
| Structured output (`LLMGroundedOutput` Pydantic schema) | Free-form, unparseable responses |
| LLM may return `insufficient_evidence` | Forced answers to unsupported questions |
| Citation check | Claims citing sources that were never retrieved (dropped) |
| Number check | Invented prices, opening hours, ratings or durations: any number in a claim must appear in the sources it cites (dropped otherwise) |
| Sources built from DB rows | Invented IDs, titles or URLs |
| Scheduler/validator never import the LLM | The LLM cannot influence hard constraints. A test proves itinerary generation works when the LLM is broken |

## 2. Changes made

### New files
| File | Purpose |
|---|---|
| `backend/app/services/llm/provider.py` | `LLMProvider` interface, `GeminiLLMProvider` (official `google-genai` SDK, JSON structured output, timeout), explicit `LLMNotConfiguredError` / `LLMProviderError`. No fake LLM in production code. |
| `backend/app/services/rag/generation.py` | Grounded Q&A (`answer_question`) and activity explanations (`explain_itinerary_item`), prompts, validation |
| `backend/tests/test_rag_generation.py` | 41 provider-independent tests (fake LLM, fake SDK clients, real SDK with mocked HTTP; no network) |
| `backend/tests/test_rag_live.py` | 3 optional live Gemini tests, skipped unless `VROMON_LIVE_TESTS=1` |
| `evaluation/rag_questions.json` | 12 questions: 5 strong-evidence, 3 weak-evidence, 4 no-evidence |
| `evaluation/rag_generation_eval.py` | Reproducible evaluation; writes JSON reports to `evaluation/results/` |

### Modified files
| File | Change |
|---|---|
| `backend/app/api/v1/endpoints/rag.py` | `POST /rag/ask`, `POST /rag/trips/{trip_id}/items/{item_id}/explanation`; `/rag/status` reports LLM config; search results include `source_id`/`url` |
| `backend/app/core/config.py` | New defaults `gemini-3.6-flash` / `gemini-embedding-001`; `LLM_TEMPERATURE`, `LLM_TIMEOUT_SECONDS`, `RAG_MIN_SCORE`, `RAG_TOP_K`; provider name accepts `gemini` or `google` |
| `backend/app/services/rag/embeddings.py` | **Phase 7 fix:** migrated from the deprecated, uninstalled `google.generativeai` to `google-genai`; separate document/query task types; `embed_query()` |
| `backend/app/services/rag/ingestion.py` | **Phase 7 fix:** re-embeds chunks created with a different embedding model |
| `backend/app/services/rag/vector_store.py`, `retrieval.py` | **Phase 7 fix:** only compares a query against vectors from the same model; returns `source_id`, `url` |
| `backend/tests/conftest.py` | Session guard forcing dummy embeddings and no LLM during normal test runs, even when `.env` has real keys |
| `backend/pyproject.toml` | `google-genai>=2.25.0,<3`, `httpx>=0.28.1` (required by google-genai) |
| `.env.example` | New LLM/embedding/RAG settings |
| `docs/technology-decisions.md` | Model changes and the Phase 8 safeguards decision |

### Phase 7 problems found and fixed (they blocked grounding)
1. The Google embedding provider imported `google.generativeai`, which was not installed and is not the SDK declared in `pyproject.toml`, so it could never run.
2. `.env.example` uses `EMBEDDING_PROVIDER=gemini`, but the factory only accepted `"google"`. Real embeddings never activated and the app fell back to dummy embeddings without any warning.
3. Switching the embedding provider did not re-embed existing chunks, so real query vectors would have been compared against dummy hash vectors.
4. Both configured default models (`gemini-2.0-flash`, `text-embedding-004`) are past their shutdown dates on Google's deprecations page.
5. `TestClient(app)` runs startup ingestion against the real `vromon.db`. With a key in `.env`, ordinary test runs would have made paid API calls.

## 3. API

### `POST /api/v1/rag/ask`
```json
{ "question": "When does Laboni Beach open?", "destination": "Cox's Bazar", "top_k": 5 }
```
Response (`GroundedAnswer`):
```json
{
  "status": "answered",
  "answer": "Laboni Beach is open from 06:00 to 20:00.",
  "claims": [{ "text": "Laboni Beach is open from 06:00 to 20:00.", "source_labels": ["S1"] }],
  "sources": [{ "label": "S1", "chunk_id": 2, "source_document_id": 2, "title": "Laboni Beach",
                "source_type": "place", "destination": "Cox's Bazar", "url": null, "score": 0.71,
                "snippet": "Laboni Beach is a Beach in Cox's Bazar. ..." }],
  "warnings": [],
  "llm_model": "gemini-3.6-flash",
  "embedding_model": "gemini-embedding-001-768"
}
```
(Illustrative shape; IDs and scores depend on your database.)

| Situation | HTTP | Body |
|---|---|---|
| Answer supported by evidence | 200 | `status: "answered"` |
| Nothing relevant / model abstains / all claims fail validation | 200 | `status: "insufficient_evidence"`, `answer: null`, reasons in `warnings` |
| Invalid input (e.g. question < 3 chars) | 422 | validation detail |
| LLM not configured | 503 | how to configure it |
| Gemini error / timeout / malformed output | 502 | short error, no stack trace |

### `POST /api/v1/rag/trips/{trip_id}/items/{item_id}/explanation`
Explains why a scheduled activity was chosen. Evidence is the exact ingested record for that place or restaurant, plus a `CONTEXT` block of system-computed trip data (interests, schedule, cost, match score, ranking reasons). The endpoint is **read-only** and does not change the itinerary. Breaks/transport items with no linked place return `insufficient_evidence`. 404 if the item does not belong to the trip.

## 4. Commands executed

```bash
cd backend
venv/bin/python -m pytest -q                         # baseline before changes: 63 passed
venv/bin/pip install "google-genai==2.25.0"          # also upgraded httpx 0.27.0 → 0.28.1
venv/bin/python -m pytest -q                         # after install: 63 passed
venv/bin/python -m pytest tests/test_rag_generation.py -q
venv/bin/python -m pytest -q                         # final: 99 passed, 3 skipped
venv/bin/python ../evaluation/rag_generation_eval.py                    # exits 2: no LLM configured (expected)
venv/bin/python ../evaluation/rag_generation_eval.py --retrieval-only   # runs; dummy embeddings
venv/bin/uvicorn app.main:app --port 8765            # smoke test with curl, then stopped
```

## 5. Test results

| Suite | Result |
|---|---|
| Full backend suite (end of Phase 8) | **104 passed, 3 skipped** |
| `test_rag_generation.py` | 41 passed (36 original + 5 from the self-check) |
| `test_rag_live.py` | 3 skipped: no API key in this environment |
| Mutation check | Disabling the number check fails 3 tests; disabling the citation check fails 2. The guards are actually tested. |
| Server smoke test | `/health` OK; `/rag/status` reports 44 chunks; `/rag/ask` returns 503 with no LLM configured; new routes appear in OpenAPI |

**Not verified:** No call to the real Gemini API was made, because there is no API key in this environment. Live behaviour, answer quality, the `RAG_MIN_SCORE` value and the evaluation metrics are **unmeasured** until you run the steps below.

## 6. Manual verification steps


1. **Tests:** `cd backend && venv/bin/python -m pytest -q`. Expect all passed and 3 skipped (141 passed after Phase 9).
2. **Configure Gemini:** add to `backend/.env` (key from https://aistudio.google.com/apikey; never commit it):
   ```
   LLM_PROVIDER=gemini
   LLM_API_KEY=<your key>
   EMBEDDING_PROVIDER=gemini
   EMBEDDING_API_KEY=<your key>
   ```
3. **Start:** `venv/bin/uvicorn app.main:app --reload`. The startup log should show `RAG: {... 'new_chunks': 44 ...}` (re-embedding with Gemini).
4. **Status:** `GET /api/v1/rag/status` should show `embedding_model: "gemini-embedding-001-768"`, `embedded_chunks: 44`, `llm_configured: true`.
5. **Calibrate:** `venv/bin/python ../evaluation/rag_generation_eval.py --retrieval-only`, then set `RAG_MIN_SCORE` between the "strong" and "none" `mean_best_score`.
6. **Ask questions** in `/docs` → `POST /api/v1/rag/ask` (strong, weak and no-evidence questions).
7. **Explain an activity:** generate a trip itinerary, then call the explanation endpoint for one item.
8. **Failure handling:** set `LLM_MODEL=gemini-does-not-exist` and restart. `/rag/ask` should return 502, and itinerary generation should still work.
9. **Live tests:** `VROMON_LIVE_TESTS=1 venv/bin/python -m pytest tests/test_rag_live.py -v`.
10. **Full evaluation:** `venv/bin/python ../evaluation/rag_generation_eval.py`, then inspect `evaluation/results/*.json`.
11. **Demo untouched:** `git status demo/` should be empty.

## 6b. Self-check (2026-10-12)

Re-reviewed the phase before starting Phase 9. Still **no API key** in `backend/.env`, so no live Gemini call was possible. Instead, the real `google-genai` SDK was exercised end to end against a mocked HTTP transport:

| Check | Result |
|---|---|
| Real SDK request for generation: URL `models/<model>:generateContent`, `systemInstruction`, `responseMimeType: application/json`, `responseSchema` | Correct. Now a permanent test. |
| Real SDK response → Pydantic `LLMGroundedOutput` via `.parsed` | Works |
| Real SDK request for embeddings: `batchEmbedContents`, `taskType: RETRIEVAL_QUERY`, `outputDimensionality: 768` | Correct. Now a permanent test. |
| Full suite run with fake keys in the environment | 104 passed with no network calls; the offline guard holds |

**Bugs found and fixed:**
1. **An embedding failure looked like "no evidence".** A bad key or rate limit on the embedding call made `/rag/ask` return `insufficient_evidence` instead of an error. It now returns **502 "Embedding request failed: 401 UNAUTHENTICATED"** (or similar). `/rag/search` keeps its lenient behaviour.
2. **Provider errors were vague.** A rate limit showed only `ClientError`. It now reads `LLM request failed: 429 RESOURCE_EXHAUSTED`.
3. **The SDK logged an "automatic function calling" warning on every request.** That feature is now explicitly disabled; no tools are used.
4. **Large numbers in the explanation context used exponents.** A budget of 1,500,000 became `1.5e+06`, so the model's correct "1,500,000" would have been dropped as unsupported. Numbers now use plain formatting.
5. **The prompt didn't say how to write numbers.** It now asks the model to copy numbers exactly, without rounding or adding "out of 5", which the number check would otherwise reject.

## 7. Known issues and limitations

- **Live LLM behaviour is untested here** (no key). The defaults `gemini-3.6-flash` and `gemini-embedding-001` were chosen from Google's models/deprecations pages on 2026-10-11, but availability for your key is not verified.
- **`RAG_MIN_SCORE=0.55` is an uncalibrated starting value.** Calibrate it with step 5.
- **The number check is lexical.** It catches digits (prices, times, ratings) but not numbers written as words ("two hours"), and it cannot judge whether a non-numeric sentence is faithful to its source. Those still rely on the prompt and the model.
- **Without an embedding key, retrieval is not semantic** (dummy hash vectors). `/rag/ask` then adds a warning to every answer.
- **Seed data has no URLs or external provenance.** Sources cite ingested seed records (`data/seed/coxsbazar.json`, which is sample data from the demo), not verified external pages. `url` is always `null`.
- **Phase 7 chunker inserts a fact not in the seed file.** `_chunk_destination` hard-codes "world's longest natural sea beach at 120 km" into every destination overview. It is not in `coxsbazar.json`, so an answer could cite it as if it were sourced data. I left it unchanged because it is Phase 7 content; I recommend removing it or moving it into a documented source file.
- **Explanations are generated on demand and not persisted.** Each call costs one LLM request.
- **Ingestion embeds one chunk per API call.** On a free-tier rate limit, some chunks may log `Embedding failed`. Re-run `POST /api/v1/rag/ingest`; only those chunks are retried.
- **No lockfile for Python dependencies.** The plan asks for one; `pip freeze > requirements.lock` can be added when you approve.
- **Phase 0/7 documentation gaps:** `docs/feature-inventory.md`, `docs/architecture.md` and `docs/implementation-plan.md` do not exist, and Phase 7's retrieval evaluation dataset was not present (the `evaluation/` directory was created in this phase).
- **Mobile app does not call the new endpoints yet.** That was out of Phase 8 scope.
- `httpx` was upgraded 0.27.0 → 0.28.1 (google-genai requirement). All existing tests still pass.

## 8. Next phase proposal: Phase 9, OR-Tools optimization

Model scheduling with CP-SAT (hard constraints: daily windows, opening hours, activity limits, must-visit, exclusions; soft objective: ranking score minus travel time), with solver time limits and explicit status handling (OPTIMAL / FEASIBLE / INFEASIBLE / UNKNOWN). Keep the heuristic baseline, run both through the independent validator, and compare them on fixed sample trips with a reproducible script. `ortools` is declared in `pyproject.toml` but **not installed** in `backend/venv` yet.

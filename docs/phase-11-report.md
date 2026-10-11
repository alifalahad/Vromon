# Phase 11 Report: Evaluation, Security, Deployment and Final Verification

**Date:** 2026-10-12
**Status:** Implemented. Awaiting final developer approval. This is the last phase of the plan.

---

## 1. Summary

| Plan task | Outcome |
|---|---|
| Backend unit and integration tests | **200 passed**, 3 skipped (live Gemini). +27 tests this phase |
| Essential mobile checks, type checks, lint, builds | Typecheck 0 errors · ESLint 0 errors / 0 warnings (newly configured) · **25 tests passed** · Android and web bundles build |
| RAG evaluation scripts | Ready (Phase 8). **Not run with real models: no API key** (section 6) |
| Recommendation evaluation | **New** `recommendation_eval.py`: baselines + ablations |
| Optimization / constraint evaluation | Comparison rerun on final code; **new** validator fault injection (98/98) |
| Record actual results and limitations | `evaluation/README.md`, this report |
| Verify `.gitignore` / `.env.example`; scan for credentials | Clean (section 3) |
| Document local setup and deployment | Root `README.md`, `backend/README.md`, `docs/deployment.md`, `docs/architecture.md`, `mobile/.env.example` |
| Docker Compose (only if useful) | Added and **verified** on PostgreSQL 16 |
| CI (if stable) | Workflow added; same commands verified on a clean copy; **not yet run on GitHub** |
| Verify the demo is unmodified | `git status demo/` is empty |
| README and final feature inventory | Updated |

## 2. Defects found and fixed in this phase

| # | Defect | Found by | Fix and test |
|---|---|---|---|
| 1 | Malformed day times (`"abc"`) accepted, then **crashed generation (500)**; `25:99` and end-before-start accepted | Hostile-input probe | HH:MM validation and start < end → 422 · `test_security_validation.py` |
| 2 | Must-visit ∩ excluded, unknown destination, unknown or foreign place IDs, 365-day trips all accepted | Probe | Shared DB-aware validation (all problems listed together); trips ≤ 30 days |
| 3 | **PATCH reset unsent fields to defaults** (changing only `must_visit` reset the activity limit and removed the daily cap) | Probe | PATCH applies only the fields sent, validates the merged result, rolls back on error |
| 4 | **CORS allowed any origin**; the `CORS_ORIGINS` setting was ignored | Probe | Uses the settings; methods and headers restricted |
| 5 | `POST /rag/ingest` open to anyone (paid embedding calls when keys are set) | Review | `ADMIN_TOKEN` (`X-Admin-Token`); disabled in production without a token |
| 6 | 500 responses exposed exception class names | Review | Generic message only |
| 7 | **Ranking compared per-person prices with the whole group's daily budget** (4 travellers → 4× too lenient) | Designing the ranking evaluation | `per_person_daily_budget()` used at all 4 call sites · `test_phase11_fixes.py` |
| 8 | Seeder and RAG chunker **hard-coded travel claims** not present in any data file (incl. an invented "Popular activities include…" sentence) | Phase 8 flag, fixed now | Facts moved into `data/seed/coxsbazar.json` with a `source` provenance note; the overview chunk uses only file data and computed counts |
| 9 | `pip install -e .` failed (missing `backend/README.md`); no lockfile; a fresh install would pick untested major versions (SQLAlchemy 2.1, pytest 9, Starlette 1.7) | Clean-install check | `backend/README.md`, package discovery limited to `app*`, `requirements.lock` |
| 10 | `psycopg` / `pgvector` declared but not installed, so PostgreSQL could not work | Environment check | Installed (3.3.6 / 0.5.0), locked, verified on PostgreSQL 16 |
| 11 | Mobile lint findings: setState-in-effect in `FeedbackForm`, `watch()` incompatible with the React Compiler, unescaped JSX quotes | First lint run | Refactored (keyed fields component, `useWatch`); re-verified in the UI |

**Effect of fix 7 on results.** Recommendation scores changed slightly, so the final optimizer comparison was rerun (`optimization_comparison_20261012_014818`). Earlier Phase 9 and 10 result files are kept as history.

## 3. Security review

| Check | Result |
|---|---|
| Secrets in tracked files (Google `AIza…`, `sk-…`, `ghp_…`, private keys, hard-coded passwords) | None |
| Secrets anywhere in git history | None; no `.env` file was ever committed |
| `.gitignore` | `.env` (all levels), `venv/`, `node_modules/`, `*.db`, `.expo/` ignored; `.env.example` files tracked |
| Docker build context | `.dockerignore` excludes `.env`, venvs, DBs, mobile and demo; the container runs as a non-root user |
| SQL injection | All queries parameterised (SQLAlchemy); hostile strings return empty results (tested) |
| Input validation / crash resistance | See defects 1–3 |
| CORS / admin endpoint / error leakage | See defects 4–6 |
| **Remaining risks (documented, not fixed)** | **No authentication or authorisation**: any client that can reach the API can read and modify all trips. **No rate limiting** on LLM-backed endpoints. Plain HTTP in development. Suitable for a single-user demo on a trusted network only. |

## 4. Deployment verification

| Target | Verified how |
|---|---|
| Local SQLite | Full suite; live API e2e (19 steps); headless-browser UI run (25 actions, 0 page errors) |
| **PostgreSQL 16** (`pgvector/pgvector:0.8.0-pg16`) | Seeding, RAG ingestion (44 chunks), the full 19-step e2e flow, restart with no duplicates (seed skipped, 44 chunks skipped), new writes after restart; logs clean |
| **Docker Compose** (db + backend image) | `docker compose build` / `up`; healthy; e2e flow passed twice; torn down afterwards |
| Clean checkout (only git-visible files, no `.env`/venv/node_modules) | Backend: lock install → editable install → **200 passed**. Mobile: `npm ci` → typecheck → lint → **25 tests** → Android bundle |
| Hosted (Render) / EAS mobile builds | Documented in `docs/deployment.md`, **not executed** |
| GitHub Actions | Workflow parses; its commands pass locally; **not yet run on GitHub** |

## 5. Evaluation results (final code)

See `evaluation/README.md` for tables and commands.
- **Validator:** 98/98 injected violations detected across 7 fault types; 0/14 false positives. A sanity check (disabling one rule drops its detection to 0/14) confirms the evaluation can fail.
- **Heuristic vs CP-SAT:** both valid 7/7. CP-SAT has 83 vs 74 activities, 990 vs 1983 travel minutes and 0 vs 198 late minutes. 4/7 are proven optimal, and the infeasible scenarios are explained. CP-SAT is slower (seconds vs ms).
- **Ranking:** P@5 0.975 vs 0.60 / 0.53 / 0.45 for the rating, popularity and random baselines. The interest weight is decisive; the budget weight has little effect on this data. The relevance measure is a proxy (stated).
- **Latency:** most endpoints take ≤ 10 ms. CP-SAT takes 0.8–4 s median and 7.6 s at most.

## 6. Not done / limitations

1. **RAG with real models is unevaluated.** No Gemini key was available in any phase. Live answers, `RAG_MIN_SCORE` calibration and the 12-question evaluation are pending (4 commands in `evaluation/README.md`).
2. **The native mobile app has not been run on a device by me.** You checked Phase 10 on your side; Phase 11 changed only the feedback form internals, the wizard's form-watching and the HTTP client import (verified on web).
3. **No Alembic migrations** (a Phase 2 requirement that was never met). `create_all` can't alter existing tables.
4. **pgvector isn't used.** Vectors are stored as JSON and compared with numpy, which is fine at this data size.
5. **Sample data only, one destination;** values are unverified. Travel times are straight-line estimates.
6. **No authentication or rate limiting** (section 3).
7. **The demo's PWA behaviour is not reimplemented** in the native app.
8. **Ranking relevance is a proxy;** there is no user study or real feedback data.

## 7. Commands executed (main ones)

```bash
# backend
venv/bin/pip install "psycopg[binary]==3.3.6" "pgvector==0.5.0"
venv/bin/pip freeze --exclude-editable > requirements.lock
python3.11 -m venv <tmp>/venv && <tmp>/venv/bin/pip install -r requirements.lock && pip install -e . --no-deps && pytest
venv/bin/python -m pytest -q                                          # 200 passed, 3 skipped
venv/bin/python ../evaluation/{optimization_comparison,validator_fault_injection,recommendation_eval,performance_eval}.py
docker run … pgvector/pgvector:0.8.0-pg16 ; DATABASE_URL=postgresql+psycopg://… uvicorn … ; e2e script
docker compose -p vromon-verify build/up ; e2e ×2 ; down -v --rmi local
# mobile
npx expo install eslint eslint-config-expo ; npx expo lint ; npx eslint . --max-warnings 0
npx tsc --noEmit ; npx jest ; npx expo export --platform android|web
# clean checkout: git ls-files -co --exclude-standard | rsync → README steps for backend and mobile
```

## 8. Final approval request

All 11 phases are implemented. Please review this report and the remaining items in section 6, and give final approval or request fixes.

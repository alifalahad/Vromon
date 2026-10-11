# Vromon — Evaluation

All scripts run **from `backend/`** (so `backend/.env` and the venv are used). Every script
except the RAG one builds its own in-memory database from `data/seed/`, so your
`backend/vromon.db` is never touched. Each run writes timestamped JSON and Markdown reports to `results/`.

| Script | What it measures | Needs API key |
|---|---|---|
| `optimization_comparison.py` | Greedy heuristic vs CP-SAT on 9 fixed scenarios (2 deliberately infeasible); validity, activities, ranking score, travel, lateness, optimality gap, runtime, reproducibility | No |
| `validator_fault_injection.py` | Validator detection rate for 7 kinds of injected violations, and false positives on clean itineraries | No |
| `recommendation_eval.py` | Ranker vs rating-only / popularity-only / random baselines and weight ablations on 8 profiles | No |
| `performance_eval.py` | In-process latency of the main endpoints | No |
| `rag_generation_eval.py` | Retrieval hit rate, answered/abstain rates, citation accuracy, dropped claims on 12 questions (strong / weak / no evidence) | **Yes** (Gemini), or `--retrieval-only` |

```bash
cd backend
venv/bin/python ../evaluation/optimization_comparison.py
venv/bin/python ../evaluation/validator_fault_injection.py
venv/bin/python ../evaluation/recommendation_eval.py
venv/bin/python ../evaluation/performance_eval.py
venv/bin/python ../evaluation/rag_generation_eval.py --retrieval-only   # calibrate RAG_MIN_SCORE
venv/bin/python ../evaluation/rag_generation_eval.py                    # full run (billable)
```

## Latest recorded results (2026-10-12, final code)

### Constraint validator: fault injection (`results/validator_fault_injection_20261012_014842.md`)
14 clean itineraries (7 scenarios × 2 schedulers): **0 false positives**.

| Fault | Detected |
|---|---|
| overlap, outside opening hours, excluded place, duplicate place, over activity limit, missing must-visit, over daily budget | 14/14 each, **98/98** in total |

Sanity check: with the opening-hours rule disabled, detection of that fault fell to 0/14. So the evaluation can fail, and the 100% result isn't an artifact.

### Heuristic vs CP-SAT (`results/optimization_comparison_20261012_014818.md`)
OR-Tools 9.15.6755, deterministic limit 5.0, 8 workers.

| Totals over the 7 feasible scenarios | Heuristic | CP-SAT |
|---|---|---|
| Valid (independent validator) | 7/7 | 7/7 |
| Activities | 74 | 83 |
| Sum of ranking scores | 59.88 | 66.54 |
| Travel minutes (straight-line estimate) | 1983 | 990 |
| Activity minutes past preferred day end | 198 | 0 |
| Runtime (all scenarios) | 0.05 s | 19.2 s |
| Reproducible across two runs | 7/7 | 7/7 |

- **CP-SAT status:** 4/7 `OPTIMAL`, 3/7 `FEASIBLE` (gaps 0.5%, 5.8% and 14.2% to the proven bound).
- **The two conflicting scenarios:** CP-SAT returns `INFEASIBLE` with the reason. The heuristic produces an itinerary that the validator rejects.
- **CP-SAT does not win every metric:** the heuristic's higher score in some scenarios comes from running past the day end, which it allows by up to 60 min.

### Ranking (`results/recommendation_eval_20261012_014645.md`)
8 profiles, 25 places. **Relevance is a proxy** (interest/tag overlap, the same metadata the ranker reads), so this shows that personalisation works as designed, not user satisfaction.

| Ranker | P@5 | P@10 | nDCG@10 | Affordable@10 |
|---|---|---|---|---|
| Vromon weighted | **0.975** | **0.812** | 0.993 | 0.938 |
| − interest weight | 0.625 | 0.512 | 0.493 | 0.988 |
| − budget weight | 0.975 | 0.812 | 0.993 | 0.925 |
| Rating only | 0.600 | 0.537 | 0.455 | 0.875 |
| Popularity only | 0.525 | 0.450 | 0.409 | 0.950 |
| Random (30 seeds) | 0.446 | 0.453 | 0.360 | 0.928 |

What the results show:
- **Interest matching drives personalisation.**
- **The budget weight has little effect on this dataset,** because most places are cheap.
- **The crowd penalty can't be isolated here:** rating-only also avoided crowded places in the avoid-crowds profile.
- **No excluded place was ever ranked,** and every ranker is deterministic.

### Latency (`results/performance_eval_20261012_015413.md`, Apple Silicon, 8 CPUs, in-process)
- **Almost everything takes milliseconds:** data endpoints, trip CRUD, itinerary, budget, alternatives, regenerate day and adapt are all ≤ 10 ms median. Heuristic generation takes 6–250 ms.
- **CP-SAT generation is slower:** median 0.8 s (1 day), 2.5 s (3 days), 4.0 s (5 days); 7.6 s at most. All within the 15 s safety cap.

### RAG grounded generation: **not yet measured**
No Gemini API key was available. The pipeline's safeguards are covered by offline tests (`backend/tests/test_rag_generation.py`, including the real SDK against mocked HTTP). Numbers from the dummy embedding provider are meaningless and are deliberately not reported. To produce real results:
1. Set the `LLM_*` and `EMBEDDING_*` keys in `backend/.env`.
2. Start the backend once, so the data is re-embedded.
3. Run `--retrieval-only`, then set `RAG_MIN_SCORE` between the "strong" and "none" mean best scores.
4. Run the full script.

## Historical result files
- `optimization_comparison_20261012_002511.*`: Phase 9, before the baseline fixes.
- `optimization_comparison_20261012_010644.*`: Phase 10, after the must-visit fix.
- `optimization_comparison_20261012_014818.*`: final (per-person budget fix included).

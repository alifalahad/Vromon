"""
Vromon — Phase 8 grounded RAG evaluation.

Runs the questions in evaluation/rag_questions.json through the real pipeline
(configured embedding provider + LLM) against the backend database and writes
a JSON report to evaluation/results/.

Run from the backend directory so backend/.env is loaded:

    cd backend
    venv/bin/python ../evaluation/rag_generation_eval.py                   # retrieval + LLM
    venv/bin/python ../evaluation/rag_generation_eval.py --retrieval-only  # no LLM calls

Metrics (per category: strong / weak / none):
  - retrieval_hit@k   expected source title appears in the top-k retrieved chunks
  - answered_rate     share of questions returning status "answered"
  - abstain_rate      share returning "insufficient_evidence" (should be high for "none")
  - citation_hit      answered questions citing at least one expected source
  - dropped_claims    claims removed by citation/number validation (from warnings)
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.core.config import settings  # noqa: E402
from app.db.base import SessionLocal  # noqa: E402
from app.services.llm.provider import LLMError, get_llm_provider  # noqa: E402
from app.services.rag.embeddings import get_embedding_provider  # noqa: E402
from app.services.rag.generation import answer_question  # noqa: E402
from app.services.rag.retrieval import retrieve  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--questions", default=str(ROOT / "evaluation" / "rag_questions.json"))
    parser.add_argument("--retrieval-only", action="store_true", help="Score retrieval only; no LLM calls")
    parser.add_argument("--top-k", type=int, default=settings.rag_top_k)
    args = parser.parse_args()

    spec = json.loads(Path(args.questions).read_text(encoding="utf-8"))
    embedding_model = get_embedding_provider().model_name
    if embedding_model.startswith("dummy"):
        print("WARNING: dummy embeddings are active; retrieval scores are not semantic.\n")

    llm = None
    if not args.retrieval_only:
        try:
            llm = get_llm_provider()
        except LLMError as exc:
            print(f"ERROR: {exc}\nUse --retrieval-only to evaluate retrieval without an LLM.")
            return 2

    db = SessionLocal()
    rows = []
    try:
        for q in spec["questions"]:
            retrieved = retrieve(q["question"], db, destination=spec.get("destination"), top_k=args.top_k)
            titles = [r["source_title"] for r in retrieved]
            row = {
                **q,
                "retrieved": [{"title": r["source_title"], "score": round(r["score"], 4)} for r in retrieved],
                "retrieval_hit": bool(set(q["expected_sources"]) & set(titles)) if q["expected_sources"] else None,
                "best_score": round(max((r["score"] for r in retrieved), default=0.0), 4),
            }
            if llm is not None:
                try:
                    result = answer_question(q["question"], db, llm, destination=spec.get("destination"),
                                             top_k=args.top_k)
                    cited = [s.title for s in result.sources]
                    row.update(
                        status=result.status,
                        answer=result.answer,
                        cited_sources=cited,
                        citation_hit=bool(set(q["expected_sources"]) & set(cited)) if q["expected_sources"] else None,
                        dropped_claims=sum(w.startswith("Dropped") for w in result.warnings),
                        warnings=result.warnings,
                    )
                except LLMError as exc:
                    row.update(status="error", error=str(exc))
            rows.append(row)
            print(f"[{q['id']:>3}] {q['category']:<6} best={row['best_score']:.3f} "
                  f"hit={row['retrieval_hit']} status={row.get('status', '-')}")
    finally:
        db.close()

    summary = {}
    for cat in ("strong", "weak", "none"):
        group = [r for r in rows if r["category"] == cat]
        if not group:
            continue
        s = {"n": len(group), "mean_best_score": round(sum(r["best_score"] for r in group) / len(group), 4)}
        hits = [r["retrieval_hit"] for r in group if r["retrieval_hit"] is not None]
        if hits:
            s["retrieval_hit@k"] = round(sum(hits) / len(hits), 3)
        if llm is not None:
            s["answered_rate"] = round(sum(r.get("status") == "answered" for r in group) / len(group), 3)
            s["abstain_rate"] = round(sum(r.get("status") == "insufficient_evidence" for r in group) / len(group), 3)
            s["errors"] = sum(r.get("status") == "error" for r in group)
            s["dropped_claims"] = sum(r.get("dropped_claims", 0) for r in group)
            cites = [r["citation_hit"] for r in group if r.get("citation_hit") is not None and r["status"] == "answered"]
            if cites:
                s["citation_hit"] = round(sum(cites) / len(cites), 3)
        summary[cat] = s

    report = {
        "run_at": datetime.now(timezone.utc).isoformat(),
        "config": {
            "embedding_model": embedding_model,
            "llm_model": llm.model_name if llm else None,
            "llm_temperature": settings.llm_temperature,
            "rag_min_score": settings.rag_min_score,
            "top_k": args.top_k,
            "retrieval_only": args.retrieval_only,
        },
        "summary": summary,
        "rows": rows,
    }
    out_dir = ROOT / "evaluation" / "results"
    out_dir.mkdir(exist_ok=True)
    out = out_dir / f"rag_generation_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    out.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")

    print("\nSummary:")
    print(json.dumps(summary, indent=2))
    print(f"\nReport written to {out.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

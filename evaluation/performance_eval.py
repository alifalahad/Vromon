"""
Vromon — Phase 11 API latency measurement.

Calls the main endpoints in-process (FastAPI TestClient, no network) against a fresh
in-memory SQLite database seeded from data/seed, and reports median and max latency.
Numbers depend on the machine; they show relative cost, not a production SLA.

    cd backend
    venv/bin/python ../evaluation/performance_eval.py [--repeats 5]
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import platform
import statistics
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
logging.disable(logging.WARNING)

from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

from app.core.config import settings  # noqa: E402
from app.db.base import Base, get_db  # noqa: E402
from app.db.seeder import seed_database  # noqa: E402
from app.main import app  # noqa: E402


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--repeats", type=int, default=5)
    args = ap.parse_args()

    # Keep this offline and cheap regardless of backend/.env
    settings.embedding_provider = ""
    settings.llm_provider = ""

    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    s = Session()
    seed_database(s)
    s.close()

    def db():
        x = Session()
        try:
            yield x
        finally:
            x.close()

    app.dependency_overrides[get_db] = db
    c = TestClient(app)

    def trip(days: int) -> int:
        r = c.post("/api/v1/trips", json={
            "destination": "Cox's Bazar", "start_date": "2026-11-01", "end_date": f"2026-11-{days:02d}",
            "num_travelers": 2, "total_budget": 10000 * days,
            "preference": {"interests": ["Beach", "Nature", "Photography"]},
            "constraints": {"max_activities_per_day": 4},
        })
        assert r.status_code == 201, r.text
        return r.json()["id"]

    timings: dict[str, list[float]] = {}

    def measure(name, fn):
        for _ in range(args.repeats):
            t0 = time.perf_counter()
            r = fn()
            timings.setdefault(name, []).append((time.perf_counter() - t0) * 1000)
            assert r.status_code < 400, (name, r.status_code, r.text[:200])

    measure("GET /places", lambda: c.get("/api/v1/places", params={"destination": "Cox's Bazar"}))
    measure("POST /trips", lambda: c.post("/api/v1/trips", json={
        "destination": "Cox's Bazar", "start_date": "2026-11-01", "end_date": "2026-11-02", "total_budget": 20000,
        "preference": {"interests": ["Beach"]}}))
    for days in (1, 3, 5):
        tid = trip(days)
        measure(f"generate heuristic {days}d", lambda tid=tid: c.post(f"/api/v1/trips/{tid}/generate"))
        measure(f"generate cpsat {days}d", lambda tid=tid: c.post(f"/api/v1/trips/{tid}/generate", params={"algorithm": "cpsat"}))
    tid = trip(3)
    c.post(f"/api/v1/trips/{tid}/generate")
    measure("GET itinerary (3d, incl. validation)", lambda: c.get(f"/api/v1/trips/{tid}/itinerary"))
    measure("GET budget (3d)", lambda: c.get(f"/api/v1/trips/{tid}/budget"))
    day_id = c.get(f"/api/v1/trips/{tid}/itinerary").json()["days"][0]["id"]
    measure("regenerate day", lambda: c.post(f"/api/v1/trips/{tid}/days/{day_id}/regenerate"))

    def first_activity():
        it = c.get(f"/api/v1/trips/{tid}/itinerary").json()
        return next(i["id"] for d in it["days"] for i in d["items"] if i["item_type"] == "activity")
    measure("GET alternatives", lambda: c.get(f"/api/v1/trips/{tid}/items/{first_activity()}/alternatives"))
    measure("adapt energise", lambda: c.post(f"/api/v1/trips/{tid}/adapt", json={"adaptation_type": "energise"}))
    measure("GET /rag/search (dummy embeddings)", lambda: c.get("/api/v1/rag/search", params={"q": "sunset beach"}))
    app.dependency_overrides.clear()

    rows = [{"endpoint": k, "median_ms": round(statistics.median(v), 1), "max_ms": round(max(v), 1), "n": len(v)}
            for k, v in timings.items()]
    report = {
        "run_at": datetime.now(timezone.utc).isoformat(),
        "machine": {"platform": platform.platform(), "python": platform.python_version(), "cpus": os.cpu_count()},
        "optimizer": {"deterministic_limit": settings.optimizer_deterministic_limit, "workers": settings.optimizer_workers},
        "rows": rows,
    }
    out_dir = ROOT / "evaluation" / "results"
    out_dir.mkdir(exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    (out_dir / f"performance_eval_{stamp}.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    md = ["# API latency (in-process)", "", f"Run {report['run_at']} · {report['machine']['platform']} · "
          f"{report['machine']['cpus']} CPUs · {args.repeats} repeats", "",
          "| Endpoint | Median ms | Max ms |", "|---|---|---|"]
    md += [f"| {r['endpoint']} | {r['median_ms']} | {r['max_ms']} |" for r in rows]
    (out_dir / f"performance_eval_{stamp}.md").write_text("\n".join(md) + "\n", encoding="utf-8")
    print("\n".join(md))
    print(f"\nReports written to evaluation/results/performance_eval_{stamp}.(json|md)")
    return 0


if __name__ == "__main__":
    sys.exit(main())

"""
Vromon — Phase 9: heuristic baseline vs OR-Tools CP-SAT comparison.

Runs every scenario in evaluation/optimization_scenarios.json through both
schedulers on a fresh in-memory database seeded from data/seed (your
backend/vromon.db is never touched), validates every itinerary with the
independent ConstraintValidator, runs each algorithm twice to check
reproducibility, and writes JSON + Markdown reports to evaluation/results/.

    cd backend
    venv/bin/python ../evaluation/optimization_comparison.py
    venv/bin/python ../evaluation/optimization_comparison.py --deterministic-limit 10

Metrics per scenario and algorithm
  status          heuristic: COMPLETED; cpsat: OPTIMAL / FEASIBLE / INFEASIBLE / UNKNOWN
  valid           no hard violations reported by the independent validator
  hard / soft     violation counts (hard codes listed)
  activities      number of scheduled activities
  score           sum of ranking scores (incl. day-theme bonus) of scheduled activities;
                  the bonus is added here because itineraries store the plain ranking score
  travel_min      estimated straight-line travel minutes (haversine @ 30 km/h)
  cost            all item costs (activities + meals), BDT per person
  must_visit      scheduled / requested must-visit places
  late_min        activity minutes past the preferred day end
  runtime_s       wall time of one generation
  gap             CP-SAT relative gap to its proven bound (0 = proven optimal)
  reproducible    two runs produced the identical schedule
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
import time
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
logging.disable(logging.WARNING)

from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

from app.core.config import settings  # noqa: E402
from app.db.base import Base  # noqa: E402
from app.db.seeder import seed_database  # noqa: E402
from app.models.models import Place, Trip, TripConstraint, TripPreference  # noqa: E402
from app.services.itinerary.constraint_validator import ConstraintValidator  # noqa: E402
from app.services.itinerary.cpsat_scheduler import THEME_BONUS, CpSatItineraryService  # noqa: E402
from app.services.itinerary.itinerary_service import ItineraryService, _time_to_minutes  # noqa: E402


def make_trip(db, spec: dict, destination: str, start_date: date) -> Trip:
    ids = {p.name: p.id for p in db.query(Place).filter(Place.destination_name == destination)}
    trip = Trip(destination=destination, start_date=start_date,
                end_date=start_date + timedelta(days=spec["days"] - 1),
                num_travelers=2, total_budget=spec.get("total_budget", 40000), title=spec["id"])
    db.add(trip)
    db.flush()
    pref = TripPreference(trip_id=trip.id, preferred_start_time=spec["start"], preferred_end_time=spec["end"],
                          travel_style=spec.get("travel_style", "Balanced"))
    pref.interests = spec["interests"]
    db.add(pref)
    cons = TripConstraint(trip_id=trip.id, max_activities_per_day=spec["max_per_day"],
                          max_daily_budget=spec.get("daily_cap", 0.0))
    cons.must_visit = [ids[n] for n in spec.get("must_visit", [])]
    cons.excluded_places = [ids[n] for n in spec.get("excluded", [])]
    db.add(cons)
    db.commit()
    db.refresh(trip)
    return trip


def themed_score_sum(trip: Trip, days) -> float:
    """Ranking score + the planners' day-theme bonus, summed over scheduled activities."""
    planner = ItineraryService()
    total = 0.0
    for d in days:
        theme = [t.lower() for t in planner._day_theme_interests(trip, d.day_number)]
        for i in d.items:
            if i.item_type != "activity":
                continue
            tags = [t.lower() for t in (i.place.tags if i.place else [])]
            total += i.recommendation_score + (THEME_BONUS if any(t in tags for t in theme) else 0.0)
    return total


def metrics(trip: Trip, days) -> dict:
    report = ConstraintValidator().validate(trip, days)
    acts = [i for d in days for i in d.items if i.item_type == "activity"]
    end = _time_to_minutes(trip.preference.preferred_end_time)
    must = set(trip.constraints.must_visit)
    return {
        "valid": not report.has_hard_violations,
        "hard": len(report.hard_violations),
        "hard_codes": sorted({v.code for v in report.hard_violations}),
        "soft": len(report.soft_violations),
        "activities": len(acts),
        "score": round(themed_score_sum(trip, days), 3),
        "travel_min": round(sum(d.total_travel_time for d in days), 1),
        "cost": round(sum(i.cost for d in days for i in d.items), 0),
        "must_visit": f"{len(must & {i.place_id for i in acts})}/{len(must)}",
        "late_min": sum(max(0, _time_to_minutes(i.end_time) - end) for i in acts),
        "signature": [(d.day_number, i.place_id, i.start_time) for d in days for i in d.items],
    }


def run_heuristic(db, trip):
    for day in list(trip.itinerary_days):
        db.delete(day)
    db.commit()
    t0 = time.perf_counter()
    days = ItineraryService().generate(db, trip)
    runtime = time.perf_counter() - t0
    return {"status": "COMPLETED", "runtime_s": round(runtime, 3), **metrics(trip, days)}


def run_cpsat(db, trip, det_limit, time_limit, workers):
    for day in list(trip.itinerary_days):
        db.delete(day)
    db.commit()
    svc = CpSatItineraryService(deterministic_limit=det_limit, time_limit_s=time_limit, workers=workers)
    t0 = time.perf_counter()
    result, ctx = svc.solve_for_trip(db, trip)
    row = {"status": result.status, "gap": result.gap, "diagnostics": result.diagnostics}
    if result.succeeded:
        days = svc.persist(db, trip, result, ctx)
        row.update(metrics(trip, days))
    row["runtime_s"] = round(time.perf_counter() - t0, 3)
    return row


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--scenarios", default=str(ROOT / "evaluation" / "optimization_scenarios.json"))
    ap.add_argument("--deterministic-limit", type=float, default=settings.optimizer_deterministic_limit)
    ap.add_argument("--time-limit", type=float, default=settings.optimizer_time_limit_seconds)
    ap.add_argument("--workers", type=int, default=settings.optimizer_workers)
    args = ap.parse_args()

    spec = json.loads(Path(args.scenarios).read_text(encoding="utf-8"))
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    db = sessionmaker(bind=engine)()
    seed_database(db)
    start_date = date.fromisoformat(spec["start_date"])

    rows = []
    for sc in spec["scenarios"]:
        trip = make_trip(db, sc, spec["destination"], start_date)
        runs = {
            "heuristic": [run_heuristic(db, trip) for _ in range(2)],
            "cpsat": [run_cpsat(db, trip, args.deterministic_limit, args.time_limit, args.workers) for _ in range(2)],
        }
        for algo, (a, b) in runs.items():
            a["reproducible"] = a.get("signature") == b.get("signature") and a["status"] == b["status"]
            a.pop("signature", None)
            rows.append({"scenario": sc["id"], "expect": sc["expect"], "algorithm": algo, **a})
            r = rows[-1]
            print(f"{sc['id']:<28} {algo:<9} {r['status']:<10} valid={r.get('valid', '-')!s:<5} "
                  f"acts={r.get('activities', '-')!s:<3} score={r.get('score', '-')!s:<7} "
                  f"travel={r.get('travel_min', '-')!s:<6} t={r['runtime_s']:.2f}s repro={r['reproducible']}")

    def agg(algo, feasible_only=True):
        rs = [r for r in rows if r["algorithm"] == algo and (r["expect"] == "feasible" or not feasible_only)]
        done = [r for r in rs if "valid" in r]
        return {
            "scenarios": len(rs),
            "valid": sum(r["valid"] for r in done),
            "hard_violations": sum(r["hard"] for r in done),
            "activities": sum(r["activities"] for r in done),
            "score": round(sum(r["score"] for r in done), 3),
            "travel_min": round(sum(r["travel_min"] for r in done), 1),
            "late_min": sum(r["late_min"] for r in done),
            "runtime_s": round(sum(r["runtime_s"] for r in rs), 2),
            "reproducible": sum(r["reproducible"] for r in rs),
        }

    summary = {"feasible_scenarios": {a: agg(a) for a in ("heuristic", "cpsat")}}
    conflicts = [r for r in rows if r["expect"] == "infeasible"]
    summary["conflicting_scenarios"] = [
        {"scenario": r["scenario"], "algorithm": r["algorithm"], "status": r["status"],
         "valid": r.get("valid"), "hard_codes": r.get("hard_codes"), "diagnostics": r.get("diagnostics")}
        for r in conflicts
    ]

    report = {
        "run_at": datetime.now(timezone.utc).isoformat(),
        "config": {
            "deterministic_limit": args.deterministic_limit,
            "time_limit_s": args.time_limit,
            "workers": args.workers,
            "ortools": __import__("ortools").__version__,
            "travel_model": "haversine straight-line @ 30 km/h (estimate, not road routing)",
        },
        "summary": summary,
        "rows": rows,
    }
    out_dir = ROOT / "evaluation" / "results"
    out_dir.mkdir(exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    (out_dir / f"optimization_comparison_{stamp}.json").write_text(
        json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")

    md = ["# Heuristic vs CP-SAT comparison", "",
          f"Run {report['run_at']} · OR-Tools {report['config']['ortools']} · "
          f"deterministic limit {args.deterministic_limit} · workers {args.workers}", "",
          "| Scenario | Algorithm | Status | Valid | Hard | Acts | Score | Travel min | Late min | Must-visit | Gap | Time s | Repro |",
          "|---|---|---|---|---|---|---|---|---|---|---|---|---|"]
    for r in rows:
        md.append(f"| {r['scenario']} | {r['algorithm']} | {r['status']} | {r.get('valid', '–')} | "
                  f"{r.get('hard', '–')} {','.join(r.get('hard_codes', []))} | {r.get('activities', '–')} | "
                  f"{r.get('score', '–')} | {r.get('travel_min', '–')} | {r.get('late_min', '–')} | "
                  f"{r.get('must_visit', '–')} | {r.get('gap', '–')} | {r['runtime_s']} | {r['reproducible']} |")
    md += ["", "## Totals over feasible scenarios", "", "```json", json.dumps(summary["feasible_scenarios"], indent=2), "```"]
    (out_dir / f"optimization_comparison_{stamp}.md").write_text("\n".join(md) + "\n", encoding="utf-8")

    print("\nTotals over feasible scenarios:")
    print(json.dumps(summary["feasible_scenarios"], indent=2))
    print(f"\nReports written to evaluation/results/optimization_comparison_{stamp}.(json|md)")
    return 0


if __name__ == "__main__":
    sys.exit(main())

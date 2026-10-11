"""
Vromon — Phase 11 constraint-validator evaluation by fault injection.

1. Generate itineraries with both schedulers for the fixed scenarios in
   evaluation/optimization_scenarios.json (fresh in-memory DB seeded from data/seed).
2. Check the clean itineraries (false-positive rate on valid schedules).
3. Inject one known fault at a time into each clean itinerary, validate, roll back,
   and record whether the validator reports the expected violation code.

    cd backend
    venv/bin/python ../evaluation/validator_fault_injection.py

Faults (expected code):
  overlap           shift an activity to start inside the previous item       TIME_OVERLAP
  outside_hours     move an activity to start one hour before it opens        OUTSIDE_OPENING_HOURS
  excluded          add a scheduled place to the excluded list               EXCLUDED_PLACE_SCHEDULED
  duplicate         schedule an already-used place again on the last day     DUPLICATE_PLACE
  over_limit        lower max_activities_per_day below the busiest day       ACTIVITY_LIMIT_EXCEEDED
  missing_must      require an unscheduled place as must-visit               MUST_VISIT_MISSING
  over_budget       set the daily cap just below the most expensive day      DAILY_BUDGET_EXCEEDED
"""

from __future__ import annotations

import json
import logging
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
sys.path.insert(0, str(ROOT / "evaluation"))
logging.disable(logging.WARNING)

from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

from app.db.base import Base  # noqa: E402
from app.db.seeder import seed_database  # noqa: E402
from app.models.models import ItineraryItem, Place  # noqa: E402
from app.services.itinerary.constraint_validator import ConstraintValidator  # noqa: E402
from app.services.itinerary.cpsat_scheduler import CpSatItineraryService  # noqa: E402
from app.services.itinerary.itinerary_service import ItineraryService, _minutes_to_time, _time_to_minutes  # noqa: E402
from optimization_comparison import make_trip  # noqa: E402

EXPECTED = {
    "overlap": "TIME_OVERLAP",
    "outside_hours": "OUTSIDE_OPENING_HOURS",
    "excluded": "EXCLUDED_PLACE_SCHEDULED",
    "duplicate": "DUPLICATE_PLACE",
    "over_limit": "ACTIVITY_LIMIT_EXCEEDED",
    "missing_must": "MUST_VISIT_MISSING",
    "over_budget": "DAILY_BUDGET_EXCEEDED",
}


def activities(days):
    return [i for d in days for i in sorted(d.items, key=lambda x: x.order_index) if i.item_type == "activity"]


def inject(fault: str, db, trip, days) -> bool:
    """Apply one fault in the session (not committed). Returns False if not applicable."""
    acts = activities(days)
    cons = trip.constraints
    if not acts:
        return False
    if fault == "overlap":
        for d in days:
            items = sorted(d.items, key=lambda x: _time_to_minutes(x.start_time))
            for prev, cur in zip(items, items[1:]):
                if cur.item_type == "activity":
                    cur.start_time = _minutes_to_time(_time_to_minutes(prev.end_time) - 15)
                    return True
        return False
    if fault == "outside_hours":
        a = acts[0]
        start = _time_to_minutes(a.place.opening_time) - 60
        if start < 0:
            return False
        a.start_time = _minutes_to_time(start)
        a.end_time = _minutes_to_time(start + a.duration_minutes)
        return True
    if fault == "excluded":
        cons.excluded_places = list(cons.excluded_places) + [acts[0].place_id]
        return True
    if fault == "duplicate":
        a = acts[0]
        last = days[-1]
        last.items.append(ItineraryItem(item_type="activity", place_id=a.place_id, title=a.title,
                                        start_time="23:00", end_time="23:30", duration_minutes=30, cost=0.0,
                                        order_index=99))
        db.flush()
        return True
    if fault == "over_limit":
        busiest = max(sum(i.item_type == "activity" for i in d.items) for d in days)
        if busiest < 1:
            return False
        cons.max_activities_per_day = busiest - 1 if busiest > 1 else 0
        return True
    if fault == "missing_must":
        used = {i.place_id for i in acts}
        unused = db.query(Place).filter(Place.destination_name == trip.destination, ~Place.id.in_(used)).first()
        if unused is None:
            return False
        cons.must_visit = list(cons.must_visit) + [unused.id]
        return True
    if fault == "over_budget":
        top = max(sum(i.cost for i in d.items) for d in days)
        if top <= 1:
            return False
        cons.max_daily_budget = top - 1
        return True
    raise ValueError(fault)


def main() -> int:
    spec = json.loads((ROOT / "evaluation" / "optimization_scenarios.json").read_text(encoding="utf-8"))
    scenarios = [s for s in spec["scenarios"] if s["expect"] == "feasible"]
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    db = sessionmaker(bind=engine, autoflush=True)()
    seed_database(db)
    validator = ConstraintValidator()
    start = date.fromisoformat(spec["start_date"])

    clean_rows, fault_rows = [], []
    for sc in scenarios:
        for algo in ("heuristic", "cpsat"):
            trip = make_trip(db, sc, spec["destination"], start)
            if algo == "heuristic":
                days = ItineraryService().generate(db, trip)
            else:
                svc = CpSatItineraryService()  # default limits (2.0 is too low for the 7-day scenario)
                res, ctx = svc.solve_for_trip(db, trip)
                days = svc.persist(db, trip, res, ctx)
            db.refresh(trip)
            report = validator.validate(trip, days)
            clean_rows.append({"scenario": sc["id"], "algorithm": algo,
                               "hard": [v.code for v in report.hard_violations]})
            for fault, code in EXPECTED.items():
                applied = inject(fault, db, trip, days)
                if applied:
                    codes = [v.code for v in validator.validate(trip, days).hard_violations]
                    fault_rows.append({"scenario": sc["id"], "algorithm": algo, "fault": fault,
                                       "detected": code in codes, "codes": sorted(set(codes))})
                db.rollback()
                db.expire_all()
                days = sorted(trip.itinerary_days, key=lambda d: d.day_number)

    per_fault = {}
    for fault in EXPECTED:
        rs = [r for r in fault_rows if r["fault"] == fault]
        per_fault[fault] = {"injected": len(rs), "detected": sum(r["detected"] for r in rs)}
    clean_fp = sum(1 for r in clean_rows if r["hard"])
    total_inj = sum(v["injected"] for v in per_fault.values())
    total_det = sum(v["detected"] for v in per_fault.values())

    report = {
        "run_at": datetime.now(timezone.utc).isoformat(),
        "clean_itineraries": len(clean_rows),
        "clean_with_hard_violations": clean_fp,
        "per_fault": per_fault,
        "detection_rate": round(total_det / total_inj, 4) if total_inj else None,
        "clean_rows": clean_rows,
        "fault_rows": fault_rows,
    }
    out_dir = ROOT / "evaluation" / "results"
    out_dir.mkdir(exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    (out_dir / f"validator_fault_injection_{stamp}.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    md = ["# Validator fault-injection evaluation", "",
          f"Run {report['run_at']} · {len(clean_rows)} generated itineraries ({len(scenarios)} scenarios × 2 schedulers)", "",
          f"Clean itineraries flagged with hard violations (false positives): **{clean_fp} / {len(clean_rows)}**", "",
          "| Fault | Expected code | Injected | Detected |", "|---|---|---|---|"]
    md += [f"| {f} | {EXPECTED[f]} | {v['injected']} | {v['detected']} |" for f, v in per_fault.items()]
    md += ["", f"Overall detection: **{total_det} / {total_inj}**"]
    (out_dir / f"validator_fault_injection_{stamp}.md").write_text("\n".join(md) + "\n", encoding="utf-8")
    print("\n".join(md))
    print(f"\nReports written to evaluation/results/validator_fault_injection_{stamp}.(json|md)")
    return 0


if __name__ == "__main__":
    sys.exit(main())

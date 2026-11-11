"""
Operations (Phase 10): scheduled runs, stale data, the weekly quality report, backups.

  due()            connectors whose last successful run is older than schedule.yaml allows
  run_due()        run them in schedule order; one failure doesn't stop the rest
  mark_stale()     published fares / timetable versions past their check window -> `stale`
                   (the API serves `published` only, so stale data stops being shown as current)
  weekly_report()  one page: jobs, failures, open reviews, coverage, stale data, sources
  backup()         a consistent copy of the SQLite database plus the manifests and registry
"""

from __future__ import annotations

import json
import shutil
import sqlite3
import uuid
from collections import Counter
from datetime import datetime, timedelta
from pathlib import Path

import yaml
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.catalog import (
    AdminUnit, Attraction, DataSource, FareProduct, IngestionJob, LocalFood, MapExport, ReviewTask, TimetableVersion,
    TrainService, TransportHub, VerificationEvent,
)
from vromon_data import db as dbmod
from vromon_data.paths import MANIFEST_DIR, PLATFORM_DIR, REGISTRY_FILE, REPORTS_DIR

SCHEDULE_FILE = PLATFORM_DIR / "source-registry" / "schedule.yaml"


def load_schedule() -> dict:
    return yaml.safe_load(SCHEDULE_FILE.read_text(encoding="utf-8"))


def due(session: Session, now: datetime | None = None) -> list[dict]:
    now = now or datetime.utcnow()
    out = []
    for c in load_schedule()["connectors"]:
        last = session.scalar(select(func.max(IngestionJob.finished_at)).where(IngestionJob.connector == c["name"],
                                                                               IngestionJob.status == "succeeded"))
        if last is None or now - last >= timedelta(days=c["every_days"]):
            out.append({**c, "last_success": last.isoformat(timespec="minutes") if last else None})
    return out


def run_due(session_factory) -> list[dict]:
    from vromon_data import pipeline
    from vromon_data.connectors import all_connectors
    conns = all_connectors()
    results = []
    with session_factory() as s:
        todo = due(s)
    for c in todo:
        with session_factory() as s:
            try:
                report = pipeline.run(conns[c["name"]](), s)
            except Exception as e:  # recorded; the next connector still runs
                report = {"status": "failed", "error": f"{type(e).__name__}: {e}"}
        results.append({"connector": c["name"], "status": report.get("status"), "error": report.get("error")})
    return results


def mark_stale(session: Session, now: datetime | None = None) -> dict:
    now = now or datetime.utcnow()
    limits = load_schedule()["stale_after_days"]
    counts = Counter()
    fare_cut = now - timedelta(days=limits["fare_products"])
    for f in session.scalars(select(FareProduct).where(FareProduct.status == "published", FareProduct.last_checked_at < fare_cut)):
        f.status = "stale"
        counts["fares"] += 1
    tt_cut = (now - timedelta(days=limits["timetable_versions"])).date()
    for v in session.scalars(select(TimetableVersion).where(TimetableVersion.status == "published",
                                                            TimetableVersion.effective_from < tt_cut)):
        v.status = "stale"
        counts["timetable_versions"] += 1
    for kind, n in counts.items():
        session.add(VerificationEvent(entity_type=kind, entity_id=uuid.uuid4(), method="stale_check",
                                      reason=f"{n} {kind} past their check window"))
    session.commit()
    return dict(counts)


def weekly_report(session: Session, now: datetime | None = None, write: bool = True) -> dict:
    now = now or datetime.utcnow()
    since = now - timedelta(days=7)
    jobs = session.scalars(select(IngestionJob).where(IngestionJob.started_at >= since)).all()

    def count(model, *where):
        return session.scalar(select(func.count()).select_from(model).where(*where)) or 0

    data = {
        "week_ending": now.strftime("%Y-%m-%d"),
        "jobs": dict(Counter(j.status for j in jobs)),
        "failed_jobs": [{"connector": j.connector, "error": (j.error_summary or "")[:200]} for j in jobs if j.status == "failed"],
        "open_reviews": dict(session.execute(select(ReviewTask.task_type, func.count()).where(ReviewTask.status == "open")
                                             .group_by(ReviewTask.task_type)).all()),
        "catalog": {
            "admin_units_published": count(AdminUnit, AdminUnit.status == "published"),
            "attractions": dict(session.execute(select(Attraction.status, func.count()).group_by(Attraction.status)).all()),
            "hubs_published": count(TransportHub, TransportHub.status == "published"),
            "train_services": dict(session.execute(select(TrainService.status, func.count()).group_by(TrainService.status)).all()),
            "fares": dict(session.execute(select(FareProduct.status, func.count()).group_by(FareProduct.status)).all()),
            "gi_products_published": count(LocalFood, LocalFood.status == "published"),
            "maps": dict(session.execute(select(MapExport.status, func.count()).group_by(MapExport.status)).all()),
        },
        "districts_without_published_attractions": count(AdminUnit, AdminUnit.level == "district") - (session.scalar(
            select(func.count(func.distinct(Attraction.district_id))).where(Attraction.status == "published")) or 0),
        "sources_never_fetched": sorted(s.source_id for s in session.scalars(select(DataSource).where(
            DataSource.last_successful_fetch.is_(None), DataSource.recommended_use.in_(("production", "enrichment"))))),
        "due_connectors": [c["name"] for c in due(session, now)],
    }
    if write:
        REPORTS_DIR.mkdir(parents=True, exist_ok=True)
        stem = REPORTS_DIR / f"weekly-{data['week_ending']}"
        stem.with_suffix(".json").write_text(json.dumps(data, indent=2, ensure_ascii=False, default=str), encoding="utf-8")
        lines = [f"# Weekly data report, week ending {data['week_ending']}", "",
                 f"- Jobs this week: {data['jobs'] or 'none'}",
                 f"- Failed jobs: {len(data['failed_jobs'])}" + "".join(f"\n  - {f['connector']}: {f['error']}" for f in data["failed_jobs"]),
                 f"- Open reviews: {data['open_reviews'] or 'none'}",
                 f"- Districts without a published attraction: {data['districts_without_published_attractions']} of 64",
                 f"- Due connectors: {', '.join(data['due_connectors']) or 'none'}",
                 f"- Sources never fetched (production/enrichment): {', '.join(data['sources_never_fetched']) or 'none'}",
                 "", "## Catalog", ""] + [f"- {k}: {v}" for k, v in data["catalog"].items()]
        stem.with_suffix(".md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    return data


def backup(dest_root: Path | None = None) -> Path:
    """Database (SQLite online backup, consistent while the app runs), manifests and registry, in one folder.
    For PostgreSQL, use pg_dump (docs/OPERATIONS_RUNBOOK.md)."""
    url = dbmod.database_url()
    dest = (dest_root or PLATFORM_DIR / "backups") / datetime.utcnow().strftime("%Y%m%d-%H%M%S")
    dest.mkdir(parents=True, exist_ok=True)
    if url.startswith("sqlite:///"):
        src = sqlite3.connect(url[len("sqlite:///"):])
        out = sqlite3.connect(dest / "vromon.db")
        with out:
            src.backup(out)
        src.close()
        out.close()
    else:
        (dest / "DATABASE_IS_POSTGRES.txt").write_text("Back up with pg_dump; see docs/OPERATIONS_RUNBOOK.md\n", encoding="utf-8")
    if MANIFEST_DIR.exists():
        shutil.copytree(MANIFEST_DIR, dest / "manifests")
    shutil.copy2(REGISTRY_FILE, dest / "sources.yaml")
    return dest

"""
Command line: `python -m vromon_data <command>` (run with data-platform's venv).

  registry check | sync        validate sources.yaml / copy it into data_sources
  probe                        test every source URL, write probe-results.json
  db migrate                   bring the database to the app's latest migration
  run <connector> [--dry-run]  run one connector (connectors list: `run --list`)
  jobs                         recent ingestion jobs
  rollback <job_id> --reason   undo one import
  review list [--type T]       open review tasks
  review decide <id> approve|reject --reviewer NAME --reason TEXT
  review export <file.csv> [--type T] / review import <file.csv> --reviewer NAME
  report geography|attractions quality reports
  publish places [--dry-run]    approved attractions -> the app's places table
  maps render [--districts a,b] [--all] [--draft] [--lang en,bn]   district maps -> exports/maps
  ops due | run-due | stale | weekly | backup   scheduled runs, stale data, weekly report, backup
  fares template <file.csv>    empty CSV for transcribing a scanned fare chart (connector transcribed_fares)
  artifact add <source> <file> record a file a person downloaded (e.g. HDX behind its bot challenge)
"""

from __future__ import annotations

import argparse
import json
import sys
import uuid


def _session():
    from vromon_data import db
    engine = db.make_engine()
    return db.session_factory(engine)()


def _registry(args) -> int:
    from vromon_data import registry
    if args.action == "check":
        problems = registry.validate(registry.load())
        for p in problems:
            print("PROBLEM", p)
        print(f"{len(registry.load())} sources, {len(problems)} problems")
        return 1 if problems else 0
    from vromon_data.pipeline import sync_registry
    with _session() as s:
        n = sync_registry(s)
        s.commit()
    print(f"synced {n} sources into data_sources")
    return 0


def _probe(args) -> int:
    from vromon_data import probe
    rows = probe.run()
    ok = sum(1 for r in rows if r["result"] == "ok")
    print(f"{ok}/{len(rows)} URLs reachable")
    return 0


def _db(args) -> int:
    from vromon_data import db
    db.migrate(db.make_engine())
    print("database at head:", db.database_url().split("@")[-1])
    return 0


def _run(args) -> int:
    from vromon_data.connectors import all_connectors
    from vromon_data import pipeline
    conns = all_connectors()
    if args.list or not args.connector:
        for name, cls in conns.items():
            print(f"{name:<24} source={cls.source_id}")
        return 0
    params = json.loads(args.params) if args.params else {}
    with _session() as s:
        report = pipeline.run(conns[args.connector](), s, dry_run=args.dry_run, params=params)
    print(json.dumps(report, indent=2, ensure_ascii=False, default=str))
    return 0 if report.get("status") in ("succeeded", "dry_run") else 1


def _jobs(args) -> int:
    from sqlalchemy import select
    from app.models.catalog import IngestionJob
    with _session() as s:
        for j in s.scalars(select(IngestionJob).order_by(IngestionJob.started_at.desc()).limit(args.limit)):
            print(f"{j.id}  {j.started_at:%Y-%m-%d %H:%M}  {j.connector:<22} {j.status:<12} "
                  f"{json.dumps({k: v for k, v in j.counts.items() if not k.startswith('features')})[:160]}")
    return 0


def _rollback(args) -> int:
    from vromon_data.rollback import rollback_job
    with _session() as s:
        print(rollback_job(s, uuid.UUID(args.job_id), reason=args.reason, reviewer=args.reviewer))
    return 0


def _review(args) -> int:
    from vromon_data import review
    with _session() as s:
        if args.action == "list":
            for t in review.open_tasks(s, args.type, args.limit):
                print(f"{t.id}  p{t.priority}  {t.task_type:<22} {t.entity_type or '':<12} "
                      f"{json.dumps(t.payload, ensure_ascii=False)[:150]}")
            return 0
        if args.action == "export":
            print(f"{review.export_csv(s, args.task_id, args.type)} open tasks written to {args.task_id}")
            return 0
        if args.action == "import":
            if not args.reviewer:
                print("--reviewer is required")
                return 1
            print(review.import_csv(s, args.task_id, args.reviewer))
            return 0
        review.decide(s, uuid.UUID(args.task_id), args.decision, reviewer=args.reviewer, reason=args.reason)
        print("recorded")
    return 0


def _report(args) -> int:
    from vromon_data.reports import attractions, geography
    with _session() as s:
        if args.which == "attractions":
            print(json.dumps(attractions.build(s), indent=2, ensure_ascii=False))
            return 0
        out = geography.build(s)
    print(json.dumps(out["summary"], indent=2, ensure_ascii=False))
    return 0 if out["summary"]["passed"] else 1


def _publish(args) -> int:
    from vromon_data import publish
    with _session() as s:
        run = {"places": publish.publish_places, "service-places": publish.publish_service_places,
               "destinations": publish.publish_destinations, "tidy": publish.tidy_destinations}[args.what]
        print(json.dumps(run(s, dry_run=args.dry_run), indent=2, ensure_ascii=False))
    return 0


def _maps(args) -> int:
    from sqlalchemy import select
    from app.models.catalog import AdminUnit
    from vromon_data.maps.render import render_district
    with _session() as s:
        if args.all:
            slugs = list(s.scalars(select(AdminUnit.slug).where(AdminUnit.level == "district").order_by(AdminUnit.slug)))
        else:
            slugs = [x if x.startswith("bd-district-") else f"bd-district-{x}" for x in (args.districts or "").split(",") if x]
        from vromon_data.paths import EXPORTS_DIR
        for slug in slugs:
            for lang in args.lang.split(","):
                png = EXPORTS_DIR / "maps" / f"{slug}-{lang}{'-draft' if args.draft else ''}.png"
                if args.missing and png.exists():
                    continue
                try:
                    print(render_district(s, slug, lang, draft=args.draft), flush=True)
                except Exception as e:  # one district's failure must not stop the batch
                    s.rollback()           # and must not poison the session for the next one
                    print(f"FAILED {slug} {lang}: {type(e).__name__}: {str(e)[:200]}", flush=True)
    return 0


def _ops(args) -> int:
    from vromon_data import db, ops
    if args.action == "run-due":
        for r in ops.run_due(db.session_factory(db.make_engine())):
            print(r)
        return 0
    if args.action == "backup":
        print("backup written to", ops.backup())
        return 0
    with _session() as s:
        if args.action == "due":
            for c in ops.due(s):
                print(f"{c['name']:<24} every {c['every_days']} days, last success {c['last_success']}")
        elif args.action == "stale":
            print(ops.mark_stale(s))
        else:
            print(json.dumps(ops.weekly_report(s), indent=2, ensure_ascii=False, default=str))
    return 0


def _fares(args) -> int:
    from pathlib import Path
    from vromon_data.connectors.transcribed_fares import COLUMNS, write_template
    write_template(Path(args.file))
    print(f"template with columns {', '.join(COLUMNS)} written to {args.file}")
    return 0


def _artifact(args) -> int:
    from pathlib import Path
    from vromon_data import artifacts, registry
    from vromon_data.pipeline import sync_source
    src = registry.by_id()[args.source_id]
    with _session() as s:
        sync_source(s, src)
        art, new = artifacts.add_manual(s, source_id=args.source_id, file=Path(args.file),
                                        license_snapshot=src.get("license_name"))
        s.commit()
        artifacts.write_manifest(art)
    print(f"{'stored' if new else 'already stored'}: {art.id} sha256={art.sha256} -> raw/{art.storage_path}")
    return 0


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="vromon_data")
    sub = p.add_subparsers(dest="command", required=True)

    reg = sub.add_parser("registry", help="source registry")
    reg.add_argument("action", choices=["check", "sync"])
    reg.set_defaults(func=_registry)

    sub.add_parser("probe", help="test every source URL").set_defaults(func=_probe)

    d = sub.add_parser("db", help="database")
    d.add_argument("action", choices=["migrate"])
    d.set_defaults(func=_db)

    r = sub.add_parser("run", help="run a connector")
    r.add_argument("connector", nargs="?")
    r.add_argument("--dry-run", action="store_true")
    r.add_argument("--list", action="store_true")
    r.add_argument("--params", help="JSON parameters for the connector")
    r.set_defaults(func=_run)

    j = sub.add_parser("jobs", help="recent jobs")
    j.add_argument("--limit", type=int, default=20)
    j.set_defaults(func=_jobs)

    rb = sub.add_parser("rollback", help="undo one import")
    rb.add_argument("job_id")
    rb.add_argument("--reason", required=True)
    rb.add_argument("--reviewer")
    rb.set_defaults(func=_rollback)

    rv = sub.add_parser("review", help="review queue")
    rv.add_argument("action", choices=["list", "decide", "export", "import"])
    rv.add_argument("task_id", nargs="?")
    rv.add_argument("decision", nargs="?", choices=["approve", "reject", "defer"])
    rv.add_argument("--type")
    rv.add_argument("--limit", type=int, default=50)
    rv.add_argument("--reviewer")
    rv.add_argument("--reason")
    rv.set_defaults(func=_review)

    rp = sub.add_parser("report", help="quality reports")
    rp.add_argument("which", choices=["geography", "attractions"])
    rp.set_defaults(func=_report)

    pb = sub.add_parser("publish", help="publish approved records to the app")
    pb.add_argument("what", choices=["destinations", "places", "service-places", "tidy"])
    pb.add_argument("--dry-run", action="store_true")
    pb.set_defaults(func=_publish)

    mp = sub.add_parser("maps", help="district maps")
    mp.add_argument("action", choices=["render"])
    mp.add_argument("--districts")
    mp.add_argument("--all", action="store_true")
    mp.add_argument("--draft", action="store_true")
    mp.add_argument("--missing", action="store_true", help="only maps that don't exist yet")
    mp.add_argument("--lang", default="en,bn")
    mp.set_defaults(func=_maps)

    op = sub.add_parser("ops", help="operations")
    op.add_argument("action", choices=["due", "run-due", "stale", "weekly", "backup"])
    op.set_defaults(func=_ops)

    fr = sub.add_parser("fares", help="fare transcription")
    fr.add_argument("action", choices=["template"])
    fr.add_argument("file")
    fr.set_defaults(func=_fares)

    ar = sub.add_parser("artifact", help="raw artifacts")
    ar.add_argument("action", choices=["add"])
    ar.add_argument("source_id")
    ar.add_argument("file")
    ar.set_defaults(func=_artifact)
    return p


def main(argv: list[str] | None = None) -> None:
    sys.stdout.reconfigure(encoding="utf-8")  # Bangla in reports on a Windows console
    args = build_parser().parse_args(argv)
    sys.exit(args.func(args))

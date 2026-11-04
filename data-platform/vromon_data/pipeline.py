"""
The connector contract (guideline §5.3) and the job runner that every connector goes through.

    fetch → parse → normalize → validate → (change detection) → match/create →
    claims → connector post-processing → resolve → report

A run is one database transaction. A dry run does all of it and then rolls back,
so nothing is published (raw files fetched during a dry run stay on disk: they are
only snapshots). A failed run is rolled back and recorded as failed, so a failed
fetch never erases curated data. Re-running with the same source data changes
nothing: claims equal to the current ones are not repeated.
"""

from __future__ import annotations

import hashlib
import json
import logging
import traceback
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Iterable

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.catalog import (
    DataSource, EntityExternalId, EntityName, IngestionJob, IngestionJobError, ReviewTask, SourceArtifact,
    StagingRecord,
)
from vromon_data import artifacts, claims, registry
from vromon_data.entities import ENTITY_TYPES
from vromon_data.text import clean, match_key

logger = logging.getLogger("vromon_data")


@dataclass
class Record:
    """One source record after normalization."""
    entity_type: str
    source_record_id: str
    fields: dict[str, Any]                                      # curated field -> value (None: the source says nothing)
    raw: dict[str, Any] = field(default_factory=dict)            # source-native values
    external_ids: list[tuple[str, str]] = field(default_factory=list)
    names: list[tuple[str, str, str]] = field(default_factory=list)   # (lang, name, kind)
    artifact_id: uuid.UUID | None = None
    source_url: str | None = None
    source_published_at: Any = None
    confidence: str = "medium"
    verification_method: str | None = None
    errors: list[str] = field(default_factory=list)
    review: list[tuple[str, dict]] = field(default_factory=list)  # (task_type, payload) for a person
    hash_extra: str = ""                                          # e.g. a geometry checksum
    entity_id: uuid.UUID | None = None                           # set by the runner
    change: str = "added"

    def record_hash(self) -> str:
        payload = json.dumps([self.fields, sorted(self.external_ids), sorted(self.names), self.hash_extra],
                             sort_keys=True, ensure_ascii=False, default=str)
        return hashlib.sha256(payload.encode("utf-8")).hexdigest()


class Context:
    """What a connector sees during a run."""

    def __init__(self, session: Session, job: IngestionJob, source: dict[str, Any], dry_run: bool, params: dict):
        self.session = session
        self.job = job
        self.source = source
        self.dry_run = dry_run
        self.params = params
        self.now = datetime.utcnow()
        self.new_artifacts: list[SourceArtifact] = []
        self.counts: dict[str, int] = {}

    def count(self, key: str, n: int = 1) -> None:
        self.counts[key] = self.counts.get(key, 0) + n

    def error(self, stage: str, message: str, source_record_id: str | None = None, **detail) -> None:
        self.session.add(IngestionJobError(job_id=self.job.id, stage=stage, source_record_id=source_record_id,
                                           message=message, detail=detail))
        self.count(f"errors_{stage}")

    def store_artifact(self, *, uri: str, content: bytes, content_type: str | None, filename_hint: str | None = None) -> SourceArtifact:
        art, new = artifacts.store(self.session, source_id=self.source["source_id"], uri=uri, content=content,
                                   content_type=content_type, license_snapshot=self.source.get("license_name"),
                                   job_id=self.job.id, filename_hint=filename_hint)
        if new:
            self.new_artifacts.append(art)
            self.count("artifacts_new")
        else:
            self.count("artifacts_reused")
        return art

    def lookup(self, entity_type: str, provider: str, external_id: str) -> uuid.UUID | None:
        return self.session.scalar(select(EntityExternalId.entity_id).where(
            EntityExternalId.entity_type == entity_type, EntityExternalId.provider == provider,
            EntityExternalId.external_id == external_id))

    def review(self, task_type: str, *, entity_type: str | None = None, entity_id=None, related_entity_id=None,
               priority: int = 2, **payload) -> None:
        """Open a review task unless the same open task for the same entity already exists."""
        if entity_id is not None:
            q = select(ReviewTask.id).where(ReviewTask.task_type == task_type, ReviewTask.status == "open",
                                            ReviewTask.entity_id == entity_id)
            q = q.where(ReviewTask.related_entity_id == related_entity_id) if related_entity_id else \
                q.where(ReviewTask.related_entity_id.is_(None))
            if self.session.scalar(q):
                return
        self.session.add(ReviewTask(task_type=task_type, entity_type=entity_type, entity_id=entity_id,
                                    related_entity_id=related_entity_id, payload=payload, priority=priority,
                                    job_id=self.job.id))
        self.count(f"review_{task_type}")


class Connector:
    """Base class. Subclasses set the class attributes and implement fetch/parse/normalize."""

    name: str = ""
    version: str = "1"
    source_id: str = ""
    # Official production sources: their claims are accepted on import. Others are proposed,
    # and new entities from them wait for review.
    auto_accept: bool = False
    # Process records in this order of entity type (parents before children)
    order: tuple[str, ...] = ()

    def discover(self, ctx: Context) -> dict[str, Any]:
        return {"source": ctx.source["source_id"]}

    def fetch(self, ctx: Context) -> list[SourceArtifact]:
        raise NotImplementedError

    def parse(self, ctx: Context, arts: list[SourceArtifact]) -> Iterable[dict[str, Any]]:
        raise NotImplementedError

    def normalize(self, ctx: Context, raw: dict[str, Any]) -> Record | None:
        raise NotImplementedError

    def validate(self, ctx: Context, records: list[Record]) -> None:
        """Append messages to record.errors (blocks import) or record.review (imports, asks a person)."""

    def match(self, ctx: Context, record: Record) -> uuid.UUID | None:
        """Existing entity for this record: by an identical external id only (never by a similar name)."""
        for provider, ext in record.external_ids:
            found = ctx.lookup(record.entity_type, provider, ext)
            if found:
                return found
        return None

    def create(self, ctx: Context, record: Record) -> uuid.UUID:
        raise NotImplementedError(f"{self.name} can't create {record.entity_type}")

    def resolve_field(self, ctx: Context, record: Record, field_name: str, value: Any) -> Any:
        """Turn a reference in a field into its stored value (e.g. a parent's external id into its uuid)."""
        return value

    def after(self, ctx: Context, records: list[Record]) -> None:
        """Connector-specific work once claims exist (geometry, adjacency …)."""

    def report(self, ctx: Context) -> dict[str, Any]:
        return dict(ctx.counts)


# ---------------------------------------------------------------------------

def sync_source(session: Session, source: dict[str, Any]) -> DataSource:
    row = session.get(DataSource, source["source_id"])
    cols = {c.name for c in DataSource.__table__.columns}
    values = {k: v for k, v in source.items() if k in cols and k != "source_id"}
    if row is None:
        row = DataSource(source_id=source["source_id"], **values)
        session.add(row)
    else:
        for k, v in values.items():
            setattr(row, k, v)
        row.updated_at = datetime.utcnow()
    return row


def sync_registry(session: Session) -> int:
    sources = registry.load()
    for s in sources:
        sync_source(session, s)
    return len(sources)


def _previous_hashes(session: Session, source_id: str) -> dict[tuple[str, str], str]:
    """Latest record hash per (entity_type, source_record_id) from successful real runs."""
    latest = (select(StagingRecord.entity_type, StagingRecord.source_record_id,
                     func.max(StagingRecord.created_at).label("at"))
              .join(IngestionJob, IngestionJob.id == StagingRecord.job_id)
              .where(StagingRecord.source_id == source_id, IngestionJob.status == "succeeded")
              .group_by(StagingRecord.entity_type, StagingRecord.source_record_id).subquery())
    rows = session.execute(select(StagingRecord.entity_type, StagingRecord.source_record_id, StagingRecord.record_hash)
                           .join(latest, (latest.c.entity_type == StagingRecord.entity_type)
                                 & (latest.c.source_record_id == StagingRecord.source_record_id)
                                 & (latest.c.at == StagingRecord.created_at))
                           .where(StagingRecord.source_id == source_id)).all()
    return {(t, r): h for t, r, h in rows}


def _add_names(ctx: Context, record: Record) -> None:
    for lang, name, kind in record.names:
        name = clean(name)
        if not name:
            continue
        exists = ctx.session.scalar(select(EntityName.id).where(
            EntityName.entity_type == record.entity_type, EntityName.entity_id == record.entity_id,
            EntityName.lang == lang, EntityName.name == name))
        if not exists:
            ctx.session.add(EntityName(entity_type=record.entity_type, entity_id=record.entity_id, lang=lang, name=name,
                                       kind=kind, match_key=match_key(name), source_id=ctx.source["source_id"],
                                       job_id=ctx.job.id))


def _add_external_ids(ctx: Context, record: Record) -> None:
    for provider, ext in record.external_ids:
        owner = ctx.lookup(record.entity_type, provider, ext)
        if owner is None:
            ctx.session.add(EntityExternalId(entity_type=record.entity_type, entity_id=record.entity_id, provider=provider,
                                             external_id=ext, source_id=ctx.source["source_id"], job_id=ctx.job.id))
            ctx.session.flush()
        elif owner != record.entity_id:
            ctx.review("duplicate", entity_type=record.entity_type, entity_id=record.entity_id, related_entity_id=owner,
                       reason=f"{provider} id {ext} already belongs to another record")


def run(connector: Connector, session: Session, *, dry_run: bool = False, params: dict | None = None) -> dict[str, Any]:
    """Run one connector. Returns the report (counts, job id, status)."""
    params = params or {}
    sources = registry.by_id()
    source = sources[connector.source_id]
    sync_source(session, source)
    session.flush()
    job = IngestionJob(connector=connector.name, connector_version=connector.version, source_id=source["source_id"],
                       params={**params, "dry_run": dry_run}, counts={})
    session.add(job)
    session.flush()
    ctx = Context(session, job, source, dry_run, params)
    try:
        arts = connector.fetch(ctx)
        raws = list(connector.parse(ctx, arts))
        ctx.count("parsed", len(raws))
        records: list[Record] = []
        for raw in raws:
            try:
                rec = connector.normalize(ctx, raw)
            except Exception as e:  # one bad record must not stop the run
                ctx.error("normalize", f"{type(e).__name__}: {e}", str(raw.get("id", ""))[:200])
                continue
            if rec is not None:
                records.append(rec)
        connector.validate(ctx, records)
        order = {t: i for i, t in enumerate(connector.order)}
        records.sort(key=lambda r: order.get(r.entity_type, 99))

        previous = _previous_hashes(session, source["source_id"])
        seen: set[tuple[str, str]] = set()
        status = "accepted" if connector.auto_accept else "proposed"
        touched: set[tuple[str, uuid.UUID]] = set()
        for rec in records:
            key = (rec.entity_type, rec.source_record_id)
            if key in seen:
                ctx.error("validate", "duplicate source record id in this run", rec.source_record_id)
                continue
            seen.add(key)
            h = rec.record_hash()
            rec.change = "added" if key not in previous else ("unchanged" if previous[key] == h else "changed")
            ctx.count(f"records_{rec.change}")
            staging = StagingRecord(job_id=job.id, source_id=source["source_id"], entity_type=rec.entity_type,
                                    source_record_id=rec.source_record_id, artifact_id=rec.artifact_id, record_hash=h,
                                    raw=json.loads(json.dumps(rec.raw, default=str, ensure_ascii=False)),
                                    normalized=json.loads(json.dumps(rec.fields, default=str, ensure_ascii=False)),
                                    validation_errors=rec.errors, change=rec.change,
                                    status="invalid" if rec.errors else ("review" if rec.review else "valid"))
            session.add(staging)
            if rec.errors:
                ctx.count("rejected")
                for msg in rec.errors:
                    ctx.error("validate", msg, rec.source_record_id)
                continue
            rec.entity_id = connector.match(ctx, rec)
            if rec.entity_id is None:
                rec.entity_id = connector.create(ctx, rec)
                ctx.count("entities_created")
                if not connector.auto_accept:
                    ctx.review("new_entity", entity_type=rec.entity_type, entity_id=rec.entity_id,
                               source_record_id=rec.source_record_id)
            staging.target_entity_id = rec.entity_id
            _add_external_ids(ctx, rec)
            _add_names(ctx, rec)
            for field_name, value in rec.fields.items():
                value = connector.resolve_field(ctx, rec, field_name, value)
                c = claims.add_claim(session, entity_type=rec.entity_type, entity_id=rec.entity_id, field=field_name,
                                     value=value, source_id=source["source_id"], status=status,
                                     retrieved_at=ctx.now, job_id=job.id, source_record_id=rec.source_record_id,
                                     source_url=rec.source_url, source_published_at=rec.source_published_at,
                                     confidence=rec.confidence, verification_method=rec.verification_method)
                if c is not None:
                    ctx.count("claims_new")
            for task_type, payload in rec.review:
                ctx.review(task_type, entity_type=rec.entity_type, entity_id=rec.entity_id,
                           source_record_id=rec.source_record_id, **payload)
            touched.add((rec.entity_type, rec.entity_id))
            session.flush()

        # Records the source no longer has: never deleted, a person decides
        if params.get("full_snapshot", True):
            for (etype, srid) in sorted(previous.keys() - seen):
                entity_id = session.scalar(select(StagingRecord.target_entity_id).where(
                    StagingRecord.source_id == source["source_id"], StagingRecord.entity_type == etype,
                    StagingRecord.source_record_id == srid, StagingRecord.target_entity_id.is_not(None))
                    .order_by(StagingRecord.created_at.desc()).limit(1))
                ctx.review("source_record_removed", entity_type=etype, entity_id=entity_id, source_record_id=srid,
                           priority=1)
                ctx.count("records_removed")

        connector.after(ctx, records)
        for etype, eid in touched:
            if claims.resolve(session, etype, eid):
                ctx.count("entities_changed")
        report = connector.report(ctx)
        if dry_run:
            session.rollback()
            report.update(job_id=None, status="dry_run")
            return report
        job.status = "succeeded"
        job.finished_at = datetime.utcnow()
        job.counts = report
        src = session.get(DataSource, source["source_id"])
        src.last_successful_fetch = job.finished_at
        session.commit()
        for art in ctx.new_artifacts:
            artifacts.write_manifest(art)
        report.update(job_id=str(job.id), status="succeeded")
        return report
    except Exception as e:
        session.rollback()
        logger.exception("connector %s failed", connector.name)
        if dry_run:
            raise
        sync_source(session, source)
        session.flush()
        failed = IngestionJob(id=job.id, connector=connector.name, connector_version=connector.version,
                              source_id=source["source_id"], status="failed", params={**params, "dry_run": False},
                              counts=dict(ctx.counts), error_summary="".join(traceback.format_exception_only(e))[:2000],
                              finished_at=datetime.utcnow())
        session.add(failed)
        session.commit()
        return {**ctx.counts, "job_id": str(job.id), "status": "failed", "error": str(e)}

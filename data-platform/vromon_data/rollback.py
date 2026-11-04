"""
Undo one import (guideline §2.4): its claims are rejected, the names, external ids,
boundaries and adjacencies it added are removed, entities it created that have no
other evidence become inactive, and every affected entity is resolved again from
the claims that remain. Staging records and raw artifacts are kept as history.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import delete, select, update
from sqlalchemy.orm import Session

from app.models.catalog import (
    AdminAdjacency, AdminBoundary, EntityExternalId, EntityName, IngestionJob, ReviewTask, SourceClaim,
    VerificationEvent,
)
from vromon_data import claims
from vromon_data.entities import ENTITY_TYPES


def rollback_job(session: Session, job_id: uuid.UUID, *, reason: str, reviewer: str | None = None) -> dict:
    job = session.get(IngestionJob, job_id)
    if job is None:
        raise ValueError(f"no job {job_id}")
    if job.status != "succeeded":
        raise ValueError(f"job {job_id} is {job.status}; only a succeeded job can be rolled back")

    job_claims = session.scalars(select(SourceClaim).where(SourceClaim.job_id == job_id)).all()
    touched = {(c.entity_type, c.entity_id) for c in job_claims}
    for c in job_claims:
        c.status = "rejected"
        c.review_notes = f"rolled back: {reason}"
    # The claims these superseded become current again
    for c in job_claims:
        prev = session.scalars(select(SourceClaim).where(
            SourceClaim.entity_type == c.entity_type, SourceClaim.entity_id == c.entity_id,
            SourceClaim.field_name == c.field_name, SourceClaim.source_id == c.source_id,
            SourceClaim.status == "superseded", SourceClaim.created_at < c.created_at,
        ).order_by(SourceClaim.created_at.desc()).limit(1)).first()
        if prev is not None:
            # add_claim notes the status it had before being superseded
            note = prev.review_notes or ""
            prev.status = note.split(":", 1)[1] if note.startswith("superseded:") else "accepted"

    session.execute(delete(EntityName).where(EntityName.job_id == job_id))
    session.execute(delete(EntityExternalId).where(EntityExternalId.job_id == job_id))
    session.execute(delete(AdminAdjacency).where(AdminAdjacency.job_id == job_id))
    replaced = session.scalars(select(AdminBoundary).where(AdminBoundary.job_id == job_id)).all()
    for b in replaced:
        earlier = session.scalars(select(AdminBoundary).where(
            AdminBoundary.admin_unit_id == b.admin_unit_id, AdminBoundary.id != b.id,
            AdminBoundary.created_at < b.created_at).order_by(AdminBoundary.created_at.desc()).limit(1)).first()
        if earlier is not None:
            earlier.is_current = True
        session.delete(b)
    session.execute(update(ReviewTask).where(ReviewTask.job_id == job_id, ReviewTask.status == "open")
                    .values(status="rejected", reason=f"job rolled back: {reason}", decided_at=datetime.utcnow()))
    session.flush()

    deactivated = 0
    for etype, eid in touched:
        spec = ENTITY_TYPES[etype]
        entity = session.get(spec.model, eid)
        live = session.scalar(select(SourceClaim.id).where(
            SourceClaim.entity_type == etype, SourceClaim.entity_id == eid,
            SourceClaim.status.in_(("accepted", "proposed"))).limit(1))
        if entity is not None and live is None:
            entity.status = "inactive"
            deactivated += 1
        claims.resolve(session, etype, eid)
        session.add(VerificationEvent(entity_type=etype, entity_id=eid, method="rollback", reviewer=reviewer,
                                      reason=f"job {job_id}: {reason}"))
    job.status = "rolled_back"
    session.commit()
    return {"claims_rejected": len(job_claims), "entities_touched": len(touched), "entities_deactivated": deactivated}

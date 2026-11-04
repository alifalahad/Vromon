"""
Claims → curated values.

A curated column holds the value of the best accepted claim for that field:
the most reliable source class first (guideline §6.3), then the most recent
retrieval. `field_status[field]` says where the value came from and whether it is
verified, imported, under review or unknown, so one record can have verified
coordinates and unknown opening hours (guideline §6.1).
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.catalog import DataSource, SourceClaim, VerificationEvent
from vromon_data.entities import ENTITY_TYPES

# Lower is stronger. A class doesn't make a value right; it only orders conflicting claims.
RELIABILITY_RANK = {
    "direct_human": 0, "official_government": 1, "official_operator": 2, "licensed_provider": 3,
    "reputable_secondary": 4, "community_geospatial": 5, "unverified_user": 6, "ai_extracted": 7,
}


def wrap(value: Any) -> dict | None:
    return None if value is None else {"v": value}


def unwrap(claimed: dict | None) -> Any:
    return None if claimed is None else claimed.get("v")


def _jsonable(value: Any) -> Any:
    if isinstance(value, uuid.UUID):
        return str(value)
    return value


def add_claim(session: Session, *, entity_type: str, entity_id: uuid.UUID, field: str, value: Any, source_id: str,
              status: str, retrieved_at: datetime, job_id=None, source_record_id: str | None = None,
              source_url: str | None = None, source_published_at=None, confidence: str = "medium",
              verification_method: str | None = None, verified_at: datetime | None = None) -> SourceClaim | None:
    """Record a claim. A claim equal to this source's current one for the field is not repeated;
    a different one supersedes it (history is kept)."""
    value = _jsonable(value)
    current = session.scalars(select(SourceClaim).where(
        SourceClaim.entity_type == entity_type, SourceClaim.entity_id == entity_id, SourceClaim.field_name == field,
        SourceClaim.source_id == source_id, SourceClaim.status.in_(("accepted", "proposed")),
    )).all()
    for c in current:
        if unwrap(c.claimed_value) == value:
            return None
    for c in current:
        c.review_notes = f"superseded:{c.status}"  # lets a rollback restore it
        c.status = "superseded"
    claim = SourceClaim(entity_type=entity_type, entity_id=entity_id, field_name=field, claimed_value=wrap(value),
                        source_id=source_id, source_record_id=source_record_id, source_url=source_url,
                        source_published_at=source_published_at, retrieved_at=retrieved_at, verified_at=verified_at,
                        verification_method=verification_method, confidence=confidence, status=status, job_id=job_id)
    session.add(claim)
    return claim


def resolve(session: Session, entity_type: str, entity_id: uuid.UUID) -> dict[str, Any]:
    """Recompute the entity's curated columns and field_status from its claims. Returns changed fields."""
    spec = ENTITY_TYPES[entity_type]
    entity = session.get(spec.model, entity_id)
    if entity is None:
        return {}
    session.flush()
    claims = session.scalars(select(SourceClaim).where(SourceClaim.entity_type == entity_type,
                                                       SourceClaim.entity_id == entity_id)).all()
    classes = dict(session.execute(select(DataSource.source_id, DataSource.reliability_class)).all())
    status: dict[str, Any] = {}
    changed: dict[str, Any] = {}
    for field in spec.resolved_fields:
        accepted = [c for c in claims if c.field_name == field and c.status == "accepted"]
        proposed = [c for c in claims if c.field_name == field and c.status == "proposed"]
        if accepted:
            best = min(accepted, key=lambda c: (RELIABILITY_RANK.get(classes.get(c.source_id, ""), 9),
                                                -c.retrieved_at.timestamp()))
            value = unwrap(best.claimed_value)
            status[field] = {
                "status": "verified" if best.verified_at else "imported",
                "source_id": best.source_id, "claim_id": str(best.id),
                "retrieved_at": best.retrieved_at.isoformat(timespec="seconds"),
                **({"verified_at": best.verified_at.isoformat(timespec="seconds"),
                    "verification_method": best.verification_method} if best.verified_at else {}),
                **({"conflicts": len({str(unwrap(c.claimed_value)) for c in accepted})} if
                   len({str(unwrap(c.claimed_value)) for c in accepted}) > 1 else {}),
            }
        else:
            value = None
            status[field] = {"status": "needs_review" if proposed else "unknown"}
        value = spec.coerce(field, value)
        old = getattr(entity, field)
        if old != value:
            setattr(entity, field, value)
            changed[field] = (old, value)
            session.add(VerificationEvent(entity_type=entity_type, entity_id=entity_id, field_name=field,
                                          old_value=wrap(_jsonable(old)), new_value=wrap(_jsonable(value)),
                                          source_id=status[field].get("source_id"), method="resolve"))
    entity.field_status = status
    if hasattr(entity, "updated_at") and changed:
        entity.updated_at = datetime.utcnow()
    return changed

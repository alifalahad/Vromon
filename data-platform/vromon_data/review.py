"""
The review queue (guideline §5.5). Every decision is audited: reviewer, time, reason,
and what it changed. Approving a `new_entity` accepts the entity's proposed claims and
publishes it; rejecting rejects them. Other task types record the decision; the
connector or a later phase acts on it.
"""

from __future__ import annotations

import csv
import json
import uuid
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.catalog import ReviewTask, SourceClaim, VerificationEvent
from vromon_data import claims
from vromon_data.entities import ENTITY_TYPES


def open_tasks(session: Session, task_type: str | None = None, limit: int = 50) -> list[ReviewTask]:
    q = select(ReviewTask).where(ReviewTask.status == "open")
    if task_type:
        q = q.where(ReviewTask.task_type == task_type)
    return list(session.scalars(q.order_by(ReviewTask.priority, ReviewTask.created_at).limit(limit)))


def decide(session: Session, task_id: uuid.UUID, decision: str, *, reviewer: str | None, reason: str | None) -> ReviewTask:
    if not reviewer or not reason:
        raise ValueError("a decision needs a reviewer and a reason")
    task = session.get(ReviewTask, task_id)
    if task is None or task.status != "open":
        raise ValueError(f"no open task {task_id}")
    status = {"approve": "approved", "reject": "rejected", "defer": "deferred"}[decision]
    task.status = status
    task.reviewer = reviewer
    task.reason = reason
    task.decided_at = datetime.utcnow()
    task.decision = {"decision": decision}

    if task.task_type == "new_entity" and task.entity_id and decision in ("approve", "reject"):
        new_status = "accepted" if decision == "approve" else "rejected"
        proposed = session.scalars(select(SourceClaim).where(
            SourceClaim.entity_type == task.entity_type, SourceClaim.entity_id == task.entity_id,
            SourceClaim.status == "proposed")).all()
        for c in proposed:
            c.status = new_status
            if decision == "approve":
                c.verified_at = c.verified_at or datetime.utcnow()
                c.verification_method = c.verification_method or "human_review"
        entity = session.get(ENTITY_TYPES[task.entity_type].model, task.entity_id)
        if entity is not None:
            entity.status = "published" if decision == "approve" else "rejected"
        claims.resolve(session, task.entity_type, task.entity_id)
        task.decision["claims"] = len(proposed)
    if task.entity_type and task.entity_id:
        session.add(VerificationEvent(entity_type=task.entity_type, entity_id=task.entity_id, method="review",
                                      reviewer=reviewer, reason=f"{task.task_type}: {decision}: {reason}"))
    session.commit()
    return task


# --- Spreadsheet review: export open tasks, a person fills `decision` and `reason`, import ----------

EXPORT_COLUMNS = ["task_id", "task_type", "district", "name_en", "name_bn", "category", "lat", "lon", "map",
                  "wikidata", "official_portal_match", "sitelinks", "has_image", "detail", "decision", "reason"]


def export_csv(session: Session, path, task_type: str | None = None) -> int:
    """Open tasks as a UTF-8 (with BOM, so Excel shows Bangla) CSV. Returns the number of rows."""
    tasks = open_tasks(session, task_type, limit=100000)
    with open(path, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=EXPORT_COLUMNS)
        w.writeheader()
        for t in tasks:
            p = t.payload or {}
            lat, lon = p.get("lat"), p.get("lon")
            w.writerow({
                "task_id": str(t.id), "task_type": t.task_type, "district": (p.get("district") or "").removeprefix("bd-district-"),
                "name_en": p.get("name_en"), "name_bn": p.get("name_bn"), "category": p.get("category"),
                "lat": lat, "lon": lon,
                "map": f"https://www.openstreetmap.org/?mlat={lat}&mlon={lon}#map=16/{lat}/{lon}" if lat else "",
                "wikidata": p.get("wikidata"), "official_portal_match": p.get("official_portal_match"),
                "sitelinks": p.get("sitelinks"), "has_image": p.get("has_image"),
                "detail": json.dumps({k: v for k, v in p.items() if k not in EXPORT_COLUMNS}, ensure_ascii=False)[:300],
                "decision": "", "reason": "",
            })
    return len(tasks)


def import_csv(session: Session, path, reviewer: str) -> dict[str, int]:
    """Apply the decisions filled in an exported CSV. Rows without a decision are skipped."""
    counts = {"approve": 0, "reject": 0, "defer": 0, "skipped": 0, "errors": 0}
    with open(path, encoding="utf-8-sig", newline="") as f:
        for row in csv.DictReader(f):
            decision = (row.get("decision") or "").strip().lower()
            if decision not in ("approve", "reject", "defer"):
                counts["skipped"] += 1
                continue
            try:
                decide(session, uuid.UUID(row["task_id"]), decision, reviewer=reviewer,
                       reason=(row.get("reason") or "").strip() or f"{decision} (spreadsheet review)")
                counts[decision] += 1
            except ValueError:
                counts["errors"] += 1
    return counts

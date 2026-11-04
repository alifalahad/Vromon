"""
Attraction review done by the assistant on the owner's behalf (owner's request, 2026-11-05).

Every decision is recorded with reviewer "Claude (AI review delegated by owner)" and
verification method `ai_review_delegated`, so it is never mistaken for a person's check.
The rules are deliberately conservative; anything they don't settle stays open for a person:

  reject   the source no longer has it because it lies outside Bangladesh (source_record_removed)
  reject   the weaker record of a duplicate pair (the other is kept)
  approve  a named record with a location inside its district and evidence it is a real
           attraction: on the district's official tourist-spot list, or a Wikipedia article,
           or a photo on Wikimedia Commons
  leave    near a district border (missing_admin_area), no location (location_needed), or no evidence
"""

from __future__ import annotations

from collections import Counter, defaultdict

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.catalog import ReviewTask, SourceClaim
from vromon_data import review

REVIEWER = "Claude (AI review delegated by owner, 2026-11-05)"
METHOD = "ai_review_delegated"


def _evidence(task: ReviewTask) -> int:
    p = task.payload or {}
    return 3 * bool(p.get("official_portal_match")) + min(int(p.get("sitelinks") or 0), 5) + bool(p.get("has_image"))


def run(session: Session) -> Counter:
    counts: Counter = Counter()
    open_tasks = list(session.scalars(select(ReviewTask).where(ReviewTask.status == "open",
                                                               ReviewTask.entity_type == "attraction")))
    by_entity: dict = defaultdict(list)
    for t in open_tasks:
        by_entity[t.entity_id].append(t)
    new = {t.entity_id: t for t in open_tasks if t.task_type == "new_entity"}
    located = {c.entity_id for c in session.scalars(select(SourceClaim).where(
        SourceClaim.entity_type == "attraction", SourceClaim.field_name == "latitude",
        SourceClaim.status.in_(("proposed", "accepted")), SourceClaim.claimed_value.is_not(None)))}

    # 1. Outside Bangladesh: the source dropped them
    for t in [t for t in open_tasks if t.task_type == "source_record_removed"]:
        if t.entity_id in new:
            review.decide(session, new.pop(t.entity_id).id, "reject", reviewer=REVIEWER, method=METHOD,
                          reason="not in Bangladesh (more than 1 km outside every district); dropped by the source")
            counts["rejected_outside_bangladesh"] += 1
        review.decide(session, t.id, "approve", reviewer=REVIEWER, method=METHOD, reason="record no longer in the source")

    # 2. Duplicates: keep the better-evidenced record
    for t in [t for t in open_tasks if t.task_type == "duplicate"]:
        a, b = new.get(t.entity_id), new.get(t.related_entity_id)
        if a is None or b is None:
            continue
        keep, drop = (a, b) if _evidence(a) >= _evidence(b) else (b, a)
        review.decide(session, drop.id, "reject", reviewer=REVIEWER, method=METHOD,
                      reason=f"duplicate of {keep.payload.get('name_en') or keep.payload.get('name_bn')}")
        new.pop(drop.entity_id, None)
        review.decide(session, t.id, "approve", reviewer=REVIEWER, method=METHOD, reason="same place; weaker record rejected")
        counts["rejected_duplicate"] += 1

    # 3. Approve the well-evidenced, unambiguous ones
    for entity_id, t in list(new.items()):
        others = {x.task_type for x in by_entity[entity_id] if x.status == "open" and x.id != t.id}
        p = t.payload or {}
        if "missing_admin_area" in others:
            counts["left_near_border"] += 1
            continue
        if entity_id not in located or "location_needed" in others:
            counts["left_no_location"] += 1
            continue
        if not (p.get("name_en") or p.get("name_bn")):
            counts["left_no_name"] += 1
            continue
        if not (p.get("official_portal_match") or int(p.get("sitelinks") or 0) >= 1 or p.get("has_image")):
            counts["left_no_evidence"] += 1
            continue
        evidence = [w for w, ok in (("on the official district list", p.get("official_portal_match")),
                                    ("has a Wikipedia article", int(p.get("sitelinks") or 0) >= 1),
                                    ("has a Commons photo", p.get("has_image"))) if ok]
        review.decide(session, t.id, "approve", reviewer=REVIEWER, method=METHOD,
                      reason="named, located inside its district; " + ", ".join(evidence))
        counts["approved"] += 1
    return counts

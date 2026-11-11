"""
Duplicate candidates among attractions (guideline §3.2): the same place recorded twice,
in one source or across sources. A pair is a candidate when it is in the same district,
close together for its kind (a building within 300 m; an island, forest or beach within
a few km), and its names are alike in any script and spelling. Candidates become
`duplicate` review tasks; nothing is merged automatically.
"""

from __future__ import annotations

import math
import uuid
from collections import defaultdict

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.catalog import EntityName, ReviewTask, SourceClaim
from vromon_data.text import name_similarity

# How far apart two records of the same place can be, by category (km)
RADIUS_KM = {"island": 8.0, "beach": 5.0, "forest_protected": 8.0, "river_wetland": 5.0, "hill_mountain": 3.0,
             "lake": 1.5, "tea_garden": 3.0, "park_garden": 1.0, "zoo_safari": 1.5}
DEFAULT_RADIUS_KM = 0.3
NAME_MATCH = 85


def _km(a: tuple[float, float], b: tuple[float, float]) -> float:
    p1, p2 = math.radians(a[0]), math.radians(b[0])
    dp, dl = math.radians(b[0] - a[0]), math.radians(b[1] - a[1])
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * 6371.0 * math.asin(math.sqrt(h))


def _current(session: Session) -> dict[uuid.UUID, dict]:
    """Each attraction's current values (accepted, else proposed), so unreviewed records are compared too."""
    out: dict[uuid.UUID, dict] = defaultdict(dict)
    for c in session.scalars(select(SourceClaim).where(
            SourceClaim.entity_type == "attraction",
            SourceClaim.field_name.in_(("district_id", "category_code", "latitude", "longitude")),
            SourceClaim.status.in_(("proposed", "accepted"))).order_by(SourceClaim.status.desc())):
        out[c.entity_id].setdefault(c.field_name, (c.claimed_value or {}).get("v"))
    return out


def _names(session: Session) -> dict[uuid.UUID, list[str]]:
    names: dict[uuid.UUID, list[str]] = defaultdict(list)
    for n in session.scalars(select(EntityName).where(EntityName.entity_type == "attraction")):
        names[n.entity_id].append(n.name)
    return names


def find_candidates(session: Session) -> list[tuple[uuid.UUID, uuid.UUID, float, float]]:
    """(a, b, distance km, name similarity) for every candidate pair."""
    values = _current(session)
    names = _names(session)
    rejected = set(session.scalars(select(ReviewTask.entity_id).where(
        ReviewTask.task_type == "new_entity", ReviewTask.status == "rejected")))
    by_district: dict = defaultdict(list)
    for eid, v in values.items():
        if eid not in rejected and v.get("latitude") is not None and v.get("district_id"):
            by_district[v["district_id"]].append(eid)
    out = []
    for ids in by_district.values():
        for i, a in enumerate(ids):
            for b in ids[i + 1:]:
                va, vb = values[a], values[b]
                radius = max(RADIUS_KM.get(va.get("category_code"), DEFAULT_RADIUS_KM),
                             RADIUS_KM.get(vb.get("category_code"), DEFAULT_RADIUS_KM))
                d = _km((va["latitude"], va["longitude"]), (vb["latitude"], vb["longitude"]))
                if d > radius:
                    continue
                sim = max((name_similarity(x, y) for x in names[a] for y in names[b]), default=0.0)
                if sim >= NAME_MATCH:
                    out.append((a, b, round(d, 3), sim))
    return out


def open_tasks(session: Session, job_id=None) -> int:
    """Open a `duplicate` task for each new candidate pair. Returns the number opened."""
    known = {frozenset((t.entity_id, t.related_entity_id)) for t in session.scalars(
        select(ReviewTask).where(ReviewTask.task_type == "duplicate"))}
    n = 0
    names = _names(session)
    for a, b, d, sim in find_candidates(session):
        if frozenset((a, b)) in known:
            continue
        session.add(ReviewTask(task_type="duplicate", entity_type="attraction", entity_id=a, related_entity_id=b,
                               payload={"distance_km": d, "name_similarity": round(sim), "record_a": " / ".join(names[a]),
                                        "record_b": " / ".join(names[b])}, priority=1, job_id=job_id))
        n += 1
    session.flush()
    return n

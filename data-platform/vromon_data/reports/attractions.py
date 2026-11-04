"""
Attraction quality and coverage report per district (guideline §16: counts shown with
verification status, never on their own). Includes the district portal's official
tourist spots that no catalog record matches: the coverage gap for a person to follow up.
Writes quality-reports/attractions-<date>.json and .md.
"""

from __future__ import annotations

import json
import re
import uuid
from collections import Counter, defaultdict
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.catalog import AdminUnit, Attraction, AttractionMedia, EntityName, SourceArtifact, SourceClaim
from vromon_data import artifacts
from vromon_data.paths import REPORTS_DIR
from vromon_data.text import clean, name_similarity

_PORTAL_TITLE = re.compile(r'data-column="title">\s*([^<]+?)\s*</td>')
_SNAPSHOT = re.compile(r"(bd-district-[a-z0-9-]+?)-tourist-spot(?:-p\d+)?\.html$")


def _portal_spots(session: Session) -> dict[str, list[str]]:
    """District slug → names on its portal tourist-spot list, from the latest stored snapshot."""
    out: dict[str, list[str]] = {}
    arts = session.scalars(select(SourceArtifact).where(SourceArtifact.uri.like("%/pages/tourist-spot%"))
                           .order_by(SourceArtifact.fetched_at)).all()
    for a in arts:
        m = _SNAPSHOT.search(a.storage_path)
        path = artifacts.raw_path(a)
        if not m or not path.exists():
            continue
        spots = out.setdefault(m.group(1), [])
        for n in _PORTAL_TITLE.findall(path.read_text(encoding="utf-8", errors="replace")):
            if clean(n) and clean(n) not in spots:
                spots.append(clean(n))
    return out


def build(session: Session, write: bool = True) -> dict:
    districts = {u.id: u for u in session.scalars(select(AdminUnit).where(AdminUnit.level == "district"))}
    rows = session.scalars(select(Attraction)).all()
    names: dict = defaultdict(list)
    for n in session.scalars(select(EntityName).where(EntityName.entity_type == "attraction")):
        names[n.entity_id].append(n.name)
    photos = {m.attraction_id for m in session.scalars(select(AttractionMedia).where(
        AttractionMedia.approval_status.in_(("auto_approved", "approved"))))}
    portal = _portal_spots(session)
    # District and category from the current claims: unreviewed records have no curated values yet
    current: dict = defaultdict(dict)
    for c in session.scalars(select(SourceClaim).where(
            SourceClaim.entity_type == "attraction", SourceClaim.field_name.in_(("district_id", "category_code")),
            SourceClaim.status.in_(("proposed", "accepted")))):
        current[c.entity_id][c.field_name] = (c.claimed_value or {}).get("v")
    district_of = {a.id: a.district_id or (uuid.UUID(current[a.id]["district_id"]) if current[a.id].get("district_id") else None)
                   for a in rows}
    per: dict[str, dict] = {}
    for a in rows:
        d = districts.get(district_of[a.id])
        key = d.slug if d else "unassigned"
        p = per.setdefault(key, {"status": Counter(), "category": Counter(), "with_photo": 0, "without_bangla_name": 0})
        p["status"][a.status] += 1
        p["category"][str(a.category_code or current[a.id].get("category_code"))] += 1
        p["with_photo"] += a.id in photos
        has_bn = a.canonical_name_bn or any(re.search(r"[ঀ-৿]", n) for n in names[a.id])
        p["without_bangla_name"] += not has_bn
    for slug, spots in portal.items():
        p = per.setdefault(slug, {"status": Counter(), "category": Counter(), "with_photo": 0, "without_bangla_name": 0})
        candidates = [n for a in rows if a.status != "rejected" and districts.get(district_of[a.id])
                      and districts[district_of[a.id]].slug == slug for n in names[a.id]]
        missing = [s for s in spots if max((name_similarity(s, n) for n in candidates), default=0) < 88]
        p["official_spots"] = len(spots)
        p["official_spots_not_in_catalog"] = missing
    summary = {
        "generated_at": datetime.utcnow().isoformat(timespec="seconds"),
        "attractions": len(rows),
        "by_status": dict(Counter(a.status for a in rows)),
        "districts": {k: {**v, "status": dict(v["status"]), "category": dict(v["category"])} for k, v in sorted(per.items())},
    }
    if write:
        REPORTS_DIR.mkdir(parents=True, exist_ok=True)
        stamp = datetime.utcnow().strftime("%Y-%m-%d")
        (REPORTS_DIR / f"attractions-{stamp}.json").write_text(json.dumps(summary, indent=2, ensure_ascii=False), encoding="utf-8")
        lines = [f"# Attractions report ({stamp})", "", f"Total: {len(rows)} · by status: {summary['by_status']}", "",
                 "| District | Status | With photo | No Bangla name | Official spots | Official spots not in catalog |",
                 "|---|---|---|---|---|---|"]
        for k, v in summary["districts"].items():
            lines.append(f"| {k.removeprefix('bd-district-')} | {v['status']} | {v['with_photo']} | {v['without_bangla_name']} | "
                         f"{v.get('official_spots', '–')} | {', '.join(v.get('official_spots_not_in_catalog', [])) or '–'} |")
        (REPORTS_DIR / f"attractions-{stamp}.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    return summary

"""
Admin geography quality report (guideline §12.3). Geometry checks use the full
geometries from the raw artifacts (the database keeps simplified ones), so gaps and
overlaps are the source's, not artefacts of simplification.
Writes quality-reports/geography-<date>.json and .md.
"""

from __future__ import annotations

import json
from collections import Counter, defaultdict
from datetime import datetime
from typing import Any

from shapely.ops import unary_union
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.catalog import AdminAdjacency, AdminBoundary, AdminUnit, EntityExternalId, SourceArtifact
from app.models.models import Region
from vromon_data import artifacts, geo
from vromon_data.paths import REPORTS_DIR

EXPECTED = {"division": 8, "district": 64}
OVERLAP_TOLERANCE_KM2 = 1.0   # total district overlap accepted as digitising noise
GAP_TOLERANCE_KM2 = 5.0


def _full_geometries(session: Session, units: dict) -> dict:
    """unit id -> full geometry, read from each current boundary's raw artifact. A division whose
    boundary is `union:ADM2:…` is rebuilt from its districts, as the connector built it."""
    by_artifact: dict = defaultdict(dict)
    unions: list = []
    for b in session.scalars(select(AdminBoundary).where(AdminBoundary.is_current.is_(True))):
        if b.admin_unit_id not in units:
            continue
        if (b.feature_ref or "").startswith("union:"):
            unions.append(b.admin_unit_id)
        else:
            by_artifact[b.artifact_id][b.feature_ref] = b.admin_unit_id
    out = {}
    for art_id, refs in by_artifact.items():
        art = session.get(SourceArtifact, art_id)
        with open(artifacts.raw_path(art), encoding="utf-8") as f:
            data = json.load(f)
        for feat in data["features"]:
            uid = refs.get(feat["properties"].get("shapeID"))
            if uid:
                out[uid] = geo.load(feat["geometry"])[0]
        del data
    for uid in unions:
        parts = [out[u.id] for u in units.values() if u.parent_id == uid and u.id in out]
        if parts:
            out[uid] = unary_union(parts)
    return out


def _gaps_and_overlaps(children: list, parents: list) -> tuple[float, float]:
    """(km² where children overlap each other, km² of the parents covered by no child)."""
    idx = geo.Index([(str(i), g) for i, g in enumerate(children)])
    overlap = 0.0
    for i, g in enumerate(children):
        for j in map(int, idx.covering_point(g)):
            if j > i:
                inter = g.intersection(children[j])
                if not inter.is_empty and inter.area > 0:
                    overlap += geo.area_km2(inter)
    gap = unary_union(parents).difference(unary_union(children))
    return round(overlap, 3), (round(geo.area_km2(gap), 3) if not gap.is_empty else 0.0)


def build(session: Session, write: bool = True) -> dict[str, Any]:
    units = {u.id: u for u in session.scalars(select(AdminUnit).where(AdminUnit.country_iso2 == "BD",
                                                                     AdminUnit.status != "inactive"))}
    by_level = Counter(u.level for u in units.values())
    status = Counter((u.level, u.status) for u in units.values())
    checks: list[dict[str, Any]] = []

    def check(name: str, ok: bool, detail: Any = None) -> None:
        checks.append({"check": name, "passed": bool(ok), "detail": detail})

    for level, n in EXPECTED.items():
        check(f"{level} count is {n}", by_level.get(level) == n, by_level.get(level))
    parent_level = {"district": "division", "subdistrict": "district"}
    for level, want in parent_level.items():
        bad = [u.slug for u in units.values() if u.level == level and
               (u.parent_id not in units or units[u.parent_id].level != want)]
        check(f"every {level} has a {want} parent", not bad, bad[:20])
    no_en = [u.slug for u in units.values() if not u.name_en]
    check("every unit has an English name", not no_en, no_en[:20])
    for level in ("division", "district"):
        missing = [u.slug for u in units.values() if u.level == level and not u.name_bn]
        check(f"every {level} has a Bangla name", not missing, missing)
        unverified = [u.slug for u in units.values() if u.level == level and
                      (u.field_status or {}).get("name_bn", {}).get("status") != "verified"]
        check(f"every {level}'s Bangla name is verified against its portal", not unverified, unverified)
    sub_bn = sum(1 for u in units.values() if u.level == "subdistrict" and u.name_bn)
    no_boundary = [u.slug for u in units.values() if not session.scalar(select(AdminBoundary.id).where(
        AdminBoundary.admin_unit_id == u.id, AdminBoundary.is_current.is_(True)))]
    check("every unit has a current boundary", not no_boundary, no_boundary[:20])
    iso = set(session.scalars(select(EntityExternalId.external_id).where(EntityExternalId.provider == "iso3166-2")))
    regions = set(session.scalars(select(Region.code).where(Region.country_iso2 == "BD")))
    check("every app region (BD-A…BD-H) is linked to a division", regions <= iso if regions else True,
          sorted(regions - iso))

    # Adjacency
    adj = [(a.unit_id, a.neighbor_id) for a in session.scalars(select(AdminAdjacency))]
    adj_set = set(adj)
    asym = [(str(a), str(b)) for a, b in adj if (b, a) not in adj_set]
    check("adjacency is symmetric", not asym, asym[:10])
    districts = [u for u in units.values() if u.level == "district"]
    lonely = [u.slug for u in districts if not any(a == u.id for a, _ in adj)]
    check("every district has at least one neighbour", not lonely, lonely)

    # Gaps and overlaps: districts against divisions, sub-districts against districts
    full = _full_geometries(session, units)
    layer = {lvl: [full[u.id] for u in units.values() if u.level == lvl and u.id in full]
             for lvl in ("division", "district", "subdistrict")}
    overlap_km2 = gap_km2 = None
    for child, parent in (("district", "division"), ("subdistrict", "district")):
        if layer[child] and layer[parent]:
            ov, gp = _gaps_and_overlaps(layer[child], layer[parent])
            if child == "district":
                overlap_km2, gap_km2 = ov, gp
            check(f"{child} overlaps under {OVERLAP_TOLERANCE_KM2} km² in total", ov <= OVERLAP_TOLERANCE_KM2, ov)
            check(f"area inside {parent}s but in no {child} under {GAP_TOLERANCE_KM2} km²", gp <= GAP_TOLERANCE_KM2, gp)

    summary = {
        "generated_at": datetime.utcnow().isoformat(timespec="seconds"),
        "units": dict(by_level),
        "status": {f"{lvl}:{st}": n for (lvl, st), n in sorted(status.items())},
        "subdistricts_with_bangla_name": sub_bn,
        "adjacency_pairs": len(adj),
        "district_overlap_km2": overlap_km2,
        "gap_km2": gap_km2,
        "checks_failed": [c["check"] for c in checks if not c["passed"]],
        "passed": all(c["passed"] for c in checks),
    }
    out = {"summary": summary, "checks": checks}
    if write:
        REPORTS_DIR.mkdir(parents=True, exist_ok=True)
        stamp = datetime.utcnow().strftime("%Y-%m-%d")
        (REPORTS_DIR / f"geography-{stamp}.json").write_text(json.dumps(out, indent=2, ensure_ascii=False, default=str),
                                                             encoding="utf-8")
        lines = [f"# Geography quality report ({stamp})", "", f"Units: {dict(by_level)}", "",
                 "| Check | Result | Detail |", "|---|---|---|"]
        for c in checks:
            lines.append(f"| {c['check']} | {'pass' if c['passed'] else '**FAIL**'} | "
                         f"{json.dumps(c['detail'], ensure_ascii=False)[:120] if c['detail'] not in (None, [], {}) else ''} |")
        (REPORTS_DIR / f"geography-{stamp}.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    return out

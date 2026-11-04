"""
geoBoundaries gbOpen, Bangladesh ADM1-ADM3 → admin_units, admin_boundaries, admin_adjacency.

ADM1 = division (8), ADM2 = district (64), ADM3 = sub-district (544: upazilas and city
thanas; geoBoundaries doesn't say which, so the level is `subdistrict`). Neither ADM2 nor
ADM3 has a parent field: each unit's parent is the unit above containing most of its
area, and sub-districts whose best share is under 95 % go to review. Division outlines
are the union of their districts (see _dissolve_divisions). Neighbours come from
shared borders.

The download URLs pin a release commit, so a file already fetched from the same URL
is reused instead of downloaded again.
"""

from __future__ import annotations

import json
import uuid
from pathlib import Path
from typing import Any, Iterable

from shapely.ops import unary_union
from sqlalchemy import select

from app.models.catalog import AdminAdjacency, AdminBoundary, AdminUnit, ReviewTask, SourceArtifact
from vromon_data import artifacts, geo, http, reference
from vromon_data.pipeline import Connector, Context, Record
from vromon_data.text import clean, slugify

API = "https://www.geoboundaries.org/api/current/gbOpen/BGD/{level}/"
LEVELS = {"ADM1": "division", "ADM2": "district", "ADM3": "subdistrict"}
PARENT_SHARE_REVIEW = 0.95


class GeoBoundariesBGD(Connector):
    name = "geoboundaries_bgd"
    version = "2"  # 2: division outlines = union of their districts
    source_id = "geoboundaries_bgd"
    auto_accept = True
    order = ("admin_unit",)

    def __init__(self) -> None:
        self.meta: dict[str, dict] = {}
        self.files: dict[str, SourceArtifact] = {}
        self.shapes: dict[str, Any] = {}          # shapeID -> geometry (full)
        self.repaired: set[str] = set()
        self.parent_of: dict[str, tuple[str | None, float]] = {}
        self.level_of: dict[str, str] = {}
        self.raw_names: dict[str, str] = {}
        self.dissolved: set[str] = set()           # divisions whose outline is the union of their districts
        self.adm1_share: dict[str, float] = {}     # district -> share inside the original ADM1 outline

    # --- fetch / parse --------------------------------------------------------------------
    def fetch(self, ctx: Context) -> list[SourceArtifact]:
        local: dict[str, str] = ctx.params.get("files") or {}
        if local:  # tests and manual runs: {"ADM1": path, ...}
            for level, path in local.items():
                p = Path(path)
                self.files[level] = ctx.store_artifact(uri=p.resolve().as_uri(), content=p.read_bytes(),
                                                       content_type="application/geo+json", filename_hint=p.name)
                self.meta[level] = {"boundaryType": level, "boundaryLicense": ctx.source.get("license_name")}
            return list(self.files.values())
        with http.client(timeout=600) as c:
            for level in LEVELS:
                r = http.get(c, API.format(level=level), check_robots=False)
                r.raise_for_status()
                ctx.store_artifact(uri=str(r.url), content=r.content, content_type=r.headers.get("content-type"),
                                   filename_hint=f"{level}-meta.json")
                meta = r.json()
                self.meta[level] = meta
                url = meta["gjDownloadURL"]
                art = artifacts.find_by_uri(ctx.session, self.source_id, url)
                if art is None:
                    g = http.get(c, url, check_robots=False)
                    g.raise_for_status()
                    art = ctx.store_artifact(uri=url, content=g.content, content_type="application/geo+json",
                                             filename_hint=url.rsplit("/", 1)[-1])
                else:
                    ctx.count("artifacts_reused")
                self.files[level] = art
        return list(self.files.values())

    def parse(self, ctx: Context, arts: list[SourceArtifact]) -> Iterable[dict[str, Any]]:
        features: list[dict[str, Any]] = []
        for level in LEVELS:
            if level not in self.files:
                continue
            with open(artifacts.raw_path(self.files[level]), encoding="utf-8") as f:
                data = json.load(f)
            for feat in data["features"]:
                props = feat["properties"]
                sid = props["shapeID"]
                g, repaired = geo.load(feat["geometry"])
                self.shapes[sid] = g
                if repaired:
                    self.repaired.add(sid)
                self.level_of[sid] = level
                self.raw_names[sid] = props["shapeName"]
                features.append({"id": sid, "level": level, "props": props, "artifact_id": self.files[level].id})
            ctx.count(f"features_{level}", len(data["features"]))
            del data
        # Parents: the unit of the level above that holds most of the area
        for child, parent in (("ADM2", "ADM1"), ("ADM3", "ADM2")):
            idx_items = [(sid, g) for sid, g in self.shapes.items() if self.level_of[sid] == parent]
            if not idx_items:
                continue
            idx = geo.Index(idx_items)
            for sid, g in self.shapes.items():
                if self.level_of[sid] == child:
                    self.parent_of[sid] = idx.best_overlap(g)
            if child == "ADM2":
                self._dissolve_divisions(ctx)
        return features

    def _dissolve_divisions(self, ctx: Context) -> None:
        """ADM1 (2015, Wikimedia Commons) and ADM2/ADM3 (2020, BBS/OCHA) don't line up: districts lie up to
        30 % outside their division's outline. Each division's outline becomes the union of its districts,
        so the hierarchy is consistent and drawn from one source. The ADM1 file still decides membership
        (largest overlap) and its codes; its outline stays in the raw artifact."""
        members: dict[str, list] = {}
        for sid, (parent, share) in self.parent_of.items():
            if self.level_of[sid] == "ADM2" and parent:
                members.setdefault(parent, []).append(self.shapes[sid])
                self.adm1_share[sid] = share
        for div_sid, shapes in members.items():
            self.shapes[div_sid] = unary_union(shapes)
            self.dissolved.add(div_sid)
        # By construction every district now lies wholly in its division
        for sid, (parent, _) in list(self.parent_of.items()):
            if self.level_of[sid] == "ADM2" and parent in self.dissolved:
                self.parent_of[sid] = (parent, 1.0)
        ctx.count("divisions_dissolved_from_districts", len(members))

    # --- normalize / validate -------------------------------------------------------------
    def _official(self, level: str, props: dict) -> tuple[str, str | None]:
        """(official English name, Bangla) from the curated tables, for slugs; claims come from vromon_curated."""
        raw = props["shapeName"]
        if level == "ADM1":
            return reference.divisions().get(props.get("shapeISO", ""), (raw, None))
        if level == "ADM2":
            return reference.districts().get(raw, (raw, None))
        return raw, None

    def normalize(self, ctx: Context, raw: dict[str, Any]) -> Record:
        props, level, sid = raw["props"], raw["level"], raw["id"]
        g = self.shapes[sid]
        lat, lon = geo.label_point(g)
        fields: dict[str, Any] = {
            "name_en": clean(props["shapeName"]),
            "centroid_lat": lat, "centroid_lon": lon,
            "area_km2": round(geo.area_km2(g), 2),
        }
        rec = Record(entity_type="admin_unit", source_record_id=sid, fields=fields, raw=dict(props),
                     external_ids=[("geoboundaries", sid)], names=[("en", props["shapeName"], "alias")],
                     artifact_id=raw["artifact_id"], source_url=self.files[level].uri, confidence="high",
                     verification_method="official_source", hash_extra=geo.checksum(g))
        rec.raw["_level"] = LEVELS[level]
        if sid in self.dissolved:
            rec.raw["_geometry_method"] = "union_of_ADM2_districts"
        if sid in self.adm1_share:
            rec.raw["_share_in_original_adm1"] = round(self.adm1_share[sid], 4)
        if level == "ADM1" and props.get("shapeISO"):
            rec.external_ids.append(("iso3166-2", props["shapeISO"]))
        if sid in self.parent_of:
            parent_sid, share = self.parent_of[sid]
            fields["parent_id"] = ("geoboundaries", parent_sid) if parent_sid else None
            rec.raw["_parent_share"] = round(share, 4)
            if parent_sid is None:
                rec.review.append(("missing_admin_area", {"reason": "no parent unit overlaps this unit"}))
            elif share < PARENT_SHARE_REVIEW:
                rec.review.append(("geometry", {"reason": f"only {share:.0%} of the unit lies in its parent",
                                                "parent": parent_sid}))
        return rec

    def validate(self, ctx: Context, records: list[Record]) -> None:
        for rec in records:
            g = self.shapes[rec.source_record_id]
            if g.is_empty or g.area == 0:
                rec.errors.append("empty geometry")
                continue
            lat, lon = rec.fields["centroid_lat"], rec.fields["centroid_lon"]
            if not geo.in_bbox(lat, lon):
                rec.errors.append(f"label point {lat},{lon} outside Bangladesh's extent")
            if not rec.fields["name_en"]:
                rec.errors.append("no name")
            if rec.source_record_id in self.repaired:
                rec.review.append(("geometry", {"reason": "invalid geometry repaired with make_valid"}))
        for level, meta in self.meta.items():
            expected = meta.get("admUnitCount")
            got = sum(1 for r in records if self.level_of.get(r.source_record_id) == level)
            if expected and int(expected) != got:
                ctx.error("validate", f"{level}: API says {expected} units, file has {got}")

    # --- entities ---------------------------------------------------------------------------
    def resolve_field(self, ctx: Context, record: Record, field_name: str, value: Any) -> Any:
        if field_name == "parent_id" and isinstance(value, tuple):
            return ctx.lookup("admin_unit", value[0], value[1])
        return value

    def create(self, ctx: Context, record: Record) -> uuid.UUID:
        level = self.level_of[record.source_record_id]
        official, _ = self._official(level, record.raw)
        if level == "ADM3":
            parent_sid = (self.parent_of.get(record.source_record_id) or (None, 0))[0]
            parent_name = self._official("ADM2", {"shapeName": self.raw_names[parent_sid]})[0] if parent_sid else "bd"
            base = f"bd-{slugify(parent_name)}-{slugify(official)}"
        else:
            base = f"bd-{LEVELS[level]}-{slugify(official)}"
        slug = base
        if ctx.session.scalar(select(AdminUnit.id).where(AdminUnit.slug == slug)):
            slug = f"{base}-{record.source_record_id[-6:].lower()}"
        unit = AdminUnit(country_iso2="BD", level=LEVELS[level], slug=slug, status="imported",
                         created_by_job_id=ctx.job.id, field_status={})
        ctx.session.add(unit)
        ctx.session.flush()
        return unit.id

    # --- after claims: boundaries, adjacency, status ------------------------------------------
    def after(self, ctx: Context, records: list[Record]) -> None:
        s = ctx.session
        for rec in records:
            if rec.errors or rec.entity_id is None:
                continue
            current = s.scalars(select(AdminBoundary).where(AdminBoundary.admin_unit_id == rec.entity_id,
                                                            AdminBoundary.is_current.is_(True))).first()
            if current is None or rec.change != "unchanged":
                g = self.shapes[rec.source_record_id]
                if current is not None:
                    current.is_current = False
                minx, miny, maxx, maxy = g.bounds
                dissolved = rec.source_record_id in self.dissolved
                s.add(AdminBoundary(admin_unit_id=rec.entity_id, source_id=self.source_id,
                                    artifact_id=self.files["ADM2"].id if dissolved else rec.artifact_id,
                                    feature_ref=f"union:ADM2:{rec.source_record_id}" if dissolved else rec.source_record_id,
                                    geometry_geojson=geo.simplified_geojson(g),
                                    simplify_tolerance_deg=geo.SIMPLIFY_TOLERANCE_DEG, min_lon=minx, min_lat=miny,
                                    max_lon=maxx, max_lat=maxy, was_repaired=rec.source_record_id in self.repaired,
                                    job_id=ctx.job.id))
                ctx.count("boundaries_written")
            unit = s.get(AdminUnit, rec.entity_id)
            unit.status = "needs_review" if rec.review else "published"
            if not rec.review:
                # A geometry question from an earlier run that this run no longer raises
                for t in s.scalars(select(ReviewTask).where(ReviewTask.entity_id == rec.entity_id,
                                                            ReviewTask.task_type == "geometry",
                                                            ReviewTask.status == "open")):
                    t.status = "superseded"
                    t.reason = f"no longer raised by job {ctx.job.id}"
                    ctx.count("reviews_superseded")
        s.flush()
        self._adjacency(ctx, records, "ADM1")
        self._adjacency(ctx, records, "ADM2")

    def _adjacency(self, ctx: Context, records: list[Record], level: str) -> None:
        recs = [r for r in records if self.level_of.get(r.source_record_id) == level and r.entity_id and not r.errors]
        if not recs or all(r.change == "unchanged" for r in recs):
            return
        ids = [r.entity_id for r in recs]
        ctx.session.execute(AdminAdjacency.__table__.delete().where(AdminAdjacency.unit_id.in_(ids)))
        idx = geo.Index([(str(i), self.shapes[r.source_record_id]) for i, r in enumerate(recs)])
        n = 0
        for i, r in enumerate(recs):
            g = self.shapes[r.source_record_id]
            for j_key in idx.covering_point(g.buffer(1e-4)):
                j = int(j_key)
                if j == i:
                    continue
                other = self.shapes[recs[j].source_record_id]
                shared = g.boundary.intersection(other.buffer(2e-4))
                km = geo.length_km(shared) if not shared.is_empty else 0.0
                if km < 0.05:  # a touching corner is not a neighbour
                    continue
                ctx.session.add(AdminAdjacency(unit_id=r.entity_id, neighbor_id=recs[j].entity_id,
                                               shared_border_km=round(km, 2), method="shared_border_geodesic_2e-4deg",
                                               job_id=ctx.job.id))
                n += 1
        ctx.count(f"adjacency_{LEVELS[level]}", n)

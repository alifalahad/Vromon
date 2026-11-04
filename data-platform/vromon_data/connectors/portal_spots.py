"""
Official tourist-spot lists of all 64 district portals (`https://<district>.gov.bd/pages/tourist-spot`),
facts only (owner's decision, 2026-11-05).

The portals are "all rights reserved", so only facts are used: that a place with this name is
on the district's official list. Descriptions, travel directions and photos are not copied
(they stay in the raw snapshot as evidence only, never published).

For each listed name in a district:
  - an attraction in the same district with the same name (any script and spelling, place type
    respected) is linked: its review task gets "on the official list" as evidence, and the
    portal's spelling becomes a proposed Bangla name (official sources outrank Wikidata)
  - otherwise a new attraction is proposed with the name and district only; its location is
    unknown and a person adds it (review task `location_needed`). Nothing is placed by guessing.
"""

from __future__ import annotations

import re
import uuid
from typing import Any, Iterable

from sqlalchemy import select

from app.models.catalog import AdminUnit, Attraction, EntityName, ReviewTask, SourceClaim
from vromon_data import http
from vromon_data.connectors.portal_names import load_portals
from vromon_data.pipeline import Connector, Context, Record
from vromon_data.text import bn_to_latin, clean, name_similarity, slugify

_TITLE = re.compile(r'data-column="title">\s*([^<]+?)\s*</td>')
MATCH = 88


class PortalTouristSpots(Connector):
    name = "bd_portal_tourist_spots"
    version = "1"
    source_id = "bd_district_portals"
    auto_accept = False
    order = ("attraction",)

    def fetch(self, ctx: Context):
        s = ctx.session
        portals = load_portals()
        districts = {u.name_en: u for u in s.scalars(select(AdminUnit).where(AdminUnit.level == "district"))}
        wanted = set(ctx.params.get("districts") or [u.slug for u in districts.values()])
        self.lists: list[tuple[AdminUnit, list[str], Any, str]] = []
        with http.client(timeout=60) as c:
            for key, info in sorted(portals.items()):
                if info["level"] != "district":
                    continue
                unit = next((u for u in districts.values() if name_similarity(u.name_en, key) >= 85 or
                             slugify(u.name_en).replace("-", "") == info["domain"]), None)
                if unit is None or unit.slug not in wanted:
                    continue
                names: list[str] = []
                art = None
                base = f"https://{info['domain']}.gov.bd/pages/tourist-spot"
                for page in range(1, 21):
                    url = base if page == 1 else f"{base}?page={page}"
                    if ctx.params.get("pages") is not None:
                        text = ctx.params["pages"].get(unit.slug, {}).get(page, "")
                    else:
                        try:
                            r = http.get(c, url)
                        except (http.BlockedByRobots, Exception) as e:  # one district's failure doesn't stop the rest
                            ctx.error("fetch", f"{type(e).__name__}: {e}", unit.slug)
                            break
                        text = r.text
                        art = ctx.store_artifact(uri=url, content=r.content, content_type=r.headers.get("content-type"),
                                                 filename_hint=f"{unit.slug}-tourist-spot-p{page}.html")
                    fresh = [n for n in (clean(x) for x in _TITLE.findall(text)) if n and n not in names]
                    if not fresh:
                        break
                    names += fresh
                self.lists.append((unit, names, art, base))
                ctx.count("districts_listed")
        return []

    def parse(self, ctx: Context, arts) -> Iterable[dict[str, Any]]:
        for unit, names, art, base in self.lists:
            for n in names:
                yield {"id": f"{unit.slug}:{n}", "unit": unit, "name": n, "artifact_id": art.id if art else None, "url": base}

    def normalize(self, ctx: Context, raw: dict[str, Any]) -> Record:
        unit = raw["unit"]
        return Record(entity_type="attraction", source_record_id=raw["id"],
                      fields={"canonical_name_bn": raw["name"], "district_id": str(unit.id),
                              "division_id": str(unit.parent_id) if unit.parent_id else None},
                      raw={"district": unit.slug, "name": raw["name"]},
                      external_ids=[("bd_portal_spot", raw["id"])], names=[("bn", raw["name"], "official_list")],
                      artifact_id=raw["artifact_id"], source_url=raw["url"], confidence="high",
                      verification_method="official_district_list")

    def _candidates(self, ctx: Context, district_id: str) -> dict[uuid.UUID, list[str]]:
        """Attractions in the district (from accepted or proposed claims) and their names."""
        if not hasattr(self, "_by_district"):
            self._by_district: dict[str, dict[uuid.UUID, list[str]]] = {}
            where = {c.entity_id: (c.claimed_value or {}).get("v") for c in ctx.session.scalars(select(SourceClaim).where(
                SourceClaim.entity_type == "attraction", SourceClaim.field_name == "district_id",
                SourceClaim.status.in_(("accepted", "proposed")), SourceClaim.source_id != self.source_id))}
            names: dict[uuid.UUID, list[str]] = {}
            for n in ctx.session.scalars(select(EntityName).where(EntityName.entity_type == "attraction")):
                names.setdefault(n.entity_id, []).append(n.name)
            for eid, did in where.items():
                if did:
                    self._by_district.setdefault(did, {})[eid] = names.get(eid, [])
        return self._by_district.get(district_id, {})

    def match(self, ctx: Context, record: Record) -> uuid.UUID | None:
        found = super().match(ctx, record)          # this portal row seen before
        if found:
            return found
        best, score = None, 0.0
        for eid, names in self._candidates(ctx, record.fields["district_id"]).items():
            sc = max((name_similarity(record.raw["name"], n) for n in names), default=0.0)
            if sc > score:
                best, score = eid, sc
        if best is not None and score >= MATCH:
            record.raw["matched_score"] = round(score)
            ctx.count("matched_existing")
            return best
        return None

    def create(self, ctx: Context, record: Record) -> uuid.UUID:
        district = record.raw["district"].removeprefix("bd-district-")
        base = f"{district}-{slugify(bn_to_latin(record.raw['name']))}"[:180]
        slug = base
        if ctx.session.scalar(select(Attraction.id).where(Attraction.slug == slug)):
            slug = f"{base}-{uuid.uuid4().hex[:6]}"
        a = Attraction(slug=slug, country_iso2="BD", status="needs_review", created_by_job_id=ctx.job.id, field_status={})
        ctx.session.add(a)
        ctx.session.flush()
        record.raw["new"] = True
        return a.id

    def after(self, ctx: Context, records: list[Record]) -> None:
        s = ctx.session
        for rec in records:
            if rec.entity_id is None:
                continue
            task = s.scalar(select(ReviewTask).where(ReviewTask.entity_id == rec.entity_id, ReviewTask.task_type == "new_entity",
                                                     ReviewTask.status == "open"))
            if task is not None:
                extra = {"official_portal_match": rec.raw["name"], "district": rec.raw["district"]}
                if rec.raw.get("new"):
                    extra.update(name_bn=rec.raw["name"], lat=None, lon=None,
                                 note="on the official district list; location unknown, add it before approving")
                task.payload = {**task.payload, **extra}
            if rec.raw.get("new"):
                ctx.review("location_needed", entity_type="attraction", entity_id=rec.entity_id, name=rec.raw["name"],
                           district=rec.raw["district"])
                ctx.count("new_without_location")
        s.flush()

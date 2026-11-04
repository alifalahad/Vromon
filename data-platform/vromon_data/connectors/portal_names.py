"""
Checks Bangla district and division names against the official portals
(https://<name>.gov.bd/, https://<name>div.gov.bd/): the page title reads
"হোম | <নাম> জেলা" / "… বিভাগ". A name is a fact, so this uses the portals as the
registry allows (fact checking), copying no text.

  - title equals the curated Bangla name (after NFC): the curated claim is marked
    verified (verification_method matched_official_portal)
  - title differs: the portal's form is kept as an alias and a person reviews it
  - no portal found: recorded as an error; the name stays unverified

The domains found are kept in source-registry/bd-portals.json so later runs (and the
Phase 2 tourist-spot connector) use the same list.
"""

from __future__ import annotations

import json
import re
import uuid
from datetime import datetime
from typing import Any, Iterable

import httpx
from sqlalchemy import select

from app.models.catalog import AdminUnit, EntityName, SourceClaim, VerificationEvent
from vromon_data import claims, http, reference
from vromon_data.paths import PLATFORM_DIR
from vromon_data.pipeline import Connector, Context, Record, _add_names
from vromon_data.text import clean

PORTALS_FILE = PLATFORM_DIR / "source-registry" / "bd-portals.json"
_TITLE = re.compile(r"<title[^>]*>(.*?)</title>", re.I | re.S)
# Domains that don't follow the lower-case geoBoundaries / official spelling
DOMAIN_HINTS = {
    "Nawabganj": ["chapainawabganj"], "Netrakona": ["netrokona"], "Maulvibazar": ["moulvibazar"],
    "Jhalokati": ["jhalakathi"], "Brahamanbaria": ["brahmanbaria"], "Barisal": ["barisal", "barishal"],
    "Chittagong": ["chittagong"], "Comilla": ["comilla"], "Jessore": ["jessore"], "Bogra": ["bogra"],
    "BD-A": ["barisaldiv", "barishaldiv"], "BD-B": ["chittagongdiv", "ctgdiv"], "BD-C": ["dhakadiv"],
    "BD-D": ["khulnadiv"], "BD-E": ["rajshahidiv"], "BD-F": ["rangpurdiv"], "BD-G": ["sylhetdiv"],
    "BD-H": ["mymensinghdiv"],
}


def _key(s: str) -> str:
    return re.sub(r"[^a-z]", "", s.lower())


def load_portals() -> dict[str, dict[str, Any]]:
    return json.loads(PORTALS_FILE.read_text(encoding="utf-8")) if PORTALS_FILE.exists() else {}


class PortalNames(Connector):
    name = "bd_portal_names"
    version = "1"
    source_id = "bd_district_portals"
    auto_accept = False

    def fetch(self, ctx: Context):
        known = load_portals()
        targets: list[tuple[str, str, list[str]]] = []
        for code, (en, _) in reference.divisions().items():
            targets.append((code, "division", DOMAIN_HINTS.get(code, [])))
        for raw, (en, _) in reference.districts().items():
            targets.append((raw, "district", DOMAIN_HINTS.get(raw, []) + [_key(raw), _key(en)]))
        self.pages: list[dict[str, Any]] = []
        with http.client(timeout=40) as c:
            for key, level, candidates in targets:
                if key in known and known[key].get("domain"):
                    candidates = [known[key]["domain"]] + candidates
                page = None
                for dom in dict.fromkeys(candidates):
                    url = f"https://{dom}.gov.bd/"
                    try:
                        r = http.get(c, url)
                    except (httpx.HTTPError, http.BlockedByRobots):
                        continue
                    m = _TITLE.search(r.text)
                    title = " ".join(m.group(1).split()) if m else ""
                    if r.status_code == 200 and ("জেলা" in title or "বিভাগ" in title):
                        art = ctx.store_artifact(uri=url, content=r.content, content_type=r.headers.get("content-type"),
                                                 filename_hint=f"{dom}.html")
                        page = {"key": key, "level": level, "domain": dom, "url": url, "title": title, "artifact_id": art.id}
                        break
                if page is None:
                    ctx.error("fetch", f"no portal found for {level} {key}", key)
                    continue
                self.pages.append(page)
        if not ctx.dry_run:
            PORTALS_FILE.write_text(json.dumps({p["key"]: {"level": p["level"], "domain": p["domain"]} for p in self.pages},
                                               ensure_ascii=False, indent=1, sort_keys=True), encoding="utf-8")
        return []

    def parse(self, ctx: Context, arts) -> Iterable[dict[str, Any]]:
        for p in self.pages:
            m = re.search(r"\|\s*(.+?)\s*(জেলা|বিভাগ)\s*$", p["title"])
            p["name_bn"] = clean(m.group(1)) if m else None
            yield {**p, "id": f"{p['level']}:{p['key']}"}

    def normalize(self, ctx: Context, raw: dict[str, Any]) -> Record:
        # No claims of its own: it verifies (or questions) the curated name in after()
        rec = Record(entity_type="admin_unit", source_record_id=raw["id"], fields={}, raw=raw,
                     artifact_id=raw["artifact_id"], source_url=raw["url"])
        rec.raw["_level"] = raw["level"]
        return rec

    def match(self, ctx: Context, record: Record) -> uuid.UUID | None:
        raw = record.raw
        if raw["level"] == "division":
            return ctx.lookup("admin_unit", "iso3166-2", raw["key"])
        return ctx.session.scalar(
            select(AdminUnit.id).join(EntityName, (EntityName.entity_id == AdminUnit.id)
                                      & (EntityName.entity_type == "admin_unit"))
            .where(AdminUnit.level == "district", EntityName.lang == "en", EntityName.name == raw["key"]))

    def validate(self, ctx: Context, records: list[Record]) -> None:
        for rec in records:
            if self.match(ctx, rec) is None:
                rec.errors.append("no matching admin unit (run geoboundaries_bgd first)")

    def create(self, ctx: Context, record: Record) -> uuid.UUID:
        raise LookupError(record.source_record_id)

    def after(self, ctx: Context, records: list[Record]) -> None:
        s = ctx.session
        for rec in records:
            if rec.errors or rec.entity_id is None:
                continue
            portal_bn = rec.raw.get("name_bn")
            claim = s.scalars(select(SourceClaim).where(
                SourceClaim.entity_type == "admin_unit", SourceClaim.entity_id == rec.entity_id,
                SourceClaim.field_name == "name_bn", SourceClaim.source_id == "vromon_curated",
                SourceClaim.status == "accepted")).first()
            curated = clean(claim.claimed_value["v"]) if claim and claim.claimed_value else None
            if portal_bn and curated and portal_bn == curated:
                if claim.verified_at is None:
                    claim.verified_at = ctx.now
                    claim.verification_method = "matched_official_portal"
                    claim.review_notes = f"matches the title of {rec.raw['url']}"
                    s.add(VerificationEvent(entity_type="admin_unit", entity_id=rec.entity_id, field_name="name_bn",
                                            new_value={"v": curated}, source_id=self.source_id,
                                            method="matched_official_portal", reason=rec.raw["title"]))
                    ctx.count("names_verified")
                else:
                    ctx.count("names_already_verified")
            else:
                if portal_bn:
                    rec.names = [("bn", portal_bn, "official_portal_title")]
                    _add_names(ctx, rec)
                ctx.review("name_conflict", entity_type="admin_unit", entity_id=rec.entity_id,
                           field="name_bn", curated=curated, portal=portal_bn, url=rec.raw["url"])
                ctx.count("names_differ")
            claims.resolve(s, "admin_unit", rec.entity_id)
        s.flush()

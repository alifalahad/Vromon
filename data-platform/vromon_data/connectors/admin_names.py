"""
Official English spellings and Bangla names for divisions and districts, from the
curated tables the app already uses (vromon_data.reference). Matches units imported by
geoboundaries_bgd: divisions by ISO 3166-2 code, districts by the geoBoundaries name.
Creates nothing: a name for a unit that doesn't exist is an error.
"""

from __future__ import annotations

import uuid
from typing import Any, Iterable

from sqlalchemy import select

from app.models.catalog import AdminUnit, EntityName
from vromon_data import reference
from vromon_data.paths import REPO_DIR
from vromon_data.pipeline import Connector, Context, Record
from vromon_data.text import clean


class CuratedAdminNames(Connector):
    name = "vromon_admin_names"
    version = "1"
    source_id = "vromon_curated"
    auto_accept = True

    def fetch(self, ctx: Context):
        arts = []
        for p in (reference.PREPARE_PY, reference.REGIONS_JSON):
            arts.append(ctx.store_artifact(uri=f"repo://{p.relative_to(REPO_DIR).as_posix()}", content=p.read_bytes(),
                                           content_type="text/plain", filename_hint=p.name))
        return arts

    def parse(self, ctx: Context, arts) -> Iterable[dict[str, Any]]:
        for code, (en, bn) in reference.divisions().items():
            yield {"id": f"division:{code}", "level": "division", "key": code, "en": en, "bn": bn,
                   "artifact_id": arts[1].id, "uri": arts[1].uri}
        for raw, (en, bn) in reference.districts().items():
            yield {"id": f"district:{raw}", "level": "district", "key": raw, "en": en, "bn": bn,
                   "artifact_id": arts[0].id, "uri": arts[0].uri}

    def normalize(self, ctx: Context, raw: dict[str, Any]) -> Record:
        names = [("en", raw["en"], "official")]
        if raw["bn"]:
            names.append(("bn", raw["bn"], "official"))
            if raw["level"] == "division":
                names.append(("bn", f"{raw['bn']} বিভাগ", "official"))
        rec = Record(entity_type="admin_unit", source_record_id=raw["id"],
                     fields={"name_en": clean(raw["en"]), "name_bn": clean(raw["bn"])},
                     raw=raw, names=names, artifact_id=raw["artifact_id"], source_url=raw["uri"], confidence="high")
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

    def create(self, ctx: Context, record: Record) -> uuid.UUID:
        raise LookupError(f"no admin unit for {record.source_record_id}: run geoboundaries_bgd first")

    def validate(self, ctx: Context, records: list[Record]) -> None:
        for rec in records:
            if self.match(ctx, rec) is None:
                rec.errors.append("no matching admin unit (run geoboundaries_bgd first)")

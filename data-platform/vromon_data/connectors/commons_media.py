"""
Photos for attractions from Wikimedia Commons: the image on each attraction's Wikidata
item (P18), with the file's own licence, author and attribution from the Commons API
(guideline §8). Only the metadata and Commons' URLs are stored; nothing is re-hosted.

A photo is approved for display only when its licence allows reuse with credit
(public domain, CC0, CC BY, CC BY-SA) and an author or credit is recorded; anything
else waits for a person. The app shows a photo only for a published attraction.
"""

from __future__ import annotations

import html
import re
import uuid
from typing import Any, Iterable
from urllib.parse import unquote

from sqlalchemy import select

from app.models.catalog import Attraction, AttractionMedia, EntityExternalId, StagingRecord
from vromon_data import http
from vromon_data.pipeline import Connector, Context, Record

API = "https://commons.wikimedia.org/w/api.php"
OPEN_LICENCES = re.compile(r"^(public domain|pd|cc0|cc by(-sa)?( \d\.\d)?)", re.I)
_TAGS = re.compile(r"<[^>]+>")


def _text(meta: dict, key: str) -> str | None:
    v = (meta.get(key) or {}).get("value")
    if not v:
        return None
    return " ".join(html.unescape(_TAGS.sub(" ", v)).split())[:500] or None


class CommonsMedia(Connector):
    name = "commons_media"
    version = "1"
    source_id = "wikimedia_commons"
    auto_accept = False

    def fetch(self, ctx: Context):
        # The image file name each attraction's Wikidata record gave (kept in its staging record)
        rows = ctx.session.execute(
            select(EntityExternalId.entity_id, StagingRecord.raw)
            .join(StagingRecord, (StagingRecord.target_entity_id == EntityExternalId.entity_id)
                  & (StagingRecord.source_id == "wikidata"))
            .where(EntityExternalId.entity_type == "attraction", EntityExternalId.provider == "wikidata")
            .order_by(StagingRecord.created_at)).all()
        self.wanted: dict[str, uuid.UUID] = {}
        for entity_id, raw in rows:  # the latest staging record wins
            image = (raw or {}).get("image")
            if image:
                title = "File:" + image.rsplit("/", 1)[-1].replace("%20", " ")
                self.wanted[unquote(title)] = entity_id
        self.info: dict[str, dict] = {}       # file title -> Commons imageinfo
        titles = sorted(self.wanted)
        if ctx.params.get("imageinfo") is not None:  # tests
            self.info = ctx.params["imageinfo"]
            return []
        arts = []
        with http.client(timeout=60) as c:
            for i in range(0, len(titles), 40):
                batch = titles[i:i + 40]
                r = http.get(c, API, check_robots=False, params={
                    "action": "query", "format": "json", "prop": "imageinfo", "titles": "|".join(batch),
                    "iiprop": "url|size|sha1|extmetadata", "iiurlwidth": 800,
                    "iiextmetadatafilter": "LicenseShortName|LicenseUrl|Artist|Credit|AttributionRequired|ImageDescription"})
                r.raise_for_status()
                arts.append(ctx.store_artifact(uri=f"{API}#batch={i // 40}", content=r.content,
                                               content_type=r.headers.get("content-type"), filename_hint=f"imageinfo-{i // 40}.json"))
                data = r.json()["query"]
                normalized = {n["to"]: n["from"] for n in data.get("normalized", [])}
                for page in data["pages"].values():
                    info = (page.get("imageinfo") or [None])[0]
                    if info:
                        self.info[normalized.get(page["title"], page["title"])] = info
        return arts

    def parse(self, ctx: Context, arts) -> Iterable[dict[str, Any]]:
        for title, entity_id in self.wanted.items():
            info = self.info.get(title)
            if info is None:
                ctx.count("missing_on_commons")
                continue
            yield {"id": title, "entity_id": entity_id, "info": info}

    def normalize(self, ctx: Context, raw: dict[str, Any]) -> Record:
        rec = Record(entity_type="attraction", source_record_id=raw["id"], fields={}, raw={"title": raw["id"]},
                     source_url=raw["info"].get("descriptionurl"))
        rec.raw["_entity_id"] = str(raw["entity_id"])
        return rec

    def match(self, ctx: Context, record: Record) -> uuid.UUID | None:
        return uuid.UUID(record.raw["_entity_id"])

    def after(self, ctx: Context, records: list[Record]) -> None:
        s = ctx.session
        for rec in records:
            info = self.info[rec.source_record_id]
            meta = info.get("extmetadata") or {}
            licence = _text(meta, "LicenseShortName")
            creator = _text(meta, "Artist") or _text(meta, "Credit")
            public_domain = (licence or "").lower().startswith(("public domain", "pd", "cc0"))
            open_ok = bool(licence and OPEN_LICENCES.match(licence)) and bool(creator or public_domain)
            page = info.get("descriptionurl")
            row = s.scalar(select(AttractionMedia).where(AttractionMedia.attraction_id == rec.entity_id,
                                                         AttractionMedia.original_url == page))
            if row is None:
                row = AttractionMedia(attraction_id=rec.entity_id, original_url=page, source_id=self.source_id,
                                      retrieved_at=ctx.now, role="primary", approval_status="needs_review",
                                      job_id=ctx.job.id)
                s.add(row)
                ctx.count("media_new")
            row.file_url = info.get("url", "").split("?")[0] or None
            row.thumb_url = (info.get("thumburl") or "").split("?")[0] or None
            row.width, row.height, row.sha1 = info.get("width"), info.get("height"), info.get("sha1")
            row.license, row.license_url, row.creator = licence, _text(meta, "LicenseUrl"), creator
            row.attribution = f"{creator or 'Unknown author'}, {licence}, via Wikimedia Commons" if licence else None
            row.caption, row.caption_lang = _text(meta, "ImageDescription"), "en"
            row.retrieved_at = ctx.now
            if row.approval_status in ("needs_review", "auto_approved"):
                row.approval_status = "auto_approved" if open_ok else "needs_review"
            if not open_ok:
                ctx.review("licence", entity_type="attraction", entity_id=rec.entity_id, file=page, licence=licence,
                           creator=creator)
            ctx.count("media_licence_ok" if open_ok else "media_needs_review")
        s.flush()


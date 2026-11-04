"""
Registered Geographical Indications, Bangladesh (Phase 8): the official evidence for district
specialities (guideline §3.7: a dish's district needs a source, not popularity).

Source: the DPDT list of registered GI products (HTML table: application no., date, product,
applicant, Nice class, registration no.). Food is Nice classes 29-32. The district comes from
the record itself:
  - the product name starts with a district's Bangla name ("রাজবাড়ীর ক্ষীর চমচম"): linked,
    evidence `product_name`, published
  - only the applicant names a district office ("জেলা প্রশাসক, সাতক্ষীরা"): linked, evidence
    `applicant`, waiting for review
  - neither (e.g. "বাংলাদেশ ইলিশ"): national, no district
"""

from __future__ import annotations

import html
import re
from datetime import date
from typing import Any, Iterable

from sqlalchemy import select

from app.models.catalog import AdminUnit, LocalFood
from vromon_data import http
from vromon_data.pipeline import Connector, Context, Record
from vromon_data.text import bn_to_latin, clean, slugify

GI_PAGE = "https://dpdt.gov.bd/pages/static-pages/6922dff0933eb65569e24bcf"
FOOD_CLASSES = {"29", "30", "31", "32"}
_BN = str.maketrans("০১২৩৪৫৬৭৮৯", "0123456789")
_TR = re.compile(r"<tr[^>]*>(.*?)</tr>", re.S)
_TD = re.compile(r"<t[dh][^>]*>(.*?)</t[dh]>", re.S)


def _cell(s: str) -> str:
    return " ".join(html.unescape(re.sub(r"<[^>]+>", " ", s)).split())


def _date(s: str) -> date | None:
    m = re.match(r"(\d{1,2})[./](\d{1,2})[./](\d{4})", s.translate(_BN))
    return date(int(m.group(3)), int(m.group(2)), int(m.group(1))) if m else None


class GiRegister(Connector):
    name = "dpdt_gi_register"
    version = "1"
    source_id = "dpdt_gi"
    creates_entities = False

    def fetch(self, ctx: Context):
        if ctx.params.get("html") is not None:
            content = ctx.params["html"].encode()
        else:
            with http.client() as c:
                content = http.get(c, GI_PAGE).content
        self.art = ctx.store_artifact(uri=GI_PAGE, content=content, content_type="text/html", filename_hint="gi-register.html")
        text = content.decode("utf-8", errors="replace")
        table = text[text.find("<table"):text.find("</table>")]
        self.rows = [[_cell(c) for c in _TD.findall(tr)] for tr in _TR.findall(table)]
        return [self.art]

    def parse(self, ctx: Context, arts) -> Iterable[dict[str, Any]]:
        header = self.rows[0] if self.rows else []
        for r in self.rows[1:]:
            if len(r) == len(header) and r[3]:
                yield {"id": r[6] or r[1], "serial": r[0], "application": r[1], "date": r[2], "product": r[3],
                       "applicant": r[4], "classes": r[5], "registration": r[6]}

    def normalize(self, ctx: Context, raw: dict[str, Any]) -> Record:
        return Record(entity_type="gi_product", source_record_id=raw["id"], fields={}, raw=raw)

    def after(self, ctx: Context, records: list[Record]) -> None:
        s = ctx.session
        districts = [u for u in s.scalars(select(AdminUnit).where(AdminUnit.level == "district")) if u.name_bn]
        for rec in records:
            r = rec.raw
            product, applicant = clean(r["product"]), clean(r["applicant"]) or ""
            classes = {c for c in re.findall(r"\d+", r["classes"].translate(_BN))}
            by_name = next((d for d in sorted(districts, key=lambda d: -len(d.name_bn)) if product.startswith(d.name_bn)), None)
            by_applicant = next((d for d in districts if re.search(rf"[,\s]{re.escape(d.name_bn)}(\s|$|,)", " " + applicant)), None)
            district, evidence = (by_name, "product_name") if by_name else (by_applicant, "applicant") if by_applicant \
                else (None, "national")
            reg = clean(r["registration"]) or ""
            slug = f"gi-{reg.translate(_BN)}-{slugify(bn_to_latin(product))}"[:200]
            row = s.scalar(select(LocalFood).where(LocalFood.slug == slug))
            if row is None:
                row = LocalFood(slug=slug, name_bn=product, source_id=self.source_id, last_checked_at=ctx.now)
                s.add(row)
                ctx.count("gi_new")
            row.name_bn, row.is_food = product, bool(classes & FOOD_CLASSES)
            row.nice_classes = ",".join(sorted(classes, key=int)) or None
            row.district_id, row.district_evidence = (district.id if district else None), evidence
            row.gi_application_no, row.gi_registration_no = clean(r["application"]), reg
            row.gi_application_date, row.applicant = _date(r["date"]), applicant
            row.source_url, row.artifact_id, row.last_checked_at, row.job_id = GI_PAGE, self.art.id, ctx.now, ctx.job.id
            if row.status != "rejected":
                row.status = "published" if evidence in ("product_name", "national") else "needs_review"
            if evidence == "applicant":
                ctx.review("food_district", entity_type="local_food", entity_id=row.id if row.id else None,
                           product=product, district=district.name_bn, reason="district taken from the applicant only")
            ctx.count(f"gi_{evidence}")
            ctx.count("gi_food" if row.is_food else "gi_other")
        s.flush()

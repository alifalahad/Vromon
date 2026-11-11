"""
Bangladesh Railway fare chart, eastern zone (Phase 5): "গুরুত্বপূর্ণ স্টেশনের ভাড়ার তালিকা (পূর্বাঞ্চল)".

Each row: from-station, to-station, distance (km), then fares for 2nd general, 2nd mail,
commuter, sulov, shovan, shovan chair, 1st chair, 1st berth, and for snigdha, AC seat and
AC berth the fare, VAT and the total payable. The numbers read cleanly; the station names
are printed in a legacy font encoding ("ঢাো" for ঢাকা) that can't be decoded reliably.

So nothing is guessed: every distinct printed name is listed in
source-registry/bd-railway-fare-station-names.csv for a person to transcribe once
("printed,station_bn"). Rows whose two names have a transcription get them (and their
hubs); the rest keep the printed text. All fares stay `needs_review` until a sample is
checked against the PDF. The western-zone chart is a scanned image and needs OCR or
transcription.
"""

from __future__ import annotations

import csv
import re
from datetime import datetime
from typing import Any, Iterable

from sqlalchemy import delete, select

from app.models.catalog import FareProduct, ReviewTask, TransportHub, TransportOperator
from vromon_data import artifacts, http
from vromon_data.paths import PLATFORM_DIR
from vromon_data.pdftext import pdf_lines
from vromon_data.pipeline import Connector, Context, Record
from vromon_data.text import clean, match_key

FARE_PAGE = "https://railway.gov.bd/pages/files/69199762933eb65569ddc6b9"
NAMES_FILE = PLATFORM_DIR / "source-registry" / "bd-railway-fare-station-names.csv"
_PDF = re.compile(r"https?://[^\"' <>]+\.pdf")
_BN = str.maketrans("০১২৩৪৫৬৭৮৯", "0123456789")
# Column order as printed in the chart's header
PLAIN = [("second_general", "২য় সাধারণ"), ("second_mail", "২য় মেইল"), ("commuter", "কমিউটার"), ("sulov", "সুলভ"),
         ("shovan", "শোভন"), ("shovan_chair", "শোভন চেয়ার"), ("first_chair", "১ম চেয়ার"), ("first_berth", "১ম বার্থ")]
WITH_VAT = [("snigdha", "স্নিগ্ধা", True), ("ac_seat", "এসি সিট", True), ("ac_berth", "এসি বার্থ", True)]
_NUM = re.compile(r"^[০-৯0-9]+$")


def load_names() -> dict[str, str]:
    if not NAMES_FILE.exists():
        return {}
    with open(NAMES_FILE, encoding="utf-8-sig", newline="") as f:
        return {r["printed"]: clean(r["station_bn"]) for r in csv.DictReader(f) if clean(r.get("station_bn"))}


def save_names(printed: set[str], known: dict[str, str]) -> None:
    rows = sorted(printed | set(known))
    with open(NAMES_FILE, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow(["printed", "station_bn"])
        for p in rows:
            w.writerow([p, known.get(p, "")])


class RailwayFaresEast(Connector):
    name = "bd_railway_fares_east"
    version = "1"
    source_id = "bd_railway"
    auto_accept = True
    creates_entities = False

    def fetch(self, ctx: Context):
        if ctx.params.get("pdf"):
            content, url = open(ctx.params["pdf"], "rb").read(), "test://fares-east.pdf"
        else:
            with http.client(timeout=300) as c:
                r = http.get(c, FARE_PAGE)
                links = _PDF.findall(r.text)
                if not links:
                    raise LookupError("no PDF on the eastern fare page")
                url = links[0]
                content = http.get(c, url, check_robots=False).content
        self.art = ctx.store_artifact(uri=url, content=content, content_type="application/pdf", filename_hint="fares-east.pdf")
        self.url = url
        return [self.art]

    def parse(self, ctx: Context, arts) -> Iterable[dict[str, Any]]:
        for page_no, lines in enumerate(pdf_lines(artifacts.raw_path(self.art)), 1):
            for line in lines:
                # An unmapped glyph between two names is the font's word space
                tokens = re.sub(r"[\x00-\x1f\ufffd]", " ", line).split()
                nums = []
                while tokens and _NUM.match(tokens[-1]):
                    nums.insert(0, int(tokens.pop().translate(_BN)))
                if len(nums) != 1 + len(PLAIN) + 3 * len(WITH_VAT) or len(tokens) < 2:
                    if len(nums) >= 10:
                        ctx.error("parse", "fare row with an unexpected number of columns", None, line=line, page=page_no)
                    continue
                yield {"id": f"{page_no}:{line}", "page": page_no, "names": tokens, "nums": nums, "line": line}

    def normalize(self, ctx: Context, raw: dict[str, Any]) -> Record:
        return Record(entity_type="fare_row", source_record_id=raw["id"], fields={}, raw=raw)

    def after(self, ctx: Context, records: list[Record]) -> None:
        s = ctx.session
        op = s.scalar(select(TransportOperator).where(TransportOperator.slug == "bangladesh-railway"))
        names = load_names()
        hubs = {match_key(h.name_bn): h.id for h in s.scalars(select(TransportHub).where(
            TransportHub.hub_type.in_(("railway_station", "railway_halt")), TransportHub.name_bn.is_not(None)))}
        printed_all: set[str] = set()
        s.execute(delete(FareProduct).where(FareProduct.source_url == self.url, FareProduct.status == "needs_review"))
        written = resolved = 0
        for rec in records:
            raw = rec.raw
            toks = raw["names"]
            # Two station names, each one or more words: split where both halves are known transcriptions,
            # else in the middle of a two-word pair (the common case)
            split = next((i for i in range(1, len(toks)) if " ".join(toks[:i]) in names and " ".join(toks[i:]) in names), None)
            if split is None:
                split = 1 if len(toks) == 2 else len(toks) // 2
            a, b = " ".join(toks[:split]), " ".join(toks[split:])
            printed_all |= {a, b}
            a_bn, b_bn = names.get(a), names.get(b)
            if a_bn and b_bn:
                resolved += 1
            nums = raw["nums"]
            distance, rest = nums[0], nums[1:]
            common = dict(mode="train", operator_id=op.id if op else None, origin_name=a_bn or a, destination_name=b_bn or b,
                          origin_hub_id=hubs.get(match_key(a_bn)) if a_bn else None,
                          destination_hub_id=hubs.get(match_key(b_bn)) if b_bn else None,
                          official_distance_km=float(distance), currency="BDT", fare_type="official_operator",
                          source_id=self.source_id, artifact_id=self.art.id, source_url=self.url, source_page=raw["page"],
                          last_checked_at=ctx.now, verification_method="parsed_official_pdf", status="needs_review",
                          job_id=ctx.job.id,
                          notes=None if (a_bn and b_bn) else "station names printed in a legacy font encoding; awaiting transcription")
            for (code, label), amount in zip(PLAIN, rest[:len(PLAIN)]):
                if amount:
                    s.add(FareProduct(fare_class=code, fare_class_label=label, ac=False, amount=float(amount), **common))
                    written += 1
            vat = rest[len(PLAIN):]
            for i, (code, label, ac) in enumerate(WITH_VAT):
                base, tax, total = vat[3 * i:3 * i + 3]
                if total:
                    row = dict(common)
                    if base + tax != total:
                        # As printed: the chart's total is what the passenger pays (VAT rounding)
                        ctx.count("totals_differ_from_fare_plus_vat")
                        note = f"printed total {total} = fare {base} + VAT {tax} {'+' if total > base + tax else '-'} {abs(total - base - tax)} (as printed)"
                        row["notes"] = "; ".join(n for n in (common["notes"], note) if n)
                    s.add(FareProduct(fare_class=code, fare_class_label=label, ac=ac, amount=float(total),
                                      base_amount=float(base), vat_amount=float(tax), **row))
                    written += 1
        if not ctx.dry_run:
            save_names(printed_all, names)
        ctx.count("fare_rows", len(records))
        ctx.count("fares_written", written)
        ctx.count("rows_with_transcribed_names", resolved)
        ctx.count("printed_station_names", len(printed_all))
        if resolved < len(records):
            ctx.review("transcription", entity_type="fare_product", file=str(NAMES_FILE.relative_to(PLATFORM_DIR)),
                       untranscribed=len(printed_all - set(names)),
                       reason="type each printed station name's real Bangla name, then run the connector again")
        s.flush()

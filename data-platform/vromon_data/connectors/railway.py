"""
Bangladesh Railway intercity timetable (Phase 5), from the official PDFs on railway.gov.bd.

The timetable pages name the version and its effective date ("টাইম টেবিল নং ৫৪ অনুসারে,
কার্যকরের তারিখ: ১০.০৩.২০২৫"); each links a PDF. The PDF text is decoded with
vromon_data.pdftext (its fonts lack a full Unicode map). Rows of the "আন্তঃনগর ট্রেনের
তালিকা" pages become one train service each: number, name, weekly off day, origin and
departure, destination and arrival. Times are Asia/Dhaka; an arrival earlier than the
departure is the next day. Each direction is its own service, as printed.

Scanned PDFs (no text layer) are recorded as such and left for transcription: nothing is
guessed. Stations are linked to railway hubs by name (any script) only when exactly one
hub matches; others keep the printed name and go to review. Every service stays
`needs_review` until a person has checked the version's sample against the PDF
(review task `timetable_sample`); approving it publishes the version.
"""

from __future__ import annotations

import random
import re
import uuid
from datetime import date
from typing import Any, Iterable

from sqlalchemy import select

from app.models.catalog import (
    EntityName, ReviewTask, TimetableVersion, TransportHub, TransportOperator, Train, TrainService,
)
from vromon_data import artifacts, http
from vromon_data.pdftext import pdf_lines
from vromon_data.pipeline import Connector, Context, Record
from vromon_data.dedup import _km as geo_km
from vromon_data.text import clean, match_key, name_similarity

PAGES = {  # zone -> timetable page on railway.gov.bd
    "east": "https://railway.gov.bd/pages/static-pages/691997bf933eb65569ddec51",
    "west": "https://railway.gov.bd/pages/static-pages/691997b8933eb65569dde71d",
}
_TITLE = re.compile(r"<title[^>]*>(.*?)</title>", re.S)
_PDF = re.compile(r"https?://[^\"' <>]+\.pdf")
_VERSION = re.compile(r"টাইম টেবিল নং\s*([০-৯0-9]+).*?কার্যকরের তারিখ[:ঃ]?\s*([০-৯0-9]{1,2})\.([০-৯0-9]{1,2})\.([০-৯0-9]{4})")
_BN_DIGITS = str.maketrans("০১২৩৪৫৬৭৮৯", "0123456789")
WEEKDAYS = {"সোমবার": 0, "মঙ্গলবার": 1, "বুধবার": 2, "বৃহস্পতিবার": 3, "শুক্রবার": 4, "শনিবার": 5, "রবিবার": 6}
_TIME = re.compile(r"^[০-৯0-9]{4}$")
_SERIAL = re.compile(r"^([০-৯0-9]+)।\s+(.*)$")


def parse_row(line: str, has_off_day: bool, known_stations: frozenset = frozenset()) -> tuple | None:
    """(serial, number, name, off_day, origin, departure, destination, arrival) from a train-list row,
    read from the right: the row always ends "<origin> <time> <destination> <time>"; station names
    can have spaces. The off-day column exists only in tables whose header has "বন্ধের দিন"."""
    m = _SERIAL.match(line)
    if not m:
        return None
    tokens = m.group(2).split()
    times = [i for i, t in enumerate(tokens) if _TIME.match(t)]
    if len(times) < 2 or times[-1] != len(tokens) - 1:
        return None
    t_dep, t_arr = times[-2], times[-1]
    dest = " ".join(tokens[t_dep + 1:t_arr])
    head = tokens[:t_dep]                     # number, name, [off day], origin…
    if len(head) < 3 or not dest:
        return None
    number, rest = head[0], head[1:]
    off = None
    off_idx = next((i for i, t in enumerate(rest) if t == "-" or t in WEEKDAYS), None) if has_off_day else None
    if off_idx is not None:
        name, off, origin = " ".join(rest[:off_idx]), rest[off_idx], " ".join(rest[off_idx + 1:])
    else:
        # No off-day column: the origin is the longest ending of the row that is a known station name
        # (destinations parse unambiguously, so they are the dictionary), else the last word
        cut = next((i for i in range(1, len(rest)) if " ".join(rest[i:]) in known_stations), len(rest) - 1)
        origin, name = " ".join(rest[cut:]), " ".join(rest[:cut])
    if not name or not origin:
        return None
    return m.group(1), number, name, off, origin, tokens[t_dep], dest, tokens[t_arr]


SAMPLE_SIZE = 12


def _digits(s: str) -> str:
    return s.translate(_BN_DIGITS)


def _hhmm(s: str) -> str:
    s = _digits(s)
    return f"{s[:2]}:{s[2:]}"


class RailwayTimetable(Connector):
    name = "bd_railway_timetable"
    version = "1"
    source_id = "bd_railway"
    auto_accept = True          # official operator source; services still wait for the sample check
    order = ("train_service",)

    # --- fetch ------------------------------------------------------------------------------
    def fetch(self, ctx: Context):
        s = ctx.session
        self.operator = s.scalar(select(TransportOperator).where(TransportOperator.slug == "bangladesh-railway"))
        if self.operator is None:
            self.operator = TransportOperator(slug="bangladesh-railway", name_en="Bangladesh Railway", name_bn="বাংলাদেশ রেলওয়ে",
                                              operator_type="railway", website="https://railway.gov.bd/")
            s.add(self.operator)
            s.flush()
        self.zones: list[dict] = []
        local = ctx.params.get("pdfs")  # tests: {"west": {"path": ..., "title": ...}}
        with http.client(timeout=300) as c:
            for zone, page_url in PAGES.items():
                if local is not None:
                    if zone not in local:
                        continue
                    title, pdf_url = local[zone]["title"], f"test://{zone}.pdf"
                    content = open(local[zone]["path"], "rb").read()
                else:
                    r = http.get(c, page_url)
                    m = _TITLE.search(r.text)
                    title = " ".join(m.group(1).split()) if m else ""
                    links = _PDF.findall(r.text)
                    if not links:
                        ctx.error("fetch", f"no PDF on the {zone} timetable page", zone)
                        continue
                    pdf_url = links[0]
                    content = http.get(c, pdf_url, check_robots=False).content
                art = ctx.store_artifact(uri=pdf_url, content=content, content_type="application/pdf",
                                         filename_hint=f"timetable-{zone}.pdf")
                self.zones.append({"zone": zone, "title": title, "page_url": page_url, "pdf_url": pdf_url, "artifact": art})
        return [z["artifact"] for z in self.zones]

    def _version(self, ctx: Context, z: dict) -> TimetableVersion:
        m = _VERSION.search(z["title"])
        name = f"Time table no. {_digits(m.group(1))}" if m else "Time table (number not stated)"
        eff = date(int(_digits(m.group(4))), int(_digits(m.group(3))), int(_digits(m.group(2)))) if m else None
        v = ctx.session.scalar(select(TimetableVersion).where(TimetableVersion.operator_id == self.operator.id,
                                                              TimetableVersion.name == name, TimetableVersion.zone == z["zone"]))
        if v is None:
            v = TimetableVersion(operator_id=self.operator.id, name=name, zone=z["zone"], effective_from=eff,
                                 artifact_id=z["artifact"].id, source_url=z["pdf_url"], status="needs_review")
            ctx.session.add(v)
            ctx.session.flush()
        return v

    # --- parse ------------------------------------------------------------------------------
    def parse(self, ctx: Context, arts) -> Iterable[dict[str, Any]]:
        self.versions: dict[str, TimetableVersion] = {}
        for z in self.zones:
            version = self._version(ctx, z)
            self.versions[z["zone"]] = version
            pages = pdf_lines(artifacts.raw_path(z["artifact"]))
            # Destinations (between the two times) are read unambiguously: they name the stations
            self.known_stations = frozenset(r[6] for lines in pages for line in lines
                                            if (r := parse_row(line, False)) and " " in r[6])
            if not any(line.strip() for p in pages for line in p):
                ctx.error("parse", f"{z['zone']} timetable PDF is scanned (no text layer): needs OCR or transcription",
                          z["zone"], url=z["pdf_url"])
                ctx.count(f"scanned_{z['zone']}")
                continue
            for page_no, lines in enumerate(pages, 1):
                header = " ".join(lines[:4])
                if "ট্রেনের তালিকা" not in header:
                    continue
                has_off_day = "বন্ধের দিন" in header
                for line in lines:
                    row = parse_row(line, has_off_day, self.known_stations)
                    if row:
                        yield {"id": f"{version.name}|{z['zone']}|{_digits(row[1])}", "zone": z["zone"], "page": page_no,
                               "m": row, "line": line, "artifact_id": z["artifact"].id, "url": z["pdf_url"]}
                    elif re.match(r"^[০-৯0-9]+।", line):
                        ctx.error("parse", "timetable row not understood", None, line=line, page=page_no, zone=z["zone"])

    # --- normalize ---------------------------------------------------------------------------
    def _stations(self, ctx: Context) -> list[tuple[uuid.UUID, list[str]]]:
        if not hasattr(self, "_station_names"):
            hubs = ctx.session.scalars(select(TransportHub).where(TransportHub.hub_type.in_(("railway_station", "railway_halt")))).all()
            self._where = {h.id: (h.latitude, h.longitude, h.slug) for h in hubs}
            names: dict[uuid.UUID, list[str]] = {h.id: [] for h in hubs}
            for n in ctx.session.scalars(select(EntityName).where(EntityName.entity_type == "transport_hub",
                                                                  EntityName.entity_id.in_(list(names)))):
                names[n.entity_id].append(n.name)
            self._station_names = list(names.items())
        return self._station_names

    def _one_place(self, ids: list[uuid.UUID]) -> uuid.UUID | None:
        """The hub when all candidates are one station (within 1 km: OSM often maps a station twice)."""
        if not ids:
            return None
        pts = [self._where[i] for i in ids if self._where[i][0] is not None]
        if len(pts) == len(ids) and all(geo_km(pts[0][:2], p[:2]) <= 1.0 for p in pts):
            return min(ids, key=lambda i: self._where[i][2])
        return None

    def _hub_for(self, ctx: Context, printed: str) -> uuid.UUID | None:
        key = match_key(printed)
        exact = [hid for hid, ns in self._stations(ctx) if any(match_key(n) == key for n in ns)]
        if exact:
            return self._one_place(exact)
        close = [hid for hid, ns in self._stations(ctx) if max((name_similarity(printed, n) for n in ns), default=0) >= 92]
        return self._one_place(close)

    def normalize(self, ctx: Context, raw: dict[str, Any]) -> Record:
        serial, number, name, off, origin, dep, dest, arr = raw["m"]
        number = _digits(number)
        origin, dest = clean(origin), clean(dest)
        dep_t, arr_t = _hhmm(dep), _hhmm(arr)
        o_hub, d_hub = self._hub_for(ctx, origin), self._hub_for(ctx, dest)
        fields = {
            "origin_name": origin, "destination_name": dest, "departure_time": dep_t, "arrival_time": arr_t,
            "arrival_day_offset": 1 if arr_t < dep_t else 0,
            "off_day": WEEKDAYS.get(off) if off else None, "off_day_text": off if off and off != "-" else None,
            "runs_daily": (off == "-") if off else None,
            "origin_hub_id": str(o_hub) if o_hub else None, "destination_hub_id": str(d_hub) if d_hub else None,
        }
        rec = Record(entity_type="train_service", source_record_id=raw["id"], fields=fields,
                     raw={"line": raw["line"], "page": raw["page"], "zone": raw["zone"], "number": number,
                          "name": clean(name), "serial": _digits(serial)},
                     external_ids=[("bd_railway_service", raw["id"])], artifact_id=raw["artifact_id"],
                     source_url=f"{raw['url']}#page={raw['page']}", confidence="high",
                     verification_method="parsed_official_pdf")
        for printed, hub in ((origin, o_hub), (dest, d_hub)):
            if hub is None:
                ctx.count("stations_unmatched")
        return rec

    def validate(self, ctx: Context, records: list[Record]) -> None:
        for rec in records:
            f = rec.fields
            if "�" in (f["origin_name"] or "") + (f["destination_name"] or "") + (rec.raw["name"] or ""):
                rec.review.append(("parse_check", {"reason": "a character in this row could not be decoded",
                                                   "printed": rec.raw["line"], "page": rec.raw["page"]}))
            for t in (f["departure_time"], f["arrival_time"]):
                h, m = int(t[:2]), int(t[3:])
                if not (0 <= h <= 23 and 0 <= m <= 59):
                    rec.errors.append(f"impossible time {t}")
            if f["origin_name"] == f["destination_name"]:
                rec.errors.append("origin and destination are the same")

    # --- entities -----------------------------------------------------------------------------
    def create(self, ctx: Context, record: Record) -> uuid.UUID:
        s = ctx.session
        number, name = record.raw["number"], record.raw["name"]
        train = s.scalar(select(Train).where(Train.operator_id == self.operator.id, Train.train_number == number))
        if train is None:
            kind = "international" if "/" in number else ("intercity" if name and "এক্সপ্রেস" in name else None)
            train = Train(operator_id=self.operator.id, train_number=number, name_bn=name, train_class=kind)
            s.add(train)
            s.flush()
        svc = TrainService(timetable_version_id=self.versions[record.raw["zone"]].id, train_id=train.id,
                           status="needs_review", created_by_job_id=ctx.job.id, field_status={})
        s.add(svc)
        s.flush()
        return svc.id

    def after(self, ctx: Context, records: list[Record]) -> None:
        s = ctx.session
        for zone, version in self.versions.items():
            recs = [r for r in records if r.raw.get("zone") == zone and r.entity_id and not r.errors]
            if not recs:
                continue
            ctx.count(f"services_{zone}", len(recs))
            open_task = s.scalar(select(ReviewTask.id).where(ReviewTask.task_type == "timetable_sample",
                                                             ReviewTask.entity_id == version.id,
                                                             ReviewTask.status == "open"))
            if version.status != "published" and open_task is None:
                sample = random.Random(str(version.id)).sample(recs, min(SAMPLE_SIZE, len(recs)))
                s.add(ReviewTask(task_type="timetable_sample", entity_type="timetable_version", entity_id=version.id,
                                 priority=1, job_id=ctx.job.id, payload={
                                     "version": version.name, "zone": zone, "pdf": version.source_url,
                                     "services": len(recs),
                                     "check": [{"page": r.raw["page"], "printed": r.raw["line"],
                                                "parsed": {k: r.fields[k] for k in ("departure_time", "arrival_time",
                                                                                     "off_day_text", "origin_name",
                                                                                     "destination_name")}}
                                               for r in sample]}))
                ctx.count("review_timetable_sample")
        unmatched = sorted({n for r in records if not r.errors
                            for n, h in ((r.fields["origin_name"], r.fields["origin_hub_id"]),
                                         (r.fields["destination_name"], r.fields["destination_hub_id"])) if h is None})
        if unmatched:
            older = list(s.scalars(select(ReviewTask).where(ReviewTask.task_type == "unmatched_station",
                                                            ReviewTask.status == "open")))
            for t in older:
                if t.payload.get("stations") != unmatched:
                    t.status, t.reason = "superseded", f"replaced by job {ctx.job.id}"
            if not any(t.payload.get("stations") == unmatched for t in older):
                hubs = {h.id: h for h in s.scalars(select(TransportHub).where(
                    TransportHub.hub_type.in_(("railway_station", "railway_halt"))))}
                suggestions = {}
                for printed in unmatched:
                    scored = sorted(((max((name_similarity(printed, n) for n in ns), default=0), hid)
                                     for hid, ns in self._stations(ctx)), reverse=True)[:3]
                    suggestions[printed] = [f"{hubs[h].name_bn or hubs[h].name_en} ({hubs[h].slug}, {round(sc)})"
                                            for sc, h in scored if sc > 0]
                s.add(ReviewTask(task_type="unmatched_station", entity_type="train_service", priority=2, job_id=ctx.job.id,
                                 payload={"stations": unmatched, "suggestions": suggestions,
                                          "reason": "no single railway hub matches these printed names"}))
        s.flush()

"""
Fares a person typed from an official chart that is only published as a scanned image
(Phase 6): BRTA's inter-district bus fare charts, BIWTA launch fare charts, the railway's
western-zone fare chart. Nothing is read by machine from those images, so a person
transcribes rows into a CSV (template: `vromon_data fares template`) and this connector
imports them with the chart's own identity.

CSV columns: mode, origin, destination, via, fare_class, ac, vehicle_seats, amount,
official_distance_km, effective_from (YYYY-MM-DD), chart_url, chart_page, transcribed_by,
notes. `fare_type` comes from the source: BRTA charts are `regulated` (the maximum
government fare), railway and BIWTA charts `official_operator`.

Imported fares are `needs_review` until a second person checks a sample against the chart.
"""

from __future__ import annotations

import csv
from datetime import date, datetime
from pathlib import Path
from typing import Any, Iterable

from app.models.catalog import FareProduct
from vromon_data.pipeline import Connector, Context, Record
from vromon_data.text import clean

COLUMNS = ["mode", "origin", "destination", "via", "fare_class", "ac", "vehicle_seats", "amount", "official_distance_km",
           "effective_from", "chart_url", "chart_page", "transcribed_by", "notes"]
FARE_TYPE = {"bd_brta": "regulated", "bd_railway": "official_operator", "bd_biwta": "official_operator"}
MODES = {"bus", "train", "launch", "ferry"}


def write_template(path: Path) -> None:
    with open(path, "w", encoding="utf-8-sig", newline="") as f:
        csv.writer(f).writerow(COLUMNS)


class TranscribedFares(Connector):
    name = "transcribed_fares"
    version = "1"
    source_id = "bd_brta"      # set per run: --params '{"source_id": "bd_biwta", "file": "..."}'
    creates_entities = False

    def __init__(self, source_id: str | None = None):
        if source_id:
            self.source_id = source_id

    def fetch(self, ctx: Context):
        if ctx.params.get("source_id"):
            self.source_id = ctx.params["source_id"]
        path = Path(ctx.params["file"])
        self.art = ctx.store_artifact(uri=f"manual://{path.name}", content=path.read_bytes(), content_type="text/csv",
                                      filename_hint=path.name)
        with open(path, encoding="utf-8-sig", newline="") as f:
            self.rows = list(csv.DictReader(f))
        return [self.art]

    def parse(self, ctx: Context, arts) -> Iterable[dict[str, Any]]:
        for i, r in enumerate(self.rows, 2):
            yield {"id": f"{self.art.sha256[:12]}:{i}", "line": i, **r}

    def normalize(self, ctx: Context, raw: dict[str, Any]) -> Record:
        return Record(entity_type="fare_row", source_record_id=raw["id"], fields={}, raw=raw)

    def validate(self, ctx: Context, records: list[Record]) -> None:
        for rec in records:
            r = rec.raw
            if (r.get("mode") or "").strip() not in MODES:
                rec.errors.append(f"line {r['line']}: mode must be one of {sorted(MODES)}")
            for col in ("origin", "destination", "fare_class", "amount", "chart_url", "transcribed_by"):
                if not clean(r.get(col)):
                    rec.errors.append(f"line {r['line']}: {col} is required")
            try:
                if float(r.get("amount") or "x") < 0:
                    rec.errors.append(f"line {r['line']}: negative fare")
            except ValueError:
                rec.errors.append(f"line {r['line']}: amount is not a number")
            if r.get("effective_from"):
                try:
                    date.fromisoformat(r["effective_from"])
                except ValueError:
                    rec.errors.append(f"line {r['line']}: effective_from must be YYYY-MM-DD")

    def after(self, ctx: Context, records: list[Record]) -> None:
        fare_type = FARE_TYPE.get(self.source_id, "official_operator")
        for rec in records:
            if rec.errors:
                continue
            r = rec.raw
            ac = (r.get("ac") or "").strip().lower()
            ctx.session.add(FareProduct(
                mode=r["mode"].strip(), origin_name=clean(r["origin"]), destination_name=clean(r["destination"]),
                fare_class=clean(r["fare_class"]), fare_class_label=clean(r.get("via")) and f"via {clean(r['via'])}",
                ac=True if ac in ("yes", "true", "1", "ac") else False if ac in ("no", "false", "0", "non-ac") else None,
                vehicle_seats=int(r["vehicle_seats"]) if (r.get("vehicle_seats") or "").strip().isdigit() else None,
                amount=float(r["amount"]),
                official_distance_km=float(r["official_distance_km"]) if (r.get("official_distance_km") or "").strip() else None,
                effective_from=date.fromisoformat(r["effective_from"]) if r.get("effective_from") else None,
                currency="BDT", fare_type=fare_type, source_id=self.source_id, artifact_id=self.art.id,
                source_url=clean(r["chart_url"]),
                source_page=int(r["chart_page"]) if (r.get("chart_page") or "").strip().isdigit() else None,
                last_checked_at=ctx.now, verification_method="human_transcription", status="needs_review",
                notes="; ".join(n for n in (f"transcribed by {clean(r['transcribed_by'])}", clean(r.get("notes"))) if n),
                job_id=ctx.job.id))
            ctx.count("fares_written")

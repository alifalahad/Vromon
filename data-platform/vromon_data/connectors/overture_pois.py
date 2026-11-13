"""
The places index (docs/trip-upgrades, step 5): every kind of place in Bangladesh but hotels and
restaurants (the catalog has those, reviewed), for "search anything" in a trip's free time (step 6).

  overture_pois  Overture Maps Places (CDLA-Permissive-2.0; some rows derived from OpenStreetMap, ODbL,
                 credited "© OpenStreetMap contributors, Overture Maps Foundation"). One DuckDB query
                 over Overture's open S3 release for the Bangladesh box, confidence >= 0.4. The raw
                 parquet is kept with its manifest; then `poi_index` is loaded:
                 - the district, from the curated admin geography (points outside Bangladesh dropped);
                 - a friendly kind from the backend's app/core/poi-kinds.yaml (a generic kind made specific by a
                   word in the name: "Brajalal College" → college); unmapped categories become "other"
                   and are listed in the report;
                 - name_key (vromon_data.text.match_key) for spelling-insensitive search;
                 - name_bn from Overture's common names (or a primary name in Bangla).
                 The same place listed twice at about the same spot (same kind and name key) is kept once,
                 the more confident listing.

A run replaces this source's rows in poi_index in the run's transaction (a failure rolls back and the
old rows stay). Records aren't staged one by one (hundreds of thousands): the job, the artifact and the
counts are the provenance. Not checked by a person: they are listings, as Overture publishes them.
"""

from __future__ import annotations

import re
from collections import Counter
from datetime import datetime
from typing import Any, Iterable, Iterator

from sqlalchemy import delete, insert

from app.core.poi_kinds import KINDS_FILE, KindMap, kind_map  # noqa: F401 (the kinds file is shared with search)
from app.models.catalog import PoiIndex
from vromon_data import artifacts
from vromon_data.admin_lookup import AdminLookup
from vromon_data.connectors.service_places import BD_BOX, OVERTURE_S3, latest_release
from vromon_data.pipeline import Connector, Context, Record
from vromon_data.text import clean, match_key

MIN_CONFIDENCE = 0.4
CLOSED = {"permanently_closed", "closed"}
BATCH = 5000
_BN = re.compile(r"[ঀ-৿]")


class OverturePois(Connector):
    name = "overture_pois"
    version = "1"
    source_id = "overture_pois"
    creates_entities = False
    full_snapshot = False

    def fetch(self, ctx: Context):
        self.lookup = AdminLookup(ctx.session)
        self.kinds = kind_map()
        self.unmapped: Counter = Counter()
        self.path = None
        if ctx.params.get("rows") is not None:     # tests
            self.rows = ctx.params["rows"]
            return []
        import duckdb
        release = ctx.params.get("release") or latest_release()
        out = artifacts.paths.RAW_DIR / f"_tmp-overture-pois-{release}.parquet"
        out.parent.mkdir(parents=True, exist_ok=True)
        if ctx.params.get("parquet"):              # an earlier download of the same release, saved again
            out.write_bytes(open(ctx.params["parquet"], "rb").read())
        else:
            con = duckdb.connect()
            con.execute("INSTALL httpfs; LOAD httpfs; INSTALL spatial; LOAD spatial; SET s3_region='us-west-2';")
            w, s, e, n = BD_BOX
            con.execute(f"""COPY (SELECT id, names.primary AS name, names.common AS names_common, basic_category AS category,
                taxonomy.primary AS taxonomy, confidence, operating_status, ST_X(geometry) AS lon, ST_Y(geometry) AS lat
                FROM read_parquet('{OVERTURE_S3}/{release}/theme=places/type=place/*', hive_partitioning=1)
                WHERE bbox.xmin > {w} AND bbox.xmax < {e} AND bbox.ymin > {s} AND bbox.ymax < {n} AND confidence >= {MIN_CONFIDENCE})
                TO '{out.as_posix()}' (FORMAT parquet)""")
        self.art = ctx.store_artifact(uri=f"{OVERTURE_S3}/{release}/theme=places#bd-all", content=out.read_bytes(),
                                      content_type="application/vnd.apache.parquet",
                                      filename_hint=f"overture-{release}-bd-pois.parquet")
        self.path = out
        ctx.count("release_" + release.replace(".", "_"))
        return [self.art]

    def _rows(self) -> Iterator[dict[str, Any]]:
        if self.path is None:
            yield from self.rows
            return
        import duckdb
        con = duckdb.connect()
        cur = con.execute(f"SELECT id, name, names_common, category, confidence, operating_status, lon, lat FROM '{self.path.as_posix()}'")
        cols = [d[0] for d in cur.description]
        while True:
            chunk = cur.fetchmany(50_000)
            if not chunk:
                break
            for r in chunk:
                yield dict(zip(cols, r))

    def parse(self, ctx: Context, arts) -> Iterable[dict[str, Any]]:
        return []   # loaded in bulk by after(): not staged record by record

    def normalize(self, ctx: Context, raw: dict[str, Any]) -> Record | None:
        return None

    def after(self, ctx: Context, records: list[Record]) -> None:
        now = datetime.utcnow()
        best: dict[tuple, dict] = {}
        for r in self._rows():
            ctx.count("overture_rows")
            conf = r.get("confidence") or 0
            if conf < MIN_CONFIDENCE:
                ctx.count("skipped_low_confidence")
                continue
            if (r.get("operating_status") or "open") in CLOSED:
                ctx.count("skipped_closed")
                continue
            name = clean(r.get("name"))
            common = r.get("names_common") or {}
            name_bn = clean(common.get("bn")) or (name if name and _BN.search(name) else None)
            name_en = clean(common.get("en")) or (name if name and not _BN.search(name) else None)
            if not (name_en or name_bn):
                ctx.count("skipped_no_name")
                continue
            kind, mapped = self.kinds.kind_of(r.get("category"), name_en, name_bn)
            if kind is None:
                ctx.count("skipped_lodging_food")
                continue
            if not mapped:
                self.unmapped[r.get("category") or "(none)"] += 1
            if r.get("lat") is None or r.get("lon") is None:
                ctx.count("skipped_no_location")
                continue
            district = self.lookup.district_of(r["lat"], r["lon"])
            if district is None:
                ctx.count("skipped_outside_bangladesh")
                continue
            key_name = match_key(name_en or name_bn, drop_generic=False)
            row = {"id": str(r["id"])[:64], "source": "overture", "name": (name_en or name_bn)[:300], "name_bn": (name_bn or None) and name_bn[:300],
                   "category": (r.get("category") or None) and r["category"][:80], "kind": kind,
                   "lat": round(r["lat"], 6), "lon": round(r["lon"], 6), "district_id": district,
                   "confidence": round(conf, 3), "name_key": key_name[:300], "updated_at": now}
            # The same place listed twice at about the same spot (~100 m): the more confident listing
            dup = (kind, key_name, round(r["lat"], 3), round(r["lon"], 3))
            have = best.get(dup)
            if have is not None:
                ctx.count("skipped_duplicate")
                if have["confidence"] >= row["confidence"]:
                    continue
            best[dup] = row
        rows = list(best.values())
        # Replace this source's rows, in the run's transaction
        ctx.session.execute(delete(PoiIndex).where(PoiIndex.source == "overture"))
        for i in range(0, len(rows), BATCH):
            ctx.session.execute(insert(PoiIndex), rows[i:i + BATCH])
        ctx.session.flush()
        ctx.count("loaded", len(rows))
        for kind, n in Counter(r["kind"] for r in rows).most_common():
            ctx.count(f"kind_{kind}", n)
        if self.path is not None and self.path.exists():
            self.path.unlink()

    def report(self, ctx: Context) -> dict[str, Any]:
        return {**ctx.counts, "unmapped_categories": dict(self.unmapped.most_common())}

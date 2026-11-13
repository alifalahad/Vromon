"""The places index (docs/trip-upgrades, step 5): Overture listings → poi_index, with kinds, districts, no duplicates."""

from __future__ import annotations

import uuid

import duckdb
import pytest
from sqlalchemy import func, select

from app.models.catalog import AdminUnit, IngestionJob, PoiIndex
from tests.test_attractions import _setup
from vromon_data import paths, pipeline
from vromon_data.connectors import overture_pois
from vromon_data.connectors.overture_pois import OverturePois, kind_map
from vromon_data.text import match_key


def _row(i, name, cat, conf=0.9, lat=22.1, lon=90.1, bn=None, status=None):
    return {"id": f"o{i}", "name": name, "names_common": {"bn": bn} if bn else None, "category": cat, "confidence": conf,
            "operating_status": status, "lon": lon, "lat": lat}


ROWS = [
    _row(1, "BM College", "place_of_learning"),                                      # → college (a word in the name)
    _row(2, "BM College", "place_of_learning", conf=0.6, lat=22.1002),               # the same, listed again: dropped
    _row(3, "Hotel Grand", "hotel"),                                                 # lodging: the catalog has it
    _row(4, "Tiny Kiosk", "shopping", conf=0.3),                                     # under 0.4
    _row(5, "Across the Border School", "high_school", lat=23.5, lon=95.0),           # not in Bangladesh
    _row(6, "Moon Base", "space_station"),                                           # unmapped: "other", listed
    _row(7, "বোরহানউদ্দিন বাজার", "shopping", lat=22.2, lon=90.3),                     # a market in Bhola, in Bangla
    _row(8, "Old Cinema", "movie_theater", status="permanently_closed"),             # closed
    _row(9, "Sadar Hospital", "hospital", lat=22.3, lon=90.7, bn="সদর হাসপাতাল"),     # Chittagong, with its Bangla name
]


def _parquet(tmp_path, rows) -> str:
    """Rows as the connector's download would save them."""
    path = tmp_path / "fixture.parquet"
    con = duckdb.connect()
    con.execute("CREATE TABLE t (id VARCHAR, name VARCHAR, names_common MAP(VARCHAR, VARCHAR), category VARCHAR, taxonomy VARCHAR, "
                "confidence DOUBLE, operating_status VARCHAR, lon DOUBLE, lat DOUBLE)")
    for r in rows:
        con.execute("INSERT INTO t VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    [r["id"], r["name"], r["names_common"], r["category"], r["category"], r["confidence"], r["operating_status"], r["lon"], r["lat"]])
    con.execute(f"COPY t TO '{path.as_posix()}' (FORMAT parquet)")
    return str(path)


def _index(session) -> dict[str, PoiIndex]:
    return {p.name: p for p in session.scalars(select(PoiIndex))}


def _district(session, p: PoiIndex) -> str:
    return session.get(AdminUnit, p.district_id).name_en


def test_kinds_from_categories_and_name_words():
    k = kind_map()
    assert k.kind_of("college_university", "Khulna University") == ("college", True)
    assert k.kind_of("place_of_learning", "Govt. Brajalal College") == ("college", True)
    assert k.kind_of("hospital", "Khulna Medical College Hospital") == ("hospital", True)   # a specific category stays
    assert k.kind_of("specialty_school", "Khulna Medical College & Hospital") == ("hospital", True)   # …but a hospital wins
    assert k.kind_of("specialty_school", "Khulna Medical College") == ("school", True)
    assert k.kind_of("college_university", "Khulna University Market") == ("college", True)   # specific, not beaten by "market"
    assert k.kind_of("shopping", "New Market") == ("market", True)
    assert k.kind_of("shopping", None, "বড় বাজার") == ("market", True)
    assert k.kind_of("shopping", "Rahim Store, Cox's Bazar") == ("shop", True)                # the town's name isn't a bazar
    assert k.kind_of("travel_and_transportation", "Rupsha Launch Ghat") == ("ferry_terminal", True)
    assert k.kind_of("muslim_place_of_worship", "Baitul Mukarram") == ("mosque", True)
    assert k.kind_of("restaurant", "Kacchi Bhai") == (None, True)
    assert k.kind_of("weird_new_category", "Something") == ("other", False)
    # the words a search reads (step 6)
    assert "college" in k.words["college"]["en"] and "কলেজ" in k.words["college"]["bn"]
    assert "বাজার" in k.words["market"]["bn"] and "bazar" in k.words["market"]["en"]


def test_load_kinds_districts_names_and_no_duplicates(session, layers, tmp_path):
    _setup(session, layers)
    report = pipeline.run(OverturePois(), session, params={"parquet": _parquet(tmp_path, ROWS), "release": "test"})
    assert report["status"] == "succeeded", report
    got = _index(session)
    assert set(got) == {"BM College", "Moon Base", "বোরহানউদ্দিন বাজার", "Sadar Hospital"}
    college = got["BM College"]
    assert (college.kind, college.category, _district(session, college)) == ("college", "place_of_learning", "Barisal")
    assert college.confidence == 0.9 and college.source == "overture" and college.name_key == match_key("BM College", drop_generic=False) == "bm calaga"
    market = got["বোরহানউদ্দিন বাজার"]
    assert (market.kind, market.name_bn, _district(session, market)) == ("market", "বোরহানউদ্দিন বাজার", "Bhola")
    assert market.name_key  # Bangla folded to Latin
    hospital = got["Sadar Hospital"]
    assert (hospital.kind, hospital.name_bn, _district(session, hospital)) == ("hospital", "সদর হাসপাতাল", "Chittagong")
    assert got["Moon Base"].kind == "other"
    assert report["unmapped_categories"] == {"space_station": 1}
    assert (report["skipped_duplicate"], report["skipped_lodging_food"], report["skipped_low_confidence"],
            report["skipped_outside_bangladesh"], report["skipped_closed"]) == (1, 1, 1, 1, 1)
    assert report["loaded"] == 4 and report["kind_college"] == 1
    # the raw download is kept, with its manifest
    assert report["artifacts_new"] == 1 and (paths.MANIFEST_DIR / "overture_pois.jsonl").exists()


def test_a_rerun_replaces_the_rows(session, layers, tmp_path):
    _setup(session, layers)
    pipeline.run(OverturePois(), session, params={"rows": ROWS})
    assert session.scalar(select(func.count()).select_from(PoiIndex)) == 4
    # the next release: the college closed, a new bank opened
    later = [r for r in ROWS if r["id"] != "o1"] + [_row(10, "Sonali Bank", "bank_or_credit_union")]
    report = pipeline.run(OverturePois(), session, params={"rows": later})
    assert report["status"] == "succeeded"
    got = _index(session)
    assert "BM College" in got and got["BM College"].confidence == 0.6   # its second listing remains
    assert got["Sonali Bank"].kind == "bank"
    assert session.scalar(select(func.count()).select_from(PoiIndex)) == 5


def test_a_failed_run_leaves_the_old_rows(session, layers, monkeypatch):
    _setup(session, layers)
    pipeline.run(OverturePois(), session, params={"rows": ROWS})
    before = set(_index(session))

    def broken(*_a, **_k):
        raise RuntimeError("disk full")

    monkeypatch.setattr(overture_pois, "insert", broken)
    report = pipeline.run(OverturePois(), session, params={"rows": [_row(11, "New Place", "park")]})
    assert report["status"] == "failed" and "disk full" in report["error"]
    assert set(_index(session)) == before
    assert session.scalar(select(IngestionJob.status).where(IngestionJob.id == uuid.UUID(report["job_id"]))) == "failed"


@pytest.mark.parametrize("name,expected", [("Govt. Hazi Muhammad Muhsin College", "college"), ("Khulna Zilla School", "school")])
def test_names_refine_generic_kinds(name, expected):
    assert kind_map().kind_of("place_of_learning", name)[0] == expected

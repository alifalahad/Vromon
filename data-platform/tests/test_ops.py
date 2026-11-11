"""Phase 10: scheduled runs, stale data, weekly report, backup."""

from __future__ import annotations

from datetime import datetime, timedelta

from sqlalchemy import select

from app.models.catalog import DataSource, FareProduct, IngestionJob
from vromon_data import ops


def test_due_follows_the_schedule(session):
    session.add(DataSource(source_id="geoboundaries_bgd", source_name="g", organization="g", source_type="x",
                           access_method="api", terms_review_status="open_license", reliability_class="reputable_secondary",
                           recommended_use="production"))
    session.add(IngestionJob(connector="geoboundaries_bgd", connector_version="2", source_id="geoboundaries_bgd",
                             status="succeeded", params={}, counts={}, finished_at=datetime.utcnow() - timedelta(days=1)))
    session.commit()
    names = [c["name"] for c in ops.due(session)]
    assert "geoboundaries_bgd" not in names and "bd_railway_timetable" in names
    later = [c["name"] for c in ops.due(session, now=datetime.utcnow() + timedelta(days=100))]
    assert "geoboundaries_bgd" in later


def test_old_fares_stop_being_served_as_current(session):
    old = FareProduct(mode="train", origin_name="a", destination_name="b", fare_class="x", amount=10, fare_type="official_operator",
                      source_id="bd_railway", last_checked_at=datetime.utcnow() - timedelta(days=200), status="published")
    fresh = FareProduct(mode="train", origin_name="a", destination_name="b", fare_class="y", amount=10, fare_type="official_operator",
                        source_id="bd_railway", last_checked_at=datetime.utcnow(), status="published")
    session.add_all([old, fresh])
    session.commit()
    assert ops.mark_stale(session) == {"fares": 1}
    assert {f.fare_class: f.status for f in session.scalars(select(FareProduct))} == {"x": "stale", "y": "published"}


def test_weekly_report_and_backup(session, tmp_path, monkeypatch):
    data = ops.weekly_report(session)
    assert "open_reviews" in data and data["districts_without_published_attractions"] == 0
    db_file = tmp_path / "test.db"
    monkeypatch.setattr(ops.dbmod, "database_url", lambda: f"sqlite:///{db_file.as_posix()}")
    out = ops.backup(tmp_path / "bk")
    assert (out / "vromon.db").stat().st_size > 0 and (out / "sources.yaml").exists()

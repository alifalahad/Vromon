"""Phase 1: the job runner's guarantees (guideline §12.2), checked on admin geography."""

from __future__ import annotations

import copy

from sqlalchemy import func, select

from app.models.catalog import (
    AdminAdjacency, AdminBoundary, AdminUnit, EntityExternalId, IngestionJob, ReviewTask, SourceArtifact, SourceClaim,
)
from tests.conftest import ADM3, write_layers
from vromon_data import paths, pipeline
from vromon_data.connectors.admin_names import CuratedAdminNames
from vromon_data.connectors.geoboundaries import GeoBoundariesBGD
from vromon_data.rollback import rollback_job


def _run(session, layers, dry=False):
    return pipeline.run(GeoBoundariesBGD(), session, dry_run=dry, params={"files": layers})


def _count(session, model):
    return session.scalar(select(func.count()).select_from(model))


def test_dry_run_publishes_nothing(session, layers):
    report = _run(session, layers, dry=True)
    assert report["status"] == "dry_run"
    assert report["entities_created"] == 9
    for model in (AdminUnit, AdminBoundary, SourceClaim, IngestionJob, SourceArtifact):
        assert _count(session, model) == 0


def test_import_builds_the_hierarchy(session, layers):
    report = _run(session, layers)
    assert report["status"] == "succeeded", report
    units = {u.slug: u for u in session.scalars(select(AdminUnit))}
    assert sorted(u.level for u in units.values()).count("district") == 3
    # Slugs use official spellings and stay unique for the two Kotwalis
    assert "bd-district-barishal" in units and "bd-division-chattogram" in units
    assert "bd-barishal-kotwali" in units and "bd-chattogram-kotwali" in units
    by_id = {u.id: u for u in units.values()}
    assert by_id[units["bd-barishal-kotwali"].parent_id].slug == "bd-district-barishal"
    assert by_id[units["bd-district-bhola"].parent_id].slug == "bd-division-barishal"
    assert all(u.status == "published" for u in units.values())
    assert units["bd-district-bhola"].area_km2 > 0
    assert units["bd-district-bhola"].field_status["area_km2"]["status"] == "imported"
    assert units["bd-district-bhola"].field_status["name_bn"]["status"] == "unknown"
    # ISO codes link the app's regions
    assert session.scalar(select(EntityExternalId.entity_id).where(EntityExternalId.provider == "iso3166-2",
                                                                   EntityExternalId.external_id == "BD-A"))
    assert _count(session, AdminBoundary) == 9
    # Neighbours from shared borders, both ways; divisions and districts
    pairs = {(by_id[a.unit_id].slug, by_id[a.neighbor_id].slug) for a in session.scalars(select(AdminAdjacency))}
    assert ("bd-district-barishal", "bd-district-bhola") in pairs and ("bd-district-bhola", "bd-district-barishal") in pairs
    assert ("bd-division-barishal", "bd-division-chattogram") in pairs
    assert ("bd-district-barishal", "bd-district-chattogram") not in pairs
    # Raw snapshots are recorded and their manifests written
    assert (paths.MANIFEST_DIR / "geoboundaries_bgd.jsonl").exists()


def test_rerun_changes_nothing(session, layers):
    _run(session, layers)
    claims_before = _count(session, SourceClaim)
    report = _run(session, layers)
    assert report.get("entities_created", 0) == 0
    assert report.get("claims_new", 0) == 0
    assert report["records_unchanged"] == 9
    assert _count(session, AdminUnit) == 9
    assert _count(session, SourceClaim) == claims_before
    assert _count(session, AdminBoundary) == 9


def test_change_is_detected_and_rollback_restores(session, tmp_path, layers):
    _run(session, layers)
    changed = copy.deepcopy(ADM3)
    changed[1]["properties"]["shapeName"] = "Bakerganj Upazila"
    report = _run(session, write_layers(tmp_path / "v2", changed))
    assert report["records_changed"] == 1
    unit = session.scalar(select(AdminUnit).where(AdminUnit.slug == "bd-barishal-bakerganj"))
    assert unit.name_en == "Bakerganj Upazila"
    assert session.scalar(select(func.count()).select_from(SourceClaim).where(
        SourceClaim.entity_id == unit.id, SourceClaim.field_name == "name_en", SourceClaim.status == "superseded")) == 1
    rollback_job(session, __import__("uuid").UUID(report["job_id"]), reason="test")
    session.refresh(unit)
    assert unit.name_en == "Bakerganj"
    assert unit.status == "published"


def test_removed_source_record_goes_to_review_not_deleted(session, tmp_path, layers):
    _run(session, layers)
    report = _run(session, write_layers(tmp_path / "v2", ADM3[:3]))
    assert report["records_removed"] == 1
    assert _count(session, AdminUnit) == 9
    task = session.scalar(select(ReviewTask).where(ReviewTask.task_type == "source_record_removed"))
    assert task is not None and task.entity_id is not None


def test_failed_run_keeps_curated_data(session, layers, monkeypatch):
    _run(session, layers)

    def boom(self, ctx, records):
        raise RuntimeError("network down")
    monkeypatch.setattr(GeoBoundariesBGD, "after", boom)
    report = _run(session, layers)
    assert report["status"] == "failed"
    assert _count(session, AdminUnit) == 9
    assert session.scalar(select(IngestionJob.status).where(IngestionJob.status == "failed")) == "failed"


def test_curated_names_win_and_keep_aliases(session, layers):
    _run(session, layers)
    report = pipeline.run(CuratedAdminNames(), session)
    assert report["status"] == "succeeded"
    barishal = session.scalar(select(AdminUnit).where(AdminUnit.slug == "bd-district-barishal"))
    assert barishal.name_en == "Barishal"            # official spelling over geoBoundaries' "Barisal"
    assert barishal.name_bn == "বরিশাল"
    assert barishal.field_status["name_en"]["source_id"] == "vromon_curated"
    # Units missing from the fixture are rejected, not created
    assert report["rejected"] == 72 - 5
    assert _count(session, AdminUnit) == 9


def test_division_outline_is_the_union_of_its_districts(session, tmp_path):
    import json
    from tests.conftest import ADM1, ADM2, square
    # A division outline from another source that spills into its neighbour
    adm1 = copy.deepcopy(ADM1)
    adm1[0]["geometry"] = square(90.0, 22.0, 90.6, 22.5)
    folder = write_layers(tmp_path / "skewed")
    with open(folder["ADM1"], "w", encoding="utf-8") as f:
        json.dump({"type": "FeatureCollection", "features": adm1}, f)
    report = pipeline.run(GeoBoundariesBGD(), session, params={"files": folder})
    assert report["divisions_dissolved_from_districts"] == 2
    units = {u.slug: u for u in session.scalars(select(AdminUnit))}
    # Chattogram district keeps its division (largest overlap), and nothing waits for review
    assert units["bd-district-chattogram"].parent_id == units["bd-division-chattogram"].id
    assert all(u.status == "published" for u in units.values())
    div = units["bd-division-barishal"].area_km2
    parts = units["bd-district-barishal"].area_km2 + units["bd-district-bhola"].area_km2
    assert abs(div - parts) < 0.01 * parts

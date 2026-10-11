"""
Phase 11 regression tests: per-person budget in ranking, and data provenance
(no descriptive facts hard-coded outside data/seed).
"""

from __future__ import annotations

import json
from pathlib import Path

from app.services.recommendation.recommendation_service import RecommendationService, per_person_daily_budget

ROOT = Path(__file__).resolve().parents[2]
SEED = ROOT / "data" / "seed" / "coxsbazar.json"


def test_per_person_daily_budget():
    assert per_person_daily_budget(20000, 2, 4) == 2500
    assert per_person_daily_budget(20000, 0, 0) == 20000   # guards against zero division


def test_budget_reason_uses_per_person_share():
    """A ৳1,500/person place is 'comfortable' for one person's ৳10,000/day, not for a share of ৳2,500."""
    class P:  # minimal place stub
        tags, category, rating, estimated_cost = ["Beach"], "Beach", 4.0, 1500.0
        activity_level, review_count, crowd_level = "Medium", 100, "Low"

    svc = RecommendationService()
    _, solo = svc.score_place(P, ["Beach"], "Balanced", "Medium", per_person_daily_budget(20000, 2, 1))
    _, group = svc.score_place(P, ["Beach"], "Balanced", "Medium", per_person_daily_budget(20000, 2, 4))
    assert "Fits comfortably in your budget" in solo
    assert "Fits comfortably in your budget" not in group


def test_no_descriptive_facts_hard_coded_in_app():
    app_dir = ROOT / "backend" / "app"
    hits = [p for p in app_dir.rglob("*.py") if "longest natural sea beach" in p.read_text(encoding="utf-8")]
    assert hits == []


def test_destination_overview_chunk_comes_from_seed_data():
    from app.services.rag.chunker import chunk_seed_data

    data = json.loads(SEED.read_text(encoding="utf-8"))
    overview = next(c for c in chunk_seed_data(data) if c.source_type == "destination")
    assert data["destination_info"]["description"] in overview.text
    assert "Popular activities include" not in overview.text   # previously invented sentence
    assert data["source"].startswith("Sample data")

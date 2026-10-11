"""
Vromon — Phase 11 recommendation-ranking evaluation.

Compares the weighted, explainable ranker against non-personalised baselines and
against ablations of its own weights, on fixed traveller profiles, using a fresh
in-memory database seeded from data/seed (backend/vromon.db is never touched).

    cd backend
    venv/bin/python ../evaluation/recommendation_eval.py

IMPORTANT: there are no human relevance judgments or real user ratings. Relevance is a
PROXY: the number of the profile's interests that appear in a place's tags or category,
the same metadata the ranker reads. The evaluation therefore shows whether
personalisation and the hard rules work as designed, and how much each weight
contributes. It is NOT evidence of user satisfaction.

Metrics (k = 5 and 10; mean over profiles):
  P@k           share of top-k places matching at least one interest
  nDCG@k        graded proxy relevance (number of matched interests)
  afford@k      share of top-k costing ≤ 20% of the per-person daily budget
  crowd@k       share of top-k with crowd level "High" (lower is better when avoiding crowds)
  diversity@k   distinct categories in top-k divided by k
  excluded      excluded places appearing anywhere in the ranking (must be 0)
  deterministic two runs produce the identical ranking
"""

from __future__ import annotations

import json
import logging
import math
import random
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
logging.disable(logging.WARNING)

from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

from app.db.base import Base  # noqa: E402
from app.db.seeder import seed_database  # noqa: E402
from app.models.models import Place  # noqa: E402
from app.services.recommendation.recommendation_service import (  # noqa: E402
    RECOMMENDATION_WEIGHTS,
    RecommendationService,
    per_person_daily_budget,
)

DESTINATION = "Cox's Bazar"
KS = (5, 10)
RANDOM_SEEDS = 30

PROFILES = [
    {"id": "beach_relax", "interests": ["Beach", "Relaxation"], "style": "Relaxed", "level": "Low", "budget": 15000, "days": 2, "people": 2},
    {"id": "nature_adventure", "interests": ["Nature", "Adventure", "Wildlife"], "style": "Packed", "level": "High", "budget": 30000, "days": 3, "people": 2},
    {"id": "culture_history", "interests": ["Culture", "History"], "style": "Balanced", "level": "Medium", "budget": 25000, "days": 2, "people": 1},
    {"id": "food_shopping", "interests": ["Food", "Shopping"], "style": "Balanced", "level": "Low", "budget": 20000, "days": 2, "people": 3},
    {"id": "photo_scenic", "interests": ["Photography", "Scenic", "Sunset"], "style": "Balanced", "level": "Medium", "budget": 30000, "days": 3, "people": 2},
    {"id": "family_low_budget", "interests": ["Family", "Beach"], "style": "Relaxed", "level": "Low", "budget": 8000, "days": 2, "people": 4},
    {"id": "avoid_crowds_nature", "interests": ["Nature", "Beach"], "style": "Balanced", "level": "Medium", "budget": 25000, "days": 2, "people": 2, "avoid_crowded": True},
    {"id": "excluding_favourites", "interests": ["Beach"], "style": "Balanced", "level": "Medium", "budget": 25000, "days": 2, "people": 2,
     "exclude": ["Laboni Beach", "Kolatoli Beach", "Inani Beach"]},
]


def relevance(place: Place, interests: list[str]) -> int:
    tags = {t.lower() for t in place.tags} | {place.category.lower()}
    return sum(1 for i in interests if i.lower() in tags)


def ndcg(rels: list[int], ideal: list[int], k: int) -> float:
    dcg = sum((2 ** r - 1) / math.log2(i + 2) for i, r in enumerate(rels[:k]))
    idcg = sum((2 ** r - 1) / math.log2(i + 2) for i, r in enumerate(sorted(ideal, reverse=True)[:k]))
    return dcg / idcg if idcg else 0.0


def metrics(ranking: list[Place], prof: dict, all_places: list[Place], excluded_ids: set[int]) -> dict:
    budget_pp = per_person_daily_budget(prof["budget"], prof["days"], prof["people"])
    rels = [relevance(p, prof["interests"]) for p in ranking]
    ideal = [relevance(p, prof["interests"]) for p in all_places if p.id not in excluded_ids]
    out = {}
    for k in KS:
        top = ranking[:k]
        out[f"P@{k}"] = sum(r > 0 for r in rels[:k]) / k
        out[f"nDCG@{k}"] = ndcg(rels, ideal, k)
        out[f"afford@{k}"] = sum(p.estimated_cost <= 0.2 * budget_pp for p in top) / k
        out[f"crowd@{k}"] = sum(p.crowd_level == "High" for p in top) / k
        out[f"diversity@{k}"] = len({p.category for p in top}) / k
    out["excluded"] = sum(p.id in excluded_ids for p in ranking)
    return out


def main() -> int:
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    db = sessionmaker(bind=engine)()
    seed_database(db)
    places = db.query(Place).filter(Place.destination_name == DESTINATION, Place.is_active == True).all()  # noqa: E712
    by_name = {p.name: p for p in places}

    def vromon(weights=None):
        svc = RecommendationService(weights)

        def rank(prof, excluded):
            res = svc.recommend(
                db=db, destination=DESTINATION, interests=prof["interests"], travel_style=prof["style"],
                activity_level=prof["level"],
                daily_budget=per_person_daily_budget(prof["budget"], prof["days"], prof["people"]),
                avoid_crowded=prof.get("avoid_crowded", False), exclude_ids=list(excluded), limit=50,
            )
            return [p for p, _, _ in res]
        return rank

    def without(*keys):
        w = dict(RECOMMENDATION_WEIGHTS)
        for k in keys:
            w[k] = 0.0
        return vromon(w)

    def rating_only(prof, excluded):
        return sorted((p for p in places if p.id not in excluded), key=lambda p: (-p.rating, p.id))

    def popularity_only(prof, excluded):
        return sorted((p for p in places if p.id not in excluded), key=lambda p: (-p.review_count, p.id))

    rankers = {
        "vromon_weighted": vromon(),
        "ablation_no_interest": without("interest_match"),
        "ablation_no_budget": without("budget_match"),
        "ablation_no_style_activity": without("travel_style", "activity_level"),
        "baseline_rating_only": rating_only,
        "baseline_popularity_only": popularity_only,
    }

    rows, determinism = [], {}
    for prof in PROFILES:
        excluded = {by_name[n].id for n in prof.get("exclude", [])}
        for name, rank in rankers.items():
            a, b = rank(prof, excluded), rank(prof, excluded)
            determinism[name] = determinism.get(name, True) and [p.id for p in a] == [p.id for p in b]
            rows.append({"profile": prof["id"], "ranker": name, **metrics(a, prof, places, excluded)})
        # random baseline: mean over fixed seeds
        acc: dict[str, float] = {}
        for seed in range(RANDOM_SEEDS):
            cand = [p for p in places if p.id not in excluded]
            random.Random(seed).shuffle(cand)
            for k, v in metrics(cand, prof, places, excluded).items():
                acc[k] = acc.get(k, 0.0) + v / RANDOM_SEEDS
        rows.append({"profile": prof["id"], "ranker": "baseline_random", **acc})

    names = list(rankers) + ["baseline_random"]
    keys = [k for k in rows[0] if k not in ("profile", "ranker")]
    summary = {
        n: {k: round(sum(r[k] for r in rows if r["ranker"] == n) / len(PROFILES), 3) for k in keys}
        for n in names
    }
    crowd_profile = {
        r["ranker"]: round(r["crowd@5"], 3) for r in rows if r["profile"] == "avoid_crowds_nature"
    }

    report = {
        "run_at": datetime.now(timezone.utc).isoformat(),
        "weights": RECOMMENDATION_WEIGHTS,
        "profiles": PROFILES,
        "relevance": "proxy: number of profile interests found in place tags/category (same metadata the ranker uses)",
        "summary_mean_over_profiles": summary,
        "avoid_crowds_profile_crowd@5": crowd_profile,
        "deterministic": determinism,
        "rows": rows,
    }
    out_dir = ROOT / "evaluation" / "results"
    out_dir.mkdir(exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    (out_dir / f"recommendation_eval_{stamp}.json").write_text(json.dumps(report, indent=2), encoding="utf-8")

    cols = ["P@5", "P@10", "nDCG@10", "afford@10", "diversity@10", "excluded"]
    md = ["# Recommendation ranking evaluation", "",
          f"Run {report['run_at']} · {len(PROFILES)} profiles · {len(places)} places · random baseline = mean of {RANDOM_SEEDS} seeds", "",
          "> Relevance is a proxy (interest/tag overlap), not human judgment. See the script docstring.", "",
          "| Ranker | " + " | ".join(cols) + " | Deterministic |", "|" + "---|" * (len(cols) + 2)]
    for n in names:
        md.append(f"| {n} | " + " | ".join(str(summary[n][c]) for c in cols) + f" | {determinism.get(n, 'n/a (seeded mean)')} |")
    md += ["", "Crowd share in top-5 for the `avoid_crowds_nature` profile (lower is better):", "",
           "| Ranker | crowd@5 |", "|---|---|"] + [f"| {k} | {v} |" for k, v in crowd_profile.items()]
    (out_dir / f"recommendation_eval_{stamp}.md").write_text("\n".join(md) + "\n", encoding="utf-8")
    print("\n".join(md))
    print(f"\nReports written to evaluation/results/recommendation_eval_{stamp}.(json|md)")
    return 0


if __name__ == "__main__":
    sys.exit(main())

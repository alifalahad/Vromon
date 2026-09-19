"""
RecommendationService — Weighted scoring engine (Version 1).

Scoring formula:
    score = interest_match   (35%)
          + rating_score     (20%)
          + budget_match     (15%)
          + travel_style     (10%)
          + activity_level   (10%)
          + popularity       (5%)
          - crowd_penalty    (5%)

Weights are configurable from RECOMMENDATION_WEIGHTS.
This service is designed to be replaced with a RAG-powered
semantic recommender in future iterations.
"""

from __future__ import annotations
from typing import List, Tuple
from sqlalchemy.orm import Session

from app.models.models import Place

# ---------------------------------------------------------------------------
# Configurable weights (all should sum to 1.0)
# ---------------------------------------------------------------------------
RECOMMENDATION_WEIGHTS = {
    "interest_match": 0.35,
    "rating": 0.20,
    "budget_match": 0.15,
    "travel_style": 0.10,
    "activity_level": 0.10,
    "popularity": 0.05,
    "crowd_penalty": -0.05,
}

# Travel-style → preferred number of activities mapping
TRAVEL_STYLE_ACTIVITY_DENSITY = {
    "Relaxed": 3,
    "Balanced": 4,
    "Packed": 6,
}

# Activity-level → preferred place activity level
ACTIVITY_LEVEL_MAP = {
    "Low": ["Low"],
    "Medium": ["Low", "Medium"],
    "High": ["Low", "Medium", "High"],
}


class RecommendationService:
    """
    Scores places based on user preferences and returns ranked candidates.

    Future enhancement: replace `score_place` with a RAG context-augmented
    semantic similarity calculation.
    """

    def __init__(self, weights: dict = None):
        self.weights = weights or RECOMMENDATION_WEIGHTS

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def recommend(
        self,
        db: Session,
        destination: str,
        interests: List[str],
        travel_style: str,
        activity_level: str,
        daily_budget: float,
        avoid_crowded: bool = False,
        exclude_ids: List[int] = None,
        must_visit_ids: List[int] = None,
        limit: int = 20,
    ) -> List[Tuple[Place, float, List[str]]]:
        """
        Returns a sorted list of (Place, score, reasons) tuples.
        Must-visit places are included first regardless of score.
        """
        exclude_ids = set(exclude_ids or [])
        must_visit_ids = list(must_visit_ids or [])

        # Fetch all active places for destination
        all_places: List[Place] = (
            db.query(Place)
            .filter(Place.destination == destination, Place.is_active == True)
            .all()
        )

        # Separate must-visit from candidate pool
        must_visit_places = [p for p in all_places if p.id in must_visit_ids]
        candidate_places = [
            p for p in all_places
            if p.id not in exclude_ids and p.id not in must_visit_ids
        ]

        # Score candidates
        scored: List[Tuple[Place, float, List[str]]] = []
        for place in candidate_places:
            score, reasons = self.score_place(
                place=place,
                interests=interests,
                travel_style=travel_style,
                activity_level=activity_level,
                daily_budget=daily_budget,
                avoid_crowded=avoid_crowded,
            )
            scored.append((place, score, reasons))

        # Sort descending by score
        scored.sort(key=lambda x: x[1], reverse=True)

        # Score must-visit places too (for display), but give them max score
        must_visit_scored = []
        for place in must_visit_places:
            _, reasons = self.score_place(
                place=place,
                interests=interests,
                travel_style=travel_style,
                activity_level=activity_level,
                daily_budget=daily_budget,
                avoid_crowded=avoid_crowded,
            )
            reasons.insert(0, "Must-visit place selected by you")
            must_visit_scored.append((place, 1.0, reasons))

        # Must-visit first, then top candidates
        result = must_visit_scored + scored[:limit]
        return result

    # ------------------------------------------------------------------
    # Scoring logic
    # ------------------------------------------------------------------

    def score_place(
        self,
        place: Place,
        interests: List[str],
        travel_style: str,
        activity_level: str,
        daily_budget: float,
        avoid_crowded: bool = False,
    ) -> Tuple[float, List[str]]:
        """
        Returns (normalised_score [0–1], reasons list).
        """
        score = 0.0
        reasons: List[str] = []
        w = self.weights

        # ── Interest match ─────────────────────────────────────────────
        place_tags = [t.lower() for t in place.tags]
        place_category = place.category.lower()
        user_interests_lower = [i.lower() for i in interests]

        matching_interests = [
            i for i in user_interests_lower
            if i in place_tags or i == place_category
        ]
        if interests:
            interest_ratio = len(matching_interests) / len(interests)
        else:
            interest_ratio = 0.5
        interest_score = w["interest_match"] * interest_ratio
        score += interest_score
        if matching_interests:
            reasons.append(f"Matches your interest in {', '.join(matching_interests[:2])}")

        # ── Rating ─────────────────────────────────────────────────────
        rating_norm = (place.rating - 1.0) / 4.0   # normalise 1–5 → 0–1
        rating_score = w["rating"] * rating_norm
        score += rating_score
        if place.rating >= 4.5:
            reasons.append(f"Excellent rating ({place.rating}★)")
        elif place.rating >= 4.0:
            reasons.append(f"Good rating ({place.rating}★)")

        # ── Budget match ───────────────────────────────────────────────
        if daily_budget > 0:
            cost_ratio = min(place.estimated_cost / daily_budget, 1.0) if daily_budget else 0.5
            # Places that cost < 20% of daily budget are ideal
            if cost_ratio <= 0.2:
                budget_score = w["budget_match"] * 1.0
                reasons.append("Fits comfortably in your budget")
            elif cost_ratio <= 0.5:
                budget_score = w["budget_match"] * 0.7
                reasons.append("Reasonably priced")
            else:
                budget_score = w["budget_match"] * 0.3
        else:
            budget_score = w["budget_match"] * 0.5
        score += budget_score

        # ── Travel style ───────────────────────────────────────────────
        style_density = TRAVEL_STYLE_ACTIVITY_DENSITY.get(travel_style, 4)
        if travel_style == "Relaxed" and place.activity_level == "Low":
            ts_score = w["travel_style"] * 1.0
            reasons.append("Ideal for a relaxed trip")
        elif travel_style == "Packed" and place.activity_level == "High":
            ts_score = w["travel_style"] * 1.0
            reasons.append("Good for a packed itinerary")
        elif travel_style == "Balanced":
            ts_score = w["travel_style"] * 0.8
        else:
            ts_score = w["travel_style"] * 0.4
        score += ts_score

        # ── Activity level ─────────────────────────────────────────────
        preferred_levels = ACTIVITY_LEVEL_MAP.get(activity_level, ["Low", "Medium"])
        if place.activity_level in preferred_levels:
            al_score = w["activity_level"] * 1.0
            reasons.append(f"Matches your {activity_level.lower()} activity preference")
        else:
            al_score = w["activity_level"] * 0.2
        score += al_score

        # ── Popularity ─────────────────────────────────────────────────
        pop_norm = min(place.review_count / 3500, 1.0)
        pop_score = w["popularity"] * pop_norm
        score += pop_score

        # ── Crowd penalty ──────────────────────────────────────────────
        if avoid_crowded and place.crowd_level == "High":
            crowd_penalty = abs(w["crowd_penalty"])
            score -= crowd_penalty
            reasons.append("⚠ Usually crowded (penalised)")
        elif place.crowd_level == "Low":
            reasons.append("Relatively uncrowded")

        # Clamp to [0, 1]
        score = max(0.0, min(1.0, score))

        return score, reasons

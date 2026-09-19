"""
OptimizationService — Placeholder for future constraint optimization.

Current implementation: simple heuristic (identity pass-through).

Future: Replace optimize_itinerary() internals with OR-Tools CP-SAT,
MILP, or any constraint solver without changing the API contract.
"""

from __future__ import annotations
from typing import List, Any


class OptimizationService:
    """
    Optimization interface.

    Accepts a ranked list of candidate places + preferences/constraints
    and returns an ordered schedule.

    Currently delegates to a simple heuristic (the ItineraryService greedy
    algorithm). This class exists as an architectural placeholder.
    """

    def optimize_itinerary(
        self,
        candidates: List[Any],
        preferences: dict,
        constraints: dict,
    ) -> List[Any]:
        """
        Returns a reordered/filtered list of candidates.

        Args:
            candidates: List of (Place, score, reasons) tuples.
            preferences: Dict of user preferences.
            constraints: Dict of hard constraints.

        Returns:
            Ordered list of (Place, score, reasons) — currently just
            the input sorted by score (heuristic v1).

        NOTE: This will be replaced with a proper constraint solver
        (OR-Tools CP-SAT) in future iterations.
        """
        # Heuristic: sort by score descending (already done by RecommendationService)
        return sorted(candidates, key=lambda x: x[1], reverse=True)

    def get_algorithm_info(self) -> dict:
        return {
            "name": "heuristic_v1",
            "description": "Simple greedy scheduling — no constraint solver yet.",
            "future": "Will be replaced with OR-Tools CP-SAT or MILP.",
        }

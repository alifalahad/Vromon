"""
Vromon — CP-SAT itinerary optimizer (Phase 9).

Formal alternative to the greedy baseline in itinerary_service.py. Both use the
same ranked candidates, day themes, meal restaurants and hotel, so their output
can be compared on equal terms; both are checked by the independent
ConstraintValidator afterwards.

Model (per trip, time unit = minutes since midnight)
----------------------------------------------------
Decision variables
  x[p,d]        place p is visited on day d                         (bool)
  start[p,d]    visit start time                                    (int)
  arc[i,j,d]    j is visited directly after i on day d (0 = hotel)   (bool)
  lunch_d / dinner_d start times, when they fall inside the day window

Hard constraints
  - visit fits inside the place's opening hours: open ≤ start, start + dur ≤ close
  - visit fits inside the day window: (day_start + breakfast) ≤ start, end ≤ day_end
  - each place at most once per trip; excluded places never; must-visit exactly once
  - at most max_activities_per_day visits per day
  - travel: start_j ≥ end_i + travel(i, j) for consecutive visits (AddCircuit route)
  - visits do not overlap each other or lunch/dinner (NoOverlap)
  - activity + meal cost ≤ max_daily_budget, when a cap is set

Objective (maximise)
  Σ round(1000 · (ranking score + day-theme bonus)) · x[p,d]
  − TRAVEL_PENALTY_PER_MINUTE · Σ travel minutes on chosen arcs

Assumptions (shared with the baseline)
  - travel time = straight-line (haversine) distance at 30 km/h, rounded up;
    it is an estimate, not a road route
  - travel to/from restaurants is not modelled; return to the hotel is not counted
  - breakfast is fixed at the day start; lunch starts 12:00–14:00; dinner from 19:00
"""

from __future__ import annotations

import logging
import math
import time
from dataclasses import dataclass, field
from datetime import timedelta
from typing import TYPE_CHECKING, Optional

from ortools.sat.python import cp_model

if TYPE_CHECKING:
    from sqlalchemy.orm import Session
    from app.models.models import Itinerary, Trip

logger = logging.getLogger("vromon.optimizer")

SCORE_SCALE = 1000
TRAVEL_PENALTY_PER_MINUTE = 2      # 30 min of travel costs 0.06 ranking score
THEME_BONUS = 0.15                 # same bonus the baseline gives to day-theme matches
MEAL_MINUTES = 60
LUNCH_EARLIEST, LUNCH_LATEST = 12 * 60, 14 * 60
DINNER_EARLIEST = 19 * 60

SUCCESS_STATUSES = ("OPTIMAL", "FEASIBLE")


# ---------------------------------------------------------------------------
# Problem / result types (pure data — no database)
# ---------------------------------------------------------------------------

@dataclass
class Candidate:
    place_id: int
    name: str
    score: float
    open_min: int
    close_min: int
    duration_min: int
    cost: float
    lat: float
    lon: float
    tags: list[str] = field(default_factory=list)
    reasons: list[str] = field(default_factory=list)


@dataclass
class SchedulingProblem:
    candidates: list[Candidate]
    num_days: int
    day_start_min: int
    day_end_min: int
    max_activities_per_day: int
    must_visit_ids: list[int] = field(default_factory=list)
    excluded_ids: list[int] = field(default_factory=list)
    daily_budget_cap: float = 0.0                      # 0 = no cap
    meal_cost_per_day: list[float] = field(default_factory=list)
    theme_interests_per_day: list[list[str]] = field(default_factory=list)
    hotel_latlon: Optional[tuple[float, float]] = None


@dataclass
class ScheduledVisit:
    place_id: int
    day_number: int
    start_min: int
    end_min: int
    score: float                 # ranking score incl. day-theme bonus (what the objective uses)
    travel_from_prev_min: int
    distance_from_prev_km: float
    ranking_score: float = 0.0   # ranking score alone, as explained by the reasons (stored/displayed)


@dataclass
class SolverResult:
    status: str                  # OPTIMAL | FEASIBLE | INFEASIBLE | UNKNOWN | MODEL_INVALID
    visits: list[ScheduledVisit] = field(default_factory=list)
    lunch_start: dict[int, int] = field(default_factory=dict)   # day_number → minute
    dinner_start: dict[int, int] = field(default_factory=dict)
    objective: Optional[float] = None
    best_bound: Optional[float] = None
    wall_time_s: float = 0.0
    time_limit_s: float = 0.0
    deterministic_limit: float = 0.0
    reproducible: bool = True
    diagnostics: list[str] = field(default_factory=list)

    @property
    def succeeded(self) -> bool:
        return self.status in SUCCESS_STATUSES

    @property
    def gap(self) -> Optional[float]:
        """Relative gap between the solution and the proven bound (0 when OPTIMAL)."""
        if self.objective is None or self.best_bound is None:
            return None
        return round(abs(self.best_bound - self.objective) / max(abs(self.best_bound), 1e-9), 4)

    def meta(self) -> dict:
        return {
            "status": self.status,
            "objective": self.objective,
            "best_bound": self.best_bound,
            "optimality_gap": self.gap,
            "wall_time_s": round(self.wall_time_s, 3),
            "time_limit_s": self.time_limit_s,
            "deterministic_limit": self.deterministic_limit,
            "reproducible": self.reproducible,
            "diagnostics": self.diagnostics,
        }


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = math.radians(lat2 - lat1), math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return r * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _travel(a: tuple[float, float], b: tuple[float, float], speed_kmh: float = 30.0) -> tuple[int, float]:
    """(travel minutes rounded up, distance km) for straight-line travel."""
    km = _haversine_km(a[0], a[1], b[0], b[1])
    return math.ceil(km / speed_kmh * 60), km


def _themed_score(c: Candidate, theme: list[str]) -> float:
    tags = {t.lower() for t in c.tags}
    return c.score + (THEME_BONUS if any(t.lower() in tags for t in theme) else 0.0)


def _day_window(c: Candidate, problem: SchedulingProblem) -> Optional[tuple[int, int]]:
    """Feasible [earliest start, latest start] for a visit, or None."""
    lo = max(problem.day_start_min + MEAL_MINUTES, c.open_min)   # after breakfast
    hi = min(problem.day_end_min, c.close_min) - c.duration_min
    return (lo, hi) if lo <= hi else None


def diagnose(problem: SchedulingProblem) -> list[str]:
    """Cheap pre-checks that explain the most common infeasibility causes."""
    issues = []
    by_id = {c.place_id: c for c in problem.candidates}
    for pid in problem.must_visit_ids:
        c = by_id.get(pid)
        if pid in problem.excluded_ids:
            issues.append(f"Place {pid}{f' ({c.name})' if c else ''} is both must-visit and excluded.")
        elif c is None:
            issues.append(f"Must-visit place {pid} is not an active place at this destination.")
        elif _day_window(c, problem) is None:
            issues.append(
                f"Must-visit '{c.name}' ({c.duration_min} min, open "
                f"{c.open_min // 60:02d}:{c.open_min % 60:02d}-{c.close_min // 60:02d}:{c.close_min % 60:02d}) "
                "does not fit in the daily time window after breakfast."
            )
    capacity = problem.num_days * problem.max_activities_per_day
    if len(set(problem.must_visit_ids)) > capacity:
        issues.append(
            f"{len(set(problem.must_visit_ids))} must-visit places exceed the capacity of "
            f"{problem.num_days} day(s) × {problem.max_activities_per_day} activities."
        )
    if problem.daily_budget_cap > 0:
        for d, meals in enumerate(problem.meal_cost_per_day, start=1):
            if meals > problem.daily_budget_cap:
                issues.append(f"Day {d}: meal costs ({meals:.0f}) alone exceed the daily cap ({problem.daily_budget_cap:.0f}).")
    return issues


# ---------------------------------------------------------------------------
# Solver
# ---------------------------------------------------------------------------

def solve(
    problem: SchedulingProblem,
    deterministic_limit: float = 5.0,
    time_limit_s: float = 15.0,
    workers: int = 8,
    seed: int = 0,
) -> SolverResult:
    """
    Build and solve the CP-SAT model. Pure function: no database access.

    The search stops at `deterministic_limit` (CP-SAT's machine-independent work
    measure), so the same problem gives the same result run after run.
    `time_limit_s` is a wall-clock safety cap; if it is what stops the search,
    the result is flagged as possibly non-reproducible.
    """
    t0 = time.perf_counter()
    diagnostics = diagnose(problem)
    model = cp_model.CpModel()

    excluded = set(problem.excluded_ids)
    must = set(problem.must_visit_ids)
    cands = [c for c in problem.candidates if c.place_id not in excluded]
    hotel = problem.hotel_latlon
    act_start = problem.day_start_min + MEAL_MINUTES

    # Travel matrix (index 0 = hotel/depot)
    points = [hotel] + [(c.lat, c.lon) for c in cands]
    n = len(points)
    travel = [[(0, 0.0)] * n for _ in range(n)]
    for i in range(n):
        for j in range(n):
            if i != j and points[i] is not None and points[j] is not None:
                travel[i][j] = _travel(points[i], points[j])

    x: dict[tuple[int, int], cp_model.IntVar] = {}
    start: dict[tuple[int, int], cp_model.IntVar] = {}
    arcs_by_day: dict[int, list[tuple[int, int, cp_model.IntVar]]] = {}
    lunch_vars: dict[int, cp_model.IntVar] = {}
    dinner_vars: dict[int, cp_model.IntVar] = {}
    objective_terms = []

    for d in range(problem.num_days):
        theme = problem.theme_interests_per_day[d] if d < len(problem.theme_interests_per_day) else []
        intervals = []
        nodes = []  # (node index in travel matrix, candidate)
        windows: dict[int, tuple[int, int]] = {}
        for idx, c in enumerate(cands, start=1):
            window = _day_window(c, problem)
            if window is None:
                continue
            xv = model.NewBoolVar(f"x_{c.place_id}_{d}")
            sv = model.NewIntVar(window[0], window[1], f"s_{c.place_id}_{d}")
            intervals.append(model.NewOptionalFixedSizeIntervalVar(sv, c.duration_min, xv, f"iv_{c.place_id}_{d}"))
            x[c.place_id, d], start[c.place_id, d] = xv, sv
            nodes.append((idx, c))
            windows[idx] = window
            objective_terms.append(round(SCORE_SCALE * _themed_score(c, theme)) * xv)

        # Meals inside the window become fixed-length intervals the visits must avoid
        lunch_lo = max(LUNCH_EARLIEST, act_start)
        lunch_hi = min(max(LUNCH_LATEST, lunch_lo), problem.day_end_min - MEAL_MINUTES)
        if lunch_lo <= lunch_hi:
            lv = model.NewIntVar(lunch_lo, lunch_hi, f"lunch_{d}")
            intervals.append(model.NewFixedSizeIntervalVar(lv, MEAL_MINUTES, f"lunch_iv_{d}"))
            lunch_vars[d] = lv
        if problem.day_end_min - MEAL_MINUTES >= DINNER_EARLIEST:
            dv = model.NewIntVar(DINNER_EARLIEST, problem.day_end_min - MEAL_MINUTES, f"dinner_{d}")
            intervals.append(model.NewFixedSizeIntervalVar(dv, MEAL_MINUTES, f"dinner_iv_{d}"))
            dinner_vars[d] = dv
        model.AddNoOverlap(intervals)

        # Route: a circuit through the hotel (node 0) and the visited places
        day_x = [x[c.place_id, d] for _, c in nodes]
        empty_day = model.NewBoolVar(f"empty_{d}")
        if day_x:
            model.Add(sum(day_x) == 0).OnlyEnforceIf(empty_day)
            model.Add(sum(day_x) >= 1).OnlyEnforceIf(empty_day.Not())
        else:
            model.Add(empty_day == 1)
        arcs = [(0, 0, empty_day)]
        day_arcs = []
        for i, ci in nodes:
            xi = x[ci.place_id, d]
            arcs.append((i, i, xi.Not()))
            first = model.NewBoolVar(f"a_0_{i}_{d}")
            arcs.append((0, i, first))
            model.Add(start[ci.place_id, d] >= act_start + travel[0][i][0]).OnlyEnforceIf(first)
            day_arcs.append((0, i, first))
            arcs.append((i, 0, model.NewBoolVar(f"a_{i}_0_{d}")))
            for j, cj in nodes:
                # skip self-arcs and arcs that can never be time-feasible
                if i == j or windows[i][0] + ci.duration_min + travel[i][j][0] > windows[j][1]:
                    continue
                lit = model.NewBoolVar(f"a_{i}_{j}_{d}")
                arcs.append((i, j, lit))
                model.Add(
                    start[cj.place_id, d] >= start[ci.place_id, d] + ci.duration_min + travel[i][j][0]
                ).OnlyEnforceIf(lit)
                day_arcs.append((i, j, lit))
        model.AddCircuit(arcs)
        arcs_by_day[d] = day_arcs
        for i, j, lit in day_arcs:
            if travel[i][j][0]:
                objective_terms.append(-TRAVEL_PENALTY_PER_MINUTE * travel[i][j][0] * lit)

        # Daily limits
        if day_x:
            model.Add(sum(day_x) <= problem.max_activities_per_day)
        if problem.daily_budget_cap > 0:
            meals = problem.meal_cost_per_day[d] if d < len(problem.meal_cost_per_day) else 0.0
            allowance = math.floor(problem.daily_budget_cap - meals)
            model.Add(sum(math.ceil(c.cost) * x[c.place_id, d] for _, c in nodes) <= allowance)

    # Trip-level constraints
    for c in cands:
        days_of_c = [x[c.place_id, d] for d in range(problem.num_days) if (c.place_id, d) in x]
        if c.place_id in must:
            if days_of_c:
                model.Add(sum(days_of_c) == 1)
            else:
                model.AddBoolOr([])  # cannot be scheduled on any day → infeasible
        elif days_of_c:
            model.Add(sum(days_of_c) <= 1)
    if must - {c.place_id for c in cands}:
        model.AddBoolOr([])  # must-visit is excluded or unknown → infeasible

    model.Maximize(sum(objective_terms))

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = time_limit_s
    solver.parameters.max_deterministic_time = deterministic_limit
    solver.parameters.num_workers = workers
    solver.parameters.interleave_search = workers > 1   # deterministic parallel search
    solver.parameters.random_seed = seed
    status = solver.Solve(model)
    status_name = solver.StatusName(status)

    wall_limit_hit = solver.WallTime() >= time_limit_s * 0.99
    result = SolverResult(
        status=status_name,
        wall_time_s=time.perf_counter() - t0,
        time_limit_s=time_limit_s,
        deterministic_limit=deterministic_limit,
        reproducible=not wall_limit_hit,
        diagnostics=diagnostics,
    )
    if status_name == "INFEASIBLE" and not diagnostics:
        result.diagnostics.append(
            "No schedule satisfies all hard constraints together (time windows, opening hours, "
            "activity limit, budget cap and must-visit places)."
        )
    if status_name == "UNKNOWN":
        result.diagnostics.append("No solution was found within the solver's work/time limit.")
    if wall_limit_hit:
        result.diagnostics.append(
            f"Stopped by the {time_limit_s:g}s wall-clock cap; a rerun may return a different schedule."
        )
    if status_name not in SUCCESS_STATUSES:
        return result

    result.objective = solver.ObjectiveValue() / SCORE_SCALE
    result.best_bound = solver.BestObjectiveBound() / SCORE_SCALE
    for d in range(problem.num_days):
        theme = problem.theme_interests_per_day[d] if d < len(problem.theme_interests_per_day) else []
        prev_of = {j: i for i, j, lit in arcs_by_day[d] if solver.BooleanValue(lit)}
        for (pid, dd), xv in x.items():
            if dd != d or not solver.BooleanValue(xv):
                continue
            c = next(c for c in cands if c.place_id == pid)
            node = cands.index(c) + 1
            prev = prev_of.get(node, 0)
            minutes, km = travel[prev][node]
            s = solver.Value(start[pid, d])
            result.visits.append(ScheduledVisit(
                place_id=pid, day_number=d + 1, start_min=s, end_min=s + c.duration_min,
                score=_themed_score(c, theme), travel_from_prev_min=minutes, distance_from_prev_km=km,
                ranking_score=c.score,
            ))
        if d in lunch_vars:
            result.lunch_start[d + 1] = solver.Value(lunch_vars[d])
        if d in dinner_vars:
            result.dinner_start[d + 1] = solver.Value(dinner_vars[d])
    result.visits.sort(key=lambda v: (v.day_number, v.start_min))
    return result


# ---------------------------------------------------------------------------
# Service: trip → problem → persisted itinerary
# ---------------------------------------------------------------------------

class OptimizationFailed(Exception):
    def __init__(self, result: SolverResult):
        super().__init__(f"CP-SAT status {result.status}")
        self.result = result


class CpSatItineraryService:
    """Builds the model from a trip, solves it, and persists the result like the baseline."""

    def __init__(
        self,
        deterministic_limit: Optional[float] = None,
        time_limit_s: Optional[float] = None,
        workers: Optional[int] = None,
        seed: int = 0,
    ):
        from app.core.config import settings
        from app.services.itinerary.itinerary_service import ItineraryService

        self.baseline = ItineraryService()   # reused for ranking, hotel, meals and themes
        self.deterministic_limit = (
            deterministic_limit if deterministic_limit is not None else settings.optimizer_deterministic_limit
        )
        self.time_limit_s = time_limit_s if time_limit_s is not None else settings.optimizer_time_limit_seconds
        self.workers = workers if workers is not None else settings.optimizer_workers
        self.seed = seed

    def _meals(self, db: "Session", trip: "Trip", day_number: int):
        from app.services.itinerary.itinerary_service import _meal_seed
        seed = _meal_seed(trip, day_number)
        return {m: self.baseline._pick_meal(db, trip.destination, m, seed) for m in ("Breakfast", "Lunch", "Dinner")}

    def build_problem(self, db: "Session", trip: "Trip") -> tuple[SchedulingProblem, dict]:
        from app.services.recommendation.recommendation_service import per_person_daily_budget

        pref, cons = trip.preference, trip.constraints
        ranked = self.baseline.recommender.recommend(
            db=db,
            destination=trip.destination,
            interests=pref.interests if pref else [],
            travel_style=pref.travel_style if pref else "Balanced",
            activity_level=pref.activity_level if pref else "Medium",
            daily_budget=per_person_daily_budget(trip.total_budget, trip.num_days, trip.num_travelers),
            avoid_crowded=cons.avoid_crowded if cons else False,
            exclude_ids=cons.excluded_places if cons else [],
            must_visit_ids=cons.must_visit if cons else [],
            limit=50,
        )
        from app.services.itinerary.itinerary_service import _time_to_minutes

        candidates = [
            Candidate(
                place_id=p.id, name=p.name, score=score,
                open_min=_time_to_minutes(p.opening_time), close_min=_time_to_minutes(p.closing_time),
                duration_min=int(p.average_visit_duration * 60), cost=p.estimated_cost,
                lat=p.latitude, lon=p.longitude, tags=list(p.tags), reasons=list(reasons),
            )
            for p, score, reasons in ranked
        ]
        meals = {d: self._meals(db, trip, d) for d in range(1, trip.num_days + 1)}
        meal_cost = [
            sum((r.average_meal_cost if r else 300.0) for r in meals[d].values())
            for d in range(1, trip.num_days + 1)
        ]
        hotel = self.baseline._pick_hotel(db, trip)
        problem = SchedulingProblem(
            candidates=candidates,
            num_days=trip.num_days,
            day_start_min=_time_to_minutes(pref.preferred_start_time if pref else "09:00"),
            day_end_min=_time_to_minutes(pref.preferred_end_time if pref else "20:00"),
            max_activities_per_day=cons.max_activities_per_day if cons else 4,
            must_visit_ids=list(cons.must_visit) if cons else [],
            excluded_ids=list(cons.excluded_places) if cons else [],
            daily_budget_cap=cons.max_daily_budget if cons else 0.0,
            meal_cost_per_day=meal_cost,
            theme_interests_per_day=[
                self.baseline._day_theme_interests(trip, d) for d in range(1, trip.num_days + 1)
            ],
            hotel_latlon=(hotel.latitude, hotel.longitude) if hotel else None,
        )
        return problem, {"meals": meals, "candidates": {c.place_id: c for c in candidates}}

    def solve_for_trip(self, db: "Session", trip: "Trip") -> tuple[SolverResult, dict]:
        """Read-only: build and solve. Nothing is written to the database."""
        problem, context = self.build_problem(db, trip)
        result = solve(problem, self.deterministic_limit, self.time_limit_s, self.workers, self.seed)
        logger.info(
            f"CP-SAT trip {trip.id}: status={result.status} visits={len(result.visits)} "
            f"objective={result.objective} time={result.wall_time_s:.2f}s"
        )
        return result, context

    def persist(self, db: "Session", trip: "Trip", result: SolverResult, context: dict) -> list["Itinerary"]:
        """Write the solved schedule as Itinerary/ItineraryItem rows (same shape as the baseline)."""
        from app.models.models import Itinerary, ItineraryItem
        from app.services.itinerary.itinerary_service import _minutes_to_time, _time_to_minutes

        if not result.succeeded:
            raise OptimizationFailed(result)

        pref = trip.preference
        day_start = _time_to_minutes(pref.preferred_start_time if pref else "09:00")
        days: list[Itinerary] = []
        for d in range(1, trip.num_days + 1):
            meals = context["meals"][d]
            visits = [v for v in result.visits if v.day_number == d]
            items: list[ItineraryItem] = [self.baseline._make_meal_item("Breakfast", meals["Breakfast"], day_start)]
            last_end = max([v.end_min for v in visits], default=day_start + MEAL_MINUTES)

            lunch_start = result.lunch_start.get(d, max(_time_to_minutes("12:30"), last_end))
            items.append(self.baseline._make_meal_item("Lunch", meals["Lunch"], lunch_start))
            dinner_start = result.dinner_start.get(d, max(DINNER_EARLIEST, last_end, lunch_start + MEAL_MINUTES))
            items.append(self.baseline._make_meal_item("Dinner", meals["Dinner"], dinner_start))

            activity_items = []
            for v in visits:
                c = context["candidates"][v.place_id]
                item = ItineraryItem(
                    item_type="activity",
                    place_id=v.place_id,
                    title=c.name,
                    start_time=_minutes_to_time(v.start_min),
                    end_time=_minutes_to_time(v.end_min),
                    duration_minutes=c.duration_min,
                    cost=c.cost,
                    travel_time_to_next=0.0,
                    distance_to_next=0.0,
                    recommendation_score=round(v.ranking_score, 3),
                    order_index=0,
                )
                item.recommendation_reasons = c.reasons + ["Scheduled by CP-SAT optimizer"]
                activity_items.append(item)
            # travel info lives on the activity before the next one (baseline convention)
            for prev_item, v in zip(activity_items, visits[1:]):
                prev_item.travel_time_to_next = float(v.travel_from_prev_min)
                prev_item.distance_to_next = round(v.distance_from_prev_km, 1)
            items.extend(activity_items)

            items.sort(key=lambda it: _time_to_minutes(it.start_time))
            for i, it in enumerate(items):
                it.order_index = i
            itinerary = Itinerary(
                trip_id=trip.id,
                day_number=d,
                day_date=trip.start_date + timedelta(days=d - 1),
                theme=self.baseline._theme_label(self.baseline._day_theme_interests(trip, d), d),
                total_cost=round(sum(it.cost for it in items), 2),
                total_travel_time=float(sum(v.travel_from_prev_min for v in visits)),
            )
            itinerary.items = items
            db.add(itinerary)
            db.flush()
            days.append(itinerary)

        db.commit()
        for day in days:
            db.refresh(day)
        return days

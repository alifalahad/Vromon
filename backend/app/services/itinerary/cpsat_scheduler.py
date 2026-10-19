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
  - visit fits inside the day window: (day_start + breakfast) ≤ start, end ≤ day_end; each day
    can have its own window (the arrival and leaving times) and busy times nothing may overlap
  - a must-see with a day or a time only goes there (`allowed` start windows per day)
  - each place at most once per trip; excluded places never; must-visit exactly once
  - at most max_activities_per_day visits per day
  - travel: start_j ≥ end_i + travel(i, j) for consecutive visits (AddCircuit route)
  - visits do not overlap each other or lunch/dinner (NoOverlap)
  - activity + meal cost ≤ max_daily_budget, when a cap is set

Objective (maximise)
  Σ round(1000 · (ranking score + day-theme bonus)) · x[p,d]
  + WANTED_BONUS · (must-sees placed) + MEAL_BONUS · (meals placed)
  − TRAVEL_PENALTY_PER_MINUTE · Σ travel minutes on chosen arcs
  Must-sees (`wanted_ids`) and lunch/dinner are soft with large weights: they are placed
  whenever they can be, and a must-see that can't is reported rather than making the
  whole plan fail.

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
WANTED_BONUS = 50 * SCORE_SCALE    # a must-see outweighs any number of other visits…
MEAL_BONUS = 10 * SCORE_SCALE      # …and a meal outweighs a full day of them
# The weather (step 7): an outdoor visit in a rainy hour is worth much less (an indoor one goes
# there instead), yet still more than nothing; a view or beach at sunset (photography) is worth more
RAIN_PENALTY = round(0.6 * SCORE_SCALE)
SUNSET_BONUS = round(0.5 * SCORE_SCALE)

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
    # Per day (index 0 = day 1); missing entries use day_start_min / day_end_min
    day_windows: list[tuple[int, int]] = field(default_factory=list)
    breakfast_per_day: list[bool] = field(default_factory=list)
    busy_per_day: list[list[tuple[int, int]]] = field(default_factory=list)
    # Must-sees placed whenever possible (soft), and where they may go: place → {day index: (lo, hi) start}
    wanted_ids: list[int] = field(default_factory=list)
    allowed: dict[int, dict[int, tuple[int, int]]] = field(default_factory=dict)
    # Rainy hours (minute of day, on the hour) per day index, and the places you're outside at
    wet_per_day: list[frozenset[int]] = field(default_factory=list)
    outdoor_ids: set[int] = field(default_factory=set)
    # Photography: where to be at sunset, and the sunset per day index (None: not that day)
    sunset_ids: set[int] = field(default_factory=set)
    sunset_per_day: list[Optional[int]] = field(default_factory=list)

    def window(self, d: int) -> tuple[int, int]:
        return self.day_windows[d] if d < len(self.day_windows) else (self.day_start_min, self.day_end_min)

    def act_start(self, d: int) -> int:
        """Visits start after breakfast (when the day has one)."""
        breakfast = self.breakfast_per_day[d] if d < len(self.breakfast_per_day) else True
        return self.window(d)[0] + (MEAL_MINUTES if breakfast else 0)

    def busy(self, d: int) -> list[tuple[int, int]]:
        return self.busy_per_day[d] if d < len(self.busy_per_day) else []


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
    at_sunset: bool = False      # placed for the sunset (photography)
    in_rain: bool = False        # during a rainy hour


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


def _travel(a: tuple[float, float], b: tuple[float, float]) -> tuple[int, float]:
    """(travel minutes rounded up, distance km): by road when known, else the straight-line estimate."""
    from app.services.routing import ROADS
    t = ROADS.travel(a, b)
    return math.ceil(t.minutes - 1e-9), t.km


def _themed_score(c: Candidate, theme: list[str]) -> float:
    tags = {t.lower() for t in c.tags}
    return c.score + (THEME_BONUS if any(t.lower() in tags for t in theme) else 0.0)


def _wet_starts(wet: frozenset[int], duration: int) -> list[tuple[int, int]]:
    """The start minutes at which a visit of this length overlaps a rainy hour."""
    return [(h - duration + 1, h + 59) for h in sorted(wet)]


def _dry_domain(window: tuple[int, int], wet: frozenset[int], duration: int) -> list[list[int]]:
    """[earliest, latest] start pieces within the window that stay out of every rainy hour."""
    pieces = [[window[0], window[1]]]
    for lo, hi in _wet_starts(wet, duration):
        out = []
        for a, b in pieces:
            if hi < a or lo > b:
                out.append([a, b])
                continue
            if a < lo:
                out.append([a, lo - 1])
            if hi < b:
                out.append([hi + 1, b])
        pieces = out
    return pieces


def _day_window(c: Candidate, problem: SchedulingProblem, d: int = 0) -> Optional[tuple[int, int]]:
    """Feasible [earliest start, latest start] for a visit on day index d, or None."""
    lo = max(problem.act_start(d), c.open_min)   # after breakfast
    hi = min(problem.window(d)[1], c.close_min) - c.duration_min
    allowed = problem.allowed.get(c.place_id)
    if allowed is not None:
        if d not in allowed:
            return None
        lo, hi = max(lo, allowed[d][0]), min(hi, allowed[d][1])
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
        elif all(_day_window(c, problem, d) is None for d in range(problem.num_days)):
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
    wanted = set(problem.wanted_ids)
    cands = [c for c in problem.candidates if c.place_id not in excluded]
    hotel = problem.hotel_latlon

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
    dry: dict[tuple[int, int], cp_model.IntVar] = {}
    sunny: dict[tuple[int, int], cp_model.IntVar] = {}
    objective_terms = []

    lunch_on: dict[int, cp_model.IntVar] = {}
    dinner_on: dict[int, cp_model.IntVar] = {}
    for d in range(problem.num_days):
        theme = problem.theme_interests_per_day[d] if d < len(problem.theme_interests_per_day) else []
        act_start = problem.act_start(d)
        day_end = problem.window(d)[1]
        intervals = []
        nodes = []  # (node index in travel matrix, candidate)
        windows: dict[int, tuple[int, int]] = {}
        for idx, c in enumerate(cands, start=1):
            window = _day_window(c, problem, d)
            if window is None:
                continue
            xv = model.NewBoolVar(f"x_{c.place_id}_{d}")
            sv = model.NewIntVar(window[0], window[1], f"s_{c.place_id}_{d}")
            intervals.append(model.NewOptionalFixedSizeIntervalVar(sv, c.duration_min, xv, f"iv_{c.place_id}_{d}"))
            x[c.place_id, d], start[c.place_id, d] = xv, sv
            nodes.append((idx, c))
            windows[idx] = window
            bonus = WANTED_BONUS if c.place_id in wanted else 0
            objective_terms.append((round(SCORE_SCALE * _themed_score(c, theme)) + bonus) * xv)

            # Outdoors: costs RAIN_PENALTY unless the visit stays out of the rainy hours
            wet = problem.wet_per_day[d] if d < len(problem.wet_per_day) else frozenset()
            if wet and c.place_id in problem.outdoor_ids and c.place_id not in wanted:
                pieces = _dry_domain(window, wet, c.duration_min)
                objective_terms.append(-RAIN_PENALTY * xv)
                if pieces:
                    dv = model.NewBoolVar(f"dry_{c.place_id}_{d}")
                    model.AddImplication(dv, xv)
                    model.AddLinearExpressionInDomain(sv, cp_model.Domain.FromIntervals(pieces)).OnlyEnforceIf(dv)
                    objective_terms.append(RAIN_PENALTY * dv)
                    dry[c.place_id, d] = dv

            # Photography: a view or beach there for the sunset
            ss = problem.sunset_per_day[d] if d < len(problem.sunset_per_day) else None
            if ss is not None and c.place_id in problem.sunset_ids and c.place_id not in wanted and c.duration_min >= 25:
                # As for a must-see at sunset: arrive at least 15 min before, stay until just after
                lo, hi = max(ss - c.duration_min + 10, window[0]), min(ss - 15, window[1])
                if lo <= hi:
                    uv = model.NewBoolVar(f"sunset_{c.place_id}_{d}")
                    model.AddImplication(uv, xv)
                    model.Add(sv >= lo).OnlyEnforceIf(uv)
                    model.Add(sv <= hi).OnlyEnforceIf(uv)
                    objective_terms.append(SUNSET_BONUS * uv)
                    sunny[c.place_id, d] = uv

        # Busy times: nothing overlaps them
        for k, (b0, b1) in enumerate(problem.busy(d)):
            intervals.append(model.NewIntervalVar(b0, b1 - b0, b1, f"busy_{d}_{k}"))

        # Meals inside the window become fixed-length intervals the visits must avoid
        # (optional, with a large bonus: only left out when a busy time or a must-see leaves no room)
        lunch_lo = max(LUNCH_EARLIEST, act_start)
        lunch_hi = min(max(LUNCH_LATEST, lunch_lo), day_end - MEAL_MINUTES)
        if lunch_lo <= lunch_hi:
            lv = model.NewIntVar(lunch_lo, lunch_hi, f"lunch_{d}")
            lp = model.NewBoolVar(f"lunch_on_{d}")
            intervals.append(model.NewOptionalFixedSizeIntervalVar(lv, MEAL_MINUTES, lp, f"lunch_iv_{d}"))
            lunch_vars[d], lunch_on[d] = lv, lp
            objective_terms.append(MEAL_BONUS * lp)
        if day_end - MEAL_MINUTES >= max(DINNER_EARLIEST, act_start):
            dv = model.NewIntVar(max(DINNER_EARLIEST, act_start), day_end - MEAL_MINUTES, f"dinner_{d}")
            dp = model.NewBoolVar(f"dinner_on_{d}")
            intervals.append(model.NewOptionalFixedSizeIntervalVar(dv, MEAL_MINUTES, dp, f"dinner_iv_{d}"))
            dinner_vars[d], dinner_on[d] = dv, dp
            objective_terms.append(MEAL_BONUS * dp)
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
        day_sunny = [v for (_pid, dd), v in sunny.items() if dd == d]
        if len(day_sunny) > 1:
            model.Add(sum(day_sunny) <= 1)
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

    # Reported without the must-see, meal and weather terms, so it stays comparable to the baseline's score
    bonus = sum(
        WANTED_BONUS for (pid, _d), xv in x.items() if pid in wanted and solver.BooleanValue(xv)
    ) + MEAL_BONUS * sum(1 for v in [*lunch_on.values(), *dinner_on.values()] if solver.BooleanValue(v))
    bonus += SUNSET_BONUS * sum(1 for v in sunny.values() if solver.BooleanValue(v))
    bonus -= RAIN_PENALTY * sum(
        1 for (pid, d), xv in x.items()
        if solver.BooleanValue(xv) and pid in problem.outdoor_ids and pid not in wanted
        and d < len(problem.wet_per_day) and problem.wet_per_day[d]
        and not ((pid, d) in dry and solver.BooleanValue(dry[pid, d]))
    )
    result.objective = (solver.ObjectiveValue() - bonus) / SCORE_SCALE
    result.best_bound = (solver.BestObjectiveBound() - bonus) / SCORE_SCALE
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
                at_sunset=(pid, d) in sunny and solver.BooleanValue(sunny[pid, d]),
                in_rain=d < len(problem.wet_per_day)
                and any(h < s + c.duration_min and s < h + 60 for h in problem.wet_per_day[d]),
            ))
        if d in lunch_vars and solver.BooleanValue(lunch_on[d]):
            result.lunch_start[d + 1] = solver.Value(lunch_vars[d])
        if d in dinner_vars and solver.BooleanValue(dinner_on[d]):
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

    def _meals(self, db: "Session", trip: "Trip", day_number: int, rules):
        from app.services.itinerary.itinerary_service import _meal_seed
        seed = _meal_seed(trip, day_number)
        # Breakfast is at the start of the day; lunch and dinner use their usual slots
        day_start = rules.window(day_number)[0]
        meals = {
            m: self.baseline._pick_meal(db, trip.destination, m, seed, day_start if m == "Breakfast" else None)
            for m in ("Lunch", "Dinner")
        }
        if rules.has_breakfast(day_number):
            meals["Breakfast"] = self.baseline._pick_meal(db, trip.destination, "Breakfast", seed, day_start)
        return meals

    def build_problem(self, db: "Session", trip: "Trip") -> tuple[SchedulingProblem, dict]:
        from app.services.itinerary.trip_rules import load_rules

        cons = trip.constraints
        rules = load_rules(db, trip)
        ranked = self.baseline.ranked(db, trip, rules)
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
        meals = {d: self._meals(db, trip, d, rules) for d in range(1, trip.num_days + 1)}
        meal_cost = [
            sum((r.average_meal_cost if r else 300.0) for r in meals[d].values())
            for d in range(1, trip.num_days + 1)
        ]
        hotel = self.baseline._pick_hotel(db, trip)
        # A must-see with a day or a time may only start in that window
        durations = {c.place_id: c.duration_min for c in candidates}
        allowed = {
            m.place_id: {d - 1: rules.wanted_range(m, durations[m.place_id], d) for d in rules.days_for(m)}
            for m in rules.must_sees
            if (m.day or m.timed) and m.place_id in durations
        }
        problem = SchedulingProblem(
            candidates=candidates,
            num_days=trip.num_days,
            day_start_min=rules.start,
            day_end_min=rules.end,
            max_activities_per_day=rules.stops_per_day,
            must_visit_ids=[],
            wanted_ids=sorted(rules.must_ids()),
            allowed=allowed,
            day_windows=[rules.window(d) for d in range(1, trip.num_days + 1)],
            breakfast_per_day=[rules.has_breakfast(d) for d in range(1, trip.num_days + 1)],
            busy_per_day=[[(b.start, b.end) for b in rules.busy_on(d)] for d in range(1, trip.num_days + 1)],
            excluded_ids=list(cons.excluded_places) if cons else [],
            daily_budget_cap=cons.max_daily_budget if cons else 0.0,
            meal_cost_per_day=meal_cost,
            theme_interests_per_day=[
                self.baseline._day_theme_interests(trip, d) for d in range(1, trip.num_days + 1)
            ],
            hotel_latlon=(hotel.latitude, hotel.longitude) if hotel else None,
        )
        # The weather (step 7): rainy hours from the forecast, and sunset stops for photography
        from app.services.conditions.service import outdoor_place, planning_weather
        from app.services.itinerary.itinerary_service import _sunset_place
        wet = planning_weather(db, trip)
        places = {p.id: p for p, _s, _r in ranked}
        problem.wet_per_day = [wet.get(d, frozenset()) for d in range(1, trip.num_days + 1)]
        problem.outdoor_ids = {pid for pid, p in places.items() if outdoor_place(p)}
        photo = "photography" in {i.lower() for i in (trip.preference.interests if trip.preference else [])}
        if photo:
            problem.sunset_ids = {pid for pid, p in places.items() if _sunset_place(p) and pid not in rules.must_ids()}
            sunsets = []
            for d in range(1, trip.num_days + 1):
                ss = rules.sunset(d)
                sunset_must = any(m.when == "sunset" and m.day in (None, d) for m in rules.must_sees)
                rainy = any(h < ss + 15 and ss - 60 < h + 60 for h in wet.get(d, frozenset()))
                sunsets.append(None if sunset_must or rainy else ss)
            problem.sunset_per_day = sunsets
        return problem, {
            "meals": meals, "candidates": {c.place_id: c for c in candidates}, "rules": rules,
            "outdoor": problem.outdoor_ids,
        }

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
        from app.services.itinerary.itinerary_service import _meal_seed, _minutes_to_time, _time_to_minutes

        if not result.succeeded:
            raise OptimizationFailed(result)

        from app.services.itinerary.itinerary_service import _must_note
        from app.services.routing import ROADS
        from app.services.itinerary.trip_rules import Placement
        from app.services.itinerary.trip_rules import load_rules

        rules = context.get("rules") or load_rules(db, trip)
        days: list[Itinerary] = []
        for d in range(1, trip.num_days + 1):
            meals = context["meals"][d]
            visits = [v for v in result.visits if v.day_number == d]
            seed = _meal_seed(trip, d)

            def meal(name: str, start: int, meals=meals, seed=seed) -> ItineraryItem:
                # The planned restaurant if it's open at the solved time, otherwise one that is
                return self.baseline._meal_item_at(db, trip.destination, name, meals[name], start, seed)

            # Only the meals the day has room and time for (the solver leaves one out only when it must)
            items: list[ItineraryItem] = []
            if "Breakfast" in meals:
                items.append(meal("Breakfast", rules.window(d)[0]))
            if d in result.lunch_start:
                items.append(meal("Lunch", result.lunch_start[d]))
            if d in result.dinner_start:
                items.append(meal("Dinner", result.dinner_start[d]))

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
                m = rules.must_for(v.place_id)
                if m is not None and m.timed:
                    note = _must_note(rules, Placement(m, None, d, v.start_min), d)
                elif v.at_sunset:
                    note = f"Here at sunset (about {_minutes_to_time(rules.sunset(d))}), for your photos"
                elif v.in_rain and v.place_id in context.get("outdoor", set()):
                    note = "Rain is likely then; no dry time was free"
                elif v.in_rain:
                    note = "Indoors while rain is likely"
                else:
                    note = "Placed where the day needs the least travel"
                item.recommendation_reasons = c.reasons + [note]
                activity_items.append(item)
            # travel info lives on the activity before the next one (baseline convention)
            for prev_item, v, prev_v in zip(activity_items, visits[1:], visits):
                # Stored like the other planners (unrounded minutes); the model itself rounded up
                c_prev, c_next = context["candidates"][prev_v.place_id], context["candidates"][v.place_id]
                t = ROADS.travel((c_prev.lat, c_prev.lon), (c_next.lat, c_next.lon))
                prev_item.travel_time_to_next = round(t.minutes, 1)
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

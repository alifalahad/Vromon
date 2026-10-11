"""
Phase 9 tests — OR-Tools CP-SAT itinerary optimizer.

Three layers:
  1. solve() on small hand-built problems: each hard constraint, statuses, determinism
  2. the service on seeded trips, checked by the independent ConstraintValidator
  3. the API (?algorithm=cpsat), including infeasible requests
Plus regression tests for the Phase 4 baseline fixes made in this phase.
"""

from __future__ import annotations

from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base, get_db
from app.db.seeder import seed_database
from app.main import app
from app.models.models import Itinerary, ItineraryItem, Place, Trip, TripConstraint, TripPreference
from app.services.itinerary.constraint_validator import ConstraintValidator
from app.services.itinerary.cpsat_scheduler import (
    Candidate,
    CpSatItineraryService,
    OptimizationFailed,
    SchedulingProblem,
    SolverResult,
    solve,
)
from app.services.itinerary.itinerary_service import ItineraryService

H = 60  # minutes per hour


def cand(pid, score=0.8, open_h=8, close_h=18, dur=60, cost=0.0, lat=21.43, lon=92.0, tags=()):
    return Candidate(pid, f"Place {pid}", score, open_h * H, close_h * H, dur, cost, lat, lon, list(tags))


def problem(cands, **kw):
    defaults = dict(num_days=1, day_start_min=9 * H, day_end_min=20 * H, max_activities_per_day=4,
                    meal_cost_per_day=[900.0])
    defaults.update(kw)
    return SchedulingProblem(candidates=cands, **defaults)


def run(p, **kw):
    kw.setdefault("deterministic_limit", 2.0)
    kw.setdefault("workers", 4)
    return solve(p, **kw)


def overlaps(a_start, a_end, b_start, b_end):
    return a_start < b_end and b_start < a_end


# ---------------------------------------------------------------------------
# 1. Pure solver
# ---------------------------------------------------------------------------

class TestSolverConstraints:

    def test_visits_respect_opening_hours_and_day_window(self):
        cands = [cand(1, open_h=15, close_h=19, dur=120), cand(2, open_h=6, close_h=12, dur=90), cand(3)]
        r = run(problem(cands))
        assert r.status == "OPTIMAL"
        by_id = {c.place_id: c for c in cands}
        for v in r.visits:
            c = by_id[v.place_id]
            assert c.open_min <= v.start_min and v.end_min <= c.close_min
            assert v.start_min >= 10 * H          # after 60-min breakfast at 09:00
            assert v.end_min <= 20 * H

    def test_place_that_cannot_fit_is_not_scheduled(self):
        # open 06:00-10:00 but activities start after breakfast at 10:00
        r = run(problem([cand(1, open_h=6, close_h=10, dur=60), cand(2)]))
        assert [v.place_id for v in r.visits] == [2]

    def test_daily_activity_limit(self):
        r = run(problem([cand(i) for i in range(1, 8)], max_activities_per_day=2))
        assert len(r.visits) == 2

    def test_each_place_at_most_once_across_days(self):
        r = run(problem([cand(i) for i in range(1, 4)], num_days=3, meal_cost_per_day=[900.0] * 3))
        ids = [v.place_id for v in r.visits]
        assert len(ids) == len(set(ids)) == 3

    def test_excluded_place_never_scheduled(self):
        r = run(problem([cand(1, score=1.0), cand(2, score=0.1)], excluded_ids=[1]))
        assert [v.place_id for v in r.visits] == [2]

    def test_must_visit_is_scheduled_even_with_low_score(self):
        cands = [cand(i, score=0.9) for i in range(1, 5)] + [cand(9, score=0.0)]
        r = run(problem(cands, max_activities_per_day=2, must_visit_ids=[9]))
        assert r.status == "OPTIMAL"
        assert 9 in [v.place_id for v in r.visits]

    def test_no_overlap_with_meals_or_each_other_and_travel_respected(self):
        cands = [cand(1, dur=120, lat=21.40), cand(2, dur=120, lat=21.50), cand(3, dur=90, lat=21.45)]
        r = run(problem(cands))
        visits = sorted(r.visits, key=lambda v: v.start_min)
        for a, b in zip(visits, visits[1:]):
            assert b.start_min >= a.end_min + b.travel_from_prev_min
        lunch = r.lunch_start[1]
        dinner = r.dinner_start[1]
        assert 12 * H <= lunch <= 14 * H
        for v in visits:
            assert not overlaps(v.start_min, v.end_min, lunch, lunch + 60)
            assert not overlaps(v.start_min, v.end_min, dinner, dinner + 60)

    def test_daily_budget_cap_includes_meals(self):
        cands = [cand(1, score=1.0, cost=500), cand(2, score=0.5, cost=50)]
        r = run(problem(cands, daily_budget_cap=1000, meal_cost_per_day=[900.0]))
        assert [v.place_id for v in r.visits] == [2]

    def test_prefers_higher_scores(self):
        r = run(problem([cand(1, score=0.2), cand(2, score=0.9)], max_activities_per_day=1))
        assert [v.place_id for v in r.visits] == [2]


class TestSolverStatus:

    def test_optimal_reports_zero_gap(self):
        r = run(problem([cand(1), cand(2)]))
        assert r.status == "OPTIMAL"
        assert r.gap == 0.0
        assert r.meta()["reproducible"] is True

    def test_must_visit_and_excluded_conflict_is_infeasible(self):
        r = run(problem([cand(1)], must_visit_ids=[1], excluded_ids=[1]))
        assert r.status == "INFEASIBLE"
        assert r.visits == []
        assert any("both must-visit and excluded" in d for d in r.diagnostics)

    def test_must_visit_outside_hours_is_infeasible(self):
        r = run(problem([cand(1, open_h=6, close_h=10, dur=120)], must_visit_ids=[1]))
        assert r.status == "INFEASIBLE"
        assert any("does not fit" in d for d in r.diagnostics)

    def test_unknown_must_visit_is_infeasible(self):
        r = run(problem([cand(1)], must_visit_ids=[999]))
        assert r.status == "INFEASIBLE"

    def test_too_many_must_visits_is_infeasible(self):
        r = run(problem([cand(i) for i in range(1, 5)], max_activities_per_day=2, must_visit_ids=[1, 2, 3]))
        assert r.status == "INFEASIBLE"
        assert any("exceed the capacity" in d for d in r.diagnostics)

    def test_meals_over_budget_cap_is_infeasible(self):
        r = run(problem([cand(1)], daily_budget_cap=100, meal_cost_per_day=[900.0]))
        assert r.status == "INFEASIBLE"
        assert any("meal costs" in d for d in r.diagnostics)

    def test_empty_candidate_list_is_a_valid_empty_schedule(self):
        r = run(problem([]))
        assert r.status == "OPTIMAL"
        assert r.visits == []

    def test_same_problem_gives_same_schedule(self):
        cands = [cand(i, score=0.5 + i / 100, lat=21.40 + i / 100) for i in range(1, 15)]
        p = problem(cands, num_days=3, meal_cost_per_day=[900.0] * 3)
        a = run(p, deterministic_limit=1.0, workers=8)
        b = run(p, deterministic_limit=1.0, workers=8)
        sig = lambda r: [(v.place_id, v.day_number, v.start_min) for v in r.visits]
        assert a.status in ("OPTIMAL", "FEASIBLE")
        assert sig(a) == sig(b)

    def test_failed_result_cannot_be_persisted(self, db):
        trip = make_trip(db)
        with pytest.raises(OptimizationFailed):
            CpSatItineraryService().persist(db, trip, SolverResult(status="INFEASIBLE"), {})


# ---------------------------------------------------------------------------
# 2. Service on seeded data + independent validator
# ---------------------------------------------------------------------------

_engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
_Session = sessionmaker(autocommit=False, autoflush=False, bind=_engine)


def _get_test_db():
    s = _Session()
    try:
        yield s
    finally:
        s.close()


@pytest.fixture(scope="module", autouse=True)
def setup_db():
    Base.metadata.create_all(bind=_engine)
    s = _Session()
    try:
        seed_database(s)
    finally:
        s.close()
    yield
    Base.metadata.drop_all(bind=_engine)


@pytest.fixture
def db():
    s = _Session()
    yield s
    s.close()


@pytest.fixture
def client():
    app.dependency_overrides[get_db] = _get_test_db
    yield TestClient(app)
    app.dependency_overrides.pop(get_db, None)


def make_trip(db, days=2, interests=("Beach", "Nature"), start="09:00", end="20:00",
              max_per_day=4, must_visit=(), excluded=(), daily_cap=0.0) -> Trip:
    trip = Trip(destination="Cox's Bazar", start_date=date(2026, 11, 1),
                end_date=date(2026, 11, 1) + timedelta(days=days - 1),
                num_travelers=2, total_budget=40000, title="Optimizer test")
    db.add(trip)
    db.flush()
    pref = TripPreference(trip_id=trip.id, preferred_start_time=start, preferred_end_time=end)
    pref.interests = list(interests)
    db.add(pref)
    cons = TripConstraint(trip_id=trip.id, max_activities_per_day=max_per_day, max_daily_budget=daily_cap)
    cons.must_visit = list(must_visit)
    cons.excluded_places = list(excluded)
    db.add(cons)
    db.commit()
    db.refresh(trip)
    return trip


def place_id(db, name):
    return db.query(Place).filter(Place.name == name).one().id


FAST = dict(deterministic_limit=1.0, workers=8)


class TestServiceWithValidator:

    @pytest.mark.parametrize("days,interests,start,end,k", [
        (1, ("Beach", "Nature"), "09:00", "20:00", 4),
        (2, ("Food", "Culture"), "07:00", "18:00", 5),
        (3, ("Adventure", "Photography"), "08:00", "21:00", 4),
    ])
    def test_cpsat_itinerary_passes_independent_validation(self, db, days, interests, start, end, k):
        trip = make_trip(db, days=days, interests=interests, start=start, end=end, max_per_day=k)
        svc = CpSatItineraryService(**FAST)
        result, ctx = svc.solve_for_trip(db, trip)
        assert result.succeeded
        out = svc.persist(db, trip, result, ctx)
        report = ConstraintValidator().validate(trip, out)
        assert not report.has_hard_violations, [v.message for v in report.hard_violations]
        assert len(out) == days
        assert all(any(i.item_type == "activity" for i in d.items) for d in out)

    def test_must_visit_and_exclusion_on_real_data(self, db):
        must = place_id(db, "Ramu Buddhist Temple Complex")
        excl = place_id(db, "Laboni Beach")
        trip = make_trip(db, days=2, must_visit=[must], excluded=[excl])
        svc = CpSatItineraryService(**FAST)
        result, ctx = svc.solve_for_trip(db, trip)
        out = svc.persist(db, trip, result, ctx)
        ids = [i.place_id for d in out for i in d.items if i.item_type == "activity"]
        assert must in ids and excl not in ids
        assert not ConstraintValidator().validate(trip, out).has_hard_violations

    def test_daily_cap_respected_including_meals(self, db):
        trip = make_trip(db, days=2, daily_cap=2500)
        svc = CpSatItineraryService(**FAST)
        result, ctx = svc.solve_for_trip(db, trip)
        assert result.succeeded, result.diagnostics
        out = svc.persist(db, trip, result, ctx)
        for d in out:
            assert sum(i.cost for i in d.items) <= 2500
        assert not ConstraintValidator().validate(trip, out).has_hard_violations

    def test_solve_for_trip_writes_nothing(self, db):
        trip = make_trip(db)
        before = db.query(ItineraryItem).count()
        CpSatItineraryService(**FAST).solve_for_trip(db, trip)
        assert db.query(ItineraryItem).count() == before

    def test_items_use_real_place_data(self, db):
        trip = make_trip(db, days=1)
        svc = CpSatItineraryService(**FAST)
        result, ctx = svc.solve_for_trip(db, trip)
        out = svc.persist(db, trip, result, ctx)
        for item in out[0].items:
            if item.item_type == "activity":
                assert item.title == item.place.name
                assert item.cost == item.place.estimated_cost
                assert item.duration_minutes == int(item.place.average_visit_duration * 60)


# ---------------------------------------------------------------------------
# 3. API
# ---------------------------------------------------------------------------

class TestGenerateApi:

    def test_default_is_heuristic(self, client, db):
        trip = make_trip(db)
        data = client.post(f"/api/v1/trips/{trip.id}/generate").json()
        assert data["meta"]["algorithm"] == "heuristic_v1"
        assert data["meta"]["solver"] is None

    def test_cpsat_generation(self, client, db, monkeypatch):
        from app.core.config import settings
        monkeypatch.setattr(settings, "optimizer_deterministic_limit", 1.0)
        trip = make_trip(db, days=2)
        resp = client.post(f"/api/v1/trips/{trip.id}/generate", params={"algorithm": "cpsat"})
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["meta"]["algorithm"] == "cpsat_v1"
        assert data["meta"]["solver"]["status"] in ("OPTIMAL", "FEASIBLE")
        assert data["valid"] is True
        assert data["validation"]["hard_violation_count"] == 0
        saved = client.get(f"/api/v1/trips/{trip.id}/itinerary").json()
        assert len(saved["days"]) == 2

    def test_infeasible_request_returns_422_and_keeps_existing_itinerary(self, client, db):
        trip = make_trip(db, days=1)
        assert client.post(f"/api/v1/trips/{trip.id}/generate").status_code == 200
        before = client.get(f"/api/v1/trips/{trip.id}/itinerary").json()

        pid = place_id(db, "Laboni Beach")
        trip.constraints.must_visit = [pid]
        trip.constraints.excluded_places = [pid]
        db.commit()

        resp = client.post(f"/api/v1/trips/{trip.id}/generate", params={"algorithm": "cpsat"})
        assert resp.status_code == 422
        detail = resp.json()["detail"]
        assert detail["solver"]["status"] == "INFEASIBLE"
        assert any("both must-visit and excluded" in d for d in detail["solver"]["diagnostics"])
        after = client.get(f"/api/v1/trips/{trip.id}/itinerary").json()
        assert [i["id"] for d in after["days"] for i in d["items"]] == \
               [i["id"] for d in before["days"] for i in d["items"]]

    def test_unknown_algorithm_rejected(self, client, db):
        trip = make_trip(db)
        resp = client.post(f"/api/v1/trips/{trip.id}/generate", params={"algorithm": "magic"})
        assert resp.status_code == 422

    def test_regenerate_accepts_algorithm(self, client, db, monkeypatch):
        from app.core.config import settings
        monkeypatch.setattr(settings, "optimizer_deterministic_limit", 1.0)
        trip = make_trip(db, days=1)
        data = client.post(f"/api/v1/trips/{trip.id}/regenerate", params={"algorithm": "cpsat"}).json()
        assert data["meta"]["algorithm"] == "cpsat_v1"


# ---------------------------------------------------------------------------
# Phase 4 baseline fixes made in Phase 9 (validator gaps exposed them)
# ---------------------------------------------------------------------------

class TestBaselineFixes:

    @pytest.mark.parametrize("days,interests,start,end,k", [
        (2, ("Beach", "Nature"), "09:00", "20:00", 4),
        (3, ("Food", "Culture"), "07:00", "18:00", 5),
        (4, ("Adventure", "Photography"), "08:00", "21:00", 4),
    ])
    def test_baseline_respects_opening_hours(self, db, days, interests, start, end, k):
        """Before the fix these trips had 1, 2 and 5 opening-hour violations respectively."""
        trip = make_trip(db, days=days, interests=interests, start=start, end=end, max_per_day=k)
        out = ItineraryService().generate(db, trip)
        codes = [v.code for v in ConstraintValidator().validate(trip, out).violations]
        assert "OUTSIDE_OPENING_HOURS" not in codes

    def test_baseline_is_deterministic(self, db):
        sig = []
        for _ in range(2):
            trip = make_trip(db, days=2)
            out = ItineraryService().generate(db, trip)
            sig.append([(i.title, i.start_time) for d in out for i in d.items])
        assert sig[0] == sig[1]


class TestValidatorNewChecks:

    def _day(self, db, trip, items):
        day = Itinerary(trip_id=trip.id, day_number=1, day_date=trip.start_date)
        day.items = items
        db.add(day)
        db.commit()
        db.refresh(day)
        return day

    def test_outside_opening_hours_detected(self, db):
        trip = make_trip(db, days=1)
        fish = db.query(Place).filter(Place.name == "Cox's Bazar Fish Market").one()   # 06:00-10:00
        day = self._day(db, trip, [ItineraryItem(item_type="activity", place_id=fish.id, title=fish.name,
                                                 start_time="11:00", end_time="12:00")])
        codes = [v.code for v in ConstraintValidator().validate(trip, [day]).hard_violations]
        assert "OUTSIDE_OPENING_HOURS" in codes

    def test_duplicate_place_detected(self, db):
        trip = make_trip(db, days=1)
        p = db.query(Place).filter(Place.name == "Laboni Beach").one()
        day = self._day(db, trip, [
            ItineraryItem(item_type="activity", place_id=p.id, title=p.name, start_time="10:00", end_time="11:00"),
            ItineraryItem(item_type="activity", place_id=p.id, title=p.name, start_time="15:00", end_time="16:00"),
        ])
        codes = [v.code for v in ConstraintValidator().validate(trip, [day]).hard_violations]
        assert "DUPLICATE_PLACE" in codes

    def test_daily_budget_exceeded_detected(self, db):
        trip = make_trip(db, days=1, daily_cap=100)
        day = self._day(db, trip, [ItineraryItem(item_type="meal", title="Lunch", start_time="12:30",
                                                 end_time="13:30", cost=300)])
        codes = [v.code for v in ConstraintValidator().validate(trip, [day]).hard_violations]
        assert "DAILY_BUDGET_EXCEEDED" in codes

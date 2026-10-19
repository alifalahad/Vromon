"""
Trip planner step 4: the traveller's must-dos. Arrival and leaving times, busy
times, must-sees with a day and a time, pace, and what happens when a must-see
can't fit (the reason, the nearest time that fits, and re-planning only the day
that needs it). Both planners are checked.
"""

from __future__ import annotations

from datetime import date, timedelta

import pytest

from app.services.itinerary.trip_rules import MustSee, TripRules, m2t, sunset_min, t2m
from tests.test_phase10_editing import (  # noqa: F401 (fixtures)
    activities,
    client,
    itinerary,
    place_id,
    setup_db,
)

START = date(2026, 11, 1)
COX = (21.4272, 92.0058)
PLANNERS = ["heuristic", "cpsat"]


@pytest.fixture(autouse=True)
def quick_optimizer(monkeypatch):
    from app.core.config import settings
    monkeypatch.setattr(settings, "optimizer_deterministic_limit", 2.0)


def new_trip(client, days=3, *, style="Balanced", must_sees=(), busy=(), arrive=None, leave=None,
             excluded=(), extra_constraints=None, generate="heuristic") -> dict:
    payload = {
        "destination": "Cox's Bazar",
        "start_date": str(START),
        "end_date": str(START + timedelta(days=days - 1)),
        "num_travelers": 2,
        "total_budget": 30000,
        "preference": {"interests": ["Beach", "Nature"], "travel_style": style,
                       "preferred_start_time": "09:00", "preferred_end_time": "20:00",
                       "arrive_time": arrive, "leave_time": leave},
        "constraints": {"must_sees": list(must_sees), "busy": list(busy), "excluded_places": list(excluded),
                        **(extra_constraints or {})},
    }
    r = client.post("/api/v1/trips", json=payload)
    assert r.status_code == 201, r.text
    trip = r.json()
    if generate:
        g = client.post(f"/api/v1/trips/{trip['id']}/generate", params={"algorithm": generate})
        assert g.status_code == 200, g.text
        trip["generated"] = g.json()
    return trip


def ordered(day: dict) -> list[dict]:
    return sorted(day["items"], key=lambda i: t2m(i["start_time"]))


def codes(validation: dict) -> set[str]:
    return {v["code"] for v in validation["violations"] if v["severity"] == "hard"}


class TestSunset:

    def test_sunset_matches_published_times_for_coxs_bazar(self):
        # timeanddate.com: 19 Oct 17:26, 21 Jun 18:39, 21 Dec 17:14 (we allow ±5 min)
        for day, published in [(date(2026, 10, 19), "17:26"), (date(2026, 6, 21), "18:39"), (date(2026, 12, 21), "17:14")]:
            assert abs(sunset_min(*COX, day) - t2m(published)) <= 5


class TestSavingMustDos:

    def test_must_sees_busy_times_and_arrival_are_saved_and_returned(self, client):
        inani = place_id("Inani Beach")
        trip = new_trip(
            client, must_sees=[{"place_id": inani, "day": 1, "when": "sunset"}],
            busy=[{"day": 2, "start": "18:00", "end": "21:00", "label": " Wedding "}],
            arrive="14:00", leave="11:00", generate=None,
        )
        got = client.get(f"/api/v1/trips/{trip['id']}").json()
        assert got["constraints"]["must_sees"] == [{"place_id": inani, "day": 1, "when": "sunset", "at": None}]
        assert got["constraints"]["must_visit"] == [inani]
        assert got["constraints"]["busy"] == [{"day": 2, "start": "18:00", "end": "21:00", "label": "Wedding"}]
        assert got["preference"]["arrive_time"] == "14:00" and got["preference"]["leave_time"] == "11:00"

    def test_the_plain_must_visit_list_still_works_and_keeps_each_ones_time(self, client):
        inani, hill = place_id("Inani Beach"), place_id("Himchari Hilltop Viewpoint")
        trip = new_trip(client, must_sees=[{"place_id": inani, "day": 1, "when": "sunset"}], generate=None)
        r = client.patch(f"/api/v1/trips/{trip['id']}", json={"constraints": {"must_visit": [inani, hill]}})
        assert r.status_code == 200, r.text
        assert r.json()["constraints"]["must_sees"] == [
            {"place_id": inani, "day": 1, "when": "sunset", "at": None},
            {"place_id": hill, "day": None, "when": None, "at": None},
        ]

    @pytest.mark.parametrize("style,stops", [("Relaxed", 3), ("Balanced", 4), ("Packed", 6)])
    def test_pace_sets_the_stops_a_day(self, client, style, stops):
        trip = new_trip(client, style=style, generate=None)
        assert trip["constraints"]["max_activities_per_day"] == stops

    def test_an_explicit_stops_a_day_wins_over_the_pace(self, client):
        trip = new_trip(client, style="Packed", extra_constraints={"max_activities_per_day": 2}, generate=None)
        assert trip["constraints"]["max_activities_per_day"] == 2

    @pytest.mark.parametrize("constraints,preference", [
        ({"must_sees": [{"place_id": 1, "day": 4}]}, {}),                                  # the trip has 3 days
        ({"busy": [{"day": 1, "start": "18:00", "end": "17:00"}]}, {}),                    # ends before it starts
        ({"busy": [{"day": 5, "start": "18:00", "end": "19:00"}]}, {}),
        ({"must_sees": [{"place_id": 1, "when": "sunset", "at": "17:00"}]}, {}),           # two times
        ({"must_sees": [{"place_id": 1, "at": "5pm"}]}, {}),
        ({}, {"arrive_time": "25:00"}),
    ])
    def test_impossible_requests_are_rejected(self, client, constraints, preference):
        payload = {
            "destination": "Cox's Bazar", "start_date": str(START), "end_date": str(START + timedelta(days=2)),
            "num_travelers": 2, "total_budget": 30000,
            "preference": {"interests": ["Beach"], **preference}, "constraints": constraints,
        }
        assert client.post("/api/v1/trips", json=payload).status_code == 422


@pytest.mark.parametrize("algorithm", PLANNERS)
class TestPlanning:

    def test_day_one_starts_when_you_arrive_and_the_last_day_ends_when_you_leave(self, client, algorithm):
        trip = new_trip(client, arrive="14:00", leave="11:00", generate=algorithm)
        gen = trip["generated"]
        days = gen["itinerary"]
        assert all(t2m(i["start_time"]) >= 14 * 60 for i in days[0]["items"])
        assert not any(i["title"].startswith("Breakfast") for i in days[0]["items"])
        assert activities(days[0]), "the afternoon of day 1 is still planned"
        assert all(t2m(i["end_time"]) <= 11 * 60 for i in days[-1]["items"])
        assert not any(i["title"].startswith(("Lunch", "Dinner")) for i in days[-1]["items"])
        assert gen["valid"] is True, gen["validation"]

    def test_nothing_is_planned_during_a_busy_time(self, client, algorithm):
        trip = new_trip(client, busy=[{"day": 2, "start": "15:00", "end": "21:00", "label": "Wedding"}], generate=algorithm)
        gen = trip["generated"]
        day2 = gen["itinerary"][1]
        for i in day2["items"]:
            assert t2m(i["end_time"]) <= 15 * 60 or t2m(i["start_time"]) >= 21 * 60, i["title"]
        assert not any(i["title"].startswith("Dinner") for i in day2["items"])  # 19:00-20:00 is the wedding
        assert gen["valid"] is True, gen["validation"]

    def test_a_must_see_at_sunset_on_day_one_is_there_at_sunset(self, client, algorithm):
        inani = place_id("Inani Beach")
        trip = new_trip(client, must_sees=[{"place_id": inani, "day": 1, "when": "sunset"}], generate=algorithm)
        gen = trip["generated"]
        stop = next(i for i in gen["itinerary"][0]["items"] if i["place_id"] == inani)
        sunset = sunset_min(*COX, START)
        assert t2m(stop["start_time"]) <= sunset - 15 and t2m(stop["end_time"]) >= sunset
        assert gen["unplaced"] == [] and gen["valid"] is True, gen["validation"]

    def test_a_must_see_with_an_exact_time_starts_then(self, client, algorithm):
        temple = place_id("Ramu Buddhist Temple Complex")
        trip = new_trip(client, must_sees=[{"place_id": temple, "day": 2, "at": "15:00"}], generate=algorithm)
        stop = next(i for i in trip["generated"]["itinerary"][1]["items"] if i["place_id"] == temple)
        assert stop["start_time"] == "15:00"

    def test_a_must_see_that_cant_fit_is_reported_with_the_reason_and_a_time_that_fits(self, client, algorithm):
        hill = place_id("Himchari Hilltop Viewpoint")   # one hour, closes 17:00: before sunset
        trip = new_trip(client, must_sees=[{"place_id": hill, "day": 1, "when": "sunset"}], generate=algorithm)
        gen = trip["generated"]
        assert hill not in [i["place_id"] for d in gen["itinerary"] for i in d["items"]]
        [u] = gen["unplaced"]
        assert u["place_id"] == hill and u["day"] == 1 and u["when"] == "sunset"
        assert u["reason"]["code"] == "closes_before" and u["reason"]["closes"] == "17:00"
        assert u["reason"]["wanted"] == "sunset" and u["reason"]["sunset"] == m2t(sunset_min(*COX, START))
        assert "closes at 17:00, before sunset" in u["message"]
        # the nearest time that fits: the same day, as late as it can be
        assert u["suggestion"] == {"day": 1, "at": "16:00"}


class TestFixingWhatDoesntFit:

    def test_taking_the_suggestion_places_it_and_replans_only_that_day(self, client):
        hill = place_id("Himchari Hilltop Viewpoint")
        trip = new_trip(client, must_sees=[{"place_id": hill, "day": 1, "when": "sunset"}])
        before = itinerary(client, trip["id"])["days"]
        r = client.put(f"/api/v1/trips/{trip['id']}/must-dos",
                       json={"must_sees": [{"place_id": hill, "day": 1, "at": "16:00"}]})
        assert r.status_code == 200, r.text
        out = r.json()
        assert out["replanned_days"] == [1] and out["unplaced"] == []
        assert out["validation"]["valid"] is True, out["validation"]
        after = itinerary(client, trip["id"])["days"]
        stop = next(i for i in after[0]["items"] if i["place_id"] == hill)
        assert stop["start_time"] == "16:00"
        assert [i["id"] for i in after[1]["items"]] == [i["id"] for i in before[1]["items"]]
        assert [i["id"] for i in after[2]["items"]] == [i["id"] for i in before[2]["items"]]

    def test_any_time_instead(self, client):
        hill = place_id("Himchari Hilltop Viewpoint")
        trip = new_trip(client, must_sees=[{"place_id": hill, "day": 1, "when": "sunset"}])
        out = client.put(f"/api/v1/trips/{trip['id']}/must-dos", json={"must_sees": [{"place_id": hill}]}).json()
        assert out["unplaced"] == []
        assert hill in [i["place_id"] for d in itinerary(client, trip["id"])["days"] for i in d["items"]]

    def test_leaving_it_out_changes_nothing_else(self, client):
        hill = place_id("Himchari Hilltop Viewpoint")
        trip = new_trip(client, must_sees=[{"place_id": hill, "day": 1, "when": "sunset"}])
        before = itinerary(client, trip["id"])["days"]
        out = client.put(f"/api/v1/trips/{trip['id']}/must-dos", json={"must_sees": []}).json()
        assert out["replanned_days"] == [] and out["unplaced"] == []
        assert itinerary(client, trip["id"])["days"] == before

    def test_a_new_busy_time_replans_that_day_only(self, client):
        trip = new_trip(client)
        before = itinerary(client, trip["id"])["days"]
        out = client.put(f"/api/v1/trips/{trip['id']}/must-dos",
                         json={"busy": [{"day": 2, "start": "10:00", "end": "13:00", "label": "Meeting"}]}).json()
        assert out["replanned_days"] == [2]
        after = itinerary(client, trip["id"])["days"]
        for i in after[1]["items"]:
            assert t2m(i["end_time"]) <= 10 * 60 or t2m(i["start_time"]) >= 13 * 60, i["title"]
        assert after[0] == before[0] and after[2] == before[2]
        assert out["validation"]["valid"] is True, out["validation"]

    def test_moving_a_must_see_to_another_day(self, client):
        inani = place_id("Inani Beach")
        trip = new_trip(client, must_sees=[{"place_id": inani, "day": 1}])
        out = client.put(f"/api/v1/trips/{trip['id']}/must-dos",
                         json={"must_sees": [{"place_id": inani, "day": 3, "when": "morning"}]}).json()
        assert out["replanned_days"] == [1, 3]
        days = itinerary(client, trip["id"])["days"]
        assert inani not in [i["place_id"] for i in days[0]["items"]]
        stop = next(i for i in days[2]["items"] if i["place_id"] == inani)
        assert t2m(stop["start_time"]) <= 11 * 60 + 30
        assert out["validation"]["valid"] is True, out["validation"]

    def test_a_later_arrival_replans_day_one(self, client):
        trip = new_trip(client)
        out = client.put(f"/api/v1/trips/{trip['id']}/must-dos", json={"arrive_time": "15:00"}).json()
        assert out["replanned_days"] == [1]
        assert all(t2m(i["start_time"]) >= 15 * 60 for i in itinerary(client, trip["id"])["days"][0]["items"])

    def test_skipping_a_planned_place_replaces_it(self, client):
        trip = new_trip(client)
        day = itinerary(client, trip["id"])["days"][0]
        skip = activities(day)[0]["place_id"]
        out = client.put(f"/api/v1/trips/{trip['id']}/must-dos", json={"excluded_places": [skip]}).json()
        assert out["replanned_days"] == [1]
        assert skip not in [i["place_id"] for d in itinerary(client, trip["id"])["days"] for i in d["items"]]

    def test_a_must_see_day_beyond_the_trip_is_rejected_and_nothing_changes(self, client):
        trip = new_trip(client)
        r = client.put(f"/api/v1/trips/{trip['id']}/must-dos", json={"must_sees": [{"place_id": 1, "day": 9}]})
        assert r.status_code == 422
        assert client.get(f"/api/v1/trips/{trip['id']}").json()["constraints"]["must_sees"] == []


class TestEditsKeepTheRules:

    def test_reordering_never_puts_a_stop_in_a_busy_time(self, client):
        trip = new_trip(client, busy=[{"day": 1, "start": "13:00", "end": "15:00"}])
        day = itinerary(client, trip["id"])["days"][0]
        items = ordered(day)
        acts = [i for i in items if i["item_type"] == "activity"]
        ids = [i["id"] for i in items]
        # the first visit goes last: it's re-timed after everything else, never into 13:00-15:00
        ids.remove(acts[0]["id"])
        ids.append(acts[0]["id"])
        out = client.put(f"/api/v1/trips/{trip['id']}/days/{day['id']}/order", json={"item_ids": ids}).json()
        for i in out["day"]["items"]:
            assert t2m(i["end_time"]) <= 13 * 60 or t2m(i["start_time"]) >= 15 * 60, i["title"]
        assert "DURING_BUSY_TIME" not in codes(out["validation"])

    def test_a_timed_must_see_moved_away_from_its_time_is_flagged(self, client):
        inani = place_id("Inani Beach")
        trip = new_trip(client, must_sees=[{"place_id": inani, "day": 1, "when": "sunset"}])
        day = itinerary(client, trip["id"])["days"][0]
        items = ordered(day)
        stop = next(i for i in items if i["place_id"] == inani)
        ids = [stop["id"]] + [i["id"] for i in items if i["id"] != stop["id"]]
        out = client.put(f"/api/v1/trips/{trip['id']}/days/{day['id']}/order", json={"item_ids": ids}).json()
        assert "MUST_SEE_TIME" in codes(out["validation"])

    def test_rebuilding_a_day_keeps_a_timed_must_see_at_its_time(self, client):
        temple = place_id("Ramu Buddhist Temple Complex")
        trip = new_trip(client, must_sees=[{"place_id": temple, "day": 1, "at": "15:00"}])
        day = itinerary(client, trip["id"])["days"][0]
        out = client.post(f"/api/v1/trips/{trip['id']}/days/{day['id']}/regenerate").json()
        stop = next(i for i in out["day"]["items"] if i["place_id"] == temple)
        assert stop["start_time"] == "15:00"
        assert out["validation"]["valid"] is True, out["validation"]


class TestRules:

    def rules(self, **kw) -> TripRules:
        return TripRules(num_days=3, start=9 * 60, end=20 * 60, first_date=START, latlon=COX, **kw)

    def test_windows_follow_arrival_and_leaving(self):
        r = self.rules(arrive=14 * 60, leave=11 * 60)
        assert r.window(1) == (14 * 60, 20 * 60) and r.window(2) == (9 * 60, 20 * 60) and r.window(3) == (9 * 60, 11 * 60)
        assert not r.has_breakfast(1) and r.has_breakfast(3)

    def test_arriving_before_the_usual_start_keeps_the_usual_start(self):
        assert self.rules(arrive=7 * 60).window(1) == (9 * 60, 20 * 60)

    def test_time_of_day_ranges(self):
        r = self.rules()
        assert r.wanted_range(MustSee(1, when="morning"), 60, 1)[1] == 11 * 60 + 30
        assert r.wanted_range(MustSee(1, when="afternoon"), 60, 1) == (12 * 60, 16 * 60 + 30)
        lo, hi = r.wanted_range(MustSee(1, when="sunset"), 120, 1)
        assert hi == r.sunset(1) - 15 and lo + 120 >= r.sunset(1)

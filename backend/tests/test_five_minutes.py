"""
Times in a plan on whole 5 minutes (docs/ui-refresh step 14, D23): 10:40, not 10:39. Both planners, the
meals where you stay, and the edits that re-time a day; a stop that keeps its time isn't moved, no stop
starts before the ride to it ends, and the checks (opening hours, busy times, back late) still pass.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.models.models import ItineraryItem
from app.services.itinerary.editing_service import start_after
from app.services.itinerary.trip_rules import before_five, on_five, on_five_between
from tests.conftest import _ApiTestSession
from tests.test_trip_stays import API, _itinerary, _m, _trip

BOTH = ("heuristic", "cpsat")
AT_STAY = {"Breakfast": "stay", "Lunch": "restaurant", "Dinner": "stay"}
OWN = {"Breakfast": "restaurant", "Lunch": "own", "Dinner": "own", "own_cost_per_person": 150}
# What a plan must never break: the places' hours, overlapping items, the day's hours, back by the end
HARD = ("OUTSIDE_OPENING_HOURS", "TIME_OVERLAP", "BEFORE_PREFERRED_START", "AFTER_PREFERRED_END", "BACK_LATE")


@pytest.fixture
def client():
    return TestClient(app)


def _off_grid(it: dict, keep: tuple = ()) -> list:
    return [(d["day_number"], i["title"], i["start_time"]) for d in it["days"] for i in d["items"]
            if _m(i["start_time"]) % 5 and i["id"] not in keep]


def _rides_fit(it: dict) -> None:
    """No visit starts before the ride from the visit before it ends (a meal in between is on the way)."""
    for d in it["days"]:
        visits = [i for i in sorted(d["items"], key=lambda i: i["order_index"]) if i["item_type"] == "activity"]
        for a, b in zip(visits, visits[1:]):
            assert _m(b["start_time"]) + 0.5 >= _m(a["end_time"]) + a["travel_time_to_next"], (a["title"], b["title"])


def _hard(it: dict) -> list:
    return [v for v in it["validation"]["violations"] if v["code"] in HARD]


def test_the_helpers():
    assert (on_five(639), on_five(640), on_five(641)) == (640, 640, 645)
    assert before_five(644) == 640
    # Up when it still fits, else down, else as it is
    assert on_five_between(1196, 0, 1200) == 1200
    assert on_five_between(1196, 0, 1198) == 1195
    assert on_five_between(1197, 1196, 1198) == 1197
    # Skipping a busy time that ends off the 5 minutes lands on the next mark after it
    assert start_after(9 * 60 + 2, 60, [(9 * 60, 10 * 60 + 2)]) == 10 * 60 + 5


@pytest.mark.parametrize("algorithm", BOTH)
@pytest.mark.parametrize("meals", [None, AT_STAY, OWN])
def test_a_new_plan_has_every_time_on_the_five_minutes(client, algorithm, meals):
    tid = _trip(client, days=3, algorithm=algorithm, **({"meals": meals} if meals else {}))
    it = _itinerary(client, tid)
    assert sum(len(d["items"]) for d in it["days"]) > 6
    assert _off_grid(it) == []
    _rides_fit(it)
    assert _hard(it) == []


def test_a_busy_time_off_the_five_minutes_is_kept_clear(client):
    tid = _trip(client, days=2, constraints={"busy": [{"day": 1, "start": "10:02", "end": "11:17", "label": "Call"}]})
    it = _itinerary(client, tid)
    day1 = it["days"][0]
    for i in day1["items"]:
        assert _m(i["end_time"]) <= 10 * 60 + 2 or _m(i["start_time"]) >= 11 * 60 + 17, i["title"]
    assert _off_grid(it) == []
    assert _hard(it) == []


def test_edits_put_the_moved_stops_on_the_five_minutes_and_a_kept_time_stays(client):
    tid = _trip(client, days=2, constraints={"max_activities_per_day": 5})
    # The day with the most visits
    day = max(_itinerary(client, tid)["days"], key=lambda d: sum(i["item_type"] == "activity" for i in d["items"]))
    items = sorted(day["items"], key=lambda i: i["order_index"])
    visits = [i for i in items if i["item_type"] == "activity"]
    assert len(visits) >= 3

    # An older plan's stop at 10:37 that keeps its time (pinned): edits around it don't move it
    kept = visits[-1]
    with _ApiTestSession() as db:
        row = db.get(ItineraryItem, kept["id"])
        start = _m(row.start_time) + 2
        row.start_time = f"{start // 60:02d}:{start % 60:02d}"
        end = start + row.duration_minutes
        row.end_time = f"{end // 60:02d}:{end % 60:02d}"
        row.pinned = True
        db.commit()
        kept_at = row.start_time

    # Swap the first two visits: the day is re-timed
    ids = [i["id"] for i in items]
    a, b = ids.index(visits[0]["id"]), ids.index(visits[1]["id"])
    ids[a], ids[b] = ids[b], ids[a]
    r = client.put(f"{API}/trips/{tid}/days/{day['id']}/order", json={"item_ids": ids})
    assert r.status_code == 200, r.text
    it = _itinerary(client, tid)
    after = {i["id"]: i for d in it["days"] for i in d["items"]}
    assert after[kept["id"]]["start_time"] == kept_at
    assert _off_grid(it, keep=(kept["id"],)) == []
    _rides_fit(it)

    # A longer stay at the first stop pushes the rest: onto the 5 minutes
    first = sorted(next(d for d in it["days"] if d["id"] == day["id"])["items"], key=lambda i: i["order_index"])[0]
    r = client.patch(f"{API}/trips/{tid}/items/{first['id']}", json={"duration_minutes": first["duration_minutes"] + 17})
    assert r.status_code == 200, r.text
    assert _off_grid(_itinerary(client, tid), keep=(kept["id"],)) == []

    # Running 23 minutes late
    day = next(d for d in _itinerary(client, tid)["days"] if d["id"] == day["id"])
    now = sorted(day["items"], key=lambda i: i["order_index"])[1]["start_time"]
    r = client.post(f"{API}/trips/{tid}/days/{day['id']}/late", json={"now": now, "minutes": 23, "apply": True})
    assert r.status_code == 200, r.text
    assert _off_grid(_itinerary(client, tid), keep=(kept["id"],)) == []


def test_a_new_stop_and_a_changed_ride_land_on_the_five_minutes(client):
    tid = _trip(client, days=2)
    day = _itinerary(client, tid)["days"][0]
    # A place you add, at the end of day 1: it starts after the ride to it, on the 5 minutes
    spare = client.get(f"{API}/trips/{tid}/days/{day['id']}/suggestions").json()["suggestions"]
    assert spare
    r = client.post(f"{API}/trips/{tid}/days/{day['id']}/items", json={"place_id": spare[0]["place"]["id"]})
    assert r.status_code == 201, r.text
    # Walking instead of the planned ride: the stops after it move only if they must, onto the 5 minutes
    visits = [i for i in sorted(_itinerary(client, tid)["days"][0]["items"], key=lambda i: i["order_index"])
              if i["item_type"] == "activity"]
    r = client.patch(f"{API}/trips/{tid}/items/{visits[0]['id']}", json={"travel_mode": "walk"})
    assert r.status_code == 200, r.text
    it = _itinerary(client, tid)
    assert _off_grid(it) == []
    _rides_fit(it)

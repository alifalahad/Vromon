"""
Trip planner step 9: Today mode's "Running late?". Checked: a preview changes
nothing; the first stop not started yet moves by the delay and later ones only
if they must; must-sees and pinned stops never move; what can't fit is dropped
with the reason; applying and undoing puts every time and stop back; bad input
is refused.
"""

from __future__ import annotations

import pytest

from app.services.itinerary.itinerary_service import _time_to_minutes as t2m
from tests.test_phase10_editing import (  # noqa: F401 (fixtures)
    _Session,
    activities,
    assert_day_consistent,
    client,
    create_trip,
    itinerary,
    place_id,
    setup_db,
)


def day1(client, trip_id) -> dict:
    return itinerary(client, trip_id)["days"][0]


def late(client, trip_id, day_id, now, minutes, apply=False, status=200) -> dict:
    r = client.post(f"/api/v1/trips/{trip_id}/days/{day_id}/late", json={"now": now, "minutes": minutes, "apply": apply})
    assert r.status_code == status, r.text
    return r.json()


def times(day: dict) -> dict:
    return {i["id"]: (i["start_time"], i["end_time"]) for i in day["items"]}


class TestRunningLate:

    def test_a_preview_changes_nothing(self, client):
        trip = create_trip(client, days=1)
        day = day1(client, trip["id"])
        out = late(client, trip["id"], day["id"], "09:30", 30)
        assert set(out) == {"moved", "dropped", "kept"}
        assert out["moved"]
        assert times(day1(client, trip["id"])) == times(day)

    def test_the_next_stop_moves_by_the_delay_and_later_ones_only_if_they_must(self, client):
        trip = create_trip(client, days=1)
        day = day1(client, trip["id"])
        items = sorted(day["items"], key=lambda i: i["order_index"])
        first = next(i for i in items if t2m(i["start_time"]) >= t2m("09:30"))
        out = late(client, trip["id"], day["id"], "09:30", 30, apply=True)
        after = {i["id"]: i for i in out["day"]["items"]}
        if first["id"] in after:
            assert t2m(after[first["id"]]["start_time"]) >= t2m(first["start_time"]) + 30
        for m in out["moved"]:
            assert t2m(m["to"]) > t2m(m["from"])
        # nothing that hadn't started moved earlier, and the day still holds together
        for i in items:
            if i["id"] in after and t2m(i["start_time"]) >= t2m("09:30"):
                assert t2m(after[i["id"]]["start_time"]) >= t2m(i["start_time"])
        assert_day_consistent(out["day"])
        assert "undo" in out and out["validation"] is not None

    def test_stops_already_started_stay(self, client):
        trip = create_trip(client, days=1)
        day = day1(client, trip["id"])
        now = "13:00"
        started = {i["id"]: i["start_time"] for i in day["items"] if t2m(i["start_time"]) < t2m(now)}
        out = late(client, trip["id"], day["id"], now, 45, apply=True)
        after = {i["id"]: i["start_time"] for i in out["day"]["items"]}
        assert all(after[k] == v for k, v in started.items())

    def test_pinned_stops_and_must_sees_never_move(self, client):
        trip = create_trip(client, days=1)
        day = day1(client, trip["id"])
        acts = activities(day)
        pinned = acts[-1]
        client.patch(f"/api/v1/trips/{trip['id']}/items/{pinned['id']}", json={"pinned": True})
        out = late(client, trip["id"], day["id"], "09:00", 90, apply=True)
        after = {i["id"]: i for i in out["day"]["items"]}
        assert after[pinned["id"]]["start_time"] == pinned["start_time"]
        assert any(k["item_id"] == pinned["id"] for k in out["kept"])
        assert not any(m["item_id"] == pinned["id"] for m in out["moved"])
        assert_day_consistent(out["day"])

    def test_a_must_see_keeps_its_time(self, client):
        inani = place_id("Inani Beach")
        trip = create_trip(client, days=1, must=(inani,))
        day = day1(client, trip["id"])
        [must] = [a for a in activities(day) if a["place_id"] == inani]
        out = late(client, trip["id"], day["id"], "09:00", 120, apply=True)
        after = {i["id"]: i for i in out["day"]["items"]}
        assert after[must["id"]]["start_time"] == must["start_time"]

    def test_what_cant_fit_is_dropped_with_the_reason(self, client):
        trip = create_trip(client, days=1)
        day = day1(client, trip["id"])
        out = late(client, trip["id"], day["id"], "12:00", 240)
        assert out["dropped"]
        codes = {d["reason"]["code"] for d in out["dropped"]}
        assert codes <= {"day_ends", "closes", "before"}
        applied = late(client, trip["id"], day["id"], "12:00", 240, apply=True)
        ids = {i["id"] for i in applied["day"]["items"]}
        assert not ids & {d["item_id"] for d in out["dropped"]}
        assert_day_consistent(applied["day"])

    def test_undo_puts_every_time_and_stop_back(self, client):
        trip = create_trip(client, days=1)
        day = day1(client, trip["id"])
        before = sorted((i["title"], i["start_time"], i["end_time"]) for i in day["items"])
        out = late(client, trip["id"], day["id"], "12:00", 240, apply=True)
        assert out["dropped"] and out["undo"]["restore"]
        r = client.post(f"/api/v1/trips/{trip['id']}/days/{day['id']}/late/undo", json={"undo": out["undo"]})
        assert r.status_code == 200, r.text
        after = sorted((i["title"], i["start_time"], i["end_time"]) for i in r.json()["day"]["items"])
        assert after == before
        assert_day_consistent(r.json()["day"])

    def test_undo_after_the_day_changed_is_refused(self, client):
        trip = create_trip(client, days=1)
        day = day1(client, trip["id"])
        out = late(client, trip["id"], day["id"], "09:30", 30, apply=True)
        moved_id = int(next(iter(out["undo"]["times"])))
        client.delete(f"/api/v1/trips/{trip['id']}/items/{moved_id}")
        r = client.post(f"/api/v1/trips/{trip['id']}/days/{day['id']}/late/undo", json={"undo": out["undo"]})
        assert r.status_code == 409

    def test_undo_cant_add_a_place_from_elsewhere(self, client):
        trip = create_trip(client, days=1)
        day = day1(client, trip["id"])
        r = client.post(f"/api/v1/trips/{trip['id']}/days/{day['id']}/late/undo",
                        json={"undo": {"times": {}, "restore": [{"kind": "activity", "place_id": 999999, "start": "10:00"}]}})
        assert r.status_code == 422

    @pytest.mark.parametrize("body", [{"now": "25:00", "minutes": 30}, {"now": "10:00", "minutes": 3}, {"now": "10:00", "minutes": 600}])
    def test_bad_input_is_refused(self, client, body):
        trip = create_trip(client, days=1)
        day = day1(client, trip["id"])
        assert client.post(f"/api/v1/trips/{trip['id']}/days/{day['id']}/late", json=body).status_code == 422

    def test_nothing_left_today_means_nothing_moves(self, client):
        trip = create_trip(client, days=1)
        day = day1(client, trip["id"])
        out = late(client, trip["id"], day["id"], "23:00", 30)
        assert out == {"moved": [], "dropped": [], "kept": []}

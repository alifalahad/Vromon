"""
Trip planner step 3: rearranging a plan (reorder, move to another day, change
how long you stay, pin a stop, add a place) and meals respecting restaurant hours.
"""

from __future__ import annotations

import pytest

from app.services.itinerary.itinerary_service import _time_to_minutes
from tests.test_phase10_editing import (  # noqa: F401 (fixtures)
    activities,
    client,
    create_trip,
    itinerary,
    place_id,
    setup_db,
)


def ordered(day: dict) -> list[dict]:
    return sorted(day["items"], key=lambda i: i["order_index"])


def assert_sequential(day: dict):
    items = ordered(day)
    for a, b in zip(items, items[1:]):
        assert _time_to_minutes(a["end_time"]) <= _time_to_minutes(b["start_time"]), (a["title"], b["title"])
    assert day["total_cost"] == pytest.approx(sum(i["cost"] for i in items), abs=0.01)


def no_hours_problems(validation: dict) -> bool:
    return all(v["code"] != "OUTSIDE_OPENING_HOURS" for v in validation["violations"])


class TestReorder:

    def test_reorder_follows_the_new_order_and_keeps_earlier_times(self, client):
        trip = create_trip(client)
        day = itinerary(client, trip["id"])["days"][0]
        items = ordered(day)
        acts = [i for i in items if i["item_type"] == "activity"]
        assert len(acts) >= 2
        a, b = acts[0], acts[1]
        new_ids = [i["id"] for i in items]
        ia, ib = new_ids.index(a["id"]), new_ids.index(b["id"])
        new_ids[ia], new_ids[ib] = new_ids[ib], new_ids[ia]

        r = client.put(f"/api/v1/trips/{trip['id']}/days/{day['id']}/order", json={"item_ids": new_ids})
        assert r.status_code == 200, r.text
        out = r.json()
        assert [i["id"] for i in ordered(out["day"])] == new_ids
        assert_sequential(out["day"])
        # Items before the first change keep their times
        before = {i["id"]: i["start_time"] for i in items[: min(ia, ib)]}
        after = {i["id"]: i["start_time"] for i in out["day"]["items"]}
        assert all(after[k] == v for k, v in before.items())
        assert "validation" in out and out["message"].startswith("Day 1 rearranged")

    def test_order_must_list_every_stop_once(self, client):
        trip = create_trip(client)
        day = itinerary(client, trip["id"])["days"][0]
        ids = [i["id"] for i in day["items"]]
        r = client.put(f"/api/v1/trips/{trip['id']}/days/{day['id']}/order", json={"item_ids": ids[:-1]})
        assert r.status_code == 422
        r = client.put(f"/api/v1/trips/{trip['id']}/days/{day['id']}/order", json={"item_ids": ids + [ids[0]]})
        assert r.status_code == 422

    def test_a_place_never_starts_before_it_opens_and_meals_keep_their_usual_time(self, client):
        trip = create_trip(client)
        day = itinerary(client, trip["id"])["days"][0]
        items = ordered(day)
        lunch = next(i for i in items if i["title"].startswith("Lunch"))
        # Lunch first: it waits until 12:00 instead of starting at breakfast time
        ids = [lunch["id"]] + [i["id"] for i in items if i["id"] != lunch["id"]]
        out = client.put(f"/api/v1/trips/{trip['id']}/days/{day['id']}/order", json={"item_ids": ids}).json()
        first = ordered(out["day"])[0]
        assert first["id"] == lunch["id"] and _time_to_minutes(first["start_time"]) >= 12 * 60
        for i in activities(out["day"]):
            assert _time_to_minutes(i["start_time"]) >= _time_to_minutes(i["place"]["opening_time"])


class TestMove:

    def test_move_to_another_day_retimes_both(self, client):
        trip = create_trip(client, days=2)
        days = itinerary(client, trip["id"])["days"]
        item = activities(days[0])[0]
        r = client.post(f"/api/v1/trips/{trip['id']}/items/{item['id']}/move", json={"day_id": days[1]["id"], "position": 1})
        assert r.status_code == 200, r.text
        out = r.json()
        d1, d2 = out["days"]
        assert item["id"] not in [i["id"] for i in d1["items"]]
        assert ordered(d2)[1]["id"] == item["id"]
        assert_sequential(d1)
        assert_sequential(d2)

    def test_move_to_the_same_day_is_refused(self, client):
        trip = create_trip(client)
        day = itinerary(client, trip["id"])["days"][0]
        item = activities(day)[0]
        r = client.post(f"/api/v1/trips/{trip['id']}/items/{item['id']}/move", json={"day_id": day["id"]})
        assert r.status_code == 422


class TestStayAndPin:

    def test_longer_stay_moves_later_stops_only(self, client):
        trip = create_trip(client)
        day = itinerary(client, trip["id"])["days"][0]
        items = ordered(day)
        act = activities(day)[0]
        idx = [i["id"] for i in items].index(act["id"])
        r = client.patch(f"/api/v1/trips/{trip['id']}/items/{act['id']}", json={"duration_minutes": act["duration_minutes"] + 30})
        assert r.status_code == 200, r.text
        out = {i["id"]: i for i in r.json()["day"]["items"]}
        assert out[act["id"]]["start_time"] == act["start_time"]
        assert out[act["id"]]["duration_minutes"] == act["duration_minutes"] + 30
        for i in items[:idx]:
            assert out[i["id"]]["start_time"] == i["start_time"]
        assert_sequential(r.json()["day"])

    def test_stay_limits(self, client):
        trip = create_trip(client)
        act = activities(itinerary(client, trip["id"])["days"][0])[0]
        assert client.patch(f"/api/v1/trips/{trip['id']}/items/{act['id']}", json={"duration_minutes": 5}).status_code == 422

    def test_pinned_stop_survives_new_ideas_and_relax(self, client):
        trip = create_trip(client)
        day = itinerary(client, trip["id"])["days"][0]
        act = min(activities(day), key=lambda i: i["recommendation_score"])
        r = client.patch(f"/api/v1/trips/{trip['id']}/items/{act['id']}", json={"pinned": True})
        assert r.status_code == 200 and next(i for i in r.json()["day"]["items"] if i["id"] == act["id"])["pinned"] is True

        regen = client.post(f"/api/v1/trips/{trip['id']}/days/{day['id']}/regenerate").json()
        kept = [i for i in regen["day"]["items"] if i["id"] == act["id"]]
        assert kept and kept[0]["start_time"] == act["start_time"] and kept[0]["pinned"]
        # Nothing new overlaps the pinned stop
        p0, p1 = _time_to_minutes(act["start_time"]), _time_to_minutes(act["end_time"])
        for i in regen["day"]["items"]:
            if i["id"] != act["id"]:
                assert _time_to_minutes(i["end_time"]) <= p0 or _time_to_minutes(i["start_time"]) >= p1, i["title"]

        client.post(f"/api/v1/trips/{trip['id']}/adapt", json={"adaptation_type": "relax", "parameters": {}})
        after = itinerary(client, trip["id"])["days"][0]
        assert act["id"] in [i["id"] for i in after["items"]]


class TestAdd:

    def test_suggestions_then_add_at_a_position(self, client):
        trip = create_trip(client)
        day = itinerary(client, trip["id"])["days"][0]
        used = {i["place_id"] for d in itinerary(client, trip["id"])["days"] for i in d["items"] if i["place_id"]}
        near = activities(day)[0]
        sug = client.get(f"/api/v1/trips/{trip['id']}/days/{day['id']}/suggestions", params={"near_item_id": near["id"]}).json()["suggestions"]
        assert sug and all(s["place"]["id"] not in used for s in sug)
        assert all(s["distance_km"] is not None for s in sug)

        pick = sug[0]["place"]
        r = client.post(f"/api/v1/trips/{trip['id']}/days/{day['id']}/items", json={"place_id": pick["id"], "position": 1})
        assert r.status_code == 201, r.text
        items = ordered(r.json()["day"])
        assert items[1]["place_id"] == pick["id"]
        assert "Added by you" in items[1]["recommendation_reasons"]
        assert_sequential(r.json()["day"])

        again = client.post(f"/api/v1/trips/{trip['id']}/days/{day['id']}/items", json={"place_id": pick["id"]})
        assert again.status_code == 409

    def test_search_and_excluded_places(self, client):
        excluded = place_id("Inani Beach")
        trip = create_trip(client, excluded=[excluded])
        day = itinerary(client, trip["id"])["days"][0]
        found = client.get(f"/api/v1/trips/{trip['id']}/days/{day['id']}/suggestions", params={"q": "beach"}).json()["suggestions"]
        assert all("beach" in s["place"]["name"].lower() for s in found)
        assert excluded not in [s["place"]["id"] for s in found]
        r = client.post(f"/api/v1/trips/{trip['id']}/days/{day['id']}/items", json={"place_id": excluded})
        assert r.status_code == 409


class TestMealHours:

    @pytest.mark.parametrize("algorithm", ["heuristic", "cpsat"])
    @pytest.mark.parametrize("interests", [("Beach", "Nature"), ("Food", "Culture"), ("Adventure", "Photography")])
    def test_generated_meals_are_at_open_restaurants(self, client, algorithm, interests):
        trip = create_trip(client, days=3, interests=interests, generate=False)
        gen = client.post(f"/api/v1/trips/{trip['id']}/generate", params={"algorithm": algorithm})
        assert gen.status_code == 200, gen.text
        it = itinerary(client, trip["id"])
        for day in it["days"]:
            for i in day["items"]:
                r = i.get("restaurant")
                if i["item_type"] == "meal" and r:
                    assert _time_to_minutes(r["opening_time"]) <= _time_to_minutes(i["start_time"]), i
                    assert _time_to_minutes(i["end_time"]) <= _time_to_minutes(r["closing_time"]), i
        assert no_hours_problems(it["validation"])

    def test_dinner_moved_to_the_morning_keeps_its_usual_time(self, client):
        trip = create_trip(client)
        day = itinerary(client, trip["id"])["days"][0]
        items = ordered(day)
        dinner = next(i for i in items if i["title"].startswith("Dinner") and i.get("restaurant"))
        # Dinner first thing in the morning: the restaurant isn't open yet
        ids = [dinner["id"]] + [i["id"] for i in items if i["id"] != dinner["id"]]
        out = client.put(f"/api/v1/trips/{trip['id']}/days/{day['id']}/order", json={"item_ids": ids}).json()
        first = ordered(out["day"])[0]
        # Dinner keeps its usual time (19:00 at the earliest), so it moves rather than break the hours
        assert _time_to_minutes(first["start_time"]) >= 19 * 60


def test_validator_flags_a_meal_at_a_closed_restaurant():
    from datetime import date

    from app.models.models import Itinerary, ItineraryItem, Restaurant, Trip
    from app.services.itinerary.constraint_validator import ConstraintValidator

    trip = Trip(id=1, destination="Cox's Bazar", start_date=date(2026, 11, 1), end_date=date(2026, 11, 1))
    beach_garden = Restaurant(name="Beach Garden Restaurant", opening_time="12:00", closing_time="22:00")
    breakfast = ItineraryItem(id=7, item_type="meal", title="Breakfast at Beach Garden Restaurant",
                              start_time="09:00", end_time="10:00", duration_minutes=60, cost=550, order_index=0)
    breakfast.restaurant = beach_garden
    day = Itinerary(day_number=1, day_date=date(2026, 11, 1))
    day.items = [breakfast]
    hits = [v for v in ConstraintValidator().validate(trip, [day]).violations if v.code == "OUTSIDE_OPENING_HOURS"]
    assert len(hits) == 1 and hits[0].item_id == 7 and "12:00-22:00" in hits[0].message


def test_the_morning_is_kept_when_lunch_moves_first_and_back(client):
    trip = create_trip(client)
    day = itinerary(client, trip["id"])["days"][0]
    items = ordered(day)
    first_start = items[0]["start_time"]
    lunch = next(i for i in items if i["title"].startswith("Lunch"))
    original = [i["id"] for i in items]
    moved = [lunch["id"]] + [i for i in original if i != lunch["id"]]
    client.put(f"/api/v1/trips/{trip['id']}/days/{day['id']}/order", json={"item_ids": moved})
    back = client.put(f"/api/v1/trips/{trip['id']}/days/{day['id']}/order", json={"item_ids": original}).json()
    # Undoing puts the first stop back at the start of the day, not at lunch time
    assert ordered(back["day"])[0]["start_time"] == first_start

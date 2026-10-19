"""
Trip planner step 7: the full budget and a weather-aware planner. A fake
Open-Meteo (from step 6) and fake roads (from step 5) stand in for the real
ones (no network). Checked: outdoor stops kept out of rainy hours (and placed
anyway when nothing else fits), must-sees never moved by the weather, sunset
stops for photography, every part of the budget with its range, the warning
levels, and each way to save applied and undone.
"""

from __future__ import annotations

from datetime import date, timedelta

import pytest

from app.core.config import settings
from app.models.models import City, ConditionsCache, Country, Place, RouteCache, Trip
from app.services.conditions import openmeteo
from app.services.conditions import service as conditions_service
from app.services.conditions.service import outdoor_place
from app.services.itinerary.itinerary_service import _time_to_minutes
from app.services.itinerary.trip_rules import sunset_min
from app.services.routing import ROADS
from tests.test_phase10_editing import (  # noqa: F401 (fixtures)
    _Session,
    activities,
    client,
    create_trip,
    itinerary,
    place_id,
    setup_db,
)
from tests.test_trip_planner_step5 import FakeRoads
from tests.test_trip_planner_step6 import START, FakeSky

COX = (21.4272, 92.0058)


@pytest.fixture(autouse=True)
def clean():
    """No road data or forecast kept from another test."""
    s = _Session()
    s.query(RouteCache).delete()
    s.query(ConditionsCache).delete()
    s.commit()
    s.close()
    ROADS.reset()
    yield
    ROADS.reset()


@pytest.fixture
def sky(monkeypatch):
    """Weather planning on, with a fake forecast that covers the test trips (from 1 Nov)."""
    fake = FakeSky()
    monkeypatch.setattr(openmeteo, "forecast", fake.forecast)
    monkeypatch.setattr(openmeteo, "marine", fake.marine)
    monkeypatch.setattr(settings, "weather_planning", True)
    monkeypatch.setattr(conditions_service, "_today", lambda: START - timedelta(days=3))
    return fake


@pytest.fixture
def roads():
    fake = FakeRoads()
    ROADS.reset(provider=fake)
    return fake


def rain(sky: FakeSky, day: date, hours, chance=85, code=61):
    for h in hours:
        sky.weather[(day, h)] = {"rain": chance, "code": code}


def outdoor(a: dict) -> bool:
    s = _Session()
    try:
        return outdoor_place(s.get(Place, a["place_id"]))
    finally:
        s.close()


def overlaps(a: dict, start_h: int, end_h: int) -> bool:
    return _time_to_minutes(a["start_time"]) < end_h * 60 and start_h * 60 < _time_to_minutes(a["end_time"])


@pytest.fixture(params=["heuristic", "cpsat"])
def planner(request) -> str:
    """The quick planner, and the optimiser the app tries first: both follow the weather."""
    return request.param


def make(client, planner, **kw) -> dict:
    trip = create_trip(client, generate=False, **kw)
    r = client.post(f"/api/v1/trips/{trip['id']}/generate", params={"algorithm": planner})
    assert r.status_code == 200, r.text
    return trip


def budget(client, trip_id) -> dict:
    r = client.get(f"/api/v1/trips/{trip_id}/budget")
    assert r.status_code == 200, r.text
    return r.json()


def part(b: dict, key: str) -> dict:
    return next(p for p in b["parts"] if p["key"] == key)


def save(client, trip_id, action) -> dict:
    r = client.post(f"/api/v1/trips/{trip_id}/budget/save", json={"action": action})
    assert r.status_code == 200, r.text
    return r.json()


# ---------------------------------------------------------------------------
# The weather-aware planner
# ---------------------------------------------------------------------------

class TestRainyHours:

    INTERESTS = ("Beach", "Nature", "Culture", "Shopping", "Family")

    def test_outdoor_stops_stay_out_of_a_rainy_morning(self, client, sky, planner):
        rain(sky, START, range(6, 13))
        trip = make(client, planner, days=1, interests=self.INTERESTS)
        acts = activities(itinerary(client, trip["id"])["days"][0])
        assert acts, "the day still has stops"
        assert not [a["title"] for a in acts if outdoor(a) and overlaps(a, 6, 13)]
        indoors = [a for a in acts if "Indoors while rain is likely" in a["recommendation_reasons"]]
        assert indoors and not any(outdoor(a) for a in indoors)
        assert any(outdoor(a) for a in acts if not overlaps(a, 6, 13)), "outdoor stops move to the dry afternoon"

    def test_without_rain_the_morning_is_outdoors_as_before(self, client, sky, planner):
        trip = make(client, planner, days=1, interests=self.INTERESTS)
        acts = activities(itinerary(client, trip["id"])["days"][0])
        assert any(outdoor(a) and overlaps(a, 6, 13) for a in acts)
        assert not any("Indoors while rain is likely" in a["recommendation_reasons"] for a in acts)

    def test_rain_all_day_still_gives_a_day(self, client, sky, planner):
        rain(sky, START, range(0, 24))
        trip = make(client, planner, days=1, interests=("Beach",))
        assert len(activities(itinerary(client, trip["id"])["days"][0])) >= 2

    def test_a_must_see_with_a_time_never_moves_for_the_rain(self, client, sky, planner):
        rain(sky, START, range(6, 13))
        inani = place_id("Inani Beach")
        trip = create_trip(client, days=1, interests=self.INTERESTS, generate=False)
        r = client.put(f"/api/v1/trips/{trip['id']}/must-dos", json={"must_sees": [{"place_id": inani, "day": 1, "when": "morning"}]})
        assert r.status_code == 200, r.text
        client.post(f"/api/v1/trips/{trip['id']}/generate", params={"algorithm": planner})
        [a] = [a for a in activities(itinerary(client, trip["id"])["days"][0]) if a["place_id"] == inani]
        assert _time_to_minutes(a["start_time"]) <= 11 * 60 + 30

    def test_re_planning_a_day_follows_the_rain_too(self, client, sky):
        trip = create_trip(client, days=1, interests=self.INTERESTS)
        day = itinerary(client, trip["id"])["days"][0]
        rain(sky, START, range(6, 13))
        s = _Session()
        s.query(ConditionsCache).delete()       # the new forecast
        s.commit()
        s.close()
        r = client.post(f"/api/v1/trips/{trip['id']}/days/{day['id']}/regenerate")
        assert r.status_code == 200, r.text
        acts = activities(r.json()["day"])
        assert not [a["title"] for a in acts if outdoor(a) and overlaps(a, 6, 13)]

    def test_no_forecast_calls_when_weather_planning_is_off(self, client, monkeypatch):
        fake = FakeSky()
        monkeypatch.setattr(openmeteo, "forecast", fake.forecast)
        create_trip(client, days=1)
        assert fake.forecast_calls == 0

    def test_no_forecast_calls_for_a_trip_beyond_the_forecast(self, client, sky, monkeypatch):
        monkeypatch.setattr(conditions_service, "_today", lambda: START - timedelta(days=40))
        create_trip(client, days=1)
        assert sky.forecast_calls == 0

    def test_the_forecast_being_down_doesnt_stop_planning(self, client, sky):
        sky.down = True
        trip = create_trip(client, days=1)
        assert activities(itinerary(client, trip["id"])["days"][0])


class TestSunsetForPhotos:

    def sunset(self, day_index: int) -> int:
        return sunset_min(COX[0], COX[1], START + timedelta(days=day_index))

    def photo_stops(self, day: dict) -> list[dict]:
        return [a for a in activities(day) if any(r.startswith("Here at sunset") for r in a["recommendation_reasons"])]

    def test_photography_puts_a_view_or_beach_at_sunset_each_day(self, client, planner):
        trip = make(client, planner, days=2, interests=("Photography", "Beach"))
        for i, day in enumerate(itinerary(client, trip["id"])["days"]):
            [stop] = self.photo_stops(day)
            ss = self.sunset(i)
            start, end = _time_to_minutes(stop["start_time"]), _time_to_minutes(stop["end_time"])
            assert start <= ss - 15 and end >= ss, (stop["title"], stop["start_time"], stop["end_time"])
            assert stop["place"]["category"] in ("Beach", "Scenic", "Photography") or "unset" in stop["place"]["best_time"]

    def test_not_without_photography(self, client, planner):
        trip = make(client, planner, days=2, interests=("Beach", "Nature"))
        assert not any(self.photo_stops(d) for d in itinerary(client, trip["id"])["days"])

    def test_a_must_see_at_sunset_takes_the_place(self, client, planner):
        boat = place_id("Sunset Boat Ride")
        trip = create_trip(client, days=1, interests=("Photography",), generate=False)
        client.put(f"/api/v1/trips/{trip['id']}/must-dos", json={"must_sees": [{"place_id": boat, "day": 1, "when": "sunset"}]})
        client.post(f"/api/v1/trips/{trip['id']}/generate", params={"algorithm": planner})
        day = itinerary(client, trip["id"])["days"][0]
        assert not self.photo_stops(day)
        assert any(a["place_id"] == boat for a in activities(day))

    def test_not_when_rain_is_likely_at_sunset(self, client, sky, planner):
        rain(sky, START, range(16, 19))
        trip = make(client, planner, days=2, interests=("Photography", "Beach"))
        d1, d2 = itinerary(client, trip["id"])["days"]
        assert not self.photo_stops(d1)
        assert len(self.photo_stops(d2)) == 1


# ---------------------------------------------------------------------------
# The full budget
# ---------------------------------------------------------------------------

@pytest.fixture
def dhaka():
    s = _Session()
    try:
        if not s.get(Country, "BD"):
            s.add(Country(iso2="BD", name="Bangladesh"))
        if not s.get(City, 1185241):
            s.add(City(geonameid=1185241, country_iso2="BD", name="Dhaka", lat=23.7104, lon=90.40744, population=10356500))
        s.commit()
    finally:
        s.close()
    return 1185241


def trip_from_dhaka(client, mode="bus", travellers=2, budget_bdt=40000, days=3) -> int:
    payload = {
        "destination": "Cox's Bazar", "start_date": "2026-11-01",
        "end_date": str(date(2026, 11, 1) + timedelta(days=days - 1)), "num_travelers": travellers,
        "total_budget": budget_bdt, "preference": {"interests": ["Beach", "Nature"], "accommodation_preference": "Standard"},
        "origin": {"city_geonameid": 1185241}, "transport_mode": mode,
    }
    r = client.post("/api/v1/trips", json=payload)
    assert r.status_code == 201, r.text
    tid = r.json()["id"]
    assert client.post(f"/api/v1/trips/{tid}/generate").status_code == 200
    return tid


def set_budget(trip_id: int, amount: float) -> None:
    s = _Session()
    try:
        s.get(Trip, trip_id).total_budget = amount
        s.commit()
    finally:
        s.close()


class TestBudgetParts:

    def test_every_part_with_its_range(self, client, roads, dhaka):
        tid = trip_from_dhaka(client)
        b = budget(client, tid)
        plan = itinerary(client, tid)
        items = [i for d in plan["days"] for i in d["items"]]

        gt = part(b, "getting_there")
        g = plan["getting_there"]
        assert gt["known"] and gt["estimate"] and gt["amount"] == round(g["fare"] * 2 * 2 / 10) * 10
        assert gt["detail"] == {"mode": "bus", "from": "Dhaka", "to": "Cox's Bazar", "fare_per": "person", "count": 2, "both_ways": True}
        assert gt["low"] < gt["amount"] < gt["high"]

        stay = part(b, "stay")
        assert not stay["estimate"] and stay["low"] == stay["amount"] == stay["high"]
        assert stay["amount"] == b["hotel"]["price_per_night"] * 2 * 1      # 2 nights, 1 room for 2

        food = part(b, "food")
        assert food["amount"] == round(sum(i["cost"] for i in items if i["item_type"] == "meal") * 2 / 10) * 10
        tickets = part(b, "tickets")
        assert tickets["amount"] == round(sum(i["cost"] for i in items if i["item_type"] == "activity") * 2 / 10) * 10
        local = part(b, "local")
        assert local["known"] and local["estimate"] and local["amount"] > 0 and local["detail"]["legs"] > 0

        assert b["total"] == sum(p["amount"] for p in b["parts"])
        assert b["low"] < b["total"] < b["high"]
        assert b["estimated_total"] == b["total"] and b["categories"]["transport"] == local["amount"]
        assert sum(d["amount"] for d in b["by_day"]) == pytest.approx(food["amount"] + tickets["amount"] + local["amount"], abs=10 * len(b["by_day"]) * 3)

    def test_a_car_is_paid_once_for_the_group(self, client, roads, dhaka):
        tid = trip_from_dhaka(client, mode="car", travellers=3)
        gt = part(budget(client, tid), "getting_there")
        assert gt["detail"]["fare_per"] == "vehicle" and gt["detail"]["count"] == 1

    def test_without_a_starting_city_getting_there_is_unknown_not_guessed(self, client):
        trip = create_trip(client, days=2)
        b = budget(client, trip["id"])
        gt = part(b, "getting_there")
        assert gt["known"] is False and gt["amount"] is None
        assert b["total"] == sum(p["amount"] for p in b["parts"] if p["known"])
        assert any("Getting there" in r for r in b["incomplete_reasons"])

    def test_local_travel_counts_the_vehicles(self, client, roads, dhaka):
        two = part(budget(client, trip_from_dhaka(client, travellers=2)), "local")["amount"]
        four = part(budget(client, trip_from_dhaka(client, travellers=4)), "local")["amount"]
        assert two < four           # 4 people need 2 CNGs

    def test_the_meter_warns_before_the_plan_goes_over(self, client, roads, dhaka):
        tid = trip_from_dhaka(client, budget_bdt=1_000_000)
        b = budget(client, tid)
        assert b["status"] == "ok" and b["left"] > 0
        total = b["total"]
        set_budget(tid, round(total / 0.95))
        assert budget(client, tid)["status"] == "close"
        set_budget(tid, total - 100)
        over = budget(client, tid)
        assert over["status"] == "over" and over["left"] == -100


class TestWaysToSave:

    def test_a_cheaper_hotel_applied_and_undone(self, client, roads, dhaka):
        tid = trip_from_dhaka(client)
        b = budget(client, tid)
        s = next(x for x in b["saves"] if x["key"] == "hotel")
        assert s["detail"]["from"] == b["hotel"]["name"] and s["detail"]["to_rating"] >= 3.5
        before = part(b, "stay")["amount"]

        out = save(client, tid, s["action"])
        # the saving is net of the rides from the new hotel
        assert out["budget"]["total"] == pytest.approx(b["total"] - s["saving"], abs=20)
        assert part(out["budget"], "stay")["amount"] < before
        assert itinerary(client, tid)["hotel"]["name"] == s["detail"]["to"]

        back = save(client, tid, out["undo"])
        assert part(back["budget"], "stay")["amount"] == before
        assert itinerary(client, tid)["hotel"]["name"] == s["detail"]["from"]

    def test_skipping_the_priciest_stop_applied_and_undone(self, client, roads, dhaka):
        tid = trip_from_dhaka(client)
        b = budget(client, tid)
        s = next(x for x in b["saves"] if x["key"] == "skip")
        paid = [i for d in itinerary(client, tid)["days"] for i in activities(d)]
        assert s["saving"] == round(max(i["cost"] for i in paid) * 2 / 10) * 10

        out = save(client, tid, s["action"])
        ids = [i["id"] for d in out["days"] for i in d["items"]]
        assert s["detail"]["item_id"] not in ids
        assert part(out["budget"], "tickets")["amount"] == part(b, "tickets")["amount"] - s["saving"]

        back = save(client, tid, out["undo"])
        day = next(d for d in back["days"] if d["day_number"] == s["detail"]["day_number"])
        assert any(i["title"] == s["detail"]["title"] for i in day["items"])
        assert part(back["budget"], "tickets")["amount"] == part(b, "tickets")["amount"]

    def test_must_sees_and_pinned_stops_are_never_offered(self, client, roads, dhaka):
        tid = trip_from_dhaka(client)
        s = next(x for x in budget(client, tid)["saves"] if x["key"] == "skip")
        r = client.patch(f"/api/v1/trips/{tid}/items/{s['detail']['item_id']}", json={"pinned": True})
        assert r.status_code == 200
        again = next((x for x in budget(client, tid)["saves"] if x["key"] == "skip"), None)
        assert again is None or again["detail"]["item_id"] != s["detail"]["item_id"]

    def test_rickshaws_on_short_rides_applied_and_undone(self, client, roads, dhaka):
        tid = trip_from_dhaka(client)
        b = budget(client, tid)
        s = next((x for x in b["saves"] if x["key"] == "rickshaw"), None)
        if s is None:
            pytest.skip("no short CNG ride in this plan")
        assert s["estimate"] and s["detail"]["extra_min"] >= 1
        days_before = itinerary(client, tid)["days"]
        times = {i["id"]: (i["start_time"], i["end_time"]) for d in days_before for i in d["items"]}

        out = save(client, tid, s["action"])
        changed = {i["id"]: i for d in out["days"] for i in d["items"] if str(i["id"]) in s["action"]["modes"]}
        assert changed and all(i["travel_mode"] == "rickshaw" and i["travel_mode_chosen"] for i in changed.values())
        assert part(out["budget"], "local")["amount"] < part(b, "local")["amount"]
        assert not any(x["key"] == "rickshaw" for x in out["budget"]["saves"])

        back = save(client, tid, out["undo"])
        after = {i["id"]: (i["start_time"], i["end_time"]) for d in back["days"] for i in d["items"]}
        assert after == times
        assert all(not i["travel_mode_chosen"] for d in back["days"] for i in d["items"] if str(i["id"]) in s["action"]["modes"])

    def test_a_bad_action_changes_nothing(self, client, roads, dhaka):
        tid = trip_from_dhaka(client)
        before = budget(client, tid)["total"]
        assert client.post(f"/api/v1/trips/{tid}/budget/save", json={"action": {"kind": "skip", "item_id": 999999}}).status_code == 404
        assert client.post(f"/api/v1/trips/{tid}/budget/save", json={"action": {"kind": "nope"}}).status_code == 422
        assert budget(client, tid)["total"] == before

    def test_the_chosen_hotel_is_the_trip_hotel_everywhere(self, client, roads, dhaka):
        tid = trip_from_dhaka(client)
        s = next(x for x in budget(client, tid)["saves"] if x["key"] == "hotel")
        save(client, tid, s["action"])
        client.post(f"/api/v1/trips/{tid}/regenerate")
        assert itinerary(client, tid)["hotel"]["name"] == s["detail"]["to"]
        assert budget(client, tid)["hotel"]["name"] == s["detail"]["to"]


# ---------------------------------------------------------------------------
# The day in a line
# ---------------------------------------------------------------------------

class TestDaySummary:

    def test_parts_of_the_day_in_time_order(self, client):
        trip = create_trip(client, days=2, interests=("Photography", "Beach"))
        for day in itinerary(client, trip["id"])["days"]:
            parts = day["summary"]
            assert 1 <= len(parts) <= 3
            order = ["morning", "afternoon", "sunset", "evening"]
            assert [p["part"] for p in parts] == sorted((p["part"] for p in parts), key=order.index)
            [sunset] = [p for p in parts if p["part"] == "sunset"]       # the photo stop
            assert sunset["place"] in [a["title"] for a in activities(day)]
            cats = {a["place"]["category"].lower() for a in activities(day)}
            assert all(p["what"] in cats for p in parts if "what" in p)

    def test_the_generate_answer_has_it_too(self, client):
        trip = create_trip(client, days=1, generate=False)
        days = client.post(f"/api/v1/trips/{trip['id']}/generate").json()["itinerary"]
        assert days[0]["summary"]

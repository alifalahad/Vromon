"""
Trip planner step 5: real roads and travel times. A fake road service stands in
for OpenRouteService (no network). Checked: road data is asked for once and kept,
plans and edits use it, the straight-line estimate is used when there is none (or
the service fails), choosing how to get to the next stop, road lines for the map,
and getting there from the starting city.
"""

from __future__ import annotations

import math

import pytest

from app.models.models import City, Country, RouteCache
from app.services.routing import ROADS
from app.services.routing import modes as M
from app.services.routing.roads import RoutingUnavailable, haversine_km
from app.services.routing.ors import OrsProvider
from tests.test_phase10_editing import (  # noqa: F401 (fixtures)
    _Session,
    activities,
    client,
    create_trip,
    itinerary,
    setup_db,
)


class FakeRoads:
    """Roads 1.4× longer than the straight line, driven at 24 km/h."""
    name = "fake"

    def __init__(self, fail: bool = False):
        self.matrix_calls = 0
        self.route_calls = 0
        self.fail = fail

    def matrix(self, sources, destinations):
        self.matrix_calls += 1
        if self.fail:
            raise RoutingUnavailable("down")
        km = [[haversine_km(a, b) * 1.4 for b in destinations] for a in sources]
        return km, [[k / 24 * 60 for k in row] for row in km]

    def route(self, points):
        self.route_calls += 1
        if self.fail:
            raise RoutingUnavailable("down")
        coords, way, legs = [], [], []
        for i, p in enumerate(points):
            if i:
                mid = [(points[i - 1][1] + p[1]) / 2 + 0.001, (points[i - 1][0] + p[0]) / 2]
                coords.append(mid)
                km = haversine_km(points[i - 1], p) * 1.4
                legs.append((km, km / 24 * 60))
            way.append(len(coords))
            coords.append([p[1], p[0]])
        return coords, legs, way


@pytest.fixture(autouse=True)
def empty_cache():
    """Every test starts with no road data, in memory or in the database."""
    s = _Session()
    s.query(RouteCache).delete()
    s.commit()
    s.close()
    ROADS.reset()
    yield
    ROADS.reset()


@pytest.fixture
def roads():
    fake = FakeRoads()
    ROADS.reset(provider=fake)
    return fake


def legs(day: dict) -> list[dict]:
    return [i for i in activities(day) if i.get("travel_source")]


class TestWithoutRoadData:

    def test_plans_use_the_straight_line_estimate_and_say_so(self, client):
        ROADS.reset()
        trip = create_trip(client, days=1)
        day = itinerary(client, trip["id"])["days"][0]
        for item in legs(day):
            assert item["travel_source"] == "estimate" and item["travel_mode"] is None and item["travel_fare"] is None
        codes = {v["code"] for v in itinerary(client, trip["id"])["validation"]["violations"]}
        assert "ESTIMATED_TRAVEL_TIME" in codes and "ROAD_TRAVEL_TIME" not in codes


class TestRoadData:

    def test_asked_once_kept_and_used_by_the_plan(self, client, roads):
        trip = create_trip(client, days=2)
        assert roads.matrix_calls == 1
        day = itinerary(client, trip["id"])["days"][0]
        acts = activities(day)
        assert legs(day), "a day with two or more visits has a leg"
        for a in legs(day):
            nxt = acts[acts.index(a) + 1]
            km = haversine_km((a["place"]["latitude"], a["place"]["longitude"]), (nxt["place"]["latitude"], nxt["place"]["longitude"])) * 1.4
            mode = M.default_mode(km)
            assert a["travel_source"] == "road" and a["travel_mode"] == mode
            assert a["distance_to_next"] == pytest.approx(km, abs=0.06)
            assert a["travel_time_to_next"] == pytest.approx(M.minutes(mode, km, km / 24 * 60), abs=0.06)
            assert a["travel_fare"] == M.fare(mode, km)
        codes = {v["code"] for v in itinerary(client, trip["id"])["validation"]["violations"]}
        assert "ROAD_TRAVEL_TIME" in codes and "ESTIMATED_TRAVEL_TIME" not in codes
        # Building again (and another trip at the same place) asks nothing new
        client.post(f"/api/v1/trips/{trip['id']}/regenerate", params={"algorithm": "cpsat"})
        create_trip(client, days=1)
        assert roads.matrix_calls == 1

    def test_kept_in_the_database_across_restarts(self, client, roads):
        create_trip(client, days=1)
        s = _Session()
        try:
            assert s.query(RouteCache).count() > 0
        finally:
            s.close()
        again = FakeRoads()
        ROADS.reset(provider=again)              # memory gone, as after a restart
        create_trip(client, days=1)
        assert again.matrix_calls == 0

    def test_the_optimiser_respects_road_times(self, client, roads):
        trip = create_trip(client, days=2, generate=False)
        r = client.post(f"/api/v1/trips/{trip['id']}/generate", params={"algorithm": "cpsat"})
        assert r.status_code == 200, r.text
        for day in r.json()["itinerary"]:
            acts = sorted(activities(day), key=lambda i: i["start_time"])
            for a, b in zip(acts, acts[1:]):
                end = int(a["end_time"][:2]) * 60 + int(a["end_time"][3:])
                start = int(b["start_time"][:2]) * 60 + int(b["start_time"][3:])
                assert start - end >= math.floor(a["travel_time_to_next"]) - 1, (a["title"], b["title"])
        assert r.json()["valid"] is True


class TestServiceDown:

    def test_falls_back_to_the_estimate_and_doesnt_keep_asking(self, client):
        down = FakeRoads(fail=True)
        ROADS.reset(provider=down)
        try:
            trip = create_trip(client, days=1)
            day = itinerary(client, trip["id"])["days"][0]
            assert all(i["travel_source"] == "estimate" for i in legs(day))
            calls = down.matrix_calls
            itinerary(client, trip["id"])
            assert down.matrix_calls == calls        # waits before asking again
        finally:
            ROADS.reset()


class TestChoosingHowToGo:

    def first_leg(self, client, trip_id):
        day = itinerary(client, trip_id)["days"][0]
        return day, legs(day)[0]

    def test_options_with_time_fare_and_what_moves(self, client, roads):
        trip = create_trip(client, days=1)
        day, leg = self.first_leg(client, trip["id"])
        r = client.get(f"/api/v1/trips/{trip['id']}/items/{leg['id']}/leg")
        assert r.status_code == 200, r.text
        out = r.json()
        modes = [o["mode"] for o in out["options"]]
        assert modes[0] == "walk" and "cng" in modes and "car" in modes
        assert ("rickshaw" in modes) == (out["km"] <= M.RICKSHAW_MAX_KM)
        assert out["source"] == "road" and out["mode"] == leg["travel_mode"] and out["chosen"] is False
        assert sum(o["recommended"] for o in out["options"]) == 1
        walk = out["options"][0]
        assert walk["fare"] == 0 and walk["minutes"] >= max(o["minutes"] for o in out["options"][1:])

    def test_walking_a_long_leg_pushes_later_stops_back_and_never_earlier(self, client, roads):
        trip = create_trip(client, days=1)
        day, leg = self.first_leg(client, trip["id"])
        before = {i["id"]: i["start_time"] for i in day["items"]}
        options = client.get(f"/api/v1/trips/{trip['id']}/items/{leg['id']}/leg").json()
        walk = options["options"][0]
        r = client.patch(f"/api/v1/trips/{trip['id']}/items/{leg['id']}", json={"travel_mode": "walk"})
        assert r.status_code == 200, r.text
        after = {i["id"]: i for i in r.json()["day"]["items"]}
        assert after[leg["id"]]["travel_mode"] == "walk" and after[leg["id"]]["travel_mode_chosen"] is True
        moved = {m["item_id"]: m["minutes_later"] for m in walk["moves"]}
        for iid, start in before.items():
            got = after[iid]["start_time"]
            assert got >= start
            if iid in moved:
                h, m = map(int, start.split(":"))
                new = h * 60 + m + moved[iid]
                assert got == f"{new // 60:02d}:{new % 60:02d}"
            else:
                assert got == start
        # Back to the suggested way: nothing moves earlier again
        r = client.patch(f"/api/v1/trips/{trip['id']}/items/{leg['id']}", json={"travel_mode": None})
        assert r.json()["day"]["items"] and all(
            i["start_time"] == after[i["id"]]["start_time"] for i in r.json()["day"]["items"]
        )

    @pytest.mark.parametrize("algorithm", ["heuristic", "cpsat"])
    def test_the_way_the_plan_was_built_with_moves_nothing(self, client, roads, algorithm):
        trip = create_trip(client, days=2, generate=False)
        assert client.post(f"/api/v1/trips/{trip['id']}/generate", params={"algorithm": algorithm}).status_code == 200
        for day in itinerary(client, trip["id"])["days"]:
            for leg in legs(day):
                out = client.get(f"/api/v1/trips/{trip['id']}/items/{leg['id']}/leg").json()
                current = next(o for o in out["options"] if o["mode"] == out["mode"])
                assert current["moves"] == [], (algorithm, out["from"], out["to"], current)
                assert current["minutes"] == round(leg["travel_time_to_next"])

    def test_no_leg_after_the_last_stop(self, client, roads):
        trip = create_trip(client, days=1)
        last = activities(itinerary(client, trip["id"])["days"][0])[-1]
        assert client.get(f"/api/v1/trips/{trip['id']}/items/{last['id']}/leg").status_code == 422
        assert client.patch(f"/api/v1/trips/{trip['id']}/items/{last['id']}", json={"travel_mode": "car"}).status_code == 422

    def test_an_unknown_mode_is_refused(self, client, roads):
        trip = create_trip(client, days=1)
        _, leg = self.first_leg(client, trip["id"])
        assert client.patch(f"/api/v1/trips/{trip['id']}/items/{leg['id']}", json={"travel_mode": "boat"}).status_code == 422


class TestMapLines:

    def test_road_lines_once_per_day_then_kept(self, client, roads):
        trip = create_trip(client, days=1)
        day = itinerary(client, trip["id"])["days"][0]
        r = client.get(f"/api/v1/trips/{trip['id']}/days/{day['id']}/route")
        assert r.status_code == 200, r.text
        out = r.json()
        assert out["provider"] == "fake" and out["legs"]
        assert all(leg["line"] and len(leg["line"]) >= 3 for leg in out["legs"])
        client.get(f"/api/v1/trips/{trip['id']}/days/{day['id']}/route")
        assert roads.route_calls == 1

    def test_without_road_data_the_lines_are_empty(self, client):
        ROADS.reset()
        trip = create_trip(client, days=1)
        day = itinerary(client, trip["id"])["days"][0]
        out = client.get(f"/api/v1/trips/{trip['id']}/days/{day['id']}/route").json()
        assert out["provider"] is None and all(leg["line"] is None for leg in out["legs"])


class TestGettingThere:

    @pytest.fixture
    def dhaka(self):
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

    def make(self, client, dhaka, mode):
        payload = {
            "destination": "Cox's Bazar", "start_date": "2026-11-01", "end_date": "2026-11-02", "num_travelers": 2,
            "total_budget": 30000, "preference": {"interests": ["Beach"]},
            "origin": {"city_geonameid": dhaka}, "transport_mode": mode,
        }
        r = client.post("/api/v1/trips", json=payload)
        assert r.status_code == 201, r.text
        return r.json()["id"]

    def test_by_bus_uses_the_road(self, client, roads, dhaka):
        tid = self.make(client, dhaka, "bus")
        g = client.get(f"/api/v1/trips/{tid}/itinerary").json()["getting_there"]
        assert g["from"] == "Dhaka" and g["mode"] == "bus" and g["source"] == "road"
        assert g["fare_per"] == "person" and g["fare"] > 0
        assert 300 < g["km"] < 700 and 6 * 60 < g["minutes"] < 30 * 60

    def test_by_plane_is_an_estimate(self, client, roads, dhaka):
        tid = self.make(client, dhaka, "plane")
        g = client.get(f"/api/v1/trips/{tid}/itinerary").json()["getting_there"]
        assert g["mode"] == "plane" and g["source"] == "estimate" and g["minutes"] < 5 * 60

    def test_no_origin_no_getting_there(self, client, roads):
        trip = create_trip(client, days=1)
        assert itinerary(client, trip["id"])["getting_there"] is None


class TestDoubtfulAnswers:

    def test_a_road_far_longer_than_the_straight_line_isnt_believed(self):
        class Detour(FakeRoads):
            def matrix(self, sources, destinations):
                km = [[haversine_km(a, b) * 10 + 5 for b in destinations] for a in sources]
                return km, [[k / 24 * 60 for k in row] for row in km]

        ROADS.reset(provider=Detour())
        s = _Session()
        try:
            a, b = (21.4272, 92.0058), (21.435, 92.007)
            ROADS.prepare(s, [a, b])
            t = ROADS.travel(a, b)
            assert t.source == "estimate" and t.mode is None
            assert t.km == pytest.approx(haversine_km(a, b))
            assert ROADS.lines(s, [a, b]) == [None]          # the map draws the estimate, not the detour
        finally:
            s.close()

    def test_on_foot_you_can_cut_across(self, roads):
        s = _Session()
        try:
            a, b = (21.4272, 92.0058), (21.4290, 92.0060)       # 200 m apart; the fake road is 1.4x
            ROADS.prepare(s, [a, b])
            t = ROADS.travel(a, b)
            assert t.mode == "walk" and t.km == pytest.approx(haversine_km(a, b) * 1.3)
        finally:
            s.close()

    def test_a_point_with_no_road_nearby_doesnt_stop_other_requests(self, monkeypatch):
        class NoRoadHere(FakeRoads):
            def route(self, points):
                self.route_calls += 1
                raise RoutingUnavailable("Could not find routable point", temporary=False)

        fake = NoRoadHere()
        ROADS.reset(provider=fake)
        s = _Session()
        try:
            a, b, c = (21.4272, 92.0058), (21.44, 92.015), (21.45, 92.02)
            ROADS.prepare(s, [a, b, c])
            assert ROADS.lines(s, [a, b]) == [None]
            assert ROADS.available                       # not a reason to stop asking
            ROADS.lines(s, [b, c])
            assert fake.route_calls == 2
        finally:
            s.close()


class TestModes:

    def test_times_and_fares(self):
        assert M.default_mode(0.8) == "walk" and M.default_mode(3) == "cng"
        assert "rickshaw" not in M.offered(9)
        assert M.minutes("walk", 4.5, 10) == pytest.approx(60)
        assert M.minutes("cng", 9, 16) == pytest.approx(20)
        assert M.minutes("rickshaw", 5, 10) == pytest.approx(30)
        assert M.fare("cng", 9) == 290 and M.fare("walk", 9) == 0 and M.fare("car", 9) == 890


class TestOrsAdapter:

    def test_requests_and_answers(self, monkeypatch):
        sent = []

        class Resp:
            def __init__(self, body):
                self.status_code, self._body = 200, body

            def json(self):
                return self._body

        def fake_post(url, headers, json, timeout):
            sent.append((url, headers, json))
            if "matrix" in url:
                return Resp({"distances": [[0, 2.5]], "durations": [[0, 300]]})
            return Resp({"features": [{"geometry": {"coordinates": [[92.0, 21.4], [92.01, 21.41], [92.02, 21.42]]},
                                       "properties": {"segments": [{"distance": 2500, "duration": 300}], "way_points": [0, 2]}}]})

        import app.services.routing.ors as ors
        monkeypatch.setattr(ors.httpx, "post", fake_post)
        p = OrsProvider("KEY", "https://ors.example")
        km, mins = p.matrix([(21.4, 92.0)], [(21.4, 92.0), (21.42, 92.02)])
        assert km == [[0, 2.5]] and mins == [[0, 5.0]]
        url, headers, body = sent[0]
        assert url == "https://ors.example/v2/matrix/driving-car" and headers["Authorization"] == "KEY"
        assert body["locations"][0] == [92.0, 21.4] and body["sources"] == [0] and body["destinations"] == [1, 2]
        coords, leg_stats, way = p.route([(21.4, 92.0), (21.42, 92.02)])
        assert way == [0, 2] and leg_stats == [(2.5, 5.0)] and len(coords) == 3

    def test_an_error_answer_is_unavailable(self, monkeypatch):
        class Resp:
            status_code = 403
            text = "quota"

            def json(self):
                return {"error": "Quota exceeded"}

        import app.services.routing.ors as ors
        monkeypatch.setattr(ors.httpx, "post", lambda *a, **k: Resp())
        with pytest.raises(RoutingUnavailable, match="403"):
            OrsProvider("KEY").matrix([(21.4, 92.0)], [(21.42, 92.02)])

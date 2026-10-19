"""
Trip planner step 6: live conditions and warnings. A fake Open-Meteo stands in
for the real one (no network). Checked: rain and storms on outdoor stops with a
drier day to move to, wind on boats, rough sea, after dark, usual traffic on
legs and near closing times, "Keep", the 30-minute cache, a failed refresh
showing the last copy, and days beyond the forecast.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta

import pytest

from app.models.models import ConditionsCache, ItineraryItem
from app.services.conditions import openmeteo
from app.services.conditions.openmeteo import ConditionsUnavailable
from app.services.conditions.service import _outdoor
from tests.test_phase10_editing import (  # noqa: F401 (fixtures)
    _Session,
    activities,
    client,
    create_trip,
    itinerary,
    setup_db,
)

START = date(2026, 11, 1)


class FakeSky:
    """A forecast for 16 days from START: dry, 30°C, light wind, calm sea, unless told otherwise."""

    def __init__(self):
        self.weather: dict[tuple[date, int], dict] = {}
        self.waves: dict[date, float] = {}
        self.forecast_calls = 0
        self.marine_calls = 0
        self.down = False

    def forecast(self, lat, lon, **_):
        self.forecast_calls += 1
        if self.down:
            raise ConditionsUnavailable("down")
        times, temp, prob, rain, code, gust = [], [], [], [], [], []
        days = [START + timedelta(days=i) for i in range(16)]
        for d in days:
            for h in range(24):
                w = self.weather.get((d, h), {})
                times.append(f"{d.isoformat()}T{h:02d}:00")
                temp.append(w.get("temp", 30))
                prob.append(w.get("rain", 10))
                rain.append(0.0)
                code.append(w.get("code", 1))
                gust.append(w.get("gust", 20))
        return {
            "hourly": {"time": times, "temperature_2m": temp, "precipitation_probability": prob, "precipitation": rain,
                       "weather_code": code, "wind_gusts_10m": gust},
            "daily": {"time": [d.isoformat() for d in days], "sunrise": [f"{d}T05:55" for d in days],
                      "sunset": [f"{d}T17:15" for d in days], "temperature_2m_max": [32] * 16,
                      "temperature_2m_min": [25] * 16, "weather_code": [1] * 16, "precipitation_probability_max": [10] * 16},
        }

    def marine(self, lat, lon, **_):
        self.marine_calls += 1
        if self.down:
            raise ConditionsUnavailable("down")
        days = [START + timedelta(days=i) for i in range(8)]
        times = [f"{d.isoformat()}T{h:02d}:00" for d in days for h in range(24)]
        return {"hourly": {"time": times, "wave_height": [self.waves.get(d, 0.5) for d in days for _ in range(24)]}}


@pytest.fixture
def sky(monkeypatch):
    fake = FakeSky()
    monkeypatch.setattr(openmeteo, "forecast", fake.forecast)
    monkeypatch.setattr(openmeteo, "marine", fake.marine)
    s = _Session()
    s.query(ConditionsCache).delete()
    s.commit()
    s.close()
    return fake


def conditions(client, trip_id, **params) -> dict:
    r = client.get(f"/api/v1/trips/{trip_id}/conditions", params=params)
    assert r.status_code == 200, r.text
    return r.json()


def outdoor_stop(client, trip_id, day_index=0):
    """An outdoor stop of the day, as the service sees it (from the database)."""
    day = itinerary(client, trip_id)["days"][day_index]
    s = _Session()
    try:
        for a in activities(day):
            item = s.get(ItineraryItem, a["id"])
            if _outdoor(item):
                return a
    finally:
        s.close()
    pytest.skip("no outdoor stop on that day")


def hours_of(stop) -> list[int]:
    start, end = int(stop["start_time"][:2]), int(stop["end_time"][:2])
    return list(range(start, end + 1))


class TestWeather:

    def test_days_have_hours_sun_times_and_the_weather_at_each_stop(self, client, sky):
        trip = create_trip(client, days=2)
        out = conditions(client, trip["id"])
        assert out["available"] is True and out["stale"] is False and out["fetched_at"]
        d1 = out["days"][0]
        assert d1["in_forecast"] and d1["sunrise"] == "05:55" and d1["sunset"] == "17:15"
        assert d1["temp_max"] == 32 and d1["temp_min"] == 25
        assert d1["hours"][0]["time"] == "05:00" and d1["hours"][-1]["time"] == "22:00"
        assert all(v["temp"] == 30 for v in d1["items"].values())
        assert d1["warnings"] == []

    def test_rain_on_an_outdoor_stop_with_a_drier_day_to_move_to(self, client, sky):
        trip = create_trip(client, days=2)
        stop = outdoor_stop(client, trip["id"])
        for h in hours_of(stop):
            sky.weather[(START, h)] = {"rain": 80}
        out = conditions(client, trip["id"])
        [w] = [w for w in out["days"][0]["warnings"] if w["item_id"] == stop["id"]]
        assert w["code"] == "rain" and w["chance"] == 80 and w["source"] == "weather"
        assert w["move_to"]["day_number"] == 2

    def test_storms_and_no_dry_day_means_no_move(self, client, sky):
        trip = create_trip(client, days=2)
        stop = outdoor_stop(client, trip["id"])
        for d in (START, START + timedelta(days=1)):
            for h in range(6, 22):
                sky.weather[(d, h)] = {"rain": 90, "code": 95}
        w = next(w for w in conditions(client, trip["id"])["days"][0]["warnings"] if w["item_id"] == stop["id"])
        assert w["code"] == "storm" and w["move_to"] is None

    def test_rough_sea_on_a_beach_day(self, client, sky):
        trip = create_trip(client, days=1, interests=("Beach",))
        sky.waves[START] = 2.1
        d1 = conditions(client, trip["id"])["days"][0]
        if d1["sea"] is None:
            pytest.skip("no beach stop planned")
        assert d1["sea"]["level"] == "rough" and d1["sea"]["wave"] == 2.1
        assert any(w["code"] == "rough_sea" and w["wave"] == 2.1 and w["source"] == "sea" for w in d1["warnings"])


class TestDarkAndTraffic:

    def move(self, item_id: int, start: str, end: str, minutes_to_next: float = 0.0):
        s = _Session()
        try:
            item = s.get(ItineraryItem, item_id)
            item.start_time, item.end_time = start, end
            item.travel_time_to_next = minutes_to_next
            s.commit()
        finally:
            s.close()

    def test_somewhere_wild_after_dark(self, client, sky):
        trip = create_trip(client, days=1)
        stop = activities(itinerary(client, trip["id"])["days"][0])[0]
        # Make it Himchari National Park (remote nature), still there at 18:10
        s = _Session()
        try:
            from app.models.models import Place
            park = s.query(Place).filter(Place.name == "Himchari National Park").one()
            item = s.get(ItineraryItem, stop["id"])
            item.place_id, item.title = park.id, park.name
            s.commit()
        finally:
            s.close()
        self.move(stop["id"], "17:00", "18:10")
        warnings = conditions(client, trip["id"])["days"][0]["warnings"]
        w = next(w for w in warnings if w["code"] == "after_dark")
        assert w["item_id"] == stop["id"] and w["place"] == "Himchari National Park"
        assert w["sunset"] == "17:15" and w["end"] == "18:10" and w["source"] == "sun"

    def test_evening_traffic_on_a_leg_and_near_a_closing_time(self, client, sky):
        trip = create_trip(client, days=1)
        acts = activities(itinerary(client, trip["id"])["days"][0])
        if len(acts) < 2:
            pytest.skip("one stop only")
        a, b = acts[-2], acts[-1]
        self.move(a["id"], "16:00", "17:30", minutes_to_next=30)
        closes = b["place"]["closing_time"]
        h, m = map(int, closes.split(":"))
        end = h * 60 + m - 5                       # ends 5 min before closing: 12 min of usual traffic is too much
        self.move(b["id"], f"{(end - 60) // 60:02d}:{(end - 60) % 60:02d}", f"{end // 60:02d}:{end % 60:02d}")
        d1 = conditions(client, trip["id"])["days"][0]
        assert d1["legs"][str(a["id"])] == {"extra": 12, "from": "17:00", "to": "20:00", "peak": "evening"}
        assert any(w["code"] == "traffic_closing" and w["item_id"] == b["id"] and w["extra"] == 12 for w in d1["warnings"])
        assert next(c for c in d1["checks"] if c["code"] == "traffic") == {"code": "traffic", "ok": False, "peaks": ["evening"]}


    def test_a_town_beach_after_sunset_isnt_wild(self, client, sky):
        trip = create_trip(client, days=1, interests=("Beach",))
        day = itinerary(client, trip["id"])["days"][0]
        beach = next((a for a in activities(day) if "beach" in a["title"].lower()), None)
        if beach is None:
            pytest.skip("no beach stop planned")
        self.move(beach["id"], "17:30", "18:45")
        warnings = conditions(client, trip["id"])["days"][0]["warnings"]
        assert not any(w["code"] == "after_dark" and w["item_id"] == beach["id"] for w in warnings)


class TestKeep:

    def test_keep_marks_the_warning_kept_and_can_be_undone(self, client, sky):
        trip = create_trip(client, days=2)
        stop = outdoor_stop(client, trip["id"])
        for h in hours_of(stop):
            sky.weather[(START, h)] = {"rain": 80}
        r = client.post(f"/api/v1/trips/{trip['id']}/items/{stop['id']}/keep", json={"code": "rain"})
        assert r.status_code == 200 and r.json()["kept_warnings"] == ["rain"]
        w = next(w for w in conditions(client, trip["id"])["days"][0]["warnings"] if w["item_id"] == stop["id"])
        assert w["kept"] is True
        client.post(f"/api/v1/trips/{trip['id']}/items/{stop['id']}/keep", json={"code": "rain", "kept": False})
        w = next(w for w in conditions(client, trip["id"])["days"][0]["warnings"] if w["item_id"] == stop["id"])
        assert w["kept"] is False

    def test_an_unknown_warning_is_refused(self, client, sky):
        trip = create_trip(client, days=1)
        stop = activities(itinerary(client, trip["id"])["days"][0])[0]
        assert client.post(f"/api/v1/trips/{trip['id']}/items/{stop['id']}/keep", json={"code": "zombies"}).status_code == 422


class TestFetching:

    def test_kept_for_30_minutes_and_refresh_waits_2(self, client, sky):
        trip = create_trip(client, days=1)
        conditions(client, trip["id"])
        conditions(client, trip["id"])
        conditions(client, trip["id"], refresh=True)
        assert sky.forecast_calls == 1
        s = _Session()
        try:
            for row in s.query(ConditionsCache):
                row.fetched_at = datetime.utcnow() - timedelta(minutes=3)
            s.commit()
        finally:
            s.close()
        conditions(client, trip["id"])                  # still within 30 minutes
        assert sky.forecast_calls == 1
        conditions(client, trip["id"], refresh=True)    # asked to refresh, over 2 minutes old
        assert sky.forecast_calls == 2

    def test_a_failed_refresh_shows_the_last_copy_as_stale(self, client, sky):
        trip = create_trip(client, days=1)
        first = conditions(client, trip["id"])
        s = _Session()
        try:
            for row in s.query(ConditionsCache):
                row.fetched_at = datetime.utcnow() - timedelta(hours=1)
            s.commit()
        finally:
            s.close()
        sky.down = True
        out = conditions(client, trip["id"])
        assert out["available"] is True and out["stale"] is True
        assert out["days"][0]["hours"] == first["days"][0]["hours"]

    def test_never_fetched_and_down(self, client, sky):
        sky.down = True
        trip = create_trip(client, days=1)
        out = conditions(client, trip["id"])
        assert out["available"] is False and out["stale"] is True
        d1 = out["days"][0]
        assert d1["in_forecast"] is False and d1["hours"] == [] and d1["warnings"] == []
        assert d1["sunrise"] and d1["sunset"]            # computed, not forecast

    def test_days_beyond_the_forecast(self, client, sky, monkeypatch):
        trip = create_trip(client, days=1)
        monkeypatch.setattr(sky, "forecast", lambda lat, lon: {"hourly": {}, "daily": {}})
        monkeypatch.setattr(openmeteo, "forecast", sky.forecast)
        out = conditions(client, trip["id"])
        assert out["days"][0]["in_forecast"] is False and out["forecast_until"] is None

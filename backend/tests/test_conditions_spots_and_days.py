"""
Conditions where each stop is, and each day as past, today or coming (docs/ui-refresh step 17).

Open-Meteo's own answers are saved in tests/fixtures/openmeteo (fetched on 2026-11-19 at 13:15,
Dhaka time, for the town of Cox's Bazar (21.4, 92.0) and Teknaf (20.9, 92.3), with 7 days
before it): one request for both spots, and one for the town alone. No network: the tests hand
those answers back in place of the service, changing an hour where a test needs rain.
Checked: two spots with different rain; one request for both; a trip under way with a finished
day; a trip that ended; "now" on a trip day only; a day beyond the forecast; a trip older than
the service keeps; a failed refresh keeping the last copy, stale; at most 8 spots.
"""

from __future__ import annotations

import copy
import json
from datetime import date, datetime, timedelta
from pathlib import Path

import pytest

from app.models.models import ConditionsCache, ItineraryItem, Place
from app.services.conditions import openmeteo
from app.services.conditions import service as conditions_service
from app.services.conditions.openmeteo import ConditionsUnavailable
from app.services.conditions.service import MAX_SPOTS, pick_spots
from tests.test_phase10_editing import _Session, activities, client, itinerary, setup_db  # noqa: F401 (fixtures)

SAVED = Path(__file__).parent / "fixtures" / "openmeteo"
CAPTURED = date(2026, 11, 19)
TOWN, TEKNAF = (21.4, 92.0), (20.9, 92.3)


class SavedSky:
    """Open-Meteo's saved answers, per spot asked for: the town's, Teknaf's, or the town's for any other spot."""

    def __init__(self):
        two = json.loads((SAVED / "two_spots.json").read_text())
        self.by_spot = {TOWN: two[0], TEKNAF: two[1]}
        self.other = json.loads((SAVED / "one_spot.json").read_text())
        self.asked: list[dict] = []
        self.down = False

    def get(self, url, params, timeout):
        if "marine" in url:
            raise ConditionsUnavailable("no sea in these tests")
        self.asked.append(params)
        if self.down:
            raise ConditionsUnavailable("down")
        spots = list(zip(str(params["latitude"]).split(","), str(params["longitude"]).split(",")))
        out = [copy.deepcopy(self.by_spot.get((float(la), float(lo)), self.other)) for la, lo in spots]
        return out if len(out) > 1 else out[0]

    def set_hours(self, spot, day: date, hours, rain: int, code: int):
        """That spot's chance of rain and weather code for those hours of the day."""
        hourly = self.by_spot[spot]["hourly"]
        for h in hours:
            i = hourly["time"].index(f"{day.isoformat()}T{h:02d}:00")
            hourly["precipitation_probability"][i] = rain
            hourly["weather_code"][i] = code

    def daily(self, spot, day: date, field: str):
        d = self.by_spot[spot]["daily"]
        return d[field][d["time"].index(day.isoformat())]

    def set_daily(self, spot, day: date, **values):
        d = self.by_spot[spot]["daily"]
        for field, value in values.items():
            d[field][d["time"].index(day.isoformat())] = value

    @property
    def forecasts(self) -> list[dict]:
        return [p for p in self.asked if "hourly" in p]


@pytest.fixture
def saved(monkeypatch):
    fake = SavedSky()
    monkeypatch.setattr(openmeteo, "_get", fake.get)
    monkeypatch.setattr(conditions_service, "_today", lambda: CAPTURED)
    s = _Session()
    s.query(ConditionsCache).delete()
    s.commit()
    s.close()
    return fake


def make_trip(client, start: date, days: int) -> dict:
    payload = {
        "destination": "Cox's Bazar",
        "start_date": str(start),
        "end_date": str(start + timedelta(days=days - 1)),
        "num_travelers": 2,
        "total_budget": 30000,
        "preference": {"interests": ["Beach", "Nature"], "travel_style": "Balanced",
                       "preferred_start_time": "09:00", "preferred_end_time": "20:00"},
        "constraints": {"max_activities_per_day": 3},
    }
    r = client.post("/api/v1/trips", json=payload)
    assert r.status_code == 201, r.text
    trip = r.json()
    assert client.post(f"/api/v1/trips/{trip['id']}/generate").status_code == 200
    return trip


def place_stops(client, trip_id: int, stops: list[tuple[str, str, str]], day_index: int = 0) -> list[int]:
    """The day's activities become these places at these times, in order; any others go to the town's beach."""
    acts = activities(itinerary(client, trip_id)["days"][day_index])
    s = _Session()
    try:
        ids = []
        for i, a in enumerate(acts):
            name, start, end = stops[i] if i < len(stops) else ("Kolatoli Beach", a["start_time"], a["end_time"])
            place = s.query(Place).filter(Place.name == name).one()
            item = s.get(ItineraryItem, a["id"])
            item.place_id, item.title, item.start_time, item.end_time = place.id, place.name, start, end
            ids.append(item.id)
        s.commit()
        return ids
    finally:
        s.close()


def conditions(client, trip_id: int, **params) -> dict:
    r = client.get(f"/api/v1/trips/{trip_id}/conditions", params=params)
    assert r.status_code == 200, r.text
    return r.json()


class TestWhereTheStopIs:

    def test_two_spots_with_different_rain(self, client, saved):
        day = CAPTURED + timedelta(days=1)
        trip = make_trip(client, day, 1)
        teknaf, beach = place_stops(client, trip["id"], [("Teknaf Wildlife Sanctuary", "14:00", "16:00"), ("Laboni Beach", "09:00", "11:00")])
        saved.set_hours(TEKNAF, day, range(13, 17), rain=85, code=61)
        saved.set_hours(TOWN, day, range(8, 17), rain=5, code=1)
        d1 = conditions(client, trip["id"])["days"][0]
        # Teknaf's stop has Teknaf's rain; the town's beach, the town's dry sky
        [w] = [w for w in d1["warnings"] if w["item_id"] == teknaf]
        assert w["code"] == "rain" and w["chance"] == 85 and (w["from"], w["to"]) == ("14:00", "16:00")
        assert not [w for w in d1["warnings"] if w["item_id"] == beach]
        assert d1["items"][str(teknaf)]["rain"] == 85 and d1["items"][str(beach)]["rain"] == 5
        # Both spots in one request, the one with more stops first
        [asked] = saved.forecasts
        assert (asked["latitude"], asked["longitude"]) == ("21.4,20.9", "92,92.3")
        assert "temperature_2m" in asked["current"] and asked["past_days"] == 0

    def test_the_days_summary_comes_from_its_first_place(self, client, saved):
        day = CAPTURED + timedelta(days=1)
        trip = make_trip(client, day, 1)
        place_stops(client, trip["id"], [("Teknaf Wildlife Sanctuary", "08:00", "10:00"), ("Laboni Beach", "11:00", "12:00")])
        s = _Session()
        try:
            # Meals without a restaurant (where they are isn't known): Teknaf is the day's first place
            day_id = itinerary(client, trip["id"])["days"][0]["id"]
            for item in s.query(ItineraryItem).filter(ItineraryItem.itinerary_id == day_id, ItineraryItem.item_type != "activity"):
                item.restaurant_id = None
            s.commit()
        finally:
            s.close()
        # The saved highs that day are close (29.5° and 29.7°): Teknaf's is made plainly its own
        saved.set_daily(TEKNAF, day, temperature_2m_max=33.4, weather_code=61)
        saved.set_daily(TOWN, day, temperature_2m_max=29.5, weather_code=1)
        d1 = conditions(client, trip["id"])["days"][0]
        assert (d1["temp_max"], d1["code"]) == (33, 61)
        # The day's hours are Teknaf's too
        hourly = saved.by_spot[TEKNAF]["hourly"]
        assert d1["hours"][0]["temp"] == round(hourly["temperature_2m"][hourly["time"].index(f"{day.isoformat()}T05:00")])

    def test_at_most_eight_spots_the_rest_use_the_nearest(self):
        seen = [(21.0 + i / 10, 92.0) for i in range(10) for _ in range(10 - i)]   # 10 spots, fewer stops each
        fetched, use = pick_spots(seen)
        assert len(fetched) == MAX_SPOTS and fetched[0] == (21.0, 92.0)
        assert use[(21.8, 92.0)] == (21.7, 92.0) and use[(21.9, 92.0)] == (21.7, 92.0)
        assert all(use[s] == s for s in fetched)


class TestPastTodayComing:

    def test_a_trip_under_way_with_a_finished_day(self, client, saved):
        trip = make_trip(client, CAPTURED - timedelta(days=1), 3)
        out = conditions(client, trip["id"])
        d1, d2, d3 = out["days"]
        assert [d["when"] for d in out["days"]] == ["past", "today", "coming"]
        # Yesterday as it was: the rain that fell, no warnings, nothing checked
        assert d1["in_forecast"] and d1["recorded"] is True
        yesterday = CAPTURED - timedelta(days=1)
        assert d1["date"] == yesterday.isoformat()
        assert d1["rain_mm"] == saved.daily(TOWN, yesterday, "precipitation_sum")
        assert d1["temp_max"] == round(saved.daily(TOWN, yesterday, "temperature_2m_max"))
        assert d1["warnings"] == [] and d1["checks"] == [] and d1["hours"] == [] and d1["items"] == {}
        # Today: the weather now, from the spot's current conditions
        assert out["now"] == {"time": "13:15", "temp": 26, "code": 3}
        assert d2["in_forecast"] and d2["hours"] and d2["checks"]
        assert d3["in_forecast"] and d3["opens_on"] is None
        # Started yesterday: the days before today asked for too
        assert saved.forecasts[0]["past_days"] == 7

    def test_a_trip_that_ended(self, client, saved):
        trip = make_trip(client, CAPTURED - timedelta(days=6), 2)
        out = conditions(client, trip["id"])
        assert [d["when"] for d in out["days"]] == ["past", "past"]
        assert all(d["recorded"] and d["warnings"] == [] and d["code"] is not None for d in out["days"])
        assert out["now"] is None

    def test_now_only_when_a_day_is_today(self, client, saved):
        trip = make_trip(client, CAPTURED + timedelta(days=3), 2)
        out = conditions(client, trip["id"])
        assert out["now"] is None and [d["when"] for d in out["days"]] == ["coming", "coming"]
        assert saved.forecasts[0]["past_days"] == 0

    def test_a_day_beyond_the_forecast_says_when_it_opens(self, client, saved):
        start = CAPTURED + timedelta(days=21)
        trip = make_trip(client, start, 1)
        d1 = conditions(client, trip["id"])["days"][0]
        assert d1["in_forecast"] is False and d1["when"] == "coming"
        assert d1["opens_on"] == (start - timedelta(days=openmeteo.FORECAST_DAYS - 1)).isoformat()
        assert d1["sunrise"] and d1["sunset"]                       # computed from the date

    def test_a_trip_older_than_the_service_keeps(self, client, saved):
        trip = make_trip(client, CAPTURED - timedelta(days=140), 1)
        out = conditions(client, trip["id"])
        d1 = out["days"][0]
        assert d1["when"] == "past" and d1["in_forecast"] is False and d1["recorded"] is False
        assert saved.forecasts == [] and out["available"] is False and out["stale"] is False

    def test_the_phones_date_within_a_day(self, client, saved):
        trip = make_trip(client, CAPTURED + timedelta(days=1), 1)
        # The phone is already on the trip's day (just past midnight there): it's today
        assert conditions(client, trip["id"], today=str(CAPTURED + timedelta(days=1)))["days"][0]["when"] == "today"
        # A phone a week off isn't believed
        assert conditions(client, trip["id"], today=str(CAPTURED + timedelta(days=7)))["days"][0]["when"] == "coming"


class TestKeptCopies:

    def test_a_failed_refresh_keeps_the_last_copy_and_stays_stale(self, client, saved):
        trip = make_trip(client, CAPTURED + timedelta(days=1), 1)
        first = conditions(client, trip["id"])
        assert first["available"] and not first["stale"]
        s = _Session()
        try:
            for row in s.query(ConditionsCache):
                row.fetched_at = datetime.utcnow() - timedelta(hours=1)
            s.commit()
        finally:
            s.close()
        saved.down = True
        for _ in range(2):                                          # and again: still the last copy
            out = conditions(client, trip["id"], refresh=True)
            assert out["available"] is True and out["stale"] is True
            assert out["days"][0]["hours"] == first["days"][0]["hours"]
        assert len(saved.forecasts) == 3

    def test_a_spots_copy_serves_the_next_request(self, client, saved):
        trip = make_trip(client, CAPTURED + timedelta(days=1), 1)
        conditions(client, trip["id"])
        conditions(client, trip["id"])
        assert len(saved.forecasts) == 1

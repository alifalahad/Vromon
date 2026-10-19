"""
Trip planner step 10: more destinations, imported from Wikivoyage and Wikidata.
Checked: reading listings, hours and prices only when stated; categories; the
same sight from two sources merged; loading (unknowns marked, unchanged files
skipped, removed places hidden, not deleted); and a whole trip to an imported
destination: both planners, honest prices and ratings, and the budget.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.db.destinations import DATA_DIR, load_destinations
from app.models.models import Destination, Place
from app.services.destinations.importer import (
    category_for, clean_description, listings, parse_hours, parse_price, same_place,
)
from tests.test_phase10_editing import _Session, activities, client, itinerary, setup_db  # noqa: F401 (fixtures)


class TestReading:

    @pytest.mark.parametrize("text,expected", [
        ("9AM-5PM", ("09:00", "17:00")),
        ("Sa-Th 10:00-17:00", ("10:00", "17:00")),
        ("10 am to 6 pm", ("10:00", "18:00")),
        ("9-5pm", ("09:00", "17:00")),
        ("Open 24 hours", ("00:00", "23:59")),
        ("sunrise to sunset", None),
        ("10:00-13:00, 15:00-18:00", None),     # two different ranges: not guessed
        ("", None),
    ])
    def test_hours_only_when_plainly_stated(self, text, expected):
        assert parse_hours(text) == expected

    @pytest.mark.parametrize("text,expected", [
        ("Tk 20 (foreigners Tk 500)", (20.0, None)),
        ("BDT 1,500-3,000", (1500.0, 3000.0)),
        ("300 Tk", (300.0, None)),
        ("Free", (0.0, None)),
        ("cheap", None),
        ("US$5", None),                          # not in taka: unknown, never converted by guess
        (None, None),
    ])
    def test_prices_only_in_taka(self, text, expected):
        assert parse_price(text) == expected

    def test_listings_by_section(self):
        text = """==Get in==
{{listing | name=Green Line | lat=24.8 | long=91.8 | price=BDT 1,500}}
==See==
===Museums===
{{listing | name=Osmani Museum | lat=24.89 | long=91.86 | hours=10AM-5PM | price=Tk 20 | content=A [[museum]] of '''war''' items.}}
{{see | name=Lake | lat=24.9 | long=91.9}}
==Sleep==
{{sleep | name=Hotel X | price=Tk 2,500-4,000}}"""
        got = [(x["kind"], x["name"]) for x in listings(text)]
        assert got == [("see", "Osmani Museum"), ("see", "Lake"), ("sleep", "Hotel X")]   # the bus company is left out
        assert listings(text)[0]["content"] == "A museum of war items."

    def test_categories_name_first(self):
        assert category_for("Shah Jalal Dargah", "a tomb by the river") == "Culture"
        assert category_for("Ali Amjad's Clock", "by the Surma river") == "History"
        assert category_for("Somewhere", "", wikidata_types=("Q46169",)) == "Nature"
        assert category_for("Boat trip", "", kind="do") == "Adventure"
        assert clean_description("Lake in Bangladesh - Geonames ID = 1191424") == "Lake in Bangladesh"

    def test_the_same_sight_from_two_sources(self):
        a = {"name": "Mazar Khan Jahan Ali", "latitude": 22.6580, "longitude": 89.7920}
        b = {"name": "Mausoleum of Khan Jahan Ali", "latitude": 22.6585, "longitude": 89.7922}
        far = {**b, "latitude": 22.70}
        assert same_place(a, b) and not same_place(a, far)
        assert same_place({"name": "X", "wikidata": "Q1", "latitude": 0, "longitude": 0},
                          {"name": "Y", "wikidata": "Q1", "latitude": 1, "longitude": 1})


def _file(tmp: Path, places: list[dict], name="Testpur") -> Path:
    data = {
        "destination": {"name": name, "country": "Bangladesh", "latitude": 24.0, "longitude": 90.0, "description": "A test town."},
        "attribution": "From tests", "sources": [{"name": "Wikivoyage", "license": "CC BY-SA 4.0"}], "checked": False,
        "places": places, "restaurants": [], "hotels": [
            {"ref": "wv:t:sleep:h", "name": "Hotel Unknown", "latitude": 24.0, "longitude": 90.0, "price_per_night": None, "category": None},
        ],
    }
    path = tmp / "testpur.json"
    path.write_text(json.dumps(data))
    return path


def _place(ref, name, cost=None, hours=None) -> dict:
    return {"ref": ref, "name": name, "category": "Culture", "latitude": 24.001, "longitude": 90.001, "description": None,
            "estimated_cost": cost, "opening_time": hours[0] if hours else None, "closing_time": hours[1] if hours else None,
            "average_visit_duration": 1.0, "tags": ["Culture"], "source": "wikivoyage", "url": None}


class TestLoading:

    def test_unknowns_are_marked_and_a_second_load_is_skipped(self, tmp_path):
        _file(tmp_path, [_place("wv:t:see:a", "Old Museum", cost=20, hours=("10:00", "17:00")), _place("wv:t:see:b", "Old Mosque")])
        s = _Session()
        try:
            assert load_destinations(s, tmp_path) == {"Testpur": "loaded"}
            known, unknown = (s.query(Place).filter(Place.source_ref == r).one() for r in ("wv:t:see:a", "wv:t:see:b"))
            assert (known.cost_known, known.estimated_cost, known.hours_known, known.opening_time) == (True, 20.0, True, "10:00")
            assert (unknown.cost_known, unknown.estimated_cost, unknown.hours_known, unknown.opening_time) == (False, 0.0, False, "09:00")
            assert not unknown.rating_known and not unknown.checked
            dest = s.query(Destination).filter(Destination.name == "Testpur").one()
            assert dest.checked is False and dest.attribution == "From tests" and dest.sources[0]["name"] == "Wikivoyage"
            assert load_destinations(s, tmp_path) == {"Testpur": "unchanged"}
        finally:
            s.close()

    def test_a_place_gone_from_the_file_is_hidden_not_deleted(self, tmp_path):
        s = _Session()
        try:
            _file(tmp_path, [_place("wv:t:see:a", "Old Museum"), _place("wv:t:see:b", "Old Mosque")])
            load_destinations(s, tmp_path)
            _file(tmp_path, [_place("wv:t:see:a", "Old Museum (renamed)")])
            assert load_destinations(s, tmp_path) == {"Testpur": "loaded"}
            a = s.query(Place).filter(Place.source_ref == "wv:t:see:a").one()
            b = s.query(Place).filter(Place.source_ref == "wv:t:see:b").one()
            assert a.name == "Old Museum (renamed)" and a.is_active
            assert b.is_active is False
        finally:
            s.close()

    def test_every_shipped_file_loads(self):
        files = sorted(p.name for p in DATA_DIR.glob("*.json") if p.name != "sources.json")
        assert len(files) == 10
        s = _Session()
        try:
            names = {d.name for d in s.query(Destination).filter(Destination.checked == False)}  # noqa: E712
            assert {"Dhaka", "Khulna", "Tangail", "Sylhet"} <= names
        finally:
            s.close()


def plan(client, destination="Sylhet", algorithm="heuristic", interests=("Nature", "Culture")) -> dict:
    r = client.post("/api/v1/trips", json={
        "destination": destination, "start_date": "2026-11-01", "end_date": "2026-11-02", "num_travelers": 2,
        "total_budget": 20000, "preference": {"interests": list(interests)},
    })
    assert r.status_code == 201, r.text
    tid = r.json()["id"]
    g = client.post(f"/api/v1/trips/{tid}/generate", params={"algorithm": algorithm})
    assert g.status_code == 200, g.text
    return {"id": tid, **itinerary(client, tid)}


class TestAnImportedDestination:

    def test_listed_with_its_sources_and_not_checked(self, client):
        out = {d["name"]: d for d in client.get("/api/v1/destinations").json()}
        assert {"Cox's Bazar", "Dhaka", "Khulna", "Tangail", "Sylhet"} <= set(out)
        assert out["Cox's Bazar"]["checked"] is True
        assert out["Sylhet"]["checked"] is False
        assert "Wikivoyage" in out["Sylhet"]["attribution"] and out["Sylhet"]["place_count"] >= 5

    @pytest.mark.parametrize("algorithm", ["heuristic", "cpsat"])
    def test_both_planners_plan_it(self, client, algorithm):
        trip = plan(client, algorithm=algorithm)
        acts = [a for d in trip["days"] for a in activities(d)]
        assert len(acts) >= 3
        assert all(a["place"]["destination_name"] == "Sylhet" for a in acts)

    def test_no_made_up_ratings_or_prices(self, client):
        trip = plan(client)
        for a in (a for d in trip["days"] for a in activities(d)):
            reasons = " ".join(a["recommendation_reasons"])
            assert "rating" not in reasons.lower()
            if not a["place"]["cost_known"]:
                assert a["cost_source"] == "placeholder"                  # shown as "Price unknown"
                assert "budget" not in reasons.lower() and "priced" not in reasons.lower()
            if not a["place"]["hours_known"]:
                assert (a["place"]["opening_time"], a["place"]["closing_time"]) == ("09:00", "17:00")

    def test_the_budget_says_what_it_doesnt_know(self, client):
        trip = plan(client)
        b = client.get(f"/api/v1/trips/{trip['id']}/budget").json()
        tickets = next(p for p in b["parts"] if p["key"] == "tickets")
        unknown = sum(1 for d in trip["days"] for a in activities(d) if not a["place"]["cost_known"])
        assert tickets["detail"]["unknown"] == unknown and unknown > 0
        stay = next(p for p in b["parts"] if p["key"] == "stay")
        if trip["hotel"] and not trip["hotel"]["price_known"]:
            assert stay["known"] is False and stay["detail"]["reason"] == "no_price"
            assert not any(s["key"] == "hotel" for s in b["saves"])

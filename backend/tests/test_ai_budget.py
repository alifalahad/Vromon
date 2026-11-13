"""
The AI budget (POST /trips/{id}/budget/ai): the facts come from Vromon's data, the LLM's answer is
checked (ranges around each amount, the total recomputed), and without an LLM it says so (503).
"""

from __future__ import annotations

from app.services.budget import ai
from app.services.llm.provider import LLMNotConfiguredError
from tests.test_phase10_editing import client, create_trip, setup_db  # noqa: F401 (fixtures)


class FakeLLM:
    model_name = "fake-model"

    def __init__(self):
        self.prompt = None

    def generate_structured(self, system, prompt, schema):
        self.prompt = prompt
        return schema(categories=[
            {"key": "stay", "amount": 6000, "low": 7000, "high": 5000, "basis": "Median room rate × 1 night × 1 room"},
            {"key": "food", "amount": 3000, "low": 2500, "high": 3600, "basis": "Rice and fish prices, 2 people"},
            {"key": "food", "amount": 99999, "low": 0, "high": 99999, "basis": "a duplicate"},
            {"key": "getting_there", "amount": 4000, "low": 3500, "high": 5000, "basis": "Bus both ways"},
        ], assumptions=["A mid-range meal costs about ৳350"], confidence="medium")


def test_estimate_is_checked_and_grounded(client, monkeypatch):
    fake = FakeLLM()
    monkeypatch.setattr(ai, "get_llm_provider", lambda: fake)
    trip = create_trip(client, days=2)
    r = client.post(f"/api/v1/trips/{trip['id']}/budget/ai")
    assert r.status_code == 200, r.text
    b = r.json()
    if b["start_known"]:
        assert b["total"] == 13000 and b["per_person"] == 6500    # recomputed; the duplicate is dropped
    else:                                                         # no start: no made-up way there
        assert b["total"] == 9000 and all(c["key"] != "getting_there" for c in b["categories"])
    stay = next(c for c in b["categories"] if c["key"] == "stay")
    assert stay["low"] <= stay["amount"] <= stay["high"]        # a range around the amount
    assert b["confidence"] == "medium" and b["assumptions"] and b["model"] == "fake-model"
    assert '"travellers": 2' in fake.prompt and "room_rates_in_destination" in fake.prompt


def test_without_an_llm_it_says_so(client, monkeypatch):
    def none():
        raise LLMNotConfiguredError("no key")
    monkeypatch.setattr(ai, "get_llm_provider", none)
    trip = create_trip(client, days=1)
    r = client.post(f"/api/v1/trips/{trip['id']}/budget/ai")
    assert r.status_code == 503


def test_with_a_start_the_way_there_counts(client, monkeypatch):
    monkeypatch.setattr(ai, "get_llm_provider", lambda: FakeLLM())
    monkeypatch.setattr(ai, "_facts", _with_start(ai._facts))
    trip = create_trip(client, days=2)
    b = client.post(f"/api/v1/trips/{trip['id']}/budget/ai").json()
    assert b["start_known"] and b["total"] == 13000 and b["per_person"] == 6500


def test_the_way_there_and_own_food_are_what_the_plan_counts(client):
    """Found in step 8: the AI budget priced the recommended car for a trip that goes by bus, and called the
    food you bring free while a day's packed lunch cost ৳150 in the plan."""
    from app.models.models import Trip
    from tests.test_phase10_editing import _Session
    trip = create_trip(client, days=2)
    computed = {"parts": [
        {"key": "getting_there", "known": True, "amount": 2380,
         "detail": {"mode": "bus", "from": "Dhaka", "to": "Khulna", "fare_per": "person", "count": 2, "both_ways": True}},
        {"key": "food", "known": True, "amount": 5700,
         "detail": {"by_source": {"restaurant": 9, "own": 1, "stay": 2}, "own_cost_per_person": None, "own_total": 300}},
    ]}
    journey = {"from": "Dhaka", "options": [
        {"mode": "car", "cost_per_person": 2850, "minutes": 155, "recommended": True},
        {"mode": "bus", "cost_per_person": 595, "minutes": 260, "recommended": False},
    ]}
    s = _Session()
    try:
        facts = ai._facts(s, s.get(Trip, trip["id"]), journey, computed)
        unknown = ai._facts(s, s.get(Trip, trip["id"]), journey, {"parts": []})
    finally:
        s.close()
    assert facts["way_there_in_plan"]["mode"] == "bus" and facts["way_there_in_plan"]["both_ways_for_the_group"] == 2380
    assert [(w["mode"], w["recommended"], w["in_plan"]) for w in facts["ways_there"]] == [("car", True, False), ("bus", False, True)]
    assert facts["meals_in_plan"]["own_total"] == 300
    assert "way_there_in_plan" in ai.SYSTEM and "own_total" in ai.SYSTEM
    # Without a way there in the plan, nothing is marked and the recommended way is the guide
    assert unknown["way_there_in_plan"] is None and not any(w["in_plan"] for w in unknown["ways_there"])


def _with_start(facts):
    def wrapped(*a, **k):
        f = facts(*a, **k)
        f["trip"]["from"] = "Testpur"
        return f
    return wrapped


def test_the_estimate_can_become_the_budget(client):
    trip = create_trip(client, days=2)
    r = client.patch(f"/api/v1/trips/{trip['id']}", json={"total_budget": 13000})
    assert r.status_code == 200 and r.json()["total_budget"] == 13000
    assert client.get(f"/api/v1/trips/{trip['id']}/budget").json()["total_budget"] == 13000
    assert client.patch(f"/api/v1/trips/{trip['id']}", json={"total_budget": 0}).status_code == 422


def test_a_place_taken_out_of_the_catalog_doesnt_block_changes(client):
    """A must-see whose place was later removed is dropped on the next change, not a 422."""
    from app.models.models import Place, TripConstraint
    from tests.test_phase10_editing import _Session
    s = _Session()
    pid = s.query(Place).filter(Place.destination_name == "Cox's Bazar", Place.is_active.is_(True)).first().id
    s.close()
    trip = create_trip(client, days=2, must=(pid,), generate=False)
    s = _Session()
    s.query(Place).filter(Place.id == pid).update({"is_active": False})
    s.commit()
    try:
        r = client.patch(f"/api/v1/trips/{trip['id']}", json={"total_budget": 20000})
        assert r.status_code == 200, r.text
        assert r.json()["total_budget"] == 20000 and r.json()["constraints"]["must_visit"] == []
        assert client.patch(f"/api/v1/trips/{trip['id']}", json={"constraints": {"must_visit": [999999]}}).status_code == 422
    finally:
        s.query(Place).filter(Place.id == pid).update({"is_active": True})
        s.commit()
        s.close()

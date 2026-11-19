"""
The budget says what's a guess and what isn't known (docs/ui-refresh step 18):
  - food is an estimate whenever a meal's price is the default, also at a restaurant whose prices
    aren't known, with how many meals are guesses, and its days are estimates too;
  - tickets with no entry price known at all are not known (reason "no_price", how many places) and
    add nothing; with some known, the rest are counted as not known;
  - a cheaper stay is offered on its price, the two ratings only when both are known;
  - the other numbers still agree: total, low, high, left, status, estimated_total.
"""

from __future__ import annotations

from datetime import date, timedelta

import pytest

from app.models.models import Hotel, Place, Restaurant, Trip
from tests.test_phase10_editing import _Session, activities, client, itinerary, setup_db  # noqa: F401 (fixtures)
from tests.test_trip_planner_step7 import budget, clean, dhaka, part, roads, set_budget, trip_from_dhaka  # noqa: F401 (fixtures)


def set_restaurant_prices_known(trip_id: int, known: bool) -> int:
    """Every restaurant the trip's meals use: its prices known or not. Returns how many meals that is."""
    s = _Session()
    try:
        trip = s.get(Trip, trip_id)
        meals = [i for d in trip.itinerary_days for i in d.items if i.item_type == "meal" and i.restaurant_id is not None]
        for i in meals:
            s.get(Restaurant, i.restaurant_id).cost_known = known
        s.commit()
        return len(meals)
    finally:
        s.close()


def set_entry_prices(trip_id: int, known: bool, only: int | None = None) -> None:
    """The trip's places: entry prices known or not (all of them, or all but `only` stops)."""
    s = _Session()
    try:
        trip = s.get(Trip, trip_id)
        stops = [i for d in sorted(trip.itinerary_days, key=lambda d: d.day_number) for i in sorted(d.items, key=lambda x: x.order_index)
                 if i.item_type == "activity" and i.place_id is not None]
        for k, i in enumerate(stops):
            s.get(Place, i.place_id).cost_known = known if only is None or k >= only else not known
        s.commit()
    finally:
        s.close()


@pytest.fixture(autouse=True)
def prices_back():
    """The seed's prices as they were, after each test (places and restaurants are shared by every test)."""
    s = _Session()
    places = {p.id: p.cost_known for p in s.query(Place)}
    restaurants = {r.id: r.cost_known for r in s.query(Restaurant)}
    hotels = {h.id: h.rating_known for h in s.query(Hotel)}
    s.close()
    yield
    s = _Session()
    for p in s.query(Place):
        p.cost_known = places.get(p.id, p.cost_known)
    for r in s.query(Restaurant):
        r.cost_known = restaurants.get(r.id, r.cost_known)
    for h in s.query(Hotel):
        h.rating_known = hotels.get(h.id, h.rating_known)
    s.commit()
    s.close()


class TestFood:

    def test_a_meal_at_a_restaurant_whose_prices_arent_known_is_a_guess(self, client, roads, dhaka):
        tid = trip_from_dhaka(client)
        set_restaurant_prices_known(tid, True)
        exact = part(budget(client, tid), "food")
        assert exact["detail"]["placeholder_meals"] == 0 and exact["estimate"] is False

        guessed = set_restaurant_prices_known(tid, False)
        assert guessed > 0
        b = budget(client, tid)
        food = part(b, "food")
        assert food["estimate"] is True and food["detail"]["placeholder_meals"] == guessed
        assert food["low"] < food["amount"] < food["high"]
        # Its days are estimates too, and the meals say they're defaults
        s = _Session()
        try:
            days_with_meals = {d.day_number for d in s.get(Trip, tid).itinerary_days if any(i.item_type == "meal" for i in d.items)}
        finally:
            s.close()
        assert all(d["estimate"] for d in b["by_day"] if d["day_number"] in days_with_meals)
        meals = [i for d in itinerary(client, tid)["days"] for i in d["items"] if i["item_type"] == "meal" and i.get("restaurant")]
        assert meals and all(m["cost_source"] == "placeholder" for m in meals)
        assert any("no known price" in r for r in b["incomplete_reasons"])

    def test_your_own_food_and_meals_where_you_stay_are_not_guesses(self, client, roads, dhaka):
        tid = trip_from_dhaka(client)
        set_restaurant_prices_known(tid, False)
        s = _Session()
        try:
            for d in s.get(Trip, tid).itinerary_days:
                for i in d.items:
                    if i.item_type == "meal":
                        i.meal_source = "stay"
            s.commit()
        finally:
            s.close()
        food = part(budget(client, tid), "food")
        assert food["detail"]["placeholder_meals"] == 0 and food["estimate"] is False


class TestTickets:

    def test_no_entry_price_known_at_all_is_not_known_not_zero(self, client, roads, dhaka):
        tid = trip_from_dhaka(client)
        set_entry_prices(tid, True)
        before = budget(client, tid)
        set_entry_prices(tid, False)
        b = budget(client, tid)
        tickets = part(b, "tickets")
        stops = sum(1 for d in itinerary(client, tid)["days"] for a in activities(d))
        assert tickets["known"] is False and tickets["amount"] is None
        assert tickets["detail"]["reason"] == "no_price" and tickets["detail"]["places"] == stops
        # It adds nothing: the total is the other parts', and the days have no tickets
        assert b["total"] == sum(p["amount"] for p in b["parts"] if p["known"])
        assert b["total"] == before["total"] - part(before, "tickets")["amount"]
        assert all(d["tickets"] == 0 for d in b["by_day"])
        assert any("entry prices aren't known" in r for r in b["incomplete_reasons"])

    def test_some_known_the_rest_counted_as_not_known(self, client, roads, dhaka):
        tid = trip_from_dhaka(client)
        set_entry_prices(tid, False, only=1)          # the first stop's price known, the others not
        tickets = part(budget(client, tid), "tickets")
        assert tickets["known"] is True and tickets["detail"]["unknown"] > 0
        assert tickets["detail"]["paid"] + tickets["detail"]["free"] == 1


class TestRatings:

    def stay_save(self, client, tid):
        return next((x for x in budget(client, tid)["saves"] if x["key"] == "stay"), None)

    def test_a_cheaper_stay_is_offered_on_its_price_ratings_only_when_both_are_known(self, client, roads, dhaka):
        tid = trip_from_dhaka(client, start=date.today() + timedelta(days=30))
        first = self.stay_save(client, tid)
        if first is None:
            pytest.skip("no cheaper stay for this trip")
        new_id, now_id = first["detail"]["hotel"]["id"], first["detail"]["current"]["id"]

        def ratings(new_known: bool, now_known: bool):
            s = _Session()
            try:
                s.get(Hotel, new_id).rating_known = new_known
                s.get(Hotel, now_id).rating_known = now_known
                s.commit()
            finally:
                s.close()
            return self.stay_save(client, tid)

        both = ratings(True, True)
        assert both["detail"]["ratings"] == {"to": both["detail"]["hotel"]["rating"], "from": both["detail"]["current"]["rating"]}
        for new_known, now_known in ((False, True), (True, False), (False, False)):
            s = ratings(new_known, now_known)
            assert s is not None and s["detail"]["ratings"] is None
            assert s["saving"] > 0                                   # still offered, on its price
        # The current hotel's rating is never passed on when it isn't known, here or in the stay part
        s = ratings(True, False)
        assert s["detail"]["current"]["rating"] is None
        assert part(budget(client, tid), "stay")["detail"].get("rating") is None


class TestNumbersAgree:

    def test_total_low_high_left_status_and_the_old_fields(self, client, roads, dhaka):
        tid = trip_from_dhaka(client)
        set_restaurant_prices_known(tid, False)
        set_entry_prices(tid, False)
        b = budget(client, tid)
        known = [p for p in b["parts"] if p["known"]]
        assert b["total"] == sum(p["amount"] for p in known)
        assert b["low"] == sum(p["low"] for p in known) and b["high"] == sum(p["high"] for p in known)
        assert b["low"] < b["total"] < b["high"]
        assert b["left"] == round(b["total_budget"] - b["total"])
        assert b["estimated_total"] == b["total"] and b["remaining"] == b["left"]
        # Status from the total and the guesses' high end
        set_budget(tid, b["total"] - 10)
        assert budget(client, tid)["status"] == "over"
        set_budget(tid, (b["total"] + b["high"]) / 2)              # covers the total, not the high end
        assert budget(client, tid)["status"] == "close"
        set_budget(tid, b["high"] * 2)
        assert budget(client, tid)["status"] == "ok"

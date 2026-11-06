"""
An AI budget estimate, grounded in Vromon's own data (retrieval, then generation):

1. Retrieve the facts for this trip from the catalog and the plan: the trip (days, nights,
   travellers, rooms, the chosen accommodation level), the published room rates of hotels in
   the destination (each hotel's own website, with its date), today's market food prices
   (TCB, Dhaka), the planned sights' entry fees where known, the ways there (journey planner:
   timetabled trains, estimated buses / flights / car), and the planner's local transport.
2. Ask the LLM (Gemini, structured output) for a feasible budget per category, using only
   those facts and saying what it had to assume.
3. Check the answer: no negative amounts, ranges around the amount, the total recomputed
   from the categories (the model's arithmetic is never trusted).

Nothing is stored or applied: the traveller sees the estimate and may use it as their budget.
"""

from __future__ import annotations

import statistics
from datetime import date
from typing import List, Literal, Optional

from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.catalog import PriceObservation
from app.models.models import Hotel, Trip
from app.services.llm.provider import get_llm_provider

Category = Literal["getting_there", "stay", "food", "tickets", "local", "other"]


class AICategory(BaseModel):
    key: Category
    amount: int = Field(ge=0, description="For the whole group, in taka")
    low: int = Field(ge=0)
    high: int = Field(ge=0)
    basis: str = Field(description="One sentence: which facts this comes from, and any assumption")


class AIBudget(BaseModel):
    categories: List[AICategory]
    assumptions: List[str] = Field(default_factory=list, description="What had to be assumed, briefly")
    confidence: Literal["low", "medium", "high"]


SYSTEM = (
    "You estimate realistic travel budgets for trips in Bangladesh, in Bangladeshi taka (BDT). "
    "Use only the facts you are given. Where a fact is missing (for example the price of a meal at a "
    "restaurant in that town), make a cautious, typical assumption for Bangladesh in the trip's month, "
    "and list it in `assumptions`. Amounts are for the whole group for the whole trip. Give each "
    "category a low-high range that a careful traveller could expect. Prefer the traveller's chosen "
    "accommodation level and the recommended way there. Never invent hotel names or prices that are "
    "not in the facts. If the trip's `from` is null, where the traveller starts is unknown: leave out "
    "getting_there entirely (never assume a starting city). Write the basis of each category in one short sentence."
)


def _facts(db: Session, trip: Trip, journey: Optional[dict], computed: dict) -> dict:
    n = trip.num_travelers or 1
    nights = max(trip.num_days - 1, 0)
    pref = trip.preference
    rates = []
    for h in db.scalars(select(Hotel).where(Hotel.destination_name == trip.destination, Hotel.is_active.is_(True),
                                            Hotel.price_known.is_(True)).order_by(Hotel.price_per_night).limit(40)):
        rates.append({"hotel": h.name, "from_per_night": round(h.price_per_night), "level": h.category})
    prices = [r["from_per_night"] for r in rates]
    latest = db.scalar(select(func.max(PriceObservation.observed_on)).where(PriceObservation.price_kind == "market_retail",
                                                                            PriceObservation.status == "published"))
    market = []
    if latest:
        for p in db.scalars(select(PriceObservation).where(PriceObservation.price_kind == "market_retail",
                                                           PriceObservation.status == "published",
                                                           PriceObservation.observed_on == latest).limit(60)):
            market.append({"item": p.item_label, "unit": p.unit, "low": p.amount_min, "high": p.amount_max})
    tickets = []
    for d in trip.itinerary_days:
        for i in d.items:
            if i.item_type == "activity" and i.place is not None:
                tickets.append({"place": i.place.name, "entry_fee_per_person": i.place.estimated_cost if i.place.cost_known else None})
    parts = {p["key"]: p for p in computed.get("parts", [])}
    local = parts.get("local", {})
    ways = []
    for o in (journey or {}).get("options", [])[:4]:
        ways.append({"mode": o["mode"], "one_way_per_person": o["cost_per_person"], "hours": round(o["minutes"] / 60, 1),
                     "recommended": o["recommended"],
                     "fare_basis": "train timetable; fare estimated" if o["mode"] == "train" else "estimate"})
    return {
        "trip": {"from": (journey or {}).get("from"), "destination": trip.destination, "start": trip.start_date.isoformat(), "days": trip.num_days,
                 "nights": nights, "travellers": n, "rooms": -(-n // 2),
                 "accommodation_level": pref.accommodation_preference if pref else "Standard",
                 "travel_style": pref.travel_style if pref else "Balanced",
                 "budget_the_traveller_set": round(trip.total_budget or 0)},
        "room_rates_in_destination": {"count": len(rates), "lowest": min(prices) if prices else None,
                                      "median": round(statistics.median(prices)) if prices else None,
                                      "highest": max(prices) if prices else None, "examples": rates[:12],
                                      "source": "each hotel's own website (published rates)"},
        "market_food_prices": {"date": latest.isoformat() if latest else None, "items": market[:30],
                               "source": "TCB daily retail prices, Dhaka markets"},
        "planned_sights": tickets[:30],
        "ways_there": ways,
        "local_transport_in_plan": {"amount": local.get("amount"), "detail": local.get("detail")},
        "meals_in_plan": parts.get("food", {}).get("detail"),
    }


def estimate(db: Session, trip: Trip, journey: Optional[dict], computed: dict, lang: str = "en") -> dict:
    facts = _facts(db, trip, journey, computed)
    llm = get_llm_provider()
    import json
    prompt = ("Estimate a feasible budget for this trip. Categories: getting_there (both ways), stay, food, "
              "tickets, local (getting around), other (tips, snacks, small costs).\n\nFacts (JSON):\n"
              + json.dumps(facts, ensure_ascii=False, default=str))
    if lang == "bn":
        prompt += "\n\nWrite each basis and assumption in Bangla (বাংলা), with Bangla digits."
    out = llm.generate_structured(SYSTEM, prompt, AIBudget)
    seen = set()
    categories = []
    start_known = bool(facts["trip"]["from"])
    for c in out.categories:
        if c.key in seen or (c.key == "getting_there" and not start_known):
            continue
        seen.add(c.key)
        amount = max(c.amount, 0)
        low, high = min(c.low, amount), max(c.high, amount)
        categories.append({"key": c.key, "amount": amount, "low": low, "high": high, "basis": c.basis.strip()})
    total = sum(c["amount"] for c in categories)
    n = trip.num_travelers or 1
    return {
        "total": total, "low": sum(c["low"] for c in categories), "high": sum(c["high"] for c in categories),
        "per_person": round(total / n), "categories": categories, "assumptions": out.assumptions[:8],
        "start_known": start_known,
        "confidence": out.confidence, "model": llm.model_name, "made_on": date.today().isoformat(),
        "facts_used": {"room_rates": facts["room_rates_in_destination"]["count"],
                       "market_prices": len(facts["market_food_prices"]["items"]),
                       "sights": len(facts["planned_sights"]), "ways_there": len(facts["ways_there"])},
    }

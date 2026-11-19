"""
What you spent (docs/ui-refresh step 19, D18): the amounts the trip's owner notes, the day's plan as things to
pay for, and what Budget says on the trip and after it.

  - A note: an amount for the whole group (more than 0, in the trip's currency), on a day from the day before
    the trip to the day after it, for one of seven parts, with a note of 80 characters at most. One made from
    the plan keeps what it pays for: the stop, or the ride to it, back to where you sleep, or to the next stay.
  - Suggestions: the day's meals and paid stops (price × travellers) and its rides (fare × vehicles, the
    budget's own legs), each with no note yet. Nothing whose price isn't known.
  - spent: the notes' total, by part, by day and today, and how many. By day leaves out getting there and the
    stay (the trip's costs, not a day's), so a day stands beside its plan (food, tickets and rides).
  - to_come: getting there and the stay, what's planned minus what's noted for that part (never below 0); food,
    tickets and rides, the plan for the days after today plus what's left of today's (today's plan minus
    today's notes for those three parts, never below 0). projected = spent + to_come.

Private to the owner: friends who can read the trip get none of it.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import date, timedelta, timezone
from typing import TYPE_CHECKING, Any, Optional

from sqlalchemy import select

from app.models.models import EXPENSE_PARTS, ItineraryItem, TripExpense
from app.services.budget import service as budget_service

if TYPE_CHECKING:
    from sqlalchemy.orm import Session
    from app.models.models import Itinerary, Trip, User

PARTS = EXPENSE_PARTS
TRIP_WIDE = ("getting_there", "stay")          # the trip's costs, not a day's
DAILY_PLANNED = ("food", "tickets", "local")   # what a day's plan counts
RIDES = ("to", "back", "move")
NOTE_MAX = 80
AMOUNT_MAX = 100_000_000                       # more than any trip; a typo of extra zeros stops here


class ExpenseError(Exception):
    def __init__(self, message: str, status: int = 422):
        super().__init__(message)
        self.message = message
        self.status = status


def days_allowed(trip: "Trip") -> tuple[date, date]:
    """The first and last day a note may have: the day before the trip to the day after it."""
    return trip.start_date - timedelta(days=1), trip.end_date + timedelta(days=1)


def notes_of(db: "Session", trip: "Trip") -> list[TripExpense]:
    """The trip's notes, newest day first (then the latest noted first)."""
    return list(db.scalars(
        select(TripExpense).where(TripExpense.trip_id == trip.id).order_by(TripExpense.day.desc(), TripExpense.id.desc())
    ))


def out(e: TripExpense) -> dict[str, Any]:
    return {
        "id": e.id, "day": e.day.isoformat(), "amount": e.amount, "part": e.part, "note": e.note or "",
        "item_id": e.item_id, "ride": e.ride,
        # Stored in UTC: said so, so the phone shows the time it was noted in its own zone
        "created_at": e.created_at.replace(tzinfo=timezone.utc).isoformat() if e.created_at else None,
    }


def _check(trip: "Trip", day: date, amount: float, part: str, note: str) -> None:
    first, last = days_allowed(trip)
    if not first <= day <= last:
        raise ExpenseError(f"The day must be from {first.isoformat()} to {last.isoformat()}")
    if not 0 < amount <= AMOUNT_MAX:
        raise ExpenseError("The amount must be more than 0")
    if part not in PARTS:
        raise ExpenseError(f"Unknown part: {part}")
    if len(note) > NOTE_MAX:
        raise ExpenseError(f"The note can be {NOTE_MAX} characters at most")


def _check_link(db: "Session", trip: "Trip", item_id: Optional[int], ride: Optional[str]) -> None:
    """What a note pays for: a stop of this trip (or the ride to it), or the day's ride back or move."""
    if ride is not None and ride not in RIDES:
        raise ExpenseError(f"Unknown ride: {ride}")
    if ride in ("back", "move") and item_id is not None:
        raise ExpenseError("The ride back or to the next stay belongs to the day, not to a stop")
    if ride == "to" and item_id is None:
        raise ExpenseError("A ride to a stop needs the stop")
    if item_id is not None:
        item = db.get(ItineraryItem, item_id)
        if item is None or item.itinerary is None or item.itinerary.trip_id != trip.id:
            raise ExpenseError("That stop isn't in this trip's plan")


def add(db: "Session", trip: "Trip", user: "User", day: date, amount: float, part: str, note: str = "",
        item_id: Optional[int] = None, ride: Optional[str] = None) -> TripExpense:
    if trip.not_taken is not None:
        raise ExpenseError("This trip didn't happen", status=409)
    note = (note or "").strip()
    _check(trip, day, amount, part, note)
    _check_link(db, trip, item_id, ride)
    e = TripExpense(trip_id=trip.id, user_id=user.id, day=day, amount=float(amount), part=part, note=note,
                    item_id=item_id, ride=ride)
    db.add(e)
    db.flush()
    return e


def change(db: "Session", trip: "Trip", e: TripExpense, fields: dict[str, Any]) -> TripExpense:
    """Change a note's day, amount, part, note or what it pays for. A new day without a new link drops the link:
    a stop or a ride belongs to its own day."""
    day = fields.get("day", e.day)
    amount = fields.get("amount", e.amount)
    part = fields.get("part", e.part)
    note = (fields.get("note", e.note) or "").strip()
    _check(trip, day, amount, part, note)
    if "item_id" in fields or "ride" in fields:
        item_id, ride = fields.get("item_id"), fields.get("ride")
        _check_link(db, trip, item_id, ride)
    elif day != e.day:
        item_id, ride = None, None
    else:
        item_id, ride = e.item_id, e.ride
    e.day, e.amount, e.part, e.note, e.item_id, e.ride = day, float(amount), part, note, item_id, ride
    db.flush()
    return e


# ---------------------------------------------------------------------------
# From the day's plan
# ---------------------------------------------------------------------------

def _noted_keys(notes: list[TripExpense]) -> set[tuple]:
    keys: set[tuple] = set()
    for e in notes:
        if e.item_id is not None:
            keys.add((e.ride or "stop", e.item_id))
        elif e.ride in ("back", "move"):
            keys.add((e.ride, e.day))
    return keys


def suggestions(trip: "Trip", bases, day: date, notes: list[TripExpense]) -> list[dict[str, Any]]:
    """
    The day's plan as things to pay for, in the day's order (a ride before the stop it goes to): meals and
    paid stops with a known price, and rides that cost something, each without a note yet.
    """
    plan_day: Optional["Itinerary"] = next((d for d in trip.itinerary_days if d.day_date == day), None)
    if plan_day is None:
        return []
    n = trip.num_travelers
    currency = trip.currency
    noted = _noted_keys(notes)
    items = sorted(plan_day.items, key=lambda i: i.order_index)
    legs = budget_service.day_legs(plan_day, bases, n) + budget_service.move_legs(plan_day, bases, n)
    rides_to = {leg["to_item"]: leg for leg in legs if leg.get("to_item") is not None}
    out_rows: list[dict[str, Any]] = []

    def ride_row(leg: dict, ride: str, item_id: Optional[int], place: Optional[str]) -> None:
        amount = budget_service._r10(leg["cost"])
        key = (ride, item_id if item_id is not None else day)
        if amount <= 0 or key in noted:
            return
        out_rows.append({
            "key": f"{ride}:{item_id}" if item_id is not None else ride, "kind": "ride", "item_id": item_id,
            "ride": ride, "part": "local", "amount": amount, "estimate": True, "title": None, "place": place,
            "mode": leg["mode"], "meal_source": None, "count": None,
        })

    # Moving to another stay that day comes first: the bags go before the day's stops
    for leg in legs:
        if leg.get("move"):
            end = bases.end(plan_day.day_number) if hasattr(bases, "end") else None
            ride_row(leg, "move", None, end.name if end is not None else None)
    for i in items:
        source = i.place or i.restaurant
        if source is not None and (source.currency or "BDT") != currency:
            continue
        if i.id in rides_to:
            ride_row(rides_to[i.id], "to", i.id, i.place.name if i.place is not None else i.title)
        if ("stop", i.id) in noted:
            continue
        if i.item_type == "meal":
            kind = i.meal_source or "restaurant"
            if kind == "stay" or budget_service.meal_is_guess(i) or not i.cost:
                continue
            out_rows.append({
                "key": f"stop:{i.id}", "kind": "meal", "item_id": i.id, "ride": None, "part": "food",
                "amount": round(i.cost * n), "estimate": kind == "restaurant", "title": i.title,
                "place": i.restaurant.name if i.restaurant is not None else None, "mode": None,
                "meal_source": kind, "count": n,
            })
        elif i.item_type == "activity" and i.place is not None and i.place.cost_known and i.cost:
            out_rows.append({
                "key": f"stop:{i.id}", "kind": "stop", "item_id": i.id, "ride": None, "part": "tickets",
                "amount": round(i.cost * n), "estimate": False, "title": i.title, "place": i.place.name,
                "mode": None, "meal_source": None, "count": n,
            })
    for leg in legs:
        if leg.get("back"):
            end = bases.end(plan_day.day_number) if hasattr(bases, "end") else bases
            ride_row(leg, "back", None, getattr(end, "name", None))
    return out_rows


# ---------------------------------------------------------------------------
# Budget on the trip and after it
# ---------------------------------------------------------------------------

def _money(x: float) -> float:
    """Notes are exact amounts: kept to the paisa, whole when they are."""
    r = round(x, 2)
    return int(r) if r == int(r) else r


def summary(full: dict, notes: list[TripExpense], today: date) -> dict[str, Any]:
    """spent, to_come and projected for the budget (`full`: budget.service.full_budget's answer). All None
    with no notes: a trip nobody noted shows the plan, never "৳0 spent"."""
    if not notes:
        return {"spent": None, "to_come": None, "projected": None}
    by_part: dict[str, float] = {p: 0.0 for p in PARTS}
    by_day: dict[date, float] = defaultdict(float)
    planned_today = 0.0
    for e in notes:
        by_part[e.part] += e.amount
        if e.part not in TRIP_WIDE:
            by_day[e.day] += e.amount
        if e.day == today and e.part in DAILY_PLANNED:
            planned_today += e.amount
    total = sum(by_part.values())
    parts = {p["key"]: p for p in full["parts"]}
    to_come = sum(max(0.0, (parts[k]["amount"] if parts[k]["known"] else 0.0) - by_part[k]) for k in TRIP_WIDE)
    for d in full["by_day"]:
        when = date.fromisoformat(d["date"]) if d.get("date") else None
        if when is None or when < today:
            continue
        to_come += d["amount"] if when > today else max(0.0, d["amount"] - planned_today)
    to_come = round(to_come)
    return {
        "spent": {
            "total": _money(total),
            "by_part": {k: _money(v) for k, v in by_part.items()},
            "by_day": [{"date": k.isoformat(), "amount": _money(v)} for k, v in sorted(by_day.items())],
            "today": _money(by_day.get(today, 0.0)),
            "count": len(notes),
        },
        "to_come": to_come,
        "projected": _money(total + to_come),
    }


# ---------------------------------------------------------------------------
# The account
# ---------------------------------------------------------------------------

def export(db: "Session", user: "User") -> list[dict[str, Any]]:
    """The user's notes, for /me/export."""
    rows = db.scalars(select(TripExpense).where(TripExpense.user_id == user.id).order_by(TripExpense.trip_id, TripExpense.day, TripExpense.id))
    return [{"trip_id": e.trip_id, **out(e)} for e in rows]


def delete_for(db: "Session", user: "User") -> None:
    """With the account: every note the user made."""
    for e in db.scalars(select(TripExpense).where(TripExpense.user_id == user.id)).all():
        db.delete(e)

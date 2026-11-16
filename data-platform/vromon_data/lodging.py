"""
Which listings are places to stay (docs/ui-refresh step 11).

In Bangladesh many eateries are called "Hotel …" (হোটেল is also a word for a place to eat), and business
listings tag them as hotels; places to stay often say "Residential" or "আবাসিক". So the word "hotel" in a
name proves nothing, and a listing's category alone isn't enough either.

The rule, for a listing filed as accommodation:

1. The ministry's star list counts: a hotel with an official star rating is a place to stay.
2. The source's category decides first.
   - A category that can only be lodging (resort, guest house, motel, hostel, bed and breakfast, inn,
     lodge, cottage) is a place to stay, unless its name says plainly that it's food, a shop or something
     else (then a person looks: review).
   - "hotel", a bare "accommodation" or no category is doubtful here, and the name tips it.
3. The name, for a doubtful category:
   - a word for staying (residential, আবাসিক, resort, guest house, rest house, motel, cottage, suites…)
     → a place to stay;
   - "inn" only counts when nothing says food;
   - words for food (restaurant, রেস্টুরেন্ট, sweets, মিষ্টান্ন, biryani, kabab, café…) → food: it moves to
     the restaurants. With "hotel" in the name as well ("Sabuj Hotel & Restaurant"), it could be either:
     review;
   - a phrase that names an eatery ("খাবার হোটেল", a food hotel; "Kabab House") → food, "hotel" or not;
   - words for a shop (store, mart, ট্রেডার্স…) or for something that isn't a business that hosts anyone
     (a graveyard, a mosque, a school…) → not a place to stay: it leaves the hotels (with "hotel" in the name
     too, "Palace Hotel and Community Centre": review);
   - no word either way → the category stands: a place to stay.
4. A row still in doubt goes to review, never into the list.

Names are split into words (English, and Bangla with its vowel signs), and phrases ("guest house",
"rest house") are matched on the words, so "চাপাতলী" isn't "চা" and "Tea Resort" is a resort.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

# Categories that can only be lodging (Overture's lodging categories, less "hotel" and "accommodation")
LODGING_ONLY = {"resort", "motel", "hostel", "guest_house", "bed_and_breakfast", "inn", "lodge", "cottage"}

# Words, lower-case. A phrase is several words in a row.
STAY = {
    "residential", "residence", "residency", "resort", "resorts", "guest house", "guesthouse", "rest house", "resthouse",
    "motel", "cottage", "cottages", "suites", "suite", "lodge", "hostel", "boarding", "bungalow", "dak bungalow",
    "circuit house", "homestay", "home stay", "apartment", "apartments", "abashik", "abasik", "nibash", "villa", "villas",
    "আবাসিক", "রিসোর্ট", "রিসোর্টস", "রিসার্ট", "রিসোটর্স", "গেস্ট হাউস", "গেস্ট হাউজ", "গেস্টহাউস", "রেস্ট হাউস", "রেস্ট হাউজ",
    "রেস্টহাউস", "বোর্ডিং", "কটেজ", "মোটেল", "লজ", "বাংলো", "ডাকবাংলো", "সার্কিট হাউস", "রেসিডেন্স", "রেসিডেন্সিয়াল", "নিবাস",
}
WEAK_STAY = {"inn", "ইন"}
FOOD = {
    "restaurant", "restaurants", "restora", "restorant", "resturant", "restaurent", "restuarant", "sweets", "sweet house",
    "mishti", "misti", "mistanna", "biryani", "biriyani", "birani", "kabab", "kebab", "kabab house", "food", "foods",
    "fast food", "cafe", "café", "coffee", "bakery", "bakers", "kitchen", "pizza", "burger", "bistro", "grill", "bbq",
    "juice", "snacks", "confectionery", "diner", "halim",
    "রেস্তোরাঁ", "রেস্তোরা", "রেস্টুরেন্ট", "রেষ্টুরেন্ট", "রেঁস্তোরা", "মিষ্টান্ন", "মিষ্টি", "সুইটস", "বিরিয়ানি", "বিরানী",
    "কাবাব", "ক্যাফে", "ফুড", "ফুডস", "বেকারি", "বেকারী", "কিচেন", "হালিম", "দই", "দধি", "পিঠা", "খাবার",
}
SHOP = {
    "store", "stores", "shop", "mart", "pharmacy", "traders", "enterprise", "electronics", "telecom", "supermarket",
    "garments", "tailors", "দোকান", "স্টোর", "ট্রেডার্স", "এন্টারপ্রাইজ", "ফার্মেসী", "ফার্মেসি", "বস্ত্রালয়", "ভান্ডার",
}
# Not a business that hosts anyone (rows whose "name" is an address near one)
OTHER = {
    "graveyard", "mosque", "madrasa", "school", "college", "hospital", "bank", "community center", "community centre",
    "কবরস্থান", "মসজিদ", "মাদ্রাসা", "স্কুল", "কলেজ", "হাসপাতাল", "ব্যাংক", "কমিউনিটি সেন্টার",
}
HOTEL = {"hotel", "hotels", "হোটেল", "হোটেলস"}
# Phrases that name an eatery even with "hotel" in them ("খাবার হোটেল", a food hotel; "Kabab House")
EATERY = {"khabar hotel", "khabar", "খাবার হোটেল", "ভাতের হোটেল", "bhater hotel", "kabab house", "biryani house", "biriyani house",
          "বিরিয়ানি হাউস", "বিরিয়ানি হাউজ", "কাবাব হাউস", "কাবাব হাউজ"}

_WORD = re.compile(r"[a-z']+|[ঀ-৿]+")


def words(text: str | None) -> list[str]:
    """A name's words, lower-case: English letters, or Bangla with its vowel signs."""
    return _WORD.findall((text or "").lower().replace("’", "'").replace("é", "e"))


def _found(ws: list[str], vocabulary: set[str]) -> list[str]:
    """The words and two-word phrases of `ws` that are in `vocabulary`."""
    out = [w for w in ws if w in vocabulary]
    out += [f"{a} {b}" for a, b in zip(ws, ws[1:]) if f"{a} {b}" in vocabulary]
    return out


@dataclass
class Verdict:
    """stay / food / not_stay / review, and the words that decided it"""

    kind: str
    why: str
    words: list[str] = field(default_factory=list)

    def __post_init__(self) -> None:
        self.words = list(dict.fromkeys(self.words))


def classify(category: str | None, name_en: str | None, name_bn: str | None, stars: int | None = None) -> Verdict:
    ws = words(name_en) + words(name_bn)
    stay, weak, food, shop, other = (_found(ws, v) for v in (STAY, WEAK_STAY, FOOD, SHOP, OTHER))
    # "মিষ্টান্ন ভান্ডার": a sweet shop is food, not a shop
    if food:
        shop = [w for w in shop if w != "ভান্ডার"]
    if stars:
        return Verdict("stay", "on the ministry's star list")
    if category in LODGING_ONLY:
        if not stay and (food or shop or other):
            return Verdict("review", f"filed as {category}, but the name says otherwise", food + shop + other)
        return Verdict("stay", f"filed as {category}")
    # "hotel", "accommodation" or nothing: doubtful in Bangladesh, the name tips it
    if stay:
        return Verdict("stay", "the name says it's a place to stay", stay)
    hotel = _found(ws, HOTEL)
    if food or _found(ws, EATERY):
        eatery = _found(ws, EATERY)
        if eatery and not weak:
            return Verdict("food", "the name says it's a place to eat", eatery + food)
        if weak or hotel:
            return Verdict("review", "the name says both a hotel and food", weak + hotel + food)
        return Verdict("food", "the name says it's a place to eat", food)
    if shop or other:
        if hotel:
            return Verdict("review", "the name says both a hotel and something else", hotel + shop + other)
        return Verdict("not_stay", "the name says it's a shop" if shop else "the name says it's not a business that hosts anyone",
                       shop + other)
    return Verdict("stay", f"filed as {category or 'accommodation'}; nothing in the name says otherwise")


def lodging_kind(category: str | None, name_en: str | None, name_bn: str | None) -> str:
    """What sort of place to stay, for the app's rows: hotel, resort, guest_house, rest_house, motel, cottage,
    bed_and_breakfast or hostel."""
    ws = words(name_en) + words(name_bn)
    found = set(_found(ws, STAY))
    if found & {"resort", "resorts", "রিসোর্ট", "রিসোর্টস", "রিসার্ট", "রিসোটর্স"} or category == "resort":
        return "resort"
    if found & {"guest house", "guesthouse", "গেস্ট হাউস", "গেস্ট হাউজ", "গেস্টহাউস"} or category == "guest_house":
        return "guest_house"
    if found & {"rest house", "resthouse", "রেস্ট হাউস", "রেস্ট হাউজ", "রেস্টহাউস", "dak bungalow", "ডাকবাংলো", "circuit house",
                "সার্কিট হাউস"}:
        return "rest_house"
    if found & {"motel", "মোটেল"} or category == "motel":
        return "motel"
    if found & {"cottage", "cottages", "কটেজ"} or category == "cottage":
        return "cottage"
    if category in ("bed_and_breakfast", "hostel"):
        return category
    return "hotel"


FOOD_CATEGORY = "restaurant"
SWEETS = {"sweets", "sweet house", "mishti", "misti", "mistanna", "মিষ্টান্ন", "মিষ্টি", "সুইটস", "দই", "দধি"}
REVIEWER = "lodging rule"


def apply(session: Session, *, dry_run: bool = False) -> dict:
    """
    The rule over every accommodation listing not decided by a person: food moves to the restaurants
    (kind "food"), not a place to stay leaves the hotels (status "rejected"), a doubtful one goes to review
    (status "needs_review" and an open `not_a_stay` task). Each change is recorded as a `not_a_stay` review
    task, decided by the rule (or open, for review), with the words that decided it. A person's earlier
    decision on a listing stands.
    """
    from app.models.catalog import ReviewTask, ServicePlace

    decided = set(session.scalars(select(ReviewTask.entity_id).where(
        ReviewTask.entity_type == "service_place", ReviewTask.status.in_(("approved", "rejected")),
        ReviewTask.reviewer != REVIEWER)))
    already = set(session.scalars(select(ReviewTask.entity_id).where(
        ReviewTask.entity_type == "service_place", ReviewTask.task_type == "not_a_stay")))
    counts = {"checked": 0, "stay": 0, "food": 0, "not_stay": 0, "review": 0, "left_by_person": 0}
    changes: list[dict] = []
    now = datetime.utcnow()
    for sp in session.scalars(select(ServicePlace).where(ServicePlace.kind == "accommodation",
                                                         ServicePlace.status.notin_(("rejected", "inactive")))):
        counts["checked"] += 1
        v = classify(sp.category, sp.name_en, sp.name_bn, sp.official_star_rating)
        if v.kind == "stay":
            counts["stay"] += 1
            continue
        if sp.id in decided:
            counts["left_by_person"] += 1
            continue
        counts[v.kind] += 1
        changes.append({"slug": sp.slug, "name": sp.name_en or sp.name_bn, "category": sp.category, "was": sp.status,
                        "verdict": v.kind, "why": v.why, "words": v.words})
        if sp.id in already:
            continue
        payload = {"rule": v.kind, "why": v.why, "words": v.words, "category": sp.category, "status_before": sp.status}
        if v.kind == "food":
            sp.kind = "food"
            sp.category = "dessert_shop" if set(v.words) & SWEETS else FOOD_CATEGORY
            session.add(ReviewTask(task_type="not_a_stay", entity_type="service_place", entity_id=sp.id, payload=payload,
                                   priority=3, status="approved", reviewer=REVIEWER, decision={"kind": "food"},
                                   reason=f"A place to eat: {', '.join(v.words)}", decided_at=now))
        elif v.kind == "not_stay":
            sp.status = "rejected"
            session.add(ReviewTask(task_type="not_a_stay", entity_type="service_place", entity_id=sp.id, payload=payload,
                                   priority=3, status="rejected", reviewer=REVIEWER, decision={"listed": False},
                                   reason=f"Not a place to stay: {', '.join(v.words)}", decided_at=now))
        else:
            sp.status = "needs_review"
            session.add(ReviewTask(task_type="not_a_stay", entity_type="service_place", entity_id=sp.id, payload=payload,
                                   priority=2))
    counts["at"] = now.isoformat(timespec="seconds")
    counts["changes"] = changes
    if dry_run:
        session.rollback()
    else:
        session.commit()
    return counts


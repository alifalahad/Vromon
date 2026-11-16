"""Which listings are places to stay (docs/ui-refresh step 11): the rule on real rows, the pass over the
database, the import, and publishing (a trip that chose such a "hotel" keeps it)."""

from __future__ import annotations

import pytest
from sqlalchemy import select

from app.models.catalog import ReviewTask, ServicePlace
from app.models.models import Destination, Hotel, Restaurant, Trip, TripPreference, User
from tests.test_attractions import _setup
from tests.test_service_places import _row
from vromon_data import lodging, pipeline, publish, review
from vromon_data.connectors.service_places import OvertureServicePlaces
from vromon_data.lodging import classify, lodging_kind, words

# Real listings from the database (2026-11-16): (category, English name, Bangla name, star rating)
STAYS = [
    ("hotel", "Hotel Ali", None, None),
    ("hotel", "Hotel Sweet Dream", None, None),                           # a lone "sweet" isn't food
    ("hotel", "Rich Mart Rest House", None, None),                        # "mart", but a rest house
    ("hotel", "Tea Heaven Resort", None, None),                           # tea, but a resort
    ("hotel", "Venus Resort and Coffee House", None, None),
    ("hotel", "Nice Guest House, Training Hall and Dolna Food Heaven", None, None),
    ("hotel", "Muktijodda Sultan In -Residential", None, None),
    ("hotel", "Heritage B.R. Hotel Suites and Restaurant", None, None),
    ("hotel", None, "সিন্ডেরেলা রিসোর্ট টাউন, কুয়াকাটা", None),
    ("hotel", None, "হোটেল আবাসিক সিটি", None),
    ("hotel", "Grand Hotel & Restaurant", None, 5),                       # on the ministry's star list
    ("resort", "Sawpnorajjo Park and Resort", None, None),
    ("bed_and_breakfast", None, "কাচারি ঘাট", None),                       # the category stands: nothing says otherwise
]
FOOD = [
    ("hotel", None, "হক মিষ্টান্ন ভান্ডার", None),                          # the Barishal sweet shop
    ("hotel", "Kettle Cafe Lalbagh", None, None),
    ("hotel", "Grand A. Malek Chinese Restaurant", None, None),
    ("hotel", "Biriyani Khan - বিরিয়ানী খান", None, None),
    ("hotel", "Shajalal Khabar Hotel", "শাহ্জালাল খাবার হোটেল", None),     # "khabar hotel": a food hotel
    ("hotel", "Four Star Hotel & Kabab House", None, None),
    ("hotel", None, "কয়লা রেস্তোরা", None),
]
NOT_STAY = [
    ("hotel", "NR Store", None, None),
    ("hotel", "JS Traders", None, None),
    ("hotel", None, "চাপাতলী কবরস্থান, শেরপুর", None),                     # a graveyard
    ("hotel", None, "চাদনীঘাট জামে মসজিদ", None),                          # a mosque
    ("hotel", "Chai Pai Community Center", None, None),
]
REVIEW = [
    ("hotel", "Sabuj Hotel & Restaurant", None, None),                    # could have rooms, or not
    ("hotel", None, "সিটি ইন রেস্তোরাঁ সুইটস এন্ড বিরিয়ানি হাউজ", None),   # an inn and a restaurant
    ("hotel", "Adarsha Palace Hotel and Community Centre", None, None),
    ("bed_and_breakfast", "Nobibnogar Lalmia Store", None, None),         # filed as lodging, named a store
    ("resort", "The QB Holiday Homes and Cafe", None, None),
]


@pytest.mark.parametrize("kind,rows", [("stay", STAYS), ("food", FOOD), ("not_stay", NOT_STAY), ("review", REVIEW)])
def test_the_rule_on_real_listings(kind, rows):
    for row in rows:
        assert classify(*row).kind == kind, row


def test_bangla_words_keep_their_vowel_signs():
    assert words("চাপাতলী কবরস্থান, শেরপুর") == ["চাপাতলী", "কবরস্থান", "শেরপুর"]   # not "চা", tea
    assert classify("hotel", None, "চাপাতলী হোটেল").kind == "stay"
    assert classify("hotel", "Cox’s Bāzār Inn", None).kind == "stay"


def test_the_sort_of_place_to_stay():
    assert lodging_kind("hotel", "Tea Heaven Resort", None) == "resort"
    assert lodging_kind("resort", "Sawpnorajjo Park", None) == "resort"
    assert lodging_kind("hotel", "Nice Guest House", None) == "guest_house"
    assert lodging_kind("hotel", "Tea Town Rest House", None) == "rest_house"
    assert lodging_kind("hotel", "Parjatan Motel Kuakata", None) == "motel"
    assert lodging_kind("hotel", None, "নীলগিরি কটেজ") == "cottage"
    assert lodging_kind("bed_and_breakfast", "Kachari", None) == "bed_and_breakfast"
    assert lodging_kind("hotel", "Hotel Ali", None) == "hotel"


def _place(slug, category, name_en=None, name_bn=None, status="published", **kw):
    return ServicePlace(slug=slug, kind="accommodation", category=category, name_en=name_en, name_bn=name_bn,
                        latitude=22.70, longitude=90.35, status=status, field_status={}, **kw)


def test_the_pass_moves_eateries_takes_out_shops_and_sends_doubt_to_review(session):
    sweets = _place("barishal-hok", "hotel", name_bn="হক মিষ্টান্ন ভান্ডার")
    store = _place("khulna-nr-store", "hotel", "NR Store")
    both = _place("sabuj", "hotel", "Sabuj Hotel & Restaurant")
    hotel = _place("ali", "hotel", "Hotel Ali")
    kept = _place("kept-by-a-person", "hotel", "Mayer Doa Restaurant")
    session.add_all([sweets, store, both, hotel, kept])
    session.flush()
    # A person said this one is a place to stay: that stands
    session.add(ReviewTask(task_type="new_entity", entity_type="service_place", entity_id=kept.id, status="approved",
                           reviewer="tester", payload={}))
    session.commit()

    out = lodging.apply(session)
    assert {k: out[k] for k in ("food", "not_stay", "review", "left_by_person")} == {"food": 1, "not_stay": 1, "review": 1,
                                                                                         "left_by_person": 1}
    assert (sweets.kind, sweets.category, sweets.status) == ("food", "dessert_shop", "published")
    assert (store.kind, store.status) == ("accommodation", "rejected")
    assert (both.kind, both.status) == ("accommodation", "needs_review")
    assert (hotel.kind, hotel.status) == ("accommodation", "published")
    assert (kept.kind, kept.status) == ("accommodation", "published")
    tasks = {t.entity_id: t for t in session.scalars(select(ReviewTask).where(ReviewTask.task_type == "not_a_stay"))}
    assert tasks[sweets.id].status == "approved" and tasks[sweets.id].payload["words"] == ["মিষ্টান্ন"]
    assert tasks[store.id].status == "rejected" and tasks[store.id].reviewer == lodging.REVIEWER
    assert tasks[both.id].status == "open"

    # Run again: nothing new; a person approving the doubtful one makes it a hotel again
    assert lodging.apply(session)["review"] == 1
    assert session.query(ReviewTask).filter(ReviewTask.task_type == "not_a_stay").count() == 3
    review.decide(session, tasks[both.id].id, "approve", reviewer="tester", reason="has rooms")
    assert both.status == "published"
    assert lodging.apply(session)["left_by_person"] == 2


def test_the_import_files_a_sweet_shop_as_food_and_a_graveyard_out(session, layers):
    _setup(session, layers)
    rows = [_row(11, "হক মিষ্টান্ন ভান্ডার", "hotel", 0.85), _row(12, "চাপাতলী কবরস্থান", "hotel", 0.9),
            _row(13, "Sabuj Hotel & Restaurant", "hotel", 0.9), _row(14, "Hotel Sea Gull", "hotel", 0.9)]
    report = pipeline.run(OvertureServicePlaces(), session, params={"rows": rows})
    assert report["status"] == "succeeded", report
    got = {p.name_bn or p.name_en: (p.kind, p.category, p.status) for p in session.scalars(select(ServicePlace))}
    assert got == {
        "হক মিষ্টান্ন ভান্ডার": ("food", "dessert_shop", "published"),
        "চাপাতলী কবরস্থান": ("accommodation", "hotel", "rejected"),
        "Sabuj Hotel & Restaurant": ("accommodation", "hotel", "needs_review"),
        "Hotel Sea Gull": ("accommodation", "hotel", "published"),
    }
    assert report["lodging_was_food"] == 1 and report["lodging_not_a_stay"] == 1 and report["lodging_in_doubt"] == 1


def test_publishing_moves_the_row_and_a_trip_that_chose_it_keeps_it(session):
    dest = Destination(name="Barishal", latitude=22.70, longitude=90.35)
    session.add(dest)
    sweets = _place("barishal-hok", "hotel", name_bn="হক মিষ্টান্ন ভান্ডার")
    resort = _place("barishal-river-resort", "hotel", "River View Resort")
    session.add_all([sweets, resort])
    session.commit()
    publish.publish_service_places(session)
    old = session.scalar(select(Hotel).where(Hotel.source_ref == "catalog:barishal-hok"))
    assert old.is_active and old.kind == "hotel"
    assert session.scalar(select(Hotel).where(Hotel.source_ref == "catalog:barishal-river-resort")).kind == "resort"

    # Someone's trip chose the sweet shop as its hotel
    user = User(auth_subject="lodging-test", friend_code="LODG1234", username="lodging")
    session.add(user)
    session.flush()
    from datetime import date
    trip = Trip(user_id=user.id, destination="Barishal", start_date=date(2026, 12, 1), end_date=date(2026, 12, 2),
                num_travelers=1, total_budget=10000)
    session.add(trip)
    session.flush()
    session.add(TripPreference(trip_id=trip.id, hotel_id=old.id))
    session.commit()

    lodging.apply(session)
    report = publish.publish_service_places(session)
    assert report["moved"] == 1
    assert not session.get(Hotel, old.id).is_active                      # out of the hotel lists
    shop = session.scalar(select(Restaurant).where(Restaurant.source_ref == "catalog:barishal-hok"))
    assert shop.is_active and shop.name == "হক মিষ্টান্ন ভান্ডার"            # among the places to eat
    pref = session.scalar(select(TripPreference).where(TripPreference.trip_id == trip.id))
    assert pref.hotel_id == old.id and session.get(Hotel, old.id) is not None   # the trip is unchanged

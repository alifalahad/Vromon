"""Publishing approved attractions into the app's places, without touching what the app owns."""

from __future__ import annotations

from sqlalchemy import select

from app.db.destinations import load_destinations
from app.models.catalog import Attraction, ReviewTask
from app.models.models import Destination, Place
from tests.test_attractions import _run, _setup
from vromon_data import publish, review


def _approve(session, name):
    t = session.scalar(select(ReviewTask).where(ReviewTask.task_type == "new_entity",
                                                ReviewTask.payload["name_en"].as_string() == name))
    review.decide(session, t.id, "approve", reviewer="tester", reason="test")
    return session.get(Attraction, t.entity_id)


def test_only_approved_attractions_become_places(session, layers, monkeypatch):
    _setup(session, layers)
    dest = Destination(name="Barishal", latitude=22.7, longitude=90.35)
    session.add(dest)
    session.flush()
    demo = Place(name="Demo place", destination_id=dest.id, destination_name="Barishal", category="Beach",
                 latitude=22.1, longitude=90.1)
    session.add(demo)
    session.commit()
    monkeypatch.setattr(publish, "DEMO_DESTINATIONS", {"Barishal"})
    _run(session)
    _approve(session, "Guthia Mosque")
    report = publish.publish_places(session)
    assert report["written"] == 1 and report["demo_hidden"] == 1
    places = {p.name: p for p in session.scalars(select(Place))}
    mosque = places["Guthia Mosque"]
    assert mosque.source_ref == "catalog:barishal-guthia-mosque" and mosque.category == "Culture"
    assert mosque.checked and not mosque.hours_known and not mosque.cost_known and not mosque.rating_known
    assert not places["Demo place"].is_active          # hidden, not deleted
    assert "Border Park" not in places                  # not approved
    # Republishing changes nothing; unpublishing hides the place
    assert publish.publish_places(session)["written"] == 0
    a = session.scalar(select(Attraction).where(Attraction.slug == "barishal-guthia-mosque"))
    a.status = "rejected"
    session.commit()
    assert publish.publish_places(session)["hidden"] == 1


def test_destination_loader_leaves_catalog_places_alone(session):
    load_destinations(session)
    dest = session.scalar(select(Destination).where(Destination.name == "Rajshahi"))
    session.add(Place(name="Catalog place", destination_id=dest.id, destination_name="Rajshahi", category="Culture",
                      latitude=24.37, longitude=88.6, source="catalog", source_ref="catalog:rajshahi-x"))
    dest.data_version = "changed"                        # force the file to be loaded again
    session.commit()
    load_destinations(session)
    p = session.scalar(select(Place).where(Place.source_ref == "catalog:rajshahi-x"))
    assert p.is_active


def test_real_hotels_and_restaurants_replace_the_demo_ones(session):
    from datetime import date, datetime

    from app.models.catalog import PriceObservation, ServicePlace
    from app.models.models import Hotel, Restaurant

    dest = Destination(name="Barishal", latitude=22.70, longitude=90.35)
    session.add(dest)
    session.flush()
    session.add_all([
        Hotel(name="Demo hotel", destination_id=dest.id, destination_name="Barishal", latitude=22.7, longitude=90.35,
              price_per_night=5000),
        Restaurant(name="Demo restaurant", destination_id=dest.id, destination_name="Barishal", latitude=22.7,
                   longitude=90.35),
    ])
    inn = ServicePlace(slug="barishal-river-inn", kind="accommodation", category="hotel", name_en="River Inn",
                       latitude=22.71, longitude=90.36, status="published")
    grand = ServicePlace(slug="barishal-grand", kind="accommodation", category="hotel", name_en="Grand",
                         latitude=22.69, longitude=90.34, status="published", official_star_rating=5)
    far = ServicePlace(slug="barishal-far-resort", kind="accommodation", name_en="Far Resort",
                       latitude=22.30, longitude=90.35, status="published")       # ~44 km away
    unchecked = ServicePlace(slug="barishal-maybe", kind="food", name_en="Maybe", latitude=22.70, longitude=90.35,
                             status="needs_review")
    cafe = ServicePlace(slug="barishal-cafe", kind="food", category="cafe", name_en="Cafe", latitude=22.70,
                        longitude=90.351, status="published")
    session.add_all([inn, grand, far, unchecked, cafe])
    session.flush()
    for amount, status in ((2500, "published"), (1800, "needs_review"), (4000, "published")):
        session.add(PriceObservation(price_kind="rack_rate", service_place_id=inn.id, item_key="room", item_label="Room",
                                     amount_min=amount, currency="BDT", observed_on=date(2026, 11, 1),
                                     source_id="hotel_websites", last_checked_at=datetime(2026, 11, 1), status=status))
    session.commit()

    report = publish.publish_service_places(session)
    assert report["hotels"] == 2 and report["restaurants"] == 1 and report["out_of_town"] == 1
    assert report["demo_hidden"] == 2
    hotels = {h.name: h for h in session.scalars(select(Hotel))}
    assert hotels["River Inn"].price_known and hotels["River Inn"].price_per_night == 2500   # published rates only
    assert hotels["River Inn"].category == "Budget"
    assert not hotels["Grand"].price_known and hotels["Grand"].category == "Luxury"
    assert not hotels["Demo hotel"].is_active and "Far Resort" not in hotels
    cafe_row = session.scalar(select(Restaurant).where(Restaurant.source_ref == "catalog:barishal-cafe"))
    assert not cafe_row.cost_known and not cafe_row.hours_known and not cafe_row.rating_known
    assert session.scalar(select(Restaurant).where(Restaurant.name == "Maybe")) is None
    # A listing that leaves review hides its row again
    inn.status = "rejected"
    session.commit()
    assert publish.publish_service_places(session)["hidden"] == 1
    assert not session.get(Hotel, hotels["River Inn"].id).is_active

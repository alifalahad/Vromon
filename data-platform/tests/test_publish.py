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


def test_every_district_with_sights_becomes_a_destination_at_its_largest_town(session):
    import uuid as _uuid
    from datetime import datetime

    from app.models.catalog import AdminBoundary, AdminUnit, Attraction, EntityExternalId
    from app.models.models import City, Destination, Hotel, ItineraryItem, Itinerary, Place, Trip

    div, d1, d2 = _uuid.uuid4(), _uuid.uuid4(), _uuid.uuid4()
    square = '{"type":"Polygon","coordinates":[[[90.0,22.0],[90.5,22.0],[90.5,22.5],[90.0,22.5],[90.0,22.0]]]}'
    session.add_all([
        AdminUnit(id=div, country_iso2="BD", level="division", slug="x-div", name_en="Barishal", status="published"),
        AdminUnit(id=d1, country_iso2="BD", level="district", slug="x-bhola", name_en="Bhola", parent_id=div,
                  centroid_lat=22.25, centroid_lon=90.25, status="published"),
        AdminUnit(id=d2, country_iso2="BD", level="district", slug="x-empty", name_en="Emptyganj", parent_id=div,
                  status="published"),
    ])
    session.flush()
    session.add_all([
        EntityExternalId(entity_type="admin_unit", entity_id=div, provider="iso3166-2", external_id="BD-A",
                         source_id="iso"),
        AdminBoundary(admin_unit_id=d1, source_id="t", geometry_geojson=square, simplify_tolerance_deg=0.0005,
                      min_lon=90.0, min_lat=22.0, max_lon=90.5, max_lat=22.5),
        City(geonameid=1, country_iso2="BD", name="Bhola Town", lat=22.4, lon=90.4, population=90_000),
        City(geonameid=2, country_iso2="BD", name="Outside", lat=23.0, lon=90.2, population=900_000),
        Attraction(slug="x-sight", canonical_name_en="Sight", district_id=d1, status="published", field_status={}),
    ])
    session.commit()
    report = publish.publish_destinations(session)
    assert report["written"] == 1 and report["no_attractions"] == 1
    bhola = session.scalar(select(Destination).where(Destination.name == "Bhola"))
    assert (bhola.latitude, bhola.longitude) == (22.4, 90.4)          # its largest town inside it
    assert bhola.region_code == "BD-A" and bhola.checked and "Bhola Town" in bhola.attribution
    assert publish.publish_destinations(session)["reused"] == 1       # run again: no duplicate

    # Tidying: unreviewed imports go where reviewed rows exist; demo rows go unless a trip uses them
    reviewed = Place(name="Reviewed", destination_id=bhola.id, destination_name="Bhola", category="Culture",
                     latitude=22.3, longitude=90.3, source="catalog", source_ref="catalog:x-sight", checked=True)
    old = Place(name="Old import", destination_id=bhola.id, destination_name="Bhola", category="Culture",
                latitude=22.3, longitude=90.3, source="wikivoyage", source_ref="wv:1", checked=False)
    demo_used = Place(name="Demo used", destination_id=bhola.id, destination_name="Bhola", category="Beach",
                      latitude=22.3, longitude=90.3, source="curated")
    demo_free = Hotel(name="Demo hotel", destination_id=bhola.id, destination_name="Bhola", latitude=22.3,
                      longitude=90.3, source="curated")
    session.add_all([reviewed, old, demo_used, demo_free])
    session.flush()
    trip = Trip(title="T", destination="Bhola", total_budget=5000, start_date=datetime(2026, 11, 1).date(),
                end_date=datetime(2026, 11, 1).date())
    session.add(trip)
    session.flush()
    day = Itinerary(trip_id=trip.id, day_number=1, day_date=trip.start_date)
    session.add(day)
    session.flush()
    session.add(ItineraryItem(itinerary_id=day.id, item_type="activity", place_id=demo_used.id, title="Demo used",
                              start_time="09:00", end_time="10:00", duration_minutes=60, order_index=0))
    session.commit()
    t = publish.tidy_destinations(session)
    assert t["unreviewed_hidden"] == 1 and t["demo_deleted"] == 1 and t["demo_kept_for_trips"] == 1
    assert not session.get(Place, old.id).is_active and not session.get(Place, demo_used.id).is_active
    assert session.get(Place, reviewed.id).is_active

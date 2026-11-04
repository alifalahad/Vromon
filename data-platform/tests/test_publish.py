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

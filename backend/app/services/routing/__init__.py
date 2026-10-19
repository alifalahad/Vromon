"""Road distances, times and lines for trip plans (trip planner step 5). See roads.py."""

from app.services.routing.roads import ROADS, Road, RoadNetwork, RoutingUnavailable, Travel, point_of

__all__ = ["ROADS", "Road", "RoadNetwork", "RoutingUnavailable", "Travel", "point_of"]


def prepare_destination(db, destination: str) -> None:
    """Road data between every place and hotel of a destination (asked for once, then kept)."""
    from app.models.models import Hotel, Place
    points = [point_of(p) for p in db.query(Place).filter(Place.destination_name == destination, Place.is_active == True)]  # noqa: E712
    points += [point_of(h) for h in db.query(Hotel).filter(Hotel.destination_name == destination, Hotel.is_active == True)]  # noqa: E712
    ROADS.prepare(db, points)

"""Connectors, one per source or source family. CONNECTORS maps a name to its class."""

from __future__ import annotations


def all_connectors() -> dict[str, type]:
    from vromon_data.connectors.geoboundaries import GeoBoundariesBGD
    from vromon_data.connectors.admin_names import CuratedAdminNames
    from vromon_data.connectors.portal_names import PortalNames
    from vromon_data.connectors.wikidata_attractions import WikidataAttractions
    from vromon_data.connectors.commons_media import CommonsMedia
    from vromon_data.connectors.hubs import OsmHubsBD, OurAirportsBD
    from vromon_data.connectors.railway import RailwayTimetable
    from vromon_data.connectors.railway_fares import RailwayFaresEast
    from vromon_data.connectors.journeys import DistrictJourneys
    from vromon_data.connectors.transcribed_fares import TranscribedFares
    from vromon_data.connectors.gi_register import GiRegister
    from vromon_data.connectors.portal_spots import PortalTouristSpots
    from vromon_data.connectors.service_places import MocatStarHotels, OvertureServicePlaces
    from vromon_data.connectors.prices import HotelWebsiteRates, TcbRetailPrices
    from vromon_data.connectors.wikidata_geo import WikidataGeo
    return {c.name: c for c in (GeoBoundariesBGD, CuratedAdminNames, PortalNames, WikidataAttractions, CommonsMedia,
                                OurAirportsBD, OsmHubsBD, RailwayTimetable, RailwayFaresEast, DistrictJourneys,
                                TranscribedFares, GiRegister, PortalTouristSpots, OvertureServicePlaces,
                                MocatStarHotels, TcbRetailPrices, HotelWebsiteRates, WikidataGeo)}

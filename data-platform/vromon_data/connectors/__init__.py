"""Connectors, one per source or source family. CONNECTORS maps a name to its class."""

from __future__ import annotations


def all_connectors() -> dict[str, type]:
    from vromon_data.connectors.geoboundaries import GeoBoundariesBGD
    from vromon_data.connectors.admin_names import CuratedAdminNames
    from vromon_data.connectors.portal_names import PortalNames
    from vromon_data.connectors.wikidata_attractions import WikidataAttractions
    from vromon_data.connectors.commons_media import CommonsMedia
    return {c.name: c for c in (GeoBoundariesBGD, CuratedAdminNames, PortalNames, WikidataAttractions, CommonsMedia)}

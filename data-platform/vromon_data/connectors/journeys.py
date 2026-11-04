"""
District-to-district road journeys (Phase 6, guideline §3.4): calculated, never official.

Each district's point is its most populous GeoNames town inside the district's outline
(a sourced place on the road network, not a centroid in a field); for districts whose
town isn't in GeoNames' 15,000+ list, the bus terminal (else railway station) nearest the
district's centre. The point used is part of the record (`origin_ref` + coordinates). One OpenRouteService
matrix request per block gives road distance and driving time for every ordered pair;
each result is stored with its engine, profile, network description and time, and marked
as an estimate. Pairs ORS can't route stay without a distance (unknown), never filled
with a straight-line guess. The official fare-chart distances (BRTA, railway) are kept
separately on fares as `official_distance_km`.

Needs ORS_API_KEY (backend .env). Without it the run records that and writes nothing.
"""

from __future__ import annotations

import json
import os
from datetime import datetime
from typing import Any, Iterable

from dotenv import dotenv_values
from shapely.geometry import Point
from sqlalchemy import select

from app.models.catalog import AdminUnit, JourneyCalculation, TransportHub
from app.models.models import City
from app.services.routing.ors import OrsProvider
from vromon_data.admin_lookup import AdminLookup
from vromon_data.db import BACKEND_DIR
from vromon_data.pipeline import Connector, Context, Record

BLOCK = 32  # sources per request: 32 x 64 = 2048 routes, inside ORS's public matrix limit
NETWORK = "openrouteservice public API (OpenStreetMap; extract date not published)"


class DistrictJourneys(Connector):
    name = "district_journeys_ors"
    version = "1"
    source_id = "openrouteservice"
    creates_entities = False

    def _towns(self, ctx: Context) -> list[tuple[AdminUnit, City]]:
        lookup = AdminLookup(ctx.session)
        cities = ctx.session.scalars(select(City).where(City.country_iso2 == "BD")).all()
        best: dict = {}
        for c in cities:
            district = lookup.place(c.lat, c.lon).district_id
            if district and lookup.shapes[district].contains(Point(c.lon, c.lat)):
                if district not in best or c.population > best[district].population:
                    best[district] = c
        units = [u for u in lookup.units.values() if u.level == "district"]
        hubs = ctx.session.scalars(select(TransportHub).where(TransportHub.hub_type.in_(("bus_terminal", "railway_station")),
                                                              TransportHub.latitude.is_not(None))).all()
        for u in units:
            if u.id in best:
                continue
            here = [h for h in hubs if h.district_id == u.id]
            for kind in ("bus_terminal", "railway_station"):
                options = [h for h in here if h.hub_type == kind]
                if options and u.centroid_lat is not None:
                    h = min(options, key=lambda h: (h.latitude - u.centroid_lat) ** 2 + (h.longitude - u.centroid_lon) ** 2)
                    best[u.id] = City(geonameid=0, country_iso2="BD", name=f"hub:{h.slug}", lat=h.latitude, lon=h.longitude,
                                      population=0)
                    ctx.count("district_points_from_hubs")
                    break
            else:
                ctx.error("fetch", "no GeoNames town or hub inside this district", u.slug)
        return sorted(((u, best[u.id]) for u in units if u.id in best), key=lambda x: x[0].slug)

    def fetch(self, ctx: Context):
        self.pairs = self._towns(ctx)
        key = ctx.params.get("api_key") or os.environ.get("ORS_API_KEY") or dotenv_values(BACKEND_DIR / ".env").get("ORS_API_KEY")
        self.results: list[dict] = []
        if ctx.params.get("matrix") is not None:   # tests: canned matrix answers
            self.results = ctx.params["matrix"]
            return []
        if not key:
            ctx.error("fetch", "ORS_API_KEY not set: no journeys calculated", None)
            return []
        ors = OrsProvider(key, timeout=120)
        points = [(c.lat, c.lon) for _, c in self.pairs]
        arts = []
        for start in range(0, len(points), BLOCK):
            km, minutes = ors.matrix(points[start:start + BLOCK], points)
            payload = {"sources_from": start, "km": km, "minutes": minutes}
            arts.append(ctx.store_artifact(uri=f"https://api.heigit.org/openrouteservice/v2/matrix/driving-car#block={start}",
                                           content=json.dumps(payload).encode(), content_type="application/json",
                                           filename_hint=f"matrix-{start}.json"))
            self.results.append(payload)
        return arts

    def parse(self, ctx: Context, arts) -> Iterable[dict[str, Any]]:
        for block in self.results:
            for i, row in enumerate(block["km"]):
                a = block["sources_from"] + i
                for b, km in enumerate(row):
                    if a != b:
                        yield {"id": f"{self.pairs[a][0].slug}->{self.pairs[b][0].slug}", "a": a, "b": b, "km": km,
                               "min": block["minutes"][i][b]}

    def normalize(self, ctx: Context, raw: dict[str, Any]) -> Record:
        return Record(entity_type="journey", source_record_id=raw["id"], fields={"km": raw["km"], "min": raw["min"]}, raw=raw)

    def after(self, ctx: Context, records: list[Record]) -> None:
        s = ctx.session
        now = datetime.utcnow()
        network = f"{NETWORK}, queried {now:%Y-%m-%d}"
        for rec in records:
            (ua, ca), (ub, cb) = self.pairs[rec.raw["a"]], self.pairs[rec.raw["b"]]
            row = s.scalar(select(JourneyCalculation).where(
                JourneyCalculation.origin_ref == f"admin_unit:{ua.slug}", JourneyCalculation.destination_ref == f"admin_unit:{ub.slug}",
                JourneyCalculation.mode == "road", JourneyCalculation.engine == "openrouteservice",
                JourneyCalculation.network_version == network))
            if row is None:
                row = JourneyCalculation(origin_ref=f"admin_unit:{ua.slug}", destination_ref=f"admin_unit:{ub.slug}", mode="road",
                                         engine="openrouteservice", profile="driving-car", network_version=network)
                s.add(row)
            row.origin_lat, row.origin_lon, row.destination_lat, row.destination_lon = ca.lat, ca.lon, cb.lat, cb.lon
            row.distance_km = round(rec.raw["km"], 1) if rec.raw["km"] is not None else None
            row.duration_min = round(rec.raw["min"]) if rec.raw["min"] is not None else None
            row.is_estimate, row.calculated_at = True, now
            ctx.count("journeys" if row.distance_km is not None else "journeys_unroutable")
        s.flush()

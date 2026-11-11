"""
Transport hubs (Phase 4).

  ourairports_bd   airports with scheduled service in Bangladesh (OurAirports, public domain)
  osm_hubs_bd      railway stations and halts, bus stations, ferry terminals (OpenStreetMap via
                   Overpass, ODbL). OSM is used for hubs by the owner's decision (2026-11-04);
                   these rows carry OSM attribution and stay community-sourced in field_status.

Hubs are infrastructure points: claims are accepted and the hub is published, with its
source and reliability class visible to the app. Each hub is placed in its district and
sub-district from Vromon's boundaries; points near a border go to review.
"""

from __future__ import annotations

import csv
import io
import json
import uuid
from typing import Any, Iterable

from sqlalchemy import select

from app.models.catalog import TransportHub
from vromon_data import http
from vromon_data.admin_lookup import AdminLookup
from vromon_data.pipeline import Connector, Context, Record
from vromon_data.text import bn_to_latin, clean, slugify

OURAIRPORTS_CSV = "https://davidmegginson.github.io/ourairports-data/airports.csv"
OVERPASS = "https://overpass-api.de/api/interpreter"
OVERPASS_QUERY = """
[out:json][timeout:180];
area["ISO3166-1"="BD"][admin_level=2]->.bd;
(
  nwr["railway"~"^(station|halt)$"](area.bd);
  nwr["amenity"="bus_station"](area.bd);
  nwr["amenity"="ferry_terminal"](area.bd);
);
out center tags;
"""


def _hub_fields(lookup: AdminLookup, lat: float, lon: float, name_en, name_bn, hub_type: str, **extra) -> tuple[dict, bool]:
    place = lookup.place(lat, lon)
    if not place.in_country:
        raise ValueError(f"{lat},{lon} is outside Bangladesh")
    fields = {"name_en": clean(name_en), "name_bn": clean(name_bn), "hub_type": hub_type,
              "latitude": round(lat, 6), "longitude": round(lon, 6),
              "division_id": str(place.division_id) if place.division_id else None,
              "district_id": str(place.district_id) if place.district_id else None,
              "subdistrict_id": str(place.subdistrict_id) if place.subdistrict_id else None, **extra}
    return fields, place.near_edge


class _HubConnector(Connector):
    auto_accept = True
    order = ("transport_hub",)

    def create(self, ctx: Context, record: Record) -> uuid.UUID:
        f = record.fields
        name = f.get("name_en") or (bn_to_latin(f["name_bn"]) if f.get("name_bn") else record.source_record_id)
        district = self.lookup.units.get(uuid.UUID(f["district_id"])) if f.get("district_id") else None
        base = f"{(district.slug.removeprefix('bd-district-') + '-') if district else ''}{slugify(name)}-{f['hub_type'].replace('_', '-')}"
        slug = base
        if ctx.session.scalar(select(TransportHub.id).where(TransportHub.slug == slug)):
            slug = f"{base}-{slugify(record.source_record_id)[-10:]}"
        hub = TransportHub(slug=slug, hub_type=f["hub_type"], status="published", created_by_job_id=ctx.job.id, field_status={})
        ctx.session.add(hub)
        ctx.session.flush()
        return hub.id


class OurAirportsBD(_HubConnector):
    name = "ourairports_bd"
    version = "1"
    source_id = "ourairports"

    def fetch(self, ctx: Context):
        self.lookup = AdminLookup(ctx.session)
        if ctx.params.get("csv") is not None:
            content = ctx.params["csv"].encode()
        else:
            with http.client(timeout=120) as c:
                r = http.get(c, OURAIRPORTS_CSV, check_robots=False)
                r.raise_for_status()
                content = r.content
        self.art = ctx.store_artifact(uri=OURAIRPORTS_CSV, content=content, content_type="text/csv", filename_hint="airports.csv")
        self.rows = list(csv.DictReader(io.StringIO(content.decode("utf-8"))))
        return [self.art]

    def parse(self, ctx: Context, arts) -> Iterable[dict[str, Any]]:
        for r in self.rows:
            if r["iso_country"] == "BD" and r["scheduled_service"] == "yes" and r["type"] in ("large_airport", "medium_airport", "small_airport"):
                yield {**r, "id": r["ident"]}

    def normalize(self, ctx: Context, raw: dict[str, Any]) -> Record | None:
        try:
            fields, edge = _hub_fields(self.lookup, float(raw["latitude_deg"]), float(raw["longitude_deg"]), raw["name"], None,
                                       "airport", iata_code=raw.get("iata_code") or None)
        except ValueError:
            ctx.count("skipped_outside_bangladesh")
            return None
        rec = Record(entity_type="transport_hub", source_record_id=raw["ident"], fields=fields,
                     raw={k: raw[k] for k in ("ident", "type", "name", "municipality", "iata_code")},
                     external_ids=[("icao", raw["ident"])] + ([("iata", raw["iata_code"])] if raw.get("iata_code") else []),
                     names=[("en", raw["name"], "official")], artifact_id=self.art.id,
                     source_url=f"https://ourairports.com/airports/{raw['ident']}/", confidence="high")
        if edge:
            rec.review.append(("missing_admin_area", {"reason": "airport near a district border"}))
        return rec


OSM_TYPES = {("railway", "station"): "railway_station", ("railway", "halt"): "railway_halt",
             ("amenity", "bus_station"): "bus_terminal", ("amenity", "ferry_terminal"): "ferry_terminal"}


class OsmHubsBD(_HubConnector):
    name = "osm_hubs_bd"
    version = "1"
    source_id = "osm_overpass"

    def fetch(self, ctx: Context):
        self.lookup = AdminLookup(ctx.session)
        if ctx.params.get("overpass") is not None:
            content = json.dumps(ctx.params["overpass"]).encode()
        else:
            with http.client(timeout=300) as c:
                r = c.post(OVERPASS, data={"data": OVERPASS_QUERY})
                r.raise_for_status()
                content = r.content
        self.art = ctx.store_artifact(uri=f"{OVERPASS}#transport-hubs-bd", content=content, content_type="application/json",
                                      filename_hint="overpass-hubs.json")
        self.elements = json.loads(content)["elements"]
        return [self.art]

    def parse(self, ctx: Context, arts) -> Iterable[dict[str, Any]]:
        for e in self.elements:
            yield {**e, "id": f"{e['type']}/{e['id']}"}

    def normalize(self, ctx: Context, raw: dict[str, Any]) -> Record | None:
        tags = raw.get("tags", {})
        hub_type = next((t for (k, v), t in OSM_TYPES.items() if tags.get(k) == v), None)
        lat = raw.get("lat", (raw.get("center") or {}).get("lat"))
        lon = raw.get("lon", (raw.get("center") or {}).get("lon"))
        name_en = tags.get("name:en") or (tags.get("name") if tags.get("name", "").isascii() else None)
        name_bn = tags.get("name:bn") or (tags.get("name") if tags.get("name") and not tags["name"].isascii() else None)
        if hub_type is None or lat is None or not (name_en or name_bn):
            ctx.count("skipped_unnamed_or_untyped")
            return None
        try:
            fields, edge = _hub_fields(self.lookup, lat, lon, name_en, name_bn, hub_type, operator_name=clean(tags.get("operator")))
        except ValueError:
            ctx.count("skipped_outside_bangladesh")
            return None
        names = [(l, n, "label") for l, n in (("en", name_en), ("bn", name_bn)) if n]
        for k in ("alt_name", "old_name", "official_name"):
            if tags.get(k):
                names.append(("bn" if not tags[k].isascii() else "en", tags[k], "alias"))
        rec = Record(entity_type="transport_hub", source_record_id=raw["id"], fields=fields, raw={"tags": tags},
                     external_ids=[("osm", raw["id"])], names=names, artifact_id=self.art.id,
                     source_url=f"https://www.openstreetmap.org/{raw['id']}", confidence="medium")
        if edge:
            rec.review.append(("missing_admin_area", {"reason": "hub near a district border"}))
        return rec

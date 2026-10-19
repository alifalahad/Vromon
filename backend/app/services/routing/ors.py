"""
OpenRouteService (openrouteservice.org): road distances and times from
OpenStreetMap. The only file that knows about it; a self-hosted OSRM would be
another `RoadProvider` next to this one.

Matrix: POST /v2/matrix/driving-car. Road lines: POST /v2/directions/driving-car/geojson.
The key is sent in the Authorization header and stays on the server.
"""

from __future__ import annotations

from typing import Optional, Sequence

import httpx

from app.services.routing.roads import Point, RoutingUnavailable

PROFILE = "driving-car"


class OrsProvider:
    name = "ors"

    def __init__(self, api_key: str, base_url: str = "https://api.heigit.org/openrouteservice", timeout: float = 10.0):
        # The road-line answer is GeoJSON: it has to be accepted explicitly (406 otherwise)
        self._headers = {"Authorization": api_key, "Content-Type": "application/json", "Accept": "application/json, application/geo+json"}
        self._base = base_url.rstrip("/")
        self._timeout = timeout

    def _post(self, path: str, body: dict) -> dict:
        try:
            r = httpx.post(f"{self._base}{path}", headers=self._headers, json=body, timeout=self._timeout)
        except httpx.HTTPError as exc:
            raise RoutingUnavailable(f"OpenRouteService unreachable: {exc}") from exc
        if r.status_code != 200:
            try:
                detail = r.json().get("error")
            except ValueError:
                detail = r.text[:200]
            # 4xx other than the limits (401/403/429): this request can't be answered, the service is fine
            temporary = r.status_code >= 500 or r.status_code in (401, 403, 429)
            raise RoutingUnavailable(f"OpenRouteService answered {r.status_code}: {detail}", temporary=temporary)
        return r.json()

    def matrix(self, sources: Sequence[Point], destinations: Sequence[Point]):
        locations = [[p[1], p[0]] for p in [*sources, *destinations]]
        n = len(sources)
        data = self._post(
            f"/v2/matrix/{PROFILE}",
            {
                "locations": locations,
                "sources": list(range(n)),
                "destinations": list(range(n, len(locations))),
                "metrics": ["distance", "duration"],
                "units": "km",
            },
        )
        km = data.get("distances") or []
        secs = data.get("durations") or []
        minutes: list[list[Optional[float]]] = [[s / 60 if s is not None else None for s in row] for row in secs]
        return km, minutes

    def route(self, points: Sequence[Point]):
        data = self._post(
            f"/v2/directions/{PROFILE}/geojson",
            # Places like beaches can be a little way from a road: look up to 1 km for one, no further
            {"coordinates": [[p[1], p[0]] for p in points], "radiuses": [1000] * len(points)},
        )
        try:
            feature = data["features"][0]
            coords = feature["geometry"]["coordinates"]
            props = feature["properties"]
            legs = [(s.get("distance", 0) / 1000, s.get("duration", 0) / 60) for s in props.get("segments", [])]
            way = props.get("way_points", [])
        except (KeyError, IndexError, TypeError) as exc:
            raise RoutingUnavailable(f"Unexpected OpenRouteService answer: {exc}") from exc
        return coords, legs, way

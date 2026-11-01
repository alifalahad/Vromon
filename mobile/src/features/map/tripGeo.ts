/**
 * Trips and destinations as map data (map home step 5): trails of finished
 * trips, the arc to the coming trip, and the places Vromon can plan (their names).
 * Pure functions, so the GeoJSON is rebuilt only when the data changes.
 *
 * Trails are decoration: gentle arcs through a trip's stops, not roads.
 */

import type { Destination, Trip } from '../../types';
import { countryLabelPoint, HOME_REGIONS } from './geoData';

type LngLat = [number, number];

const ARC_STEPS = 24;

/** A gentle curve from a to b (quadratic, bent to one side by `bend` of its length). */
export function arc(a: LngLat, b: LngLat, bend = 0.18): LngLat[] {
  const [x1, y1] = a;
  const [x2, y2] = b;
  const cx = (x1 + x2) / 2 - (y2 - y1) * bend;
  const cy = (y1 + y2) / 2 + (x2 - x1) * bend;
  return Array.from({ length: ARC_STEPS + 1 }, (_, i) => {
    const t = i / ARC_STEPS;
    const u = 1 - t;
    return [round(u * u * x1 + 2 * u * t * cx + t * t * x2), round(u * u * y1 + 2 * u * t * cy + t * t * y2)];
  });
}

const round = (v: number) => Math.round(v * 1e5) / 1e5;

/** A trip's stops with a position, in order. */
export function stopPoints(trip: Trip): LngLat[] {
  return (trip.stops ?? [])
    .slice()
    .sort((a, b) => a.position - b.position)
    .filter((s) => s.lat != null && s.lon != null)
    .map((s) => [s.lon!, s.lat!]);
}

/** Trails of trips that have ended: one line per trip with two or more placed stops. */
export function trailsGeoJSON(trips: readonly Trip[], today: string): GeoJSON.FeatureCollection<GeoJSON.LineString> {
  const features: GeoJSON.Feature<GeoJSON.LineString>[] = [];
  for (const trip of trips) {
    if (trip.end_date >= today) continue;
    const points = stopPoints(trip);
    if (points.length < 2) continue;
    const coordinates = points.slice(1).flatMap((p, i) => arc(points[i], p, i % 2 ? -0.16 : 0.16).slice(i === 0 ? 0 : 1));
    features.push({ type: 'Feature', properties: { trip: trip.id }, geometry: { type: 'LineString', coordinates } });
  }
  return { type: 'FeatureCollection', features };
}

/** Where the user starts from: the region they live in (its label), else their home country's label point. */
export function homePoint(livedRegion: string | null, home: string): LngLat | null {
  const region = livedRegion ? HOME_REGIONS.features.find((f) => f.properties.code === livedRegion) : undefined;
  return region ? region.properties.label : (countryLabelPoint(home) ?? null);
}

/**
 * The coming trip: a dashed arc from where it starts (its first stop when it has
 * a route, else home) to where it goes (its last stop, else the destination).
 */
export function upcomingGeoJSON(
  trip: Trip | null,
  destinations: readonly Destination[],
  from: LngLat | null,
): { line: GeoJSON.FeatureCollection<GeoJSON.LineString>; pin: GeoJSON.FeatureCollection<GeoJSON.Point> } {
  const empty = { line: { type: 'FeatureCollection' as const, features: [] }, pin: { type: 'FeatureCollection' as const, features: [] } };
  if (!trip) return empty;
  const points = stopPoints(trip);
  const dest = destinations.find((d) => d.name === trip.destination);
  const to: LngLat | null = points.length ? points[points.length - 1] : dest?.latitude != null && dest.longitude != null ? [dest.longitude, dest.latitude] : null;
  if (!to) return empty;
  const start = points.length > 1 ? points[0] : from;
  const name = trip.title || trip.destination;
  return {
    line:
      start && (start[0] !== to[0] || start[1] !== to[1])
        ? { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: arc(start, to, -0.16) } }] }
        : empty.line,
    pin: { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { name, trip: trip.id }, geometry: { type: 'Point', coordinates: to } }] },
  };
}

/** Places Vromon can plan (active destinations with a position). */
export function destinationsGeoJSON(destinations: readonly Destination[], skip?: string): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: 'FeatureCollection',
    features: destinations
      .filter((d) => d.latitude != null && d.longitude != null && (d.latitude !== 0 || d.longitude !== 0) && d.name !== skip)
      .map((d) => ({ type: 'Feature', properties: { id: d.id, name: d.name }, geometry: { type: 'Point', coordinates: [d.longitude!, d.latitude!] } })),
  };
}

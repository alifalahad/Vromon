/**
 * Today's route as map data (map home step 7): the day's stops in order, legs
 * that are done (solid), the next one (from you, or from the stop before), and
 * the rest (dotted), and numbered pins. Pure, from the same TodayState as Today mode.
 */

import type { LngLatBounds } from '@maplibre/maplibre-react-native';

import type { ItineraryDay, ItineraryItem } from '../../types';
import { stopTitle } from '../trips/plan/timeline';
import { pointOf, t2m, type Point, type TodayState } from '../trips/today/today';

export type LegKind = 'done' | 'next' | 'later';
export type PinKind = 'done' | 'next' | 'later';

const lngLat = (p: Point): [number, number] => [p.lon, p.lat];

export function todayGeoJSON(
  day: ItineraryDay,
  state: TodayState,
  here: Point | null,
): { legs: GeoJSON.FeatureCollection<GeoJSON.LineString>; pins: GeoJSON.FeatureCollection<GeoJSON.Point> } {
  const stops = [...day.items]
    .sort((a, b) => t2m(a.start_time) - t2m(b.start_time) || a.order_index - b.order_index)
    .filter((i) => pointOf(i));
  const done = new Set(state.done.map((i) => i.id));
  const next = state.next;
  const kindOf = (i: ItineraryItem): PinKind => (done.has(i.id) ? 'done' : next && i.id === next.id ? 'next' : 'later');

  const legs: GeoJSON.Feature<GeoJSON.LineString>[] = [];
  stops.slice(1).forEach((to, i) => {
    const from = stops[i];
    const kind: LegKind = done.has(to.id) ? 'done' : next && to.id === next.id ? 'next' : 'later';
    // The next leg starts where you are, when location is on
    const start = kind === 'next' && here ? lngLat(here) : lngLat(pointOf(from)!);
    legs.push({ type: 'Feature', properties: { kind }, geometry: { type: 'LineString', coordinates: [start, lngLat(pointOf(to)!)] } });
  });
  if (next && here && stops[0]?.id === next.id) {
    legs.push({ type: 'Feature', properties: { kind: 'next' }, geometry: { type: 'LineString', coordinates: [lngLat(here), lngLat(pointOf(next)!)] } });
  }

  const pins = stops.map((item, i): GeoJSON.Feature<GeoJSON.Point> => {
    const kind = kindOf(item);
    return {
      type: 'Feature',
      properties: { n: String(i + 1), kind, label: kind === 'next' ? `${stopTitle(item)} · ${item.start_time}` : '' },
      geometry: { type: 'Point', coordinates: lngLat(pointOf(item)!) },
    };
  });
  return { legs: { type: 'FeatureCollection', features: legs }, pins: { type: 'FeatureCollection', features: pins } };
}

/** A box around the day's stops (and you), or null without any. */
export function todayBounds(day: ItineraryDay | null, here: Point | null): LngLatBounds | null {
  const points = [...(day?.items ?? []).map((i) => pointOf(i)).filter((p): p is Point => !!p), ...(here ? [here] : [])];
  if (points.length === 0) return null;
  const lons = points.map((p) => p.lon);
  const lats = points.map((p) => p.lat);
  // At least ~2 km across, so one stop isn't a street-level zoom
  const pad = 0.01;
  return [Math.min(...lons) - pad, Math.min(...lats) - pad, Math.max(...lons) + pad, Math.max(...lats) + pad];
}

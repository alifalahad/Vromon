/**
 * The home country on the map (map home step 2): where the map opens, how many
 * of its regions you've been to, and what its regions are called.
 */

import type { LngLatBounds } from '@maplibre/maplibre-react-native';

import type { Visit } from '../../types';
import { COUNTRIES, HOME_REGIONS } from './geoData';

/** Until the user picks one in Settings */
export const DEFAULT_HOME = 'BD';

/** Countries whose regions ship with the app (drawn offline, from home-regions.json). */
export const BUNDLED_HOMES: readonly string[] = [...new Set(HOME_REGIONS.features.map((f) => f.properties.country))];

export type RegionWord = 'divisions' | 'regions';

// What a country calls its regions; the rest are "Regions"
const REGION_WORD: Record<string, RegionWord> = { BD: 'divisions' };

export const regionWord = (iso2: string): RegionWord => REGION_WORD[iso2] ?? 'regions';

const VISITED = new Set(['visited', 'lived']);

const bounds = new Map<string, LngLatBounds | null>();

/**
 * The box around a country's largest part, so islands and overseas territories
 * (France, the United States) don't zoom the map out to half the world.
 */
export function countryBounds(iso2: string): LngLatBounds | null {
  if (bounds.has(iso2)) return bounds.get(iso2)!;
  let best: LngLatBounds | null = null;
  let bestArea = -1;
  for (const f of COUNTRIES.features) {
    if (f.properties?.iso2 !== iso2) continue;
    const g = f.geometry;
    const parts = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
    for (const p of parts) {
      const lons = p[0].map((c) => c[0]);
      const lats = p[0].map((c) => c[1]);
      const box: LngLatBounds = [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)];
      const area = (box[2] - box[0]) * (box[3] - box[1]);
      if (area > bestArea) [best, bestArea] = [box, area];
    }
  }
  bounds.set(iso2, best);
  return best;
}

/** Home regions visited or lived in, out of all of them; null when the regions aren't bundled. */
export function homeRegionProgress(visits: readonly Visit[], iso2: string): { done: number; total: number } | null {
  const total = HOME_REGIONS.features.filter((f) => f.properties.country === iso2).length;
  if (total === 0) return null;
  const done = visits.filter(
    (v) => v.place_type === 'region' && VISITED.has(v.status) && (v.country_iso2 ?? v.place_code.slice(0, 2)) === iso2,
  ).length;
  return { done: Math.min(done, total), total };
}

/** Countries visited or lived in. */
export const countriesVisited = (visits: readonly Visit[]) =>
  visits.filter((v) => v.place_type === 'country' && VISITED.has(v.status)).length;

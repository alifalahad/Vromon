/**
 * What the Map Theme preview shows: the user's own countries, or, when they have
 * none yet (and for friend comparison until Friends exist), a sample set that the
 * screen labels as a sample. Prompt §6.6.
 */

import type { LngLatBounds } from '@maplibre/maplibre-react-native';

import type { Visit, VisitStatus } from '../../types';

/** The Europe crop of the reference preview (03–07). */
export const EUROPE: LngLatBounds = [-10, 36, 38, 67];

const sample = (status: VisitStatus) => (place_code: string): Visit => ({
  place_type: 'country',
  place_code,
  status,
  first_visited_on: null,
  last_visited_on: null,
  note: null,
  updated_at: '',
});

/** Sample countries for the Map preview (the countries filled in 03–06). */
export const SAMPLE_VISITS: readonly Visit[] = [
  ...['NO', 'FI', 'DE', 'FR', 'ES', 'UA', 'GR'].map(sample('visited')),
  sample('lived')('IT'),
  ...['PL', 'HR'].map(sample('want')),
];

/** Sample comparison for the Friends preview (07). */
export const SAMPLE_COMPARE = {
  mine: ['NO', 'FI', 'UA', 'GR', 'DE', 'FR', 'IT', 'ES'],
  theirs: ['DE', 'FR', 'IT', 'ES', 'PT', 'CH', 'HR', 'TN'],
} as const;

/**
 * A view around the given country label points, with padding and a minimum
 * span so one small country doesn't fill the preview. Europe when empty.
 */
export function previewBounds(points: readonly [number, number][]): LngLatBounds {
  if (points.length === 0) return EUROPE;
  const lons = points.map((p) => p[0]);
  const lats = points.map((p) => p[1]);
  const [w, e, s, n] = [Math.min(...lons), Math.max(...lons), Math.min(...lats), Math.max(...lats)];
  const spanX = Math.max(e - w + 20, 40);
  const spanY = Math.max(n - s + 12, 26);
  const cx = (w + e) / 2;
  const cy = Math.min(Math.max((s + n) / 2, -55), 65);
  const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);
  return [clamp(cx - spanX / 2, -180, 180), clamp(cy - spanY / 2, -70, 80), clamp(cx + spanX / 2, -180, 180), clamp(cy + spanY / 2, -70, 80)];
}

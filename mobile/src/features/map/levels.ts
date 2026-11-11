/**
 * What the map shows at each zoom (there's no Countries / Divisions / Cities switch any more):
 * zoomed out, countries; at a country's zoom, its divisions (regions elsewhere); closer in,
 * Bangladesh's districts; closest, every city's dot. A tap marks what's showing there.
 */

import { DISTRICTS_FROM } from './style';

export type MapLevel = 'country' | 'region' | 'district' | 'city';

/** Up to here a country is coloured as a whole (it or anything in it marked) */
export const GLOBE_UNTIL = 3.8;
/** Divisions / regions take over: their colours show and a tap marks one */
export const REGIONS_FROM = 4.6;
/** Bangladesh's districts take over from its divisions (their names come at DISTRICTS_FROM) */
export const DISTRICTS_TAP_FROM = DISTRICTS_FROM - 0.2;
/** Every city's dot (marked cities show from REGIONS_FROM) */
export const CITIES_FROM = 7.5;

export function levelAt(zoom: number): MapLevel {
  if (zoom < REGIONS_FROM) return 'country';
  if (zoom < DISTRICTS_TAP_FROM) return 'region';
  if (zoom < CITIES_FROM) return 'district';
  return 'city';
}

/** A fill that fades in over the 0.6 zoom before `from` and thins out close up (street level) */
export function fadeInFrom(from: number, full = 0.85) {
  return ['interpolate', ['linear'], ['zoom'], from - 0.6, 0, from, full, 11, 0.3] as never;
}

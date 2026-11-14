/**
 * "Your travels" (docs/ui-refresh step 2): every number on the dashboard and the list behind it,
 * from one function each, so a count and its list can never disagree. Everything comes from the
 * user's own marks (offline) and trips; names of regions and cities from the bundled data or the
 * server's lookup (useTravelPlaces).
 *
 * Counts follow what the user marked, as the server's stats do: a visited city doesn't add its
 * country.
 */

import type { Trip, Visit, VisitStatus } from '../../types';
import { durationDays, tripPhase } from '../trips/dates';
import { HOME_DISTRICT_AREAS, HOME_REGIONS } from './geoData';

export type BeenStatus = Extract<VisitStatus, 'visited' | 'lived'>;
const BEEN = new Set<VisitStatus>(['visited', 'lived']);

const been = (v: Visit) => BEEN.has(v.status);
/** Lived first, then by when first visited (newest first), then by code */
const order = (a: Visit, b: Visit) =>
  Number(b.status === 'lived') - Number(a.status === 'lived') ||
  (b.first_visited_on ?? '').localeCompare(a.first_visited_on ?? '') ||
  a.place_code.localeCompare(b.place_code);

/** The country a mark is in (regions and districts carry it in their code). */
export function countryOf(v: Visit): string {
  if (v.place_type === 'country') return v.place_code;
  return v.country_iso2 ?? v.place_code.slice(0, 2);
}

/** Countries visited or lived in. */
export const beenCountries = (visits: readonly Visit[]) => visits.filter((v) => v.place_type === 'country' && been(v)).sort(order);

/** Regions (divisions) visited or lived in, optionally in one country. */
export const beenRegions = (visits: readonly Visit[], country?: string) =>
  visits.filter((v) => v.place_type === 'region' && been(v) && (!country || countryOf(v) === country)).sort(order);

/** Bangladesh's districts visited or lived in, optionally in one division. */
export function beenDistricts(visits: readonly Visit[], division?: string): Visit[] {
  const inDivision = division ? new Set(HOME_DISTRICT_AREAS.features.filter((f) => f.properties.region === division).map((f) => f.properties.code)) : null;
  return visits.filter((v) => v.place_type === 'district' && been(v) && (!inDivision || inDivision.has(v.place_code))).sort(order);
}

/** Cities visited or lived in, optionally in one country or one region (the region needs the lookup). */
export function beenCities(visits: readonly Visit[], filter: { country?: string; region?: string; regionOf?: (code: string) => string | null } = {}): Visit[] {
  return visits
    .filter((v) => v.place_type === 'city' && been(v))
    .filter((v) => !filter.country || countryOf(v) === filter.country)
    .filter((v) => !filter.region || filter.regionOf?.(v.place_code) === filter.region)
    .sort(order);
}

/** The Want list, newest first. */
export const wantList = (visits: readonly Visit[]) =>
  visits.filter((v) => v.status === 'want').sort((a, b) => b.updated_at.localeCompare(a.updated_at) || a.place_code.localeCompare(b.place_code));

/** The bundled regions of a country (Bangladesh's 8 divisions), or null when they aren't bundled. */
export function bundledRegions(country: string): { code: string; name: string; name_bn: string }[] | null {
  const list = HOME_REGIONS.features.filter((f) => f.properties.country === country).map((f) => f.properties);
  return list.length ? list : null;
}

/** Bangladesh's districts, optionally in one division. */
export function bundledDistricts(division?: string) {
  return HOME_DISTRICT_AREAS.features.map((f) => f.properties).filter((p) => !division || p.region === division);
}

/** Trips whose last day has passed (as the server's stats count them), newest first. */
export function finishedTrips(trips: readonly Trip[], today: string): Trip[] {
  return trips.filter((t) => tripPhase(t.start_date, t.end_date, today) === 'past').sort((a, b) => b.end_date.localeCompare(a.end_date));
}

/** Trips not started yet. */
export const comingTrips = (trips: readonly Trip[], today: string) => trips.filter((t) => tripPhase(t.start_date, t.end_date, today) === 'upcoming');

/** Days away on finished trips, first and last day included. */
export const daysOnTheRoad = (trips: readonly Trip[]) => trips.reduce((sum, t) => sum + durationDays(t.start_date, t.end_date), 0);

/** Finished trips that went to a country (by their stops, else the destination's country: Bangladesh). */
export function finishedTripsIn(trips: readonly Trip[], today: string, country: string): Trip[] {
  return finishedTrips(trips, today).filter((t) => (t.stops?.length ? t.stops.some((s) => s.country_iso2 === country) : country === 'BD'));
}

/** An upcoming trip with a stop in this region, if any (the soonest). */
export function tripInto(trips: readonly Trip[], today: string, region: string): Trip | undefined {
  return comingTrips(trips, today)
    .filter((t) => t.stops?.some((s) => s.region_code === region))
    .sort((a, b) => a.start_date.localeCompare(b.start_date))[0];
}

export type TravelSummary = {
  countries: number;
  /** The home country's regions, when they're bundled: done of total */
  homeRegions: { done: number; total: number } | null;
  /** Bangladesh's districts, when home is Bangladesh */
  districts: { done: number; total: number } | null;
  cities: number;
  trips: number;
  coming: number;
  days: number;
  want: number;
};

/** The dashboard's numbers: each is the length of the list its tile opens. */
export function travelSummary(visits: readonly Visit[], home: string, trips: readonly Trip[], today: string): TravelSummary {
  const regions = bundledRegions(home);
  const finished = finishedTrips(trips, today);
  return {
    countries: beenCountries(visits).length,
    homeRegions: regions ? { done: beenRegions(visits, home).length, total: regions.length } : null,
    districts: home === 'BD' ? { done: beenDistricts(visits).length, total: bundledDistricts().length } : null,
    cities: beenCities(visits).length,
    trips: finished.length,
    coming: comingTrips(trips, today).length,
    days: daysOnTheRoad(finished),
    want: wantList(visits).length,
  };
}

/** The year a place was first visited, when known. */
export const firstYear = (v: Visit) => (v.first_visited_on ? Number(v.first_visited_on.slice(0, 4)) : null);

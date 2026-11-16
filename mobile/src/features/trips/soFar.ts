/**
 * "Your trips so far" (docs/ui-refresh step 9): the trips behind each number. The server says which
 * trips (TripStats); these pick them out of the trips the app already has.
 */

import type { Trip, TripStats } from '../../types';

/** The trips behind a list of ids, in that order (any the app doesn't have are left out) */
export function tripsFor(ids: readonly number[], trips: readonly Trip[]): Trip[] {
  const byId = new Map(trips.map((t) => [t.id, t]));
  return ids.flatMap((id) => byId.get(id) ?? []);
}

/** What the screen shows for its params: everything, a year's trips, or a city's */
export function filterOf(stats: TripStats, params: { year?: string; city?: string }): { title: string | null; ids: number[] } | null {
  if (params.year) {
    const row = stats.per_year.find((y) => String(y.year) === params.year);
    return { title: params.year, ids: row?.trip_ids ?? [] };
  }
  if (params.city) {
    const city = stats.places.cities.find((c) => String(c.geonameid) === params.city);
    return { title: city?.name ?? null, ids: city?.trip_ids ?? [] };
  }
  return null;
}

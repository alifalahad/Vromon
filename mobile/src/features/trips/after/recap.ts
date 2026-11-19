/**
 * After the trip (docs/ui-refresh step 16, frame 33), as pure data (unit-tested): the numbers on "Your trip",
 * each stop's rating, what "Put this trip on your map?" will mark, and the dates "Plan it again" offers first.
 */

import type { ItineraryDay, ReviewThing, Trip } from '../../../types';
import { addDays, durationDays } from '../dates';
import { dayCounts, planRows } from '../plan/timeline';

export type Recap = {
  days: number;
  /** The plan's stops that are places (not meals); null without a plan (where you went isn't known) */
  places: number | null;
  /** The plan's rides added up, from and back to the stay included; null without a plan */
  km: number | null;
};

/** "3 days, 9 places, 118 km on the road there" from the trip's dates and its plan. */
export function recapNumbers(trip: Pick<Trip, 'start_date' | 'end_date'>, days: readonly ItineraryDay[]): Recap {
  const total = durationDays(trip.start_date, trip.end_date);
  if (!days.length) return { days: total, places: null, km: null };
  let places = 0;
  let km = 0;
  for (const day of days) {
    const rows = planRows(day);
    places += dayCounts(rows).places;
    for (const r of rows) if (r.kind === 'leg') km += r.km;
    km += (day.start_leg?.km ?? 0) + (day.return_leg?.km ?? 0);
  }
  return { days: total, places, km: Math.round(km) };
}

/** A stop's rating ("Good", "Bad", or not yet), when it's a thing you can rate (a place, a meal at a restaurant). */
export function ratingFor(things: readonly ReviewThing[] | undefined, itemId: number): ReviewThing | null {
  return things?.find((x) => x.item_id === itemId && (x.target_type === 'place' || x.target_type === 'restaurant')) ?? null;
}

/**
 * What "Mark visited" puts on the map that isn't there yet: each stop's city (or its country, for a stop
 * without one), once, in the route's order. `visited` holds "city:<id>" / "country:<iso2>"; without it
 * (not loaded) every stop is named.
 */
export function placesToMark(trip: Pick<Trip, 'stops'>, visited: ReadonlySet<string> | null): string[] {
  const names: string[] = [];
  for (const s of [...(trip.stops ?? [])].sort((a, b) => a.position - b.position)) {
    const key = s.city_geonameid ? `city:${s.city_geonameid}` : `country:${s.country_iso2}`;
    if (visited?.has(key)) continue;
    const name = plainName(s.city_name ?? s.country_name);
    if (!names.includes(name)) names.push(name);
  }
  return names;
}

/** A city as people write it: "Cox’s Bāzār" → "Cox's Bazar" (the server's plain_name). */
export function plainName(name: string): string {
  return name.replace(/’/g, "'").normalize('NFKD').replace(/[̀-ͯ]/g, '');
}

/** "Plan it again" first offers the same number of days, from a week after today. */
export function againDates(trip: Pick<Trip, 'start_date' | 'end_date'>, today: string): { start: string; end: string } {
  const start = addDays(today, 7);
  return { start, end: addDays(start, durationDays(trip.start_date, trip.end_date) - 1) };
}

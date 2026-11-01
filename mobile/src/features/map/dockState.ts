/**
 * What the dock (map home step 4) shows: one card that follows the moment.
 *
 * 1. today: a trip whose dates include today
 * 2. upcoming: the soonest trip starting within UPCOMING_DAYS
 * 3. social: with the Friends layer on, the newest place a friend marked
 * 4. idea: places on the Want list that Vromon can plan (a destination in that
 *    region or country), newest wish first
 * 5. empty: nothing above
 */

import type { Destination, FriendFootprint, Trip, Visit } from '../../types';
import { durationDays } from '../trips/dates';

export const UPCOMING_DAYS = 30;

export type Idea = { destination: Destination; place: Visit };

export type DockState =
  | { kind: 'today'; trip: Trip; day: number; days: number }
  | { kind: 'upcoming'; trip: Trip; daysAway: number }
  | { kind: 'social'; footprint: FriendFootprint }
  | { kind: 'idea'; ideas: Idea[] }
  | { kind: 'empty' };

const byStart = (a: Trip, b: Trip) => a.start_date.localeCompare(b.start_date) || a.id - b.id;

/** Want-list places with a destination there, one card per destination. */
export function ideasFrom(visits: readonly Visit[], destinations: readonly Destination[], trips: readonly Trip[], today: string): Idea[] {
  // A destination with a trip still to come is in hand, not an idea
  const planned = new Set(trips.filter((t) => t.end_date >= today).map((t) => t.destination));
  const wants = visits.filter((v) => v.status === 'want').sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  const seen = new Set<number>();
  const out: Idea[] = [];
  for (const place of wants) {
    const matches = destinations.filter((d) =>
      place.place_type === 'region' ? d.region_code === place.place_code : place.place_type === 'country' ? d.country_iso2 === place.place_code : false,
    );
    for (const destination of matches) {
      if (seen.has(destination.id) || planned.has(destination.name)) continue;
      seen.add(destination.id);
      out.push({ destination, place });
    }
  }
  return out;
}

export function pickDockState(
  trips: readonly Trip[],
  visits: readonly Visit[],
  destinations: readonly Destination[],
  today: string,
  /** The newest friend footprint, when the Friends layer is on */
  social: FriendFootprint | null = null,
): DockState {
  const sorted = [...trips].sort(byStart);
  const now = sorted.find((t) => t.start_date <= today && today <= t.end_date);
  if (now) return { kind: 'today', trip: now, day: durationDays(now.start_date, today), days: durationDays(now.start_date, now.end_date) };
  const next = sorted.find((t) => t.start_date > today);
  if (next) {
    const daysAway = durationDays(today, next.start_date) - 1;
    if (daysAway <= UPCOMING_DAYS) return { kind: 'upcoming', trip: next, daysAway };
  }
  if (social && social.friends.length > 0) return { kind: 'social', footprint: social };
  const ideas = ideasFrom(visits, destinations, trips, today);
  return ideas.length ? { kind: 'idea', ideas } : { kind: 'empty' };
}

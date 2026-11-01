/**
 * How a friend's trip reads (friends-chat step 6, mockups 1 and 3): on the strip
 * ("Sylhet · day 2", "Bandarban · Fri"), for screen readers ("Rafi Ahmed, in Sylhet,
 * day 2 of 3"), and in the chat header and on the profile ("On a trip · Sylhet, day 2").
 */

import type { TFunction } from 'i18next';

import type { RoadTrip } from '../../types';
import { dateFormat } from '../../utils/dateFormat';

/** A local date ("2026-11-03") as a Date at local midnight. */
const day = (iso: string) => new Date(`${iso}T00:00:00`);

/** When a coming trip starts: "tomorrow", a weekday within the week, else a date. */
function when(trip: RoadTrip, t: TFunction, lang: string, long: boolean): string {
  if (trip.starts_in === 1) return t('friends.road.tomorrow');
  const start = day(trip.start_date);
  if (trip.starts_in < 7) return dateFormat(lang, { weekday: long ? 'long' : 'short' }).format(start);
  return dateFormat(lang, { day: 'numeric', month: long ? 'long' : 'short' }).format(start);
}

/** Under the face on the strip. */
export function stripLine(trip: RoadTrip, t: TFunction, lang: string, n: (v: number) => string): string {
  return trip.day != null
    ? t('friends.road.stripOn', { place: trip.destination, day: n(trip.day) })
    : t('friends.road.stripSoon', { place: trip.destination, when: when(trip, t, lang, false) });
}

/** The strip's screen reader label. */
export function stripLabel(name: string, trip: RoadTrip, t: TFunction, lang: string, n: (v: number) => string): string {
  return trip.day != null
    ? t('friends.road.labelOn', { name, place: trip.destination, day: n(trip.day), days: n(trip.days) })
    : t('friends.road.labelSoon', { name, place: trip.destination, when: when(trip, t, lang, true) });
}

/** The chat header's line and the profile's chip. */
export function tripLine(trip: RoadTrip, t: TFunction, lang: string, n: (v: number) => string): string {
  return trip.day != null
    ? t('friends.road.lineOn', { place: trip.destination, day: n(trip.day) })
    : t('friends.road.lineSoon', { place: trip.destination, when: when(trip, t, lang, false) });
}

/** How far through the trip they are, 0–1 (the ring); null before it starts (a dashed ring). */
export function progress(trip: RoadTrip): number | null {
  return trip.day != null ? Math.min(1, trip.day / trip.days) : null;
}

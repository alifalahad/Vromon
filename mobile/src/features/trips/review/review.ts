/**
 * "How was your trip?" (docs/trip-upgrades, step 7; decisions D7-D9): rating opens on the trip's first day;
 * things one by one are good or bad with an optional comment; a save sends only what changed; the Trips
 * tab asks once, the day after a trip ends.
 */

import type { ReviewThing, Trip, TripReviewIn, Verdict } from '../../../types';
import { addDays } from '../dates';

/** What the screen holds for each thing: its verdict and the comment typed so far */
export type Draft = Record<string, { verdict: Verdict | null; comment: string }>;

/** Rating opens on the trip's first day, and stays open after (D7). */
export function canRate(trip: Pick<Trip, 'start_date'>, today: string): boolean {
  return today >= trip.start_date;
}

export function draftOf(items: readonly ReviewThing[]): Draft {
  return Object.fromEntries(items.map((i) => [i.key, { verdict: i.verdict, comment: i.comment ?? '' }]));
}

/** "Mark all good" / "Mark all bad": every thing not rated yet; the ones already rated keep theirs. */
export function markAll(draft: Draft, verdict: Verdict): Draft {
  return Object.fromEntries(Object.entries(draft).map(([key, d]) => [key, d.verdict ? d : { ...d, verdict }]));
}

/** Tapping Good or Bad: the other one, or the same one again to clear it. */
export function toggle(draft: Draft, key: string, verdict: Verdict): Draft {
  const d = draft[key] ?? { verdict: null, comment: '' };
  return { ...draft, [key]: { ...d, verdict: d.verdict === verdict ? null : verdict } };
}

/** Only what changed since it was saved: a verdict set, changed or cleared, or a new comment. */
export function changes(items: readonly ReviewThing[], draft: Draft): NonNullable<TripReviewIn['items']> {
  const out: NonNullable<TripReviewIn['items']> = [];
  for (const i of items) {
    const d = draft[i.key];
    if (!d) continue;
    const comment = d.verdict ? d.comment.trim() || null : null;
    if (d.verdict === i.verdict && comment === (i.comment ?? null)) continue;
    out.push({ target_type: i.target_type, target_id: i.target_id, item_id: i.item_id, verdict: d.verdict, comment });
  }
  return out;
}

export type Section = { key: string; kind: 'journey' | 'day' | 'stays'; day: number | null; items: ReviewThing[] };

/** Getting there, then each day, then where you stayed. */
export function sections(items: readonly ReviewThing[]): Section[] {
  const journey = items.filter((i) => i.target_type === 'journey');
  const stays = items.filter((i) => i.target_type === 'hotel' || i.target_type === 'stay_home');
  const days = [...new Set(items.filter((i) => i.day != null).map((i) => i.day as number))].sort((a, b) => a - b);
  return [
    ...(journey.length ? [{ key: 'journey', kind: 'journey' as const, day: null, items: journey }] : []),
    ...days.map((d) => ({ key: `day-${d}`, kind: 'day' as const, day: d, items: items.filter((i) => i.day === d) })),
    ...(stays.length ? [{ key: 'stays', kind: 'stays' as const, day: null, items: stays }] : []),
  ];
}

/** How many things have a verdict. */
export function ratedCount(draft: Draft): number {
  return Object.values(draft).filter((d) => d.verdict).length;
}

/** The Trips tab asks for this long after a trip ends (from the next day), unless dismissed or rated. */
export const REMINDER_DAYS = 14;

/** The trip the Trips tab's one-time card asks about: the one that ended most recently, from the day after it
 * ended, for two weeks; not a draft, not dismissed ("Not now" is for good). Whether it's rated is the server's
 * to say (the card checks). */
export function reminderTrip(trips: readonly Trip[], today: string, dismissed: readonly number[]): Trip | null {
  const waiting = trips.filter((t) => t.status !== 'draft' && t.end_date < today && addDays(t.end_date, REMINDER_DAYS) >= today && !dismissed.includes(t.id));
  return [...waiting].sort((a, b) => b.end_date.localeCompare(a.end_date))[0] ?? null;
}

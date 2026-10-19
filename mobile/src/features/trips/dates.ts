/**
 * Trip dates (prompt §6.8). Dates are calendar days (YYYY-MM-DD) in the phone's
 * own time zone; "today" is the phone's local date, never UTC.
 *
 * - Duration = end − start + 1 days (12–31 Oct 2026 = 20 days).
 * - Upcoming: starts after today. Ongoing: today is within it. Past: ended before today.
 * - Stats count completed (past) trips only.
 */

import type { Trip } from '../../types';

export type TripPhase = 'upcoming' | 'ongoing' | 'past';

const pad = (n: number) => String(n).padStart(2, '0');

export function localToday(now = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** A YYYY-MM-DD string as a local-midnight Date (`new Date('2026-10-12')` would be UTC). */
export function parseDay(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** "2026-10-19" + 1 → "2026-10-20" (calendar days, local). */
export function addDays(iso: string, n: number): string {
  const d = parseDay(iso);
  d.setDate(d.getDate() + n);
  return localToday(d);
}

export function durationDays(start: string, end: string): number {
  return Math.round((Date.UTC(...ymd(end)) - Date.UTC(...ymd(start))) / 86_400_000) + 1;
}

function ymd(iso: string): [number, number, number] {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return [y, m - 1, d];
}

export function tripPhase(start: string, end: string, today: string): TripPhase {
  if (end < today) return 'past';
  return start > today ? 'upcoming' : 'ongoing';
}

/**
 * The Trips tab's sections, in display order. Upcoming: soonest first.
 * Ongoing: ending soonest first. Past: most recent first. Empty sections are left out.
 */
export function groupTrips(trips: readonly Trip[], today: string): { phase: TripPhase; data: Trip[] }[] {
  const by: Record<TripPhase, Trip[]> = { upcoming: [], ongoing: [], past: [] };
  for (const t of trips) by[tripPhase(t.start_date, t.end_date, today)].push(t);
  by.upcoming.sort((a, b) => a.start_date.localeCompare(b.start_date) || a.id - b.id);
  by.ongoing.sort((a, b) => a.end_date.localeCompare(b.end_date) || a.id - b.id);
  by.past.sort((a, b) => b.end_date.localeCompare(a.end_date) || b.id - a.id);
  return (['upcoming', 'ongoing', 'past'] as const).filter((p) => by[p].length).map((phase) => ({ phase, data: by[phase] }));
}

/** "12–31 Oct 2026", "28 Oct – 3 Nov 2026", "28 Dec 2026 – 3 Jan 2027" (in the app's language). */
export function formatRange(start: string, end: string, locale: string): string {
  const a = parseDay(start);
  const b = parseDay(end);
  const day = (d: Date) => d.toLocaleDateString(locale, { day: 'numeric' });
  const month = (d: Date) => d.toLocaleDateString(locale, { month: 'short' });
  const year = (d: Date) => d.toLocaleDateString(locale, { year: 'numeric' });
  if (start === end) return `${day(a)} ${month(a)} ${year(a)}`;
  if (a.getFullYear() !== b.getFullYear()) return `${day(a)} ${month(a)} ${year(a)} – ${day(b)} ${month(b)} ${year(b)}`;
  if (a.getMonth() !== b.getMonth()) return `${day(a)} ${month(a)} – ${day(b)} ${month(b)} ${year(b)}`;
  return `${day(a)}–${day(b)} ${month(b)} ${year(b)}`;
}

/**
 * The most recent finished trip still waiting for a "mark as visited?" answer.
 * Trips whose places are all on the map already (visited or lived) are skipped:
 * there would be nothing to mark. `visited` holds "city:<id>" / "country:<iso2>".
 */
export function tripToMarkVisited(trips: readonly Trip[], today: string, visited: ReadonlySet<string> = new Set()): Trip | undefined {
  const onMap = (t: Trip) =>
    (t.stops ?? []).every((s) => visited.has(s.city_geonameid ? `city:${s.city_geonameid}` : `country:${s.country_iso2}`));
  return trips
    .filter((t) => t.end_date < today && !t.visited_prompt && (t.stops?.length ?? 0) > 0 && !onMap(t))
    .sort((a, b) => b.end_date.localeCompare(a.end_date) || b.id - a.id)[0];
}

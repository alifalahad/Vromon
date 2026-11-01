/**
 * "Your story" figures (map home step 3), all from the user's own data: the
 * visit list (offline) and the stats endpoints.
 */

import type { Visit } from '../../types';

const VISITED = new Set(['visited', 'lived']);

export type YearCount = { year: number; count: number };

/**
 * New places per year, from the date each place was first visited: the last
 * `years` years up to this one, empty years included so the bars keep their
 * rhythm. Places without a date don't count (they have no year).
 */
export function placesPerYear(visits: readonly Visit[], now: Date, years = 5): YearCount[] {
  const thisYear = now.getFullYear();
  const counts = new Map<number, number>();
  for (const v of visits) {
    if (!VISITED.has(v.status) || !v.first_visited_on) continue;
    const year = Number(v.first_visited_on.slice(0, 4));
    if (year > thisYear || year <= thisYear - years) continue;
    counts.set(year, (counts.get(year) ?? 0) + 1);
  }
  return Array.from({ length: years }, (_, i) => thisYear - years + 1 + i).map((year) => ({ year, count: counts.get(year) ?? 0 }));
}

/** Places with a status but no first-visited date (shown as a hint, not a bar). */
export const undatedCount = (visits: readonly Visit[]) => visits.filter((v) => VISITED.has(v.status) && !v.first_visited_on).length;

/** Places on the Want list. */
export const wantCount = (visits: readonly Visit[]) => visits.filter((v) => v.status === 'want').length;

/** The ring's share (0–1): never more than full, never NaN. */
export const ringFraction = (done: number, total: number) => (total > 0 ? Math.min(1, Math.max(0, done / total)) : 0);

export type ReplayStep = {
  /** null: the places without a date, shown last */
  year: number | null;
  /** Everything marked visited or lived by the end of this step */
  visits: Visit[];
  /** What this step added */
  added: Visit[];
};

/**
 * Replay (map home step 10): the map year by year, from the first year with a
 * dated visit to `now`'s year, then one "Undated" step for places without a date.
 * Want-list places never appear: they're wishes, not visits.
 */
export function replaySteps(visits: readonly Visit[], now: Date): ReplayStep[] {
  const been = visits.filter((v) => VISITED.has(v.status));
  const dated = been.filter((v) => v.first_visited_on);
  const undated = been.filter((v) => !v.first_visited_on);
  const yearOf = (v: Visit) => Number(v.first_visited_on!.slice(0, 4));
  const steps: ReplayStep[] = [];
  if (dated.length) {
    const first = Math.min(...dated.map(yearOf));
    const last = Math.max(now.getFullYear(), ...dated.map(yearOf));
    let soFar: Visit[] = [];
    for (let year = first; year <= last; year++) {
      const added = dated.filter((v) => yearOf(v) === year);
      soFar = [...soFar, ...added];
      steps.push({ year, visits: soFar, added });
    }
  }
  if (undated.length) steps.push({ year: null, visits: [...dated, ...undated], added: undated });
  return steps;
}

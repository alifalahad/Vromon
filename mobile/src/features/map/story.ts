/**
 * The map's figures (map home steps 3 and 10): the ring's share, and Replay's steps year by year.
 */

import type { Visit } from '../../types';

const VISITED = new Set(['visited', 'lived']);

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

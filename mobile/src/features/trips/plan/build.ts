/** Building a plan: the optimiser first; the quick planner if the optimiser can't make one. */

import { tripsApi } from '../../../services/api';
import type { Algorithm, GenerateResult } from '../../../types';

export async function planWithFallback(run: (a: Algorithm) => Promise<GenerateResult>): Promise<GenerateResult> {
  try {
    return await run('cpsat');
  } catch (first) {
    try {
      return await run('heuristic');
    } catch {
      throw first;
    }
  }
}

/** Build (or rebuild) a trip's plan. */
export function buildPlan(tripId: number, hasPlan = false): Promise<GenerateResult> {
  return planWithFallback((a) => (hasPlan ? tripsApi.regenerate(tripId, a) : tripsApi.generate(tripId, a)));
}

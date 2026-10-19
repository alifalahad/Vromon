/**
 * Vromon Mobile — place-list helpers for the destination screen (pure, unit-tested).
 */

import type { Place } from '../types';
import { formatBDT } from '../utils/format';

/** Categories present in the list, alphabetically, without duplicates. */
export function placeCategories(places: Place[]): string[] {
  return [...new Set(places.map((p) => p.category))].sort();
}

/** Places in one category; `null` means all. Keeps the backend's order. */
export function filterByCategory(places: Place[], category: string | null): Place[] {
  return category ? places.filter((p) => p.category === category) : places;
}

/** Entry cost as stored by the backend. Missing cost is shown as unknown, never as free. */
export function formatEntryCost(place: Pick<Place, 'estimated_cost' | 'currency' | 'cost_known'>): string {
  const cost = place.estimated_cost;
  if (cost == null || place.cost_known === false) return 'Cost unknown';
  if (cost === 0) return 'Free entry';
  return !place.currency || place.currency === 'BDT' ? formatBDT(cost) : `${cost} ${place.currency}`;
}

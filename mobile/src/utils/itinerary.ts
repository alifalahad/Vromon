/**
 * Vromon Mobile — itinerary helpers (pure, unit-tested).
 */

import type { GenerationStatus, ItineraryDay, ItineraryItem, SolverMeta, ValidationReport, Violation } from '../types';
import { formatBDT } from './format';

export interface MapStop {
  id: number;
  title: string;
  latitude: number;
  longitude: number;
  startTime: string;
  order: number;
  dayNumber: number;
}

/** Day colours shared by the map markers and the route lines. */
export const DAY_COLORS = ['#3B82F6', '#F59E0B', '#10B981', '#EC4899', '#8B5CF6', '#EF4444', '#14B8A6'];

export function dayColor(dayNumber: number): string {
  return DAY_COLORS[(dayNumber - 1) % DAY_COLORS.length];
}

/** Activities with real coordinates, in visiting order. Meals are skipped (no restaurant travel is modelled). */
export function mapStops(day: ItineraryDay): MapStop[] {
  return [...day.items]
    .filter((i): i is ItineraryItem & { place: NonNullable<ItineraryItem['place']> } =>
      i.item_type === 'activity' && i.place?.latitude != null && i.place?.longitude != null,
    )
    .sort((a, b) => a.order_index - b.order_index)
    .map((i, idx) => ({
      id: i.id,
      title: i.title,
      latitude: i.place.latitude as number,
      longitude: i.place.longitude as number,
      startTime: i.start_time,
      order: idx + 1,
      dayNumber: day.day_number,
    }));
}

/** Bounding region that fits all stops (with padding), or null if there are none. */
export function regionFor(stops: { latitude: number; longitude: number }[]) {
  if (stops.length === 0) return null;
  const lats = stops.map((s) => s.latitude);
  const lngs = stops.map((s) => s.longitude);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: Math.max((maxLat - minLat) * 1.4, 0.02),
    longitudeDelta: Math.max((maxLng - minLng) * 1.4, 0.02),
  };
}

export type ValidationTone = 'ok' | 'warning' | 'error';

export interface ValidationSummary {
  tone: ValidationTone;
  title: string;
  /** hard then soft messages */
  messages: string[];
  hard: string[];
  soft: string[];
  /** data limitations (placeholder prices, estimates); never violations */
  info: string[];
}

/** Summarise a validation report for a banner. Never reports "valid" when hard violations exist. */
export function summariseValidation(report: ValidationReport | null | undefined): ValidationSummary {
  if (!report) {
    return { tone: 'warning', title: 'Not validated yet', messages: [], hard: [], soft: [], info: [] };
  }
  const pick = (sev: Violation['severity']) => report.violations.filter((v) => v.severity === sev).map((v) => v.message);
  const hard = pick('hard');
  const soft = pick('soft');
  const info = pick('info');
  const base = { messages: [...hard, ...soft], hard, soft, info };
  if (hard.length) {
    return { ...base, tone: 'error', title: `Not valid: ${hard.length} constraint problem${hard.length > 1 ? 's' : ''}` };
  }
  if (soft.length) {
    return { ...base, tone: 'warning', title: `Valid, ${soft.length} preference warning${soft.length > 1 ? 's' : ''}` };
  }
  return { ...base, tone: 'ok', title: 'All constraints satisfied' };
}

/** Plain label for the backend's generation status. */
export function statusLabel(status: GenerationStatus | null | undefined): string {
  switch (status) {
    case 'valid':
      return 'Valid';
    case 'valid_with_warnings':
      return 'Valid with warnings';
    case 'invalid':
      return 'Has constraint problems';
    default:
      return 'Not generated';
  }
}

/** Violations and data notes attached to one itinerary item. */
export function issuesForItem(report: ValidationReport | null | undefined, itemId: number): Violation[] {
  return (report?.violations ?? []).filter((v) => v.item_id === itemId);
}

/**
 * Cost text for an itinerary item. A placeholder price is never shown as a real
 * cost, and other currencies are never formatted as taka.
 */
export function itemCostLabel(item: Pick<ItineraryItem, 'cost' | 'currency' | 'cost_source'>): string {
  if (item.cost_source === 'placeholder') return `Price unknown (est. ${formatBDT(item.cost)})`;
  if (!item.cost) return 'Free';
  return item.currency === 'BDT' ? formatBDT(item.cost) : `${item.cost} ${item.currency}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Day 2 · 11 Nov" (falls back to "Day 2" without a date). */
export function dayTabLabel(day: Pick<ItineraryDay, 'day_number' | 'day_date'>): string {
  const m = day.day_date?.match(/^\d{4}-(\d{2})-(\d{2})$/);
  return m ? `Day ${day.day_number} · ${Number(m[2])} ${MONTHS[Number(m[1]) - 1]}` : `Day ${day.day_number}`;
}

/** Plain-language solver status, without overstating optimality. */
export function describeSolver(solver: SolverMeta | null | undefined): string | null {
  if (!solver) return null;
  switch (solver.status) {
    case 'OPTIMAL':
      return `Optimizer: proven best plan under the model (${solver.wall_time_s.toFixed(1)} s)`;
    case 'FEASIBLE': {
      const gap = solver.optimality_gap != null ? ` · within ${(solver.optimality_gap * 100).toFixed(1)}% of the best possible` : '';
      return `Optimizer: good plan found, not proven best${gap}`;
    }
    case 'INFEASIBLE':
      return 'Optimizer: no plan satisfies all of your constraints';
    default:
      return `Optimizer status: ${solver.status}`;
  }
}

/** Itinerary items in display order. */
export function orderedItems(day: ItineraryDay): ItineraryItem[] {
  return [...day.items].sort((a, b) => a.order_index - b.order_index);
}

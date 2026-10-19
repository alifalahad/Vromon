/**
 * The trip screen's day plan, as pure data (unit-tested): stop rows, travel legs
 * and free time in visiting order, the day ribbon's segments, and friendly dates.
 *
 * Travel legs come from the itinerary's straight-line estimates
 * (travel_time_to_next / distance_to_next); real road routes are step 4.
 */

import type { ItineraryDay, ItineraryItem, TravelMode, Trip } from '../../../types';
import { parseDay } from '../dates';

export type StopKind = 'visit' | 'meal';
export type Coord = { latitude: number; longitude: number };

export type PlanRow =
  | { kind: 'stop'; key: string; item: ItineraryItem; n: number; stopKind: StopKind }
  | {
      kind: 'leg';
      key: string;
      minutes: number;
      km: number;
      /** The stop the leg leaves from */
      itemId: number;
      mode: TravelMode | null;
      source: 'road' | 'estimate' | null;
      fare: number | null;
    }
  | { kind: 'free'; key: string; start: string; minutes: number };

export type RibbonSegment = { start: number; end: number; kind: StopKind | 'travel' };

/** Gaps shorter than this are not shown as free time. */
export const FREE_TIME_MIN = 30;

export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + (m || 0);
}

export function fromMinutes(total: number): string {
  const m = Math.max(0, Math.round(total));
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** Short durations for the narrow time column: 45 → "45 min", 60 → "1 h", 150 → "2 h 30". */
export function shortDuration(minutes: number): string {
  const m = Math.round(minutes);
  if (m < 60) return `${m} min`;
  return m % 60 ? `${Math.floor(m / 60)} h ${m % 60}` : `${m / 60} h`;
}

export function stopKind(item: Pick<ItineraryItem, 'item_type'>): StopKind {
  return item.item_type === 'meal' ? 'meal' : 'visit';
}

/** Items in visiting order, without the ones being removed (gone from view while Undo is offered). */
export function orderedStops(day: ItineraryDay, hidden: readonly number[] = []): ItineraryItem[] {
  return [...day.items].filter((i) => !hidden.includes(i.id)).sort((a, b) => a.order_index - b.order_index);
}

/** Where the stop is: the place, or the meal's restaurant. Null when the data has no coordinates. */
export function stopCoord(item: ItineraryItem): Coord | null {
  const p = item.place;
  if (p?.latitude != null && p?.longitude != null) return { latitude: p.latitude, longitude: p.longitude };
  const r = item.restaurant;
  if (r?.latitude != null && r?.longitude != null) return { latitude: r.latitude, longitude: r.longitude };
  return null;
}

/** Stops, then (when there is one) a travel leg and any free time before the next stop. */
export function planRows(day: ItineraryDay, hidden: readonly number[] = []): PlanRow[] {
  const items = orderedStops(day, hidden);
  const rows: PlanRow[] = [];
  items.forEach((item, i) => {
    rows.push({ kind: 'stop', key: `s${item.id}`, item, n: i + 1, stopKind: stopKind(item) });
    const next = items[i + 1];
    if (!next) return;
    const travel = item.travel_time_to_next > 0 ? Math.round(item.travel_time_to_next) : 0;
    const gap = toMinutes(next.start_time) - toMinutes(item.end_time) - travel;
    if (gap >= FREE_TIME_MIN) rows.push({ kind: 'free', key: `f${item.id}`, start: item.end_time, minutes: gap });
    if (travel > 0) {
      rows.push({
        kind: 'leg',
        key: `l${item.id}`,
        minutes: travel,
        km: item.distance_to_next,
        itemId: item.id,
        mode: item.travel_mode ?? null,
        source: item.travel_source ?? null,
        fare: item.travel_fare ?? null,
      });
    }
  });
  return rows;
}

/** The ribbon's time window: whole hours around the plan and the preferred day hours. */
export function dayWindow(day: ItineraryDay, prefStart?: string, prefEnd?: string): { start: number; end: number } {
  const items = orderedStops(day);
  const starts = items.map((i) => toMinutes(i.start_time));
  const ends = items.map((i) => toMinutes(i.end_time) + Math.max(0, i.travel_time_to_next || 0));
  if (prefStart) starts.push(toMinutes(prefStart));
  if (prefEnd) ends.push(toMinutes(prefEnd));
  const start = starts.length ? Math.floor(Math.min(...starts) / 60) * 60 : 8 * 60;
  const end = ends.length ? Math.ceil(Math.max(...ends) / 60) * 60 : 20 * 60;
  return { start, end: Math.max(end, start + 60) };
}

/** Visits, meals and travel, in minutes since midnight. */
export function ribbonSegments(day: ItineraryDay, hidden: readonly number[] = []): RibbonSegment[] {
  const segs: RibbonSegment[] = [];
  orderedStops(day, hidden).forEach((item, i, all) => {
    const start = toMinutes(item.start_time);
    const end = toMinutes(item.end_time);
    segs.push({ start, end, kind: stopKind(item) });
    if (all[i + 1] && item.travel_time_to_next > 0) segs.push({ start: end, end: end + Math.round(item.travel_time_to_next), kind: 'travel' });
  });
  return segs;
}

/** "Breakfast at Jhaubon Restaurant" → "Breakfast · Jhaubon Restaurant"; places keep their name. */
export function stopTitle(item: Pick<ItineraryItem, 'item_type' | 'title' | 'restaurant'>): string {
  if (item.item_type !== 'meal' || !item.restaurant) return item.title;
  const meal = item.title.split(' at ')[0];
  return `${meal} · ${item.restaurant.name}`;
}

/** "Matches your interest in beach, family" → "beach, family" (the planner's own reason). */
export function forYou(reasons: readonly string[]): string | null {
  const prefix = 'Matches your interest in ';
  const hit = reasons.find((r) => r.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : null;
}

/** "Mon" and "19" for a day tab. */
export function dayParts(iso: string, locale: string): { weekday: string; day: string } {
  const d = parseDay(iso);
  return { weekday: d.toLocaleDateString(locale, { weekday: 'short' }), day: d.toLocaleDateString(locale, { day: 'numeric' }) };
}

/**
 * "Mon 19 – Tue 20 Oct", "Fri 30 Oct – Sun 1 Nov"; the year is added when it
 * isn't the current one.
 */
export function friendlyRange(start: string, end: string, locale: string, today: string): string {
  const a = parseDay(start);
  const b = parseDay(end);
  const wd = (d: Date) => d.toLocaleDateString(locale, { weekday: 'short' });
  const day = (d: Date) => d.toLocaleDateString(locale, { day: 'numeric' });
  const month = (d: Date) => d.toLocaleDateString(locale, { month: 'short' });
  const year = b.getFullYear() !== parseDay(today).getFullYear() ? ` ${b.toLocaleDateString(locale, { year: 'numeric' })}` : '';
  if (start === end) return `${wd(a)} ${day(a)} ${month(a)}${year}`;
  if (a.getMonth() !== b.getMonth() || a.getFullYear() !== b.getFullYear()) {
    return `${wd(a)} ${day(a)} ${month(a)} – ${wd(b)} ${day(b)} ${month(b)}${year}`;
  }
  return `${wd(a)} ${day(a)} – ${wd(b)} ${day(b)} ${month(b)}${year}`;
}

/** The day to open first: today's day during the trip, otherwise day 1. */
export function initialDayIndex(days: readonly Pick<ItineraryDay, 'day_date'>[], today: string): number {
  const i = days.findIndex((d) => d.day_date === today);
  return i >= 0 ? i : 0;
}

// ---------------------------------------------------------------------------
// Rearranging (step 3): the same re-timing as the server's apply_order(), for
// the live preview while dragging. The server's answer replaces it on drop.
// ---------------------------------------------------------------------------

const KMH = 30;
const MEAL_EARLIEST: Record<string, number> = { Lunch: 12 * 60, Dinner: 19 * 60 };

function haversineKm(a: Coord, b: Coord): number {
  const R = 6371;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLon = rad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function placeCoord(item: ItineraryItem): Coord | null {
  const p = item.place;
  return item.item_type === 'activity' && p?.latitude != null && p?.longitude != null ? { latitude: p.latitude, longitude: p.longitude } : null;
}

function openingMin(item: ItineraryItem): number {
  const t = item.item_type === 'activity' ? item.place?.opening_time : item.restaurant?.opening_time;
  return t ? toMinutes(t) : 0;
}

/** Move the item at `from` to `to` (an index in the list without it). */
export function moveInList<T>(list: readonly T[], from: number, to: number): T[] {
  const out = [...list];
  const [it] = out.splice(from, 1);
  out.splice(Math.max(0, Math.min(to, out.length)), 0, it);
  return out;
}

/**
 * Times for the items in this order: those before `fromIndex` keep theirs; from
 * there each starts after the previous one, and after the previous visit plus travel
 * (straight line at 30 km/h), never before opening or the meal's usual time,
 * and never during a busy time (it waits until the busy time ends).
 * A pinned item keeps its start unless the ones before it run past it.
 */
export function retime(items: readonly ItineraryItem[], dayStart: number, fromIndex = 0, busy: readonly Busy[] = []): ItineraryItem[] {
  let cursor = dayStart;
  let prevActivity: Coord | null = null;
  let prevEnd = dayStart;
  return items.map((item, idx) => {
    const coord = placeCoord(item);
    if (idx < fromIndex) {
      cursor = toMinutes(item.end_time);
      if (coord) {
        prevActivity = coord;
        prevEnd = cursor;
      }
      return { ...item, order_index: idx };
    }
    // Travel starts when the previous visit ends (a meal in between happens on the way)
    const travel = coord && prevActivity ? Math.round((haversineKm(prevActivity, coord) / KMH) * 60) : 0;
    let start = Math.max(cursor, travel ? prevEnd + travel : cursor, openingMin(item));
    if (item.item_type === 'meal') start = Math.max(start, MEAL_EARLIEST[item.title.split(' at ')[0]] ?? 0);
    start = afterBusy(start, item.duration_minutes, busy);
    if (item.pinned) start = Math.max(start, toMinutes(item.start_time));
    cursor = start + item.duration_minutes;
    if (coord) {
      prevActivity = coord;
      prevEnd = cursor;
    }
    return { ...item, order_index: idx, start_time: fromMinutes(start), end_time: fromMinutes(cursor) };
  });
}

/** A busy time on a day, in minutes: [start, end). */
export type Busy = readonly [number, number];

/** The first start at or after `start` that doesn't overlap a busy time (the server's after_busy). */
export function afterBusy(start: number, duration: number, busy: readonly Busy[]): number {
  let s = start;
  for (const [b0, b1] of [...busy].sort((a, b) => a[0] - b[0])) {
    if (s < b1 && b0 < s + duration) s = b1;
  }
  return s;
}

/** What re-timing a day needs from the trip: when the day starts (the arrival on day 1) and its busy times. */
export type DayRules = { start: string; busy: Busy[] };

export function dayRulesOf(trip: Pick<Trip, 'preference' | 'constraints'> | undefined, dayNumber: number): DayRules {
  const pref = trip?.preference;
  let start = pref?.preferred_start_time ?? '09:00';
  if (dayNumber === 1 && pref?.arrive_time && pref.arrive_time > start) start = pref.arrive_time;
  const busy = (trip?.constraints?.busy ?? []).filter((b) => b.day === dayNumber).map((b) => [toMinutes(b.start), toMinutes(b.end)] as const);
  return { start, busy };
}

/** When the day begins (the server's day_start_of): the preferred start, or the first stop if earlier. */
export function dayStartOf(day: ItineraryDay, prefStart = '09:00'): number {
  return Math.min(toMinutes(prefStart), ...day.items.map((i) => toMinutes(i.start_time)));
}

/** The day re-timed with one item moved: what the preview and the optimistic update show. */
export function previewMove(day: ItineraryDay, itemId: number, to: number, rules?: DayRules | string): ItineraryItem[] {
  const items = orderedStops(day);
  const from = items.findIndex((i) => i.id === itemId);
  if (from < 0) return items;
  const r: DayRules = typeof rules === 'string' || rules === undefined ? { start: rules ?? '09:00', busy: [] } : rules;
  const moved = moveInList(items, from, to);
  return retime(moved, dayStartOf(day, r.start), Math.min(from, to), r.busy);
}

/**
 * Today mode (trip planner step 9): where the day is now, from the plan and the
 * phone's clock, and when to leave for the next stop.
 *
 * "Leave by" = the next stop's start − the travel time − the usual traffic then:
 *   - from where you are, when you turned location on: the straight line × 1.3
 *     at local speeds, worked out on the phone (your location is never sent);
 *   - otherwise from the stop before (the plan's road time) or from your hotel.
 * Traffic is the usual pattern of Bangladesh towns (slow 08:00–10:00 ×1.3 and
 * 17:00–20:00 ×1.4), not live, as on the Conditions screen.
 */

import type { ItineraryDay, ItineraryItem, TravelMode } from '../../../types';

export type Point = { lat: number; lon: number };

export const t2m = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};
export const m2t = (min: number) => {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};
export const minuteOfDay = (d: Date) => d.getHours() * 60 + d.getMinutes();

export const pointOf = (item: ItineraryItem): Point | null => {
  const p = item.place ?? item.restaurant;
  return p?.latitude != null && p?.longitude != null ? { lat: p.latitude, lon: p.longitude } : null;
};

// ---------------------------------------------------------------------------
// Travel (the server's modes.py, for the straight-line estimate)
// ---------------------------------------------------------------------------

const WALK_KMH = 4.5;
const STRAIGHT_KMH = 30;
const CNG_SLOWER = 1.25;
const WALK_MAX_KM = 1.0;
const DETOUR = 1.3; // roads are rarely straight
const NEAR_KM = 0.5; // this close to the stop before, you're leaving from it
export const FAR_KM = 40; // further than this from the next stop, you're not there yet: use the plan

export function km(a: Point, b: Point): number {
  const r = 6371;
  const rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(h));
}

/** About how long from a to b: walk a short way, else a CNG; the straight line × 1.3. */
export function estimate(a: Point, b: Point): { minutes: number; km: number; mode: TravelMode } {
  const straight = km(a, b);
  if (straight <= WALK_MAX_KM) return { minutes: (straight * DETOUR) / WALK_KMH * 60, km: straight * DETOUR, mode: 'walk' };
  const road = straight * DETOUR;
  return { minutes: (road / STRAIGHT_KMH) * 60 * CNG_SLOWER, km: road, mode: 'cng' };
}

/** The usual slow times (not live): extra minutes for a ride leaving at `leave`. */
export const PEAKS = [
  { from: 8 * 60, to: 10 * 60, factor: 1.3, name: 'morning' },
  { from: 17 * 60, to: 20 * 60, factor: 1.4, name: 'evening' },
] as const;

export function usualTraffic(leave: number, minutes: number): { extra: number; peak: 'morning' | 'evening' } | null {
  const p = PEAKS.find((x) => x.from <= leave && leave < x.to);
  if (!p || minutes <= 0) return null;
  const extra = Math.round(minutes * (p.factor - 1));
  return extra >= 3 ? { extra, peak: p.name } : null;
}

// ---------------------------------------------------------------------------
// The day now
// ---------------------------------------------------------------------------

export interface TodayState {
  /** What you're doing now (null: between stops, before the day or after it) */
  current: ItineraryItem | null;
  /** The next stop with a place to go to (a visit or a meal), not started yet */
  next: ItineraryItem | null;
  /** The last stop before `next` (where you leave from without location) */
  previous: ItineraryItem | null;
  /** Everything not finished yet, in order */
  rest: ItineraryItem[];
  /** Finished stops */
  done: ItineraryItem[];
  phase: 'before' | 'during' | 'after';
}

export function todayState(day: ItineraryDay, now: number): TodayState {
  const items = [...day.items].sort((a, b) => t2m(a.start_time) - t2m(b.start_time) || a.order_index - b.order_index);
  const current = items.find((i) => t2m(i.start_time) <= now && now < t2m(i.end_time)) ?? null;
  const next = items.find((i) => t2m(i.start_time) > now && pointOf(i) && i !== current) ?? null;
  const before = next ? items.slice(0, items.indexOf(next)) : items;
  const previous = [...before].reverse().find((i) => pointOf(i)) ?? null;
  const first = items[0];
  const last = items[items.length - 1];
  const phase = !first || now < t2m(first.start_time) ? 'before' : last && now >= t2m(last.end_time) ? 'after' : 'during';
  return {
    current,
    next,
    previous,
    rest: items.filter((i) => t2m(i.end_time) > now),
    done: items.filter((i) => t2m(i.end_time) <= now),
    phase: first ? phase : 'after',
  };
}

export interface LeaveBy {
  /** "HH:MM", rounded down to 5 minutes */
  at: string;
  /** the same in minutes of the day; below 0 when it was before midnight (then: leave now) */
  atMin: number;
  /** location was on, but you're far from the stop (more than FAR_KM): this is from the plan */
  far?: boolean;
  /** minutes of travel, without traffic */
  minutes: number;
  mode: TravelMode;
  km: number | null;
  /** the usual slow traffic then, if any */
  traffic: { extra: number; peak: 'morning' | 'evening' } | null;
  /** where it's worked out from */
  from: 'location' | 'previous' | 'hotel';
  /** road data from the plan, or a straight-line estimate */
  source: 'road' | 'estimate';
}

/**
 * When to leave for `next`. With `here` (location on) from where you are;
 * otherwise from the stop before it (the plan's travel), or the hotel at the start of the day.
 */
export function leaveBy(state: TodayState, hotel: Point | null, nearHere: Point | null): LeaveBy | null {
  let here = nearHere;
  const { next, previous } = state;
  const to = next ? pointOf(next) : null;
  if (!next || !to) return null;
  let travel: { minutes: number; km: number | null; mode: TravelMode; from: LeaveBy['from']; source: LeaveBy['source'] } | null = null;
  const planLeg = previous && previous.item_type === 'activity' && next.item_type === 'activity' && previous.travel_time_to_next > 0;
  const prevPoint = previous ? pointOf(previous) : null;
  const far = !!here && km(here, to) > FAR_KM;
  if (far) here = null;
  if (here && planLeg && prevPoint && km(here, prevPoint) <= NEAR_KM) {
    // You're at the stop before: the plan's road time is better than a straight line
    travel = {
      minutes: previous!.travel_time_to_next,
      km: previous!.distance_to_next || null,
      mode: previous!.travel_mode ?? 'cng',
      from: 'location',
      source: previous!.travel_source === 'road' ? 'road' : 'estimate',
    };
  } else if (here) {
    const e = estimate(here, to);
    travel = { ...e, from: 'location', source: 'estimate' };
  } else if (previous && previous.item_type === 'activity' && next.item_type === 'activity' && previous.travel_time_to_next > 0) {
    // The plan's leg goes from a visit to the next visit
    travel = {
      minutes: previous.travel_time_to_next,
      km: previous.distance_to_next || null,
      mode: previous.travel_mode ?? 'cng',
      from: 'previous',
      source: previous.travel_source === 'road' ? 'road' : 'estimate',
    };
  } else if (previous && pointOf(previous)) {
    // A meal before it (it's on the way): from there
    const e = estimate(pointOf(previous)!, to);
    travel = { ...e, from: 'previous', source: 'estimate' };
  } else if (hotel) {
    const e = estimate(hotel, to);
    travel = { ...e, from: 'hotel', source: 'estimate' };
  }
  if (!travel) return null;
  const start = t2m(next.start_time);
  const rough = start - travel.minutes;
  const traffic = usualTraffic(rough, travel.minutes);
  const at = Math.floor((start - travel.minutes - (traffic?.extra ?? 0)) / 5) * 5;
  return {
    at: m2t(Math.max(0, at)), atMin: at, far: far || undefined,
    minutes: Math.round(travel.minutes), mode: travel.mode, km: travel.km, traffic, from: travel.from, source: travel.source,
  };
}

/** Google Maps directions to the stop (opens the app if it's installed). */
export function directionsUrl(to: Point, mode: TravelMode): string {
  const travelmode = mode === 'walk' ? 'walking' : 'driving';
  return `https://www.google.com/maps/dir/?api=1&destination=${to.lat},${to.lon}&travelmode=${travelmode}`;
}

/** The trip's day for a date, if the trip has one. */
export const dayFor = (days: readonly ItineraryDay[], date: string) => days.find((d) => d.day_date === date) ?? null;

/** "Leave by" for every stop of the day that you travel to (from the plan, not your location). */
export function leaveTimes(day: ItineraryDay, hotel: Point | null): { item: ItineraryItem; leave: LeaveBy }[] {
  const items = [...day.items].sort((a, b) => t2m(a.start_time) - t2m(b.start_time) || a.order_index - b.order_index);
  const out: { item: ItineraryItem; leave: LeaveBy }[] = [];
  items.forEach((item, i) => {
    if (!pointOf(item)) return;
    const previous = [...items.slice(0, i)].reverse().find((p) => pointOf(p)) ?? null;
    const state: TodayState = { current: null, next: item, previous, rest: [], done: [], phase: 'during' };
    const leave = leaveBy(state, hotel, null);
    // Walking next door, or a meal at the same place: nothing to remind
    if (leave && leave.minutes >= 5) out.push({ item, leave });
  });
  return out;
}

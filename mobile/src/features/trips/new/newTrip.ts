/**
 * Vromon Mobile — the new-trip flow's answers and how they become a trip
 * (trip planner step 4). Pure, unit-tested.
 *
 * 1 Where & when (required) · 2 Your style · 3 Your must-dos. Everything after
 * step 1 has a default, so a plan can be built from step 1 alone.
 */

import type { BusyTime, MustSee, MustSeeWhen, TransportMode, TripCreate } from '../../../types';
import { durationDays, localToday, parseDay } from '../dates';

/** Same limit as the backend (schemas.py MAX_TRIP_DAYS). */
export const MAX_TRIP_DAYS = 30;
export const MAX_TRAVELLERS = 50;

export type Pace = 'Relaxed' | 'Balanced' | 'Packed';
export type Tier = 'Budget' | 'Comfort' | 'Luxury';

export const PACES: Pace[] = ['Relaxed', 'Balanced', 'Packed'];
export const TIERS: Tier[] = ['Budget', 'Comfort', 'Luxury'];
export const WHENS: MustSeeWhen[] = ['morning', 'afternoon', 'sunset', 'evening'];

/** What a day costs one person at each level, before the hotel is chosen (BDT, estimates). */
export const TIER_PER_PERSON_DAY: Record<Tier, number> = { Budget: 2300, Comfort: 4200, Luxury: 8000 };
/** The hotel category each level buys (seed data categories). */
export const TIER_HOTEL: Record<Tier, 'Budget' | 'Standard' | 'Luxury'> = { Budget: 'Budget', Comfort: 'Standard', Luxury: 'Luxury' };

export const ARRIVE_TIMES = ['10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00'];
export const LEAVE_TIMES = ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00'];
export const START_TIMES = ['06:00', '07:00', '08:00', '09:00', '10:00', '11:00'];
export const END_TIMES = ['17:00', '18:00', '19:00', '20:00', '21:00', '22:00'];

export type NewTrip = {
  destination: string;
  start: string;
  end: string;
  travellers: number;
  /** First day: when you arrive (null = the usual start) */
  arrive: string | null;
  /** Last day: when you leave (null = the usual end) */
  leave: string | null;
  origin: { city_geonameid: number; label: string } | null;
  mode: TransportMode | null;
  interests: string[];
  pace: Pace;
  tier: Tier;
  /** Total for the group; follows the tier until it's changed by hand */
  budget: number;
  budgetByHand: boolean;
  dayStart: string;
  dayEnd: string;
  mustSees: MustSee[];
  busy: BusyTime[];
  skip: number[];
  avoidCrowds: boolean;
};

const iso = (d: Date) => localToday(d);

export function addDays(day: string, n: number): string {
  const d = parseDay(day);
  d.setDate(d.getDate() + n);
  return iso(d);
}

export function tripLength(t: Pick<NewTrip, 'start' | 'end'>): number {
  return durationDays(t.start, t.end);
}

/** Round to the nearest ৳500. */
const round500 = (n: number) => Math.max(500, Math.round(n / 500) * 500);

export function tierBudget(tier: Tier, travellers: number, days: number): number {
  return round500(TIER_PER_PERSON_DAY[tier] * travellers * days);
}

export function defaultNewTrip(today = new Date(), destination = ''): NewTrip {
  const start = addDays(iso(today), 7);
  const end = addDays(start, 2);
  return {
    destination,
    start,
    end,
    travellers: 2,
    arrive: null,
    leave: null,
    origin: null,
    mode: null,
    interests: [],
    pace: 'Balanced',
    tier: 'Comfort',
    budget: tierBudget('Comfort', 2, 3),
    budgetByHand: false,
    dayStart: '09:00',
    dayEnd: '20:00',
    mustSees: [],
    busy: [],
    skip: [],
    avoidCrowds: false,
  };
}

/**
 * Apply a change and keep the answers consistent: the budget follows the tier,
 * travellers and days (unless set by hand); must-sees and busy times on days the
 * trip no longer has lose that day.
 */
export function update(t: NewTrip, change: Partial<NewTrip>): NewTrip {
  const next = { ...t, ...change };
  const days = tripLength(next);
  if (!next.budgetByHand && ('tier' in change || 'travellers' in change || 'start' in change || 'end' in change)) {
    next.budget = tierBudget(next.tier, next.travellers, days);
  }
  if ('start' in change || 'end' in change) {
    next.mustSees = next.mustSees.map((m) => (m.day && m.day > days ? { ...m, day: null } : m));
    next.busy = next.busy.filter((b) => b.day <= days);
  }
  return next;
}

/** Step 1's problem, if any (the only required step). */
export function whereWhenError(t: NewTrip): 'destination' | 'dates' | 'tooLong' | null {
  if (!t.destination) return 'destination';
  if (t.end < t.start) return 'dates';
  if (tripLength(t) > MAX_TRIP_DAYS) return 'tooLong';
  return null;
}

/** The hotel level the budget buys: the tier's, or the closest one for a budget set by hand. */
export function hotelLevel(t: NewTrip): 'Budget' | 'Standard' | 'Luxury' {
  if (!t.budgetByHand) return TIER_HOTEL[t.tier];
  const perDay = t.budget / Math.max(1, t.travellers) / Math.max(1, tripLength(t));
  if (perDay >= (TIER_PER_PERSON_DAY.Comfort + TIER_PER_PERSON_DAY.Luxury) / 2) return 'Luxury';
  if (perDay >= (TIER_PER_PERSON_DAY.Budget + TIER_PER_PERSON_DAY.Comfort) / 2) return 'Standard';
  return 'Budget';
}

export function toPayload(t: NewTrip): TripCreate {
  return {
    destination: t.destination,
    start_date: t.start,
    end_date: t.end,
    num_travelers: t.travellers,
    total_budget: t.budget,
    preference: {
      interests: t.interests,
      travel_style: t.pace,
      activity_level: 'Medium',
      accommodation_preference: hotelLevel(t),
      preferred_start_time: t.dayStart,
      preferred_end_time: t.dayEnd,
      arrive_time: t.arrive,
      leave_time: t.leave,
    },
    // Stops a day follow the pace on the server
    constraints: {
      avoid_crowded: t.avoidCrowds,
      must_sees: t.mustSees,
      busy: t.busy,
      excluded_places: t.skip,
    },
    origin: t.origin ? { city_geonameid: t.origin.city_geonameid } : null,
    transport_mode: t.mode,
  };
}

/** The date of trip day `n` (1-based). */
export function dayDate(t: Pick<NewTrip, 'start'>, n: number): string {
  return addDays(t.start, n - 1);
}

/** A must-see with its day or time changed; an exact time replaces the time of day and the other way round. */
export function withTime(m: MustSee, change: { day?: number | null; when?: MustSeeWhen | null; at?: string | null }): MustSee {
  const next = { ...m, ...change };
  if ('when' in change && change.when) next.at = null;
  if ('at' in change && change.at) next.when = null;
  return next;
}

export function addMustSee(t: NewTrip, placeId: number): NewTrip {
  if (t.mustSees.some((m) => m.place_id === placeId)) return t;
  return {
    ...t,
    mustSees: [...t.mustSees, { place_id: placeId, day: null, when: null, at: null }],
    skip: t.skip.filter((id) => id !== placeId),
  };
}

export function addSkip(t: NewTrip, placeId: number): NewTrip {
  if (t.skip.includes(placeId)) return t;
  return { ...t, skip: [...t.skip, placeId], mustSees: t.mustSees.filter((m) => m.place_id !== placeId) };
}

export function minutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** Half-hour times from `from` to `to`, inclusive. */
export function timesBetween(from: string, to: string, step = 30): string[] {
  const out: string[] = [];
  for (let m = minutes(from); m <= minutes(to); m += step) {
    out.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
  }
  return out;
}

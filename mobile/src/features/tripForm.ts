/**
 * Vromon Mobile — trip wizard form schema and payload mapping (pure, unit-tested).
 */

import { z } from 'zod';

import type { TripCreate } from '../types';

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Same limit as the backend (schemas.py MAX_TRIP_DAYS). */
export const MAX_TRIP_DAYS = 30;

/** True for a real calendar date in YYYY-MM-DD form (rejects 2026-02-31). */
export function isCalendarDate(s: string): boolean {
  if (!DATE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** Inclusive number of days between two YYYY-MM-DD dates. */
export function tripDays(start: string, end: string): number {
  return Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000) + 1;
}

const calendarDate = z.string().regex(DATE, 'Use YYYY-MM-DD').refine(isCalendarDate, 'Not a real date');

export const tripFormSchema = z
  .object({
    destination: z.string().min(1, 'Choose a destination'),
    start_date: calendarDate,
    end_date: calendarDate,
    num_travelers: z.coerce.number().int().min(1, 'At least 1 traveller').max(50),
    total_budget: z.coerce.number().positive('Budget must be more than 0'),
    max_daily_budget: z.coerce.number().min(0).default(0),
    interests: z.array(z.string()).min(1, 'Pick at least one interest'),
    travel_style: z.enum(['Relaxed', 'Balanced', 'Packed']).default('Balanced'),
    activity_level: z.enum(['Low', 'Medium', 'High']).default('Medium'),
    accommodation_preference: z.enum(['Budget', 'Standard', 'Luxury']).default('Standard'),
    preferred_start_time: z.string().regex(TIME, 'Use HH:MM (24 h)'),
    preferred_end_time: z.string().regex(TIME, 'Use HH:MM (24 h)'),
    max_activities_per_day: z.coerce.number().int().min(1).max(10),
    avoid_crowded: z.boolean().default(false),
    must_visit: z.array(z.number().int()).default([]),
    excluded_places: z.array(z.number().int()).default([]),
    // Decision D7: where the trip starts (optional) and how you get to the destination
    origin: z.object({ city_geonameid: z.number().int(), label: z.string() }).nullable().default(null),
    transport_mode: z.enum(['plane', 'bus', 'train', 'car', 'boat', 'walk']).nullable().default(null),
  })
  .refine((d) => d.end_date >= d.start_date, {
    message: 'End date must be on or after the start date',
    path: ['end_date'],
  })
  .refine((d) => tripDays(d.start_date, d.end_date) <= MAX_TRIP_DAYS, {
    message: `Trips can be at most ${MAX_TRIP_DAYS} days long`,
    path: ['end_date'],
  })
  .refine((d) => d.preferred_end_time > d.preferred_start_time, {
    message: 'Day must end after it starts',
    path: ['preferred_end_time'],
  })
  .refine((d) => !d.must_visit.some((id) => d.excluded_places.includes(id)), {
    message: 'A place cannot be both must-visit and excluded',
    path: ['excluded_places'],
  });

export type TripFormInput = z.input<typeof tripFormSchema>;
export type TripFormValues = z.output<typeof tripFormSchema>;

/** Fields validated before leaving each wizard step (6 steps, as in the demo). */
export const STEP_FIELDS: (keyof TripFormValues)[][] = [
  ['destination'],
  ['start_date', 'end_date', 'num_travelers'],
  ['total_budget', 'max_daily_budget'],
  ['interests', 'travel_style', 'activity_level', 'accommodation_preference'],
  ['preferred_start_time', 'preferred_end_time', 'max_activities_per_day', 'must_visit', 'excluded_places'],
  [],
];

export const STEP_NAMES = ['Where', 'When', 'Budget', 'Interests', 'Schedule', 'Review'];

export function defaultTripForm(today: Date = new Date(), destination = ''): TripFormInput {
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const start = new Date(today.getTime() + 7 * 86_400_000);
  const end = new Date(start.getTime() + 86_400_000);
  return {
    destination,
    start_date: iso(start),
    end_date: iso(end),
    num_travelers: 2,
    total_budget: 25000,
    max_daily_budget: 0,
    interests: [],
    travel_style: 'Balanced',
    activity_level: 'Medium',
    accommodation_preference: 'Standard',
    preferred_start_time: '09:00',
    preferred_end_time: '20:00',
    max_activities_per_day: 4,
    avoid_crowded: false,
    must_visit: [],
    excluded_places: [],
    origin: null,
    transport_mode: null,
  };
}

/** Map validated form values to the backend TripCreate payload. */
export function toTripPayload(v: TripFormValues): TripCreate {
  return {
    destination: v.destination,
    start_date: v.start_date,
    end_date: v.end_date,
    num_travelers: v.num_travelers,
    total_budget: v.total_budget,
    preference: {
      interests: v.interests,
      travel_style: v.travel_style,
      activity_level: v.activity_level,
      accommodation_preference: v.accommodation_preference,
      preferred_start_time: v.preferred_start_time,
      preferred_end_time: v.preferred_end_time,
    },
    constraints: {
      max_activities_per_day: v.max_activities_per_day,
      max_daily_budget: v.max_daily_budget,
      avoid_crowded: v.avoid_crowded,
      must_visit: v.must_visit,
      excluded_places: v.excluded_places,
    },
    origin: v.origin ? { city_geonameid: v.origin.city_geonameid } : null,
    transport_mode: v.transport_mode,
  };
}

/**
 * Cross-field checks for one wizard step. Zod object refinements only run once every
 * field is valid, so without this a bad date range would only surface at the last step.
 */
export function stepError(step: number, v: Partial<TripFormInput>): string | null {
  if (step === 1 && v.start_date && v.end_date && isCalendarDate(v.start_date) && isCalendarDate(v.end_date)) {
    if (v.end_date < v.start_date) return 'End date must be on or after the start date';
    if (tripDays(v.start_date, v.end_date) > MAX_TRIP_DAYS) return `Trips can be at most ${MAX_TRIP_DAYS} days long`;
  }
  if (step === 4) {
    if (v.preferred_start_time && v.preferred_end_time && v.preferred_end_time <= v.preferred_start_time) {
      return 'Day must end after it starts';
    }
    if ((v.must_visit ?? []).some((id) => (v.excluded_places ?? []).includes(id))) {
      return 'A place cannot be both must-visit and excluded';
    }
  }
  return null;
}

/** Index of the first wizard step that owns one of the given error fields (for jumping back). */
export function firstStepWithError(errorFields: string[]): number {
  const idx = STEP_FIELDS.findIndex((fields) => fields.some((f) => errorFields.includes(f)));
  return idx === -1 ? STEP_FIELDS.length - 1 : idx;
}

export type PlaceChoice = 'none' | 'must' | 'exclude';

/** Tapping a place cycles: none → must-visit → excluded → none. Keeps the lists disjoint. */
export function cyclePlaceChoice(
  placeId: number,
  mustVisit: number[],
  excluded: number[],
): { must_visit: number[]; excluded_places: number[]; choice: PlaceChoice } {
  if (mustVisit.includes(placeId)) {
    return {
      must_visit: mustVisit.filter((id) => id !== placeId),
      excluded_places: [...excluded, placeId],
      choice: 'exclude',
    };
  }
  if (excluded.includes(placeId)) {
    return { must_visit: mustVisit, excluded_places: excluded.filter((id) => id !== placeId), choice: 'none' };
  }
  return { must_visit: [...mustVisit, placeId], excluded_places: excluded, choice: 'must' };
}

/**
 * Meals (docs/trip-upgrades, step 3): the plan's helpers, the new trip's payload, the plan's rows
 * (packed meals, meals where you stay), and the move preview leaving meals where you stay alone.
 */

import { act, render, screen } from '@testing-library/react-native';
import React from 'react';

import { DEFAULT_PLAN, isDefault, mealTitle, offerStayMeals, planSummary, samePlan, slotOf, stayMeals, stayMealsOf, withMeal } from '../features/trips/meals/meals';
import { StayMealRow } from '../features/trips/meals/StayMealRow';
import { defaultNewTrip, toPayload, update } from '../features/trips/new/newTrip';
import { cardTitle, stopSubtitle } from '../features/trips/plan/PlanRows';
import { orderedStops, planRows, previewMove, retime, ribbonSegments } from '../features/trips/plan/timeline';
import i18n from '../i18n';
import type { ItineraryDay, ItineraryItem, MealPlan } from '../types';

jest.mock('../ui/haptics', () => ({
  haptic: jest.fn(),
  haptics: { success: jest.fn(), error: jest.fn(), light: jest.fn(), warning: jest.fn(), selection: jest.fn(), medium: jest.fn() },
}));

const t = i18n.t.bind(i18n) as (key: string, options?: Record<string, unknown>) => string;
const f = {
  n: (v: number) => String(v),
  money: (v: number) => `৳${v.toLocaleString('en-US')}`,
  time: (s: string) => s,
} as unknown as Parameters<typeof stopSubtitle>[2];

beforeEach(async () => {
  await act(() => i18n.changeLanguage('en'));
});

const item = (id: number, extra: Partial<ItineraryItem>): ItineraryItem => ({
  id, item_type: 'activity', title: 'Stop', start_time: '10:00', end_time: '11:00', duration_minutes: 60, cost: 0,
  travel_time_to_next: 0, distance_to_next: 0, recommendation_score: 0.5, recommendation_reasons: [], order_index: 0,
  currency: 'BDT', cost_source: 'data', ...extra,
});
const place = (id: number, lat: number, lon: number) =>
  ({ id, name: `Place ${id}`, destination_name: 'Khulna', category: 'Park', latitude: lat, longitude: lon, opening_time: '08:00', closing_time: '18:00' }) as ItineraryItem['place'];

const BREAKFAST_HOME = item(1, { item_type: 'meal', meal_source: 'stay', title: 'Breakfast where you stay', start_time: '08:10', end_time: '08:55', duration_minutes: 45, order_index: 0 });
const PARK = item(2, { title: 'Jahanabad Park', start_time: '09:00', end_time: '11:30', duration_minutes: 150, order_index: 1, place: place(2, 22.8, 89.55) });
const LUNCH_OWN = item(3, { item_type: 'meal', meal_source: 'own', title: 'Packed lunch', start_time: '12:00', end_time: '12:30', duration_minutes: 30, cost: 150, notes: 'At Jahanabad Park', order_index: 2 });
const MUSEUM = item(4, { title: 'Divisional Museum', start_time: '13:00', end_time: '14:30', duration_minutes: 90, order_index: 3, place: place(4, 22.82, 89.54) });
const DINNER_HOME = item(5, { item_type: 'meal', meal_source: 'stay', title: 'Dinner where you stay', start_time: '19:00', end_time: '19:45', duration_minutes: 45, order_index: 4 });
const DAY: ItineraryDay = { id: 9, trip_id: 1, day_number: 1, total_cost: 0, total_travel_time: 0, items: [BREAKFAST_HOME, PARK, LUNCH_OWN, MUSEUM, DINNER_HOME] };

describe('the meal plan', () => {
  it('is the default when every meal is at a restaurant and no amount is set', () => {
    expect(isDefault(null)).toBe(true);
    expect(isDefault(DEFAULT_PLAN)).toBe(true);
    expect(isDefault({ ...DEFAULT_PLAN, own_cost_per_person: 100 })).toBe(false);
    expect(isDefault(withMeal(DEFAULT_PLAN, 'Lunch', 'own'))).toBe(false);
    expect(samePlan(null, DEFAULT_PLAN)).toBe(true);
  });

  it('never has lunch where you stay', () => {
    expect(withMeal(DEFAULT_PLAN, 'Lunch', 'stay')).toEqual(DEFAULT_PLAN);
    expect(withMeal(DEFAULT_PLAN, 'Dinner', 'stay').Dinner).toBe('stay');
  });

  it('says itself in a line', () => {
    expect(planSummary(null, t)).toBe('Best places to eat');
    expect(planSummary(withMeal(DEFAULT_PLAN, 'Lunch', 'own'), t)).toBe('Packed lunch');
    expect(planSummary({ ...stayMeals(DEFAULT_PLAN), Lunch: 'own' } as MealPlan, t)).toBe('Packed lunch · breakfast and dinner where you stay');
    expect(planSummary(stayMeals(null), t)).toBe('Breakfast and dinner where you stay');
  });

  it('offers breakfast and dinner where you stay until both are', () => {
    expect(offerStayMeals(null)).toBe(true);
    expect(offerStayMeals(stayMeals(null))).toBe(false);
    expect(stayMeals(withMeal(DEFAULT_PLAN, 'Lunch', 'own'))).toEqual({ ...DEFAULT_PLAN, Breakfast: 'stay', Lunch: 'own', Dinner: 'stay' });
  });

  it('reads a meal row: its meal, and its words', () => {
    expect(slotOf(item(0, { item_type: 'meal', title: 'Lunch at Mermaid Cafe' }))).toBe('Lunch');
    expect(slotOf(LUNCH_OWN)).toBe('Lunch');
    expect(slotOf(DINNER_HOME)).toBe('Dinner');
    expect(slotOf(PARK)).toBeNull();
    expect(mealTitle(LUNCH_OWN, t)).toBe('Packed lunch (your own)');
    expect(mealTitle(BREAKFAST_HOME, t)).toBe('Breakfast where you stay');
    expect(mealTitle(item(0, { item_type: 'meal', meal_source: 'restaurant', title: 'Lunch at X' }), t)).toBeNull();
  });
});

describe('the new trip', () => {
  const TODAY = new Date('2026-10-18T10:00:00');

  it('sends meals only when they differ from the best places to eat', () => {
    const t0 = defaultNewTrip(TODAY, 'Khulna');
    expect(t0.meals).toBeNull();
    expect(toPayload(t0)).not.toHaveProperty('meals');
    expect(toPayload(update(t0, { meals: DEFAULT_PLAN }))).not.toHaveProperty('meals');
    const own = withMeal(DEFAULT_PLAN, 'Lunch', 'own');
    expect(toPayload(update(t0, { meals: { ...own, own_cost_per_person: 120 } })).meals).toEqual({ ...own, own_cost_per_person: 120 });
  });
});

describe('the plan rows', () => {
  it('a packed lunch: where it is eaten and what it costs; nothing when no amount', () => {
    expect(cardTitle(LUNCH_OWN, t)).toBe('Packed lunch (your own)');
    expect(stopSubtitle(LUNCH_OWN, t, f)).toBe('At Jahanabad Park · ৳150 each');
    expect(stopSubtitle({ ...LUNCH_OWN, cost: 0, notes: undefined }, t, f)).toBe('No cost');
    expect(cardTitle(PARK, t)).toBe('Jahanabad Park');
  });

  it('meals where you stay are not stops: left out of the order and the move preview keeps them', () => {
    expect(orderedStops(DAY).map((i) => i.id)).toEqual([2, 3, 4]);
    expect(stayMealsOf(DAY)).toEqual({ breakfast: BREAKFAST_HOME, dinner: DINNER_HOME });
    const preview = previewMove(DAY, 4, 0);
    expect(preview.map((i) => i.id)).toEqual([4, 2, 3, 1, 5]);
    expect(preview.find((i) => i.id === 5)?.start_time).toBe('19:00');
  });

  it('a packed lunch is not moved before noon, a packed dinner not before 17:30', () => {
    const early = retime([item(7, { item_type: 'meal', meal_source: 'own', title: 'Packed lunch', duration_minutes: 30, start_time: '10:00', end_time: '10:30' })], 9 * 60);
    expect(early[0].start_time).toBe('12:00');
    const dinner = retime([item(8, { item_type: 'meal', meal_source: 'own', title: 'Packed dinner', duration_minutes: 30, start_time: '15:00', end_time: '15:30' })], 15 * 60);
    expect(dinner[0].start_time).toBe('17:30');
  });

  it('breakfast where you stay: its times, the meal, no cost', async () => {
    await render(<StayMealRow item={BREAKFAST_HOME} />);
    expect(screen.getByTestId('stay-meal-1')).toHaveTextContent(/08:10–08:55 · Breakfast where you stay · No cost$/);
  });
});

describe('the way on after a packed meal', () => {
  it('comes after the meal eaten at the stop, not before it', () => {
    const park = { ...PARK, travel_time_to_next: 20, distance_to_next: 6 };
    const rows = planRows({ ...DAY, items: [park, LUNCH_OWN, MUSEUM] });
    // (free time at the park before lunch, 11:30-12:00)
    expect(rows.map((r) => r.kind)).toEqual(['stop', 'free', 'stop', 'leg', 'stop']);
    const leg = rows[3];
    expect(leg.kind === 'leg' && leg.itemId).toBe(2);
    // and on the ribbon: the travel follows the lunch
    const segs = ribbonSegments({ ...DAY, items: [park, LUNCH_OWN, MUSEUM] });
    expect(segs.map((s) => s.kind)).toEqual(['visit', 'meal', 'travel', 'visit']);
    expect(segs[2].start).toBe(12 * 60 + 30);
  });
});

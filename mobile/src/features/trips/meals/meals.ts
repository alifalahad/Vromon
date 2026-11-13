/**
 * Meals (docs/trip-upgrades, step 3; decision D6): per meal the best places to eat (the default),
 * your own food, or where you stay (breakfast and dinner only). The plan in words, a meal row's
 * title, and the one-tap "breakfast and dinner where you stay" for a family stay. Pure, unit-tested.
 */

import type { ItineraryDay, ItineraryItem, MealPlan, MealSlot, MealSource } from '../../../types';

export const SLOTS: readonly MealSlot[] = ['Breakfast', 'Lunch', 'Dinner'];

export const DEFAULT_PLAN: MealPlan = { Breakfast: 'restaurant', Lunch: 'restaurant', Dinner: 'restaurant', own_cost_per_person: null };

/** True when every meal is at a restaurant (and no amount for own food): nothing to send. */
export function isDefault(plan: MealPlan | null | undefined): boolean {
  return !plan || (SLOTS.every((s) => plan[s] === 'restaurant') && plan.own_cost_per_person == null);
}

export function samePlan(a: MealPlan | null | undefined, b: MealPlan | null | undefined): boolean {
  const x = a ?? DEFAULT_PLAN;
  const y = b ?? DEFAULT_PLAN;
  return SLOTS.every((s) => x[s] === y[s]) && (x.own_cost_per_person ?? null) === (y.own_cost_per_person ?? null);
}

/** The choices a meal has: lunch is never where you stay. */
export function choicesFor(slot: MealSlot): MealSource[] {
  return slot === 'Lunch' ? ['restaurant', 'own'] : ['restaurant', 'own', 'stay'];
}

/** A plan with one meal changed (lunch can't be "stay"). */
export function withMeal(plan: MealPlan, slot: MealSlot, source: MealSource): MealPlan {
  if (slot === 'Lunch' && source === 'stay') return plan;
  return { ...plan, [slot]: source } as MealPlan;
}

/** "Have breakfast and dinner there?" (a family stay): offered while either isn't there already. */
export function offerStayMeals(plan: MealPlan | null | undefined): boolean {
  const p = plan ?? DEFAULT_PLAN;
  return p.Breakfast !== 'stay' || p.Dinner !== 'stay';
}

export function stayMeals(plan: MealPlan | null | undefined): MealPlan {
  return { ...(plan ?? DEFAULT_PLAN), Breakfast: 'stay', Dinner: 'stay' };
}

type T = (key: string, options?: Record<string, unknown>) => string;

/** The plan in a line: "Best places to eat", or "Packed lunch · breakfast and dinner where you stay". */
export function planSummary(plan: MealPlan | null | undefined, t: T): string {
  const p = plan ?? DEFAULT_PLAN;
  if (SLOTS.every((s) => p[s] === 'restaurant')) return t('meals.best');
  const by = (source: MealSource) => SLOTS.filter((s) => p[s] === source);
  const own = by('own');
  const stay = by('stay');
  const list = (slots: MealSlot[]) => slots.map((s) => t(`meals.slotLower.${s}`)).join(t('meals.and'));
  const parts = [own.length ? t('meals.ownList', { meals: list(own) }) : null, stay.length ? t('meals.stayList', { meals: list(stay) }) : null];
  const text = parts.filter(Boolean).join(' · ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Breakfast / Lunch / Dinner for a meal item, from its title ("Lunch at X", "Packed lunch", "Dinner where you stay"). */
export function slotOf(item: Pick<ItineraryItem, 'item_type' | 'title'>): MealSlot | null {
  if (item.item_type !== 'meal') return null;
  const title = item.title.trim().toLowerCase();
  return SLOTS.find((s) => title.startsWith(s.toLowerCase()) || title.startsWith(`packed ${s.toLowerCase()}`)) ?? null;
}

export function sourceOf(item: Pick<ItineraryItem, 'item_type' | 'meal_source'>): MealSource | null {
  return item.item_type === 'meal' ? (item.meal_source ?? 'restaurant') : null;
}

/** A packed meal or one where you stay, in words ("Packed lunch (your own)", "Breakfast where you stay"); null for a restaurant meal. */
export function mealTitle(item: Pick<ItineraryItem, 'item_type' | 'title' | 'meal_source'>, t: T): string | null {
  const source = sourceOf(item);
  const slot = slotOf(item);
  if (!slot || !source || source === 'restaurant') return null;
  return t(source === 'own' ? `meals.packed.${slot}` : `meals.atStay.${slot}`);
}

/** A day's meals where you stay: breakfast (before leaving) and dinner (after getting back). */
export function stayMealsOf(day: Pick<ItineraryDay, 'items'>): { breakfast: ItineraryItem | null; dinner: ItineraryItem | null } {
  const at = day.items.filter((i) => i.item_type === 'meal' && i.meal_source === 'stay');
  return { breakfast: at.find((i) => slotOf(i) === 'Breakfast') ?? null, dinner: at.find((i) => slotOf(i) === 'Dinner') ?? null };
}

export const isStayMeal = (item: Pick<ItineraryItem, 'item_type' | 'meal_source'>) => item.item_type === 'meal' && item.meal_source === 'stay';

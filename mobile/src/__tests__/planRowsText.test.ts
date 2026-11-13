/**
 * Plan rows in the traveller's language (trip upgrades step 8, the Bangla walk on the phone): a restaurant meal's
 * title ("Breakfast · KFC" stayed English in Bangla) and a place's category ("Family").
 */
import { cardTitle, categoryLabel } from '../features/trips/plan/PlanRows';
import i18n from '../i18n';
import type { ItineraryItem } from '../types';

const meal = { item_type: 'meal', title: 'Breakfast at KFC', meal_source: 'restaurant', restaurant: { id: 1, name: 'KFC' } } as unknown as ItineraryItem;
const packed = { item_type: 'meal', title: 'Packed lunch', meal_source: 'own', restaurant: null } as unknown as ItineraryItem;
const place = { item_type: 'activity', title: 'Shahid Hadis Park', restaurant: null } as unknown as ItineraryItem;

afterEach(async () => {
  await i18n.changeLanguage('en');
});

test('a restaurant meal is named in the traveller language', async () => {
  const t = i18n.t.bind(i18n);
  expect(cardTitle(meal, t)).toBe('Breakfast · KFC');
  expect(cardTitle(place, t)).toBe('Shahid Hadis Park');
  await i18n.changeLanguage('bn');
  expect(cardTitle(meal, i18n.t.bind(i18n))).toBe('সকালের নাস্তা · KFC');
  expect(cardTitle(packed, i18n.t.bind(i18n))).toBe('নিজের আনা দুপুরের খাবার');
});

test('a category is named as the interests name it, else as it is', async () => {
  await i18n.changeLanguage('bn');
  const t = i18n.t.bind(i18n);
  expect(categoryLabel('Family', t)).toBe('পরিবার');
  expect(categoryLabel('Waterfall', t)).toBe('Waterfall');
  expect(categoryLabel(null, t)).toBeNull();
});

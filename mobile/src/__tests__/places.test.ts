import { filterByCategory, formatEntryCost, placeCategories } from '../features/places';
import type { Place } from '../types';

const place = (id: number, category: string, extra: Partial<Place> = {}): Place => ({
  id,
  name: `Place ${id}`,
  destination_name: "Cox's Bazar",
  category,
  ...extra,
});

describe('place list helpers', () => {
  const places = [place(1, 'Beach'), place(2, 'Nature'), place(3, 'Beach'), place(4, 'Culture')];

  it('lists each category once, sorted', () => {
    expect(placeCategories(places)).toEqual(['Beach', 'Culture', 'Nature']);
    expect(placeCategories([])).toEqual([]);
  });

  it('filters by category and keeps backend order', () => {
    expect(filterByCategory(places, 'Beach').map((p) => p.id)).toEqual([1, 3]);
    expect(filterByCategory(places, null)).toBe(places);
    expect(filterByCategory(places, 'Shopping')).toEqual([]);
  });

  it('never shows a missing cost as free', () => {
    expect(formatEntryCost({ estimated_cost: undefined, currency: 'BDT' })).toBe('Cost unknown');
    expect(formatEntryCost({ estimated_cost: 0, currency: 'BDT' })).toBe('Free entry');
    expect(formatEntryCost({ estimated_cost: 1500, currency: 'BDT' })).toBe('৳1,500');
    expect(formatEntryCost({ estimated_cost: 12, currency: 'USD' })).toBe('12 USD');
  });
});

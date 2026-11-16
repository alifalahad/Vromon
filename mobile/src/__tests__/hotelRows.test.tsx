/**
 * The hotels in the stays sheet (docs/ui-refresh step 11): a hotel without a price still says what sort of place
 * it is and how far from the centre; priced and rated hotels first, then the nearest.
 */

import { act } from '@testing-library/react-native';

import { hotelLine, sortHotels } from '../features/trips/stays/hotelRow';
import { localDigits } from '../features/trips/plan/usePlanFormat';
import i18n from '../i18n';
import type { Hotel } from '../types';

const t = i18n.t.bind(i18n) as (key: string, options?: Record<string, unknown>) => string;
const f = {
  n: (v: number) => localDigits(String(v), i18n.language),
  money: (v: number) => localDigits(`৳${v.toLocaleString('en-US')}`, i18n.language),
  km: (v: number) => localDigits(v.toFixed(1), i18n.language),
} as unknown as Parameters<typeof hotelLine>[2];

const hotel = (id: number, over: Partial<Hotel>) =>
  ({ id, name: `Hotel ${id}`, category: 'Standard', price_per_night: 0, price_known: false, rating_known: false, ...over }) as Hotel;

beforeEach(async () => {
  await act(() => i18n.changeLanguage('en'));
});

describe('a hotel row', () => {
  it('without a price: its kind and how far from the centre, not "Standard · Price not known"', () => {
    expect(hotelLine(hotel(1, { kind: 'rest_house', km_from_centre: 0.8 }), t, f)).toBe('Rest house · 0.8 km from the centre · Price not known');
    expect(hotelLine(hotel(2, { kind: 'hotel', km_from_centre: 0.1 }), t, f)).toBe('Hotel · In the centre · Price not known');
  });

  it('with a price: its kind, the price and the distance', () => {
    expect(hotelLine(hotel(3, { kind: 'resort', price_known: true, price_per_night: 3500, km_from_centre: 1.24 }), t, f)).toBe(
      'Resort · ৳3,500 a night · 1.2 km from the centre',
    );
  });

  it('a demo hotel (no kind) keeps its level; an unknown kind reads as a hotel', () => {
    expect(hotelLine(hotel(4, { category: 'Luxury', price_known: true, price_per_night: 9000 }), t, f)).toBe('Luxury · ৳9,000 a night');
    expect(hotelLine(hotel(5, { kind: 'treehouse', km_from_centre: 2 }), t, f)).toBe('Hotel · 2.0 km from the centre · Price not known');
  });

  it('in Bangla', async () => {
    await act(() => i18n.changeLanguage('bn'));
    expect(hotelLine(hotel(6, { kind: 'guest_house', km_from_centre: 1.5 }), t, f)).toBe('গেস্ট হাউস · কেন্দ্র থেকে ১.৫ কিমি · দাম জানা নেই');
  });
});

describe('the order', () => {
  it('priced first (cheapest first), then rated, then the rest nearest the centre first', () => {
    const list = [
      hotel(1, { km_from_centre: 3 }),
      hotel(2, { price_known: true, price_per_night: 4000 }),
      hotel(3, { km_from_centre: 0.5 }),
      hotel(4, { rating_known: true, rating: 4.2 }),
      hotel(5, { price_known: true, price_per_night: 2500 }),
      hotel(6, {}),
    ];
    expect(sortHotels(list).map((h) => h.id)).toEqual([5, 2, 4, 3, 1, 6]);
  });
});

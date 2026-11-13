/**
 * The stay advisor in the app (docs/trip-upgrades, step 4): the card's words and numbers, "Why?",
 * and reading it as one sentence.
 */

import { act } from '@testing-library/react-native';

import { adviceA11y, adviceForDay, advicePrice, adviceSaves, adviceTitle, whyLines } from '../features/trips/stays/advice';
import i18n from '../i18n';
import type { StaySuggestion } from '../types';

const t = i18n.t.bind(i18n) as (key: string, options?: Record<string, unknown>) => string;
const f = {
  n: (v: number) => String(v),
  money: (v: number) => `৳${Math.round(v).toLocaleString('en-US')}`,
  duration: (m: number) => (m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}` : `${m} min`),
};

beforeEach(async () => {
  await act(() => i18n.changeLanguage('en'));
});

/** Worked example 1 of the step 4 report: night 3 in Mongla */
export const MONGLA: StaySuggestion = {
  id: 6,
  first_night: 3,
  last_night: 3,
  nights: 1,
  day_number: 3,
  hotel: { id: 9, name: 'Hotel Pashur', destination_name: 'Bagerhat', price_per_night: 2800, currency: 'BDT', rating: 3.5, rating_known: false, latitude: 22.47, longitude: 89.6 },
  current: { id: 4, name: 'Hotel City Inn', price_per_night: 2500 },
  money_saved: 2400,
  minutes_saved: 104,
  extra_moves: 1,
  parts: {
    rooms: 1, nights: 1, price_now: 2500, price_then: 2800, stay_now: 2500, stay_then: 2800, road_now: 236, road_then: 11,
    fares_now: 4410, fares_then: 280, transfer_minutes: 76, transfer_cost: 1430, hassle_minutes: 45, days: [3, 4], time_value: 5,
  },
};

describe('the card', () => {
  it('says where, for which nights, the price against the current one, what it saves and the move', () => {
    expect(adviceTitle(MONGLA, 'Khulna', t, f)).toBe('Sleep in Bagerhat for night 3?');
    expect(adviceTitle({ ...MONGLA, hotel: { ...MONGLA.hotel, destination_name: 'Khulna' }, last_night: 4 }, 'Khulna', t, f)).toBe(
      'Sleep at Hotel Pashur for nights 3–4?',
    );
    expect(advicePrice(MONGLA, t, f)).toBe('Hotel Pashur, ৳2,800 a night instead of ৳2,500.');
    expect(advicePrice({ ...MONGLA, current: { ...MONGLA.current!, price_per_night: null } }, t, f)).toBe(
      "Hotel Pashur, ৳2,800 a night. Your hotel's price isn't known.",
    );
    expect(adviceSaves(MONGLA, t, f)).toEqual({ saves: 'Saves ৳2,400 and 1 h 44 min on the road', move: 'One extra check-out and check-in.' });
  });

  it('says it plainly when it saves only money, only time, or costs a little', () => {
    expect(adviceSaves({ ...MONGLA, minutes_saved: -10 }, t, f).saves).toBe('Saves ৳2,400, with 10 min more on the road');
    expect(adviceSaves({ ...MONGLA, money_saved: null }, t, f).saves).toBe('Saves 1 h 44 min on the road');
    expect(adviceSaves({ ...MONGLA, money_saved: -300 }, t, f).saves).toBe('Saves 1 h 44 min on the road for ৳300 more');
    expect(adviceSaves({ ...MONGLA, extra_moves: 0 }, t, f).move).toBe("No extra move: you'd stay there from the start.");
  });

  it('"Why?" adds it up in plain words', () => {
    expect(whyLines(MONGLA, t, f)).toEqual([
      'Now: ৳2,500 a night × 1 night × 1 room = ৳2,500.',
      'Hotel Pashur: ৳2,800 a night × 1 night × 1 room = ৳2,800.',
      'Days 3, 4, on the road to and from where you stay: 3 h 56 min now, 11 min from there.',
      'All the rides on those days cost ৳4,410 now and ৳280 from there.',
      'Moving with your bags: a ride of 1 h 16 min, about ৳1,430.',
      'Packing and checking out and in: we count 45 min.',
      'All together: Saves ৳2,400 and 1 h 44 min on the road.',
      expect.stringContaining('Your time counts as ৳5 a minute.'),
    ]);
  });

  it('reads as one sentence, and shows above the day it starts on', () => {
    expect(adviceA11y(MONGLA, 'Khulna', t, f)).toBe(
      'Sleep in Bagerhat for night 3? Hotel Pashur, ৳2,800 a night instead of ৳2,500. Saves ৳2,400 and 1 h 44 min on the road. One extra check-out and check-in.',
    );
    expect(adviceForDay([MONGLA], 3)).toEqual([MONGLA]);
    expect(adviceForDay([MONGLA], 2)).toEqual([]);
    expect(adviceForDay(undefined, 3)).toEqual([]);
  });
});

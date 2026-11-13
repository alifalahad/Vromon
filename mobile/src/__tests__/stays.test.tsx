/**
 * Where the traveller stays (docs/trip-upgrades, step 2): the night-by-night choices and the
 * stays sent to the server, the budget they suggest, the plan's first and last rows, the
 * "Tonight" line, the budget's stay lines and Today's leave-by from the stay.
 */

import { act, render, screen } from '@testing-library/react-native';
import React from 'react';

import { defaultNewTrip, suggestedBudget, toPayload, update } from '../features/trips/new/newTrip';
import { BaseRow } from '../features/trips/stays/BaseRow';
import {
  allSame,
  baseName,
  freeNights,
  freeNightSaving,
  hotelPick,
  nightsText,
  pickName,
  picksFromStays,
  stayLines,
  staysFromPicks,
  type StayPick,
} from '../features/trips/stays/stays';
import { TonightRow } from '../features/trips/stays/TonightRow';
import { backAt, dayStart, leaveBy, leaveTimes, t2m, todayState } from '../features/trips/today/today';
import i18n from '../i18n';
import type { DayBase, Hotel, ItineraryDay, ItineraryItem, Stay } from '../types';

jest.mock('../ui/haptics', () => ({
  haptic: jest.fn(),
  haptics: { success: jest.fn(), error: jest.fn(), light: jest.fn(), warning: jest.fn(), selection: jest.fn(), medium: jest.fn() },
}));

const t = i18n.t.bind(i18n) as (key: string, options?: Record<string, unknown>) => string;
const f = { n: (v: number) => String(v), money: (v: number) => `৳${v.toLocaleString('en-US')}` };

beforeEach(async () => {
  await act(() => i18n.changeLanguage('en'));
});

const CASTLE: StayPick = { kind: 'hotel', hotelId: 7, name: 'Hotel Castle Salam', perNight: 3000 };
const UNCLE: StayPick = { kind: 'home', lat: 22.81, lon: 89.56, label: "Uncle's house" };

const hotel = (id: number, category: string, price: number, known = true) =>
  ({ id, name: `Hotel ${id}`, category, price_per_night: price, price_known: known, destination_name: 'Khulna' }) as unknown as Hotel;

describe('night by night', () => {
  it('nights that share a choice become one stay', () => {
    expect(staysFromPicks([CASTLE, CASTLE, UNCLE])).toEqual([
      { first_night: 1, last_night: 2, kind: 'hotel', hotel_id: 7, label: null, lat: null, lon: null },
      { first_night: 3, last_night: 3, kind: 'home', hotel_id: null, label: "Uncle's house", lat: 22.81, lon: 89.56 },
    ]);
  });

  it('nothing chosen: Vromon picks (no stays sent); a night left to Vromon among chosen ones is "decide later"', () => {
    expect(staysFromPicks([{ kind: 'auto' }, { kind: 'auto' }])).toBeNull();
    expect(staysFromPicks([])).toBeNull();
    expect(staysFromPicks([CASTLE, { kind: 'auto' }])?.map((s) => s.kind)).toEqual(['hotel', 'undecided']);
  });

  it("reads the server's stays back as one choice per night", () => {
    const stays = [
      { first_night: 1, last_night: 2, nights: 2, kind: 'hotel', hotel: { id: 7, name: 'Hotel Castle Salam', price_per_night: 3000, price_known: true }, label: null, lat: null, lon: null },
      { first_night: 3, last_night: 3, nights: 1, kind: 'home', hotel: null, label: "Uncle's house", lat: 22.81, lon: 89.56 },
    ] as unknown as Stay[];
    const picks = picksFromStays(stays, 3);
    expect(picks).toEqual([CASTLE, CASTLE, UNCLE]);
    expect(staysFromPicks(picks)).toHaveLength(2);
    // a night the stays don't cover takes the last stay's choice
    expect(picksFromStays(stays, 4)[3]).toEqual(UNCLE);
    expect(picksFromStays([], 2)).toEqual([{ kind: 'auto' }, { kind: 'auto' }]);
  });

  it('a hotel without a price has no price per night', () => {
    expect(hotelPick({ id: 3, name: 'Hotel 3', price_per_night: 0, price_known: false })).toEqual({ kind: 'hotel', hotelId: 3, name: 'Hotel 3', perNight: null });
  });

  it('counts the nights that cost nothing and says whether all are the same', () => {
    expect(freeNights([CASTLE, UNCLE, { kind: 'none' }, { kind: 'undecided' }])).toBe(2);
    expect(allSame([CASTLE, CASTLE])).toBe(true);
    expect(allSame([CASTLE, UNCLE])).toBe(false);
  });

  it("a free night saves the middle price of the level's priced hotels, per room", () => {
    const hotels = [hotel(1, 'Standard', 2000), hotel(2, 'Standard', 3000), hotel(3, 'Standard', 9000), hotel(4, 'Standard', 0, false), hotel(5, 'Luxury', 12000)];
    expect(freeNightSaving(hotels, 'Standard', 1)).toBe(3000);
    expect(freeNightSaving(hotels, 'Standard', 2)).toBe(6000);
    expect(freeNightSaving(hotels.slice(0, 2), 'Standard', 1)).toBe(2500);
    // no priced hotel at that level: nothing is guessed
    expect(freeNightSaving(hotels, 'Budget', 1)).toBe(0);
  });

  it('names each choice in words', () => {
    expect(pickName(CASTLE, t)).toBe('Hotel Castle Salam');
    expect(pickName(UNCLE, t)).toBe("Uncle's house");
    expect(pickName({ ...UNCLE, label: null } as StayPick, t)).toBe('With family or friends');
    expect(pickName({ kind: 'none' }, t)).toBe('Day trip, no night here');
    expect(pickName({ kind: 'undecided' }, t)).toBe('Decide later');
    expect(pickName({ kind: 'auto' }, t)).toBe('Let Vromon pick a hotel');
    expect(nightsText(3, 3, t, f)).toBe('Night 3');
    expect(nightsText(1, 2, t, f)).toBe('Nights 1–2');
  });
});

describe('the new trip', () => {
  const TODAY = new Date('2026-10-18T10:00:00');

  it('one choice per night, kept as the dates change', () => {
    const t0 = defaultNewTrip(TODAY, 'Khulna');
    expect(t0.stayPicks).toEqual([{ kind: 'auto' }, { kind: 'auto' }]);
    const chosen = update(t0, { stayPicks: [CASTLE, UNCLE] });
    // a day longer: the new night takes the last night's choice
    const longer = update(chosen, { end: '2026-10-28' });
    expect(longer.stayPicks).toEqual([CASTLE, UNCLE, UNCLE]);
    // a day trip: no nights
    expect(update(chosen, { end: chosen.start }).stayPicks).toEqual([]);
  });

  it('nights with family take their hotel cost off the suggested budget', () => {
    const t0 = defaultNewTrip(TODAY, 'Khulna');
    const before = suggestedBudget(t0);
    const t1 = update(update(t0, { freeNightPrice: 3000 }), { stayPicks: [UNCLE, UNCLE] });
    // two travellers share a room: 2 nights × ৳3,000
    expect(t1.budget).toBe(before - 6000);
    // set by hand: left alone
    const byHand = update({ ...t0, budgetByHand: true, budget: 10000 }, { stayPicks: [UNCLE, UNCLE], freeNightPrice: 3000 });
    expect(byHand.budget).toBe(10000);
  });

  it('sends the stays only when chosen', () => {
    const t0 = defaultNewTrip(TODAY, 'Khulna');
    expect(toPayload(t0)).not.toHaveProperty('stays');
    expect(toPayload(update(t0, { stayPicks: [CASTLE, UNCLE] })).stays).toHaveLength(2);
  });
});

describe('the budget, stay by stay', () => {
  const block = (first: number, last: number, kind: 'hotel' | 'home' | 'none' | 'undecided', extra: object = {}) => ({
    first_night: first, last_night: last, nights: last - first + 1, kind, hotel: null, hotel_id: null, label: null, amount: null, per_night: null, rooms: 1, ...extra,
  });

  it('one hotel for every night: the part says it all, no lines', () => {
    expect(stayLines([block(1, 2, 'hotel', { hotel: 'Hotel Castle Salam', amount: 6000 })], t, f)).toEqual([]);
    expect(stayLines(undefined, t, f)).toEqual([]);
  });

  it('a line per stay: the hotel cost, "No cost" with family or for a day trip, "Not chosen yet"', () => {
    const lines = stayLines(
      [block(1, 2, 'hotel', { hotel: 'Hotel Castle Salam', amount: 6000 }), block(3, 3, 'home', { label: "Uncle's house", amount: 0 }), block(4, 4, 'undecided')],
      t,
      f,
    );
    expect(lines.map((l) => [l.nights, l.name, l.amount])).toEqual([
      ['Nights 1–2', 'Hotel Castle Salam', '৳6,000'],
      ['Night 3', "Uncle's house", 'No cost'],
      ['Night 4', 'Decide later', 'Not chosen yet'],
    ]);
    // someone else's trip: the home has no name
    expect(stayLines([block(1, 1, 'home', { amount: 0 })], t, f)[0].name).toBe('With family or friends');
  });
});

const HOTEL_BASE: DayBase = { kind: 'hotel', name: 'Hotel Castle Salam', latitude: 22.82, longitude: 89.55, hotel_id: 7, estimate: false };
const HOME_BASE: DayBase = { kind: 'home', name: "Uncle's house", latitude: 22.81, longitude: 89.56, hotel_id: null, estimate: false };
// What a friend sees of a home (D2)
const HIDDEN_HOME: DayBase = { kind: 'home', name: null, latitude: null, longitude: null, hotel_id: null, estimate: false };

const item = (id: number, extra: Partial<ItineraryItem>): ItineraryItem => ({
  id, item_type: 'activity', title: 'Stop', start_time: '10:00', end_time: '11:00', duration_minutes: 60, cost: 0,
  travel_time_to_next: 0, distance_to_next: 0, recommendation_score: 0.5, recommendation_reasons: [], order_index: 0,
  currency: 'BDT', cost_source: 'data', ...extra,
});
const place = (id: number, lat: number, lon: number) =>
  ({ id, name: `Place ${id}`, destination_name: 'Khulna', category: 'Museum', latitude: lat, longitude: lon, opening_time: '09:00', closing_time: '18:00' }) as ItineraryItem['place'];
const DAY: ItineraryDay = {
  id: 21, trip_id: 9, day_number: 1, day_date: '2026-11-20', total_cost: 0, total_travel_time: 0,
  items: [
    item(1, { title: 'Divisional Museum', start_time: '09:30', end_time: '11:00', order_index: 0, place: place(1, 22.83, 89.54) }),
    item(2, { title: 'Rupsha Bridge', start_time: '16:30', end_time: '19:15', order_index: 1, place: place(2, 22.77, 89.6) }),
  ],
  start_base: HOTEL_BASE,
  end_base: HOME_BASE,
  start_leg: { to_item_id: 1, minutes: 15, km: 3.2, mode: 'cng', cost: 60 },
  return_leg: { from_item_id: 2, minutes: 25, km: 6.1, mode: 'cng', cost: 80 },
};

describe("the plan's first and last rows", () => {
  it('"From" the stay, and "Back to" it with the time and fare', async () => {
    await render(
      <>
        <BaseRow way="from" base={DAY.start_base} leg={DAY.start_leg} />
        <BaseRow way="back" base={DAY.end_base} leg={DAY.return_leg} />
      </>,
    );
    expect(screen.getByTestId('base-from')).toHaveTextContent(/From Hotel Castle Salam · 15 min$/);
    expect(screen.getByTestId('base-back')).toHaveTextContent(/Back to Uncle's house · 25 min · ৳80$/);
  });

  it("someone else's home: only \"with family or friends\", no time or fare", async () => {
    await render(<BaseRow way="back" base={HIDDEN_HOME} leg={null} />);
    expect(screen.getByTestId('base-back')).toHaveTextContent(/Back to With family or friends$/);
    expect(screen.getByTestId('base-back')).not.toHaveTextContent(/min|৳/);
  });

  it('a stand-in at the town centre says it is a rough guess', async () => {
    await render(<BaseRow way="from" base={{ kind: 'undecided', name: null, latitude: 22.8, longitude: 89.5, hotel_id: null, estimate: true }} leg={DAY.start_leg} />);
    expect(screen.getByTestId('base-from')).toHaveTextContent(/From your stay \(not chosen yet\) · 15 min · rough guess$/);
  });

  it('no stay, no row', async () => {
    await render(<BaseRow way="from" base={null} leg={null} />);
    expect(screen.queryByTestId('base-from')).toBeNull();
  });

  it('names a day start or end', () => {
    expect(baseName(HOTEL_BASE, t)).toBe('Hotel Castle Salam');
    expect(baseName(HIDDEN_HOME, t)).toBe('With family or friends');
    expect(baseName({ ...HIDDEN_HOME, kind: 'none', name: 'Dhaka' }, t)).toBe('Dhaka');
    expect(baseName(null, t)).toBeNull();
  });
});

describe('Tonight', () => {
  it('where you sleep, with Change for the owner', async () => {
    await render(<TonightRow day={DAY} lastDay={false} onChange={jest.fn()} />);
    expect(screen.getByTestId('stays-tonight')).toHaveTextContent(/Tonight: Uncle's houseChange$/);
  });

  it('the last day says where you leave from; a friend has no Change', async () => {
    await render(<TonightRow day={DAY} lastDay />);
    expect(screen.getByTestId('stays-tonight')).toHaveTextContent(/Last day: leave from Hotel Castle Salam$/);
    expect(screen.getByTestId('stays-tonight')).not.toHaveTextContent('Change');
  });
});

describe('Today, from and back to the stay', () => {
  it("starts the day at its stay (else the trip's hotel)", () => {
    expect(dayStart(DAY, { lat: 1, lon: 1 })).toEqual({ lat: 22.82, lon: 89.55 });
    expect(dayStart({ ...DAY, start_base: HIDDEN_HOME }, { lat: 1, lon: 1 })).toEqual({ lat: 1, lon: 1 });
  });

  it("leave by for the day's first stop uses the server's way from the stay", () => {
    const l = leaveBy(todayState(DAY, t2m('08:00')), dayStart(DAY, null), null, DAY.start_leg)!;
    // 09:30 − 15 min − the usual morning traffic (×1.3), rounded down to 5 min
    expect(l).toMatchObject({ from: 'hotel', minutes: 15, mode: 'cng', at: '09:10' });
    expect(leaveTimes(DAY, null)[0].leave).toMatchObject({ from: 'hotel', minutes: 15 });
  });

  it('back at the stay: after the last stop plus the way back', () => {
    expect(backAt(DAY)).toEqual({ at: '19:40', minutes: 25, cost: 80 });
    expect(backAt({ ...DAY, return_leg: null })).toBeNull();
  });
});

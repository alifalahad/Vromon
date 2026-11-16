/**
 * The Trips tab and "Your trips so far" (docs/ui-refresh step 9): the fixed header, the next-trip card's
 * three states, the line of numbers, the list, and the trips behind each number.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { StyleSheet } from 'react-native';

import TripsScreen from '../../app/(tabs)/trips';
import TripStatsScreen from '../../app/stats/trips';
import { durationDays, formatRange, groupTrips, localToday, tripPhase, tripToMarkVisited } from '../features/trips/dates';
import { defaultNewTrip, toPayload } from '../features/trips/new/newTrip';
import { nextTripState } from '../features/trips/NextTripCard';
import { filterOf, tripsFor } from '../features/trips/soFar';
import { numberParts } from '../features/trips/TripNumbers';
import i18n from '../i18n';
import { tripsApi } from '../services/api';
import type { Trip, TripStats, TripStop } from '../types';
import { darkColors, lightColors } from '../ui/theme/tokens';

const mockPush = jest.fn();
const mockNavigate = jest.fn();
const mockParams: { year?: string; city?: string } = {};
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, navigate: mockNavigate, back: jest.fn() }),
  useScrollToTop: jest.fn(),
  useLocalSearchParams: () => mockParams,
  Stack: { Screen: () => null },
}));
jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);
jest.mock('../ui/haptics', () => ({
  haptic: jest.fn(),
  haptics: { success: jest.fn(), error: jest.fn(), light: jest.fn(), warning: jest.fn(), selection: jest.fn(), medium: jest.fn() },
}));
jest.mock('../features/account/useMe', () => ({ ME_QUERY_KEY: ['me'], useMe: () => ({ data: { id: 'me' } }) }));
const mockVisits: { data: unknown[] } = { data: [] };
jest.mock('../services/api', () => ({
  tripsApi: { list: jest.fn(), stats: jest.fn(), markVisited: jest.fn(), getItinerary: jest.fn(), budget: jest.fn(), conditions: jest.fn(), generate: jest.fn() },
  roomsApi: { joined: jest.fn(() => Promise.resolve([])) },
}));
jest.mock('../features/map/visits', () => ({ visitsKey: (id: string) => ['visits', id], useVisits: () => mockVisits }));

const api = tripsApi as unknown as Record<'list' | 'stats' | 'markVisited' | 'getItinerary' | 'budget' | 'conditions' | 'generate', jest.Mock>;
const { haptics } = jest.requireMock('../ui/haptics') as { haptics: Record<string, jest.Mock> };

const clients: QueryClient[] = [];
function renderWithQuery(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { gcTime: Infinity } } });
  clients.push(client);
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}
afterEach(() => clients.splice(0).forEach((c) => c.clear()));
beforeEach(async () => {
  jest.clearAllMocks();
  delete mockParams.year;
  delete mockParams.city;
  api.getItinerary.mockResolvedValue({ days: [] });
  api.budget.mockResolvedValue(null);
  api.conditions.mockResolvedValue({ available: false, fetched_at: null, stale: false, forecast_until: null, days: [] });
  await act(() => i18n.changeLanguage('en'));
});

const COX = 1336134;
const KHULNA = 1336135;

const stop = (city: string, country: string, iso2: string, mode: TripStop['transport_mode'], position: number, at?: [number, number]): TripStop => ({
  position,
  city_geonameid: position + 1,
  city_name: city,
  country_iso2: iso2,
  country_name: country,
  transport_mode: mode,
  arrive_on: null,
  depart_on: null,
  lat: at?.[1] ?? null,
  lon: at?.[0] ?? null,
});

const trip = (id: number, start: string, end: string, extra: Partial<Trip> = {}): Trip => ({
  id,
  destination: "Cox's Bazar",
  start_date: start,
  end_date: end,
  num_travelers: 1,
  total_budget: 20000,
  currency: 'BDT',
  status: 'generated',
  num_days: durationDays(start, end),
  created_at: '2026-10-01T00:00:00',
  user_id: 'me',
  stops: [],
  visited_prompt: null,
  ...extra,
});

const ZERO: TripStats = {
  trips: 0,
  total_days: 0,
  average_days: 0,
  countries: 0,
  cities: 0,
  finished: [],
  longest_trip: null,
  places: { countries: [], cities: [] },
  per_year: [],
  upcoming: 1,
  ongoing: 0,
};

describe('trip dates', () => {
  it('reproduces the 20-day example', () => {
    expect(durationDays('2026-10-12', '2026-10-31')).toBe(20);
    expect(durationDays('2026-10-12', '2026-10-12')).toBe(1);
    expect(durationDays('2026-03-28', '2026-03-30')).toBe(3); // across a DST change elsewhere
  });

  it('phases follow the local calendar', () => {
    expect(tripPhase('2026-10-18', '2026-10-20', '2026-10-17')).toBe('upcoming');
    expect(tripPhase('2026-10-12', '2026-10-17', '2026-10-17')).toBe('ongoing');
    expect(tripPhase('2026-10-10', '2026-10-16', '2026-10-17')).toBe('past');
    expect(localToday(new Date(2026, 9, 7, 23, 59))).toBe('2026-10-07');
  });

  it('groups and orders Upcoming, Ongoing, Past', () => {
    const groups = groupTrips(
      [trip(1, '2026-11-05', '2026-11-06'), trip(2, '2026-10-01', '2026-10-03'), trip(3, '2026-10-20', '2026-10-21'), trip(4, '2026-10-15', '2026-10-19'), trip(5, '2026-09-01', '2026-09-02')],
      '2026-10-17',
    );
    expect(groups.map((g) => [g.phase, g.data.map((t) => t.id)])).toEqual([
      ['upcoming', [3, 1]],
      ['ongoing', [4]],
      ['past', [2, 5]],
    ]);
  });

  it('formats ranges like the screenshot', () => {
    expect(formatRange('2026-10-12', '2026-10-31', 'en-GB')).toBe('12–31 Oct 2026');
    expect(formatRange('2026-10-28', '2026-11-03', 'en-GB')).toBe('28 Oct – 3 Nov 2026');
    expect(formatRange('2026-12-28', '2027-01-03', 'en-GB')).toBe('28 Dec 2026 – 3 Jan 2027');
  });

  it('offers to mark the latest unanswered finished trip with stops', () => {
    const s = [stop('Dhaka', 'Bangladesh', 'BD', null, 0)];
    const trips = [
      trip(1, '2026-10-01', '2026-10-03', { stops: s }),
      trip(2, '2026-10-05', '2026-10-06', { stops: s, visited_prompt: 'dismissed' }),
      trip(3, '2026-10-08', '2026-10-09', { stops: [] }),
      trip(4, '2026-10-20', '2026-10-22', { stops: s }),
    ];
    expect(tripToMarkVisited(trips, '2026-10-17')?.id).toBe(1);
    expect(tripToMarkVisited([trips[1], trips[3]], '2026-10-17')).toBeUndefined();
    // Nothing new to mark: Dhaka (city 1) is already on the map
    expect(tripToMarkVisited(trips, '2026-10-17', new Set(['city:1']))).toBeUndefined();
  });
});

describe('the new-trip flow', () => {
  it('sends where you start and how you like to travel (several ways, or by budget)', () => {
    const base = defaultNewTrip(new Date('2026-11-01T00:00:00'), "Cox's Bazar");
    const city = { ...base, origin: { city_geonameid: 1185241, label: 'Dhaka, Bangladesh' }, modes: ['bus', 'train'] as ('bus' | 'train')[] };
    expect(toPayload(city)).toMatchObject({ origin: { city_geonameid: 1185241 }, origin_point: null, transport_modes: ['bus', 'train'], transport_by_budget: false });
    const here = { ...base, origin: { here: true as const, lat: 22.8, lon: 89.5, label: 'your location' } };
    expect(toPayload(here)).toMatchObject({ origin: null, origin_point: { lat: 22.8, lon: 89.5 }, transport_modes: [], transport_by_budget: true });
    expect(toPayload(base)).toMatchObject({ origin: null, origin_point: null, transport_by_budget: true });
  });
});


describe('Trips tab', () => {
  const addDays = (n: number) => localToday(new Date(Date.now() + n * 86_400_000));
  const today = localToday();
  const item = (id: number, extra: Record<string, unknown>) => ({
    id, item_type: 'activity', title: 'Stop', order_index: id, start_time: '10:00', end_time: '11:00', duration_minutes: 60, cost: 0,
    travel_time_to_next: 0, distance_to_next: 0, recommendation_score: 0.5, recommendation_reasons: [], currency: 'BDT', cost_source: 'data', ...extra,
  });

  it('keeps "Trips" and "New trip" in a header the list scrolls under, with a hairline once it does', async () => {
    api.list.mockResolvedValue([trip(1, addDays(20), addDays(22))]);
    api.stats.mockResolvedValue(ZERO);
    await renderWithQuery(<TripsScreen />);
    expect(await screen.findByTestId('trips-header')).toHaveTextContent(/^TripsNew trip$/);
    expect(screen.getByTestId('trips-header')).toHaveStyle({ borderBottomColor: 'transparent' });
    await fireEvent.scroll(screen.getByTestId('trips-list'), { nativeEvent: { contentOffset: { y: 40 }, contentSize: { height: 2000, width: 390 }, layoutMeasurement: { height: 800, width: 390 } } });
    expect([lightColors.hairline, darkColors.hairline]).toContain(StyleSheet.flatten(screen.getByTestId('trips-header').props.style).borderBottomColor);
    await fireEvent.press(screen.getByTestId('plan-trip-fab'));
    expect(mockPush).toHaveBeenCalledWith('/trip/new');
  });

  it('before the trip: where it goes, the days to go, how day 1 begins, the budget, Open plan and Invite', async () => {
    api.list.mockResolvedValue([
      trip(3, addDays(5), addDays(7), { num_travelers: 2, stops: [stop('Dhaka', 'Bangladesh', 'BD', null, 0, [90.4, 23.7]), stop("Cox's Bazar", 'Bangladesh', 'BD', 'bus', 1, [91.98, 21.45])] }),
      trip(1, addDays(20), addDays(22)),
    ]);
    api.stats.mockResolvedValue({ ...ZERO, trips: 11, total_days: 31, countries: 1, cities: 4 });
    api.getItinerary.mockResolvedValue({
      days: [{ id: 30, day_number: 1, day_date: addDays(5), items: [item(1, { item_type: 'meal', title: 'Breakfast', start_time: '08:00' }), item(2, { title: 'Laboni Beach', start_time: '09:00' })] }],
    });
    api.budget.mockResolvedValue({ estimated_total: 20800, total_budget: 25000 });
    await renderWithQuery(<TripsScreen />);
    const card = await screen.findByTestId('next-trip');
    await fireEvent(card, 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 358, height: 400 } } });
    expect(screen.getByTestId('next-trip-picture', { includeHiddenElements: true })).toBeTruthy();
    expect(card).toHaveTextContent(/NEXT TRIP/);
    expect(screen.getByTestId('next-trip-when')).toHaveTextContent('5days to go');
    expect(screen.getByTestId('next-trip-when').props.accessibilityLabel).toBe('5 days to go');
    expect(card).toHaveTextContent(/2 travellers/);
    expect(await screen.findByTestId('next-trip-day1')).toHaveTextContent('Day 1 starts09:00 · Laboni Beach');
    expect(await screen.findByTestId('next-trip-budget')).toHaveTextContent('Budget৳20,800 of ৳25,000');
    await fireEvent.press(screen.getByTestId('next-trip-open'));
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/trip/[id]', params: { id: 3 } });
    await fireEvent.press(screen.getByTestId('next-trip-invite'));
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/trip/invite/[id]', params: { id: '3' } });
    await fireEvent.press(card);
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/trip/[id]', params: { id: 3 } });
    // The numbers, in words that agree with them, open "Your trips so far"
    expect(screen.getByTestId('trip-numbers')).toHaveTextContent('11 trips · 31 days · 1 country · 4 cities');
    await fireEvent.press(screen.getByTestId('trip-stats-card'));
    expect(mockPush).toHaveBeenLastCalledWith('/stats/trips');
    // The other trip below, with a date block and its length
    expect(screen.getByTestId('section-upcoming')).toHaveTextContent('Upcoming');
    expect(screen.getByTestId('trip-1')).toHaveTextContent(/3 days/);
    await fireEvent.press(screen.getByTestId('trip-1'));
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/trip/[id]', params: { id: 1 } });
  });

  it("the weather on the card: the forecast's first day and the first storm", async () => {
    api.list.mockResolvedValue([trip(3, addDays(2), addDays(4))]);
    api.stats.mockResolvedValue(ZERO);
    const cday = (n: number, warnings: unknown[] = []) => ({
      day_id: 30 + n, day_number: n, date: addDays(1 + n), in_forecast: true, sunrise: '05:50', sunset: '17:20',
      temp_max: 31, temp_min: 24, rain_max: 80, code: 95, hours: [], sea: null, items: {}, legs: {}, warnings, checks: [],
    });
    api.conditions.mockResolvedValue({ available: true, fetched_at: null, stale: false, forecast_until: null, days: [cday(1), cday(2, [{ key: 's', code: 'storm', kept: false }])] });
    await renderWithQuery(<TripsScreen />);
    expect(await screen.findByTestId('next-trip-weather')).toHaveTextContent(/31° · storms likely \w+$/);
  });

  it('on the trip: On now, which day, what is next and when to leave; Open today and Full plan', async () => {
    jest.useFakeTimers({ doNotFake: ['setTimeout', 'setInterval', 'clearTimeout', 'clearInterval', 'setImmediate', 'clearImmediate', 'nextTick', 'queueMicrotask', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance'], now: new Date(2026, 10, 21, 10, 0) });
    try {
      const day = localToday();
      api.list.mockResolvedValue([trip(5, '2026-11-20', '2026-11-22')]);
      api.stats.mockResolvedValue(ZERO);
      const place = (lat: number, lon: number) => ({ id: 1, name: 'P', latitude: lat, longitude: lon });
      api.getItinerary.mockResolvedValue({
        days: [{ id: 51, day_number: 2, day_date: day, items: [
          item(1, { item_type: 'meal', title: 'Breakfast', start_time: '08:00', end_time: '09:00', restaurant: { id: 3, name: 'Cafe', latitude: 21.43, longitude: 92.0 } }),
          item(2, { title: 'Laboni Beach', start_time: '09:30', end_time: '11:00', travel_time_to_next: 25, distance_to_next: 9, travel_mode: 'cng', place: place(21.42, 92.0) }),
          item(3, { title: 'Himchari National Park', start_time: '11:30', end_time: '13:00', place: place(21.35, 92.03) }),
        ] }],
      });
      await renderWithQuery(<TripsScreen />);
      const card = await screen.findByTestId('next-trip');
      expect(card).toHaveTextContent(/ON NOW/);
      expect(screen.getByTestId('next-trip-when')).toHaveTextContent('Day 2of 3');
      expect(await screen.findByText(/1 of 3 stops done/)).toBeTruthy();
      expect(await screen.findByTestId('next-trip-next')).toHaveTextContent('NextHimchari National ParkLeave by 11:05 · 25 min by CNG');
      await fireEvent.press(screen.getByTestId('next-trip-open'));
      expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/trip/today/[id]', params: { id: 5 } });
      await fireEvent.press(screen.getByTestId('next-trip-full-plan'));
      expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/trip/[id]', params: { id: 5 } });
      await fireEvent.press(card);
      expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/trip/today/[id]', params: { id: 5 } });
    } finally {
      jest.useRealTimers();
    }
  });

  it('no plan yet: says so, and builds the plan right there', async () => {
    api.list.mockResolvedValue([trip(9, addDays(21), addDays(23), { status: 'draft', destination: 'Sylhet', num_travelers: 4 })]);
    api.stats.mockResolvedValue(ZERO);
    api.generate.mockResolvedValue({ trip_id: 9, status: 'valid' });
    await renderWithQuery(<TripsScreen />);
    const card = await screen.findByTestId('next-trip');
    expect(card).toHaveTextContent(/NEXT TRIP/);
    expect(screen.getByTestId('next-trip-when')).toHaveTextContent('In 21 days');
    expect(card).toHaveTextContent(/Sylhet.*4 travellers.*The days aren't planned yet\./);
    expect(api.getItinerary).not.toHaveBeenCalled();
    await act(async () => fireEvent.press(screen.getByTestId('next-trip-build')));
    expect(api.generate).toHaveBeenCalledWith(9, 'cpsat');
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/trip/[id]', params: { id: 9 } });
  });

  it("which card a trip gets", () => {
    expect(nextTripState(trip(1, '2026-11-20', '2026-11-22', { status: 'draft' }), '2026-11-21')).toBe('noPlan');
    expect(nextTripState(trip(1, '2026-11-20', '2026-11-22'), '2026-11-19')).toBe('before');
    expect(nextTripState(trip(1, '2026-11-20', '2026-11-22'), '2026-11-20')).toBe('onTrip');
    expect(nextTripState(trip(1, '2026-11-20', '2026-11-22'), '2026-11-22')).toBe('onTrip');
  });

  it("past trips have 'Mark visited', in one tap", async () => {
    api.list.mockResolvedValue([trip(7, addDays(-6), addDays(-3), { stops: [stop("Cox's Bazar", 'Bangladesh', 'BD', 'bus', 0)] })]);
    api.stats.mockResolvedValue({ ...ZERO, trips: 1, total_days: 4, countries: 1, cities: 1, upcoming: 0 });
    api.markVisited.mockResolvedValue({ visited_prompt: 'marked', places_marked: 2 });
    await renderWithQuery(<TripsScreen />);
    expect(await screen.findByTestId('mark-visited-7')).toBeTruthy();
    expect(screen.queryByTestId('next-trip')).toBeNull();
    expect(screen.getByTestId('section-past')).toBeTruthy();
    // One of each: the words agree
    expect(await screen.findByText('1 trip · 4 days · 1 country · 1 city', { exact: false })).toBeTruthy();
    await act(async () => fireEvent.press(screen.getByTestId('mark-visited-7')));
    expect(api.markVisited).toHaveBeenCalledWith(7, true);
    expect(haptics.success).toHaveBeenCalled();
  });

  it('a past trip already on the map says so', async () => {
    mockVisits.data = [{ place_type: 'city', place_code: '1', status: 'visited' }];
    try {
      api.list.mockResolvedValue([trip(8, addDays(-6), addDays(-3), { stops: [stop('Dhaka', 'Bangladesh', 'BD', 'bus', 0)] })]);
      api.stats.mockResolvedValue(ZERO);
      await renderWithQuery(<TripsScreen />);
      expect(await screen.findByTestId('on-map-8')).toHaveTextContent(/On your map/);
      expect(screen.queryByTestId('mark-visited-8')).toBeNull();
    } finally {
      mockVisits.data = [];
    }
  });

  it('with no trips, invites you to plan the first; the header still has New trip', async () => {
    api.list.mockResolvedValue([]);
    api.stats.mockResolvedValue(ZERO);
    await renderWithQuery(<TripsScreen />);
    expect(await screen.findByTestId('trips-empty')).toHaveTextContent(/Plan your first trip/);
    expect(screen.queryByTestId('trip-stats-card')).toBeNull();
    expect(screen.getByTestId('plan-trip-fab')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('plan-first-trip'));
    expect(mockPush).toHaveBeenCalledWith('/trip/new');
    expect(today).toBeTruthy();
  });

  it('the numbers in words, and in Bangla', async () => {
    const t = i18n.t.bind(i18n);
    const n = (v: number) => String(v);
    expect(numberParts({ ...ZERO, trips: 1, total_days: 1, countries: 1, cities: 1 }, t, n).map((p) => `${p.value} ${p.word}`)).toEqual(['1 trip', '1 day', '1 country', '1 city']);
    expect(numberParts({ ...ZERO, trips: 2, total_days: 9, countries: 3, cities: 2 }, t, n).map((p) => `${p.value} ${p.word}`)).toEqual(['2 trips', '9 days', '3 countries', '2 cities']);
    await act(() => i18n.changeLanguage('bn'));
    expect(numberParts({ ...ZERO, trips: 2, total_days: 9, countries: 1, cities: 2 }, i18n.t.bind(i18n), n).map((p) => p.word)).toEqual(['ট্রিপ', 'দিন', 'দেশ', 'শহর']);
  });
});

describe('Your trips so far', () => {
  const addDays = (n: number) => localToday(new Date(Date.now() + n * 86_400_000));
  const STATS: TripStats = {
    trips: 2,
    total_days: 9,
    average_days: 4.5,
    countries: 1,
    cities: 2,
    finished: [11, 12],
    longest_trip: { trip_id: 11, title: "Cox's Bazar Trip", days: 5 },
    places: {
      countries: [{ iso2: 'BD', name: 'Bangladesh', name_bn: 'বাংলাদেশ', trip_ids: [11, 12] }],
      cities: [
        { geonameid: COX, name: "Cox's Bazar", country_iso2: 'BD', trip_ids: [11] },
        { geonameid: KHULNA, name: 'Khulna', country_iso2: 'BD', trip_ids: [12] },
      ],
    },
    per_year: [{ year: 2026, trips: 2, days: 9, trip_ids: [11, 12] }],
    upcoming: 1,
    ongoing: 0,
  };
  const TRIPS = [
    trip(11, '2026-10-12', '2026-10-16', { title: "Cox's Bazar Trip" }),
    trip(12, '2026-09-03', '2026-09-06', { title: 'Khulna Trip', destination: 'Khulna' }),
    trip(13, addDays(5), addDays(7), { title: "Cox's Bazar again" }),
  ];

  it('every number opens the trips behind it, and matches them', async () => {
    api.stats.mockResolvedValue(STATS);
    api.list.mockResolvedValue(TRIPS);
    await renderWithQuery(<TripStatsScreen />);
    expect(await screen.findByTestId('stats-trips')).toHaveTextContent('2trips');
    expect(screen.getByTestId('stats-days')).toHaveTextContent('9days away');
    expect(screen.getByTestId('stats-average')).toHaveTextContent('4.5days a trip');
    expect(screen.getByTestId('stats-coming')).toHaveTextContent(/^1 more coming up\. Next: Cox's Bazar again, in 5 days/);
    // As many rows as trips, the longest marked, each opening its plan
    expect(screen.getAllByTestId(/^stats-trip-\d+$/)).toHaveLength(STATS.trips);
    expect(screen.getByTestId('stats-trip-11')).toHaveTextContent(/Cox's Bazar TripLongest.*5 days/);
    expect(screen.getByTestId('stats-trip-12')).not.toHaveTextContent(/Longest/);
    await fireEvent.press(screen.getByTestId('stats-trip-12'));
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/trip/[id]', params: { id: 12 } });
    // Where you went: a country opens its page, a city its trips
    expect(screen.getByTestId('stats-places')).toHaveTextContent(/Where you went1 country · 2 cities/);
    await fireEvent.press(screen.getByTestId('stats-country-BD'));
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/map/country/[iso2]', params: { iso2: 'BD' } });
    await fireEvent.press(screen.getByTestId(`stats-city-${COX}`));
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/stats/trips', params: { city: String(COX) } });
    // A year opens its trips
    expect(screen.getByTestId('stats-year-2026')).toHaveTextContent(/^20262 trips · 9 days/);
    await fireEvent.press(screen.getByTestId('stats-year-2026'));
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/stats/trips', params: { year: '2026' } });
    // What's coming opens the Trips tab
    await fireEvent.press(screen.getByTestId('stats-coming'));
    expect(mockNavigate).toHaveBeenCalledWith('/trips');
    // No weeks, months or years with decimals, no "How you travelled"
    expect(screen.queryByText(/weeks|months|How you travelled/)).toBeNull();
  });

  it("a city's or a year's trips, and nothing else", async () => {
    api.stats.mockResolvedValue(STATS);
    api.list.mockResolvedValue(TRIPS);
    mockParams.city = String(COX);
    await renderWithQuery(<TripStatsScreen />);
    expect(await screen.findByTestId('trip-stats-filter')).toHaveTextContent('1 trip · 5 days');
    expect(screen.getAllByTestId(/^stats-trip-\d+$/).map((r) => r.props.testID)).toEqual(['stats-trip-11']);
    expect(filterOf(STATS, { year: '2026' })).toEqual({ title: '2026', ids: [11, 12] });
    expect(filterOf(STATS, {})).toBeNull();
    expect(tripsFor([12, 99, 11], TRIPS).map((t) => t.id)).toEqual([12, 11]);
  });

  it('with no finished trip yet it says so and shows what is coming', async () => {
    api.stats.mockResolvedValue({ ...ZERO, upcoming: 1 });
    api.list.mockResolvedValue([TRIPS[2]]);
    await renderWithQuery(<TripStatsScreen />);
    expect(await screen.findByTestId('stats-none')).toHaveTextContent(/No finished trips yet/);
    expect(screen.getByTestId('stats-coming')).toHaveTextContent(/Next: Cox's Bazar again, in 5 days/);
    expect(screen.queryByTestId('stats-places')).toBeNull();
    expect(screen.queryByTestId('stats-finished')).toBeNull();
  });
});

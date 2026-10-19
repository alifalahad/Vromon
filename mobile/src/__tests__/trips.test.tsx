import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import TripsScreen from '../../app/(tabs)/trips';
import TripStatsScreen from '../../app/stats/trips';
import { durationDays, formatRange, groupTrips, localToday, tripPhase, tripToMarkVisited } from '../features/trips/dates';
import { defaultNewTrip, toPayload } from '../features/trips/new/newTrip';
import '../i18n';
import { tripsApi } from '../services/api';
import type { Trip, TripStats, TripStop } from '../types';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn() }),
  useScrollToTop: jest.fn(),
}));
jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);
jest.mock('../ui/haptics', () => ({
  haptic: jest.fn(),
  haptics: { success: jest.fn(), error: jest.fn(), light: jest.fn(), warning: jest.fn(), selection: jest.fn(), medium: jest.fn() },
}));
jest.mock('../features/account/useMe', () => ({ ME_QUERY_KEY: ['me'], useMe: () => ({ data: { id: 'me' } }) }));
const mockPhotos = jest.fn();
const mockVisits: { data: unknown[] } = { data: [] };
jest.mock('../services/api', () => ({
  tripsApi: { list: jest.fn(), stats: jest.fn(), markVisited: jest.fn(), getItinerary: jest.fn(), budget: jest.fn(), conditions: jest.fn() },
  photosApi: { forUser: (...a: unknown[]) => mockPhotos(...a) },
}));
jest.mock('../features/map/visits', () => ({ visitsKey: (id: string) => ['visits', id], useVisits: () => mockVisits }));

const api = tripsApi as unknown as Record<'list' | 'stats' | 'markVisited' | 'getItinerary' | 'budget' | 'conditions', jest.Mock>;
const { haptics } = jest.requireMock('../ui/haptics') as { haptics: Record<string, jest.Mock> };

const clients: QueryClient[] = [];
function renderWithQuery(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { gcTime: Infinity } } });
  clients.push(client);
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}
afterEach(() => clients.splice(0).forEach((c) => c.clear()));
beforeEach(() => {
  jest.clearAllMocks();
  mockPhotos.mockResolvedValue([]);
});

const stop = (city: string, country: string, iso2: string, mode: TripStop['transport_mode'], position: number): TripStop => ({
  position,
  city_geonameid: position + 1,
  city_name: city,
  country_iso2: iso2,
  country_name: country,
  transport_mode: mode,
  arrive_on: null,
  depart_on: null,
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
  trips: 0, total_days: 0, weeks: 0, months: 0, years: 0, average_days: 0, continents: 0, countries: 0, cities: 0,
  continent_names: [], longest_trip: null, most_visited_country: null, per_year: [], transport_modes: [], upcoming: 1, ongoing: 0,
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
  it('sends the origin and how you get there', () => {
    const t = { ...defaultNewTrip(new Date('2026-11-01T00:00:00'), "Cox's Bazar"), origin: { city_geonameid: 1185241, label: 'Dhaka, Bangladesh' }, mode: 'bus' as const };
    expect(toPayload(t)).toMatchObject({ origin: { city_geonameid: 1185241 }, transport_mode: 'bus' });
    expect(toPayload(defaultNewTrip(new Date('2026-11-01T00:00:00'), "Cox's Bazar"))).toMatchObject({ origin: null, transport_mode: null });
  });
});

describe('Trips tab', () => {
  const today = localToday();
  const addDays = (n: number) => localToday(new Date(Date.now() + n * 86_400_000));

  it('puts the next trip on top with its countdown, and the others as compact cards', async () => {
    api.list.mockResolvedValue([
      trip(1, addDays(5), addDays(24), { stops: [stop('Dhaka', 'Bangladesh', 'BD', null, 0), stop('Kolkata', 'India', 'IN', 'plane', 1)] }),
      trip(2, addDays(1), addDays(3), { status: 'draft' }),
    ]);
    api.stats.mockResolvedValue({ ...ZERO, trips: 45, total_days: 135, countries: 1, cities: 1 });
    await renderWithQuery(<TripsScreen />);
    // The soonest trip (tomorrow) is the next one; it has no plan yet
    expect(await screen.findByTestId('next-trip-when')).toHaveTextContent('NEXT TRIP · TOMORROW');
    expect(screen.getByTestId('next-trip')).toHaveTextContent(/Plan not built yet/);
    expect(api.getItinerary).not.toHaveBeenCalled();
    // The other one below, with its route
    expect(screen.getByTestId('section-upcoming')).toHaveTextContent('Upcoming');
    expect(screen.getByTestId('trip-1')).toHaveTextContent(/20 days/);
    expect(screen.getByTestId('trip-1')).toHaveTextContent(/🇧🇩 Dhaka → 🇮🇳 Kolkata/);
    expect(screen.queryByTestId('section-past')).toBeNull();
    expect(screen.getByTestId('stat-trips')).toHaveTextContent('45Trips');
    expect(screen.getByTestId('stat-duration')).toHaveTextContent('135Days');
    expect(api.stats).toHaveBeenCalledWith(today, undefined);
    await fireEvent.press(screen.getByTestId('trip-1'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/trip/[id]', params: { id: 1 } });
    await fireEvent.press(screen.getByTestId('next-trip'));
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/trip/[id]', params: { id: 2 } });
  });

  it("shows the next trip's weather, stops and budget", async () => {
    api.list.mockResolvedValue([trip(3, addDays(2), addDays(4))]);
    api.stats.mockResolvedValue(ZERO);
    const day = { id: 30, trip_id: 3, day_number: 1, day_date: addDays(2), total_cost: 0, total_travel_time: 0,
      items: [1, 2, 3].map((id) => ({ id, item_type: 'activity' })) };
    api.getItinerary.mockResolvedValue({ days: [day] });
    api.budget.mockResolvedValue({ estimated_total: 24060, total_budget: 25000 });
    const cday = (n: number, warnings: unknown[] = []) => ({
      day_id: 30 + n, day_number: n, date: addDays(1 + n), in_forecast: true, sunrise: '05:50', sunset: '17:20',
      temp_max: 31, temp_min: 24, rain_max: 80, code: 95, hours: [], sea: null, items: {}, legs: {}, warnings, checks: [],
    });
    api.conditions.mockResolvedValue({ available: true, fetched_at: null, stale: false, forecast_until: null,
      days: [cday(1), cday(2, [{ key: 's', code: 'storm', kept: false }])] });
    await renderWithQuery(<TripsScreen />);
    expect(await screen.findByTestId('next-trip-weather')).toHaveTextContent(/31° · storms likely \w+$/);
    expect(await screen.findByText('3 stops on day 1')).toBeTruthy();
    expect(await screen.findByText('৳24,060 of ৳25,000')).toBeTruthy();
  });

  it("past trips show their photos and 'Mark visited', in one tap", async () => {
    api.list.mockResolvedValue([trip(7, addDays(-6), addDays(-3), { stops: [stop("Cox's Bazar", 'Bangladesh', 'BD', 'bus', 0)] })]);
    api.stats.mockResolvedValue({ ...ZERO, trips: 1, total_days: 4, upcoming: 0 });
    api.markVisited.mockResolvedValue({ visited_prompt: 'marked', places_marked: 2 });
    mockPhotos.mockResolvedValue([{ id: 'p1', thumb_url: 'https://x/1.jpg', url: 'https://x/1.jpg', expires_at: '2999-01-01T00:00:00Z', trip_id: 7 }]);
    await renderWithQuery(<TripsScreen />);
    expect(await screen.findByTestId('mark-visited-7')).toBeTruthy();
    expect(screen.queryByTestId('next-trip')).toBeNull();
    expect(screen.getByTestId('section-past')).toBeTruthy();
    expect(await screen.findByText('1 photo')).toBeTruthy();
    await act(async () => fireEvent.press(screen.getByTestId('mark-visited-7')));
    expect(api.markVisited).toHaveBeenCalledWith(7, true);
    expect(haptics.success).toHaveBeenCalled();
  });

  it("a past trip already on the map says so", async () => {
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

  it('with no trips, invites you to plan the first', async () => {
    api.list.mockResolvedValue([]);
    api.stats.mockResolvedValue(ZERO);
    await renderWithQuery(<TripsScreen />);
    expect(await screen.findByTestId('trips-empty')).toHaveTextContent(/Plan your first trip/);
    expect(screen.queryByTestId('trip-stats-card')).toBeNull();
    await fireEvent.press(screen.getByTestId('plan-first-trip'));
    expect(mockPush).toHaveBeenCalledWith('/trip/new');
  });
});

describe('All trip stats', () => {
  it('shows weeks, months and years with 2 decimals and the average with 1', async () => {
    api.stats.mockResolvedValue({
      ...ZERO, trips: 1, total_days: 20, weeks: 2.86, months: 0.66, years: 0.05, average_days: 20,
      longest_trip: { trip_id: 1, title: 'Kolkata', days: 20 }, most_visited_country: { iso2: 'IN', name: 'India', trips: 1 },
      per_year: [{ year: 2026, trips: 1, days: 20 }], transport_modes: [{ mode: 'plane', count: 2 }],
    });
    await renderWithQuery(<TripStatsScreen />);
    expect(await screen.findByText('2.86')).toBeTruthy();
    expect(screen.getByTestId('total-days')).toHaveTextContent('20');
    expect(screen.getByTestId('stat-months')).toHaveTextContent('0.66');
    expect(screen.getByTestId('stat-years')).toHaveTextContent('0.05');
    expect(screen.getByTestId('average-days')).toHaveTextContent('20.0');
    expect(screen.getByText('Kolkata · 20 days')).toBeTruthy();
  });

  it('zeros look like the screenshot', async () => {
    api.stats.mockResolvedValue(ZERO);
    await renderWithQuery(<TripStatsScreen />);
    expect(await screen.findAllByText('0.00')).toHaveLength(3);
    expect(screen.getByTestId('average-days')).toHaveTextContent('0.0');
  });
});

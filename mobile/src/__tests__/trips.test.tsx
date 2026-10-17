import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import TripsScreen from '../../app/(tabs)/trips';
import TripStatsScreen from '../../app/stats/trips';
import { durationDays, formatRange, groupTrips, localToday, tripPhase, tripToMarkVisited } from '../features/trips/dates';
import { defaultTripForm, toTripPayload, tripFormSchema } from '../features/tripForm';
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
jest.mock('../services/api', () => ({ tripsApi: { list: jest.fn(), stats: jest.fn(), markVisited: jest.fn() } }));
jest.mock('../features/map/visits', () => ({ visitsKey: (id: string) => ['visits', id], useVisits: () => ({ data: [] }) }));

const api = tripsApi as unknown as Record<'list' | 'stats' | 'markVisited', jest.Mock>;
const { haptics } = jest.requireMock('../ui/haptics') as { haptics: Record<string, jest.Mock> };

const clients: QueryClient[] = [];
function renderWithQuery(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { gcTime: Infinity } } });
  clients.push(client);
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}
afterEach(() => clients.splice(0).forEach((c) => c.clear()));
beforeEach(() => jest.clearAllMocks());

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

describe('the wizard', () => {
  it('sends the origin and how you get there', () => {
    const values = tripFormSchema.parse({
      ...defaultTripForm(new Date('2026-11-01T00:00:00Z'), "Cox's Bazar"),
      interests: ['Beach'],
      origin: { city_geonameid: 1185241, label: 'Dhaka, Bangladesh' },
      transport_mode: 'bus',
    });
    expect(toTripPayload(values)).toMatchObject({ origin: { city_geonameid: 1185241 }, transport_mode: 'bus' });
    const none = tripFormSchema.parse({ ...defaultTripForm(new Date('2026-11-01T00:00:00Z'), "Cox's Bazar"), interests: ['Beach'] });
    expect(toTripPayload(none)).toMatchObject({ origin: null, transport_mode: null });
  });
});

describe('Trips tab', () => {
  const today = localToday();
  const addDays = (n: number) => localToday(new Date(Date.now() + n * 86_400_000));

  it('shows the stats card, sections, and stops with flags and transport', async () => {
    api.list.mockResolvedValue([
      trip(1, addDays(5), addDays(24), { stops: [stop('Kolkata', 'India', 'IN', 'plane', 0), stop('Dhaka', 'Bangladesh', 'BD', 'plane', 1)] }),
    ]);
    api.stats.mockResolvedValue(ZERO);
    await renderWithQuery(<TripsScreen />);
    expect(await screen.findByText('Kolkata, India')).toBeTruthy();
    expect(screen.getByText('Dhaka, Bangladesh')).toBeTruthy();
    expect(screen.getAllByText('Plane')).toHaveLength(2);
    expect(screen.getByText('20 days')).toBeTruthy();
    expect(screen.getByTestId('section-upcoming')).toHaveTextContent('Upcoming');
    expect(screen.queryByTestId('section-past')).toBeNull();
    expect(screen.getByTestId('stat-trips')).toHaveTextContent(/Trips0$/);
    expect(screen.getByTestId('stat-duration')).toHaveTextContent(/Duration0d$/);
    expect(api.stats).toHaveBeenCalledWith(today, undefined);
    expect(screen.queryByTestId('mark-visited')).toBeNull();
    await fireEvent.press(screen.getByTestId('trip-1'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/trip/[id]', params: { id: 1 } });
  });

  it('offers to mark a finished trip visited, in one tap', async () => {
    api.list.mockResolvedValue([trip(7, addDays(-6), addDays(-3), { stops: [stop("Cox's Bazar", 'Bangladesh', 'BD', 'bus', 0)] })]);
    api.stats.mockResolvedValue({ ...ZERO, trips: 1, total_days: 4, upcoming: 0 });
    api.markVisited.mockResolvedValue({ visited_prompt: 'marked', places_marked: 2 });
    await renderWithQuery(<TripsScreen />);
    expect(await screen.findByTestId('mark-visited')).toBeTruthy();
    expect(screen.getByTestId('section-past')).toBeTruthy();
    await act(async () => fireEvent.press(screen.getByTestId('mark-visited-yes')));
    expect(api.markVisited).toHaveBeenCalledWith(7, true);
    expect(haptics.success).toHaveBeenCalled();
  });

  it('is empty with no trips', async () => {
    api.list.mockResolvedValue([]);
    api.stats.mockResolvedValue(ZERO);
    await renderWithQuery(<TripsScreen />);
    expect(await screen.findByTestId('trips-empty')).toBeTruthy();
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

/**
 * "Your travels" (docs/ui-refresh step 2): every count matches the list it opens, statuses are
 * words, Bangla names and digits, lists say how to fill them, and "Show on map" goes back to the map.
 */

import { act, fireEvent, render as rtlRender, screen } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

import TravelsScreen from '../../app/map/dashboard';
import TravelList from '../../app/map/list/[kind]';
import TravelCountry from '../../app/map/country/[iso2]';
import { useMapRequest } from '../features/map/mapRequest';
import { targetOf, type PlaceLookup } from '../features/map/travelPlaces';
import {
  beenCities,
  beenCountries,
  beenDistricts,
  beenRegions,
  finishedTrips,
  finishedTripsIn,
  travelSummary,
  tripInto,
  wantList,
} from '../features/map/travels';
import { DEFAULT_PREFERENCES, usePreferences } from '../features/preferences/store';
import i18n from '../i18n';
import type { Trip, Visit } from '../types';

const visit = (place_type: Visit['place_type'], place_code: string, status: Visit['status'], first_visited_on: string | null = null, country_iso2?: string): Visit => ({
  place_type,
  place_code,
  status,
  first_visited_on,
  last_visited_on: null,
  note: null,
  updated_at: `2026-10-${String(10 + place_code.length).padStart(2, '0')}T00:00:00Z`,
  country_iso2: country_iso2 ?? (place_type === 'country' ? place_code : 'BD'),
});

const trip = (id: number, start: string, end: string, extra: Partial<Trip> = {}): Trip =>
  ({ id, destination: 'Khulna', title: `Trip ${id}`, start_date: start, end_date: end, num_travelers: 2, total_budget: 0, currency: 'BDT', status: 'generated', num_days: 3, created_at: '', ...extra }) as Trip;

const VISITS: Visit[] = [
  visit('country', 'BD', 'lived', '2003-01-01'),
  visit('country', 'NP', 'visited', '2024-05-01'),
  visit('country', 'JP', 'want'),
  visit('region', 'BD-H', 'lived', '2003-01-01'),
  visit('region', 'BD-D', 'visited'),
  visit('region', 'BD-B', 'want'),
  visit('district', 'BD-bagerhat', 'visited'),
  visit('district', 'BD-khulna', 'visited'),
  visit('district', 'BD-mymensingh', 'lived'),
  visit('city', '1185241', 'visited', null, 'BD'),
  visit('city', '1283240', 'visited', null, 'NP'),
];
const TODAY = '2026-11-14';
const mockTrips: Trip[] = [
  trip(1, '2026-10-01', '2026-10-03'),
  trip(2, '2026-11-01', '2026-11-04', { stops: [{ position: 0, city_geonameid: null, city_name: null, country_iso2: 'NP', country_name: 'Nepal', transport_mode: null, arrive_on: null, depart_on: null }] }),
  trip(3, '2026-11-13', '2026-11-16'),
  trip(4, '2026-11-20', '2026-11-22', { stops: [{ position: 0, city_geonameid: 1, city_name: 'Cox', country_iso2: 'BD', country_name: 'Bangladesh', transport_mode: null, arrive_on: null, depart_on: null, region_code: 'BD-B' }] }),
];

describe('the counts and their lists', () => {
  it('each number is the length of the list behind it', () => {
    const sum = travelSummary(VISITS, 'BD', mockTrips, TODAY);
    expect(sum.countries).toBe(beenCountries(VISITS).length);
    expect(sum.countries).toBe(2); // the Want country isn't counted
    expect(sum.homeRegions).toEqual({ done: beenRegions(VISITS, 'BD').length, total: 8 });
    expect(sum.homeRegions?.done).toBe(2);
    expect(sum.districts).toEqual({ done: beenDistricts(VISITS).length, total: 64 });
    expect(sum.cities).toBe(beenCities(VISITS).length);
    expect(sum.want).toBe(wantList(VISITS).length);
    expect(sum.trips).toBe(finishedTrips(mockTrips, TODAY).length);
    expect(sum.trips).toBe(2);
    expect(sum.coming).toBe(1);
    expect(sum.days).toBe(3 + 4);
  });

  it('counts what was marked: a city in Nepal is a city, Nepal is a country because it was marked', () => {
    const onlyCity = [visit('city', '1283240', 'visited', null, 'NP')];
    expect(travelSummary(onlyCity, 'BD', [], TODAY).countries).toBe(0);
    expect(beenCities(onlyCity, { country: 'NP' })).toHaveLength(1);
  });

  it('a home country without bundled regions has no divisions or districts tile', () => {
    const sum = travelSummary(VISITS, 'IN', mockTrips, TODAY);
    expect(sum.homeRegions).toBeNull();
    expect(sum.districts).toBeNull();
  });

  it('lists lived first, then the newest visit; districts by division', () => {
    expect(beenCountries(VISITS).map((v) => v.place_code)).toEqual(['BD', 'NP']);
    expect(beenDistricts(VISITS, 'BD-D').map((v) => v.place_code).sort()).toEqual(['BD-bagerhat', 'BD-khulna']);
  });

  it('finds finished trips in a country and an upcoming trip into a division', () => {
    expect(finishedTripsIn(mockTrips, TODAY, 'NP').map((t) => t.id)).toEqual([2]);
    expect(finishedTripsIn(mockTrips, TODAY, 'BD').map((t) => t.id)).toEqual([1]);
    expect(tripInto(mockTrips, TODAY, 'BD-B')?.id).toBe(4);
  });

  it('knows where to show each kind of place', () => {
    const lookup: PlaceLookup = { regions: new Map(), cities: new Map([['1185241', { name: 'Dhaka', lat: 23.7, lon: 90.4, country: 'BD' }]]) };
    expect(targetOf({ place_type: 'country', place_code: 'BD' }, lookup)).toHaveProperty('bounds');
    expect(targetOf({ place_type: 'region', place_code: 'BD-H' }, lookup)).toHaveProperty('bounds');
    expect(targetOf({ place_type: 'district', place_code: 'BD-khulna' }, lookup)).toHaveProperty('bounds');
    expect(targetOf({ place_type: 'city', place_code: '1185241' }, lookup)).toEqual({ center: [90.4, 23.7], zoom: 9 });
    expect(targetOf({ place_type: 'city', place_code: '999' }, lookup)).toBeNull(); // not looked up yet
  });
});

// The screens, with the user's data stubbed
const mockPush = jest.fn();
const mockDismissAll = jest.fn();
const mockBack = jest.fn();
let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, dismissAll: mockDismissAll, back: mockBack, navigate: jest.fn() }),
  useLocalSearchParams: () => mockParams,
  Stack: { Screen: () => null },
}));
jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);
jest.mock('../ui/haptics', () => ({ haptic: jest.fn(), haptics: { success: jest.fn(), selection: jest.fn(), light: jest.fn() } }));
jest.mock('../features/account/useMe', () => ({ useMe: () => ({ data: { id: 'u1', home_country_iso2: 'BD' } }) }));
let mockVisits: Visit[] = [];
jest.mock('../features/map/visits', () => ({
  ...jest.requireActual('../features/map/visits'),
  useVisits: () => ({ data: mockVisits }),
  useTravelStats: () => ({ data: { world_percent: 1, continents: 1 } }),
}));
jest.mock('../features/trips/queries', () => ({ useTrips: () => ({ data: mockTrips }) }));
jest.mock('../features/map/travelPlaces', () => ({
  ...jest.requireActual('../features/map/travelPlaces'),
  useTravelPlaces: () => ({ lookup: { regions: new Map(), cities: new Map([['1185241', { name: 'Dhaka', lat: 23.7, lon: 90.4, country: 'BD' }], ['1283240', { name: 'Kathmandu', lat: 27.7, lon: 85.3, country: 'NP' }]]) }, loading: false, failed: false }),
}));
jest.mock('@tanstack/react-query', () => ({ ...jest.requireActual('@tanstack/react-query'), useQueries: () => [] }));
jest.mock('../features/trips/dates', () => ({ ...jest.requireActual('../features/trips/dates'), localToday: () => '2026-11-14' }));

const render = (ui: React.ReactElement) => rtlRender(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);

describe('the screens', () => {
  beforeEach(async () => {
    await act(() => i18n.changeLanguage('en'));
    usePreferences.setState({ ...DEFAULT_PREFERENCES, language: 'en' });
    mockVisits = VISITS;
    mockPush.mockClear();
    mockDismissAll.mockClear();
    mockParams = {};
    useMapRequest.setState({ request: null });
  });

  it('the dashboard shows the counts, and each tile opens its list', async () => {
    await render(<TravelsScreen />);
    expect(screen.getByTestId('travels-countries').props.accessibilityLabel).toBe('2 Countries');
    expect(screen.getByTestId('travels-regions').props.accessibilityLabel).toBe('2 of 8 Divisions');
    expect(screen.getByTestId('travels-districts').props.accessibilityLabel).toBe('3 of 64 Districts');
    expect(screen.getByTestId('travels-cities').props.accessibilityLabel).toBe('2 Cities');
    expect(screen.getByText('2 places you want to go')).toBeTruthy(); // Japan and Chattogram
    fireEvent.press(screen.getByTestId('travels-regions'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/map/list/[kind]', params: { kind: 'regions', country: 'BD' } });
  });

  it('"Make a poster" asks the map for the poster and goes back to it', async () => {
    await render(<TravelsScreen />);
    fireEvent.press(screen.getByTestId('travels-poster'));
    expect(useMapRequest.getState().request).toEqual({ kind: 'poster' });
    expect(mockBack).toHaveBeenCalled();
  });

  it('the divisions list: visited ones with the status as a word, then the rest with Mark', async () => {
    mockParams = { kind: 'regions', country: 'BD' };
    await render(<TravelList />);
    expect(screen.getByText('Mymensingh')).toBeTruthy();
    expect(screen.getByText(/since 2003/)).toBeTruthy();
    expect(screen.getAllByText('Lived').length).toBeGreaterThan(0);
    expect(screen.getByText('NOT VISITED YET · 6')).toBeTruthy();
    expect(screen.getByText('Want to go · Trip in 6 days')).toBeTruthy(); // Chattogram, trip 4
    expect(screen.getByTestId('mark-BD-A')).toBeTruthy();
  });

  it('"Show on map" asks the map to frame the place and closes the dashboard', async () => {
    mockParams = { kind: 'cities' };
    await render(<TravelList />);
    expect(screen.getByText('Dhaka')).toBeTruthy();
    expect(screen.getByText('Kathmandu')).toBeTruthy();
    fireEvent.press(screen.getByTestId('show-city-1185241'));
    expect(useMapRequest.getState().request).toEqual({ kind: 'show', target: { center: [90.4, 23.7], zoom: 9 } });
    expect(mockDismissAll).toHaveBeenCalled();
  });

  it('an empty list says how to fill it', async () => {
    mockVisits = [];
    mockParams = { kind: 'cities' };
    await render(<TravelList />);
    expect(screen.getByText('No cities yet')).toBeTruthy();
    expect(screen.getByText('Zoom in on the map, then press and hold a city to mark it.')).toBeTruthy();
  });

  it('a country: its divisions, and its status in words', async () => {
    mockParams = { iso2: 'BD' };
    await render(<TravelCountry />);
    expect(screen.getByText('Lived here')).toBeTruthy();
    expect(screen.getByTestId('country-tab-regions').props.accessibilityLabel).toBe('Divisions, 2/8');
    expect(screen.getByText('Mymensingh')).toBeTruthy();
    await act(async () => fireEvent.press(screen.getByTestId('country-tab-districts')));
    expect(await screen.findByText('Bagerhat')).toBeTruthy();
  });

  it('Bangla: names and digits', async () => {
    await act(() => i18n.changeLanguage('bn'));
    usePreferences.setState({ ...DEFAULT_PREFERENCES, language: 'bn' });
    mockParams = { kind: 'regions', country: 'BD' };
    await render(<TravelList />);
    expect(screen.getByText('ময়মনসিংহ বিভাগ')).toBeTruthy();
    expect(screen.getByText(/২০০৩ থেকে/)).toBeTruthy();
    expect(screen.getByText('এখনও যাওয়া হয়নি · ৬')).toBeTruthy();
  });
});

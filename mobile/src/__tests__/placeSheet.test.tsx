import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import { destinationFor, friendsLine, PlaceSheet, tripsAt } from '../features/map/PlaceSheet';
import { DEFAULT_PREFERENCES, usePreferences } from '../features/preferences/store';
import i18n from '../i18n';
import type { Destination, Trip, TripStop } from '../types';

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);
jest.mock('../features/photos/PhotoStrip', () => ({ PhotoStrip: () => null }));
jest.mock('../ui/haptics', () => ({ haptics: { light: jest.fn(), selection: jest.fn(), success: jest.fn() }, haptic: jest.fn() }));

const stop = (region_code: string | null, country_iso2 = 'BD', city_geonameid: number | null = null): TripStop =>
  ({ position: 0, region_code, country_iso2, city_geonameid, city_name: null, country_name: '', transport_mode: null, arrive_on: null, depart_on: null }) as TripStop;
const trip = (id: number, destination: string, start_date: string, stops: TripStop[] = []): Trip =>
  ({ id, destination, start_date, end_date: start_date, stops, num_travelers: 1, total_budget: 1, currency: 'BDT', status: 'planned', num_days: 1, created_at: '' }) as Trip;
const DESTS: Destination[] = [
  { id: 9, name: 'Sreemangal', country: 'Bangladesh', region_code: 'BD-G', country_iso2: 'BD', place_count: 12 },
  { id: 10, name: 'Sylhet', country: 'Bangladesh', region_code: 'BD-G', country_iso2: 'BD', place_count: 20 },
  { id: 1, name: "Cox's Bazar", country: 'Bangladesh', region_code: 'BD-B', country_iso2: 'BD', place_count: 25 },
];
const TRIPS = [
  trip(1, 'Sylhet', '2026-03-01'), // by destination
  trip(2, 'Somewhere', '2026-05-01', [stop('BD-G', 'BD', 1185099)]), // by stop
  trip(3, "Cox's Bazar", '2026-06-01'),
];

beforeEach(async () => {
  usePreferences.setState(DEFAULT_PREFERENCES);
  await act(() => i18n.changeLanguage('en'));
});

describe('place sheet', () => {
  it('finds your trips to a region by stop or destination, newest first', () => {
    expect(tripsAt({ place_type: 'region', place_code: 'BD-G' }, TRIPS, DESTS).map((t) => t.id)).toEqual([2, 1]);
    expect(tripsAt({ place_type: 'country', place_code: 'BD' }, TRIPS, DESTS).map((t) => t.id)).toEqual([3, 2, 1]);
    expect(tripsAt({ place_type: 'city', place_code: '1185099' }, TRIPS, DESTS).map((t) => t.id)).toEqual([2]);
  });

  it('suggests the destination there with the most places', () => {
    expect(destinationFor({ place_type: 'region', place_code: 'BD-G' }, DESTS)?.name).toBe('Sylhet');
    expect(destinationFor({ place_type: 'region', place_code: 'BD-F' }, DESTS)).toBeNull();
    expect(destinationFor({ place_type: 'country', place_code: 'BD' }, DESTS)).toBeNull(); // a country plans "in", not to one city
  });

  it('names friends who have been', () => {
    const t = i18n.t.bind(i18n);
    const n = (v: number) => String(v);
    expect(friendsLine([{ id: 'a', name: 'Rafi' }], t, n)).toBe('Rafi has been here');
    expect(friendsLine([{ id: 'a', name: 'Rafi' }, { id: 'b', name: 'Nadia' }], t, n)).toBe('Rafi and Nadia have been here');
    expect(friendsLine(['Rafi', 'Nadia', 'Tanvir', 'Mim'].map((name, i) => ({ id: String(i), name })), t, n)).toBe('Rafi, Nadia and 2 more have been here');
  });

  it('shows a division with what it is, your trips there, and plans another', async () => {
    const onPlan = jest.fn();
    const client = new QueryClient();
    await render(
      <QueryClientProvider client={client}>
        <PlaceSheet
          place={{ place_type: 'region', place_code: 'BD-G', country_iso2: 'BD', name: 'Sylhet' }}
          userId="u1"
          visits={[]}
          trips={TRIPS}
          destinations={DESTS}
          onClose={jest.fn()}
          onPlan={onPlan}
        />
      </QueryClientProvider>,
    );
    expect(screen.getByText('Division of Bangladesh')).toBeTruthy();
    expect(screen.getByTestId('place-trip-2')).toBeTruthy();
    expect(screen.getByText('Plan another trip to Sylhet')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('place-plan'));
    expect(onPlan).toHaveBeenCalledWith(DESTS[1]);
    client.clear();
  });

  it('uses the Bangla name in Bangla', async () => {
    await act(() => i18n.changeLanguage('bn'));
    usePreferences.setState({ language: 'bn' });
    const client = new QueryClient();
    await render(
      <QueryClientProvider client={client}>
        <PlaceSheet place={{ place_type: 'region', place_code: 'BD-H', country_iso2: 'BD', name: 'Mymensingh' }} userId="u1" visits={[]} onClose={jest.fn()} />
      </QueryClientProvider>,
    );
    expect(screen.getByText('ময়মনসিংহ বিভাগ')).toBeTruthy();
    expect(screen.getByText('বাংলাদেশ-এর বিভাগ')).toBeTruthy();
    client.clear();
  });
});

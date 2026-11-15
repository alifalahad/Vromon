/**
 * New trip, "Getting there" (docs/ui-refresh step 5): optional; where the trip starts (your location,
 * named and said how precise; or a city); the ways there before the trip exists, one picked or Vromon
 * choosing by the budget; and what the trip is then built with.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import * as Location from 'expo-location';
import React, { useCallback, useEffect, useState } from 'react';

import { GettingThereSection, roughness } from '../features/trips/new/GettingThereSection';
import { defaultNewTrip, journeyAnswers, toPayload, update, type NewTrip } from '../features/trips/new/newTrip';
import i18n from '../i18n';
import { geoApi, tripsApi } from '../services/api';
import type { JourneyOption, TripJourney } from '../types';

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);
jest.mock('../services/api', () => ({
  tripsApi: { journeyOptions: jest.fn() },
  geoApi: { where: jest.fn(), cities: jest.fn(() => Promise.resolve([])) },
}));
jest.mock('../features/places/PlacePicker', () => ({ PlacePicker: () => null }));
jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(),
  watchPositionAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  Accuracy: { High: 4, Highest: 5 },
}));

const journeyOptions = tripsApi.journeyOptions as jest.Mock;
const where = geoApi.where as jest.Mock;
const loc = Location as unknown as Record<string, jest.Mock>;

const leg = (mode: JourneyOption['legs'][number]['mode'], fare: number | null, extra: Partial<JourneyOption['legs'][number]> = {}) => ({
  mode,
  from: 'A',
  to: 'B',
  minutes: 60,
  km: 50,
  fare,
  fare_per: 'person' as const,
  fare_kind: 'estimate' as const,
  depart: null,
  arrive: null,
  detail: null,
  source: null,
  ...extra,
});
const option = (mode: JourneyOption['mode'], minutes: number, cost: number, extra: Partial<JourneyOption> = {}): JourneyOption => ({
  mode,
  minutes,
  km: 400,
  cost_per_person: cost,
  all_official: false,
  recommended: false,
  preferred: false,
  reason: null,
  reason_code: null,
  note: null,
  legs: [leg('cng', 120), leg(mode === 'car' ? 'car' : mode, cost - 120)],
  alternatives: [],
  ...extra,
});
const WAYS: TripJourney = {
  from: 'Khulna',
  to: "Cox's Bazar",
  options: [
    option('bus', 680, 1450, { recommended: true, reason: 'The fastest way that fits your budget', reason_code: 'fastest_in_budget' }),
    option('train', 845, 1180, { legs: [leg('cng', 100), leg('train', 1080, { depart: '22:15' })] }),
    option('plane', 270, 7900),
    option('car', 730, 7000, { legs: [leg('car', 14000, { fare_per: 'vehicle' })], cost_per_person: 7000 }),
  ],
  missing: [],
  road_source: 'road distance',
  preferences: { transport_modes: [], transport_by_budget: true },
};

/** What the harness last showed, and its setter (written after each render, never during one) */
const probe: { trip?: NewTrip; set?: (c: Partial<NewTrip>) => void } = {};
function Harness({ start }: { start: Partial<NewTrip> }) {
  const [trip, setTrip] = useState<NewTrip>(() => update(defaultNewTrip(new Date(2026, 10, 15), "Cox's Bazar"), start));
  const set = useCallback((c: Partial<NewTrip>) => setTrip((cur) => update(cur, c)), []);
  useEffect(() => {
    probe.trip = trip;
    probe.set = set;
  });
  return <GettingThereSection trip={trip} set={set} />;
}
const renderSection = (start: Partial<NewTrip> = {}) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  return render(
    <QueryClientProvider client={client}>
      <Harness start={start} />
    </QueryClientProvider>,
  );
};
const KHULNA = { origin: { city_geonameid: 1336135, label: 'Khulna, Bangladesh' } };

beforeEach(async () => {
  jest.clearAllMocks();
  await act(() => i18n.changeLanguage('en'));
});

describe('getting there, before a start is chosen', () => {
  it('is one quiet, optional card, and the trip is built without a way there', async () => {
    await renderSection();
    expect(screen.getByText('optional')).toBeTruthy();
    expect(screen.getByText('Where do you start from?')).toBeTruthy();
    expect(screen.queryByTestId('ways-card')).toBeNull();
    expect(journeyOptions).not.toHaveBeenCalled();
    const payload = toPayload(probe.trip!);
    expect(payload).toMatchObject({ origin: null, origin_point: null, transport_modes: [], transport_by_budget: true });
    expect(journeyAnswers(probe.trip!)).toBeNull();
  });

  it('opens on a tap: your location or a city, and "Not now" folds it again', async () => {
    await renderSection();
    await fireEvent.press(screen.getByTestId('getting-there-add'));
    expect(screen.getByText('Use my current location')).toBeTruthy();
    expect(screen.getByTestId('origin-search')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('origin-not-now'));
    expect(screen.getByTestId('getting-there-add')).toBeTruthy();
  });
});

describe('your current location', () => {
  it('is precise, named, and says how rough it is', async () => {
    loc.requestForegroundPermissionsAsync.mockResolvedValue({ granted: true });
    loc.watchPositionAsync.mockImplementation(async (_opts, cb) => {
      cb({ coords: { latitude: 22.81, longitude: 89.56, accuracy: 180 } });
      cb({ coords: { latitude: 22.8158, longitude: 89.5639, accuracy: 12 } });
      return { remove: jest.fn() };
    });
    where.mockResolvedValue({ label: 'Near Shahid Hadis Park, Khulna', near: 'Shahid Hadis Park', area: 'Khulna Sadar', district: 'Khulna' });
    journeyOptions.mockResolvedValue(WAYS);
    await renderSection();
    await fireEvent.press(screen.getByTestId('getting-there-add'));
    await fireEvent.press(screen.getByTestId('origin-here'));
    expect(await screen.findByText('Near Shahid Hadis Park, Khulna')).toBeTruthy();
    expect(screen.getByText('Your location, within about 10 m')).toBeTruthy();
    expect(loc.watchPositionAsync).toHaveBeenCalledWith(expect.objectContaining({ accuracy: Location.Accuracy.Highest }), expect.any(Function));
    // The best fix, named in the app's language
    expect(where).toHaveBeenCalledWith(22.8158, 89.5639, 'en');
    expect(screen.getByTestId('origin-adjust')).toBeTruthy();
    expect(toPayload(probe.trip!).origin_point).toEqual({ lat: 22.8158, lon: 89.5639, label: 'Near Shahid Hadis Park, Khulna' });
  });

  it('refused: a clear line, and search still works', async () => {
    loc.requestForegroundPermissionsAsync.mockResolvedValue({ granted: false });
    await renderSection();
    await fireEvent.press(screen.getByTestId('getting-there-add'));
    await fireEvent.press(screen.getByTestId('origin-here'));
    expect(await screen.findByTestId('origin-error')).toHaveTextContent(/Allow it in Settings, or search for a city/);
    expect(screen.getByTestId('origin-search')).toBeTruthy();
    expect(loc.watchPositionAsync).not.toHaveBeenCalled();
  });

  it('rounds how rough a fix is the way people say it', () => {
    expect(roughness(4)).toEqual({ n: 10, unit: 'm' });
    expect(roughness(23)).toEqual({ n: 20, unit: 'm' });
    expect(roughness(320)).toEqual({ n: 300, unit: 'm' });
    expect(roughness(1240)).toEqual({ n: 1.2, unit: 'km' });
  });
});

describe('the ways there', () => {
  it("lists every way, Vromon's pick first with its reason, each with its time and fare for one person", async () => {
    journeyOptions.mockResolvedValue(WAYS);
    await renderSection(KHULNA);
    expect(await screen.findByTestId('way-bus')).toBeTruthy();
    expect(journeyOptions).toHaveBeenCalledWith(
      expect.objectContaining({ destination: "Cox's Bazar", origin: { city_geonameid: 1336135 }, origin_point: null, transport_by_budget: true }),
    );
    expect(screen.getByText("Khulna to Cox's Bazar · one way, for one person")).toBeTruthy();
    expect(screen.getByText("Vromon's pick")).toBeTruthy();
    expect(screen.getByText('Fastest that fits your budget')).toBeTruthy();
    expect(screen.getByText('11 h 20 min · about ৳1,450')).toBeTruthy();
    expect(screen.getByText('Train at 22:15')).toBeTruthy();
    expect(screen.getByText(/about ৳14,000 for the car/)).toBeTruthy();
    expect(screen.getByText('"About" means an estimate, not a booked fare.')).toBeTruthy();
    // Vromon chooses: its pick is the one marked
    expect(screen.getByTestId('ways-auto').props.value).toBe(true);
    expect(screen.getByTestId('way-bus').props.accessibilityState).toMatchObject({ checked: true });
  });

  it('a way picked is what the trip is built with', async () => {
    journeyOptions.mockResolvedValue(WAYS);
    await renderSection(KHULNA);
    await fireEvent.press(await screen.findByTestId('way-train'));
    expect(screen.getByTestId('way-train').props.accessibilityState).toMatchObject({ checked: true });
    expect(screen.getByTestId('way-bus').props.accessibilityState).toMatchObject({ checked: false });
    expect(screen.getByTestId('ways-auto').props.value).toBe(false);
    expect(toPayload(probe.trip!)).toMatchObject({ origin: { city_geonameid: 1336135 }, transport_modes: ['train'], transport_by_budget: false });
    // Back to Vromon choosing
    await fireEvent(screen.getByTestId('ways-auto'), 'valueChange', true);
    expect(toPayload(probe.trip!)).toMatchObject({ transport_modes: [], transport_by_budget: true });
  });

  it('asks again when the travellers or the budget change', async () => {
    journeyOptions.mockResolvedValue(WAYS);
    await renderSection(KHULNA);
    await screen.findByTestId('way-bus');
    await act(async () => probe.set!({ travellers: 5 }));
    await screen.findByTestId('way-bus');
    expect(journeyOptions).toHaveBeenLastCalledWith(expect.objectContaining({ num_travelers: 5 }));
    await act(async () => probe.set!({ budget: 99000, budgetByHand: true }));
    expect(journeyOptions).toHaveBeenLastCalledWith(expect.objectContaining({ total_budget: 99000 }));
  });

  it('no way found: said so, and the plan goes on without it', async () => {
    journeyOptions.mockRejectedValue({ response: { status: 404 } });
    await renderSection(KHULNA);
    expect(await screen.findByTestId('ways-none')).toHaveTextContent("Vromon can't find a way there from this start yet. The plan goes on without it.");
    expect(toPayload(probe.trip!)).toMatchObject({ transport_modes: [], transport_by_budget: true });
  });

  it('says it in Bangla', async () => {
    await act(() => i18n.changeLanguage('bn'));
    journeyOptions.mockResolvedValue(WAYS);
    await renderSection(KHULNA);
    expect(await screen.findByText('Vromon-এর পছন্দ')).toBeTruthy();
    expect(screen.getByText('আপনার বাজেটে সবচেয়ে দ্রুত')).toBeTruthy();
    expect(screen.getByText('বাজেট অনুযায়ী Vromon বেছে নিক')).toBeTruthy();
  });
});

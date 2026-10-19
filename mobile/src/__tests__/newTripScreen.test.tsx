import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { AccessibilityInfo } from 'react-native';

import NewTripScreen from '../../app/trip/new';
import '../i18n';
import { destinationsApi, placesApi, tripsApi } from '../services/api';
import type { Unplaced } from '../types';

const mockReplace = jest.fn();
const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace, back: mockBack, push: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));
jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);
jest.mock('../ui/haptics', () => ({
  haptic: jest.fn(),
  haptics: { success: jest.fn(), error: jest.fn(), light: jest.fn(), warning: jest.fn(), selection: jest.fn(), medium: jest.fn() },
}));
jest.mock('../features/trips/CitySearch', () => ({ CitySearch: () => null }));
jest.mock('../services/api', () => ({
  destinationsApi: { list: jest.fn(), hotels: jest.fn() },
  placesApi: { list: jest.fn() },
  tripsApi: { create: jest.fn(), generate: jest.fn(), regenerate: jest.fn(), updateMustDos: jest.fn() },
}));

const dest = destinationsApi as unknown as Record<string, jest.Mock>;
const places = placesApi as unknown as Record<string, jest.Mock>;
const trips = tripsApi as unknown as Record<string, jest.Mock>;

const HILL = {
  id: 16,
  name: 'Himchari Hilltop Viewpoint',
  destination_name: "Cox's Bazar",
  category: 'Scenic',
  opening_time: '08:00',
  closing_time: '17:00',
  average_visit_duration: 1,
};
const UNPLACED: Unplaced = {
  place_id: 16,
  name: HILL.name,
  day: 1,
  when: 'sunset',
  at: null,
  reason: { code: 'closes_before', closes: '17:00', wanted: 'sunset', sunset: '17:25' },
  message: 'Himchari Hilltop Viewpoint closes at 17:00, before sunset (about 17:25).',
  suggestion: { day: 1, at: '16:00' },
};

/** Press, and let the screen settle */
const press = (el: Parameters<typeof fireEvent.press>[0]) => act(async () => fireEvent.press(el));

async function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  return render(
    <QueryClientProvider client={client}>
      <NewTripScreen />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  // No waiting between the building checks
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
  dest.list.mockResolvedValue([{ id: 1, name: "Cox's Bazar", country: 'Bangladesh', place_count: 25 }]);
  dest.hotels.mockResolvedValue([
    { id: 1, name: 'Sea Crown', category: 'Standard', price_per_night: 3500 },
    { id: 2, name: 'Hotel Motel Zone View', category: 'Standard', price_per_night: 2800 },
    { id: 3, name: 'Long Beach', category: 'Luxury', price_per_night: 8000 },
  ]);
  places.list.mockResolvedValue([HILL]);
});

describe('choosing a destination', () => {
  it('imported destinations say they are not checked yet, and where their places come from', async () => {
    dest.list.mockResolvedValue([
      { id: 1, name: "Cox's Bazar", country: 'Bangladesh', place_count: 25, checked: true },
      { id: 2, name: 'Sylhet', country: 'Bangladesh', place_count: 15, checked: false, attribution: 'Wikivoyage' },
    ]);
    await renderScreen();
    expect(await screen.findByTestId('destination-2')).toHaveTextContent(/Sylhet15 placesNot checked yet/);
    expect(screen.getByTestId('destination-1')).not.toHaveTextContent(/Not checked/);
    expect(screen.getByText(/come from Wikivoyage and Wikidata and haven't been checked yet/)).toBeTruthy();
  });
});

describe('planning a new trip', () => {
  it('needs a destination, then builds with a must-see and offers the nearest time when it cannot fit', async () => {
    trips.create.mockResolvedValue({ id: 77 });
    trips.generate.mockResolvedValue({ unplaced: [UNPLACED], itinerary: [] });
    trips.updateMustDos.mockResolvedValue({
      message: 'Day 1 was re-planned',
      replanned_days: [1],
      unplaced: [],
      validation: null,
      trip: { id: 77, itinerary_days: [{ day_number: 1, items: [{ place_id: 16, start_time: '16:00' }] }] },
    });
    await renderScreen();

    // Step 1: where and when (a destination is required)
    expect(await screen.findByText('Where to?')).toBeTruthy();
    await press(screen.getByTestId('new-next'));
    expect(screen.getByText("Choose where you're going.")).toBeTruthy();
    await press(await screen.findByTestId('destination-1'));
    await press(screen.getByTestId('travellers-more'));
    expect(screen.getByTestId('travellers-value')).toHaveTextContent('3');
    await press(screen.getByTestId('new-next'));

    // Step 2: style; the budget follows the level, and names the hotels it buys
    expect(await screen.findByText('What do you enjoy?')).toBeTruthy();
    await press(screen.getByTestId('interest-Beach'));
    await press(screen.getByTestId('tier-Luxury'));
    expect(screen.getByTestId('budget-total')).toHaveTextContent('৳72,000');
    expect(await screen.findByText(/resorts around ৳8,000 a night/)).toBeTruthy();
    await press(screen.getByTestId('tier-Comfort'));
    expect(await screen.findByText(/hotels around ৳2,800–৳3,500 a night/)).toBeTruthy();
    await press(screen.getByTestId('new-next'));

    // Step 3: a must-see on day 1 at sunset
    expect(await screen.findByText('Your must-dos')).toBeTruthy();
    await press(await screen.findByTestId('pick-place-16'));
    await press(await screen.findByTestId('ms-16-day-1'));
    await press(screen.getByTestId('ms-16-sunset'));
    expect(screen.getByText('Day 1 · Sunset')).toBeTruthy();
    expect(screen.getByText('1 must-see')).toBeTruthy();
    await press(screen.getByTestId('build-plan'));

    await waitFor(() => expect(trips.generate).toHaveBeenCalledWith(77, 'cpsat'));
    expect(trips.create).toHaveBeenCalledWith(
      expect.objectContaining({
        destination: "Cox's Bazar",
        num_travelers: 3,
        total_budget: 38000,
        preference: expect.objectContaining({ interests: ['Beach'], travel_style: 'Balanced', accommodation_preference: 'Standard' }),
        constraints: expect.objectContaining({ must_sees: [{ place_id: 16, day: 1, when: 'sunset', at: null }] }),
      }),
    );

    // It doesn't fit: the reason, and the nearest time that does
    expect(await screen.findByText('Himchari Hilltop Viewpoint on day 1 at sunset doesn\'t fit', {}, { timeout: 3000 })).toBeTruthy();
    expect(screen.getByText('It closes at 17:00, before sunset (about 17:25).')).toBeTruthy();
    expect(screen.queryByTestId('see-plan')).toBeNull();
    await press(screen.getByTestId('fix-suggestion'));
    await waitFor(() =>
      expect(trips.updateMustDos).toHaveBeenCalledWith(77, { must_sees: [{ place_id: 16, day: 1, when: null, at: '16:00' }] }),
    );
    expect(await screen.findByText('Himchari Hilltop Viewpoint is on day 1 at 16:00.')).toBeTruthy();
    await press(await screen.findByTestId('see-plan'));
    expect(mockReplace).toHaveBeenCalledWith({ pathname: '/trip/[id]', params: { id: 77 } });
  });

  it('can build straight from step 2, and leave a must-see out', async () => {
    trips.create.mockResolvedValue({ id: 78 });
    trips.generate.mockResolvedValue({ unplaced: [], itinerary: [] });
    await renderScreen();
    await press(await screen.findByTestId('destination-1'));
    await press(screen.getByTestId('new-next'));
    await press(await screen.findByTestId('build-now'));
    expect(await screen.findByTestId('see-plan', {}, { timeout: 3000 })).toBeTruthy();
    expect(trips.create).toHaveBeenCalledWith(expect.objectContaining({ constraints: expect.objectContaining({ must_sees: [], busy: [] }) }));
  });

  it('says the trip is saved when the plan cannot be built, and tries again', async () => {
    trips.create.mockResolvedValue({ id: 79 });
    trips.generate.mockRejectedValue(new Error('Server error'));
    await renderScreen();
    await press(await screen.findByTestId('destination-1'));
    await press(screen.getByTestId('new-next'));
    await press(await screen.findByTestId('build-now'));
    expect(await screen.findByText("The plan couldn't be built")).toBeTruthy();
    trips.generate.mockResolvedValue({ unplaced: [], itinerary: [] });
    await press(screen.getByTestId('build-retry'));
    expect(await screen.findByTestId('see-plan', {}, { timeout: 3000 })).toBeTruthy();
    // The trip was created once
    expect(trips.create).toHaveBeenCalledTimes(1);
  });
});

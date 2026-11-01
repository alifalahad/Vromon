/**
 * "Add to a trip" from a place card (friends-chat step 4) ends on the trip's must-dos
 * with the place already added: saving keeps it.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import MustDosScreen from '../../app/trip/must-dos/[id]';
import '../i18n';
import { placesApi, tripsApi } from '../services/api';

let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => mockParams,
}));
jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);
jest.mock('../ui/haptics', () => ({ haptic: jest.fn(), haptics: { success: jest.fn(), error: jest.fn(), light: jest.fn(), warning: jest.fn(), selection: jest.fn() } }));
jest.mock('../services/api', () => ({
  ...jest.requireActual('../services/api'),
  tripsApi: { get: jest.fn(), updateMustDos: jest.fn() },
  placesApi: { list: jest.fn() },
}));

const trips = tripsApi as unknown as Record<string, jest.Mock>;
const places = placesApi as unknown as Record<string, jest.Mock>;

const HILL = { id: 16, name: 'Himchari Hilltop Viewpoint', destination_name: "Cox's Bazar", category: 'Nature', average_visit_duration: 1.5 };
const trip = (mustSees: { place_id: number }[], skip: number[] = []) => ({
  id: 5,
  destination: "Cox's Bazar",
  start_date: '2099-01-02',
  end_date: '2099-01-03',
  num_travelers: 2,
  status: 'generated',
  constraints: { must_sees: mustSees.map((m) => ({ day: null, when: null, at: null, ...m })), busy: [], excluded_places: skip, avoid_crowded: false },
  preference: null,
});

let client: QueryClient;
async function show() {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  await render(
    <QueryClientProvider client={client}>
      <MustDosScreen />
    </QueryClientProvider>,
  );
}
afterEach(() => client.clear());

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = { id: '5', add: '16', addName: HILL.name };
  places.list.mockResolvedValue([HILL]);
  trips.updateMustDos.mockResolvedValue({ replanned_days: [] });
});

it('the place is on the list, and saving keeps it (no longer a place to skip)', async () => {
  trips.get.mockResolvedValue(trip([], [16]));
  await show();
  expect(await screen.findByTestId('md-added')).toHaveTextContent('Himchari Hilltop Viewpoint is on the list. Save to keep it.');
  await fireEvent.press(screen.getByTestId('md-save'));
  expect(trips.updateMustDos).toHaveBeenCalledWith(5, expect.objectContaining({
    must_sees: [{ place_id: 16, day: null, when: null, at: null }],
    excluded_places: [],
  }));
});

it('a place already a must-see says so and isn\'t added twice', async () => {
  trips.get.mockResolvedValue(trip([{ place_id: 16 }]));
  await show();
  expect(await screen.findByTestId('md-added')).toHaveTextContent('Himchari Hilltop Viewpoint is already a must-see.');
  await fireEvent.press(screen.getByTestId('md-save'));
  expect(trips.updateMustDos.mock.calls[0][1].must_sees).toHaveLength(1);
});

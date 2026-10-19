import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import ConditionsScreen from '../../app/trip/conditions/[id]';
import TripScreen from '../../app/trip/[id]';
import '../i18n';
import { tripsApi } from '../services/api';
import type { Itinerary, ItineraryDay, ItineraryItem, Trip } from '../types';

jest.mock('expo-router', () => ({
  // Runs on mount, as when the screen comes into focus
  useFocusEffect: (effect: () => void) => jest.requireActual<typeof React>('react').useEffect(effect, [effect]),
  useRouter: () => ({ push: mockPush, back: jest.fn() }),
  useLocalSearchParams: () => ({ id: '5', day: '1' }),
  Stack: { Screen: () => null },
}));
const mockPush = jest.fn();
jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);
jest.mock('../ui/haptics', () => ({
  haptic: jest.fn(),
  haptics: { success: jest.fn(), error: jest.fn(), light: jest.fn(), warning: jest.fn(), selection: jest.fn(), medium: jest.fn() },
}));
jest.mock('../features/account/useMe', () => ({ ME_QUERY_KEY: ['me'], useMe: () => ({ data: { id: 'me' } }) }));
jest.mock('../features/photos/PhotoStrip', () => ({ PhotoStrip: () => null }));
jest.mock('../components/FeedbackForm', () => ({ FeedbackForm: () => null }));
jest.mock('@maplibre/maplibre-react-native', () => {
  const R = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');
  const Pass = ({ children }: { children?: React.ReactNode }) => R.createElement(View, null, children);
  return { Map: Pass, Camera: () => null, GeoJSONSource: Pass, Layer: () => null };
});
jest.mock('../services/api', () => ({
  ApiError: class ApiError extends Error {},
  ragApi: { explainItem: jest.fn() },
  tripsApi: {
    get: jest.fn(),
    getItinerary: jest.fn(),
    budget: jest.fn(),
    removeItem: jest.fn(),
    reorderDay: jest.fn(),
    moveItem: jest.fn(),
    updateItem: jest.fn(),
    addItem: jest.fn(),
    suggestions: jest.fn(),
    leg: jest.fn(),
    dayRoute: jest.fn(),
    conditions: jest.fn(),
    keepWarning: jest.fn(),
  },
}));

const api = tripsApi as unknown as Record<string, jest.Mock>;
const clients: QueryClient[] = [];
function renderWithQuery(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { gcTime: Infinity } } });
  clients.push(client);
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}
afterEach(() => clients.splice(0).forEach((c) => c.clear()));
// These trips are dated 19–20 Oct 2026: the clock is a week before, so no day is "today"
// (only the date is fixed; timers stay real)
beforeAll(() => {
  jest.useFakeTimers({ doNotFake: ['setTimeout', 'setInterval', 'clearTimeout', 'clearInterval', 'setImmediate', 'clearImmediate', 'nextTick', 'queueMicrotask', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance'], now: new Date(2026, 9, 12, 10, 0) });
});
afterAll(() => jest.useRealTimers());
beforeEach(() => jest.clearAllMocks());

const place = (id: number, name: string, lat: number, lng: number, open = '06:00', close = '20:00') => ({
  id,
  name,
  destination_name: "Cox's Bazar",
  category: 'Beach',
  latitude: lat,
  longitude: lng,
  opening_time: open,
  closing_time: close,
});
const item = (id: number, extra: Partial<ItineraryItem>): ItineraryItem => ({
  id,
  item_type: 'activity',
  title: 'Stop',
  start_time: '10:00',
  end_time: '11:00',
  duration_minutes: 60,
  cost: 0,
  travel_time_to_next: 0,
  distance_to_next: 0,
  recommendation_score: 0.5,
  recommendation_reasons: [],
  order_index: 0,
  currency: 'BDT',
  cost_source: 'data',
  ...extra,
});

// Breakfast 09:00, Laboni 10:00–12:30, Lunch 12:30, Aquarium (opens 10:00) 13:40–15:10
const DAY: ItineraryDay = {
  id: 11,
  trip_id: 5,
  day_number: 1,
  day_date: '2026-10-19',
  total_cost: 1000,
  total_travel_time: 5,
  items: [
    item(1, { item_type: 'meal', title: 'Breakfast at Jhaubon Restaurant', start_time: '09:00', end_time: '10:00', order_index: 0, restaurant: { id: 3, name: 'Jhaubon Restaurant', destination_name: "Cox's Bazar", opening_time: '07:00', closing_time: '22:00' } }),
    item(2, {
      title: 'Laboni Beach',
      start_time: '10:00',
      end_time: '12:30',
      duration_minutes: 150,
      order_index: 1,
      place: place(8, 'Laboni Beach', 21.4272, 92.0058),
      travel_time_to_next: 9,
      distance_to_next: 2.4,
      travel_mode: 'cng',
      travel_source: 'road',
      travel_fare: 110,
    }),
    item(3, { item_type: 'meal', title: 'Lunch at Mermaid Café', start_time: '12:30', end_time: '13:30', order_index: 2, restaurant: { id: 4, name: 'Mermaid Café', destination_name: "Cox's Bazar", opening_time: '11:00', closing_time: '22:00' } }),
    item(4, { title: "Marine Aquarium Cox's Bazar", start_time: '13:40', end_time: '15:10', duration_minutes: 90, order_index: 3, place: place(9, "Marine Aquarium Cox's Bazar", 21.44, 92.015, '10:00', '19:00') }),
  ],
};
const DAY2: ItineraryDay = { ...DAY, id: 12, day_number: 2, day_date: '2026-10-20', items: [item(9, { title: 'Inani Beach', order_index: 0, place: place(10, 'Inani Beach', 21.25, 92.01) })] };
const TRIP: Trip = {
  id: 5,
  destination: "Cox's Bazar",
  start_date: '2026-10-19',
  end_date: '2026-10-20',
  num_travelers: 2,
  total_budget: 25000,
  currency: 'BDT',
  status: 'generated',
  num_days: 2,
  created_at: '2026-10-01T00:00:00',
  user_id: 'me',
  stops: [],
};
const ITIN: Itinerary = {
  trip_id: 5,
  destination: "Cox's Bazar",
  start_date: '2026-10-19',
  end_date: '2026-10-20',
  num_days: 2,
  currency: 'BDT',
  trip_status: 'generated',
  status: 'valid',
  total_budget: 25000,
  estimated_cost: 2000,
  days: [DAY, DAY2],
  validation: { trip_id: 5, valid: true, hard_violation_count: 0, soft_violation_count: 0, violations: [] },
  getting_there: { from: 'Dhaka', to: "Cox's Bazar", mode: 'bus', km: 395, minutes: 630, fare: 1200, fare_per: 'person', source: 'road' },
};

function setUp() {
  api.get.mockResolvedValue(TRIP);
  api.getItinerary.mockResolvedValue(ITIN);
  api.budget.mockResolvedValue({ total_budget: 25000, estimated_total: 9000 });
}



const NOW = new Date().toISOString();
const COND = {
  available: true,
  fetched_at: NOW,
  sea_fetched_at: NOW,
  stale: false,
  forecast_until: '2026-11-03',
  days: [
    {
      day_id: 11,
      day_number: 1,
      date: '2026-10-19',
      in_forecast: true,
      sunrise: '05:52',
      sunset: '17:25',
      temp_max: 32,
      temp_min: 25,
      rain_max: 70,
      code: 95,
      hours: [
        { time: '13:00', temp: 31, rain: 20, code: 2 },
        { time: '15:00', temp: 28, rain: 70, code: 95 },
      ],
      sea: { place: 'Laboni Beach', wave: 1.8, level: 'rough' },
      items: { '2': { temp: 29, rain: 40, code: 2 } },
      legs: { '2': { extra: 4, from: '17:00', to: '20:00', peak: 'evening' } },
      warnings: [
        { key: 'storm:2', code: 'storm', item_id: 2, place: 'Laboni Beach', stop_number: 2, kept: false, source: 'weather', from: '10:00', to: '12:00', boat: false, move_to: { day_id: 12, day_number: 2, date: '2026-10-20' } },
        { key: 'rough_sea:2', code: 'rough_sea', item_id: 2, place: 'Laboni Beach', stop_number: 2, kept: false, source: 'sea', wave: 1.8 },
      ],
      checks: [
        { code: 'opening_hours', ok: true, count: 2 },
        { code: 'after_dark', ok: true, sunset: '17:25', back_by: '15:10' },
        { code: 'traffic', ok: false, peaks: ['evening'] },
      ],
    },
  ],
};

describe('live conditions (trip planner step 6)', () => {
  it('shows the day at a glance, warnings on the stop and usual traffic on the leg', async () => {
    setUp();
    api.dayRoute.mockResolvedValue({ day_id: 11, provider: 'ors', legs: [] });
    api.conditions.mockResolvedValue(COND);
    await renderWithQuery(<TripScreen />);
    expect(await screen.findByText('32° / 25°')).toBeTruthy();
    expect(screen.getByText('2 warnings')).toBeTruthy();
    expect(screen.getByText('Sunset 17:25')).toBeTruthy();
    expect(screen.getByText('Sea 1.8 m')).toBeTruthy();
    expect(screen.getByText('Storms likely 10:00–12:00')).toBeTruthy();
    expect(screen.getByText('Rough sea at the beaches')).toBeTruthy();
    expect(screen.getByText('Usually slow 17:00–20:00 · about +4 min')).toBeTruthy();
    expect(screen.getByText('Updated just now')).toBeTruthy();
    await act(async () => fireEvent.press(screen.getByTestId('cond-chip-warnings')));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/trip/conditions/[id]', params: { id: 5, day: 1 } });
  });

  it('the conditions screen: hours, sun, sea, warnings with their source, and what was checked', async () => {
    setUp();
    api.conditions.mockResolvedValue(COND);
    await renderWithQuery(<ConditionsScreen />);
    expect(await screen.findByText('Storms likely 10:00–12:00')).toBeTruthy();
    expect(screen.getByText('Affects stop 2, Laboni Beach, which is outdoors.')).toBeTruthy();
    expect(screen.getByText('Source: weather forecast (Open-Meteo) · just now')).toBeTruthy();
    expect(screen.getByText("Waves around 1.8 m. Don't swim past the lifeguard flags.")).toBeTruthy();
    // The day in one look, then the stops, the sea in plain words
    expect(screen.getByText('Thunderstorm')).toBeTruthy();
    expect(screen.getByText('25°–32°')).toBeTruthy();
    expect(screen.getByText('Rain likely at times (70%)')).toBeTruthy();
    expect(screen.getByText('Sunrise 05:52 · Sunset 17:25')).toBeTruthy();
    expect(screen.getByText('2 things to know')).toBeTruthy();
    expect(screen.getByText('Rough · waves around 1.8 m. Stay near the shore.')).toBeTruthy();
    expect(screen.getByTestId('conditions-refresh')).toBeTruthy();
    expect(screen.getByText('All 2 stops are open when you arrive.')).toBeTruthy();
    expect(screen.getByText('Some legs are in the usual evening traffic: they show how much longer they take. Not live.')).toBeTruthy();
    expect(screen.getByText("Vromon warns you using the data above. It can't promise that a place or a road is safe.")).toBeTruthy();
    expect(screen.getByText('At your stops')).toBeTruthy();
    expect(screen.getByLabelText('10:00, Laboni Beach: Partly cloudy, 29°, 40% chance of rain')).toBeTruthy();
  });

  it('refreshes on request, from the screen and from the trip', async () => {
    setUp();
    api.dayRoute.mockResolvedValue({ day_id: 11, provider: 'ors', legs: [] });
    api.conditions.mockResolvedValue(COND);
    await renderWithQuery(<TripScreen />);
    await act(async () => fireEvent.press(await screen.findByTestId('conditions-refresh-pill')));
    await waitFor(() => expect(api.conditions).toHaveBeenCalledWith(5, true));
  });

  it('moves a stop to the drier day, or keeps it', async () => {
    setUp();
    api.conditions.mockResolvedValue(COND);
    api.moveItem.mockResolvedValue({ success: true, message: 'ok', days: [], validation: ITIN.validation });
    api.keepWarning.mockResolvedValue({ item_id: 2, kept_warnings: ['rough_sea'] });
    await renderWithQuery(<ConditionsScreen />);
    await act(async () => fireEvent.press(await screen.findByText('Move to Tuesday')));
    await waitFor(() => expect(api.moveItem).toHaveBeenCalledWith(5, 2, 12));
    expect(await screen.findByText('Moved Laboni Beach to Tuesday.')).toBeTruthy();
    await act(async () => fireEvent.press(screen.getAllByTestId('warning-keep')[1]));
    await waitFor(() => expect(api.keepWarning).toHaveBeenCalledWith(5, 2, 'rough_sea', true));
  });

  it('says when the forecast is old and the refresh failed', async () => {
    setUp();
    api.dayRoute.mockResolvedValue({ day_id: 11, provider: 'ors', legs: [] });
    api.conditions.mockResolvedValue({ ...COND, stale: true, fetched_at: new Date(Date.now() - 2 * 3600_000).toISOString() });
    await renderWithQuery(<TripScreen />);
    expect(await screen.findByText('Offline · updated 2 h ago')).toBeTruthy();
  });
});

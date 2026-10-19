import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import TripScreen from '../../app/trip/[id]';
import '../i18n';
import { tripsApi } from '../services/api';
import type { Itinerary, ItineraryDay, ItineraryItem, Trip } from '../types';

jest.mock('expo-router', () => ({
  // Runs on mount, as when the screen comes into focus
  useFocusEffect: (effect: () => void) => jest.requireActual<typeof React>('react').useEffect(effect, [effect]),
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({ id: '5' }),
}));
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
const OK = (day: ItineraryDay) => ({ success: true, message: 'ok', day, validation: ITIN.validation });

function setUp() {
  api.get.mockResolvedValue(TRIP);
  api.getItinerary.mockResolvedValue(ITIN);
  api.budget.mockResolvedValue({ total_budget: 25000, estimated_total: 9000 });
}


const LEG = {
  item_id: 2,
  from: 'Laboni Beach',
  to: "Marine Aquarium Cox's Bazar",
  to_item_id: 4,
  km: 2.4,
  source: 'road',
  leave: '13:30',
  mode: 'cng',
  chosen: false,
  options: [
    { mode: 'walk', minutes: 32, fare: 0, arrive: '14:02', recommended: false, moves: [{ item_id: 4, item_type: 'activity', title: "Marine Aquarium Cox's Bazar", minutes_later: 22 }] },
    { mode: 'rickshaw', minutes: 14, fare: 80, arrive: '13:44', recommended: false, moves: [{ item_id: 4, item_type: 'activity', title: "Marine Aquarium Cox's Bazar", minutes_later: 4 }] },
    { mode: 'cng', minutes: 9, fare: 110, arrive: '13:39', recommended: true, moves: [] },
    { mode: 'car', minutes: 7, fare: 460, arrive: '13:37', recommended: false, moves: [] },
  ],
};

describe('travel legs (trip planner step 5)', () => {
  it('shows how, how long and the fare, and getting there on day 1', async () => {
    setUp();
    api.dayRoute.mockResolvedValue({ day_id: 11, provider: 'ors', legs: [] });
    await renderWithQuery(<TripScreen />);
    expect(await screen.findByText('CNG · about 9 min · 2.4 km')).toBeTruthy();
    expect(screen.getByText('≈ ৳110')).toBeTruthy();
    expect(screen.getByText('Getting there from Dhaka by bus')).toBeTruthy();
    expect(screen.getByText('About 10 h 30 min · 395 km · ≈ ৳1,200 each')).toBeTruthy();
    expect(api.dayRoute).toHaveBeenCalledWith(5, 11);
  });

  it('chooses another way: shows what moves, then saves it', async () => {
    setUp();
    api.dayRoute.mockResolvedValue({ day_id: 11, provider: 'ors', legs: [] });
    api.leg.mockResolvedValue(LEG);
    const walked = { ...DAY, items: DAY.items.map((i) => (i.id === 2 ? { ...i, travel_mode: 'walk' as const, travel_mode_chosen: true, travel_time_to_next: 32, travel_fare: 0 } : i)) };
    api.updateItem.mockResolvedValue(OK(walked));
    await renderWithQuery(<TripScreen />);
    await act(async () => fireEvent.press(await screen.findByTestId('leg-row')));
    expect(await screen.findByText("Laboni Beach → Marine Aquarium Cox's Bazar")).toBeTruthy();
    expect(screen.getByText('Leave 13:30 · 2.4 km by road')).toBeTruthy();
    expect(screen.getByText('Arrive 13:39. Nothing else moves.')).toBeTruthy();
    await act(async () => fireEvent.press(screen.getByTestId('leg-mode-walk')));
    expect(screen.getByText("Arrive 14:02. Marine Aquarium Cox's Bazar moves 22 min later.")).toBeTruthy();
    await act(async () => fireEvent.press(screen.getByTestId('leg-use')));
    await waitFor(() => expect(api.updateItem).toHaveBeenCalledWith(5, 2, { travel_mode: 'walk' }));
    expect(await screen.findByText("Walk to Marine Aquarium Cox's Bazar")).toBeTruthy();
  });

  it('a leg without road data is the straight-line estimate', async () => {
    setUp();
    api.dayRoute.mockResolvedValue({ day_id: 11, provider: null, legs: [] });
    api.getItinerary.mockResolvedValue({
      ...ITIN,
      getting_there: null,
      days: [{ ...DAY, items: DAY.items.map((i) => (i.id === 2 ? { ...i, travel_mode: null, travel_source: 'estimate' as const, travel_fare: null } : i)) }, DAY2],
    });
    await renderWithQuery(<TripScreen />);
    expect(await screen.findByText('About 9 min · 2.4 km')).toBeTruthy();
    expect(screen.queryByTestId('getting-there')).toBeNull();
  });
});

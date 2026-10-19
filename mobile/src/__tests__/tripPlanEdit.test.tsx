import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import TripScreen from '../../app/trip/[id]';
import { moveInList, previewMove, retime } from '../features/trips/plan/timeline';
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
beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ['setTimeout', 'setInterval', 'clearTimeout', 'clearInterval', 'setImmediate', 'clearImmediate', 'nextTick', 'queueMicrotask', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance'], now: new Date(2026, 9, 12, 10, 0) });
});
afterEach(() => jest.useRealTimers());
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
    item(2, { title: 'Laboni Beach', start_time: '10:00', end_time: '12:30', duration_minutes: 150, order_index: 1, place: place(8, 'Laboni Beach', 21.4272, 92.0058) }),
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
};
const OK = (day: ItineraryDay) => ({ success: true, message: 'ok', day, validation: ITIN.validation });

function setUp() {
  api.get.mockResolvedValue(TRIP);
  api.getItinerary.mockResolvedValue(ITIN);
  api.budget.mockResolvedValue({ total_budget: 25000, estimated_total: 9000 });
}

describe('re-timing (same rules as the server)', () => {
  it('moves items in a list', () => {
    expect(moveInList(['a', 'b', 'c', 'd'], 1, 3)).toEqual(['a', 'c', 'd', 'b']);
    expect(moveInList(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b']);
  });

  it('keeps items before the change, waits for opening and for the usual meal time', () => {
    // Aquarium before Laboni: it can't start before it opens at 10:00 — it starts right after breakfast at 10:00
    const out = previewMove(DAY, 4, 1);
    expect(out.map((i) => i.id)).toEqual([1, 4, 2, 3]);
    expect(out[0].start_time).toBe('09:00');
    expect(out[1].start_time).toBe('10:00');
    // Laboni follows the aquarium plus travel, lunch comes after it
    expect(out[2].start_time > out[1].end_time || out[2].start_time === out[1].end_time).toBe(true);
    expect(out[3].start_time >= out[2].end_time).toBe(true);

    // Lunch first: never before 12:00
    const lunchFirst = previewMove(DAY, 3, 0);
    expect(lunchFirst[0].id).toBe(3);
    expect(lunchFirst[0].start_time).toBe('12:00');
  });

  it('a pinned stop keeps its time unless the ones before it run past it', () => {
    const items = DAY.items.map((i) => (i.id === 4 ? { ...i, pinned: true, start_time: '16:00', end_time: '17:30' } : i));
    const out = retime(items, 9 * 60, 1);
    expect(out[3].start_time).toBe('16:00');
    const late = retime(items.map((i) => (i.id === 2 ? { ...i, duration_minutes: 600 } : i)), 9 * 60, 1);
    expect(late[3].start_time > '16:00').toBe(true);
  });
});

describe('rearranging on the trip screen', () => {
  it('moves a stop later from TalkBack, shows it at once, and Undo puts the order back', async () => {
    setUp();
    api.reorderDay.mockImplementation((_t: number, _d: number, ids: number[]) =>
      Promise.resolve(OK({ ...DAY, items: ids.map((id, i) => ({ ...DAY.items.find((x) => x.id === id)!, order_index: i })) })),
    );
    await renderWithQuery(<TripScreen />);
    const card = await screen.findByTestId('stop-2');
    const names = card.props.accessibilityActions.map((a: { name: string }) => a.name);
    expect(names).toEqual(expect.arrayContaining(['earlier', 'later', 'toDay', 'remove']));

    await act(async () => fireEvent(card, 'accessibilityAction', { nativeEvent: { actionName: 'later' } }));
    expect(api.reorderDay).toHaveBeenCalledWith(5, 11, [1, 3, 2, 4]);
    expect(await screen.findByTestId('trip-snackbar')).toHaveTextContent(/^Moved Laboni Beach/);

    await act(async () => fireEvent.press(screen.getByTestId('trip-snackbar-action')));
    expect(api.reorderDay).toHaveBeenLastCalledWith(5, 11, [1, 2, 3, 4]);
  });

  it('puts the old order back when the server refuses', async () => {
    setUp();
    api.reorderDay.mockRejectedValue(new Error('nope'));
    await renderWithQuery(<TripScreen />);
    const card = await screen.findByTestId('stop-4');
    await act(async () => fireEvent(card, 'accessibilityAction', { nativeEvent: { actionName: 'earlier' } }));
    await waitFor(() => expect(api.reorderDay).toHaveBeenCalled());
    // Stop 4 is still the last numbered stop
    expect(screen.getByTestId('stop-4').props.accessibilityLabel).toMatch(/^Stop 4:/);
  });

  it('pins a stop, changes how long you stay (one request for quick taps) and moves it to another day', async () => {
    jest.useFakeTimers({ now: new Date(2026, 9, 12, 10, 0) });
    try {
      setUp();
      api.updateItem.mockResolvedValue(OK(DAY));
      api.moveItem.mockResolvedValue({ success: true, message: 'ok', days: [DAY, DAY2], validation: ITIN.validation });
      await renderWithQuery(<TripScreen />);
      await act(async () => fireEvent.press(await screen.findByTestId('stop-2')));
      expect(screen.getByTestId('stop-sheet')).toBeTruthy();

      await act(async () => fireEvent.press(screen.getByTestId('stop-pin')));
      expect(api.updateItem).toHaveBeenCalledWith(5, 2, { pinned: true });

      await act(async () => fireEvent.press(screen.getByTestId('stay-more')));
      await act(async () => fireEvent.press(screen.getByTestId('stay-more')));
      expect(screen.getByTestId('stay-value')).toHaveTextContent('3 h');
      await act(async () => jest.advanceTimersByTime(800));
      expect(api.updateItem).toHaveBeenCalledTimes(2);
      expect(api.updateItem).toHaveBeenLastCalledWith(5, 2, { duration_minutes: 180 });

      await act(async () => fireEvent.press(screen.getByTestId('stop-move-day')));
      await act(async () => fireEvent.press(screen.getByTestId('move-to-day-2')));
      expect(api.moveItem).toHaveBeenCalledWith(5, 2, 12);
    } finally {
      jest.useRealTimers();
    }
  });

  it('adds a suggested place at the end of the day, near the last visit', async () => {
    setUp();
    api.suggestions.mockResolvedValue([
      { place: place(20, 'Kolatoli Beach', 21.415, 92.0045), recommendation_score: 0.6, recommendation_reasons: ['Matches your interest in beach'], distance_km: 1.4 },
    ]);
    api.addItem.mockResolvedValue(OK({ ...DAY, items: [...DAY.items, item(30, { title: 'Kolatoli Beach', place_id: 20, order_index: 4 })] }));
    await renderWithQuery(<TripScreen />);
    await act(async () => fireEvent.press(await screen.findByTestId('add-stop')));
    await waitFor(() => expect(api.suggestions).toHaveBeenCalledWith(5, 11, { near_item_id: 4, q: undefined }));
    await act(async () => fireEvent.press(await screen.findByTestId('add-place-20')));
    expect(api.addItem).toHaveBeenCalledWith(5, 11, 20, 4);
    expect(await screen.findByTestId('trip-snackbar')).toHaveTextContent(/^Added Kolatoli Beach/);
  });
});

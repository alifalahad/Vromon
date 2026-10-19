import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import TripScreen from '../../app/trip/[id]';
import {
  dayWindow,
  forYou,
  friendlyRange,
  initialDayIndex,
  planRows,
  ribbonSegments,
  shortDuration,
  stopCoord,
  stopTitle,
} from '../features/trips/plan/timeline';
import { UNDO_MS } from '../features/trips/plan/useDeferredRemoval';
import '../i18n';
import { tripsApi } from '../services/api';
import type { Itinerary, ItineraryDay, ItineraryItem, Trip } from '../types';

const mockPush = jest.fn();
const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  // Runs on mount, as when the screen comes into focus
  useFocusEffect: (effect: () => void) => jest.requireActual<typeof React>('react').useEffect(effect, [effect]),
  useRouter: () => ({ push: mockPush, back: mockBack }),
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
    generate: jest.fn(),
    regenerate: jest.fn(),
    adapt: jest.fn(),
    regenerateDay: jest.fn(),
    duplicate: jest.fn(),
    delete: jest.fn(),
    alternatives: jest.fn(),
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

let nextId = 100;
function item(extra: Partial<ItineraryItem>): ItineraryItem {
  return {
    id: nextId++,
    item_type: 'activity',
    title: 'Laboni Beach',
    start_time: '10:00',
    end_time: '12:00',
    duration_minutes: 120,
    cost: 0,
    travel_time_to_next: 0,
    distance_to_next: 0,
    recommendation_score: 0.7,
    recommendation_reasons: [],
    order_index: 0,
    category: 'Beach',
    currency: 'BDT',
    cost_source: 'data',
    ...extra,
  };
}

const DAY1: ItineraryDay = {
  id: 11,
  trip_id: 5,
  day_number: 1,
  day_date: '2026-10-19',
  theme: 'Beach & Food',
  total_cost: 2120,
  total_travel_time: 7,
  items: [
    item({
      id: 1,
      item_type: 'meal',
      title: 'Breakfast at Jhaubon Restaurant',
      start_time: '09:00',
      end_time: '10:00',
      duration_minutes: 60,
      cost: 280,
      order_index: 0,
      category: 'Meal',
      restaurant: { id: 3, name: 'Jhaubon Restaurant', destination_name: "Cox's Bazar", cuisine: 'Bangladeshi Seafood', latitude: 21.44, longitude: 92.01 },
    }),
    item({
      id: 2,
      title: 'Laboni Beach',
      start_time: '10:02',
      end_time: '12:32',
      duration_minutes: 150,
      order_index: 1,
      travel_time_to_next: 2,
      distance_to_next: 0.9,
      recommendation_reasons: ['Matches your interest in beach, photography', 'Good rating (4.5★)'],
      place: { id: 8, name: 'Laboni Beach', destination_name: "Cox's Bazar", category: 'Beach', latitude: 21.4272, longitude: 92.0058, opening_time: '06:00', closing_time: '20:00' },
    }),
    item({
      id: 3,
      title: 'Sunset Boat Ride',
      start_time: '15:45',
      end_time: '17:45',
      duration_minutes: 120,
      cost: 500,
      order_index: 2,
      category: 'Adventure',
      place: { id: 9, name: 'Sunset Boat Ride', destination_name: "Cox's Bazar", category: 'Adventure', latitude: 21.43, longitude: 91.99 },
    }),
  ],
};
const DAY2: ItineraryDay = {
  ...DAY1,
  id: 12,
  day_number: 2,
  day_date: '2026-10-20',
  theme: 'Nature',
  items: [item({ id: 4, title: 'Himchari Waterfall', order_index: 0, place: { id: 10, name: 'Himchari Waterfall', destination_name: "Cox's Bazar", category: 'Nature' } })],
};

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
const ITIN = (days: ItineraryDay[]): Itinerary => ({
  trip_id: 5,
  destination: "Cox's Bazar",
  start_date: '2026-10-19',
  end_date: '2026-10-20',
  num_days: 2,
  currency: 'BDT',
  trip_status: 'generated',
  status: days.length ? 'valid' : null,
  total_budget: 25000,
  estimated_cost: 3920,
  days,
  validation: days.length ? { trip_id: 5, valid: true, hard_violation_count: 0, soft_violation_count: 0, violations: [] } : null,
});
const BUDGET = { total_budget: 25000, estimated_total: 9500 };

describe('plan timeline', () => {
  it('numbers stops and adds travel legs and free time in order', () => {
    const rows = planRows(DAY1);
    expect(rows.map((r) => r.kind)).toEqual(['stop', 'stop', 'free', 'leg', 'stop']);
    expect(rows[0]).toMatchObject({ kind: 'stop', n: 1, stopKind: 'meal' });
    // 12:32 + 2 min travel → 15:45: 3 h 11 min free
    expect(rows[2]).toMatchObject({ kind: 'free', start: '12:32', minutes: 191 });
    expect(rows[3]).toMatchObject({ kind: 'leg', minutes: 2, km: 0.9 });
    expect(rows[4]).toMatchObject({ kind: 'stop', n: 3 });
  });

  it('leaves out stops being removed and renumbers the rest', () => {
    const rows = planRows(DAY1, [2]);
    expect(rows.filter((r) => r.kind === 'stop').map((r) => r.kind === 'stop' && r.n)).toEqual([1, 2]);
    expect(rows.some((r) => r.kind === 'leg')).toBe(false);
    expect(ribbonSegments(DAY1, [2]).map((s) => s.kind)).toEqual(['meal', 'visit']);
  });

  it('fits the ribbon to whole hours around the plan and the preferred day', () => {
    expect(dayWindow(DAY1)).toEqual({ start: 9 * 60, end: 18 * 60 });
    expect(dayWindow(DAY1, '08:30', '20:00')).toEqual({ start: 8 * 60, end: 20 * 60 });
    expect(ribbonSegments(DAY1)).toContainEqual({ start: 12 * 60 + 32, end: 12 * 60 + 34, kind: 'travel' });
  });

  it('writes friendly titles, tags and dates', () => {
    expect(stopTitle(DAY1.items[0])).toBe('Breakfast · Jhaubon Restaurant');
    expect(stopTitle(DAY1.items[1])).toBe('Laboni Beach');
    expect(forYou(DAY1.items[1].recommendation_reasons)).toBe('beach, photography');
    expect(forYou(['Good rating (4.5★)'])).toBeNull();
    expect(stopCoord(DAY1.items[0])).toEqual({ latitude: 21.44, longitude: 92.01 });
    expect(stopCoord(DAY2.items[0])).toBeNull();
    expect(friendlyRange('2026-10-19', '2026-10-20', 'en', '2026-10-18')).toBe('Mon 19 – Tue 20 Oct');
    expect(friendlyRange('2026-10-30', '2026-11-01', 'en', '2026-10-18')).toBe('Fri 30 Oct – Sun 1 Nov');
    expect(friendlyRange('2027-01-04', '2027-01-05', 'en', '2026-10-18')).toBe('Mon 4 – Tue 5 Jan 2027');
    expect([45, 60, 150].map(shortDuration)).toEqual(['45 min', '1 h', '2 h 30']);
    expect(initialDayIndex([DAY1, DAY2], '2026-10-20')).toBe(1);
    expect(initialDayIndex([DAY1, DAY2], '2026-10-01')).toBe(0);
  });
});

describe('trip screen', () => {
  it('shows the plan: title, dates, budget, day tabs, stops, legs and free time', async () => {
    api.get.mockResolvedValue(TRIP);
    api.getItinerary.mockResolvedValue(ITIN([DAY1, DAY2]));
    api.budget.mockResolvedValue(BUDGET);
    await renderWithQuery(<TripScreen />);

    expect(await screen.findByTestId('trip-title')).toHaveTextContent("Cox's Bazar");
    expect(screen.getByText(/2 travellers/)).toBeTruthy();
    expect(screen.getByText('Breakfast · Jhaubon Restaurant')).toBeTruthy();
    expect(screen.getByText('Bangladeshi Seafood · ৳280 each')).toBeTruthy();
    expect(screen.getByText('For you: beach, photography')).toBeTruthy();
    expect(screen.getByText('Free time')).toBeTruthy();
    expect(screen.getByText('About 2 min · 0.9 km')).toBeTruthy();
    expect(screen.getByText('Travel times are straight-line estimates, not road routes.')).toBeTruthy();
    expect(await screen.findByTestId('trip-budget')).toHaveTextContent('৳9,500 / ৳25,000');
    // No developer words
    expect(screen.queryByText(/Valid|constraints|Match \d+%|straight-line\)/)).toBeNull();

    await fireEvent.press(screen.getByTestId('day-tab-2'));
    expect(screen.getByText('Himchari Waterfall')).toBeTruthy();
    expect(screen.queryByText('Laboni Beach')).toBeNull();
  });

  it('removes a stop with Undo, and only sends it when Undo runs out', async () => {
    jest.useFakeTimers();
    try {
      api.get.mockResolvedValue(TRIP);
      api.getItinerary.mockResolvedValue(ITIN([DAY1]));
      api.budget.mockResolvedValue(BUDGET);
      api.removeItem.mockResolvedValue({ success: true, message: 'Removed' });
      await renderWithQuery(<TripScreen />);
      const card = await screen.findByTestId('stop-2');

      await act(async () => fireEvent(card, 'accessibilityAction', { nativeEvent: { actionName: 'remove' } }));
      expect(screen.queryByText('Laboni Beach')).toBeNull();
      expect(screen.getByTestId('trip-snackbar')).toHaveTextContent(/^Removed Laboni Beach/);
      await act(async () => fireEvent.press(screen.getByTestId('trip-snackbar-action')));
      expect(screen.getByText('Laboni Beach')).toBeTruthy();
      await act(async () => jest.advanceTimersByTime(UNDO_MS + 100));
      expect(api.removeItem).not.toHaveBeenCalled();

      // A second "remove" for the same stop (a swipe can report twice) doesn't send it early
      const again = screen.getByTestId('stop-2');
      await act(async () => fireEvent(again, 'accessibilityAction', { nativeEvent: { actionName: 'remove' } }));
      await act(async () => fireEvent(again, 'accessibilityAction', { nativeEvent: { actionName: 'remove' } }));
      await act(async () => jest.advanceTimersByTime(1000));
      expect(api.removeItem).not.toHaveBeenCalled();
      await act(async () => jest.advanceTimersByTime(UNDO_MS));
      expect(api.removeItem).toHaveBeenCalledTimes(1);
      expect(api.removeItem).toHaveBeenCalledWith(5, 2);
    } finally {
      jest.useRealTimers();
    }
  });

  it("opens a friend's trip read-only", async () => {
    api.get.mockResolvedValue({ ...TRIP, user_id: 'friend' });
    api.getItinerary.mockResolvedValue(ITIN([DAY1]));
    api.budget.mockResolvedValue(BUDGET);
    await renderWithQuery(<TripScreen />);
    expect(await screen.findByText('Laboni Beach')).toBeTruthy();
    expect(screen.getByText(/viewing a friend/i)).toBeTruthy();
    expect(screen.queryByTestId('trip-menu')).toBeNull();
    expect(screen.queryByTestId('change-relax')).toBeNull();
    expect(screen.getByTestId('stop-2').props.accessibilityActions).toBeUndefined();
  });

  it('builds a missing plan with the optimiser, falling back to the quick planner', async () => {
    api.get.mockResolvedValue({ ...TRIP, status: 'draft' });
    api.getItinerary.mockResolvedValue(ITIN([]));
    api.generate.mockRejectedValueOnce(new Error('no plan')).mockResolvedValueOnce({});
    await renderWithQuery(<TripScreen />);
    await fireEvent.press(await screen.findByTestId('build-plan'));
    await waitFor(() => expect(api.generate).toHaveBeenCalledTimes(2));
    expect(api.generate.mock.calls.map((c) => c[1])).toEqual(['cpsat', 'heuristic']);
  });
});

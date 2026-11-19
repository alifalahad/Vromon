import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import TripScreen from '../../app/trip/[id]';
import {
  forYou,
  friendlyRange,
  initialDayIndex,
  planRows,
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
const mockTransition: { hold: boolean; end: (() => void) | null } = { hold: false, end: null };
jest.mock('expo-router', () => ({
  // Runs on mount, as when the screen comes into focus
  useFocusEffect: (effect: () => void) => jest.requireActual<typeof React>('react').useEffect(effect, [effect]),
  useRouter: () => ({ push: mockPush, back: mockBack }),
  useLocalSearchParams: () => ({ id: '5' }),
  // The screen has finished sliding in (the plan sheet waits for that), unless a test holds it
  useNavigation: () => ({
    addListener: (_event: string, cb: (e: { data: { closing: boolean } }) => void) => {
      if (mockTransition.hold) mockTransition.end = () => cb({ data: { closing: false } });
      else cb({ data: { closing: false } });
      return () => {};
    },
  }),
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
  return { Map: Pass, Camera: () => null, GeoJSONSource: Pass, RasterDEMSource: Pass, RasterSource: Pass, VectorSource: Pass, Layer: () => null, Marker: Pass };
});
jest.mock('../services/api', () => ({
  ApiError: class ApiError extends Error {},
  ragApi: { explainItem: jest.fn() },
  destinationsApi: { list: jest.fn(() => Promise.resolve([])), hotels: jest.fn(() => Promise.resolve([])) },
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
    stays: jest.fn(() => new Promise(() => {})),
    setStays: jest.fn(),
    setMeals: jest.fn(),
    setDayMeals: jest.fn(),
    placesToEat: jest.fn(),
    eatAt: jest.fn(),
    staySuggestions: jest.fn(() => Promise.resolve({ trip_id: 5, suggestions: [] })),
    acceptStaySuggestion: jest.fn(),
    notNowStaySuggestion: jest.fn(),
    dismissStaySuggestion: jest.fn(),
  },
}));

const api = tripsApi as unknown as Record<string, jest.Mock>;

const clients: QueryClient[] = [];
function renderWithQuery(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { gcTime: Infinity } } });
  clients.push(client);
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}
function cleanUpClients() {
  clients.splice(0).forEach((c) => c.clear());
}
afterEach(cleanUpClients);
// These trips are dated 19–20 Oct 2026: the clock is a week before, so no day is "today"
// (only the date is fixed; timers stay real)
const REAL_TIMERS = ['setTimeout', 'setInterval', 'clearTimeout', 'clearInterval', 'setImmediate', 'clearImmediate', 'nextTick', 'queueMicrotask', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance'] as const;
beforeAll(() => {
  jest.useFakeTimers({ doNotFake: [...REAL_TIMERS], now: new Date(2026, 9, 12, 10, 0) });
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
// The budget as the server sends it (step 7): the plan's total, its range, what's left, and each day
const BUDGET = {
  total_budget: 25000,
  estimated_total: 9500,
  total: 9500,
  low: 9000,
  high: 10500,
  left: 15500,
  status: 'ok',
  parts: [],
  by_day: [
    { day_number: 1, date: '2026-10-19', amount: 3920, food: 560, tickets: 1000, local: 2360, estimate: true },
    { day_number: 2, date: '2026-10-20', amount: 0, food: 0, tickets: 0, local: 0, estimate: false },
  ],
};

describe('plan timeline', () => {
  it('numbers stops and adds travel legs and free time in order', () => {
    const rows = planRows(DAY1);
    // The ride, then the free time at the next place (frame 29)
    expect(rows.map((r) => r.kind)).toEqual(['stop', 'stop', 'leg', 'free', 'stop']);
    expect(rows[0]).toMatchObject({ kind: 'stop', n: 1, stopKind: 'meal' });
    expect(rows[2]).toMatchObject({ kind: 'leg', minutes: 2, km: 0.9 });
    // 12:32 + 2 min travel = 12:34 → 15:45: 3 h 11 min free
    expect(rows[3]).toMatchObject({ kind: 'free', start: '12:34', minutes: 191 });
    expect(rows[4]).toMatchObject({ kind: 'stop', n: 3 });
  });

  it('leaves out stops being removed and renumbers the rest', () => {
    const rows = planRows(DAY1, [2]);
    expect(rows.filter((r) => r.kind === 'stop').map((r) => r.kind === 'stop' && r.n)).toEqual([1, 2]);
    expect(rows.some((r) => r.kind === 'leg')).toBe(false);
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
    // A week before it starts (the clock is 12 Oct)
    expect(screen.getByTestId('trip-phase')).toHaveTextContent('In 7 days');
    expect(screen.getByText(/2 travellers/)).toBeTruthy();
    expect(screen.getByText('Breakfast · Jhaubon Restaurant')).toBeTruthy();
    expect(screen.getByText('Bangladeshi Seafood · ৳280 each')).toBeTruthy();
    expect(screen.getByText('For you: beach, photography')).toBeTruthy();
    // Free time after the ride, with Add (your own trip)
    expect(screen.getByTestId('free-add')).toHaveTextContent(/^Free time · 3 h 11 min.*Add$/);
    expect(screen.getByText('About 2 min · 0.9 km')).toBeTruthy();
    expect(screen.getByText('Travel times are straight-line estimates, not road routes.')).toBeTruthy();
    // The budget row: the plan's estimate against the budget, and what's left (frame 28)
    expect(await screen.findByTestId('trip-budget')).toHaveTextContent(/≈ ৳9,500 of ৳25,000৳15,500 left/);
    // The day in a line: its places and meals, Budget's money for the day, the time on the road
    expect(screen.getByTestId('day-stats')).toHaveTextContent('2 places, 1 meal · ≈ ৳3,920 for 2 · 7 min on the road');
    // No ribbon any more: the day is a timeline, in order (frame 29)
    expect(screen.queryByTestId('day-ribbon')).toBeNull();
    const order: string[] = [];
    const walk = (n: unknown) => {
      if (!n || typeof n === 'string') return;
      const node = n as { props?: { testID?: string }; children?: unknown[] };
      if (node.props?.testID && /^(stop-\d+|leg-row|free-add)$/.test(node.props.testID)) order.push(node.props.testID);
      (node.children ?? []).forEach(walk);
    };
    walk(screen.getByTestId('plan-rows'));
    expect(order.filter((x, i) => order.indexOf(x) === i)).toEqual(['stop-1', 'stop-2', 'leg-row', 'free-add', 'stop-3']);
    // No developer words
    expect(screen.queryByText(/Valid|constraints|Match \d+%|straight-line\)/)).toBeNull();

    await fireEvent.press(screen.getByTestId('day-tab-2'));
    expect(screen.getByText('Himchari Waterfall')).toBeTruthy();
    expect(screen.queryByText('Laboni Beach')).toBeNull();
  });

  it('the plan sheet slides in once the screen has finished sliding in (it was never drawn when opened over another trip)', async () => {
    api.get.mockResolvedValue(TRIP);
    api.getItinerary.mockResolvedValue(ITIN([DAY1, DAY2]));
    api.budget.mockResolvedValue(BUDGET);
    mockTransition.hold = true;
    try {
      const start = performance.now();
      await renderWithQuery(<TripScreen />);
      expect(await screen.findByTestId('trip-full-map')).toBeTruthy(); // the map is there
      // the sheet waits (unless the run was so slow that the safety timeout, 0.7 s, already let it in)
      if (performance.now() - start < 600) expect(screen.queryByTestId('trip-title')).toBeNull();
      await act(async () => mockTransition.end?.());
      expect(await screen.findByTestId('trip-title')).toHaveTextContent("Cox's Bazar");
    } finally {
      mockTransition.hold = false;
      mockTransition.end = null;
    }
  });

  it('removes a stop with Undo, and only sends it when Undo runs out', async () => {
    // All timers fake, on the file's date (a trip that's over can't change: UI refresh step 16)
    jest.useFakeTimers({ now: new Date(2026, 9, 12, 10, 0) });
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
      // Back to the file's clock: the real date is after these trips
      jest.useFakeTimers({ doNotFake: [...REAL_TIMERS], now: new Date(2026, 9, 12, 10, 0) });
    }
  });

  it('where you stay: Tonight, the way from and back to it, and re-planning a day that ends late (trip upgrades step 2)', async () => {
    const SEA_CROWN = { kind: 'hotel' as const, name: 'Hotel Sea Crown', latitude: 21.43, longitude: 92.0, hotel_id: 4, estimate: false };
    const day1: ItineraryDay = {
      ...DAY1,
      start_base: SEA_CROWN,
      end_base: SEA_CROWN,
      start_leg: { to_item_id: 1, minutes: 10, km: 2.1, mode: 'cng', cost: 60 },
      return_leg: { from_item_id: 3, minutes: 20, km: 4.2, mode: 'cng', cost: 120 },
    };
    const day2: ItineraryDay = { ...DAY2, start_base: SEA_CROWN, end_base: SEA_CROWN };
    api.get.mockResolvedValue(TRIP);
    api.getItinerary.mockResolvedValue({
      ...ITIN([day1, day2]),
      validation: {
        trip_id: 5, valid: true, hard_violation_count: 0, soft_violation_count: 1,
        violations: [{ code: 'BACK_LATE', severity: 'soft', day_number: 1, item_id: null, message: 'Back at Hotel Sea Crown at 20:45, after 20:00' }],
      },
    });
    api.budget.mockResolvedValue(BUDGET);
    api.regenerateDay.mockResolvedValue({ message: 'Day 1 re-planned' });
    await renderWithQuery(<TripScreen />);

    expect(await screen.findByTestId('stays-tonight')).toHaveTextContent(/Tonight: Hotel Sea CrownChange$/);
    // When you leave (09:00 − 10 min) and when you're back (17:45 + 20 min), on the 5 minutes
    expect(screen.getByTestId('base-from')).toHaveTextContent(/^08:50.*From Hotel Sea Crown · 10 min by CNG$/);
    expect(screen.getByTestId('base-back')).toHaveTextContent(/^18:05.*Back at Hotel Sea Crown · 20 min by CNG · ≈ ৳120$/);
    // the stay on the map: one pin when the day starts and ends there
    expect(screen.getByTestId('map-base-start')).toBeTruthy();
    expect(screen.queryByTestId('map-base-end')).toBeNull();

    expect(screen.getByText('Back at Hotel Sea Crown at 20:45, after 20:00')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('replan-back-late'));
    await waitFor(() => expect(api.regenerateDay).toHaveBeenCalledWith(5, 11));

    // the last day has no night: where you leave from
    await fireEvent.press(screen.getByTestId('day-tab-2'));
    expect(screen.getByTestId('stays-tonight')).toHaveTextContent(/Last day: leave from Hotel Sea CrownChange$/);
  });

  it('meals (trip upgrades step 3): where you stay before leaving and after getting back, a packed lunch with places to eat, and the day\'s meals', async () => {
    const home = { kind: 'home' as const, name: "Uncle's house", latitude: 21.43, longitude: 92.0, hotel_id: null, estimate: false };
    const meal = (id: number, source: 'own' | 'stay', title: string, start: string, end: string, extra: Partial<ItineraryItem> = {}) =>
      item({ id, item_type: 'meal', meal_source: source, title, start_time: start, end_time: end, duration_minutes: 30, cost: 0, category: 'Meal', ...extra });
    const day: ItineraryDay = {
      ...DAY1,
      start_base: home,
      end_base: home,
      start_leg: { to_item_id: 2, minutes: 10, km: 2, mode: 'cng', cost: 60 },
      return_leg: { from_item_id: 3, minutes: 20, km: 4, mode: 'cng', cost: 120 },
      meals: null,
      meal_plan: { Breakfast: 'stay', Lunch: 'own', Dinner: 'stay', own_cost_per_person: null },
      items: [
        meal(41, 'stay', 'Breakfast where you stay', '09:07', '09:52', { order_index: 0 }),
        { ...DAY1.items[1], order_index: 1 },
        meal(42, 'own', 'Packed lunch', '12:32', '13:02', { order_index: 2, notes: 'At Laboni Beach' }),
        { ...DAY1.items[2], order_index: 3 },
        meal(43, 'stay', 'Dinner where you stay', '19:00', '19:45', { order_index: 4 }),
      ],
    };
    api.get.mockResolvedValue({ ...TRIP, preference: { id: 1, interests: [], travel_style: 'Balanced', activity_level: 'Medium', accommodation_preference: 'Standard', preferred_start_time: '09:00', preferred_end_time: '20:00', meals: { Breakfast: 'stay', Lunch: 'own', Dinner: 'stay', own_cost_per_person: null } } });
    api.getItinerary.mockResolvedValue(ITIN([day, DAY2]));
    api.budget.mockResolvedValue(BUDGET);
    api.placesToEat.mockResolvedValue({
      item_id: 42, near: 'Laboni Beach', at: '12:32',
      restaurants: [{ restaurant: { id: 7, name: 'Mermaid Cafe', destination_name: "Cox's Bazar", cuisine: 'Seafood', average_meal_cost: 600, opening_time: '08:00', closing_time: '23:00', cost_known: true }, km: 0.4 }],
    });
    api.eatAt.mockResolvedValue({ success: true, message: 'Lunch at Mermaid Cafe', day, validation: null });
    api.setDayMeals.mockResolvedValue({ trip_id: 5, meals: day.meal_plan, days: [day], validation: null, budget: { before: 9500, after: 9500, change: 0 } });
    await renderWithQuery(<TripScreen />);

    // Breakfast at home before "From …", dinner after "Back at …"; the packed lunch is a stop card
    expect(await screen.findByTestId('stay-meal-41')).toHaveTextContent(/^09:07.*Breakfast where you stay · 30 min · No cost$/);
    expect(screen.getByTestId('stay-meal-43')).toHaveTextContent(/Dinner where you stay/);
    const rows = screen.getByTestId('plan-rows');
    const ids = (node: unknown): string[] => {
      const out: string[] = [];
      const walk = (n: { props?: { testID?: string }; children?: unknown[] } | string) => {
        if (typeof n === 'string' || !n) return;
        if (n.props?.testID) out.push(n.props.testID);
        (n.children ?? []).forEach((c) => walk(c as never));
      };
      walk(node as never);
      return out;
    };
    const order = ids(rows).filter((x) => /^(stay-meal|base-|stop-)/.test(x));
    expect(order.indexOf('stay-meal-41')).toBeLessThan(order.indexOf('base-from'));
    expect(order.indexOf('base-back')).toBeLessThan(order.indexOf('stay-meal-43'));
    expect(screen.getByTestId('stop-42')).toHaveTextContent(/Packed lunch \(your own\)At Laboni Beach · No cost/);

    // Places to eat nearby, from the packed lunch: pick one and the lunch is there
    await fireEvent.press(screen.getByTestId('eat-nearby-42'));
    await fireEvent.press(await screen.findByTestId('eat-at-7'));
    await waitFor(() => expect(api.eatAt).toHaveBeenCalledWith(5, 42, 7));

    // The day's meals, from the menu
    await fireEvent.press(screen.getByTestId('trip-menu'));
    await fireEvent.press(await screen.findByTestId('action-mealsDay'));
    expect(await screen.findByTestId('meals-sheet')).toBeTruthy();
    await fireEvent(screen.getByTestId('meals-same-as-trip'), 'valueChange', false);
    await fireEvent.press(screen.getByTestId('meal-Lunch-restaurant'));
    await fireEvent.press(screen.getByTestId('meals-save'));
    await waitFor(() =>
      expect(api.setDayMeals).toHaveBeenCalledWith(5, 11, { Breakfast: 'stay', Lunch: 'restaurant', Dinner: 'stay', own_cost_per_person: null }),
    );
  });

  it('the stay advisor (trip upgrades step 4): a card above its day; Switch with Undo, Not now, and Why?', async () => {
    const advice = {
      id: 6, first_night: 2, last_night: 2, nights: 1, day_number: 2,
      hotel: { id: 9, name: 'Hotel Pashur', destination_name: 'Bagerhat', price_per_night: 2800, currency: 'BDT', rating: 3.5, rating_known: false, latitude: 22.47, longitude: 89.6 },
      current: { id: 4, name: 'Sea Crown', price_per_night: 2500 },
      money_saved: 2400, minutes_saved: 104, extra_moves: 1,
      parts: { rooms: 1, nights: 1, price_now: 2500, price_then: 2800, stay_now: 2500, stay_then: 2800, road_now: 236, road_then: 11,
        fares_now: 4410, fares_then: 280, transfer_minutes: 76, transfer_cost: 1430, hassle_minutes: 45, days: [2], time_value: 5 },
    };
    const before = [{ first_night: 1, last_night: 1, kind: 'hotel', hotel_id: 4, label: null, lat: null, lon: null }];
    api.get.mockResolvedValue(TRIP);
    api.getItinerary.mockResolvedValue(ITIN([DAY1, DAY2]));
    api.budget.mockResolvedValue(BUDGET);
    api.staySuggestions.mockResolvedValue({ trip_id: 5, suggestions: [advice] });
    api.acceptStaySuggestion.mockResolvedValue({ trip_id: 5, nights: 1, chosen: true, stays: [], days: [], validation: null,
      budget: { before: 9500, after: 7100, change: -2400 }, message: 'Staying at Hotel Pashur.', undo: { stays: before } });
    api.setStays.mockResolvedValue({ trip_id: 5, nights: 1, chosen: true, stays: [], days: [], validation: null, budget: { before: 0, after: 0, change: 0 } });
    api.notNowStaySuggestion.mockResolvedValue({ trip_id: 5, suggestions: [] });
    await renderWithQuery(<TripScreen />);

    // not on day 1; on day 2, above the day
    await waitFor(() => expect(api.staySuggestions).toHaveBeenCalled());
    expect(screen.queryByTestId('advice-6')).toBeNull();
    await fireEvent.press(await screen.findByTestId('day-tab-2'));
    const card = await screen.findByTestId('advice-6');
    expect(card).toHaveTextContent(/Sleep in Bagerhat for night 2\?/);
    expect(card).toHaveTextContent(/Hotel Pashur, ৳2,800 a night instead of ৳2,500\./);
    expect(card).toHaveTextContent(/Saves ৳2,400 and 1 h 44 min on the road/);
    expect(card).toHaveTextContent(/One extra check-out and check-in\./);

    // Why?
    await fireEvent.press(screen.getByTestId('advice-why-6'));
    expect(await screen.findByTestId('advice-why-sheet')).toHaveTextContent(/Moving with your bags: a ride of 1 h 16 min, about ৳1,430\./);

    // Switch, then Undo puts the stays back
    await fireEvent.press(screen.getByTestId('advice-switch-6'));
    await waitFor(() => expect(api.acceptStaySuggestion).toHaveBeenCalledWith(5, 6));
    expect(await screen.findByTestId('trip-snackbar')).toHaveTextContent(/Staying at Hotel Pashur/);
    await fireEvent.press(screen.getByTestId('trip-snackbar-action'));
    await waitFor(() => expect(api.setStays).toHaveBeenCalledWith(5, before));

    // Not now: hidden
    api.staySuggestions.mockResolvedValue({ trip_id: 5, suggestions: [advice] });
    await waitFor(() => expect(screen.getByTestId('advice-6')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('advice-notNow-6'));
    await waitFor(() => expect(api.notNowStaySuggestion).toHaveBeenCalledWith(5, 6));
  });

  // docs/ui-refresh step 15: on a trip day the plan follows the day (frame 31). The clock is set to the trip's
  // first day, Mon 19 Oct: breakfast 09:00–10:00, Laboni Beach 10:02–12:32, Sunset Boat Ride 15:45 (2 min away)
  describe('on a trip day', () => {
    const on = async (hhmm: string) => {
      const [h, m] = hhmm.split(':').map(Number);
      // (a test above ends with real timers, where the clock can't be set: fake only the date again)
      jest.useFakeTimers({ doNotFake: [...REAL_TIMERS], now: new Date(2026, 9, 19, h, m) });
      api.get.mockResolvedValue(TRIP);
      api.getItinerary.mockResolvedValue(ITIN([DAY1, DAY2]));
      api.budget.mockResolvedValue(BUDGET);
      await renderWithQuery(<TripScreen />);
      await screen.findByTestId('plan-now');
    };
    afterEach(() => jest.useFakeTimers({ doNotFake: [...REAL_TIMERS], now: new Date(2026, 9, 12, 10, 0) }));

    it("opens on today's tab with the Now card: what's on, until when, when to leave, and Today", async () => {
      await on('11:00');
      expect(screen.getByTestId('trip-phase')).toHaveTextContent('Day 1 of 2');
      expect(screen.getByText(/^Mon 19 Oct · 2 travellers$/)).toBeTruthy();
      expect(screen.getByTestId('plan-now')).toHaveTextContent(/NOW · 11:00.*Laboni Beach.*Until 12:32 · 1 h 32 min left/);
      expect(screen.getByTestId('plan-now')).toHaveTextContent(/Leave by 15:40Sunset Boat Ride · /);
      // The Now card takes the day line's place; Today opens from it (not from a pill as well)
      expect(screen.queryByTestId('day-stats')).toBeNull();
      expect(screen.getAllByTestId('open-today')).toHaveLength(1);
      await fireEvent.press(screen.getByTestId('open-today'));
      expect(mockPush).toHaveBeenCalledWith({ pathname: '/trip/today/[id]', params: { id: 5 } });
    });

    it('in the timeline: done, now, next, the time to leave on the ride; done and now stay where they are', async () => {
      await on('11:00');
      expect(screen.getByTestId('day-tab-1')).toHaveTextContent(/Day 1.*Today/);
      expect(screen.getByTestId('day-tab-2')).toHaveTextContent(/Day 2.*Tue 20/);
      // Breakfast is over: a short row with a tick
      expect(screen.getByTestId('stop-1')).toHaveTextContent(/^09:00.*Breakfast · Jhaubon Restaurant.*Done$/);
      expect(screen.getByTestId('stop-2').props.accessibilityLabel).toMatch(/Laboni Beach, 10:02, Now$/);
      expect(screen.getByTestId('stop-3').props.accessibilityLabel).toMatch(/Sunset Boat Ride, 15:45, Next$/);
      expect(screen.getByTestId('leg-leave-at', { includeHiddenElements: true })).toHaveTextContent('15:40');
      // Only later stops move: no grip, no TalkBack moves on what's on now; the next can't go above it
      expect(screen.queryByTestId('stop-grip-2', { includeHiddenElements: true })).toBeNull();
      expect(screen.getByTestId('stop-grip-3', { includeHiddenElements: true })).toBeTruthy();
      expect(screen.getByTestId('stop-2').props.accessibilityActions).toBeUndefined();
      expect((screen.getByTestId('stop-3').props.accessibilityActions ?? []).map((a: { name: string }) => a.name)).not.toContain('earlier');
      // The way from the stay is behind you
      expect(screen.queryByTestId('base-from')).toBeNull();
    });

    it('between stops: free time until it is time to leave; then time to leave, never "free time"', async () => {
      await on('12:40');
      expect(screen.getByTestId('stop-2')).toHaveTextContent(/Laboni Beach.*Done/);
      expect(screen.getByTestId('plan-now')).toHaveTextContent(/Free timeUntil 15:40, then leave for Sunset Boat Ride/);
      cleanUpClients();
      await on('15:42');
      expect(screen.getByTestId('plan-now')).toHaveTextContent(/Time to leaveFor Sunset Boat Ride · 2 min late/);
      expect(screen.getByTestId('plan-now')).toHaveTextContent(/Leave now/);
      expect(screen.getByTestId('plan-now')).not.toHaveTextContent(/Free time/);
    });

    it("another day's tab: no Now card, Today from the pill", async () => {
      await on('11:00');
      await fireEvent.press(screen.getByTestId('day-tab-2'));
      expect(screen.queryByTestId('plan-now')).toBeNull();
      expect(screen.getByTestId('day-stats')).toBeTruthy();
      expect(screen.getAllByTestId('open-today')).toHaveLength(1);
    });
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
    // Nothing to change: no Add a stop, no Add in free time, no "Not quite right?", no grips
    for (const id of ['add-stop', 'free-add', 'change-plan', 'new-ideas', 'leg-row']) expect(screen.queryByTestId(id)).toBeNull();
    expect(screen.queryByTestId('stop-grip-2', { includeHiddenElements: true })).toBeNull();
    // About this trip, to read
    expect(screen.getByTestId('trip-route')).toBeTruthy();
    expect(screen.queryByTestId('about-together')).toBeNull();
    // A stop's sheet: the facts, nothing to change
    await fireEvent.press(screen.getByTestId('stop-2'));
    expect(await screen.findByTestId('stop-sheet')).toBeTruthy();
    for (const id of ['stay-more', 'stop-pin', 'stop-swap', 'stop-remove', 'stop-move-day']) expect(screen.queryByTestId(id)).toBeNull();
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

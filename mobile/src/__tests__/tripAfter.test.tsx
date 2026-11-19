/**
 * After the trip (docs/ui-refresh step 16, frame 33; D19, D21): "Your trip" with its numbers and your rating,
 * the map offer in each state, the days read-only with each stop's Good or Bad (or "Rate"), the ⋮ menu of a
 * finished trip, "This trip didn't happen" and back, and "Plan it again" with new dates.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import React from 'react';

import TripScreen from '../../app/trip/[id]';
import { againDates, placesToMark, ratingFor, recapNumbers } from '../features/trips/after/recap';
import { markLine } from '../features/trips/after/MapOffer';
import { reminderTrip } from '../features/trips/review/review';
import i18n from '../i18n';
import { tripsApi, visitsApi } from '../services/api';
import { confirm } from '../utils/dialogs';
import type { Itinerary, ItineraryDay, ItineraryItem, ReviewThing, Trip, TripReviewResponse } from '../types';

const mockPush = jest.fn();
const mockRooms: { kind: string; trip_id: number; id: number; unread_count: number }[] = [];
const mockMe = { id: 'me' };
jest.mock('expo-router', () => ({
  useFocusEffect: (effect: () => void) => jest.requireActual<typeof React>('react').useEffect(effect, [effect]),
  useRouter: () => ({ push: mockPush, back: jest.fn(), dismissTo: jest.fn() }),
  useLocalSearchParams: () => ({ id: '5' }),
  useNavigation: () => ({
    addListener: (_event: string, cb: (e: { data: { closing: boolean } }) => void) => {
      cb({ data: { closing: false } });
      return () => {};
    },
  }),
}));
jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);
jest.mock('../ui/haptics', () => ({
  haptic: jest.fn(),
  haptics: { success: jest.fn(), error: jest.fn(), light: jest.fn(), warning: jest.fn(), selection: jest.fn(), medium: jest.fn() },
}));
jest.mock('../features/account/useMe', () => ({ ME_QUERY_KEY: ['me'], useMe: () => ({ data: mockMe }) }));
jest.mock('../features/chat/queries', () => ({ useConversations: () => ({ data: mockRooms }) }));
jest.mock('../features/photos/PhotoStrip', () => ({ PhotoStrip: () => null }));
jest.mock('../components/FeedbackForm', () => ({ FeedbackForm: () => null }));
jest.mock('../utils/dialogs', () => ({
  confirm: jest.fn((_title: string, _body: string, _ok: string, onConfirm: () => void) => onConfirm()),
  notify: jest.fn(),
}));
jest.mock('@maplibre/maplibre-react-native', () => {
  const R = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');
  const Pass = ({ children }: { children?: React.ReactNode }) => R.createElement(View, null, children);
  return { Map: Pass, Camera: () => null, GeoJSONSource: Pass, RasterDEMSource: Pass, RasterSource: Pass, VectorSource: Pass, Layer: () => null, Marker: Pass };
});
jest.mock('../services/api', () => ({
  ApiError: class ApiError extends Error {},
  destinationsApi: { list: jest.fn(() => Promise.resolve([])) },
  placesApi: { list: jest.fn(() => Promise.resolve([])) },
  visitsApi: { forUser: jest.fn() },
  tripsApi: {
    get: jest.fn(),
    list: jest.fn(() => Promise.resolve([])),
    stats: jest.fn(() => Promise.resolve({})),
    getItinerary: jest.fn(),
    budget: jest.fn(),
    conditions: jest.fn(() => new Promise(() => {})),
    dayRoute: jest.fn(() => new Promise(() => {})),
    stays: jest.fn(() => new Promise(() => {})),
    staySuggestions: jest.fn(() => Promise.resolve({ trip_id: 5, suggestions: [] })),
    review: jest.fn(),
    saveReview: jest.fn(),
    markVisited: jest.fn(),
    setNotTaken: jest.fn(),
    duplicate: jest.fn(),
    copy: jest.fn(),
    delete: jest.fn(),
  },
}));

const api = tripsApi as unknown as Record<string, jest.Mock>;
const visitsMock = visitsApi as unknown as Record<string, jest.Mock>;
const confirmMock = confirm as unknown as jest.Mock;

const clients: QueryClient[] = [];
function renderWithQuery(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { gcTime: Infinity } } });
  clients.push(client);
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}
// The trip was on 19–20 Oct 2026: the clock is five days after it (only the date is fixed; timers stay real)
const REAL_TIMERS = [
  'setTimeout',
  'setInterval',
  'clearTimeout',
  'clearInterval',
  'setImmediate',
  'clearImmediate',
  'nextTick',
  'queueMicrotask',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'performance',
] as const;
beforeAll(() => jest.useFakeTimers({ doNotFake: [...REAL_TIMERS], now: new Date(2026, 9, 25, 10, 0) }));
afterAll(() => jest.useRealTimers());
beforeEach(async () => {
  jest.clearAllMocks();
  mockRooms.splice(0);
  mockMe.id = 'me';
  visitsMock.forUser.mockResolvedValue([{ place_type: 'city', place_code: '1185241', status: 'lived' }]);
  await act(() => i18n.changeLanguage('en'));
});
afterEach(() => clients.splice(0).forEach((c) => c.clear()));

function item(extra: Partial<ItineraryItem> & { id: number }): ItineraryItem {
  return {
    item_type: 'activity',
    title: 'A place',
    start_time: '10:00',
    end_time: '11:00',
    duration_minutes: 60,
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

const leg = (km: number) => ({ minutes: 15, km, mode: 'cng', cost: 120 });
const DAY1: ItineraryDay = {
  id: 11,
  trip_id: 5,
  day_number: 1,
  day_date: '2026-10-19',
  theme: 'Beach & Food',
  total_cost: 2120,
  total_travel_time: 47,
  start_leg: leg(3.2),
  return_leg: leg(4.1),
  items: [
    item({
      id: 1,
      item_type: 'meal',
      title: 'Breakfast at Jhaubon Restaurant',
      start_time: '09:00',
      end_time: '10:00',
      order_index: 0,
      category: 'Meal',
      meal_source: 'restaurant',
      restaurant: { id: 3, name: 'Jhaubon Restaurant', destination_name: "Cox's Bazar", latitude: 21.44, longitude: 92.01 },
    }),
    item({
      id: 2,
      title: 'Laboni Beach',
      start_time: '10:05',
      end_time: '12:35',
      order_index: 1,
      travel_time_to_next: 20,
      distance_to_next: 9.4,
      place: { id: 8, name: 'Laboni Beach', destination_name: "Cox's Bazar", category: 'Beach', latitude: 21.42, longitude: 92.0 },
    }),
    item({
      id: 3,
      title: 'Sunset Boat Ride',
      start_time: '15:45',
      end_time: '17:45',
      order_index: 2,
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
  start_leg: leg(12.0),
  return_leg: leg(12.4),
  items: [item({ id: 4, title: 'Himchari Waterfall', place: { id: 10, name: 'Himchari Waterfall', destination_name: "Cox's Bazar", category: 'Nature' } })],
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
  visited_prompt: null,
  not_taken: null,
  stops: [
    {
      position: 0,
      city_geonameid: 1185241,
      city_name: 'Dhaka',
      country_iso2: 'BD',
      country_name: 'Bangladesh',
      transport_mode: null,
      arrive_on: null,
      depart_on: null,
    },
    {
      position: 1,
      city_geonameid: 1336134,
      city_name: 'Cox’s Bāzār',
      country_iso2: 'BD',
      country_name: 'Bangladesh',
      transport_mode: 'bus',
      arrive_on: '2026-10-19',
      depart_on: '2026-10-20',
    },
  ],
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
  estimated_cost: 9500,
  days,
  validation: days.length ? { trip_id: 5, valid: true, hard_violation_count: 0, soft_violation_count: 0, violations: [] } : null,
});
const BUDGET = {
  total_budget: 25000,
  estimated_total: 9500,
  total: 9500,
  low: 9000,
  high: 10500,
  left: 15500,
  status: 'ok',
  parts: [],
  by_day: [{ day_number: 1, date: '2026-10-19', amount: 3920, food: 560, tickets: 1000, local: 2360, estimate: true }],
};

const thing = (key: string, extra: Partial<ReviewThing>): ReviewThing => ({
  key,
  target_type: 'place',
  target_id: 1,
  item_id: 1,
  name: 'A place',
  day: 1,
  time: '09:00',
  meal: null,
  first_night: null,
  last_night: null,
  mode: null,
  verdict: null,
  comment: null,
  ...extra,
});
const THINGS: ReviewThing[] = [
  thing('restaurant:3:1', {
    target_type: 'restaurant',
    target_id: 3,
    item_id: 1,
    name: 'Jhaubon Restaurant',
    meal: 'Breakfast',
    verdict: 'bad',
    comment: 'Slow service',
  }),
  thing('place:8:2', { target_id: 8, item_id: 2, name: 'Laboni Beach', verdict: 'good' }),
  thing('place:9:3', { target_id: 9, item_id: 3, name: 'Sunset Boat Ride' }),
  thing('place:10:4', { target_id: 10, item_id: 4, name: 'Himchari Waterfall', day: 2 }),
];
const REVIEW = (rating: number | null, things = THINGS): TripReviewResponse => ({
  trip_id: 5,
  opens_on: '2026-10-19',
  review: rating ? { rating, comment: null, created_at: 'x', updated_at: 'y' } : null,
  items: things,
});

async function open(trip: Partial<Trip> = {}, review: TripReviewResponse = REVIEW(4), days = [DAY1, DAY2]) {
  api.get.mockResolvedValue({ ...TRIP, ...trip });
  api.getItinerary.mockResolvedValue(ITIN(days));
  api.budget.mockResolvedValue(BUDGET);
  api.review.mockResolvedValue(review);
  await renderWithQuery(<TripScreen />);
  await screen.findByTestId('trip-title');
}

describe('after the trip, as data', () => {
  it('"Your trip": its days, the plan\'s places and its rides added up, from and back to the stay', () => {
    // Places: Laboni Beach, Sunset Boat Ride, Himchari (breakfast is a meal). Rides: 9.4 between stops, and from
    // and back to the stay 3.2 + 4.1 + 12.0 + 12.4: 41.1, about 41 km
    expect(recapNumbers(TRIP, [DAY1, DAY2])).toEqual({ days: 2, places: 3, km: 41 });
    // Without a plan, only the days are known
    expect(recapNumbers(TRIP, [])).toEqual({ days: 2, places: null, km: null });
  });

  it("a stop's rating, the map offer's words, the dates Plan it again offers first", () => {
    expect(ratingFor(THINGS, 2)?.verdict).toBe('good');
    expect(ratingFor(THINGS, 99)).toBeNull();
    // Dhaka is on the map already (lived): only Cox's Bazar is new, in the name people write
    expect(placesToMark(TRIP, new Set(['city:1185241']))).toEqual(["Cox's Bazar"]);
    expect(placesToMark(TRIP, null)).toEqual(['Dhaka', "Cox's Bazar"]);
    expect(placesToMark(TRIP, new Set(['city:1185241', 'city:1336134']))).toEqual([]);
    const t = i18n.t.bind(i18n) as unknown as (k: string, o?: Record<string, unknown>) => string;
    expect(markLine(["Cox's Bazar"], t)).toBe("Marks Cox's Bazar as visited.");
    expect(markLine(['Bandarban', 'Rangamati', 'Khagrachari'], t)).toBe('Marks Bandarban, Rangamati and Khagrachari as visited.');
    // As many days as the trip had, from a week after today
    expect(againDates(TRIP, '2026-10-25')).toEqual({ start: '2026-11-01', end: '2026-11-02' });
  });

  it("the Trips tab never asks to rate a trip that didn't happen", () => {
    expect(reminderTrip([TRIP], '2026-10-21', [])?.id).toBe(5);
    expect(reminderTrip([{ ...TRIP, not_taken: '2026-10-22T08:00:00' }], '2026-10-21', [])).toBeNull();
  });
});

describe('a finished trip', () => {
  it('opens on what it was: Finished, "Your trip", the budget, the map offer, Plan it again, and the days read-only', async () => {
    await open();
    expect(screen.getByTestId('trip-phase')).toHaveTextContent(/Finished$/);
    const recap = await screen.findByTestId('trip-recap');
    expect(recap).toHaveTextContent(/YOUR TRIP/);
    expect(screen.getByTestId('trip-recap-numbers')).toHaveTextContent(/2days3places41 kmon the road there/);
    // Until step 19 the budget row is the plan's estimate
    expect(await screen.findByTestId('trip-budget')).toHaveTextContent(/≈ ৳9,500 of ৳25,000/);
    expect(await screen.findByTestId('map-offer')).toHaveTextContent(/Put this trip on your map\?.*Marks Cox's Bazar as visited\./);
    expect(screen.getByTestId('plan-again')).toHaveTextContent('Plan it again');
    expect(screen.getByTestId('send-trip')).toHaveTextContent('Send to a friend');
    // The day: its places and meals and its money, not the road (that's in "Your trip")
    expect(screen.getByTestId('day-stats')).toHaveTextContent('2 places, 1 meal · ≈ ৳3,920 for 2');
    // Each stop as it was: no rides, free time, grips, Add, "Not quite right?", Getting there or the way from the stay
    for (const id of ['leg-row', 'free-add', 'add-stop', 'change-plan', 'drag-hint', 'getting-there-not-counted']) expect(screen.queryByTestId(id)).toBeNull();
    expect(screen.queryByTestId('stop-grip-2', { includeHiddenElements: true })).toBeNull();
    expect(screen.getByTestId('stop-2').props.accessibilityActions).toBeUndefined();
    expect(screen.getByTestId('plan-kept')).toHaveTextContent('The plan is kept as it was. “Plan it again” makes a copy you can change.');
    // About this trip, to read: nothing opens to change it
    expect(screen.getByTestId('trip-route')).toBeTruthy();
    expect(screen.queryByTestId('edit-route')).toBeNull();
    expect(screen.queryByTestId('about-together')).toBeNull();
    // The rating card isn't at the bottom any more
    expect(screen.getAllByTestId('trip-review-card')).toHaveLength(1);
    expect(within(recap).getByTestId('trip-review-card')).toBeTruthy();
  });

  it('each stop with your Good or Bad and comment, or Rate, which opens "Rate things one by one" at it', async () => {
    await open();
    expect(await screen.findByTestId('verdict-1', { includeHiddenElements: true })).toHaveTextContent(/Bad$/);
    expect(screen.getByTestId('stop-1')).toHaveTextContent(/Breakfast · Jhaubon Restaurant“Slow service”/);
    expect(screen.getByTestId('stop-1').props.accessibilityLabel).toBe('09:00, 1, Breakfast · Jhaubon Restaurant, You rated it bad, “Slow service”');
    expect(screen.getByTestId('verdict-2', { includeHiddenElements: true })).toHaveTextContent(/Good$/);
    expect(screen.queryByTestId('rate-2')).toBeNull();
    await act(async () => fireEvent.press(screen.getByTestId('rate-3')));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/trip/review/[id]', params: { id: 5, item: 'place:9:3' } });
    // A stop's sheet: the facts, nothing to change
    await act(async () => fireEvent.press(screen.getByTestId('stop-2')));
    expect(await screen.findByTestId('stop-sheet')).toBeTruthy();
    for (const id of ['stay-more', 'stay-less', 'stop-pin', 'stop-swap', 'stop-remove', 'stop-move-day']) expect(screen.queryByTestId(id)).toBeNull();
  });

  it('your rating: not rated, one tap saves it; rated, the stars, their word, Edit and how many are rated', async () => {
    api.saveReview.mockImplementation((_id: number, body: { rating?: number }) => Promise.resolve(REVIEW(body.rating ?? 3)));
    await open({}, REVIEW(null));
    const recap = await screen.findByTestId('trip-recap');
    expect(await within(recap).findByTestId('trip-review-card')).toHaveTextContent(/How was your trip\?.*One tap is enough\. Only you see it\./);
    await act(async () => fireEvent.press(screen.getByTestId('trip-review-star-4')));
    expect(api.saveReview).toHaveBeenCalledWith(5, { rating: 4 }, '2026-10-25');
    expect(await screen.findByTestId('trip-review-summary')).toHaveTextContent(/Your rating · only you see it.*Very good.*Edit/);
    expect(screen.getByTestId('trip-review-one-by-one')).toHaveTextContent(/Rate things one by one.*2 rated/);
    await act(async () => fireEvent.press(screen.getByTestId('trip-review-edit')));
    await act(async () => fireEvent.changeText(screen.getByTestId('trip-review-comment'), ' Calm sea '));
    await act(async () => fireEvent.press(screen.getByTestId('trip-review-save')));
    expect(api.saveReview).toHaveBeenLastCalledWith(5, { rating: 4, comment: 'Calm sea' }, '2026-10-25');
  });

  it('the map offer: "Mark visited" answers it, and it\'s gone (from the Trips tab too: the same answer)', async () => {
    api.markVisited.mockResolvedValue({ visited_prompt: 'marked', places_marked: 1 });
    await open();
    // (the trip refreshes after the answer, with it)
    api.get.mockResolvedValue({ ...TRIP, visited_prompt: 'marked' });
    await act(async () => fireEvent.press(await screen.findByTestId('map-offer-mark')));
    expect(api.markVisited).toHaveBeenCalledWith(5, true);
    await waitFor(() => expect(screen.queryByTestId('map-offer')).toBeNull());
  });

  it('the map offer: "Not now" answers it too', async () => {
    api.markVisited.mockResolvedValue({ visited_prompt: 'dismissed', places_marked: 0 });
    await open();
    api.get.mockResolvedValue({ ...TRIP, visited_prompt: 'dismissed' });
    await act(async () => fireEvent.press(await screen.findByTestId('map-offer-not-now')));
    expect(api.markVisited).toHaveBeenCalledWith(5, false);
    await waitFor(() => expect(screen.queryByTestId('map-offer')).toBeNull());
  });

  it('no map offer once it was answered', async () => {
    await open({ visited_prompt: 'dismissed' });
    await screen.findByTestId('trip-recap');
    expect(screen.queryByTestId('map-offer')).toBeNull();
  });

  it('no map offer when every place is on the map already', async () => {
    visitsMock.forUser.mockResolvedValue([
      { place_type: 'city', place_code: '1185241', status: 'lived' },
      { place_type: 'city', place_code: '1336134', status: 'visited' },
    ]);
    await open();
    await waitFor(() => expect(visitsMock.forUser).toHaveBeenCalled());
    await act(async () => {});
    expect(screen.queryByTestId('map-offer')).toBeNull();
  });

  it("the ⋮ menu: Budget, Send to a friend, Plan it again, This trip didn't happen, Delete", async () => {
    await open();
    await act(async () => fireEvent.press(screen.getByTestId('trip-menu')));
    const keys = screen.getAllByTestId(/^action-/).map((a) => String(a.props.testID).replace('action-', ''));
    expect(keys).toEqual(['budget', 'send', 'again', 'notTaken', 'delete']);
  });

  it('"This trip didn\'t happen": asked first, then "Not taken" with no "Your trip" and no map offer; "It did happen" undoes it', async () => {
    // The server's answer, and the trip as it then is
    api.setNotTaken.mockImplementation((_id: number, value: boolean) => {
      const now = { ...TRIP, not_taken: value ? '2026-10-25T04:00:00' : null };
      api.get.mockResolvedValue(now);
      return Promise.resolve(now);
    });
    await open();
    await screen.findByTestId('map-offer');
    await act(async () => fireEvent.press(screen.getByTestId('trip-menu')));
    await act(async () => fireEvent.press(screen.getByTestId('action-notTaken')));
    expect(confirmMock.mock.calls[0][0]).toBe('This trip didn’t happen?');
    expect(confirmMock.mock.calls[0][1]).toMatch(/leaves “Your trips so far”.*won’t ask you to rate it or put it on your map/);
    expect(api.setNotTaken).toHaveBeenCalledWith(5, true, '2026-10-25');
    expect(await screen.findByText(/Not taken$/)).toBeTruthy();
    expect(screen.getByTestId('trip-phase')).toHaveTextContent(/Not taken$/);
    expect(screen.queryByTestId('trip-recap')).toBeNull();
    expect(screen.queryByTestId('map-offer')).toBeNull();
    expect(screen.queryByTestId('verdict-1', { includeHiddenElements: true })).toBeNull();
    expect(screen.queryByTestId('rate-3')).toBeNull();
    expect(screen.getByTestId('plan-again')).toBeTruthy();
    expect(screen.getByTestId('trip-snackbar')).toHaveTextContent(/Marked as not taken/);

    await act(async () => fireEvent.press(screen.getByTestId('trip-menu')));
    const keys = screen.getAllByTestId(/^action-/).map((a) => String(a.props.testID).replace('action-', ''));
    expect(keys).toEqual(['budget', 'send', 'again', 'didHappen', 'delete']);
    await act(async () => fireEvent.press(screen.getByTestId('action-didHappen')));
    expect(api.setNotTaken).toHaveBeenLastCalledWith(5, false, '2026-10-25');
    expect(await screen.findByTestId('trip-recap')).toBeTruthy();
    expect(screen.getByTestId('trip-phase')).toHaveTextContent(/Finished$/);
  });

  it('"Plan it again": the dates first (as many days, a week on), then the copy opens', async () => {
    api.duplicate.mockResolvedValue({ ...TRIP, id: 77, start_date: '2026-11-01', end_date: '2026-11-02', status: 'draft' });
    await open();
    await act(async () => fireEvent.press(screen.getByTestId('plan-again')));
    expect(await screen.findByTestId('plan-again-length')).toHaveTextContent('Sun 1 – Mon 2 Nov · 2 days');
    await act(async () => fireEvent.press(screen.getByTestId('plan-again-make')));
    expect(api.duplicate).toHaveBeenCalledWith(5, { start_date: '2026-11-01', end_date: '2026-11-02' }, '2026-10-25');
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/trip/[id]', params: { id: 77 } });
  });

  it('a friend who went (in the trip room) sees it with their own rating, and can plan it again for themselves', async () => {
    mockMe.id = 'friend';
    mockRooms.push({ kind: 'trip', trip_id: 5, id: 40, unread_count: 0 });
    api.copy.mockResolvedValue({ ...TRIP, id: 78 });
    await open();
    expect(await screen.findByTestId('trip-recap')).toBeTruthy();
    expect(await screen.findByTestId('verdict-2', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.queryByTestId('map-offer')).toBeNull(); // the owner's map, the owner's answer
    expect(screen.queryByTestId('send-trip')).toBeNull();
    expect(screen.queryByTestId('trip-menu')).toBeNull();
    await act(async () => fireEvent.press(screen.getByTestId('plan-again')));
    await act(async () => fireEvent.press(await screen.findByTestId('plan-again-make')));
    expect(api.copy).toHaveBeenCalledWith(5, { start_date: '2026-11-01', end_date: '2026-11-02' }, '2026-10-25');
  });

  it("a friend who didn't go sees the plan only: no rating, no Plan it again", async () => {
    mockMe.id = 'friend';
    await open();
    await screen.findByTestId('stop-2');
    for (const id of ['trip-recap', 'plan-again', 'map-offer', 'rate-3', 'verdict-2'])
      expect(screen.queryByTestId(id, { includeHiddenElements: true })).toBeNull();
    expect(screen.getByTestId('plan-kept')).toHaveTextContent('The plan is kept as it was.');
    expect(api.review).not.toHaveBeenCalled();
  });

  it('a finished trip without a plan says so, with no way to build one', async () => {
    await open({ status: 'draft' }, REVIEW(null, []), []);
    expect(await screen.findByTestId('plan-empty')).toHaveTextContent('No plan was made for this trip.');
    expect(screen.queryByTestId('build-plan')).toBeNull();
    expect(screen.getByTestId('trip-recap-numbers')).toHaveTextContent(/^2days$/);
  });
});

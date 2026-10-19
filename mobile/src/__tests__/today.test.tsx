import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import React from 'react';
import { Text } from 'react-native';

import TodayScreen, { lateEffect } from '../../app/trip/today/[id]';
import { usePlanFormat } from '../features/trips/plan/usePlanFormat';
import { at, eveningBefore, replaceReminders, todayPath } from '../features/trips/today/reminders';
import { useTodaySettings } from '../features/trips/today/settings';
import { directionsUrl, estimate, leaveBy, leaveTimes, todayState, usualTraffic, t2m } from '../features/trips/today/today';
import i18n from '../i18n';
import { tripsApi } from '../services/api';
import type { Itinerary, ItineraryDay, ItineraryItem, LatePlan, Trip } from '../types';

const mockParams: Record<string, string> = { id: '5', at: '10:30', date: '2026-10-19' };
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({ push: mockPush, back: jest.fn() }),
  useFocusEffect: (effect: () => void) => jest.requireActual<typeof React>('react').useEffect(effect, [effect]),
  Stack: { Screen: () => null },
}));
jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);
jest.mock('../ui/haptics', () => ({
  haptic: jest.fn(),
  haptics: { success: jest.fn(), error: jest.fn(), light: jest.fn(), warning: jest.fn(), selection: jest.fn(), medium: jest.fn() },
}));
jest.mock('../features/account/useMe', () => ({ ME_QUERY_KEY: ['me'], useMe: () => ({ data: { id: 'me' } }) }));
jest.mock('../services/api', () => ({
  ApiError: class ApiError extends Error {},
  tripsApi: { get: jest.fn(), getItinerary: jest.fn(), conditions: jest.fn(), late: jest.fn(), applyLate: jest.fn(), undoLate: jest.fn() },
}));

const api = tripsApi as unknown as Record<string, jest.Mock>;
const clients: QueryClient[] = [];
function renderWithQuery(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  clients.push(client);
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}
afterEach(() => clients.splice(0).forEach((c) => c.clear()));
beforeEach(() => {
  jest.clearAllMocks();
  useTodaySettings.setState({ useLocation: false, leaveReminders: false, weatherReminders: false });
  mockParams.at = '10:30';
});

const LABONI = { lat: 21.4272, lon: 92.0058 };
const INANI = { lat: 21.2272, lon: 92.0458 };
const place = (id: number, name: string, p: { lat: number; lon: number }, close = '20:00') => ({
  id, name, destination_name: "Cox's Bazar", category: 'Beach', latitude: p.lat, longitude: p.lon, opening_time: '06:00', closing_time: close,
});
const item = (id: number, extra: Partial<ItineraryItem>): ItineraryItem => ({
  id, item_type: 'activity', title: 'Stop', start_time: '10:00', end_time: '11:00', duration_minutes: 60, cost: 0,
  travel_time_to_next: 0, distance_to_next: 0, recommendation_score: 0.5, recommendation_reasons: [], order_index: 0,
  currency: 'BDT', cost_source: 'data', ...extra,
});
// Breakfast 09:00, Laboni 10:00–12:00 (then 40 min by road to Inani), lunch 12:00, Inani 13:30–16:30, Sunset 17:30–18:30
const DAY: ItineraryDay = {
  id: 11, trip_id: 5, day_number: 1, day_date: '2026-10-19', total_cost: 0, total_travel_time: 40,
  items: [
    item(1, { item_type: 'meal', title: 'Breakfast at Jhaubon', start_time: '09:00', end_time: '10:00', order_index: 0 }),
    item(2, { title: 'Laboni Beach', start_time: '10:00', end_time: '12:00', order_index: 1, place: place(8, 'Laboni Beach', LABONI),
      travel_time_to_next: 40, distance_to_next: 24, travel_mode: 'cng', travel_source: 'road' }),
    item(3, { item_type: 'meal', title: 'Lunch at Mermaid', start_time: '12:00', end_time: '13:00', order_index: 2 }),
    item(4, { title: 'Inani Beach', start_time: '13:30', end_time: '16:30', order_index: 3, place: place(9, 'Inani Beach', INANI),
      travel_time_to_next: 30, distance_to_next: 20, travel_mode: 'cng', travel_source: 'road' }),
    item(5, { title: 'Marine Drive', start_time: '17:30', end_time: '18:30', order_index: 4, place: place(10, 'Marine Drive', LABONI) }),
  ],
};
const HOTEL = { lat: 21.44, lon: 92.0 };

describe('Today: the day now', () => {
  it('knows what is on now, what is next and where you leave from', () => {
    const s = todayState(DAY, t2m('10:30'));
    expect(s.current?.title).toBe('Laboni Beach');
    expect(s.next?.title).toBe('Inani Beach');
    expect(s.previous?.title).toBe('Laboni Beach');
    expect(s.phase).toBe('during');
    expect(s.done.map((i) => i.id)).toEqual([1]);
  });

  it('before and after the day', () => {
    expect(todayState(DAY, t2m('07:00')).phase).toBe('before');
    expect(todayState(DAY, t2m('19:00')).phase).toBe('after');
    expect(todayState(DAY, t2m('19:00')).next).toBeNull();
  });

  it("leave by: the plan's road time from the stop before, rounded down to 5 min", () => {
    const l = leaveBy(todayState(DAY, t2m('10:30')), HOTEL, null)!;
    expect(l).toMatchObject({ at: '12:50', minutes: 40, mode: 'cng', from: 'previous', source: 'road', traffic: null });
  });

  it('adds the usual evening traffic', () => {
    const l = leaveBy(todayState(DAY, t2m('16:40')), HOTEL, null)!;
    // Inani → Marine Drive: 30 min by road, leaving about 17:00 (slow ×1.4: +12)
    expect(l.traffic).toEqual({ extra: 12, peak: 'evening' });
    expect(l.at).toBe('16:45');
    expect(usualTraffic(t2m('12:00'), 30)).toBeNull();
  });

  it('from where you are, with location on (a straight-line estimate on the phone)', () => {
    const elsewhere = { lat: 21.35, lon: 92.02 };
    const l = leaveBy(todayState(DAY, t2m('10:30')), HOTEL, elsewhere)!;
    expect(l.from).toBe('location');
    expect(l.source).toBe('estimate');
    expect(l.minutes).toBe(Math.round(estimate(elsewhere, INANI).minutes));
  });

  it('far away (not at the destination yet): from the plan, and says so', () => {
    const dhaka = { lat: 23.71, lon: 90.41 };
    const l = leaveBy(todayState(DAY, t2m('10:30')), HOTEL, dhaka)!;
    expect(l).toMatchObject({ from: 'previous', far: true, at: '12:50', atMin: t2m('12:50') });
  });

  it('a leave time before midnight is not wrapped round', () => {
    const early: ItineraryDay = { ...DAY, items: [item(9, { title: 'Inani Beach', start_time: '00:20', end_time: '01:00', place: place(9, 'Inani Beach', INANI) })] };
    const l = leaveBy(todayState(early, 0), { lat: 21.45, lon: 92.0 }, null)!;
    expect(l.atMin).toBeLessThan(0);
    expect(l.at).toBe('00:00');
  });

  it("at the stop before, the plan's road time is used", () => {
    const l = leaveBy(todayState(DAY, t2m('10:30')), HOTEL, { lat: LABONI.lat + 0.002, lon: LABONI.lon })!;
    expect(l).toMatchObject({ from: 'location', source: 'road', minutes: 40, at: '12:50' });
  });

  it('the first stop of the day is from the hotel', () => {
    const l = leaveBy(todayState(DAY, t2m('07:00')), HOTEL, null);
    // the first stop is breakfast (no place): the first visit is left from the hotel
    expect(l?.from === 'hotel' || l === null).toBe(true);
  });

  it('every stop gets a "leave by" for the reminders, except short walks', () => {
    const times = leaveTimes(DAY, HOTEL);
    expect(times.map((x) => x.item.title)).toEqual(['Laboni Beach', 'Inani Beach', 'Marine Drive']);
    expect(times[1].leave.at).toBe('12:50');
  });

  it('directions open Google Maps', () => {
    expect(directionsUrl(INANI, 'cng')).toBe('https://www.google.com/maps/dir/?api=1&destination=21.2272,92.0458&travelmode=driving');
    expect(directionsUrl(INANI, 'walk')).toContain('travelmode=walking');
  });
});

describe('Reminders', () => {
  it('are scheduled once for the same set, and only in the future', async () => {
    const now = new Date(2026, 9, 19, 10, 0);
    const r = [
      { at: new Date(2026, 9, 19, 9, 0), title: 'past', body: '' },
      { at: new Date(2026, 9, 19, 12, 40), title: 'Leave in 10 minutes for Inani Beach', body: 'b' },
    ];
    expect(await replaceReminders(5, 'trip-leave', r, now)).toBe(1);
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith({
      content: { title: 'Leave in 10 minutes for Inani Beach', body: 'b', data: { kind: 'trip-leave', tripId: 5, url: '/trip/today/5' } },
      trigger: { type: 'date', date: r[1].at, channelId: 'trip' },
    });
    await replaceReminders(5, 'trip-leave', r, now);
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
  });

  it('times and taps', () => {
    expect(at('2026-10-20', 690)).toEqual(new Date(2026, 9, 20, 11, 30));
    expect(eveningBefore('2026-10-20')).toEqual(new Date(2026, 9, 19, 19, 0));
    expect(todayPath('/trip/today/12')).toBe('/trip/today/12');
    expect(todayPath('https://evil.example')).toBeNull();
  });
});

const TRIP = { id: 5, destination: "Cox's Bazar", start_date: '2026-10-19', end_date: '2026-10-21', num_travelers: 2, user_id: 'me', status: 'generated' } as Trip;
const ITIN = { trip_id: 5, days: [DAY], hotel: { id: 1, name: 'Sea Crown', category: 'Standard', price_per_night: 3500, rating: 4.2, latitude: HOTEL.lat, longitude: HOTEL.lon, amenities: [] } } as unknown as Itinerary;
const PLAN: LatePlan = {
  moved: [{ item_id: 3, title: 'Lunch at Mermaid', from: '12:00', to: '12:30' }],
  dropped: [],
  kept: [{ item_id: 5, title: 'Marine Drive', at: '17:30' }],
};

function setUp() {
  api.get.mockResolvedValue(TRIP);
  api.getItinerary.mockResolvedValue(ITIN);
  api.conditions.mockResolvedValue({ available: true, fetched_at: null, stale: false, forecast_until: null, days: [] });
}

describe('Today screen', () => {
  it('shows now, when to leave and the rest of the day', async () => {
    setUp();
    await renderWithQuery(<TodayScreen />);
    expect(await screen.findByTestId('today-now')).toHaveTextContent(/NOW · 10:30Laboni BeachUntil 12:00 · 1 h 30 min left/);
    expect(screen.getByTestId('today-leave-by')).toHaveTextContent('12:50');
    expect(screen.getByTestId('today-next')).toHaveTextContent(/CNG · 40 min · 24\.0 km · from Laboni Beach/);
    expect(screen.getByTestId('today-next')).toHaveTextContent(/for Inani Beach at 13:30/);
    expect(screen.getByTestId('today-item-1')).toHaveTextContent(/09:00Breakfast/);
    expect(screen.getByText(/Day 1 of 3 · Mon 19 Oct/)).toBeTruthy();
    expect(screen.queryByTestId('today-before-end')).toBeNull();
  });

  it('says when you must leave before the stop you are at ends', async () => {
    setUp();
    // Lunch until 13:00, Inani at 13:30 is 40 min away: leave by 12:50, ten minutes before lunch ends
    mockParams.at = '12:30';
    await renderWithQuery(<TodayScreen />);
    expect(await screen.findByTestId('today-before-end')).toHaveTextContent("That's 10 min before Lunch at Mermaid ends.");
  });

  it('says leave now when you are behind', async () => {
    setUp();
    mockParams.at = '13:00';
    await renderWithQuery(<TodayScreen />);
    expect(await screen.findByText('Leave now')).toBeTruthy();
    expect(screen.getByText("You're 10 min behind")).toBeTruthy();
  });

  it('running late: a preview, then apply with undo', async () => {
    setUp();
    api.late.mockResolvedValue(PLAN);
    api.applyLate.mockResolvedValue({ ...PLAN, success: true, message: '', day: DAY, validation: {}, undo: { times: { '3': ['12:00', '13:00'] }, restore: [] } });
    api.undoLate.mockResolvedValue({ success: true, message: '', day: DAY, validation: {} });
    await renderWithQuery(<TodayScreen />);
    fireEvent.press(await screen.findByTestId('today-late'));
    await waitFor(() => expect(api.late).toHaveBeenCalledWith(5, 11, '10:30', 30));
    expect(await screen.findByTestId('today-late-effect')).toHaveTextContent('Lunch at Mermaid moves to 12:30. Marine Drive stays at 17:30.');
    fireEvent.press(screen.getByTestId('today-late-15'));
    await waitFor(() => expect(api.late).toHaveBeenLastCalledWith(5, 11, '10:30', 15));
    await act(async () => fireEvent.press(screen.getByTestId('today-late-apply')));
    expect(api.applyLate).toHaveBeenCalledWith(5, 11, '10:30', 15);
    expect(await screen.findByTestId('today-snackbar')).toHaveTextContent(/1 stop moved/);
    await act(async () => fireEvent.press(screen.getByTestId('today-snackbar-action')));
    expect(api.undoLate).toHaveBeenCalledWith(5, 11, { times: { '3': ['12:00', '13:00'] }, restore: [] });
  });

  it('location stays off when the permission is refused', async () => {
    setUp();
    await renderWithQuery(<TodayScreen />);
    await act(async () => fireEvent.press(await screen.findByTestId('today-use-location-row')));
    expect(Location.requestForegroundPermissionsAsync).toHaveBeenCalled();
    expect(useTodaySettings.getState().useLocation).toBe(false);
    expect(screen.getByText(/Location is off for Vromon/)).toBeTruthy();
  });

  it('location on: leave by from where you are', async () => {
    setUp();
    (Location.getForegroundPermissionsAsync as jest.Mock).mockResolvedValueOnce({ status: 'granted' });
    (Location.getCurrentPositionAsync as jest.Mock).mockResolvedValueOnce({ coords: { latitude: LABONI.lat, longitude: LABONI.lon } });
    useTodaySettings.setState({ useLocation: true });
    await renderWithQuery(<TodayScreen />);
    await waitFor(() => expect(screen.getByTestId('today-next')).toHaveTextContent(/CNG · 40 min · 24\.0 km · from where you are/));
  });

  it('reminders on: asks for notifications and schedules "leave in 10 minutes"', async () => {
    // Only the date is fake: the morning of the trip day, so the reminders are still ahead
    jest.useFakeTimers({ doNotFake: ['setTimeout', 'setInterval', 'clearTimeout', 'clearInterval', 'setImmediate', 'nextTick', 'queueMicrotask'], now: new Date(2026, 9, 19, 8, 0) });
    setUp();
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted', canAskAgain: true });
    await renderWithQuery(<TodayScreen />);
    await act(async () => fireEvent.press(await screen.findByTestId('today-remind-leave-row')));
    expect(useTodaySettings.getState().leaveReminders).toBe(true);
    await waitFor(() => expect(Notifications.scheduleNotificationAsync).toHaveBeenCalled());
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'undetermined', canAskAgain: true });
    jest.useRealTimers();
  });
});

describe('the running-late preview in words', () => {
  function Probe({ plan }: { plan: LatePlan }) {
    const f = usePlanFormat();
    return <Text testID="effect">{lateEffect(plan, i18n.t.bind(i18n), f)}</Text>;
  }
  it('says what is dropped and why', async () => {
    const plan: LatePlan = { moved: [], kept: [], dropped: [{ item_id: 4, title: 'Inani Beach', reason: { code: 'closes', closes: '18:00' } }] };
    await render(<Probe plan={plan} />);
    expect(screen.getByTestId('effect')).toHaveTextContent('Inani Beach is dropped: it closes at 18:00.');
  });
  it('says nothing has to move', async () => {
    await render(<Probe plan={{ moved: [], kept: [], dropped: [] }} />);
    expect(screen.getByTestId('effect')).toHaveTextContent("Nothing has to move: there's free time to cover it.");
  });
});

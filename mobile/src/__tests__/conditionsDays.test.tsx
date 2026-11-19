/**
 * Conditions before, on and after the trip (docs/ui-refresh step 17, frames 34–36): what a day says, worked
 * out from the server's answer and the phone's clock; the screen on a trip day at 11:30 (now, the next
 * hours, the rest of today, the stops still to come, tomorrow, the reminder); a day that's over; a day
 * too early; one too old; offline; and reading one hour off "By the hour" with a finger.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import ConditionsScreen from '../../app/trip/conditions/[id]';
import { dayState, dayWhen, dayWords, dryFor, nextHours, nextRain, peakRain, weatherNow } from '../features/trips/conditions/dayView';
import { useTodaySettings } from '../features/trips/today/settings';
import '../i18n';
import { tripsApi } from '../services/api';
import type { ConditionsDay, Itinerary, ItineraryDay, ItineraryItem, Trip, TripConditions } from '../types';

let mockParams: Record<string, string> = { id: '5' };
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => mockParams,
  Stack: { Screen: ({ options }: { options?: { headerRight?: () => React.ReactNode } }) => options?.headerRight?.() ?? null },
}));
jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);
jest.mock('../ui/haptics', () => ({
  haptic: jest.fn(),
  haptics: { success: jest.fn(), error: jest.fn(), light: jest.fn(), warning: jest.fn(), selection: jest.fn(), medium: jest.fn() },
}));
jest.mock('../features/account/useMe', () => ({ ME_QUERY_KEY: ['me'], useMe: () => ({ data: { id: 'me' } }) }));
jest.mock('../features/trips/today/reminders', () => ({ allowNotifications: jest.fn(async () => true) }));
jest.mock('../services/api', () => ({
  ApiError: class ApiError extends Error {},
  tripsApi: { get: jest.fn(), getItinerary: jest.fn(), conditions: jest.fn(), moveItem: jest.fn(), keepWarning: jest.fn() },
}));

const api = tripsApi as unknown as Record<string, jest.Mock>;
const clients: QueryClient[] = [];
async function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  clients.push(client);
  await render(
    <QueryClientProvider client={client}>
      <ConditionsScreen />
    </QueryClientProvider>,
  );
}
afterEach(() => clients.splice(0).forEach((c) => c.clear()));
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
const at = (when: Date) => jest.useFakeTimers({ doNotFake: [...REAL_TIMERS], now: when });
afterEach(() => jest.useRealTimers());
beforeEach(() => {
  jest.clearAllMocks();
  mockParams = { id: '5' };
  useTodaySettings.setState({ weatherReminders: false });
});

// Frame 35's trip: Cox's Bazar, Fri 20 – Sun 22 Nov 2026, seen at 11:30 on Saturday
const item = (id: number, title: string, start: string, end: string, meal = false): ItineraryItem => ({
  id,
  item_type: meal ? 'meal' : 'activity',
  title,
  start_time: start,
  end_time: end,
  duration_minutes: 60,
  cost: 0,
  travel_time_to_next: 0,
  distance_to_next: 0,
  recommendation_score: 0.5,
  recommendation_reasons: [],
  order_index: id,
  currency: 'BDT',
  cost_source: 'data',
});
const DAY2: ItineraryDay = {
  id: 22,
  trip_id: 5,
  day_number: 2,
  day_date: '2026-11-21',
  total_cost: 0,
  total_travel_time: 0,
  items: [
    item(1, 'Breakfast · Handi', '08:00', '09:00', true),
    item(2, 'Sugandha Beach', '09:15', '10:30'),
    item(3, 'Himchari National Park', '11:05', '12:35'),
    item(4, 'Lunch · Mermaid Café', '13:00', '14:00', true),
    item(5, 'Inani Beach', '15:30', '17:00'),
  ],
};
const ITIN = {
  trip_id: 5,
  destination: "Cox's Bazar",
  days: [{ ...DAY2, id: 21, day_number: 1, day_date: '2026-11-20', items: [] }, DAY2, { ...DAY2, id: 23, day_number: 3, day_date: '2026-11-22', items: [] }],
} as unknown as Itinerary;
const TRIP = { id: 5, destination: "Cox's Bazar", start_date: '2026-11-20', end_date: '2026-11-22', user_id: 'me' } as Trip;

const hours = (rainAt: (h: number) => number) =>
  Array.from({ length: 18 }, (_, i) => i + 5).map((h) => ({
    time: `${String(h).padStart(2, '0')}:00`,
    temp: h < 9 ? 23 : h < 14 ? 29 : h < 18 ? 27 : 24,
    rain: rainAt(h),
    code: rainAt(h) >= 60 ? 61 : 2,
  }));
const base = (over: Partial<ConditionsDay>): ConditionsDay => ({
  day_id: 0,
  day_number: 0,
  date: null,
  in_forecast: true,
  sunrise: '06:03',
  sunset: '17:08',
  temp_max: 29,
  temp_min: 23,
  rain_max: 70,
  code: 2,
  hours: [],
  sea: null,
  items: {},
  legs: {},
  warnings: [],
  checks: [],
  ...over,
});
const FRI = base({ day_id: 21, day_number: 1, date: '2026-11-20', when: 'past', recorded: true, rain_mm: 0, temp_max: 31, temp_min: 24, code: 0 });
const SAT = base({
  day_id: 22,
  day_number: 2,
  date: '2026-11-21',
  when: 'today',
  hours: hours((h) => (h === 15 || h === 16 ? 70 : h >= 12 && h <= 14 ? 10 + (h - 11) * 10 : 10)),
  sea: { place: 'Sugandha Beach', wave: 0.4, level: 'calm' },
  items: { '4': { temp: 29, rain: 30, code: 2 }, '5': { temp: 27, rain: 70, code: 61 } },
  warnings: [
    {
      key: 'rain:2',
      code: 'rain',
      item_id: 2,
      place: 'Sugandha Beach',
      stop_number: 2,
      kept: false,
      source: 'weather',
      from: '09:00',
      to: '10:00',
      chance: 65,
      move_to: null,
    },
    {
      key: 'rain:5',
      code: 'rain',
      item_id: 5,
      place: 'Inani Beach',
      stop_number: 5,
      kept: false,
      source: 'weather',
      from: '15:00',
      to: '17:00',
      chance: 70,
      move_to: { day_id: 23, day_number: 3, date: '2026-11-22' },
    },
  ],
});
const SUN = base({ day_id: 23, day_number: 3, date: '2026-11-22', when: 'coming', temp_max: 30, temp_min: 23, code: 0, hours: hours(() => 5) });
const COND: TripConditions = {
  available: true,
  fetched_at: new Date(2026, 10, 21, 11, 28).toISOString(),
  stale: false,
  forecast_until: '2026-12-04',
  now: { time: '11:30', temp: 29, code: 2 },
  today: '2026-11-21',
  days: [FRI, SAT, SUN],
};

function setUp(conditions: TripConditions = COND) {
  api.get.mockResolvedValue(TRIP);
  api.getItinerary.mockResolvedValue(ITIN);
  api.conditions.mockResolvedValue(conditions);
}

describe('what a day says (the rules)', () => {
  it('over, today or to come, by the phone’s date', () => {
    expect(dayWhen({ date: '2026-11-20' }, '2026-11-21')).toBe('past');
    expect(dayWhen({ date: '2026-11-21' }, '2026-11-21')).toBe('today');
    expect(dayWhen({ date: '2026-11-22', when: 'today' }, '2026-11-21')).toBe('coming');
    expect(dayState(FRI, 'past')).toBe('recorded');
    expect(dayState({ ...FRI, recorded: false, in_forecast: false, temp_max: null }, 'past')).toBe('notKept');
    expect(dayState({ ...SUN, in_forecast: false, opens_on: '2026-11-07' }, 'coming')).toBe('later');
    expect(dayState({ ...SUN, in_forecast: false }, 'coming')).toBe('none');
  });

  it('the day in words and its highest chance of rain', () => {
    expect(dayWords(SAT)).toBe('rainPart.afternoon');
    expect(dayWords(SUN)).toBe('sky.partly');
    expect(dayWords({ ...SUN, hours: [{ time: '18:00', temp: 25, rain: 80, code: 95 }] })).toBe('stormsDay');
    expect(dayWords({ ...SUN, hours: hours((h) => (h === 8 || h === 19 ? 80 : 0)) })).toBe('rainOnOff');
    expect(peakRain(SAT)).toEqual({ chance: 70, at: '15:00' });
  });

  it('today: the next rain, how long it stays dry, the next hours, the weather now', () => {
    const now = 11 * 60 + 30;
    expect(nextRain(SAT, now)).toEqual({ at: '15:00', chance: 70, now: false });
    expect(dryFor(SAT, now)).toBe(210);
    expect(dryFor(SAT, 15 * 60 + 10)).toBe(0);
    expect(dryFor(SUN, now)).toBeNull();
    expect(nextHours(SAT, now).map((h) => h.time)).toEqual(['11:00', '12:00', '13:00', '14:00', '15:00', '16:00']);
    expect(weatherNow(COND, SAT, now)).toEqual({ temp: 29, code: 2, live: true });
    // The service's own is two hours old by 13:40: this hour's forecast instead
    expect(weatherNow(COND, SAT, 13 * 60 + 40)).toEqual({ temp: 29, code: 2, live: false });
  });
});

describe('on a trip day (frame 35)', () => {
  beforeEach(() => at(new Date(2026, 10, 21, 11, 30)));

  it('now, the next rain, how long it stays dry, the next hours', async () => {
    setUp();
    await show();
    expect(await screen.findByText('NOW · 11:30')).toBeTruthy();
    expect(screen.getByTestId('cond-now-temp')).toHaveTextContent('29°');
    expect(screen.getByText('High 29° · low 23°')).toBeTruthy();
    expect(screen.getByText('Rain likely from 15:00 (70%)')).toBeTruthy();
    expect(screen.getByText('3 h 30 min')).toBeTruthy();
    expect(screen.getByText('Calm · 0.4 m')).toBeTruthy();
    // The strip: Friday done, today, Sunday; today has something to know
    expect(screen.getByTestId('cond-day-1')).toHaveTextContent(/Fri 20 · done/);
    expect(screen.getByTestId('cond-day-2')).toHaveTextContent(/Today/);
    expect(screen.getByTestId('cond-day-2').props.accessibilityState).toMatchObject({ selected: true });
    expect(screen.getByTestId('cond-day-mark-2')).toBeTruthy();
    expect(screen.getByTestId('cond-day-1').props.accessibilityLabel).toBe('Day 1, Friday 20, Done, As it was: Clear, 31 to 24 degrees');
    // The next hours: now and the five after it
    expect(screen.getByLabelText('Now: Partly cloudy, 29°, 10% chance of rain')).toBeTruthy();
    expect(screen.getByLabelText('15:00: Rain, 27°, 70% chance of rain')).toBeTruthy();
  });

  it('for the rest of today: only what is still to come, with "Move to tomorrow"', async () => {
    setUp();
    api.moveItem.mockResolvedValue({ success: true });
    await show();
    expect(await screen.findByText('For the rest of today')).toBeTruthy();
    // Sugandha's rain was this morning: stop 2 is done
    expect(screen.queryByText('Rain likely 09:00–10:00 (65%)')).toBeNull();
    expect(screen.getByText('Rain likely 15:00–17:00 (70%)')).toBeTruthy();
    expect(screen.getByText('Affects stop 5, Inani Beach, which is outdoors. Tomorrow is dry at that time.')).toBeTruthy();
    await act(async () => fireEvent.press(screen.getByText('Move to tomorrow')));
    await waitFor(() => expect(api.moveItem).toHaveBeenCalledWith(5, 5, 23));
  });

  it('the stops still to come, what is done, tomorrow, and the reminder', async () => {
    setUp();
    await show();
    expect(await screen.findByText('At the stops still to come')).toBeTruthy();
    expect(screen.getByLabelText('13:00, Lunch · Mermaid Café: Partly cloudy, 29°, 30% chance of rain')).toBeTruthy();
    expect(screen.getByLabelText('15:30, Inani Beach: Rain, 27°, 70% chance of rain')).toBeTruthy();
    expect(screen.getByText("Stops 1 and 2 are done. You're at stop 3 now.")).toBeTruthy();
    // No "By the hour" or "Also checked" on a trip day: now and the next hours instead
    expect(screen.queryByText('By the hour')).toBeNull();
    // The evening-before reminder: the same setting as Today's
    await act(async () => fireEvent.press(screen.getByTestId('cond-remind-weather-row')));
    expect(useTodaySettings.getState().weatherReminders).toBe(true);
    // Tomorrow opens that day
    expect(screen.getByText('Tomorrow · Sun 22')).toBeTruthy();
    expect(screen.getByText('30° / 23° · clear · no warnings')).toBeTruthy();
    await act(async () => fireEvent.press(screen.getByTestId('cond-tomorrow')));
    expect(screen.getByText('DAY 3 · SUN 22 NOV')).toBeTruthy();
    expect(screen.getByTestId('cond-day-3').props.accessibilityState).toMatchObject({ selected: true });
  });

  it('a day that is over: as it was, with no warnings (frame 36)', async () => {
    setUp();
    mockParams = { id: '5', day: '1' };
    await show();
    expect(await screen.findByText('DAY 1 · FRI 20 NOV · AS IT WAS')).toBeTruthy();
    // The high on the hero card (and on Friday's card in the strip)
    expect(screen.getAllByText('31°')).toHaveLength(2);
    expect(screen.getByText('Clear')).toBeTruthy();
    expect(screen.getByText('Low 24° · no rain')).toBeTruthy();
    expect(screen.getByText('Recorded weather from Open-Meteo. Days that are over have no warnings.')).toBeTruthy();
    expect(screen.queryByText(/things? to know/)).toBeNull();
    expect(screen.queryByText("Vromon warns you using the data above. It can't promise that a place or a road is safe.")).toBeNull();
  });

  it('rain that fell on a day that is over', async () => {
    setUp({ ...COND, days: [{ ...FRI, rain_mm: 12.8, code: 61 }, SAT, SUN] });
    mockParams = { id: '5', day: '1' };
    await show();
    expect(await screen.findByText('Low 24° · 13 mm of rain')).toBeTruthy();
  });

  it('offline: the last copy, its age, and Try again', async () => {
    setUp({ ...COND, stale: true, fetched_at: new Date(2026, 10, 21, 9, 30).toISOString() });
    await show();
    expect(await screen.findByText('Offline')).toBeTruthy();
    expect(screen.getByText('Showing the forecast from 2 h ago')).toBeTruthy();
    await act(async () => fireEvent.press(screen.getByTestId('cond-retry')));
    await waitFor(() => expect(api.conditions).toHaveBeenCalledWith(5, true));
  });

  it('no connection: a refresh that cannot reach Vromon keeps the last copy, said so', async () => {
    setUp();
    await show();
    expect(await screen.findByText('NOW · 11:30')).toBeTruthy();
    expect(screen.queryByTestId('cond-offline')).toBeNull();
    api.conditions.mockRejectedValueOnce(new Error('Network Error'));
    await act(async () => fireEvent.press(screen.getByTestId('conditions-refresh')));
    expect(await screen.findByText('Offline')).toBeTruthy();
    expect(screen.getByText('Showing the forecast from 2 min ago')).toBeTruthy();
    expect(screen.getByText('NOW · 11:30')).toBeTruthy();
    // Back online: Try again
    await act(async () => fireEvent.press(screen.getByTestId('cond-retry')));
    await waitFor(() => expect(screen.queryByTestId('cond-offline')).toBeNull());
  });
});

describe('before the trip (frames 34 and 36)', () => {
  it('too early: when the forecast opens, with the sun from the date', async () => {
    at(new Date(2026, 9, 20, 10, 0));
    setUp({
      ...COND,
      now: null,
      days: [
        { ...SUN, day_number: 1, date: '2026-11-20', when: 'coming', in_forecast: false, hours: [], opens_on: '2026-11-05', sunrise: '06:02', sunset: '17:09' },
      ],
    });
    await show();
    expect(await screen.findByText('The forecast opens on Thu 5 Nov')).toBeTruthy();
    expect(screen.getByText('Forecasts reach about two weeks ahead.')).toBeTruthy();
    expect(screen.getByText('06:02')).toBeTruthy();
    expect(screen.getByText('the date')).toBeTruthy();
    // No rain promised before the forecast reaches the day
    expect(screen.getByText('Nothing to know yet')).toBeTruthy();
    expect(screen.getByText('Warnings about rain, storms and the sea come with the forecast.')).toBeTruthy();
  });

  it('too old: the weather for the day is not kept', async () => {
    at(new Date(2026, 10, 21, 11, 30));
    setUp({ ...COND, days: [{ ...FRI, recorded: false, in_forecast: false, temp_max: null, temp_min: null, code: null }, SAT, SUN] });
    mockParams = { id: '5', day: '1' };
    await show();
    expect(await screen.findByText("The weather for this day isn't kept")).toBeTruthy();
  });

  it('by the hour: a finger reads one hour in the line above', async () => {
    at(new Date(2026, 10, 19, 10, 0));
    setUp({ ...COND, now: null, days: [FRI, { ...SAT, when: 'coming' }, SUN] });
    mockParams = { id: '5', day: '2' };
    await show();
    expect(await screen.findByText('Slide a finger along the hours to read one')).toBeTruthy();
    // 15:00 is 9 hours from 06:00 on a 326-wide figure: 14 + 9 × 18.6
    await act(async () => fireEvent(screen.getByTestId('cond-hours-touch'), 'responderGrant', { nativeEvent: { pageX: 182 } }));
    expect(screen.getByTestId('cond-hour-reading')).toHaveTextContent('15:00: Rain, 27°, 70% chance of rain');
    await act(async () => fireEvent(screen.getByTestId('cond-hours-touch'), 'responderMove', { nativeEvent: { pageX: 14 } }));
    expect(screen.getByTestId('cond-hour-reading')).toHaveTextContent('06:00: Partly cloudy, 23°, 10% chance of rain');
    // The highest chance is written over its column; the stops in the third strip
    expect(screen.getByLabelText('Chance of rain from 06:00 to 22:00: the highest is 70% at 15:00')).toBeTruthy();
    expect(screen.getByLabelText('Your stops on the same hours: 1 at 08:00, 2 at 09:15, 3 at 11:05, 4 at 13:00, 5 at 15:30')).toBeTruthy();
  });
});

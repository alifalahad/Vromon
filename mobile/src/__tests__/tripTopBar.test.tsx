/**
 * The trip screen's row over the map (docs/ui-refresh step 7): the weather button in its states, the
 * owner's and a friend's buttons, and the map options panel.
 */

import { act, fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import { MapOptions, TripTopBar, weatherLook, type WeatherLook } from '../features/trips/plan/TripTopBar';
import i18n from '../i18n';
import type { ConditionsDay, TripConditions } from '../types';

const NOW = Date.parse('2026-11-20T06:00:00Z');

const DAY: ConditionsDay = {
  day_id: 11,
  day_number: 1,
  date: '2026-11-20',
  in_forecast: true,
  sunrise: '06:10',
  sunset: '17:08',
  temp_max: 31,
  temp_min: 24,
  rain_max: 0,
  code: 0,
  hours: [],
  sea: null,
  items: {},
  legs: {},
  warnings: [],
  checks: [],
};
const COND = (over: Partial<TripConditions> = {}): TripConditions => ({
  available: true,
  fetched_at: new Date(NOW - 10 * 60_000).toISOString(),
  stale: false,
  forecast_until: '2026-11-28',
  days: [DAY],
  ...over,
});

const bar = async (look: WeatherLook, over: Partial<React.ComponentProps<typeof TripTopBar>> = {}) => {
  const props = { top: 0, look, dayNumber: 1, layersOpen: false, onWeather: jest.fn(), onLayers: jest.fn(), onFullMap: jest.fn(), onMore: jest.fn(), ...over };
  await render(<TripTopBar {...props} />);
  return { props };
};

beforeEach(async () => {
  await act(() => i18n.changeLanguage('en'));
});

// The phone's date and minute: before the trip, on its day at 11:30, after it
const BEFORE = { today: '2026-11-18', minute: 10 * 60 };
const ON = { today: '2026-11-20', minute: 11 * 60 + 30 };
const AFTER = { today: '2026-11-25', minute: 10 * 60 };
const RAINY = { ...DAY, hours: ['11:00', '12:00', '13:00', '14:00', '15:00', '16:00'].map((time, i) => ({ time, temp: 29 - (i > 3 ? 2 : 0), rain: i > 3 ? 70 : 10, code: i > 3 ? 61 : 2 })) };

describe('what the weather button says', () => {
  it('waits for the forecast, says when there is none yet, else the day', () => {
    expect(weatherLook(DAY, undefined, NOW, BEFORE)).toEqual({ kind: 'loading' });
    expect(weatherLook(DAY, COND({ available: false }), NOW, BEFORE)).toEqual({ kind: 'later', opensOn: null });
    expect(weatherLook({ ...DAY, in_forecast: false }, COND(), NOW, BEFORE)).toEqual({ kind: 'later', opensOn: null });
    expect(weatherLook(DAY, COND(), NOW, BEFORE)).toMatchObject({ kind: 'forecast', max: 31, min: 24, warnings: 0, old: false });
  });

  it('too early: the day its forecast opens (docs/ui-refresh step 17)', () => {
    expect(weatherLook({ ...DAY, in_forecast: false, opens_on: '2026-11-05' }, COND(), NOW, { today: '2026-10-20', minute: 600 })).toEqual({
      kind: 'later',
      opensOn: '2026-11-05',
    });
  });

  it("today's tab: the weather now and the next rain", () => {
    const look = weatherLook(RAINY, COND({ now: { time: '11:15', temp: 28, code: 2 } }), NOW, ON);
    expect(look).toMatchObject({ kind: 'now', temp: 28, code: 2, night: false, rain: { at: '15:00', now: false } });
    // Without the service's own, this hour's forecast
    expect(weatherLook(RAINY, COND(), NOW, ON)).toMatchObject({ kind: 'now', temp: 29, rain: { at: '15:00' } });
    // Dry for the rest of the day
    expect(weatherLook({ ...RAINY, hours: RAINY.hours.slice(0, 3) }, COND(), NOW, ON)).toMatchObject({ kind: 'now', rain: null });
  });

  it('a day that is over: as it was, or not kept', () => {
    expect(weatherLook({ ...DAY, recorded: true }, COND(), NOW, AFTER)).toEqual({ kind: 'recorded', code: 0, max: 31 });
    expect(weatherLook({ ...DAY, in_forecast: false, recorded: false, temp_max: null, temp_min: null }, COND(), NOW, AFTER)).toEqual({ kind: 'notKept' });
  });

  it('is quieter when the refresh failed or the forecast is hours old', () => {
    expect(weatherLook(DAY, COND({ stale: true }), NOW, BEFORE)).toMatchObject({ old: true });
    expect(weatherLook(DAY, COND({ fetched_at: new Date(NOW - 4 * 3600_000).toISOString() }), NOW, BEFORE)).toMatchObject({ old: true });
  });

  it('counts warnings still standing (not the ones kept anyway)', () => {
    const day = {
      ...DAY,
      warnings: [
        { code: 'storm', kept: false },
        { code: 'rough_sea', kept: true },
      ] as ConditionsDay['warnings'],
    };
    expect(weatherLook(day, COND(), NOW, BEFORE)).toMatchObject({ warnings: 1, serious: true });
  });
});

describe('the row', () => {
  it("the owner's row: the weather, map options, Full map and ⋮; no back arrow", async () => {
    const { props } = await bar(weatherLook(DAY, COND(), NOW, BEFORE));
    expect(screen.getByText('31°')).toBeTruthy();
    expect(screen.getByText('Clear')).toBeTruthy();
    expect(screen.getByText('Low 24°')).toBeTruthy();
    expect(screen.getByTestId('trip-weather').props.accessibilityLabel).toBe('Weather for Day 1: 31 degrees, Clear. Open the weather');
    expect(screen.queryByTestId('trip-back')).toBeNull();
    await fireEvent.press(screen.getByTestId('trip-weather'));
    expect(props.onWeather).toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('trip-layers'));
    expect(props.onLayers).toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('trip-full-map'));
    expect(props.onFullMap).toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('trip-menu'));
    expect(props.onMore).toHaveBeenCalled();
  });

  it("a friend's row has no ⋮; Full map is gone while in Full map", async () => {
    await bar(weatherLook(DAY, COND(), NOW, BEFORE), { onMore: undefined, onFullMap: undefined });
    expect(screen.queryByTestId('trip-menu')).toBeNull();
    expect(screen.queryByTestId('trip-full-map')).toBeNull();
    expect(screen.getByTestId('trip-layers')).toBeTruthy();
  });

  it('no forecast yet', async () => {
    await bar(weatherLook({ ...DAY, in_forecast: false }, COND(), NOW, BEFORE));
    expect(screen.getByText('Forecast later')).toBeTruthy();
    expect(screen.getByTestId('trip-weather').props.accessibilityLabel).toBe('Weather for Day 1: Forecast later. Open the weather');
  });

  it('offline: how old it is, instead of the low', async () => {
    await bar(weatherLook(DAY, COND({ stale: true, fetched_at: new Date(Date.now() - 2 * 3600_000).toISOString() }), NOW, BEFORE));
    expect(screen.getByTestId('trip-weather-second')).toHaveTextContent('2 h ago');
    expect(screen.queryByText('Low 24°')).toBeNull();
  });

  it('a warning: a mark on the sky, and said to screen readers', async () => {
    await bar(weatherLook({ ...DAY, warnings: [{ code: 'storm', kept: false }] as ConditionsDay['warnings'] }, COND(), NOW, BEFORE));
    expect(screen.getByTestId('trip-weather-warning')).toBeTruthy();
    expect(screen.getByTestId('trip-weather').props.accessibilityLabel).toContain('1 warning');
  });

  it("today's tab: Now, and when the rain starts (frame 31)", async () => {
    await bar(weatherLook(RAINY, COND({ now: { time: '11:15', temp: 28, code: 2 } }), NOW, ON));
    expect(screen.getByText('28°')).toBeTruthy();
    expect(screen.getByText('Now')).toBeTruthy();
    expect(screen.getByTestId('trip-weather-second')).toHaveTextContent('Rain from 15:00');
    expect(screen.getByTestId('trip-weather').props.accessibilityLabel).toBe('Weather now, Day 1: 28 degrees, Partly cloudy. Rain from 15:00. Open the weather');
  });

  it('a day that is over: as it was (frame 33)', async () => {
    await bar(weatherLook({ ...DAY, recorded: true }, COND(), NOW, AFTER));
    expect(screen.getByText('31°')).toBeTruthy();
    expect(screen.getByText('Clear')).toBeTruthy();
    expect(screen.getByTestId('trip-weather-second')).toHaveTextContent('As it was');
    expect(screen.getByTestId('trip-weather').props.accessibilityLabel).toBe('Weather for Day 1, as it was: 31 degrees, Clear. Open the weather');
  });

  it('too early: a calendar and the day the forecast opens; too old: not kept', async () => {
    await bar(weatherLook({ ...DAY, in_forecast: false, opens_on: '2026-11-05' }, COND(), NOW, { today: '2026-10-20', minute: 600 }));
    expect(screen.getByText('Forecast from 5 Nov')).toBeTruthy();
    expect(screen.getByTestId('sky-later', { includeHiddenElements: true })).toBeTruthy();
    await bar(weatherLook({ ...DAY, in_forecast: false, recorded: false, temp_max: null, temp_min: null }, COND(), NOW, AFTER));
    expect(screen.getByText('Not kept')).toBeTruthy();
  });

  it('the map options button says whether its panel is open', async () => {
    await bar(weatherLook(DAY, COND(), NOW, BEFORE), { layersOpen: true });
    expect(screen.getByTestId('trip-layers').props.accessibilityState).toMatchObject({ expanded: true });
    expect(screen.getByTestId('trip-layers').props.accessibilityLabel).toBe('Close map options');
  });
});

describe('the map options panel', () => {
  const panel = async (over: Partial<React.ComponentProps<typeof MapOptions>> = {}) => {
    const props = { top: 0, satellite: false, is3d: false, onSatellite: jest.fn(), on3d: jest.fn(), onShowDay: jest.fn(), onClose: jest.fn(), ...over };
    await render(<MapOptions {...props} />);
    return props;
  };

  it('picks the map type, 3D, and the whole day', async () => {
    const props = await panel();
    expect(screen.getByTestId('map-type-default').props.accessibilityState).toMatchObject({ selected: true });
    await fireEvent.press(screen.getByTestId('map-type-satellite'));
    expect(props.onSatellite).toHaveBeenCalledWith(true);
    await fireEvent(screen.getByTestId('map-3d', { includeHiddenElements: true }), 'valueChange', true);
    expect(props.on3d).toHaveBeenCalledWith(true);
    // The whole row switches it too
    await fireEvent.press(screen.getByTestId('map-3d-row'));
    expect(props.on3d).toHaveBeenLastCalledWith(true);
    await fireEvent.press(screen.getByTestId('map-show-day'));
    expect(props.onShowDay).toHaveBeenCalled();
  });

  it('shows what is on, and closes with a tap outside', async () => {
    const props = await panel({ satellite: true, is3d: true, onShowDay: undefined });
    expect(screen.getByTestId('map-type-satellite').props.accessibilityState).toMatchObject({ selected: true });
    expect(screen.getByTestId('map-3d', { includeHiddenElements: true }).props.value).toBe(true);
    expect(screen.getByTestId('map-3d-row').props.accessibilityState).toMatchObject({ checked: true });
    expect(screen.queryByTestId('map-show-day')).toBeNull();
    await fireEvent.press(screen.getByTestId('map-options-outside', { includeHiddenElements: true }));
    expect(props.onClose).toHaveBeenCalled();
  });
});

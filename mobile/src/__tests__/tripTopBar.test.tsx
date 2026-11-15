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

describe('what the weather button says', () => {
  it('waits for the forecast, says when there is none yet, else the day', () => {
    expect(weatherLook(DAY, undefined, NOW)).toEqual({ kind: 'loading' });
    expect(weatherLook(DAY, COND({ available: false }), NOW)).toEqual({ kind: 'later' });
    expect(weatherLook({ ...DAY, in_forecast: false }, COND(), NOW)).toEqual({ kind: 'later' });
    expect(weatherLook(DAY, COND(), NOW)).toMatchObject({ kind: 'forecast', max: 31, min: 24, warnings: 0, old: false });
  });

  it('is quieter when the refresh failed or the forecast is hours old', () => {
    expect(weatherLook(DAY, COND({ stale: true }), NOW)).toMatchObject({ old: true });
    expect(weatherLook(DAY, COND({ fetched_at: new Date(NOW - 4 * 3600_000).toISOString() }), NOW)).toMatchObject({ old: true });
  });

  it('counts warnings still standing (not the ones kept anyway)', () => {
    const day = {
      ...DAY,
      warnings: [
        { code: 'storm', kept: false },
        { code: 'rough_sea', kept: true },
      ] as ConditionsDay['warnings'],
    };
    expect(weatherLook(day, COND(), NOW)).toMatchObject({ warnings: 1, serious: true });
  });
});

describe('the row', () => {
  it("the owner's row: the weather, map options, Full map and ⋮; no back arrow", async () => {
    const { props } = await bar(weatherLook(DAY, COND(), NOW));
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
    await bar(weatherLook(DAY, COND(), NOW), { onMore: undefined, onFullMap: undefined });
    expect(screen.queryByTestId('trip-menu')).toBeNull();
    expect(screen.queryByTestId('trip-full-map')).toBeNull();
    expect(screen.getByTestId('trip-layers')).toBeTruthy();
  });

  it('no forecast yet', async () => {
    await bar(weatherLook({ ...DAY, in_forecast: false }, COND(), NOW));
    expect(screen.getByText('Forecast later')).toBeTruthy();
    expect(screen.getByTestId('trip-weather').props.accessibilityLabel).toBe('Weather for Day 1: Forecast later. Open the weather');
  });

  it('offline: how old it is, instead of the low', async () => {
    await bar(weatherLook(DAY, COND({ stale: true, fetched_at: new Date(Date.now() - 2 * 3600_000).toISOString() }), NOW));
    expect(screen.getByTestId('trip-weather-second')).toHaveTextContent('2 h ago');
    expect(screen.queryByText('Low 24°')).toBeNull();
  });

  it('a warning: a mark on the sky, and said to screen readers', async () => {
    await bar(weatherLook({ ...DAY, warnings: [{ code: 'storm', kept: false }] as ConditionsDay['warnings'] }, COND(), NOW));
    expect(screen.getByTestId('trip-weather-warning')).toBeTruthy();
    expect(screen.getByTestId('trip-weather').props.accessibilityLabel).toContain('1 warning');
  });

  it('the map options button says whether its panel is open', async () => {
    await bar(weatherLook(DAY, COND(), NOW), { layersOpen: true });
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

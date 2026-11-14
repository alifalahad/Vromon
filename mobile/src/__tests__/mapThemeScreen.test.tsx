import { fireEvent, render, screen, within } from '@testing-library/react-native';
import React from 'react';

import MapThemeScreen from '../../app/map/theme';
import { DEFAULT_PREFERENCES, usePreferences } from '../features/preferences/store';
import { selectTheme } from '../features/mapThemes/resolve';
import '../i18n';
import type { Visit } from '../types';

const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack }),
  // Render the header's Reset button so it can be pressed
  Stack: { Screen: ({ options }: { options?: { headerRight?: () => React.ReactNode } }) => (options?.headerRight ? options.headerRight() : null) },
}));
jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);
jest.mock('../ui/haptics', () => ({ haptic: jest.fn(), haptics: { success: jest.fn(), selection: jest.fn() } }));
jest.mock('../features/account/useMe', () => ({ useMe: () => ({ data: { id: 'u1', home_country_iso2: 'BD' } }) }));
let mockVisits: Visit[] = [];
jest.mock('../features/map/visits', () => ({ useVisits: () => ({ data: mockVisits }) }));
// The preview is a native MapLibre view: render what it was asked to draw instead
jest.mock('../features/mapThemes/ThemePreviewMap', () => {
  const { Text: MockText } = jest.requireActual('react-native');
  return {
    ThemePreviewMap: ({ theme, content }: { theme: { base: { land: string }; status: { visited: string } }; content: { mode: string } }) => (
      <MockText testID="preview-state">{`${content.mode} land=${theme.base.land} visited=${theme.status.visited}`}</MockText>
    ),
  };
});

const { haptic, haptics } = jest.requireMock('../ui/haptics') as { haptic: jest.Mock; haptics: { success: jest.Mock } };

const card = (catalog: string, id: string) => screen.getByTestId(`map-theme-card-${catalog}-${id}`);
const preview = () => screen.getByTestId('preview-state').props.children as string;

describe('Map Theme screen', () => {
  beforeEach(() => {
    usePreferences.setState({ ...DEFAULT_PREFERENCES });
    mockVisits = [];
    mockBack.mockClear();
    haptic.mockClear();
    haptics.success.mockClear();
  });

  it('one page: every theme, the colour sets and the styles, the applied theme selected', async () => {
    await render(<MapThemeScreen />);
    for (const id of ['default', 'midnight', 'serenity', 'rustic', 'classic']) expect(card('themes', id)).toBeTruthy();
    expect(card('themes', 'default').props.accessibilityState).toMatchObject({ selected: true });
    expect(card('colors', 'own').props.accessibilityState).toMatchObject({ selected: true });
    expect(card('colors', 'wonder')).toBeTruthy();
    expect(card('styles', 'own').props.accessibilityState).toMatchObject({ selected: true });
    expect(card('styles', 'pencil')).toBeTruthy();
    expect(screen.queryByText(/lock/i)).toBeNull(); // locks hidden (decision D2)
    // No marks yet: the preview is a labelled sample
    expect(screen.getByText('Sample places')).toBeTruthy();
  });

  it('previews a theme at once, with a selection haptic, without applying it', async () => {
    await render(<MapThemeScreen />);
    await fireEvent.press(card('themes', 'midnight'));
    expect(haptic).toHaveBeenCalledWith('selection');
    expect(card('themes', 'midnight').props.accessibilityState).toMatchObject({ selected: true });
    expect(preview()).toContain('visited=#866F43');
    expect(usePreferences.getState().mapTheme).toEqual(DEFAULT_PREFERENCES.mapTheme);
  });

  it('Apply saves the draft, fires a success haptic and returns to the map', async () => {
    await render(<MapThemeScreen />);
    await fireEvent.press(card('themes', 'rustic'));
    await fireEvent.press(screen.getByTestId('map-theme-apply'));
    expect(usePreferences.getState().mapTheme).toEqual(selectTheme('rustic'));
    expect(haptics.success).toHaveBeenCalled();
    expect(mockBack).toHaveBeenCalled();
  });

  it('a colour set after a theme becomes a Custom selection; its own colours again make it the theme', async () => {
    usePreferences.setState({ mapTheme: selectTheme('rustic') });
    await render(<MapThemeScreen />);
    await fireEvent.press(card('colors', 'wonder'));
    expect(preview()).toContain('land=#EEE9D6 visited=#3C87AE'); // Rustic's map, Wonder's colours
    expect(card('themes', 'rustic').props.accessibilityState).toMatchObject({ selected: false });
    await fireEvent.press(card('colors', 'own'));
    expect(card('themes', 'rustic').props.accessibilityState).toMatchObject({ selected: true });
    await fireEvent.press(card('colors', 'wonder'));
    await fireEvent.press(screen.getByTestId('map-theme-apply'));
    expect(usePreferences.getState().mapTheme).toEqual({ v: 1, styleId: 'theme:rustic', colorsId: 'wonder', compareId: 'rustic' });
  });

  it('a style keeps the colours and changes the land and water', async () => {
    await render(<MapThemeScreen />);
    await fireEvent.press(card('styles', 'sahara'));
    expect(preview()).toContain('land=#FAF6DD');
  });

  it('Reset goes back to Default; leaving without Apply changes nothing', async () => {
    usePreferences.setState({ mapTheme: selectTheme('rustic') });
    await render(<MapThemeScreen />);
    await fireEvent.press(screen.getByTestId('map-theme-reset'));
    expect(card('themes', 'default').props.accessibilityState).toMatchObject({ selected: true });
    expect(usePreferences.getState().mapTheme).toEqual(selectTheme('rustic'));
  });

  it('With a friend shows the comparison legend', async () => {
    await render(<MapThemeScreen />);
    await fireEvent.press(screen.getByTestId('map-theme-friend'));
    const legend = screen.getByTestId('map-theme-legend');
    for (const label of ['In common', 'You', 'Friend']) expect(within(legend).getByText(label)).toBeTruthy();
    expect(preview()).toMatch(/^friends/);
    expect(screen.getByText('Sample comparison')).toBeTruthy();
  });

  it('shows your own map (countries and divisions) instead of the sample', async () => {
    mockVisits = [
      { place_type: 'country', place_code: 'BD', status: 'visited', first_visited_on: null, last_visited_on: null, note: null, updated_at: '' },
      { place_type: 'region', place_code: 'BD-H', status: 'lived', first_visited_on: null, last_visited_on: null, note: null, updated_at: '' },
    ];
    await render(<MapThemeScreen />);
    expect(screen.queryByText('Sample places')).toBeNull();
    const legend = screen.getByTestId('map-theme-legend');
    for (const label of ['Visited', 'Lived', 'Want']) expect(within(legend).getByText(label)).toBeTruthy();
  });
});

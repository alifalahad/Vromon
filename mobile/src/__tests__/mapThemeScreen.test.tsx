import { fireEvent, render, screen, within } from '@testing-library/react-native';
import React from 'react';

import MapThemeScreen from '../../app/map/theme';
import { DEFAULT_PREFERENCES, usePreferences } from '../features/preferences/store';
import { selectTheme } from '../features/mapThemes/resolve';
import '../i18n';
import type { Visit } from '../types';

const mockBack = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ back: mockBack }) }));
jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);
jest.mock('../ui/haptics', () => ({ haptic: jest.fn(), haptics: { success: jest.fn(), selection: jest.fn() } }));
jest.mock('../features/account/useMe', () => ({ useMe: () => ({ data: { id: 'u1' } }) }));
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

  it('lists the four themes with the applied one selected', async () => {
    await render(<MapThemeScreen />);
    for (const id of ['default', 'midnight', 'serenity', 'rustic']) expect(card('themes', id)).toBeTruthy();
    expect(card('themes', 'default').props.accessibilityState).toMatchObject({ selected: true });
    // No visits yet: the preview is a labelled sample
    expect(screen.getByText('Sample places')).toBeTruthy();
  });

  it('previews a card at once, with a selection haptic, without applying it', async () => {
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

  it('a palette after a theme becomes a Custom selection', async () => {
    usePreferences.setState({ mapTheme: selectTheme('rustic') });
    await render(<MapThemeScreen />);
    await fireEvent.press(screen.getByTestId('map-theme-catalog-colors'));
    await fireEvent.press(card('colors', 'wonder'));
    expect(preview()).toContain('land=#EEE9D6 visited=#3C87AE'); // Rustic's map, Wonder's colours
    await fireEvent.press(screen.getByTestId('map-theme-apply'));
    expect(usePreferences.getState().mapTheme).toEqual({ v: 1, styleId: 'theme:rustic', colorsId: 'wonder', compareId: 'rustic' });
  });

  it('Friends shows the comparison legend', async () => {
    await render(<MapThemeScreen />);
    await fireEvent.press(screen.getByTestId('map-theme-mode-friends'));
    const legend = screen.getByTestId('map-theme-legend');
    for (const label of ['In common', 'You', 'Friend']) expect(within(legend).getByText(label)).toBeTruthy();
    expect(preview()).toMatch(/^friends/);
    expect(screen.getByText('Sample comparison')).toBeTruthy();
  });

  it('shows the user’s own countries instead of the sample', async () => {
    mockVisits = [
      { place_type: 'country', place_code: 'BD', status: 'visited', first_visited_on: null, last_visited_on: null, note: null, updated_at: '' },
    ];
    await render(<MapThemeScreen />);
    expect(screen.queryByText('Sample places')).toBeNull();
  });

  it('shows thumbnails for the styles', async () => {
    await render(<MapThemeScreen />);
    await fireEvent.press(screen.getByTestId('map-theme-catalog-styles'));
    expect(card('styles', 'pencil')).toBeTruthy();
    expect(screen.queryByText(/lock/i)).toBeNull(); // locks hidden (decision D2)
  });
});

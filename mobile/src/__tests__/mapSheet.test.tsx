import { act, fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import { MapSheet } from '../features/map/MapSheet';
import { DEFAULT_PREFERENCES, usePreferences } from '../features/preferences/store';
import i18n from '../i18n';

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);
jest.mock('../features/account/useMe', () => ({ useMe: () => ({ data: { id: 'u1', home_country_iso2: 'BD' } }) }));
// The theme pictures show your marks at home
jest.mock('../features/map/visits', () => ({ useVisits: () => ({ data: [] }) }));

const props = {
  open: true,
  onAllThemes: jest.fn(),
  onClose: jest.fn(),
};

beforeEach(async () => {
  jest.clearAllMocks();
  usePreferences.setState(DEFAULT_PREFERENCES);
  await act(() => i18n.changeLanguage('en'));
});

describe('Map sheet', () => {
  it('has no Countries / Divisions / Cities switch: the map follows its zoom', async () => {
    await render(<MapSheet {...props} />);
    expect(screen.queryByTestId('map-view')).toBeNull();
    expect(screen.queryByText('Divisions')).toBeNull();
  });

  it('applies a theme at once and stays open', async () => {
    await render(<MapSheet {...props} />);
    await fireEvent.press(screen.getByTestId('map-sheet-theme-rustic'));
    expect(usePreferences.getState().mapTheme.themeId).toBe('rustic');
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it('the layers are tiles that say whether they are on, and switch at once', async () => {
    await render(<MapSheet {...props} layers={['trails', 'plannable', 'friends']} />);
    const trails = screen.getByTestId('map-layer-trails');
    expect(trails.props.accessibilityRole).toBe('switch');
    expect(trails.props.accessibilityState).toMatchObject({ checked: usePreferences.getState().mapLayers.trails });
    const before = usePreferences.getState().mapLayers.friends;
    await fireEvent.press(screen.getByTestId('map-layer-friends'));
    expect(usePreferences.getState().mapLayers.friends).toBe(!before);
    // The state in words, not only by colour
    expect(screen.getAllByText(/^(On|Off)$/).length).toBe(3);
  });

  it('offers only the layers it is given (no Friends without friends)', async () => {
    await render(<MapSheet {...props} layers={['trails', 'plannable']} />);
    expect(screen.queryByTestId('map-layer-friends')).toBeNull();
  });

  it('has every theme in its line, Classic too, each a radio', async () => {
    await render(<MapSheet {...props} />);
    for (const id of ['default', 'midnight', 'serenity', 'rustic', 'classic']) {
      expect(screen.getByTestId(`map-sheet-theme-${id}`).props.accessibilityRole).toBe('radio');
    }
    expect(screen.getByTestId('map-sheet-theme-default').props.accessibilityState).toMatchObject({ selected: true });
  });

  it('opens all themes', async () => {
    await render(<MapSheet {...props} />);
    await fireEvent.press(screen.getByTestId('map-sheet-all-themes'));
    expect(props.onAllThemes).toHaveBeenCalled();
  });

  it('speaks Bangla', async () => {
    await act(() => i18n.changeLanguage('bn'));
    await render(<MapSheet {...props} />);
    expect(screen.getByText('সব থিম')).toBeTruthy();
  });
});

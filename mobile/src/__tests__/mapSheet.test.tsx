import { act, fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import { MapSheet } from '../features/map/MapSheet';
import { DEFAULT_PREFERENCES, usePreferences } from '../features/preferences/store';
import i18n from '../i18n';

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);

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

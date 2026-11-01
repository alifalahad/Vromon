import { act, fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import { MapSheet } from '../features/map/MapSheet';
import { DEFAULT_PREFERENCES, usePreferences } from '../features/preferences/store';
import i18n from '../i18n';

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);

const props = {
  open: true,
  home: 'BD',
  view: 'countries' as const,
  onSelectView: jest.fn(),
  onAllThemes: jest.fn(),
  onClose: jest.fn(),
};

beforeEach(async () => {
  jest.clearAllMocks();
  usePreferences.setState(DEFAULT_PREFERENCES);
  await act(() => i18n.changeLanguage('en'));
});

describe('Map sheet', () => {
  it("names the regions option after the home country's regions", async () => {
    await render(<MapSheet {...props} />);
    expect(screen.getByText('Divisions')).toBeTruthy();
    await render(<MapSheet {...props} home="IN" />);
    expect(screen.getByText('Regions')).toBeTruthy();
  });

  it('chooses a view and closes', async () => {
    await render(<MapSheet {...props} />);
    await fireEvent.press(screen.getByTestId('map-view-regions'));
    expect(props.onSelectView).toHaveBeenCalledWith('regions');
    expect(props.onClose).toHaveBeenCalled();
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
    expect(screen.getByText('বিভাগ')).toBeTruthy();
    expect(screen.getByText('সব থিম')).toBeTruthy();
  });
});

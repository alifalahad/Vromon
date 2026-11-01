import { act, fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import { QuickMark, quickLayout } from '../features/map/QuickMark';
import { DEFAULT_PREFERENCES, usePreferences } from '../features/preferences/store';
import i18n from '../i18n';

jest.mock('../ui/haptics', () => ({ haptics: { light: jest.fn(), selection: jest.fn(), success: jest.fn() }, haptic: jest.fn() }));

beforeEach(async () => {
  usePreferences.setState(DEFAULT_PREFERENCES);
  await act(() => i18n.changeLanguage('en'));
});

describe('press and hold to mark', () => {
  it('fans the choices above the finger, and below it near the top', () => {
    const above = quickLayout([200, 500], 3, 400, 24);
    expect(above.every((p) => p.y < 500)).toBe(true);
    expect(above[1].x).toBeCloseTo(200);
    const below = quickLayout([200, 120], 3, 400, 24);
    expect(below.every((p) => p.y > 120)).toBe(true);
  });

  it('keeps the choices on screen at the edges', () => {
    for (const p of quickLayout([5, 500], 4, 400, 24)) {
      expect(p.x - 28).toBeGreaterThanOrEqual(0);
      expect(p.x + 28).toBeLessThanOrEqual(400);
    }
  });

  it('offers Visited, Want and Lived, and Clear once the place is marked', async () => {
    const onPick = jest.fn();
    await render(<QuickMark name="Rajshahi" point={[200, 500]} status={null} topInset={24} onPick={onPick} onCancel={jest.fn()} />);
    expect(screen.getByText('Rajshahi')).toBeTruthy();
    expect(screen.queryByTestId('quick-mark-clear')).toBeNull();
    await fireEvent.press(screen.getByTestId('quick-mark-want'));
    expect(onPick).toHaveBeenCalledWith('want');

    await render(<QuickMark name="Rajshahi" point={[200, 500]} status="want" topInset={24} onPick={onPick} onCancel={jest.fn()} />);
    expect(screen.getByTestId('quick-mark-clear')).toBeTruthy();
    expect(screen.getByTestId('quick-mark-want').props.accessibilityState).toMatchObject({ selected: true });
  });

  it('cancels from anywhere else', async () => {
    const onCancel = jest.fn();
    await render(<QuickMark name="Rajshahi" point={[200, 500]} status={null} topInset={24} onPick={jest.fn()} onCancel={onCancel} />);
    await fireEvent.press(screen.getByTestId('quick-mark-cancel'));
    expect(onCancel).toHaveBeenCalled();
  });
});

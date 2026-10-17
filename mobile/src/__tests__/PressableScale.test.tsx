import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { Text } from 'react-native';

import { PressableScale } from '../ui/PressableScale';

jest.mock('../ui/haptics', () => ({ haptic: jest.fn() }));
const { haptic } = jest.requireMock('../ui/haptics') as { haptic: jest.Mock };

describe('PressableScale', () => {
  beforeEach(() => haptic.mockClear());

  it('fires a light haptic and onPress by default', async () => {
    const onPress = jest.fn();
    await render(
      <PressableScale onPress={onPress} accessibilityLabel="Save">
        <Text>Save</Text>
      </PressableScale>,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    expect(haptic).toHaveBeenCalledWith('light');
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('fires the requested haptic', async () => {
    await render(
      <PressableScale haptic="medium" onPress={() => {}} accessibilityLabel="Apply">
        <Text>Apply</Text>
      </PressableScale>,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Apply' }));
    expect(haptic).toHaveBeenCalledWith('medium');
  });

  it('can be silent (e.g. sheet backdrops)', async () => {
    const onPress = jest.fn();
    await render(<PressableScale haptic="none" pressEffect="none" onPress={onPress} accessibilityLabel="Close" />);
    await fireEvent.press(screen.getByRole('button', { name: 'Close' }));
    expect(haptic).not.toHaveBeenCalled();
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does not fire when disabled', async () => {
    const onPress = jest.fn();
    await render(
      <PressableScale disabled onPress={onPress} accessibilityLabel="Next">
        <Text>Next</Text>
      </PressableScale>,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Next' }));
    expect(onPress).not.toHaveBeenCalled();
    expect(haptic).not.toHaveBeenCalled();
  });
});

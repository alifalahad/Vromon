/**
 * The app's on/off switch: one look everywhere. Off, the track is `switchOff` (a grey that shows on
 * a white card); on, it's `accentStrong`. The thumb is white either way.
 */

import React from 'react';
import { Switch, type SwitchProps } from 'react-native';

import { useTheme } from './theme';

export function Toggle(props: Omit<SwitchProps, 'trackColor' | 'thumbColor' | 'ios_backgroundColor'>) {
  const { colors } = useTheme();
  return (
    <Switch
      {...props}
      trackColor={{ true: colors.accentStrong, false: colors.switchOff }}
      thumbColor="#FFFFFF"
      ios_backgroundColor={colors.switchOff}
    />
  );
}

/**
 * Floating "glass" over the map (story capsule, round map buttons, dock): a
 * translucent surface with a hairline border and a soft shadow.
 *
 * No blur: expo-blur isn't installed (it is a native module, so adding it means a
 * new development build). At 90% opacity the blur would barely show anyway.
 */

import React from 'react';
import { View, type ViewProps } from 'react-native';

import type { Theme } from './theme';
import { makeStyles } from './theme';

/** The glass look as a style, for pressables that can't wrap a GlassSurface. */
export const glass = (t: Theme) => ({
  backgroundColor: t.colors.glass,
  borderWidth: 1,
  borderColor: t.colors.glassBorder,
  elevation: 4,
  shadowColor: t.colors.shadow,
  shadowOpacity: 0.3,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 4 },
});

export function GlassSurface({ style, ...props }: ViewProps) {
  const styles = useStyles();
  return <View {...props} style={[styles.glass, style]} />;
}

const useStyles = makeStyles((t) => ({ glass: glass(t) }));

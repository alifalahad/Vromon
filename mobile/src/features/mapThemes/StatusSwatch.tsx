import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import type { VisitStatus } from '../../types';
import type { ResolvedMapTheme } from './resolve';

/** A status colour chip as the map draws it: fill, plus the outline where the theme has one. */
export function StatusSwatch({
  theme,
  status,
  size = 12,
  style,
}: {
  theme: ResolvedMapTheme;
  status: VisitStatus;
  size?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const outline = theme.outline[status];
  return (
    <View
      style={[
        { width: size, height: size, borderRadius: size / 2, backgroundColor: theme.status[status] },
        outline ? { borderWidth: 1.5, borderColor: outline } : null,
        style,
      ]}
    />
  );
}

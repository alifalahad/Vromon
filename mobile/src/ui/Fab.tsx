import { MaterialIcons } from '@expo/vector-icons';
import React from 'react';

import { PressableScale } from './PressableScale';
import { makeStyles, useTheme } from './theme';

/** 64 dp accent circle, bottom-right. Medium haptic. */
export function Fab({ onPress, accessibilityLabel, testID }: { onPress: () => void; accessibilityLabel: string; testID?: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <PressableScale
      haptic="medium"
      onPress={onPress}
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      style={styles.fab}
    >
      <MaterialIcons name="add" size={34} color={colors.onAccent} />
    </PressableScale>
  );
}

const useStyles = makeStyles((t) => ({
  fab: {
    position: 'absolute',
    right: t.spacing.lg + 2,
    bottom: t.spacing.lg + 2,
    width: t.sizes.fab,
    height: t.sizes.fab,
    borderRadius: t.sizes.fab / 2,
    backgroundColor: t.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: t.colors.shadow,
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
}));

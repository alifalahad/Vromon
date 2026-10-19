import { MaterialIcons } from '@expo/vector-icons';
import React from 'react';
import { Text } from 'react-native';

import { PressableScale } from './PressableScale';
import { makeStyles, useTheme } from './theme';

/** 64 dp accent circle, bottom-right; with a `label`, an extended pill ("+ Plan a trip"). Medium haptic. */
export function Fab({
  onPress,
  accessibilityLabel,
  testID,
  label,
}: {
  onPress: () => void;
  accessibilityLabel: string;
  testID?: string;
  label?: string;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <PressableScale
      haptic="medium"
      onPress={onPress}
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      accessibilityRole="button"
      style={[styles.fab, label ? styles.extended : null]}
    >
      <MaterialIcons name="add" size={label ? 24 : 34} color={colors.onAccent} />
      {label ? (
        <Text style={styles.label} maxFontSizeMultiplier={1.3}>
          {label}
        </Text>
      ) : null}
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
  extended: { width: undefined, height: 56, borderRadius: 28, flexDirection: 'row', gap: t.spacing.sm, paddingLeft: 18, paddingRight: 22 },
  label: { ...t.type.callout, fontSize: 16, fontWeight: '700', color: t.colors.onAccent },
}));

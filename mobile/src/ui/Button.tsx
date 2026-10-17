import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, Text, type StyleProp, type ViewStyle } from 'react-native';

import type { HapticKind } from './haptics';
import { PressableScale } from './PressableScale';
import { makeStyles, useTheme } from './theme';

type Variant = 'primary' | 'secondary' | 'danger' | 'small' | 'smallDanger';

/**
 * Pill button. `primary` = accent fill, `secondary` = surface with link text,
 * `danger` = tinted red, `small` / `smallDanger` = compact inline actions.
 */
export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  haptic,
  style,
  accessibilityLabel,
  testID,
  icon,
}: {
  label: string;
  /** Material Community icon name shown before the label */
  icon?: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  haptic?: HapticKind | 'none';
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  testID?: string;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const inactive = disabled || loading;
  const textColor =
    variant === 'primary' ? colors.onAccent : variant === 'danger' || variant === 'smallDanger' ? colors.danger : colors.link;
  return (
    <PressableScale
      haptic={haptic ?? (variant === 'primary' ? 'medium' : 'light')}
      onPress={onPress}
      disabled={inactive}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      testID={testID}
      // Compact buttons are 36 dp tall; the hit area still reaches 48 dp
      hitSlop={variant === 'small' || variant === 'smallDanger' ? 6 : undefined}
      style={[styles.base, styles[variant], inactive && styles.inactive, style]}
    >
      {loading ? (
        <ActivityIndicator color={textColor} />
      ) : (
        <>
          {icon ? <MaterialCommunityIcons name={icon} size={22} color={textColor} /> : null}
          <Text style={[variant === 'small' || variant === 'smallDanger' ? styles.smallText : styles.text, { color: textColor }]}>
            {label}
          </Text>
        </>
      )}
    </PressableScale>
  );
}

const useStyles = makeStyles((t) => ({
  base: { flexDirection: 'row', gap: t.spacing.sm, alignItems: 'center', justifyContent: 'center', borderRadius: t.radius.pill },
  primary: { backgroundColor: t.colors.accent, minHeight: 52, paddingHorizontal: t.spacing.xl },
  secondary: { backgroundColor: t.colors.surface, minHeight: t.sizes.minTouch, paddingHorizontal: t.spacing.lg },
  danger: { backgroundColor: t.colors.dangerBg, minHeight: t.sizes.minTouch, paddingHorizontal: t.spacing.lg },
  small: { backgroundColor: t.colors.accentSoft, minHeight: 36, minWidth: 48, paddingHorizontal: t.spacing.md },
  smallDanger: { backgroundColor: t.colors.dangerBg, minHeight: 36, minWidth: 48, paddingHorizontal: t.spacing.md },
  inactive: { opacity: 0.5 },
  text: { ...t.type.headline },
  smallText: { fontSize: 13, fontWeight: '600' },
}));

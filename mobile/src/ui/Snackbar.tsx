/**
 * A short message at the bottom of the screen, with an optional action (Undo).
 * The parent decides when it goes away; screen readers announce it politely.
 *
 * `inline` is for a bottom sheet's footer: over a @gorhom sheet, a floating
 * view doesn't get taps on Android (the sheet's gesture layer takes them).
 */

import React from 'react';
import { Text, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PressableScale } from './PressableScale';
import { makeStyles } from './theme';
import { useReduceMotion } from './useReduceMotion';

export function Snackbar({
  message,
  actionLabel,
  onAction,
  testID,
  inline,
}: {
  inline?: boolean;
  message: string | null;
  actionLabel?: string;
  onAction?: () => void;
  testID?: string;
}) {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  if (!message) return null;
  return (
    <Animated.View
      entering={reduceMotion ? undefined : FadeInDown.duration(180)}
      exiting={reduceMotion ? undefined : FadeOutDown.duration(140)}
      style={inline ? [styles.inline, { paddingBottom: insets.bottom + 12 }] : [styles.wrap, { bottom: insets.bottom + 16 }]}
      pointerEvents="box-none"
    >
      <View style={styles.bar} accessibilityLiveRegion="polite" testID={testID}>
        <Text style={styles.text}>{message}</Text>
        {actionLabel && onAction ? (
          <PressableScale onPress={onAction} pressEffect="opacity" haptic="selection" style={styles.action} testID={testID ? `${testID}-action` : undefined}>
            <Text style={styles.actionText}>{actionLabel}</Text>
          </PressableScale>
        ) : null}
      </View>
    </Animated.View>
  );
}

const useStyles = makeStyles((t) => ({
  wrap: { position: 'absolute', left: t.spacing.lg, right: t.spacing.lg },
  inline: { paddingHorizontal: t.spacing.lg },
  bar: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.sm,
    paddingLeft: t.spacing.lg,
    paddingRight: t.spacing.xs,
    borderRadius: 14,
    // Inverse of the theme so it stands out from the sheet
    backgroundColor: t.colors.textPrimary,
    shadowColor: t.colors.shadow,
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  text: { ...t.type.callout, flex: 1, color: t.colors.bg, paddingVertical: t.spacing.md },
  action: { minHeight: 48, minWidth: 48, paddingHorizontal: t.spacing.md, justifyContent: 'center', alignItems: 'center' },
  actionText: { ...t.type.callout, fontWeight: '700', color: t.scheme === 'dark' ? '#245FD0' : '#6EA0F6' },
}));

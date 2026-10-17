/**
 * The only module that talks to expo-haptics (enforced by ESLint).
 *
 * Android uses `performAndroidHapticsAsync` with system haptic constants; Expo's
 * SDK 57 docs recommend it over the Vibrator-based impact/notification calls.
 * Every call respects the "Haptic feedback" setting and never throws.
 */

import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

import { usePreferences } from '../features/preferences/store';

export type HapticKind = 'selection' | 'light' | 'medium' | 'success' | 'warning' | 'error';

const ANDROID: Record<HapticKind, Haptics.AndroidHaptics> = {
  selection: Haptics.AndroidHaptics.Segment_Tick,
  light: Haptics.AndroidHaptics.Virtual_Key,
  medium: Haptics.AndroidHaptics.Context_Click,
  success: Haptics.AndroidHaptics.Confirm,
  warning: Haptics.AndroidHaptics.Long_Press,
  error: Haptics.AndroidHaptics.Reject,
};

function fire(kind: HapticKind): Promise<void> {
  if (Platform.OS === 'android') return Haptics.performAndroidHapticsAsync(ANDROID[kind]);
  switch (kind) {
    case 'selection':
      return Haptics.selectionAsync();
    case 'light':
      return Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    case 'medium':
      return Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    case 'success':
      return Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    case 'warning':
      return Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    case 'error':
      return Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  }
}

export function haptic(kind: HapticKind): void {
  if (Platform.OS === 'web' || !usePreferences.getState().haptics) return;
  fire(kind).catch(() => {
    // Haptics are best-effort: unsupported hardware must never break a press.
  });
}

export const haptics = {
  selection: () => haptic('selection'),
  light: () => haptic('light'),
  medium: () => haptic('medium'),
  success: () => haptic('success'),
  warning: () => haptic('warning'),
  error: () => haptic('error'),
};

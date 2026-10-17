/**
 * Cross-platform confirm / notify. react-native-web's Alert.alert does nothing,
 * so on web we fall back to the browser's dialogs.
 *
 * Haptics: a confirmed destructive action fires `warning`; a notice with a tone
 * fires `success` or `error`.
 */

import { Alert, Platform } from 'react-native';

import { haptics } from '../ui/haptics';

export function confirm(title: string, message: string, confirmLabel: string, onConfirm: () => void, destructive = false) {
  const accept = () => {
    if (destructive) haptics.warning();
    onConfirm();
  };
  if (Platform.OS === 'web') {
    if (globalThis.confirm?.(`${title}\n\n${message}`)) accept();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: confirmLabel, style: destructive ? 'destructive' : 'default', onPress: accept },
  ]);
}

export function notify(title: string, message: string, tone?: 'success' | 'error') {
  if (tone === 'success') haptics.success();
  if (tone === 'error') haptics.error();
  if (Platform.OS === 'web') {
    globalThis.alert?.(`${title}\n\n${message}`);
    return;
  }
  Alert.alert(title, message);
}

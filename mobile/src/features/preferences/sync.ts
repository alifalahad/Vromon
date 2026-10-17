/**
 * Keeps local preferences and the account's settings (GET/PUT /me/settings) in step.
 *
 * After sign-in the account's saved settings win (they follow the user across
 * devices), unless this device has changes the server hasn't seen yet (made
 * offline, or the app closed before the push): those are pushed first. Every
 * later local change is pushed, debounced.
 */

import { useEffect } from 'react';

import { meApi } from '../../services/api';
import { normalizeUserMapTheme } from '../mapThemes/resolve';
import { usePreferences, type Preferences } from './store';

const PUSH_DELAY_MS = 800;

const synced = (p: Preferences) =>
  [p.appearance, p.language, p.haptics, p.units, JSON.stringify(p.mapTheme), p.notifyFriendRequests, p.notifyFriendAccepted].join('|');

function push(userId: string) {
  const state = usePreferences.getState();
  const sent = synced(state);
  return meApi
    .putSettings({
      appearance: state.appearance,
      language: state.language,
      haptics: state.haptics,
      units: state.units,
      map_theme: state.mapTheme,
      notify_friend_requests: state.notifyFriendRequests,
      notify_friend_accepted: state.notifyFriendAccepted,
    })
    .then(() => {
      // Only clear the flag if nothing changed while the request was in flight
      const now = usePreferences.getState();
      if (now.unsyncedFor === userId && synced(now) === sent) usePreferences.setState({ unsyncedFor: null });
    });
}

export function useSettingsSync(userId: string | null) {
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    let applying = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const { unsyncedFor } = usePreferences.getState();
    if (unsyncedFor === userId) {
      push(userId).catch(() => {}); // still offline: the flag stays and the next start retries
    } else {
      // Another account's unsent changes must not reach this one
      if (unsyncedFor) usePreferences.setState({ unsyncedFor: null });
      meApi
        .getSettings()
        .then((s) => {
          if (cancelled || usePreferences.getState().unsyncedFor === userId) return; // changed here meanwhile
          if (!s.updated_at) return; // never saved: keep this device's choices (pushed on first change)
          applying = true;
          usePreferences.setState({
            appearance: s.appearance,
            language: s.language,
            haptics: s.haptics,
            units: s.units,
            notifyFriendRequests: s.notify_friend_requests ?? true,
            notifyFriendAccepted: s.notify_friend_accepted ?? true,
            // Accounts saved before map themes existed keep this device's theme
            ...(s.map_theme ? { mapTheme: normalizeUserMapTheme(s.map_theme) } : {}),
          });
          applying = false;
        })
        .catch(() => {
          // Offline or server error: local preferences still apply; the next change retries.
        });
    }

    const unsubscribe = usePreferences.subscribe((state, prev) => {
      if (applying || synced(state) === synced(prev)) return;
      if (state.unsyncedFor !== userId) usePreferences.setState({ unsyncedFor: userId });
      clearTimeout(timer);
      timer = setTimeout(() => push(userId).catch(() => {}), PUSH_DELAY_MS);
    });

    return () => {
      cancelled = true;
      clearTimeout(timer);
      unsubscribe();
    };
  }, [userId]);
}

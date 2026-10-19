/**
 * Trip reminders while signed in: they show while the app is open too, and tapping
 * one (also the tap that launched the app) opens Today mode for that trip.
 */

import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';

import { ensureNotificationHandler, todayPath } from './reminders';

export function useReminderTaps(signedIn: boolean) {
  const router = useRouter();
  useEffect(() => {
    if (!signedIn) return;
    ensureNotificationHandler();
    const open = (r: Notifications.NotificationResponse | null) => {
      const path = todayPath(r?.notification.request.content.data?.url);
      if (path) router.push(path as never);
    };
    void Notifications.getLastNotificationResponseAsync().then(open).catch(() => undefined);
    const tapped = Notifications.addNotificationResponseReceivedListener(open);
    return () => tapped.remove();
  }, [signedIn, router]);
}

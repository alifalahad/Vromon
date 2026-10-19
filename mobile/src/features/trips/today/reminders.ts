/**
 * Trip reminders (trip planner step 9): local notifications scheduled on the
 * phone, so they need no push server.
 *   - "Leave in 10 minutes for Inani Beach": 10 minutes before each "leave by".
 *   - The evening before a trip day (19:00): tomorrow's weather warnings, if any.
 * Tapping one opens Today mode. Signing out cancels them all.
 */

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

export const TRIP_CHANNEL = 'trip';
const EVENING = 19 * 60;
export const LEAVE_EARLY_MIN = 10;

type Kind = 'trip-leave' | 'trip-weather';

export interface Reminder {
  /** when it should appear */
  at: Date;
  title: string;
  body: string;
}

let handlerSet = false;

/** Notifications show while the app is open too (the friends hook sets the same handler when push is set up). */
export function ensureNotificationHandler() {
  if (handlerSet) return;
  handlerSet = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
  });
}

/** The permission to show notifications (asked only when you turn a reminder on). */
export async function allowNotifications(ask: boolean): Promise<boolean> {
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(TRIP_CHANNEL, {
        name: 'Trip reminders',
        importance: Notifications.AndroidImportance.HIGH,
      });
    }
    let { status, canAskAgain } = await Notifications.getPermissionsAsync();
    if (status !== 'granted' && ask && canAskAgain) ({ status } = await Notifications.requestPermissionsAsync());
    return status === 'granted';
  } catch {
    return false;
  }
}

/** A date's minute as a local Date ("2026-10-20", 690 → 20 Oct 11:30). */
export function at(date: string, minute: number): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d, Math.floor(minute / 60), minute % 60, 0, 0);
}

/** The evening before a date, at 19:00. */
export const eveningBefore = (date: string) => new Date(at(date, EVENING).getTime() - 24 * 3600_000);

async function cancel(tripId: number | null, kind?: Kind) {
  const all = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    all
      .filter((n) => {
        const data = n.content.data as { kind?: string; tripId?: number } | undefined;
        return data?.kind?.startsWith('trip-') && (tripId == null || data.tripId === tripId) && (!kind || data.kind === kind);
      })
      .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
  );
}

// The last set scheduled per trip and kind: rescheduling the same set again does nothing
const scheduled = new Map<string, string>();

/** Replace this trip's reminders of one kind with these (only the ones still in the future). */
export async function replaceReminders(tripId: number, kind: Kind, reminders: Reminder[], now = new Date()): Promise<number> {
  const future = reminders.filter((r) => r.at.getTime() > now.getTime() + 30_000);
  const key = `${tripId}:${kind}`;
  const signature = JSON.stringify(future.map((r) => [r.at.getTime(), r.title, r.body]));
  if (scheduled.get(key) === signature) return future.length;
  await cancel(tripId, kind);
  for (const r of future) {
    await Notifications.scheduleNotificationAsync({
      content: { title: r.title, body: r.body, data: { kind, tripId, url: `/trip/today/${tripId}` } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: r.at, channelId: TRIP_CHANNEL },
    });
  }
  scheduled.set(key, signature);
  return future.length;
}

export async function cancelReminders(tripId: number, kind?: Kind) {
  for (const k of kind ? [kind] : (['trip-leave', 'trip-weather'] as Kind[])) scheduled.delete(`${tripId}:${k}`);
  await cancel(tripId, kind);
}

/** Before signing out: the next person on this phone must not get them. */
export async function cancelAllTripReminders() {
  scheduled.clear();
  try {
    await cancel(null);
  } catch {
    // nothing scheduled, or notifications unavailable
  }
}

/** Only in-app Today paths, e.g. "/trip/today/12". */
export const todayPath = (url: unknown): string | null => (typeof url === 'string' && /^\/trip\/today\/\d+$/.test(url) ? url : null);

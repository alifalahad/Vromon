/**
 * On the trip, in its room (friends-chat step 8): "I'm here" and "Running late" as cards
 * through the outbox. The phone sends its own date and time; the server places them on
 * the trip's plan, and a check-in's point is never kept or shown, only where it snapped.
 */

import * as Location from 'expo-location';

import type { CheckinCard, LateCard, RoomTrip } from '../../types';
import { localToday } from '../trips/dates';
import type { OutgoingCard } from './share';

/** "HH:MM" on the phone's clock */
export function localTime(now = new Date()): string {
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

/** Is the trip on today (the room then offers I'm here, Running late and live location)? */
export function tripIsOn(trip: Pick<RoomTrip, 'start_date' | 'end_date'> | null | undefined, today = localToday()): boolean {
  return !!trip && trip.start_date <= today && today <= trip.end_date;
}

export function lateCard(minutes: number, source: 'today' | 'room', now = new Date()): OutgoingCard {
  const preview: LateCard = { day: 0, time: localTime(now), minutes, stop: null, source };
  return { kind: 'late', payload: { minutes, source, date: localToday(now), time: localTime(now) }, preview: preview as unknown as Record<string, unknown> };
}

/** One reading, for "I'm here". Null when it can't be had (no permission, no fix). */
export async function checkInCard(now = new Date()): Promise<OutgoingCard | null> {
  try {
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    const preview: CheckinCard = { day: 0, time: localTime(now), near: null };
    return {
      kind: 'checkin',
      payload: { lat: pos.coords.latitude, lon: pos.coords.longitude, date: localToday(now), time: localTime(now) },
      preview: preview as unknown as Record<string, unknown>,
    };
  } catch {
    return null;
  }
}

/** The running-late choices, in minutes */
export const LATE_CHOICES = [10, 20, 30, 45, 60] as const;

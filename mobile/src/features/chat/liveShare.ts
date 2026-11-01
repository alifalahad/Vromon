/**
 * Sharing your live location with a trip room (friends-chat step 8, decision C4).
 *
 * Only after you start it, for 15 min, an hour or until the end of the day, and only
 * while Vromon is open: a point a minute in the foreground, no background tracking.
 * A bar with Stop shows on every screen while it runs. It ends on Stop, when the time
 * is up, or when the server refuses a point (you left the room, the trip's days ended).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { QueryClient } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import * as Location from 'expo-location';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { ApiError, chatApi } from '../../services/api';
import { localToday } from '../trips/dates';
import { askForLocation } from '../trips/today/useHere';
import { chatKeys, messageArrived } from './queries';

export const LIVE_EVERY_MS = 60_000;

export type LiveShare = { conversationId: number; roomName: string; until: string };

export const useLiveShare = create<{ share: LiveShare | null }>()(
  persist(() => ({ share: null as LiveShare | null }), {
    name: 'vromon.live-share',
    storage: createJSONStorage(() => AsyncStorage),
  }),
);

/** The end of the phone's day, as a time */
export function endOfToday(now = new Date()): Date {
  const end = new Date(now);
  end.setHours(23, 59, 0, 0);
  return end;
}

export type LiveLength = '15m' | '1h' | 'day';

export function untilFor(length: LiveLength, now = new Date()): Date {
  if (length === '15m') return new Date(now.getTime() + 15 * 60_000);
  if (length === '1h') return new Date(now.getTime() + 60 * 60_000);
  return endOfToday(now);
}

async function here() {
  const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
  return { lat: pos.coords.latitude, lon: pos.coords.longitude, accuracy_m: pos.coords.accuracy ?? null };
}

export class NoLocation extends Error {}

/** Start sharing with a room. Throws NoLocation when location isn't allowed. */
export async function startLiveShare(client: QueryClient, me: string, conversationId: number, roomName: string, length: LiveLength) {
  if (!(await askForLocation())) throw new NoLocation();
  const point = await here();
  const until = untilFor(length);
  const card = await chatApi.startLive(conversationId, { client_id: Crypto.randomUUID(), ...point, date: localToday(), until: until.toISOString() });
  messageArrived(client, card, me);
  useLiveShare.setState({ share: { conversationId, roomName, until: until.toISOString() } });
}

/** Stop sharing: the point is deleted on the server at once. */
export async function stopLiveShare(client: QueryClient) {
  const share = useLiveShare.getState().share;
  useLiveShare.setState({ share: null });
  if (!share) return;
  await chatApi.stopLive(share.conversationId).catch(() => undefined);
  void client.invalidateQueries({ queryKey: chatKeys.thread(share.conversationId) });
}

/** While sharing and Vromon is in front: a point a minute; it ends when the time is up or the server says no. */
export function useLiveShareUpdates(client: QueryClient) {
  const share = useLiveShare((s) => s.share);
  useEffect(() => {
    if (!share) return;
    let alive = true;
    const send = async () => {
      if (!alive || AppState.currentState !== 'active') return;
      if (Date.parse(share.until) <= Date.now()) {
        useLiveShare.setState({ share: null });
        void client.invalidateQueries({ queryKey: chatKeys.thread(share.conversationId) });
        return;
      }
      try {
        const point = await here();
        await chatApi.updateLive(share.conversationId, { ...point, date: localToday() });
      } catch (e) {
        // Refused (you left the room, it ran out, the trip's days are over): it has ended
        if (e instanceof ApiError && (e.status === 404 || e.status === 422)) useLiveShare.setState({ share: null });
      }
    };
    void send();
    const timer = setInterval(send, LIVE_EVERY_MS);
    const sub = AppState.addEventListener('change', (state) => state === 'active' && void send());
    return () => {
      alive = false;
      clearInterval(timer);
      sub.remove();
    };
  }, [share, client]);
}

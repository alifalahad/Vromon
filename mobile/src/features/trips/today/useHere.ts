/**
 * Where you are, for "leave by", only while Today mode is open and only if you
 * turned it on. The position stays on the phone: it's used for a straight-line
 * estimate here and is never stored or sent anywhere.
 */

import * as Location from 'expo-location';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import type { Point } from './today';

export type HereStatus = 'off' | 'asking' | 'on' | 'denied' | 'unavailable';

const EVERY_MS = 2 * 60_000;

/** Asks for "while using the app" location (precise or approximate: your choice in the dialog). */
export async function askForLocation(): Promise<boolean> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    return status === 'granted';
  } catch {
    return false;
  }
}

export function useHere(enabled: boolean): { here: Point | null; status: HereStatus } {
  const [here, setHere] = useState<Point | null>(null);
  const [status, setStatus] = useState<HereStatus>('off');

  useFocusEffect(
    useCallback(() => {
      if (!enabled) {
        setHere(null);
        setStatus('off');
        return;
      }
      let alive = true;
      const read = async () => {
        try {
          const perm = await Location.getForegroundPermissionsAsync();
          if (perm.status !== 'granted') {
            if (alive) setStatus('denied');
            return;
          }
          if (alive) setStatus((s) => (s === 'on' ? s : 'asking'));
          const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          if (alive) {
            setHere({ lat: pos.coords.latitude, lon: pos.coords.longitude });
            setStatus('on');
          }
        } catch {
          if (alive) setStatus('unavailable');
        }
      };
      void read();
      const timer = setInterval(read, EVERY_MS);
      return () => {
        alive = false;
        clearInterval(timer);
      };
    }, [enabled]),
  );

  return { here, status };
}

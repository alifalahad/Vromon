/**
 * Where the backend is.
 *
 * Normally `EXPO_PUBLIC_API_URL`, fixed when the app is built. The build shared with
 * friends while the backend runs on a Mac behind a free tunnel (whose address changes
 * every time it starts) sets `EXPO_PUBLIC_CONFIG_URL` instead: a small public file,
 * {"apiUrl": "https://…"}, that the Mac's start script updates (scripts/share/).
 * The last address that worked is kept, so the app still opens offline.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

const KEY = 'vromon.apiUrl';
const CONFIG_URL = process.env.EXPO_PUBLIC_CONFIG_URL;
const TIMEOUT_MS = 6000;

let current = (process.env.EXPO_PUBLIC_API_URL ?? 'http://127.0.0.1:8000').replace(/\/$/, '');
let loading: Promise<void> | null = null;

/** The backend's address now (no trailing slash). */
export const apiUrl = () => current;

/** Only an https address is taken from the shared file. */
export function validApiUrl(u: unknown): string | null {
  return typeof u === 'string' && /^https:\/\/[a-z0-9.-]+(:\d+)?\/?$/i.test(u.trim()) ? u.trim().replace(/\/$/, '') : null;
}

async function load(configUrl: string | undefined): Promise<void> {
  if (!configUrl) return;
  const saved = validApiUrl(await AsyncStorage.getItem(KEY).catch(() => null));
  if (saved) current = saved;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    const res = await fetch(`${configUrl}${configUrl.includes('?') ? '&' : '?'}t=${Date.now()}`, { signal: ctrl.signal, cache: 'no-store' });
    clearTimeout(timer);
    const fresh = validApiUrl(((await res.json()) as { apiUrl?: unknown }).apiUrl);
    if (fresh) {
      current = fresh;
      await AsyncStorage.setItem(KEY, fresh).catch(() => undefined);
    }
  } catch {
    // Offline or the file is unreachable: the saved address (or the built-in one) is used
  }
}

/** Starts reading the shared file (once). */
export function loadServerConfig(configUrl: string | undefined = CONFIG_URL): Promise<void> {
  loading ??= load(configUrl);
  return loading;
}

/** True once the address is known (at once in normal builds). */
export function useServerConfigReady(): boolean {
  const [ready, setReady] = useState(!CONFIG_URL);
  useEffect(() => {
    if (ready) return;
    let alive = true;
    void loadServerConfig().finally(() => alive && setReady(true));
    return () => {
      alive = false;
    };
  }, [ready]);
  return ready;
}

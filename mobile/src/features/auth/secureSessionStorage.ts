/**
 * Supabase session storage: the session is AES-256-CTR encrypted and kept in
 * AsyncStorage; the 256-bit key lives in expo-secure-store (Android Keystore).
 *
 * SecureStore alone can't hold a full Supabase session (values over ~2 KB are
 * rejected on some devices), so this is the "LargeSecureStore" pattern from
 * Supabase's Expo guide. Tokens are never stored in plain text.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as aesjs from 'aes-js';
import { getRandomBytes } from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

const KEY_PREFIX = 'vromon.session-key.';

function keyName(storageKey: string) {
  // SecureStore keys allow only [A-Za-z0-9._-]
  return KEY_PREFIX + storageKey.replace(/[^A-Za-z0-9._-]/g, '_');
}

async function encrypt(storageKey: string, value: string): Promise<string> {
  const key = getRandomBytes(32);
  const cipher = new aesjs.ModeOfOperation.ctr(key, new aesjs.Counter(1));
  const encrypted = cipher.encrypt(aesjs.utils.utf8.toBytes(value));
  await SecureStore.setItemAsync(keyName(storageKey), aesjs.utils.hex.fromBytes(key));
  return aesjs.utils.hex.fromBytes(encrypted);
}

async function decrypt(storageKey: string, hex: string): Promise<string | null> {
  const keyHex = await SecureStore.getItemAsync(keyName(storageKey));
  if (!keyHex) return null;
  const cipher = new aesjs.ModeOfOperation.ctr(aesjs.utils.hex.toBytes(keyHex), new aesjs.Counter(1));
  return aesjs.utils.utf8.fromBytes(cipher.decrypt(aesjs.utils.hex.toBytes(hex)));
}

export const secureSessionStorage = {
  async getItem(storageKey: string): Promise<string | null> {
    const hex = await AsyncStorage.getItem(storageKey);
    if (!hex) return null;
    try {
      return await decrypt(storageKey, hex);
    } catch {
      return null; // corrupted or key lost: treat as signed out
    }
  },
  async setItem(storageKey: string, value: string): Promise<void> {
    await AsyncStorage.setItem(storageKey, await encrypt(storageKey, value));
  },
  async removeItem(storageKey: string): Promise<void> {
    await AsyncStorage.removeItem(storageKey);
    await SecureStore.deleteItemAsync(keyName(storageKey));
  },
};

/**
 * Push notifications for friend requests (expo-notifications + the Expo Push API).
 *
 * Needs an EAS project id and Firebase (FCM) in the build (app.config.ts). Without
 * them, registration quietly does nothing: the Friends badge still updates by polling.
 * Permission is asked in context (after a first friend action, or from Settings),
 * never at launch.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { friendsApi } from '../../services/api';

const TOKEN_KEY = 'vromon.pushToken';
export const FRIENDS_CHANNEL = 'friends';

export type PushResult = 'registered' | 'denied' | 'unavailable';

function projectId(): string | undefined {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return extra?.eas?.projectId ?? Constants.easConfig?.projectId;
}

/** True when this build can receive push at all. */
export const pushAvailable = () => Platform.OS !== 'web' && !!projectId();

/**
 * Registers this install with the server. With `ask`, shows the system permission
 * prompt if it hasn't been answered; otherwise only registers when already allowed.
 */
export async function registerForPush(ask: boolean): Promise<PushResult> {
  if (!pushAvailable()) return 'unavailable';
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(FRIENDS_CHANNEL, {
        name: 'Friends',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }
    let { status, canAskAgain } = await Notifications.getPermissionsAsync();
    if (status !== 'granted' && ask && canAskAgain) ({ status } = await Notifications.requestPermissionsAsync());
    if (status !== 'granted') return 'denied';
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: projectId() });
    await friendsApi.registerDevice(token, Platform.OS);
    await AsyncStorage.setItem(TOKEN_KEY, token);
    return 'registered';
  } catch {
    return 'unavailable'; // e.g. no FCM configuration in this build
  }
}

/** Before signing out, so the next person on this phone doesn't get these notifications. */
export async function unregisterForPush(): Promise<void> {
  try {
    const token = await AsyncStorage.getItem(TOKEN_KEY);
    if (!token) return;
    await friendsApi.unregisterDevice(token);
    await AsyncStorage.removeItem(TOKEN_KEY);
  } catch {
    // Offline: the server drops the token when Expo reports it gone, or reassigns it on the next sign-in
  }
}

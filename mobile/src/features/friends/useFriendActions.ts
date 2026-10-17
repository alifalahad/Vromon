/**
 * Friend actions with their feedback: success haptic when a request is sent or
 * accepted (prompt §6.10), warning-confirmed remove/block, error haptic on failure.
 * The first send or accept asks for notification permission, once, in context.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { useTranslation } from 'react-i18next';

import { friendsApi } from '../../services/api';
import type { FriendRequest } from '../../types';
import { haptics } from '../../ui/haptics';
import { confirm, notify } from '../../utils/dialogs';
import { registerForPush } from './push';
import { forgetPerson, refreshFriends } from './queries';

const ASKED_KEY = 'vromon.pushAsked';

async function askForPushOnce() {
  try {
    if (await AsyncStorage.getItem(ASKED_KEY)) return;
    await AsyncStorage.setItem(ASKED_KEY, '1');
  } catch {
    return;
  }
  void registerForPush(true);
}

function serverMessage(e: unknown): string {
  if (isAxiosError(e)) return (e.response?.data as { detail?: string } | undefined)?.detail ?? e.message;
  return e instanceof Error ? e.message : String(e);
}

export function useFriendActions() {
  const client = useQueryClient();
  const { t } = useTranslation();

  const run = async <T,>(work: () => Promise<T>, success?: 'success'): Promise<T | null> => {
    try {
      const result = await work();
      if (success) haptics.success();
      return result;
    } catch (e) {
      notify(t('common.error'), serverMessage(e), 'error');
      return null;
    } finally {
      refreshFriends(client);
    }
  };

  const sendRequest = async (target: { user_id: string } | { friend_code: string }): Promise<FriendRequest | null> => {
    const req = await run(() => friendsApi.request(target), 'success');
    if (req) void askForPushOnce();
    return req;
  };

  return {
    sendRequest,
    accept: async (requestId: number) => {
      const req = await run(() => friendsApi.respond(requestId, 'accept'), 'success');
      if (req) void askForPushOnce();
      return req;
    },
    decline: (requestId: number) => run(() => friendsApi.respond(requestId, 'decline')),
    cancel: (requestId: number) => run(() => friendsApi.respond(requestId, 'cancel')),
    remove: (userId: string, name: string, then?: () => void) =>
      confirm(t('friends.removeTitle', { name }), t('friends.removeBody'), t('friends.remove'), async () => {
        if ((await run(() => friendsApi.remove(userId))) !== null) {
          forgetPerson(client, userId);
          then?.();
        }
      }, true),
    block: (userId: string, name: string, then?: () => void) =>
      confirm(t('friends.blockTitle', { name }), t('friends.blockBody'), t('friends.block'), async () => {
        if ((await run(() => friendsApi.block(userId))) !== null) {
          forgetPerson(client, userId);
          then?.();
        }
      }, true),
    unblock: (userId: string) => run(() => friendsApi.unblock(userId)),
  };
}

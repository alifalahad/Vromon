/**
 * Friend notifications while signed in: registers this phone (only if permission
 * was already given; asking happens in context), refreshes the friend lists when a
 * notification arrives, and opens the right screen when one is tapped, including
 * the tap that launched the app. Chats (step 9): a tap opens the chat; while Vromon is
 * open, a chat's notification isn't shown (the in-app banner, from the live socket, is).
 */

import { useQueryClient } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';

import { pushAvailable, registerForPush } from './push';
import { refreshFriends } from './queries';

let handlerSet = false;

/** Only in-app paths from our own server: "/friends", "/friends/<id>", or a chat, "/chat/<number>" (step 9) */
export function safePath(url: unknown): string | null {
  return typeof url === 'string' && (/^\/friends(\/[0-9a-f-]{36})?$/.test(url) || /^\/chat\/[1-9]\d{0,9}$/.test(url)) ? url : null;
}

function openFrom(response: Notifications.NotificationResponse | null, open: (path: string) => void) {
  const path = safePath(response?.notification.request.content.data?.url);
  if (path) open(path);
}

/** A chat's notification while Vromon is open: the in-app banner says it instead (or the chat is on screen). */
export const isChatNotification = (n: Notifications.Notification) => /^\/chat\//.test(String(n.request.content.data?.url ?? ''));

export function useFriendNotifications(userId: string | null) {
  const client = useQueryClient();
  const router = useRouter();

  useEffect(() => {
    if (!userId || !pushAvailable()) return;
    if (!handlerSet) {
      handlerSet = true;
      Notifications.setNotificationHandler({
        handleNotification: async (n) =>
          isChatNotification(n)
            ? { shouldShowBanner: false, shouldShowList: false, shouldPlaySound: false, shouldSetBadge: false }
            : { shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false },
      });
    }
    void registerForPush(false);
    const open = (path: string) => router.push(path as never);
    void Notifications.getLastNotificationResponseAsync().then((r) => openFrom(r, open));
    const received = Notifications.addNotificationReceivedListener(() => refreshFriends(client));
    const tapped = Notifications.addNotificationResponseReceivedListener((r) => {
      refreshFriends(client);
      openFrom(r, open);
    });
    return () => {
      received.remove();
      tapped.remove();
    };
  }, [userId, client, router]);
}

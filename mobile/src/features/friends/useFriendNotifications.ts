/**
 * Friend notifications while signed in: registers this phone (only if permission
 * was already given; asking happens in context), refreshes the friend lists when a
 * notification arrives, and opens the right screen when one is tapped, including
 * the tap that launched the app.
 */

import { useQueryClient } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';

import { pushAvailable, registerForPush } from './push';
import { refreshFriends } from './queries';

let handlerSet = false;

function openFrom(response: Notifications.NotificationResponse | null, open: (path: string) => void) {
  const url = response?.notification.request.content.data?.url;
  // Only in-app paths from our own server, e.g. "/friends" or "/friends/<id>"
  if (typeof url === 'string' && /^\/friends(\/[0-9a-f-]{36})?$/.test(url)) open(url);
}

export function useFriendNotifications(userId: string | null) {
  const client = useQueryClient();
  const router = useRouter();

  useEffect(() => {
    if (!userId || !pushAvailable()) return;
    if (!handlerSet) {
      handlerSet = true;
      Notifications.setNotificationHandler({
        handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
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

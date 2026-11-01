/**
 * Runs the live chat connection for the signed-in account (mounted once, in the root
 * layout): open while the app is in the foreground, closed in the background, and
 * nudged when the app comes back or the network returns. Every chance to reach the
 * server also sends the outbox.
 */

import { useQueryClient } from '@tanstack/react-query';
import * as Network from 'expo-network';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { apiUrl } from '../../services/serverConfig';
import { perfLog } from '../../utils/devPerf';
import { getAccessToken } from '../auth/session';
import { supabase } from '../auth/supabase';
import { flushChat, RETRY_EVERY, useChatOutbox } from './outbox';
import { applyLiveEvent, chatKeys } from './queries';
import { LiveSocket } from './socket';
import { useLiveStatus } from './state';

let current: LiveSocket | null = null;

/** Tell the open chat you're typing (no-op without a live connection). */
export const sendTyping = (conversationId: number) => current?.typing(conversationId);

async function freshToken(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.refreshSession();
  return data.session?.access_token ?? null;
}

export function useLiveChat(userId: string | null) {
  const client = useQueryClient();
  useEffect(() => {
    if (!userId) return;
    const flush = () => void flushChat(userId, client);
    const socket = new LiveSocket({
      url: apiUrl,
      token: getAccessToken,
      refreshToken: freshToken,
      onEvent: (event) => applyLiveEvent(client, event, userId),
      // Back online: fetch what was missed, and send what waited
      onReady: () => {
        void client.invalidateQueries({ queryKey: chatKeys.all });
        flush();
      },
      onStatus: (status) => {
        perfLog(`live socket: ${status}`); // how fast it comes back (development and perf builds)
        useLiveStatus.setState({ status });
      },
    });
    current = socket;
    if (AppState.currentState !== 'background') socket.start();
    flush();
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        socket.start();
        socket.nudge();
        flush();
      } else if (state === 'background') {
        socket.stop();
      }
    });
    const network = Network.addNetworkStateListener((n) => {
      perfLog(`network: ${n.isConnected ? 'connected' : 'offline'} (${n.type})`);
      if (!n.isConnected) return;
      socket.nudge();
      flush();
    });
    // Something waits and nothing else triggers a try (the server came back on its own)
    const timer = setInterval(() => {
      if (useChatOutbox.getState().items.some((i) => i.state === 'waiting')) flush();
    }, RETRY_EVERY);
    return () => {
      socket.stop();
      if (current === socket) current = null;
      appState.remove();
      network.remove();
      clearInterval(timer);
      useLiveStatus.setState({ status: 'off' });
    };
  }, [userId, client]);
}

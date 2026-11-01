/**
 * Messages you send, kept on the phone until the server has them (docs/friends-chat-plan.md,
 * step 3). Each has the app's own id (`client_id`), so a retry can never post it twice.
 *
 * - No network, the server down, or a rate limit: the message waits and goes later
 *   (on start, when the app comes back, when the network or the live socket returns,
 *   and every RETRY_EVERY seconds while something waits).
 * - The server refuses it (you can't write there any more, too long): it fails and
 *   says why; tapping it tries again.
 * - Another account signed in on this phone never sends them (like the map outbox).
 * - Cards (step 4) go the same way: the outbox keeps the ids the server needs and a
 *   preview to show the card until the server's own arrives.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { QueryClient } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { chatApi, isTemporaryError } from '../../services/api';
import type { CardKind, ChatMessage, ReplyPreview } from '../../types';
import { messageArrived } from './queries';

export const RETRY_EVERY = 15_000;

export interface OutboxItem {
  clientId: string;
  conversationId: number;
  /** A card; text when missing (as on items saved before cards) */
  kind?: CardKind;
  /** The text ('' for a card) */
  body: string;
  /** A card's ids, as the server wants them (it builds the card from them) */
  payload?: Record<string, unknown>;
  /** How the card looks until the server's own arrives */
  preview?: Record<string, unknown>;
  /** A reply: the message it quotes, and how the quote looks until the server's arrives */
  replyTo?: number;
  replyPreview?: ReplyPreview;
  createdAt: string;
  state: 'sending' | 'waiting' | 'failed';
  /** Why the server refused it */
  error?: string;
}

type OutboxState = {
  /** Who queued these; nobody else's token sends them */
  userId: string | null;
  items: OutboxItem[];
};

export const useChatOutbox = create<OutboxState>()(
  persist(() => ({ userId: null, items: [] }) as OutboxState, {
    name: 'vromon.chat-outbox',
    version: 1,
    storage: createJSONStorage(() => AsyncStorage),
    // A send that was in flight when the app closed goes again (its client_id keeps it single)
    merge: (saved, current) => {
      const s = saved as OutboxState | undefined;
      return { ...current, ...s, items: (s?.items ?? []).map((i) => (i.state === 'sending' ? { ...i, state: 'waiting' } : i)) };
    },
  }),
);

const update = (clientId: string, change: Partial<OutboxItem>) =>
  useChatOutbox.setState((s) => ({ items: s.items.map((i) => (i.clientId === clientId ? { ...i, ...change } : i)) }));

function queue(userId: string, item: OutboxItem): OutboxItem {
  const state = useChatOutbox.getState();
  useChatOutbox.setState({ userId, items: [...(state.userId === userId ? state.items : []), item] });
  return item;
}

/** Put a text message in the outbox (a reply when `reply` is given); `flushChat` sends it. */
export const queueText = (userId: string, conversationId: number, body: string, now = new Date(), reply?: ReplyPreview): OutboxItem =>
  queue(userId, {
    clientId: Crypto.randomUUID(),
    conversationId,
    body,
    ...(reply ? { replyTo: reply.id, replyPreview: reply } : {}),
    createdAt: now.toISOString(),
    state: 'sending',
  });

/** Put a card in the outbox: `payload` is what the server needs, `preview` what shows meanwhile. */
export const queueCard = (
  userId: string,
  conversationId: number,
  kind: CardKind,
  payload: Record<string, unknown>,
  preview: Record<string, unknown>,
  now = new Date(),
): OutboxItem =>
  queue(userId, { clientId: Crypto.randomUUID(), conversationId, kind, body: '', payload, preview, createdAt: now.toISOString(), state: 'sending' });

let flushing: Promise<void> | null = null;

/** Send what's waiting, oldest first, stopping at the first network failure. */
export function flushChat(currentUserId: string, client: QueryClient): Promise<void> {
  if (flushing) return flushing;
  flushing = (async () => {
    for (;;) {
      const { items, userId } = useChatOutbox.getState();
      const item = items.find((i) => i.state !== 'failed');
      if (!item || userId !== currentUserId) break;
      update(item.clientId, { state: 'sending', error: undefined });
      let sent: ChatMessage;
      try {
        const message = item.kind ? { client_id: item.clientId, kind: item.kind, payload: item.payload ?? {} } : { client_id: item.clientId, body: item.body };
        sent = await chatApi.send(item.conversationId, item.replyTo ? { ...message, reply_to_id: item.replyTo } : message);
      } catch (e) {
        if (isTemporaryError(e)) {
          update(item.clientId, { state: 'waiting' });
          break;
        }
        update(item.clientId, { state: 'failed', error: e instanceof Error ? e.message : String(e) });
        continue;
      }
      messageArrived(client, sent, currentUserId);
      useChatOutbox.setState((s) => ({ items: s.items.filter((i) => i.clientId !== item.clientId) }));
    }
  })().finally(() => {
    flushing = null;
  });
  return flushing;
}

/** Try a failed (or waiting) message again now. */
export function retry(currentUserId: string, clientId: string, client: QueryClient): Promise<void> {
  update(clientId, { state: 'sending', error: undefined });
  return flushChat(currentUserId, client);
}

/** Give up on a message that wasn't sent. */
export function discard(clientId: string) {
  useChatOutbox.setState((s) => ({ items: s.items.filter((i) => i.clientId !== clientId) }));
}

/** Waiting messages for one chat, for the screen to show under the saved ones. */
export const pendingFor = (items: readonly OutboxItem[], userId: string | undefined, owner: string | null, conversationId: number) =>
  owner === userId ? items.filter((i) => i.conversationId === conversationId) : [];

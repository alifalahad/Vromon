/**
 * Chat data (TanStack Query): the chat list, each chat, and each chat's messages.
 * Live events and your own sends update the cache directly; when the live socket is
 * down, the list and the open chat poll instead (docs/friends-chat-plan.md, 3.3).
 */

import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { ApiError, chatApi } from '../../services/api';
import { perfLog } from '../../utils/devPerf';
import type { ChatMessage, Conversation, LiveEvent } from '../../types';
import { clearTyping, markTyping, useChatBanner, useLiveStatus, useOpenChat } from './state';

export const chatKeys = {
  all: ['chat'] as const,
  list: ['chat', 'list'] as const,
  conversation: (id: number) => ['chat', 'conversation', id] as const,
  thread: (id: number) => ['chat', 'thread', id] as const,
};

/** A chat's loaded messages, oldest first, and whether older ones are left on the server. */
export interface Thread {
  messages: ChatMessage[];
  hasOlder: boolean;
}

/**
 * Messages by id, oldest first. A message that arrives again unchanged (a refetch) keeps its
 * old object, so its bubble isn't drawn again (step 10; `buildRows` keys its bubbles by message).
 */
export function mergeMessages(old: readonly ChatMessage[], incoming: readonly ChatMessage[]): ChatMessage[] {
  const byId = new Map(old.map((m) => [m.id, m]));
  for (const m of incoming) {
    const known = byId.get(m.id);
    if (!known || (known !== m && JSON.stringify(known) !== JSON.stringify(m))) byId.set(m.id, m);
  }
  return [...byId.values()].sort((a, b) => a.id - b.id);
}

const POLL_LIST = 20_000;
const POLL_CHAT = 10_000;

export function useConversations(enabled = true) {
  const live = useLiveStatus((s) => s.status === 'live');
  return useQuery({ queryKey: chatKeys.list, queryFn: () => chatApi.list(), enabled, refetchInterval: enabled && !live ? POLL_LIST : false });
}

/** Chats with something unread, leaving out muted ones: the Friends tab's badge. */
export function unreadChats(list: readonly Conversation[] | undefined, now = Date.now()): number {
  return (list ?? []).filter((c) => c.unread_count > 0 && !(c.muted_until && Date.parse(c.muted_until) > now)).length;
}

export function useConversation(id: number) {
  const client = useQueryClient();
  return useQuery({
    queryKey: chatKeys.conversation(id),
    queryFn: () => chatApi.get(id),
    // From the list while it loads, so the header doesn't flash empty
    placeholderData: () => client.getQueryData<Conversation[]>(chatKeys.list)?.find((c) => c.id === id),
    retry: (count, e) => !(e instanceof ApiError && e.status === 404) && count < 2,
  });
}

/** The newest page, keeping older messages already loaded when the new page reaches them. */
async function fetchNewest(client: QueryClient, id: number): Promise<Thread> {
  const page = await chatApi.messages(id);
  const old = client.getQueryData<Thread>(chatKeys.thread(id));
  const oldest = page.messages[0]?.id;
  const newestLoaded = old?.messages[old.messages.length - 1]?.id;
  if (old && oldest != null && newestLoaded != null && oldest <= newestLoaded) {
    const messages = mergeMessages(old.messages, page.messages);
    // Nothing new: the same thread, so nothing draws again
    return messages.length === old.messages.length && messages.every((m, i) => m === old.messages[i]) ? old : { messages, hasOlder: old.hasOlder };
  }
  return { messages: page.messages, hasOlder: page.has_more };
}

export function useThread(id: number) {
  const client = useQueryClient();
  const live = useLiveStatus((s) => s.status === 'live');
  return useQuery({
    queryKey: chatKeys.thread(id),
    queryFn: () => fetchNewest(client, id),
    refetchInterval: live ? false : POLL_CHAT,
    // Structural sharing compares by position: a page of older messages put in front shifted
    // every message, so each was copied into a new object and every bubble drew again (over a
    // second per page in a 2,000-message chat; step 10). mergeMessages keeps unchanged ones instead.
    structuralSharing: false,
  });
}

let loadingOlder: Promise<void> | null = null;

/** Scrolling back: the page before the oldest loaded message. */
export function loadOlder(client: QueryClient, id: number): Promise<void> {
  const old = client.getQueryData<Thread>(chatKeys.thread(id));
  if (loadingOlder || !old?.hasOlder || !old.messages.length) return loadingOlder ?? Promise.resolve();
  const started = Date.now();
  loadingOlder = chatApi
    .messages(id, { before: old.messages[0].id })
    .then((page) => {
      client.setQueryData<Thread>(chatKeys.thread(id), (cur) =>
        cur ? { messages: mergeMessages(cur.messages, page.messages), hasOlder: page.has_more } : cur,
      );
      perfLog(`older page: ${page.messages.length} messages in ${Date.now() - started} ms (${old.messages.length + page.messages.length} loaded)`);
    })
    .finally(() => {
      loadingOlder = null;
    });
  return loadingOlder;
}

/** Update one chat both in the list and on its own. False when the list doesn't have it. */
function updateChat(client: QueryClient, id: number, change: (c: Conversation) => Conversation): boolean {
  client.setQueryData<Conversation>(chatKeys.conversation(id), (c) => (c ? change(c) : c));
  let listed = false;
  client.setQueryData<Conversation[]>(chatKeys.list, (list) =>
    list?.map((c) => {
      if (c.id !== id) return c;
      listed = true;
      return change(c);
    }),
  );
  return listed;
}

/** A message the server now has: one you sent from here, or one arriving live. */
export function messageArrived(client: QueryClient, message: ChatMessage, me: string) {
  const id = message.conversation_id;
  client.setQueryData<Thread>(chatKeys.thread(id), (old) => (old ? { ...old, messages: mergeMessages(old.messages, [message]) } : old));
  const onScreen = useOpenChat.getState().id === id;
  const listed = updateChat(client, id, (c) => {
    const known = c.last_message?.id === message.id;
    const newest = !c.last_message || message.id >= c.last_message.id;
    const unread =
      !known &&
      newest &&
      !onScreen &&
      message.sender_id !== null &&
      message.sender_id !== me &&
      message.kind !== 'system' &&
      !message.deleted &&
      message.id > c.last_read_message_id;
    return { ...c, last_message: newest ? message : c.last_message, unread_count: c.unread_count + (unread ? 1 : 0) };
  });
  // A chat the list hasn't got yet (its first message)
  if (!listed) void client.invalidateQueries({ queryKey: chatKeys.list });
}

/** A message changed (unsent, or a poll's answers): replace it where it shows. */
export function messageChanged(client: QueryClient, message: ChatMessage) {
  const id = message.conversation_id;
  client.setQueryData<Thread>(chatKeys.thread(id), (old) => (old ? { ...old, messages: mergeMessages(old.messages, [message]) } : old));
  updateChat(client, id, (c) => {
    if (c.last_message?.id !== message.id) return c;
    // An unsent message no longer counts as unread
    const unread = message.deleted && message.id > c.last_read_message_id ? Math.max(0, c.unread_count - 1) : c.unread_count;
    return { ...c, last_message: message, unread_count: unread };
  });
}

/** Apply what the live socket sent. */
export function applyLiveEvent(client: QueryClient, event: LiveEvent, me: string) {
  switch (event.type) {
    case 'message.created':
      messageArrived(client, event.message, me);
      if (event.message.sender_id) clearTyping(event.conversation_id, event.message.sender_id);
      // A trip room's lines (joined, left, a place added to the plan) change its members or plan bar
      if (event.message.kind === 'system') void client.invalidateQueries({ queryKey: chatKeys.conversation(event.conversation_id) });
      else if (bannerWorthy(client, event.message, me)) useChatBanner.setState({ banner: { conversationId: event.conversation_id, messageId: event.message.id } });
      return;
    case 'message.updated':
      messageChanged(client, event.message);
      return;
    case 'conversation.read':
      if (event.user_id === me) {
        // Read on another of your devices
        updateChat(client, event.conversation_id, (c) => ({
          ...c,
          last_read_message_id: Math.max(c.last_read_message_id, event.last_read_message_id),
          unread_count: event.last_read_message_id >= (c.last_message?.id ?? 0) ? 0 : c.unread_count,
        }));
      } else {
        updateChat(client, event.conversation_id, (c) => ({ ...c, other_read_up_to: Math.max(c.other_read_up_to ?? 0, event.last_read_message_id) }));
      }
      return;
    case 'conversation.updated':
      for (const key of [chatKeys.list, chatKeys.conversation(event.conversation_id), chatKeys.thread(event.conversation_id)]) {
        void client.invalidateQueries({ queryKey: key });
      }
      return;
    case 'typing':
      if (event.user_id !== me) markTyping(event.conversation_id, event.user_id);
      return;
    default:
      return;
  }
}

/** A message from someone else, in a chat that isn't open and isn't muted, that you haven't seen yet. */
export function bannerWorthy(client: QueryClient, message: ChatMessage, me: string, now = Date.now()): boolean {
  if (message.sender_id === null || message.sender_id === me || message.deleted) return false;
  if (useOpenChat.getState().id === message.conversation_id) return false;
  const chat = client.getQueryData<Conversation[]>(chatKeys.list)?.find((c) => c.id === message.conversation_id);
  return !!chat && !(chat.muted_until && Date.parse(chat.muted_until) > now);
}

/** Mark a chat read up to its newest message (the server keeps it; the tab badge drops at once). */
export async function markRead(client: QueryClient, conversation: Conversation, newestId: number): Promise<void> {
  if (newestId <= conversation.last_read_message_id) return;
  updateChat(client, conversation.id, (c) => ({ ...c, last_read_message_id: Math.max(c.last_read_message_id, newestId), unread_count: 0 }));
  try {
    await chatApi.read(conversation.id, newestId);
  } catch {
    // Offline: the next visit marks it again
  }
}

/**
 * The chat with a friend, ready to open: at once when the chat list has it (there's one
 * chat per pair and its id never changes), otherwise made on the server the first time.
 */
export async function openChatWith(client: QueryClient, userId: string): Promise<number> {
  const known = client.getQueryData<Conversation[]>(chatKeys.list)?.find((c) => c.kind === 'direct' && c.other?.id === userId);
  if (known) return known.id;
  const conversation = await chatApi.open(userId);
  client.setQueryData(chatKeys.conversation(conversation.id), conversation);
  return conversation.id;
}

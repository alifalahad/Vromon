import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import React from 'react';

import { applyLiveEvent, chatKeys, loadOlder, markRead, mergeMessages, messageArrived, unreadChats, useThread, type Thread } from '../features/chat/queries';
import { useOpenChat, useTyping } from '../features/chat/state';
import { chatApi } from '../services/api';
import type { ChatMessage, Conversation } from '../types';

jest.mock('../services/api', () => ({
  ...jest.requireActual('../services/api'),
  chatApi: { read: jest.fn(() => Promise.resolve()), messages: jest.fn() },
}));

const message = (id: number, sender: string | null, extra: Partial<ChatMessage> = {}): ChatMessage => ({
  id,
  conversation_id: 1,
  sender_id: sender,
  kind: 'text',
  body: `m${id}`,
  payload: null,
  reply_to_id: null,
  client_id: null,
  created_at: '2026-10-27T03:00:00+00:00',
  deleted: false,
  ...extra,
});

const chat = (extra: Partial<Conversation> = {}): Conversation => ({
  id: 1,
  kind: 'direct',
  other: { id: 'rafi', username: 'rafi', display_name: 'Rafi', avatar_url: null },
  trip_id: null,
  can_send: true,
  read_only_reason: null,
  last_message: message(1, 'rafi'),
  unread_count: 0,
  last_read_message_id: 1,
  other_read_up_to: null,
  muted_until: null,
  created_at: '2026-10-01T00:00:00+00:00',
  ...extra,
});

let client: QueryClient;
beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
  client.setQueryData(chatKeys.list, [chat()]);
  client.setQueryData<Thread>(chatKeys.thread(1), { messages: [message(1, 'rafi')], hasOlder: false });
  useOpenChat.setState({ id: null });
  useTyping.setState({ byChat: {} });
  jest.clearAllMocks();
});
afterEach(() => client.clear());

const listed = () => client.getQueryData<Conversation[]>(chatKeys.list)![0];
const thread = () => client.getQueryData<Thread>(chatKeys.thread(1))!.messages.map((m) => m.id);

describe('merging messages', () => {
  it('keeps one copy of each, in order, the newer copy winning', () => {
    const merged = mergeMessages([message(3, 'a'), message(1, 'a')], [message(2, 'b'), message(3, 'a', { deleted: true })]);
    expect(merged.map((m) => m.id)).toEqual([1, 2, 3]);
    expect(merged[2].deleted).toBe(true);
  });

  it('a message that comes again unchanged keeps its object, so its bubble is not drawn again (step 10)', () => {
    const one = message(1, 'a');
    const two = message(2, 'a');
    const merged = mergeMessages([one, two], [message(1, 'a'), message(2, 'a', { body: 'edited' })]);
    expect(merged[0]).toBe(one);
    expect(merged[1]).not.toBe(two);
  });

  it("a page of older messages keeps the loaded ones' objects (structural sharing would copy them all)", async () => {
    const page = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => message(from + i, 'rafi'));
    const api = chatApi.messages as jest.Mock;
    api.mockResolvedValueOnce({ messages: page(51, 100), has_more: true }).mockResolvedValueOnce({ messages: page(1, 50), has_more: false });
    const fresh = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) => React.createElement(QueryClientProvider, { client: fresh }, children);
    const { result } = await renderHook(() => useThread(5), { wrapper });
    await waitFor(() => expect(result.current.data?.messages).toHaveLength(50));
    const before = result.current.data!.messages;
    await act(() => loadOlder(fresh, 5));
    const after = result.current.data!.messages;
    expect(after).toHaveLength(100);
    expect(after.slice(50).every((m, i) => m === before[i])).toBe(true);
    fresh.clear();
  });
});

describe('a message arriving', () => {
  it('lands in the chat and counts as unread once', () => {
    messageArrived(client, message(2, 'rafi'), 'me');
    messageArrived(client, message(2, 'rafi'), 'me'); // the same event again (after a reconnect)
    expect(thread()).toEqual([1, 2]);
    expect(listed().unread_count).toBe(1);
    expect(listed().last_message?.id).toBe(2);
  });

  it("doesn't count your own messages, or the chat on screen", () => {
    messageArrived(client, message(2, 'me'), 'me');
    useOpenChat.setState({ id: 1 });
    messageArrived(client, message(3, 'rafi'), 'me');
    expect(listed().unread_count).toBe(0);
  });

  it('asks for the list again when the chat is new to it', async () => {
    const refetch = jest.spyOn(client, 'invalidateQueries');
    messageArrived(client, message(9, 'nusrat', { conversation_id: 2 }), 'me');
    expect(refetch).toHaveBeenCalledWith({ queryKey: chatKeys.list });
  });
});

describe('live events', () => {
  it('an unsent message is replaced, and stops counting as unread', () => {
    messageArrived(client, message(2, 'rafi'), 'me');
    applyLiveEvent(client, { type: 'message.updated', conversation_id: 1, message: message(2, 'rafi', { deleted: true, body: null }) }, 'me');
    expect(client.getQueryData<Thread>(chatKeys.thread(1))!.messages[1].deleted).toBe(true);
    expect(listed().unread_count).toBe(0);
  });

  it("the other person's read ticks, and your own reading elsewhere", () => {
    applyLiveEvent(client, { type: 'conversation.read', conversation_id: 1, user_id: 'rafi', last_read_message_id: 1 }, 'me');
    expect(listed().other_read_up_to).toBe(1);
    messageArrived(client, message(2, 'rafi'), 'me');
    applyLiveEvent(client, { type: 'conversation.read', conversation_id: 1, user_id: 'me', last_read_message_id: 2 }, 'me');
    expect(listed().unread_count).toBe(0);
    expect(listed().last_read_message_id).toBe(2);
  });

  it('a changed chat is fetched again', () => {
    const refetch = jest.spyOn(client, 'invalidateQueries');
    applyLiveEvent(client, { type: 'conversation.updated', conversation_id: 1 }, 'me');
    expect(refetch).toHaveBeenCalledWith({ queryKey: chatKeys.conversation(1) });
    expect(refetch).toHaveBeenCalledWith({ queryKey: chatKeys.thread(1) });
  });

  it('typing shows for the other person, and stops when their message arrives', () => {
    applyLiveEvent(client, { type: 'typing', conversation_id: 1, user_id: 'me' }, 'me');
    expect(useTyping.getState().byChat[1]).toBeUndefined();
    applyLiveEvent(client, { type: 'typing', conversation_id: 1, user_id: 'rafi' }, 'me');
    expect(useTyping.getState().byChat[1]?.userId).toBe('rafi');
    applyLiveEvent(client, { type: 'message.created', conversation_id: 1, message: message(2, 'rafi') }, 'me');
    expect(useTyping.getState().byChat[1]).toBeUndefined();
  });
});

describe('reading', () => {
  it('marks the chat read on the server and clears the count at once', async () => {
    messageArrived(client, message(2, 'rafi'), 'me');
    await markRead(client, listed(), 2);
    expect(chatApi.read).toHaveBeenCalledWith(1, 2);
    expect(listed().unread_count).toBe(0);
    await markRead(client, listed(), 2); // nothing new
    expect(chatApi.read).toHaveBeenCalledTimes(1);
  });

  it('counts unread chats for the badge, leaving out muted ones', () => {
    const now = Date.parse('2026-10-27T03:00:00Z');
    expect(
      unreadChats(
        [chat({ unread_count: 2 }), chat({ id: 2, unread_count: 1, muted_until: '2026-10-28T00:00:00+00:00' }), chat({ id: 3, unread_count: 0 })],
        now,
      ),
    ).toBe(1);
  });
});

/**
 * Notifications for chats (docs/friends-chat-plan.md, step 9): which tap paths open,
 * the in-app banner for a message in a chat that isn't open, and push quiet while
 * Vromon is in front.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type * as Notifications from 'expo-notifications';
import React from 'react';

import { ChatBanner } from '../features/chat/ChatBanner';
import { applyLiveEvent, bannerWorthy, chatKeys } from '../features/chat/queries';
import { useChatBanner, useOpenChat } from '../features/chat/state';
import { isChatNotification, safePath } from '../features/friends/useFriendNotifications';
import '../i18n';
import type { ChatMessage, Conversation } from '../types';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);
jest.mock('../ui/haptics', () => ({ haptic: jest.fn(), haptics: { success: jest.fn(), error: jest.fn(), light: jest.fn(), warning: jest.fn(), selection: jest.fn() } }));

const BOB = { id: 'bob', username: 'bob', display_name: 'Bob', avatar_url: null };
const chat = (extra: Partial<Conversation> = {}): Conversation => ({
  id: 3, kind: 'direct', other: BOB, trip_id: null, can_send: true, read_only_reason: null, last_message: null,
  unread_count: 0, last_read_message_id: 0, other_read_up_to: null, muted_until: null, created_at: '2026-10-01T00:00:00Z', ...extra,
});
const message = (extra: Partial<ChatMessage> = {}): ChatMessage => ({
  id: 50, conversation_id: 3, sender_id: 'bob', kind: 'text', body: 'Bus at 7?', payload: null, reply_to_id: null, client_id: null,
  created_at: new Date().toISOString(), deleted: false, votes: null, reactions: {}, reply_to: null, ...extra,
});

const clients: QueryClient[] = [];
function clientWith(list: Conversation[]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  client.setQueryData(chatKeys.list, list);
  clients.push(client);
  return client;
}
afterEach(() => clients.splice(0).forEach((c) => c.clear()));
beforeEach(() => {
  jest.clearAllMocks();
  useChatBanner.setState({ banner: null });
  useOpenChat.setState({ id: null });
});

describe('a tap on a notification', () => {
  it('opens only our own in-app paths: friends, a friend, a chat', () => {
    expect(safePath('/friends')).toBe('/friends');
    expect(safePath('/friends/0c9a8f3e-1b2c-4d5e-8f90-123456789abc')).toBe('/friends/0c9a8f3e-1b2c-4d5e-8f90-123456789abc');
    expect(safePath('/chat/12')).toBe('/chat/12');
    for (const bad of ['/chat/abc', '/chat/0', '/chat/12/../settings', '/chat/12?x=1', 'https://evil.example/chat/1', '/settings', 'vromon://chat/1', 12, null]) {
      expect(safePath(bad)).toBeNull();
    }
  });

  it("a chat's push isn't shown while Vromon is open (the banner is), other pushes are", () => {
    const n = (url: string) => ({ request: { content: { data: { url } } } }) as unknown as Notifications.Notification;
    expect(isChatNotification(n('/chat/3'))).toBe(true);
    expect(isChatNotification(n('/friends'))).toBe(false);
  });
});

describe('the in-app banner', () => {
  it('a message from someone else in a chat that isn\'t open', () => {
    const client = clientWith([chat()]);
    expect(bannerWorthy(client, message(), 'me')).toBe(true);
    expect(bannerWorthy(client, message({ sender_id: 'me' }), 'me')).toBe(false); // yours
    expect(bannerWorthy(client, message({ sender_id: null, kind: 'system' }), 'me')).toBe(false); // Vromon's
    useOpenChat.setState({ id: 3 });
    expect(bannerWorthy(client, message(), 'me')).toBe(false); // on screen
    useOpenChat.setState({ id: null });
    const muted = clientWith([chat({ muted_until: new Date(Date.now() + 3600_000).toISOString() })]);
    expect(bannerWorthy(muted, message(), 'me')).toBe(false);
  });

  it('comes from the live socket, says who and what, opens the chat, and goes away by itself', async () => {
    jest.useFakeTimers();
    const client = clientWith([chat()]);
    applyLiveEvent(client, { type: 'message.created', conversation_id: 3, message: message() }, 'me');
    expect(useChatBanner.getState().banner).toEqual({ conversationId: 3, messageId: 50 });
    await render(
      <QueryClientProvider client={client}>
        <ChatBanner me="me" />
      </QueryClientProvider>,
    );
    expect(screen.getByTestId('chat-banner')).toHaveTextContent(/Bob.*Bus at 7\?/);
    await fireEvent.press(screen.getByTestId('chat-banner'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/chat/[id]', params: { id: '3' } });
    applyLiveEvent(client, { type: 'message.created', conversation_id: 3, message: message({ id: 51, body: 'Or 8' }) }, 'me');
    await act(async () => {
      jest.advanceTimersByTime(4100);
    });
    expect(useChatBanner.getState().banner).toBeNull();
    jest.useRealTimers();
  });

  it('a trip room says who and which trip', async () => {
    const room = chat({
      id: 7, kind: 'trip', other: null, trip_id: 91, members: [BOB],
      trip: { id: 91, title: null, destination: 'Sreemangal', start_date: '2026-12-03', end_date: '2026-12-05', owner_id: 'me', stops: 4, preview: [] },
    });
    const client = clientWith([room]);
    applyLiveEvent(client, { type: 'message.created', conversation_id: 7, message: message({ id: 60, conversation_id: 7, body: 'Tea at 4' }) }, 'me');
    await render(
      <QueryClientProvider client={client}>
        <ChatBanner me="me" />
      </QueryClientProvider>,
    );
    expect(screen.getByTestId('chat-banner')).toHaveTextContent(/Bob · Sreemangal trip.*Tea at 4/);
  });
});

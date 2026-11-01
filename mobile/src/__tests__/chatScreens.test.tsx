import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { Alert } from 'react-native';

import FriendsScreen from '../../app/(tabs)/friends';
import ChatScreen from '../../app/chat/[id]';
import NewChatScreen from '../../app/chat/new';
import { useChatOutbox } from '../features/chat/outbox';
import { markTyping, useLiveStatus, useOpenChat, useTyping } from '../features/chat/state';
import '../i18n';
import { ApiError, chatApi, friendsApi } from '../services/api';
import type { ChatMessage, Conversation, Friend } from '../types';

const mockPush = jest.fn();
const mockReplace = jest.fn();
let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace, back: jest.fn() }),
  useLocalSearchParams: () => mockParams,
  useScrollToTop: jest.fn(),
  useFocusEffect: (effect: () => void) => jest.requireActual('react').useEffect(effect, [effect]),
  Stack: { Screen: () => null },
}));
jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);
jest.mock('../ui/haptics', () => ({ haptic: jest.fn(), haptics: { success: jest.fn(), error: jest.fn(), light: jest.fn(), warning: jest.fn(), selection: jest.fn() } }));
jest.mock('../features/account/useMe', () => ({ useMe: () => ({ data: { id: 'me', username: 'ana', friend_code: 'ABCD2345' } }) }));
let mockUuid = 0;
jest.mock('expo-crypto', () => ({ randomUUID: () => `client-${++mockUuid}` }));
jest.mock('../services/api', () => ({
  ...jest.requireActual('../services/api'),
  chatApi: { list: jest.fn(), get: jest.fn(), messages: jest.fn(), send: jest.fn(), read: jest.fn(() => Promise.resolve()), open: jest.fn() },
  friendsApi: { list: jest.fn(), requests: jest.fn(() => Promise.resolve([])) },
}));

const chat = chatApi as unknown as Record<string, jest.Mock>;
const friends = friendsApi as unknown as Record<string, jest.Mock>;

const RAFI = { id: 'rafi', username: 'rafi', display_name: 'Rafi Ahmed', avatar_url: null };
const NUSRAT = { id: 'nusrat', username: 'nusrat', display_name: 'Nusrat Jahan', avatar_url: null };
const today = (hour: number) => {
  const d = new Date();
  d.setHours(hour, 5, 0, 0);
  return d.toISOString();
};

const message = (id: number, sender: string, body: string, extra: Partial<ChatMessage> = {}): ChatMessage => ({
  id,
  conversation_id: 1,
  sender_id: sender,
  kind: 'text',
  body,
  payload: null,
  reply_to_id: null,
  client_id: sender === 'me' ? `old-${id}` : null,
  created_at: today(9),
  deleted: false,
  ...extra,
});

const conversation = (extra: Partial<Conversation> = {}): Conversation => ({
  id: 1,
  kind: 'direct',
  other: RAFI,
  trip_id: null,
  can_send: true,
  read_only_reason: null,
  last_message: message(1, 'rafi', 'Are you free in December?'),
  unread_count: 0,
  last_read_message_id: 0,
  other_read_up_to: null,
  muted_until: null,
  created_at: today(8),
  ...extra,
});

const friend = (p: typeof RAFI): Friend => ({ ...p, since: '', countries: 2, world_percent: 1 });

const clients: QueryClient[] = [];
async function renderWithQuery(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  clients.push(client);
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}
afterEach(() => clients.splice(0).forEach((c) => c.clear()));

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = {};
  useChatOutbox.setState({ userId: null, items: [] });
  useOpenChat.setState({ id: null });
  useTyping.setState({ byChat: {} });
});

describe('Friends tab: chats', () => {
  beforeEach(() => {
    chat.list.mockResolvedValue([
      conversation({ unread_count: 2 }),
      conversation({ id: 2, other: NUSRAT, last_message: message(5, 'me', 'Cox’s Bazar?', { conversation_id: 2 }), other_read_up_to: 5 }),
    ]);
    friends.list.mockResolvedValue([friend(RAFI), friend(NUSRAT)]);
  });

  it('lists chats with the last message, unread counts and read ticks', async () => {
    await renderWithQuery(<FriendsScreen />);
    const rafi = await screen.findByTestId('chat-rafi');
    expect(rafi.props.accessibilityLabel).toMatch(/^Rafi Ahmed, Are you free in December\?, .+, 2 unread$/);
    expect(screen.getByTestId('chat-nusrat').props.accessibilityLabel).toMatch(/^Nusrat Jahan, You: Cox’s Bazar\?, .+, Read$/);
    await fireEvent.press(rafi);
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/chat/[id]', params: { id: '1' } });
    await fireEvent.press(screen.getByTestId('chat-compose-fab'));
    expect(mockPush).toHaveBeenCalledWith('/chat/new');
  });

  it('draws only the chats on screen, so 100 chats open about as fast as a few (step 10)', async () => {
    const person = (i: number) => ({ id: `p${i}`, username: `p${i}`, display_name: `Person ${i}`, avatar_url: null });
    chat.list.mockResolvedValue(
      Array.from({ length: 100 }, (_, i) =>
        conversation({ id: i + 1, other: person(i), last_message: message(1000 - i, `p${i}`, `Hi ${i}`, { conversation_id: i + 1 }) }),
      ),
    );
    await renderWithQuery(<FriendsScreen />);
    expect(await screen.findByTestId('chat-p0')).toBeTruthy();
    expect(screen.queryByTestId('chat-p99')).toBeNull(); // further down: drawn when scrolled to
  });

  it('a friend has a Message button in the Friends segment: a known chat opens at once', async () => {
    const TANIA = { id: 'tania', username: 'tania', display_name: 'Tania Akter', avatar_url: null };
    friends.list.mockResolvedValue([friend(RAFI), friend(NUSRAT), friend(TANIA)]);
    chat.open.mockResolvedValue(conversation({ id: 9, other: TANIA }));
    await renderWithQuery(<FriendsScreen />);
    await screen.findByTestId('chat-rafi'); // the chat list has loaded
    await fireEvent.press(screen.getByTestId('friends-segment-friends'));
    await fireEvent.press(await screen.findByTestId('message-rafi'));
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/chat/[id]', params: { id: '1' } });
    expect(chat.open).not.toHaveBeenCalled();
    // No chat with Tania yet: the server makes it
    await fireEvent.press(screen.getByTestId('message-tania'));
    expect(chat.open).toHaveBeenCalledWith('tania');
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/chat/[id]', params: { id: '9' } });
    expect(screen.getByTestId('add-friend-fab')).toBeTruthy();
  });

  it('invites to start a chat when there are friends but no chats yet', async () => {
    chat.list.mockResolvedValue([]);
    await renderWithQuery(<FriendsScreen />);
    await fireEvent.press(await screen.findByTestId('start-chat'));
    expect(mockPush).toHaveBeenCalledWith('/chat/new');
  });

  it("says the chats couldn't load (not \"No chats yet\"), and tries again", async () => {
    chat.list.mockRejectedValueOnce(new ApiError('Cannot reach the server'));
    await renderWithQuery(<FriendsScreen />);
    expect(await screen.findByTestId('chats-failed')).toHaveTextContent(/Couldn't load your chats/);
    expect(screen.queryByTestId('no-chats')).toBeNull();
    await fireEvent.press(screen.getByTestId('chats-retry'));
    expect(await screen.findByTestId('chat-rafi')).toBeTruthy();
  });
});

describe('a chat', () => {
  beforeEach(() => {
    mockParams = { id: '1' };
    chat.get.mockResolvedValue(conversation({ other_read_up_to: 2 }));
    chat.messages.mockResolvedValue({ messages: [message(1, 'rafi', 'Are you free in December?'), message(2, 'me', "I'm in!")], has_more: false });
  });

  it('shows the messages, marks them read, and shows when they are typing', async () => {
    await renderWithQuery(<ChatScreen />);
    expect((await screen.findByTestId('chat-message-1')).props.accessibilityLabel).toMatch(/^Rafi Ahmed, .+: Are you free in December\?$/);
    expect(screen.getByTestId('chat-message-2').props.accessibilityLabel).toMatch(/I'm in!\. Read$/);
    expect(screen.getByText('Today')).toBeTruthy();
    expect(chat.read).toHaveBeenCalledWith(1, 2);
    await act(async () => markTyping(1, 'rafi'));
    expect(screen.getByTestId('chat-typing').props.accessibilityLabel).toBe('Rafi Ahmed is typing');
  });

  it("earlier messages that couldn't load say so, try again on a tap, and by themselves once back online (step 10)", async () => {
    useLiveStatus.setState({ status: 'down' });
    chat.messages
      .mockResolvedValueOnce({ messages: [message(5, 'rafi', 'Newest')], has_more: true })
      .mockRejectedValueOnce(new Error('Network Error'))
      .mockRejectedValueOnce(new Error('Network Error'))
      .mockResolvedValueOnce({ messages: [message(4, 'rafi', 'Older one')], has_more: false });
    await renderWithQuery(<ChatScreen />);
    await screen.findByTestId('chat-message-5');
    await act(async () => screen.getByTestId('chat-messages').props.onEndReached());
    expect(await screen.findByText("Couldn't load earlier messages.")).toBeTruthy();
    await fireEvent.press(screen.getByTestId('chat-older-retry')); // still offline: fails again
    expect(chat.messages).toHaveBeenLastCalledWith(1, { before: 5 });
    expect(await screen.findByTestId('chat-older-failed')).toBeTruthy();
    await act(async () => useLiveStatus.setState({ status: 'live' })); // back online
    expect(await screen.findByTestId('chat-message-4')).toBeTruthy();
    expect(screen.queryByTestId('chat-older-failed')).toBeNull();
    useLiveStatus.setState({ status: 'off' });
  });

  it('shows a message the moment it is sent, then the saved one', async () => {
    let resolve!: (m: ChatMessage) => void;
    chat.send.mockReturnValue(new Promise((r) => (resolve = r)));
    await renderWithQuery(<ChatScreen />);
    await screen.findByTestId('chat-message-1');
    await fireEvent.changeText(screen.getByTestId('chat-input'), '  চলো সিলেট যাই  ');
    await fireEvent.press(screen.getByTestId('chat-send'));
    const clientId = `client-${mockUuid}`;
    expect(chat.send).toHaveBeenCalledWith(1, { client_id: clientId, body: 'চলো সিলেট যাই' });
    expect(screen.getByTestId(`chat-pending-${clientId}`).props.accessibilityLabel).toMatch(/চলো সিলেট যাই\. Sending$/);
    expect(screen.getByTestId('chat-input').props.value).toBe('');
    await act(async () => resolve(message(3, 'me', 'চলো সিলেট যাই', { client_id: clientId })));
    expect(screen.getByTestId('chat-message-3')).toBeTruthy();
    expect(useChatOutbox.getState().items).toEqual([]);
  });

  it('a refused message says so, and can be tried again', async () => {
    chat.send.mockRejectedValueOnce(new ApiError('You can only message your friends', 403));
    const alert = jest.spyOn(Alert, 'alert');
    await renderWithQuery(<ChatScreen />);
    await screen.findByTestId('chat-message-1');
    await fireEvent.changeText(screen.getByTestId('chat-input'), 'Hello?');
    await fireEvent.press(screen.getByTestId('chat-send'));
    const clientId = `client-${mockUuid}`;
    expect(await screen.findByText('You can only message your friends')).toBeTruthy();
    await fireEvent.press(screen.getByTestId(`chat-failed-${clientId}`));
    expect(alert.mock.calls[0].slice(0, 2)).toEqual(['Message not sent', 'You can only message your friends']);
    const buttons = alert.mock.calls[0][2]!;
    chat.send.mockResolvedValueOnce(message(4, 'me', 'Hello?', { client_id: clientId }));
    await act(async () => buttons.find((b) => b.text === 'Try again')!.onPress!());
    expect(chat.send).toHaveBeenCalledTimes(2);
    expect(chat.send.mock.calls[1][1].client_id).toBe(clientId);
  });

  it('a message waiting for the network can be tried again at once', async () => {
    chat.send.mockRejectedValueOnce(new ApiError('Cannot reach the server'));
    const alert = jest.spyOn(Alert, 'alert');
    await renderWithQuery(<ChatScreen />);
    await screen.findByTestId('chat-message-1');
    await fireEvent.changeText(screen.getByTestId('chat-input'), 'From the bus');
    await fireEvent.press(screen.getByTestId('chat-send'));
    const clientId = `client-${mockUuid}`;
    expect(await screen.findByText('Waiting for network')).toBeTruthy();
    expect(screen.getByTestId(`chat-pending-${clientId}`).props.accessibilityHint).toBe('Try it again now, or delete it');
    await fireEvent.press(screen.getByTestId(`chat-pending-${clientId}`));
    expect(alert.mock.calls[0].slice(0, 2)).toEqual(['Not sent yet', "It sends by itself when you're back online."]);
    chat.send.mockResolvedValueOnce(message(5, 'me', 'From the bus', { client_id: clientId }));
    await act(async () => alert.mock.calls[0][2]!.find((b) => b.text === 'Try again')!.onPress!());
    expect(chat.send).toHaveBeenLastCalledWith(1, { client_id: clientId, body: 'From the bus' });
    expect(screen.getByTestId('chat-message-5')).toBeTruthy();
    expect(useChatOutbox.getState().items).toEqual([]);
  });

  it('a message waiting for the network can be deleted', async () => {
    chat.send.mockRejectedValueOnce(new ApiError('Cannot reach the server'));
    const alert = jest.spyOn(Alert, 'alert');
    await renderWithQuery(<ChatScreen />);
    await screen.findByTestId('chat-message-1');
    await fireEvent.changeText(screen.getByTestId('chat-input'), 'Never mind');
    await fireEvent.press(screen.getByTestId('chat-send'));
    const clientId = `client-${mockUuid}`;
    await fireEvent.press(await screen.findByTestId(`chat-pending-${clientId}`));
    await act(async () => alert.mock.calls[0][2]!.find((b) => b.text === 'Delete')!.onPress!());
    expect(screen.queryByTestId(`chat-pending-${clientId}`)).toBeNull();
    expect(useChatOutbox.getState().items).toEqual([]);
  });

  it('is read-only once you are no longer friends', async () => {
    chat.get.mockResolvedValue(conversation({ can_send: false, read_only_reason: 'not_friends' }));
    await renderWithQuery(<ChatScreen />);
    expect(await screen.findByTestId('chat-read-only')).toHaveTextContent(/no longer friends with Rafi Ahmed/);
    expect(screen.queryByTestId('chat-input')).toBeNull();
  });

  it('invites a first message in an empty chat', async () => {
    chat.messages.mockResolvedValue({ messages: [], has_more: false });
    await renderWithQuery(<ChatScreen />);
    expect(await screen.findByTestId('chat-empty')).toHaveTextContent(/Say hello to Rafi Ahmed$/);
  });

  it('says so when the chat is gone (for example, you blocked them)', async () => {
    chat.get.mockRejectedValue(new ApiError('Not found', 404));
    chat.messages.mockRejectedValue(new ApiError('Not found', 404));
    await renderWithQuery(<ChatScreen />);
    expect(await screen.findByTestId('chat-unavailable')).toBeTruthy();
  });
});

describe('New message', () => {
  it('finds a friend and opens the chat with them', async () => {
    friends.list.mockResolvedValue([friend(RAFI), friend(NUSRAT)]);
    chat.open.mockResolvedValue(conversation({ id: 7, other: NUSRAT }));
    await renderWithQuery(<NewChatScreen />);
    await screen.findByTestId('new-chat-rafi');
    await fireEvent.changeText(screen.getByTestId('new-chat-search'), 'nus');
    expect(screen.queryByTestId('new-chat-rafi')).toBeNull();
    await fireEvent.press(screen.getByTestId('new-chat-nusrat'));
    expect(chat.open).toHaveBeenCalledWith('nusrat');
    expect(mockReplace).toHaveBeenCalledWith({ pathname: '/chat/[id]', params: { id: '7' } });
  });

  it('points to adding friends when there are none', async () => {
    friends.list.mockResolvedValue([]);
    await renderWithQuery(<NewChatScreen />);
    await fireEvent.press(await screen.findByTestId('new-chat-add-friends'));
    expect(mockReplace).toHaveBeenCalledWith('/friends/add');
  });
});

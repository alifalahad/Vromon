/**
 * Step 5 (docs/friends-chat-plan.md; mockups 7 and 8): reactions, replies, Unsend,
 * Report…, the chat's ⋯ menu, and Settings → Chats and privacy.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as Clipboard from 'expo-clipboard';
import React from 'react';
import { Alert, type AlertButton } from 'react-native';

import ChatScreen from '../../app/chat/[id]';
import ReportScreen from '../../app/chat/report';
import ChatSettingsScreen from '../../app/settings/chats';
import { exportMyData } from '../features/account/exportData';
import { useChatOutbox } from '../features/chat/outbox';
import { useChatNotice } from '../features/chat/state';
import { useVisitOutbox } from '../features/map/visits';
import { usePreferences } from '../features/preferences/store';
import '../i18n';
import { chatApi, friendsApi, tripsApi, visitsApi } from '../services/api';
import type { ChatMessage, Conversation } from '../types';

const mockPush = jest.fn();
const mockBack = jest.fn();
let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: mockBack }),
  useLocalSearchParams: () => mockParams,
  useFocusEffect: (effect: () => void) => jest.requireActual('react').useEffect(effect, [effect]),
  Stack: { Screen: () => null },
}));
jest.mock('expo-router/react-navigation', () => ({ useHeaderHeight: () => 0 }));
jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);
jest.mock('../ui/haptics', () => ({
  haptic: jest.fn(),
  haptics: { success: jest.fn(), error: jest.fn(), light: jest.fn(), warning: jest.fn(), selection: jest.fn() },
}));
jest.mock('../features/account/useMe', () => ({ useMe: () => ({ data: { id: 'me', username: 'ana', display_name: 'Ana', friend_code: 'ABCD2345' } }) }));
jest.mock('../features/account/exportData', () => ({ exportMyData: jest.fn(() => Promise.resolve()) }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(() => Promise.resolve(true)) }));
let mockUuid = 0;
jest.mock('expo-crypto', () => ({ randomUUID: () => `client-${++mockUuid}` }));
jest.mock('../services/api', () => ({
  ...jest.requireActual('../services/api'),
  chatApi: {
    get: jest.fn(),
    messages: jest.fn(),
    send: jest.fn(),
    read: jest.fn(() => Promise.resolve()),
    vote: jest.fn(),
    react: jest.fn(),
    unsend: jest.fn(() => Promise.resolve()),
    report: jest.fn(),
    updateMe: jest.fn(),
    clearAll: jest.fn(),
  },
  friendsApi: { remove: jest.fn(() => Promise.resolve()), block: jest.fn(() => Promise.resolve()) },
  tripsApi: { list: jest.fn(), copy: jest.fn() },
  destinationsApi: { list: jest.fn(() => Promise.resolve([])) },
  visitsApi: { forUser: jest.fn(), upsert: jest.fn(() => Promise.resolve([])) },
}));

const chat = chatApi as unknown as Record<string, jest.Mock>;
const friends = friendsApi as unknown as Record<string, jest.Mock>;
const trips = tripsApi as unknown as Record<string, jest.Mock>;
const visits = visitsApi as unknown as Record<string, jest.Mock>;

const RAFI = { id: 'rafi', username: 'rafi', display_name: 'Rafi Ahmed', avatar_url: null };
const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

const message = (id: number, sender: string, body: string | null, extra: Partial<ChatMessage> = {}): ChatMessage => ({
  id,
  conversation_id: 1,
  sender_id: sender,
  kind: 'text',
  body,
  payload: null,
  reply_to_id: null,
  client_id: sender === 'me' ? `old-${id}` : null,
  created_at: minutesAgo(10),
  deleted: false,
  votes: null,
  reactions: {},
  reply_to: null,
  ...extra,
});
const LAWACHARA = {
  type: 'attraction',
  id: 77,
  name: 'Lawachara National Park',
  category: 'Nature',
  destination: 'Sreemangal',
  destination_id: 9,
  hours: 2,
  region: 'BD-G',
  lat: 24.32,
  lon: 91.78,
};

const conversation: Conversation = {
  id: 1,
  kind: 'direct',
  other: RAFI,
  trip_id: null,
  can_send: true,
  read_only_reason: null,
  last_message: null,
  unread_count: 0,
  last_read_message_id: 0,
  other_read_up_to: null,
  muted_until: null,
  created_at: minutesAgo(600),
};

const clients: QueryClient[] = [];
async function show(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  clients.push(client);
  await render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
  return client;
}
async function open(messages: ChatMessage[], extra: Partial<Conversation> = {}) {
  chat.get.mockResolvedValue({ ...conversation, ...extra });
  chat.messages.mockResolvedValue({ messages, has_more: false });
  const client = await show(<ChatScreen />);
  await screen.findByTestId(`chat-message-${messages[messages.length - 1].id}`);
  return client;
}
const hold = (id: number) => fireEvent(screen.getByTestId(`chat-message-${id}`), 'longPress');
/** Presses the dialog's button with this label */
const answerAlert = async (label: string) => {
  const buttons = (Alert.alert as jest.Mock).mock.calls.at(-1)?.[2] as AlertButton[];
  await act(async () => buttons.find((b) => b.text === label)?.onPress?.());
};

afterEach(() => clients.splice(0).forEach((c) => c.clear()));
beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  mockParams = { id: '1' };
  useChatOutbox.setState({ userId: null, items: [] });
  useVisitOutbox.setState({ userId: null, ops: [] });
  trips.list.mockResolvedValue([]);
  visits.forUser.mockResolvedValue([]);
});

describe('reactions', () => {
  it('hold a message, pick a heart: it shows at once under the message and is sent', async () => {
    chat.react.mockReturnValue(new Promise(() => {}));
    await open([message(10, 'rafi', 'Shall we go?')]);
    await hold(10);
    await fireEvent.press(screen.getByTestId('menu-react-heart'));
    expect(chat.react).toHaveBeenCalledWith(1, 10, 'heart');
    expect(screen.getByTestId('chat-reactions-10')).toHaveTextContent(/❤️ 1/);
    expect(screen.getByTestId('chat-reactions-10').props.accessibilityLabel).toBe('Reactions: 1 Heart');
  });

  it('a text has no Want to go; a place does, and it also goes on your Want list', async () => {
    chat.react.mockReturnValue(new Promise(() => {}));
    await open([message(20, 'rafi', 'look'), message(21, 'rafi', null, { kind: 'place', payload: LAWACHARA })]);
    await hold(20);
    expect(screen.queryByTestId('menu-react-want')).toBeNull();
    await fireEvent.press(screen.getByTestId('menu-react-laugh')); // closes the menu
    await hold(21);
    await fireEvent.press(screen.getByTestId('menu-react-want'));
    expect(chat.react).toHaveBeenLastCalledWith(1, 21, 'want');
    expect(visits.upsert).toHaveBeenCalledWith([expect.objectContaining({ place_type: 'region', place_code: 'BD-G', status: 'want' })]);
  });

  it('a refused reaction goes back, and says why', async () => {
    chat.react.mockRejectedValue(new Error('You can only react in a chat with a friend'));
    await open([message(10, 'rafi', 'hi')]);
    await hold(10);
    await fireEvent.press(screen.getByTestId('menu-react-wow'));
    expect(await screen.findByText('You can only react in a chat with a friend')).toBeTruthy();
    expect(screen.queryByTestId('chat-reactions-10')).toBeNull();
  });

  it('the chip shows who reacted; your own row takes yours back', async () => {
    chat.react.mockReturnValue(new Promise(() => {}));
    await open([message(10, 'rafi', 'hi', { reactions: { heart: ['rafi'], laugh: ['me'] } })]);
    await fireEvent.press(screen.getByTestId('chat-reactions-10'));
    expect(screen.getByTestId('reactor-rafi')).toHaveTextContent(/Rafi Ahmed/);
    expect(screen.getByTestId('reactor-me')).toHaveTextContent(/You.*Tap to remove/);
    expect(screen.getByTestId('reactor-rafi').props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
    await fireEvent.press(screen.getByTestId('reactor-me'));
    expect(chat.react).toHaveBeenCalledWith(1, 10, null);
    await waitFor(() => expect(screen.getByTestId('chat-reactions-10')).toHaveTextContent('❤️ 1'));
  });
});

describe('replies', () => {
  it('Reply (a screen reader action too) quotes the message in the composer, and the reply carries it', async () => {
    chat.send.mockReturnValue(new Promise(() => {}));
    await open([message(10, 'rafi', 'Bring a raincoat')]);
    await fireEvent(screen.getByTestId('chat-message-10'), 'accessibilityAction', { nativeEvent: { actionName: 'reply' } });
    expect(screen.getByTestId('chat-reply-bar')).toHaveTextContent(/Replying to Rafi Ahmed.*Bring a raincoat/);
    await fireEvent.changeText(screen.getByTestId('chat-input'), 'Will do');
    await fireEvent.press(screen.getByTestId('chat-send'));
    const item = useChatOutbox.getState().items[0];
    expect(chat.send).toHaveBeenCalledWith(1, { client_id: item.clientId, body: 'Will do', reply_to_id: 10 });
    expect(screen.queryByTestId('chat-reply-bar')).toBeNull();
    // While it's sending, the quote is already there
    expect(screen.getByTestId(`chat-quote-${item.clientId}`)).toHaveTextContent(/Rafi Ahmed.*Bring a raincoat/);
  });

  it('the reply can be cancelled', async () => {
    await open([message(10, 'rafi', 'hi')]);
    await hold(10);
    await fireEvent.press(screen.getByTestId('menu-reply'));
    await fireEvent.press(screen.getByTestId('chat-reply-cancel'));
    expect(screen.queryByTestId('chat-reply-bar')).toBeNull();
  });

  it("a quote of a trip you can't see says so, and an unsent one says it was removed", async () => {
    await open([
      message(10, 'rafi', 'nice', {
        reply_to_id: 5,
        reply_to: { id: 5, sender_id: 'me', kind: 'trip', body: null, payload: { available: false }, deleted: false },
      }),
      message(11, 'me', 'ok', { reply_to_id: 6, reply_to: { id: 6, sender_id: 'rafi', kind: 'text', body: null, payload: null, deleted: true } }),
    ]);
    expect(screen.getByTestId('chat-quote-10')).toHaveTextContent(/You.*No longer available/);
    expect(screen.getByTestId('chat-quote-11')).toHaveTextContent(/Rafi Ahmed.*Message removed/);
  });
});

describe('the message menu', () => {
  it('yours, within the hour: Unsend, after asking; it shows as removed at once', async () => {
    await open([message(11, 'me', 'oops')]);
    await hold(11);
    expect(screen.queryByTestId('menu-report')).toBeNull();
    await fireEvent.press(screen.getByTestId('menu-unsend'));
    await answerAlert('Unsend');
    expect(chat.unsend).toHaveBeenCalledWith(1, 11);
    expect(await screen.findByText('Message removed')).toBeTruthy();
  });

  it('yours, older than an hour: no Unsend', async () => {
    await open([message(11, 'me', 'old news', { created_at: minutesAgo(61) })]);
    await hold(11);
    expect(screen.queryByTestId('menu-unsend')).toBeNull();
  });

  it("someone else's: Report… opens the report screen; Copy copies the text", async () => {
    await open([message(10, 'rafi', 'buy cheap followers')]);
    await hold(10);
    expect(screen.queryByTestId('menu-unsend')).toBeNull();
    await fireEvent.press(screen.getByTestId('menu-report'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/chat/report', params: { message: '10', name: 'Rafi Ahmed' } });
    await hold(10);
    await fireEvent.press(screen.getByTestId('menu-copy'));
    expect(Clipboard.setStringAsync).toHaveBeenCalledWith('buy cheap followers');
    expect(await screen.findByText('Copied')).toBeTruthy();
  });

  it('in a read-only chat: no reactions and no Reply, but Report… still works', async () => {
    await open([message(10, 'rafi', 'hi')], { can_send: false, read_only_reason: 'not_friends' });
    await hold(10);
    expect(screen.queryByTestId('menu-react-heart')).toBeNull();
    expect(screen.queryByTestId('menu-reply')).toBeNull();
    expect(screen.getByTestId('menu-report')).toBeTruthy();
  });

  it('an unsent message has no menu', async () => {
    await open([message(10, 'rafi', null, { deleted: true })]);
    expect(screen.getByTestId('chat-message-10').props.onLongPress).toBeUndefined();
  });
});

describe('after a report', () => {
  it("the chat's snackbar says it was sent, once", async () => {
    useChatNotice.setState({ notice: 'Report sent. Thanks for telling us.' });
    await open([message(10, 'rafi', 'hi')]);
    expect(await screen.findByText('Report sent. Thanks for telling us.')).toBeTruthy();
    expect(useChatNotice.getState().notice).toBeNull();
  });
});

describe('the chat menu', () => {
  it('Mute for 8 hours, then Unmute', async () => {
    const until = new Date(Date.now() + 8 * 3600_000).toISOString();
    chat.updateMe.mockResolvedValueOnce({ ...conversation, muted_until: until }).mockResolvedValueOnce(conversation);
    await open([message(10, 'rafi', 'hi')]);
    await fireEvent.press(screen.getByTestId('chat-menu'));
    await fireEvent.press(screen.getByTestId('action-mute'));
    await fireEvent.press(screen.getByTestId('action-mute-8h'));
    const sent = chat.updateMe.mock.calls[0][1].muted_until as string;
    expect(Math.abs(Date.parse(sent) - Date.parse(until))).toBeLessThan(60_000);
    // Said in the header's name, which is what screen readers read (the bell is only a picture)
    await waitFor(() => expect(screen.getByTestId('chat-header').props.accessibilityLabel).toMatch(/, Muted\b/));
    await fireEvent.press(screen.getByTestId('chat-menu'));
    await fireEvent.press(screen.getByTestId('action-unmute'));
    expect(chat.updateMe).toHaveBeenLastCalledWith(1, { muted_until: null });
  });

  it('Always mutes until a far-off date', async () => {
    chat.updateMe.mockResolvedValue(conversation);
    await open([message(10, 'rafi', 'hi')]);
    await fireEvent.press(screen.getByTestId('chat-menu'));
    await fireEvent.press(screen.getByTestId('action-mute'));
    await fireEvent.press(screen.getByTestId('action-mute-always'));
    expect(chat.updateMe).toHaveBeenCalledWith(1, { muted_until: '9999-12-31T00:00:00Z' });
  });

  it('Delete chat for me clears it up to the newest message, after asking', async () => {
    chat.updateMe.mockResolvedValue(conversation);
    await open([message(10, 'rafi', 'hi'), message(12, 'me', 'yo')]);
    await fireEvent.press(screen.getByTestId('chat-menu'));
    await fireEvent.press(screen.getByTestId('action-delete'));
    expect(chat.updateMe).not.toHaveBeenCalled();
    await answerAlert('Delete chat for me');
    expect(chat.updateMe).toHaveBeenCalledWith(1, { cleared_up_to_id: 12 });
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
  });

  it('Block asks first, blocks, and leaves the chat', async () => {
    await open([message(10, 'rafi', 'hi')]);
    await fireEvent.press(screen.getByTestId('chat-menu'));
    await fireEvent.press(screen.getByTestId('action-block'));
    await answerAlert('Block');
    expect(friends.block).toHaveBeenCalledWith('rafi');
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
  });

  it('Unfriend is offered only while you are friends', async () => {
    await open([message(10, 'rafi', 'hi')], { can_send: false, read_only_reason: 'not_friends' });
    await fireEvent.press(screen.getByTestId('chat-menu'));
    expect(screen.queryByTestId('action-unfriend')).toBeNull();
    expect(screen.getByTestId('action-block')).toBeTruthy();
  });
});

describe('the report screen', () => {
  it('needs a reason, sends it with the note, thanks you and goes back', async () => {
    mockParams = { message: '10', name: 'Rafi Ahmed' };
    chat.report.mockResolvedValue({ id: 1, status: 'open' });
    await show(<ReportScreen />);
    expect(screen.getByText('Why are you reporting this message from Rafi Ahmed?')).toBeTruthy();
    expect(screen.getByTestId('report-send').props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
    await fireEvent.press(screen.getByTestId('report-reason-scam'));
    await fireEvent.changeText(screen.getByTestId('report-note'), '  asked for money  ');
    await fireEvent.press(screen.getByTestId('report-send'));
    expect(chat.report).toHaveBeenCalledWith(10, 'scam', 'asked for money');
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    // No dialog while the screen closes (Android can stop redrawing); the chat says it
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(useChatNotice.getState().notice).toBe('Report sent. Thanks for telling us.');
  });
});

describe('Settings → Chats and privacy', () => {
  beforeEach(() =>
    usePreferences.setState({
      readReceipts: true,
      notifyMessages: true,
      notifyTripRooms: true,
      notificationPreviews: true,
      notifyFriendRequests: true,
      notifyFriendAccepted: true,
    }),
  );

  it('each switch changes its setting; Friend requests covers requests and accepted ones', async () => {
    await show(<ChatSettingsScreen />);
    await fireEvent.press(screen.getByTestId('settings-read-receipts-row'));
    await fireEvent.press(screen.getByTestId('settings-notify-messages-row'));
    await fireEvent.press(screen.getByTestId('settings-notify-trip-rooms-row'));
    await fireEvent.press(screen.getByTestId('settings-notification-previews-row'));
    await fireEvent.press(screen.getByTestId('settings-notify-requests-row'));
    expect(usePreferences.getState()).toEqual(
      expect.objectContaining({
        readReceipts: false,
        notifyMessages: false,
        notifyTripRooms: false,
        notificationPreviews: false,
        notifyFriendRequests: false,
        notifyFriendAccepted: false,
      }),
    );
    expect(screen.getByTestId('settings-live-location')).toHaveTextContent(/Only in trip rooms/);
    await fireEvent.press(screen.getByTestId('settings-blocked'));
    expect(mockPush).toHaveBeenCalledWith('/settings/blocked');
  });

  it('Download my chats is the data export', async () => {
    await show(<ChatSettingsScreen />);
    await fireEvent.press(screen.getByTestId('settings-download-chats'));
    expect(exportMyData).toHaveBeenCalled();
  });

  it('Delete all my chats asks first, then clears them for you', async () => {
    chat.clearAll.mockResolvedValue({ cleared: 3 });
    await show(<ChatSettingsScreen />);
    await fireEvent.press(screen.getByTestId('settings-clear-chats'));
    expect(chat.clearAll).not.toHaveBeenCalled();
    await answerAlert('Delete all my chats');
    expect(chat.clearAll).toHaveBeenCalled();
    await waitFor(() => expect(Alert.alert).toHaveBeenLastCalledWith('Chats deleted', '3 chats emptied.'));
  });
});

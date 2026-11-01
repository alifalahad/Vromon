/**
 * Sending cards (docs/friends-chat-plan.md, step 4): what goes to the server and
 * what shows meanwhile, the chat list's line for a card, the poll screen, and
 * "Send to a friend".
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { Alert, type AlertButton } from 'react-native';

import SharePollScreen from '../../app/chat/share/poll';
import SendToFriendsScreen from '../../app/share/send';
import { buildRows, preview } from '../features/chat/format';
import { flushChat, useChatOutbox } from '../features/chat/outbox';
import { chatKeys, type Thread } from '../features/chat/queries';
import { destinationCard, ideaCard, nextMonths, pollCard, pollProblem, tripCard } from '../features/chat/share';
import i18n from '../i18n';
import { chatApi, friendsApi } from '../services/api';
import type { ChatMessage, Conversation, Destination, Friend, Trip } from '../types';

const mockBack = jest.fn();
const mockReplace = jest.fn();
let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: mockReplace, back: mockBack }),
  useLocalSearchParams: () => mockParams,
  Stack: { Screen: () => null },
}));
jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);
// The screens render alone here, outside a navigator with a header
jest.mock('expo-router/react-navigation', () => ({ useHeaderHeight: () => 56 }));
jest.mock('../ui/haptics', () => ({ haptic: jest.fn(), haptics: { success: jest.fn(), error: jest.fn(), light: jest.fn(), warning: jest.fn(), selection: jest.fn() } }));
jest.mock('../features/account/useMe', () => ({ useMe: () => ({ data: { id: 'me', username: 'ana', display_name: 'Ana' } }) }));
let mockUuid = 0;
jest.mock('expo-crypto', () => ({ randomUUID: () => `client-${++mockUuid}` }));
jest.mock('../services/api', () => ({
  ...jest.requireActual('../services/api'),
  chatApi: { send: jest.fn(), open: jest.fn(), list: jest.fn(() => Promise.resolve([])) },
  friendsApi: { list: jest.fn() },
}));

const chat = chatApi as unknown as Record<string, jest.Mock>;
const friends = friendsApi as unknown as Record<string, jest.Mock>;
const t = i18n.t.bind(i18n);

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = {};
  useChatOutbox.setState({ userId: null, items: [] });
});

const clients: QueryClient[] = [];
async function show(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  clients.push(client);
  await render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
  return client;
}
afterEach(() => clients.splice(0).forEach((c) => c.clear()));

describe('what a card sends', () => {
  it('a trip: only its id; the preview waits for the stops', () => {
    const trip = { id: 5, destination: 'Sreemangal', start_date: '2026-12-03', end_date: '2026-12-05', num_travelers: 2, user_id: 'me' } as Trip;
    const dest = { id: 9, name: 'Sreemangal', latitude: 24.3, longitude: 91.7, region_code: 'BD-G' } as Destination;
    const card = tripCard(trip, { id: 'me', name: 'Ana' }, [dest]);
    expect(card.payload).toEqual({ trip_id: 5 });
    expect(card.preview).toMatchObject({ trip_id: 5, owner_id: 'me', days: 3, travelers: 2, stops: -1, region: 'BD-G', lat: 24.3 });
  });

  it("a destination: its number of places only when known, never a made-up 0", () => {
    expect(destinationCard({ id: 7, name: 'Rajshahi', place_count: 33 } as Destination).preview).toMatchObject({ places: 33 });
    expect(destinationCard({ id: 7, name: 'Rajshahi' } as Destination).preview.places).toBeUndefined();
  });

  it("an idea leaves out what wasn't chosen; a poll numbers its answers", () => {
    const dest = { id: 9, name: 'Sreemangal' } as Destination;
    expect(ideaCard(dest, { month: '2026-12', part: null, days: 3, note: null }).payload).toEqual({ destination_id: 9, month: '2026-12', days: 3 });
    expect(pollCard('Which?', ['A', 'B'], true)).toEqual({
      kind: 'poll',
      payload: { question: 'Which?', options: ['A', 'B'], multiple: true },
      preview: { question: 'Which?', options: [{ id: 1, text: 'A' }, { id: 2, text: 'B' }], multiple: true },
    });
  });

  it("a poll needs a question and two different answers; ideas offer this month and the next five", () => {
    expect(pollProblem(' ', ['A', 'B'])).toBe('empty');
    expect(pollProblem('Q', ['A', ' '])).toBe('fewAnswers');
    expect(pollProblem('Q', ['Sylhet', ' sylhet  '])).toBe('repeated');
    expect(pollProblem('Q', ['A', 'B', ''])).toBeNull();
    expect(nextMonths(new Date(2026, 10, 30))).toEqual(['2026-11', '2026-12', '2027-01', '2027-02', '2027-03', '2027-04']);
  });
});

describe('cards in the chat list and the chat', () => {
  const last = (m: Partial<ChatMessage>) =>
    ({ last_message: { id: 3, kind: 'poll', sender_id: 'rafi', deleted: false, body: null, payload: null, ...m } }) as unknown as Conversation;

  it('the chat list says what the card is', () => {
    expect(preview(last({ payload: { question: 'Which weekend?' } }), 'me', t).text).toBe('Poll: Which weekend?');
    expect(preview(last({ kind: 'trip', sender_id: 'me', payload: { destination: 'Sreemangal' } }), 'me', t).text).toBe('You: Trip plan: Sreemangal');
    expect(preview(last({ kind: 'trip', payload: { available: false } }), 'me', t).text).toBe('Trip plan: No longer available');
    expect(preview(last({ kind: 'place', payload: { name: 'Sylhet', name_bn: 'সিলেট' } }), 'me', t, 'bn').text).toBe('Place: সিলেট');
  });

  it('a card in the outbox shows its preview until the server has it', () => {
    const rows = buildRows(
      [],
      [{ clientId: 'c1', conversationId: 1, kind: 'poll', body: '', payload: {}, preview: { question: 'Q' }, createdAt: new Date().toISOString(), state: 'sending' }],
      'me',
      null,
      new Date(),
      t,
      'en',
    );
    const bubble = rows.find((r) => r.type === 'bubble');
    expect(bubble?.type === 'bubble' && bubble.bubble).toMatchObject({ kind: 'poll', payload: { question: 'Q' }, body: null, status: 'sending' });
  });

  it('the outbox sends a card as its kind and ids, and the saved one replaces it', async () => {
    const client = new QueryClient();
    client.setQueryData<Thread>(chatKeys.thread(1), { messages: [], hasOlder: false });
    const card = pollCard('Q', ['A', 'B'], false);
    useChatOutbox.setState({
      userId: 'me',
      items: [{ clientId: 'c9', conversationId: 1, kind: 'poll', body: '', payload: card.payload, preview: card.preview, createdAt: '', state: 'sending' }],
    });
    chat.send.mockResolvedValue({ id: 30, conversation_id: 1, sender_id: 'me', kind: 'poll', client_id: 'c9', payload: card.preview, created_at: '', deleted: false });
    await flushChat('me', client);
    expect(chat.send).toHaveBeenCalledWith(1, { client_id: 'c9', kind: 'poll', payload: card.payload });
    expect(useChatOutbox.getState().items).toEqual([]);
    expect(client.getQueryData<Thread>(chatKeys.thread(1))!.messages.map((m) => m.id)).toEqual([30]);
    client.clear();
  });
});

describe('the poll screen', () => {
  it('waits for two different answers, then sends the poll into the chat', async () => {
    mockParams = { chat: '4' };
    chat.send.mockReturnValue(new Promise(() => {}));
    await show(<SharePollScreen />);
    await fireEvent.changeText(screen.getByTestId('poll-question'), 'Which weekend?');
    await fireEvent.changeText(screen.getByTestId('poll-option-1'), '3–5 Dec');
    await fireEvent.changeText(screen.getByTestId('poll-option-2'), '3–5 dec');
    expect(screen.getByText('Each answer must be different')).toBeTruthy();
    expect(screen.getByTestId('poll-send').props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
    await fireEvent.changeText(screen.getByTestId('poll-option-2'), '10–12 Dec');
    await fireEvent.press(screen.getByTestId('poll-add'));
    await fireEvent.changeText(screen.getByTestId('poll-option-3'), 'Later');
    await fireEvent(screen.getByTestId('poll-multiple'), 'valueChange', true);
    await fireEvent.press(screen.getByTestId('poll-send'));
    expect(chat.send).toHaveBeenCalledWith(4, {
      client_id: expect.any(String),
      kind: 'poll',
      payload: { question: 'Which weekend?', options: ['3–5 Dec', '10–12 Dec', 'Later'], multiple: true },
    });
    expect(mockBack).toHaveBeenCalled();
  });
});

describe('Send to a friend', () => {
  const friend = (id: string, name: string): Friend => ({ id, username: id, display_name: name, avatar_url: null, since: '', countries: 1, world_percent: 1 });
  const card = JSON.stringify(pollCard('Which weekend?', ['A', 'B'], false));

  beforeEach(() => {
    friends.list.mockResolvedValue([friend('rafi', 'Rafi Ahmed'), friend('nusrat', 'Nusrat Jahan'), friend('tanvir', 'Tanvir Hasan')]);
    chat.open.mockImplementation((id: string) => Promise.resolve({ id: id === 'rafi' ? 1 : 2 }));
    chat.send.mockImplementation(() => new Promise(() => {}));
  });

  it('to several friends: the card, then the note, in each chat', async () => {
    mockParams = { card };
    const alert = jest.spyOn(Alert, 'alert');
    await show(<SendToFriendsScreen />);
    expect(screen.getByText('Which weekend?')).toBeTruthy(); // the card, as it will look
    await fireEvent.press(await screen.findByTestId('send-friend-rafi'));
    await fireEvent.press(screen.getByTestId('send-friend-nusrat'));
    expect(screen.getByTestId('send-button')).toHaveTextContent('Send to 2 friends');
    await fireEvent.changeText(screen.getByTestId('send-note'), 'Which works for you?');
    await fireEvent.press(screen.getByTestId('send-button'));
    const items = useChatOutbox.getState().items.map((i) => [i.conversationId, i.kind ?? 'text', i.body]);
    expect(items).toEqual([
      [1, 'poll', ''],
      [1, 'text', 'Which works for you?'],
      [2, 'poll', ''],
      [2, 'text', 'Which works for you?'],
    ]);
    expect(alert).toHaveBeenCalledWith('Sent to 2 friends', undefined, [expect.objectContaining({ text: 'Done' })], { cancelable: false });
    // Back only once the dialog is closed
    expect(mockBack).not.toHaveBeenCalled();
    await act(async () => (alert.mock.calls[0][2] as AlertButton[])[0].onPress?.());
    expect(mockBack).toHaveBeenCalled();
  });

  it('to one friend: their chat opens', async () => {
    mockParams = { card };
    await show(<SendToFriendsScreen />);
    await fireEvent.changeText(await screen.findByTestId('send-search'), 'raf');
    expect(screen.queryByTestId('send-friend-nusrat')).toBeNull();
    await fireEvent.press(screen.getByTestId('send-friend-rafi'));
    await fireEvent.press(screen.getByTestId('send-button'));
    expect(mockReplace).toHaveBeenCalledWith({ pathname: '/chat/[id]', params: { id: '1' } });
    expect(useChatOutbox.getState().items.map((i) => i.kind)).toEqual(['poll']); // no empty note
  });
});

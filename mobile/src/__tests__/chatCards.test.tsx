/**
 * Cards in a chat (docs/friends-chat-plan.md, step 4): each kind shows what it
 * points at, and its buttons do what they say.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { StyleSheet } from 'react-native';

import ChatScreen from '../../app/chat/[id]';
import { useChatOutbox } from '../features/chat/outbox';
import { useVisitOutbox } from '../features/map/visits';
import '../i18n';
import { chatApi, tripsApi, visitsApi } from '../services/api';
import type { ChatMessage, Conversation, Trip, Visit } from '../types';

const mockPush = jest.fn();
let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => mockParams,
  useFocusEffect: (effect: () => void) => jest.requireActual('react').useEffect(effect, [effect]),
  Stack: { Screen: () => null },
}));
jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);
jest.mock('../ui/haptics', () => ({ haptic: jest.fn(), haptics: { success: jest.fn(), error: jest.fn(), light: jest.fn(), warning: jest.fn(), selection: jest.fn() } }));
jest.mock('../features/account/useMe', () => ({ useMe: () => ({ data: { id: 'me', username: 'ana', display_name: 'Ana', friend_code: 'ABCD2345' } }) }));
let mockUuid = 0;
jest.mock('expo-crypto', () => ({ randomUUID: () => `client-${++mockUuid}` }));
jest.mock('../services/api', () => ({
  ...jest.requireActual('../services/api'),
  chatApi: { get: jest.fn(), messages: jest.fn(), send: jest.fn(), read: jest.fn(() => Promise.resolve()), vote: jest.fn() },
  tripsApi: { list: jest.fn(), copy: jest.fn() },
  destinationsApi: { list: jest.fn(() => Promise.resolve([])) },
  visitsApi: { forUser: jest.fn(), upsert: jest.fn(() => Promise.resolve([])) },
}));

const chat = chatApi as unknown as Record<string, jest.Mock>;
const trips = tripsApi as unknown as Record<string, jest.Mock>;
const visits = visitsApi as unknown as Record<string, jest.Mock>;

const RAFI = { id: 'rafi', username: 'rafi', display_name: 'Rafi Ahmed', avatar_url: null };
const at = (hour: number) => {
  const d = new Date();
  d.setHours(hour, 5, 0, 0);
  return d.toISOString();
};

const card = (id: number, sender: string, kind: string, payload: Record<string, unknown>, extra: Partial<ChatMessage> = {}): ChatMessage => ({
  id,
  conversation_id: 1,
  sender_id: sender,
  kind,
  body: null,
  payload,
  reply_to_id: null,
  client_id: sender === 'me' ? `old-${id}` : null,
  created_at: at(9),
  deleted: false,
  votes: kind === 'poll' || kind === 'idea' ? {} : null,
  ...extra,
});

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
  created_at: at(8),
};

const TRIP = {
  trip_id: 55, owner_id: 'rafi', owner_name: 'Rafi Ahmed', title: null, destination: "Cox's Bazar",
  start_date: '2027-01-10', end_date: '2027-01-11', days: 2, travelers: 2, stops: 8, region: 'BD-B', lat: 21.43, lon: 91.98,
};
const LAWACHARA = {
  type: 'attraction', id: 77, name: 'Lawachara National Park', category: 'Nature', destination: 'Sreemangal',
  destination_id: 9, hours: 2, region: 'BD-G', lat: 24.32, lon: 91.78,
};
const IDEA = { destination_id: 9, destination: 'Sreemangal', region: 'BD-G', lat: 24.3, lon: 91.7, month: '2026-12', part: 'early', days: 3, note: 'tea gardens' };
const POLL = { question: 'Which weekend?', options: [{ id: 1, text: '3–5 Dec' }, { id: 2, text: '10–12 Dec' }], multiple: false };

const myTrip = (id: number, destination: string, start: string): Trip =>
  ({ id, destination, start_date: start, end_date: start, num_travelers: 2, status: 'generated', user_id: 'me' }) as unknown as Trip;

const clients: QueryClient[] = [];
async function open(messages: ChatMessage[]) {
  chat.get.mockResolvedValue(conversation);
  chat.messages.mockResolvedValue({ messages, has_more: false });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  clients.push(client);
  await render(
    <QueryClientProvider client={client}>
      <ChatScreen />
    </QueryClientProvider>,
  );
  return client;
}
afterEach(() => clients.splice(0).forEach((c) => c.clear()));

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = { id: '1' };
  useChatOutbox.setState({ userId: null, items: [] });
  useVisitOutbox.setState({ userId: null, ops: [] });
  trips.list.mockResolvedValue([]);
  visits.forUser.mockResolvedValue([]);
});

describe('a trip card', () => {
  it("from a friend: shows where and when, opens the plan, and copies it into your trips", async () => {
    trips.copy.mockResolvedValue({ id: 900 });
    await open([card(10, 'rafi', 'trip', TRIP)]);
    const head = await screen.findByLabelText(/^Rafi Ahmed, .+: Trip plan\. Cox’s Bazar|^Rafi Ahmed, .+: Trip plan\. Cox's Bazar/);
    expect(head.props.accessibilityLabel).toMatch(/8 stops$/);
    await fireEvent.press(screen.getByTestId('card-open-10'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/trip/[id]', params: { id: '55' } });
    await fireEvent.press(screen.getByTestId('card-copy-10'));
    expect(trips.copy).toHaveBeenCalledWith(55);
    expect(await screen.findByText('Copied to your trips')).toBeTruthy();
    await fireEvent.press(screen.getByText('Open'));
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/trip/[id]', params: { id: '900' } });
  });

  it('is one screen-reader stop with the menu as an action, not read again through its long-press area (step 10)', async () => {
    await open([card(13, 'me', 'trip', { ...TRIP, owner_id: 'me', owner_name: 'Ana' })]);
    const head = await screen.findByLabelText(/^You, .+: Sent\. Trip plan/);
    expect(head.props.accessibilityActions.map((a: { name: string }) => a.name)).toEqual(['longpress', 'reply']);
    // The area you hold for the menu isn't a stop: it would only read the time and a tick glyph
    expect(screen.getByTestId('chat-message-13').props.importantForAccessibility).toBe('no');
  });

  it("your own trip only opens; one you can't see any more says so, with nothing to press", async () => {
    await open([card(11, 'me', 'trip', { ...TRIP, owner_id: 'me', owner_name: 'Ana' }), card(12, 'rafi', 'trip', { available: false })]);
    await screen.findByTestId('card-open-11');
    expect(screen.queryByTestId('card-copy-11')).toBeNull();
    expect(screen.getByTestId('card-unavailable-12')).toHaveTextContent(/No longer available/);
    expect(screen.queryByTestId('card-open-12')).toBeNull();
  });
});

describe('a place card', () => {
  it("Want to go puts the attraction's division on your Want list", async () => {
    const client = await open([card(20, 'rafi', 'place', LAWACHARA)]);
    await screen.findByText('Lawachara National Park');
    expect(screen.getByText('Nature · Sreemangal · about 2 h')).toBeTruthy();
    // What the server has once the outbox sent it
    visits.forUser.mockResolvedValue([{ place_type: 'region', place_code: 'BD-G', status: 'want' }]);
    await fireEvent.press(screen.getByTestId('card-want-20'));
    expect(visits.upsert).toHaveBeenCalledWith([expect.objectContaining({ place_type: 'region', place_code: 'BD-G', status: 'want' })]);
    await waitFor(() =>
      expect(client.getQueryData<Visit[]>(['visits', 'me'])).toEqual([expect.objectContaining({ place_type: 'region', place_code: 'BD-G', status: 'want' })]),
    );
    expect(await screen.findByText('Sylhet is on your Want list')).toBeTruthy();
    expect(screen.getByTestId('card-want-20')).toHaveTextContent(/On your Want list/);
  });

  it("a division you've been to stays visited", async () => {
    visits.forUser.mockResolvedValue([{ place_type: 'region', place_code: 'BD-G', status: 'visited' }]);
    await open([card(21, 'rafi', 'place', LAWACHARA)]);
    expect(await screen.findByText("You've been")).toBeTruthy();
    expect(screen.getByTestId('card-want-21').props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
  });

  it('Add to a trip: one of your trips there, then its must-dos with the place added', async () => {
    trips.list.mockResolvedValue([myTrip(5, 'Sreemangal', '2099-01-02'), myTrip(6, "Cox's Bazar", '2099-02-02'), myTrip(7, 'Sreemangal', '2001-01-01')]);
    await open([card(22, 'rafi', 'place', LAWACHARA)]);
    await screen.findByText('Lawachara National Park');
    await act(async () => {}); // the trips
    await fireEvent.press(screen.getByTestId('card-second-22'));
    expect(screen.getByText('Add Lawachara National Park to a trip')).toBeTruthy();
    expect(screen.queryByText(/^Cox's Bazar ·/)).toBeNull(); // somewhere else
    expect(screen.getByText('Plan a new trip to Sreemangal')).toBeTruthy();
    await fireEvent.press(screen.getByText(/^Sreemangal · /)); // the coming one, not the past one
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/trip/must-dos/[id]', params: { id: '5', add: '77', addName: 'Lawachara National Park' } });
  });
});

describe('a trip idea', () => {
  it("I'm in shows at once, is sent, and the plan opens the trip wizard", async () => {
    let answer!: (m: ChatMessage) => void;
    chat.vote.mockReturnValue(new Promise((r) => (answer = r)));
    await open([card(30, 'rafi', 'idea', IDEA, { votes: { '2': ['rafi'] } })]);
    expect(await screen.findByText("Let's go to Sreemangal")).toBeTruthy();
    expect(screen.getByText('Early December · 3 days · tea gardens')).toBeTruthy();
    expect(screen.getByTestId('card-who-30')).toHaveTextContent('Maybe: Rafi Ahmed');
    await fireEvent.press(screen.getByTestId('card-answer-in-30'));
    expect(chat.vote).toHaveBeenCalledWith(1, 30, [1]);
    await waitFor(() => expect(screen.getByTestId('card-answer-in-30').props.accessibilityState).toEqual(expect.objectContaining({ checked: true })));
    await waitFor(() => expect(screen.getByTestId('card-who-30')).toHaveTextContent('In: You · Maybe: Rafi Ahmed'));
    await act(async () => answer(card(30, 'rafi', 'idea', IDEA, { votes: { '1': ['me', 'rafi'] } })));
    await waitFor(() => expect(screen.getByTestId('card-who-30')).toHaveTextContent('In: You, Rafi Ahmed'));
    await fireEvent.press(screen.getByTestId('card-plan-30'));
    // Everyone else who's in is invited once the trip is saved (step 7)
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/trip/new', params: { destination: 'Sreemangal', invite: 'rafi' } });
  });

  it('an answer the server refuses goes back as it was', async () => {
    chat.vote.mockRejectedValue(new Error('You can only answer in a chat with a friend'));
    await open([card(31, 'rafi', 'idea', IDEA)]);
    await fireEvent.press(await screen.findByTestId('card-answer-out-31'));
    expect(await screen.findByText('You can only answer in a chat with a friend')).toBeTruthy();
    expect(screen.getByTestId('card-answer-out-31').props.accessibilityState).toEqual(expect.objectContaining({ checked: false }));
  });
});

describe('a poll', () => {
  it('one answer each, taken back by tapping it again', async () => {
    chat.vote.mockImplementation((_c: number, _m: number, ids: number[]) =>
      Promise.resolve(card(40, 'rafi', 'poll', POLL, { votes: Object.fromEntries(ids.map((i) => [String(i), ['me']])) })),
    );
    await open([card(40, 'rafi', 'poll', POLL)]);
    expect(await screen.findByText('No answers yet')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('card-option-2-40'));
    expect(chat.vote).toHaveBeenLastCalledWith(1, 40, [2]);
    expect(await screen.findByText('1 person answered')).toBeTruthy();
    expect(screen.getByTestId('card-option-2-40').props.accessibilityLabel).toBe('10–12 Dec, 1 vote');
    await fireEvent.press(screen.getByTestId('card-option-2-40'));
    expect(chat.vote).toHaveBeenLastCalledWith(1, 40, []);
  });

  it("keeps every answer's border while you change your answer, and clips nothing (step 10)", async () => {
    // On Android a rounded row that clipped its children and lost its border stopped drawing
    // them: after a few taps an answer's text was gone. The rows now keep one border width
    // (only its colour shows the choice) and don't clip.
    chat.vote.mockImplementation((_c: number, _m: number, ids: number[]) =>
      Promise.resolve(card(41, 'me', 'poll', POLL, { votes: Object.fromEntries(ids.map((i) => [String(i), ['me']])) })),
    );
    await open([card(41, 'me', 'poll', POLL)]);
    const row = (id: number) => StyleSheet.flatten(screen.getByTestId(`card-option-${id}-41`).props.style);
    const check = () => {
      for (const id of [1, 2]) {
        expect(row(id).borderWidth).toBe(1.5);
        expect(row(id).overflow).not.toBe('hidden');
      }
    };
    await screen.findByTestId('card-option-1-41');
    check();
    for (const id of [1, 2, 1]) {
      await fireEvent.press(screen.getByTestId(`card-option-${id}-41`));
      await waitFor(() => expect(screen.getByTestId(`card-option-${id}-41`).props.accessibilityState.checked).toBe(true));
      check();
    }
  });

  it('several answers when the poll allows it', async () => {
    chat.vote.mockImplementation(() => new Promise(() => {}));
    await open([card(41, 'rafi', 'poll', { ...POLL, multiple: true }, { votes: { '1': ['me'] } })]);
    await fireEvent.press(await screen.findByTestId('card-option-2-41'));
    expect(chat.vote).toHaveBeenLastCalledWith(1, 41, [1, 2]);
  });
});

describe('sharing from the chat', () => {
  it('the + offers your coming trips; one goes into the chat at once', async () => {
    trips.list.mockResolvedValue([myTrip(5, 'Sreemangal', '2099-01-02')]);
    chat.send.mockReturnValue(new Promise(() => {}));
    await open([]);
    await fireEvent.press(await screen.findByTestId('chat-share'));
    await fireEvent.press(await screen.findByTestId('share-trip-5'));
    const item = useChatOutbox.getState().items[0];
    expect(item).toEqual(expect.objectContaining({ kind: 'trip', payload: { trip_id: 5 }, conversationId: 1 }));
    expect(chat.send).toHaveBeenCalledWith(1, { client_id: item.clientId, kind: 'trip', payload: { trip_id: 5 } });
    // Shown at once, while it's sending
    expect(screen.getByTestId(`card-trip-${item.clientId}`)).toBeTruthy();
    expect(screen.getByTestId(`card-open-${item.clientId}`).props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
  });

  it('the tiles open the screens for a trip, a place, an idea and a poll', async () => {
    await open([]);
    await fireEvent.press(await screen.findByTestId('chat-share'));
    await fireEvent.press(screen.getByTestId('share-poll'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/chat/share/poll', params: { chat: '1' } });
  });
});

/**
 * Trip rooms (docs/friends-chat-plan.md, step 7; mockups 9 and 10): the room's lines,
 * its header and plan bar, names on bubbles, suggestions only the owner adds, invite
 * cards, and "Plan together".
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import ChatScreen from '../../app/chat/[id]';
import InviteScreen from '../../app/trip/invite/[id]';
import { chatName, systemText } from '../features/chat/format';
import { useChatOutbox } from '../features/chat/outbox';
import { planLines, planWhen } from '../features/chat/PlanBar';
import { useVisitOutbox } from '../features/map/visits';
import i18n from '../i18n';
import { chatApi, friendsApi, roomsApi, tripsApi, visitsApi } from '../services/api';
import type { ChatMessage, Conversation, RoomTrip } from '../types';

const mockPush = jest.fn();
const mockReplace = jest.fn();
let mockParams: Record<string, string> = {};
let mockMe = 'ana';
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace, back: jest.fn() }),
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
jest.mock('../features/account/useMe', () => ({
  ME_QUERY_KEY: ['me'],
  useMe: () => ({ data: { id: mockMe, username: mockMe, display_name: mockMe === 'ana' ? 'Ana' : 'Bob', friend_code: 'ABCD2345' } }),
}));
let mockUuid = 0;
jest.mock('expo-crypto', () => ({ randomUUID: () => `client-${++mockUuid}` }));
jest.mock('../services/api', () => ({
  ...jest.requireActual('../services/api'),
  chatApi: { list: jest.fn(() => Promise.resolve([])), get: jest.fn(), messages: jest.fn(), send: jest.fn(), read: jest.fn(() => Promise.resolve()) },
  roomsApi: {
    members: jest.fn(),
    invite: jest.fn(),
    join: jest.fn(),
    remove: jest.fn(),
    accept: jest.fn(),
    decline: jest.fn(),
    joined: jest.fn(() => Promise.resolve([])),
  },
  friendsApi: { list: jest.fn(), onTheRoad: jest.fn(() => Promise.resolve([])) },
  tripsApi: { list: jest.fn(() => Promise.resolve([])), get: jest.fn() },
  destinationsApi: { list: jest.fn(() => Promise.resolve([])) },
  visitsApi: { forUser: jest.fn(() => Promise.resolve([])), upsert: jest.fn(() => Promise.resolve([])) },
}));

const chat = chatApi as unknown as Record<string, jest.Mock>;
const rooms = roomsApi as unknown as Record<string, jest.Mock>;
const friends = friendsApi as unknown as Record<string, jest.Mock>;
const trips = tripsApi as unknown as Record<string, jest.Mock>;
void visitsApi;
const t = i18n.t.bind(i18n);

const ANA = { id: 'ana', username: 'ana', display_name: 'Ana Rahman', avatar_url: null };
const BOB = { id: 'bob', username: 'bob', display_name: 'Bob Khan', avatar_url: null };
const CARA = { id: 'cara', username: 'cara', display_name: 'Cara', avatar_url: null };

const inDays = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const TRIP: RoomTrip = {
  id: 91,
  title: null,
  destination: 'Sreemangal',
  start_date: inDays(36),
  end_date: inDays(38),
  owner_id: 'ana',
  stops: 9,
  preview: [
    { day: 1, places: ['Lawachara', 'Nilkantha Tea Cabin'] },
    { day: 2, places: ['Madhabpur Lake'] },
  ],
};
const ROOM: Conversation = {
  id: 7,
  kind: 'trip',
  other: null,
  trip_id: 91,
  trip: TRIP,
  members: [ANA, BOB, CARA],
  can_send: true,
  read_only_reason: null,
  last_message: null,
  unread_count: 0,
  last_read_message_id: 0,
  other_read_up_to: null,
  muted_until: null,
  created_at: inDays(-1),
};
const message = (id: number, sender: string | null, extra: Partial<ChatMessage>): ChatMessage => ({
  id,
  conversation_id: 7,
  sender_id: sender,
  kind: 'text',
  body: null,
  payload: null,
  reply_to_id: null,
  client_id: sender === mockMe ? `old-${id}` : null,
  created_at: new Date().toISOString(),
  deleted: false,
  votes: null,
  reactions: {},
  reply_to: null,
  ...extra,
});
const system = (id: number, payload: Record<string, unknown>) => message(id, null, { kind: 'system', payload });
const LAKE = {
  type: 'attraction',
  id: 501,
  name: 'Madhabpur Lake',
  category: 'Lake',
  destination: 'Sreemangal',
  destination_id: 9,
  hours: 1.5,
  region: 'BD-G',
};

const clients: QueryClient[] = [];
async function show(ui: React.ReactElement, seed?: (c: QueryClient) => void) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  seed?.(client);
  clients.push(client);
  await render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
  return client;
}
async function openRoom(messages: ChatMessage[]) {
  mockParams = { id: '7' };
  chat.get.mockResolvedValue(ROOM);
  chat.messages.mockResolvedValue({ messages, has_more: false });
  await show(<ChatScreen />);
  await screen.findByTestId('room-plan-bar');
}
afterEach(() => clients.splice(0).forEach((c) => c.clear()));
beforeEach(() => {
  jest.clearAllMocks();
  mockMe = 'ana';
  useChatOutbox.setState({ userId: null, items: [] });
  useVisitOutbox.setState({ userId: null, ops: [] });
});

describe('what the room says', () => {
  const at = (p: Record<string, unknown>) => system(1, p);
  const a = { id: 'ana', name: 'Ana' };
  const b = { id: 'bob', name: 'Bob' };
  const c = { id: 'cara', name: 'Cara' };

  it('lines read from where you stand', () => {
    expect(systemText(at({ event: 'invited', actor: a, targets: [b, c] }), t, 'ana')).toBe('You invited Bob and Cara');
    expect(systemText(at({ event: 'invited', actor: a, targets: [b, c] }), t, 'bob')).toBe('Ana invited you and Cara');
    expect(systemText(at({ event: 'joined', actor: b }), t, 'bob')).toBe('You joined');
    expect(systemText(at({ event: 'joined', actor: b }), t, 'ana')).toBe('Bob joined');
    expect(systemText(at({ event: 'left', actor: b }), t, 'ana')).toBe('Bob left');
    expect(systemText(at({ event: 'removed', actor: a, target: c }), t, 'cara')).toBe('Ana removed you');
    expect(systemText(at({ event: 'removed', actor: a, target: c }), t, 'ana')).toBe('You removed Cara');
    expect(systemText(at({ event: 'added', actor: a, place: 'Madhabpur Lake', day: 2 }), t, 'ana')).toBe('You added Madhabpur Lake to Day 2');
    expect(systemText(at({ event: 'added', actor: a, place: 'Madhabpur Lake', day: 2 }), t, 'bob')).toBe('Ana added Madhabpur Lake to Day 2');
    expect(systemText(at({ event: 'something new' }), t, 'ana')).toBe('Vromon updated this chat');
  });

  it("a room is named after its trip, and the plan bar says when and what's planned", () => {
    expect(chatName(ROOM, t)).toBe('Sreemangal trip');
    expect(chatName({ ...ROOM, trip: { ...TRIP, title: 'Tea country' } }, t)).toBe('Tea country');
    const n = (v: number) => String(v);
    expect(planLines(TRIP, t, n)).toEqual({ title: 'The plan · 9 stops · in 36 days', preview: 'Day 1 Lawachara, Nilkantha Tea Cabin · Day 2 Madhabpur Lake' });
    expect(planWhen({ start_date: inDays(-1), end_date: inDays(1) }, t, n)).toBe('day 2 of 3');
    expect(planWhen({ start_date: inDays(1), end_date: inDays(2) }, t, n)).toBe('tomorrow');
    expect(planWhen({ start_date: inDays(-5), end_date: inDays(-3) }, t, n)).toBe('ended');
  });
});

describe('the room', () => {
  it("the header names the trip and who's in it; the plan bar opens the trip", async () => {
    await openRoom([system(1, { event: 'joined', actor: { id: 'bob', name: 'Bob' } })]);
    expect(screen.getByTestId('chat-header')).toHaveTextContent(/Sreemangal trip/);
    expect(screen.getByTestId('room-members-line')).toHaveTextContent(/· you, Bob and Cara$/);
    expect(screen.getByText('Bob joined')).toBeTruthy();
    expect(screen.getByPlaceholderText('Message the trip room')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('room-plan-bar'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/trip/[id]', params: { id: '91' } });
  });

  it("other people's bubbles carry their name", async () => {
    await openRoom([message(2, 'bob', { body: "I'll book the cottage" })]);
    expect(screen.getByText('Bob Khan')).toBeTruthy();
  });

  it('the owner adds a suggestion to a chosen day, or says not this time', async () => {
    rooms.accept.mockResolvedValue(message(3, 'bob', { kind: 'place', payload: { ...LAKE, suggestion: { status: 'added', day: 2 } } }));
    rooms.decline.mockResolvedValue(message(4, 'cara', { kind: 'place', payload: { ...LAKE, suggestion: { status: 'declined', day: null } } }));
    await openRoom([
      message(3, 'bob', { kind: 'place', payload: { ...LAKE, suggestion: { status: 'open', day: null } } }),
      message(4, 'cara', { kind: 'place', payload: { ...LAKE, suggestion: { status: 'open', day: null } } }),
    ]);
    expect(screen.getAllByText('Suggested for the plan')).toHaveLength(2);
    await fireEvent.press(screen.getByTestId('card-add-day-3'));
    expect(screen.getByText('Add Madhabpur Lake to which day?')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('action-day-2'));
    expect(rooms.accept).toHaveBeenCalledWith(91, 3, 2);
    await waitFor(() => expect(screen.getByTestId('card-suggestion-3')).toHaveTextContent(/Added to Day 2$/));
    await fireEvent.press(screen.getByTestId('card-not-now-4'));
    expect(rooms.decline).toHaveBeenCalledWith(91, 4);
    await waitFor(() => expect(screen.getByTestId('card-suggestion-4')).toHaveTextContent('Not this time'));
  });

  it("a member can't add it: they see who decides", async () => {
    mockMe = 'bob';
    await openRoom([message(3, 'cara', { kind: 'place', payload: { ...LAKE, suggestion: { status: 'open', day: null } } })]);
    expect(screen.queryByTestId('card-add-day-3')).toBeNull();
    expect(screen.getByTestId('card-suggestion-3')).toHaveTextContent('Waiting for Ana Rahman');
  });

  it('a member can leave; the owner can invite more', async () => {
    mockMe = 'bob';
    await openRoom([]);
    await fireEvent.press(screen.getByTestId('chat-menu'));
    expect(screen.getByTestId('action-leave')).toBeTruthy();
    expect(screen.queryByTestId('action-invite')).toBeNull();
    clients.splice(0).forEach((c) => c.clear());
    mockMe = 'ana';
    await openRoom([]);
    await fireEvent.press(screen.getByTestId('chat-menu'));
    expect(screen.queryByTestId('action-leave')).toBeNull();
    await fireEvent.press(screen.getByTestId('action-invite'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/trip/invite/[id]', params: { id: '91' } });
  });
});

describe('an invite card', () => {
  const direct: Conversation = { ...ROOM, id: 3, kind: 'direct', other: ANA, trip_id: null, trip: null, members: [] };
  const invite = (status: string, roomId: number | null) =>
    message(10, 'ana', {
      conversation_id: 3,
      kind: 'invite',
      payload: {
        trip_id: 91,
        owner_id: 'ana',
        owner_name: 'Ana Rahman',
        title: null,
        destination: 'Sreemangal',
        start_date: TRIP.start_date,
        end_date: TRIP.end_date,
        days: 3,
        travelers: 2,
        stops: 9,
        room: { status, conversation_id: roomId },
      },
    });
  beforeEach(() => {
    mockMe = 'bob';
    mockParams = { id: '3' };
    chat.get.mockResolvedValue(direct);
  });

  it('Join puts you in the room and opens it; Not now turns it down', async () => {
    rooms.join.mockResolvedValue({ trip_id: 91, conversation_id: 7, members: [] });
    rooms.remove.mockResolvedValue(undefined);
    chat.messages.mockResolvedValue({ messages: [invite('invited', null)], has_more: false });
    await show(<ChatScreen />);
    expect(await screen.findByTestId('card-invite-10')).toHaveTextContent(/Plan together.*Sreemangal trip/);
    await fireEvent.press(screen.getByTestId('card-join-10'));
    expect(rooms.join).toHaveBeenCalledWith(91);
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith({ pathname: '/chat/[id]', params: { id: '7' } }));
    await fireEvent.press(screen.getByTestId('card-decline-10'));
    expect(rooms.remove).toHaveBeenCalledWith(91, 'bob');
  });

  it('once in, it opens the room; once out, it says so', async () => {
    chat.messages.mockResolvedValue({ messages: [invite('joined', 7), { ...invite('none', null), id: 11 }], has_more: false });
    await show(<ChatScreen />);
    await fireEvent.press(await screen.findByTestId('card-room-10'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/chat/[id]', params: { id: '7' } });
    expect(screen.getByTestId('card-invite-11')).toHaveTextContent(/You're not in this trip room/);
    expect(screen.queryByTestId('card-join-11')).toBeNull();
  });
});

describe('Plan together', () => {
  const friend = (p: typeof BOB) => ({ ...p, since: '2026-01-01T00:00:00', countries: 1, world_percent: 1 });
  beforeEach(() => {
    mockParams = { id: '91' };
    trips.get.mockResolvedValue({ id: 91, destination: 'Sreemangal', start_date: TRIP.start_date, end_date: TRIP.end_date });
    rooms.members.mockResolvedValue({ trip_id: 91, conversation_id: null, members: [{ user: ANA, status: 'owner' }] });
    friends.list.mockResolvedValue([friend(CARA), friend(BOB), friend({ id: 'zed', username: 'zed', display_name: 'Zed', avatar_url: null })]);
  });

  it("friends who said I'm in to an idea there come first, ticked; inviting opens the room", async () => {
    rooms.invite.mockResolvedValue({ trip_id: 91, conversation_id: 7, members: [] });
    await show(<InviteScreen />, (c) =>
      // A trip idea in a chat already on the phone: Bob's in, Cara maybe
      c.setQueryData(['chat', 'thread', 3], {
        hasOlder: false,
        messages: [
          message(5, 'ana', { kind: 'idea', conversation_id: 3, payload: { destination: 'Sreemangal' }, votes: { '1': ['bob', 'ana'], '2': ['cara'] } }),
        ],
      }),
    );
    const bob = await screen.findByTestId('invite-friend-bob');
    expect(bob).toHaveTextContent(/Said "I'm in" to Sreemangal/);
    expect(screen.getByTestId('invite-friend-cara')).toHaveTextContent(/Said "maybe"/);
    expect(bob.props.accessibilityState).toEqual(expect.objectContaining({ checked: true }));
    expect(screen.getByTestId('invite-friend-zed').props.accessibilityState).toEqual(expect.objectContaining({ checked: false }));
    expect(screen.getByTestId('invite-button')).toHaveTextContent('Invite 2 friends');
    await fireEvent.press(screen.getByTestId('invite-friend-cara')); // untick
    await fireEvent.changeText(screen.getByTestId('invite-note'), 'Tea gardens!');
    await fireEvent.press(screen.getByTestId('invite-button'));
    expect(rooms.invite).toHaveBeenCalledWith(91, ['bob'], 'Tea gardens!');
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith({ pathname: '/chat/[id]', params: { id: '7' } }));
  });

  it("someone already in the room can't be picked again", async () => {
    rooms.members.mockResolvedValue({
      trip_id: 91,
      conversation_id: 7,
      members: [
        { user: ANA, status: 'owner' },
        { user: BOB, status: 'joined' },
      ],
    });
    await show(<InviteScreen />);
    const bob = await screen.findByTestId('invite-friend-bob');
    await waitFor(() => expect(bob).toHaveTextContent(/In the trip room/));
    expect(screen.getByTestId('invite-friend-bob').props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
  });
});

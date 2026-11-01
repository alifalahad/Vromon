/**
 * On the trip, in its room (docs/friends-chat-plan.md, step 8; mockup 11): the quick
 * chips, "I'm here", "Running late", live location with its bar and Stop, and the cards.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as Location from 'expo-location';
import React from 'react';

import ChatScreen from '../../app/chat/[id]';
import { checkinText, lateText } from '../features/chat/cards/OnTripCards';
import { useLiveShare, untilFor } from '../features/chat/liveShare';
import { tripIsOn } from '../features/chat/onTheTrip';
import { useChatOutbox } from '../features/chat/outbox';
import { localToday } from '../features/trips/dates';
import i18n from '../i18n';
import { chatApi } from '../services/api';
import type { ChatMessage, Conversation, RoomTrip } from '../types';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({ id: '7' }),
  useFocusEffect: (effect: () => void) => jest.requireActual('react').useEffect(effect, [effect]),
  Stack: { Screen: () => null },
}));
jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);
jest.mock('../ui/haptics', () => ({ haptic: jest.fn(), haptics: { success: jest.fn(), error: jest.fn(), light: jest.fn(), warning: jest.fn(), selection: jest.fn() } }));
jest.mock('../features/account/useMe', () => ({ ME_QUERY_KEY: ['me'], useMe: () => ({ data: { id: 'ana', username: 'ana', display_name: 'Ana', friend_code: 'ABCD2345' } }) }));
let mockUuid = 0;
jest.mock('expo-crypto', () => ({ randomUUID: () => `client-${++mockUuid}` }));
jest.mock('../services/api', () => ({
  ...jest.requireActual('../services/api'),
  chatApi: {
    list: jest.fn(() => Promise.resolve([])), get: jest.fn(), messages: jest.fn(), send: jest.fn(() => new Promise(() => {})),
    read: jest.fn(() => Promise.resolve()), startLive: jest.fn(), updateLive: jest.fn(), stopLive: jest.fn(() => Promise.resolve()),
  },
  roomsApi: { joined: jest.fn(() => Promise.resolve([])) },
  friendsApi: { onTheRoad: jest.fn(() => Promise.resolve([])) },
  tripsApi: { list: jest.fn(() => Promise.resolve([])) },
  destinationsApi: { list: jest.fn(() => Promise.resolve([])) },
  visitsApi: { forUser: jest.fn(() => Promise.resolve([])) },
}));

const chat = chatApi as unknown as Record<string, jest.Mock>;
const t = i18n.t.bind(i18n);
const n = (v: number) => String(v);
const time = (hhmm: string) => hhmm;

const ANA = { id: 'ana', username: 'ana', display_name: 'Ana', avatar_url: null };
const BOB = { id: 'bob', username: 'bob', display_name: 'Bob', avatar_url: null };
const today = localToday();
const plusDays = (d: number) => {
  const x = new Date();
  x.setDate(x.getDate() + d);
  return localToday(x);
};
const trip = (start: string, end: string): RoomTrip => ({ id: 91, title: null, destination: "Cox's Bazar", start_date: start, end_date: end, owner_id: 'ana', stops: 6, preview: [] });
const room = (tr: RoomTrip): Conversation => ({
  id: 7, kind: 'trip', other: null, trip_id: 91, trip: tr, members: [ANA, BOB], can_send: true, read_only_reason: null, last_message: null,
  unread_count: 0, last_read_message_id: 0, other_read_up_to: null, muted_until: null, created_at: plusDays(-3),
});
const liveCard = (payload: Record<string, unknown>, sender = 'ana'): ChatMessage => ({
  id: 40, conversation_id: 7, sender_id: sender, kind: 'live', body: null, payload, reply_to_id: null, client_id: null,
  created_at: new Date().toISOString(), deleted: false, votes: null, reactions: {}, reply_to: null,
});

const clients: QueryClient[] = [];
async function openRoom(tr: RoomTrip, messages: ChatMessage[] = []) {
  chat.get.mockResolvedValue(room(tr));
  chat.messages.mockResolvedValue({ messages, has_more: false });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  clients.push(client);
  await render(
    <QueryClientProvider client={client}>
      <ChatScreen />
    </QueryClientProvider>,
  );
  await screen.findByTestId('room-plan-bar');
}
afterEach(() => clients.splice(0).forEach((c) => c.clear()));
beforeEach(() => {
  jest.clearAllMocks();
  useChatOutbox.setState({ userId: null, items: [] });
  useLiveShare.setState({ share: null });
});

const allowLocation = () => {
  (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
  (Location.getCurrentPositionAsync as jest.Mock).mockResolvedValue({ coords: { latitude: 21.43, longitude: 92.0, accuracy: 9 } });
};

describe('how the cards read', () => {
  it("I'm here: the stop and against the plan, roughly where, or just checked in", () => {
    expect(checkinText({ day: 1, time: '09:40', stop: 'Lawachara National Park', planned: '09:30', late_by: 10 }, t, time, n)).toEqual({
      title: 'Reached Lawachara National Park',
      line: '09:40 · planned for 09:30',
    });
    expect(checkinText({ day: 1, time: '09:32', stop: 'Lawachara', planned: '09:30', late_by: 2 }, t, time, n).line).toBe('09:32 · on time');
    expect(checkinText({ day: 1, time: '10:00', near: "Cox's Bazar" }, t, time, n).title).toBe("Near Cox's Bazar");
    expect(checkinText({ day: 1, time: '10:00', near: null }, t, time, n).title).toBe('Checked in');
  });

  it('running late: by how much, for which stop, and from Today', () => {
    expect(lateText({ day: 1, time: '11:05', minutes: 20, stop: 'Nilkantha Tea Cabin', source: 'today' }, t, n)).toEqual({
      title: 'Running about 20 min late for Nilkantha Tea Cabin',
      line: 'Sent from Today',
    });
    expect(lateText({ day: 1, time: '11:05', minutes: 20, stop: null, source: 'room' }, t, n)).toEqual({ title: 'Running about 20 min late', line: null });
  });

  it('the trip is on from its first day to its last; live location lasts 15 min, an hour or until the end of the day', () => {
    expect(tripIsOn({ start_date: today, end_date: plusDays(1) })).toBe(true);
    expect(tripIsOn({ start_date: plusDays(1), end_date: plusDays(2) })).toBe(false);
    const now = new Date(2026, 10, 1, 10, 0);
    expect(untilFor('15m', now).getTime() - now.getTime()).toBe(15 * 60_000);
    expect(untilFor('1h', now).getTime() - now.getTime()).toBe(60 * 60_000);
    expect(untilFor('day', now).getHours()).toBe(23);
  });
});

describe('in the room, on a day of the trip', () => {
  it("quick chips: I'm here sends one reading; Running late sends by how much", async () => {
    allowLocation();
    await openRoom(trip(today, plusDays(1)));
    await act(async () => fireEvent.press(screen.getByTestId('chip-checkin')));
    await waitFor(() =>
      expect(chat.send).toHaveBeenCalledWith(7, {
        client_id: expect.any(String),
        kind: 'checkin',
        payload: { lat: 21.43, lon: 92.0, date: today, time: expect.stringMatching(/^\d\d:\d\d$/) },
      }),
    );
    await fireEvent.press(screen.getByTestId('chip-late'));
    await fireEvent.press(screen.getByTestId('action-late-20'));
    // Queued behind the check-in: the outbox sends in order
    expect(useChatOutbox.getState().items.map((i) => [i.kind, i.payload])).toEqual([
      ['checkin', expect.objectContaining({ lat: 21.43 })],
      ['late', { minutes: 20, source: 'room', date: today, time: expect.any(String) }],
    ]);
  });

  it('without location allowed, it says so and sends nothing', async () => {
    (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'denied' });
    await openRoom(trip(today, plusDays(1)));
    await act(async () => fireEvent.press(screen.getByTestId('chip-checkin')));
    expect(await screen.findByText('Allow location to check in or share where you are')).toBeTruthy();
    expect(chat.send).not.toHaveBeenCalled();
  });

  it('live location: started from the + sheet for 15 minutes, a bar with Stop, and Stop ends it', async () => {
    allowLocation();
    chat.startLive.mockResolvedValue(liveCard({ active: true, until: new Date(Date.now() + 15 * 60_000).toISOString(), lat: 21.43, lon: 92.0 }));
    await openRoom(trip(today, plusDays(1)));
    await fireEvent.press(screen.getByTestId('chat-share'));
    expect(screen.getByTestId('share-checkin')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('share-live'));
    await act(async () => fireEvent.press(screen.getByTestId('action-live-15m')));
    await waitFor(() => expect(chat.startLive).toHaveBeenCalled());
    const body = chat.startLive.mock.calls[0][1];
    expect(body).toEqual(expect.objectContaining({ lat: 21.43, lon: 92.0, accuracy_m: 9, date: today }));
    expect(Math.abs(Date.parse(body.until) - Date.now() - 15 * 60_000)).toBeLessThan(5_000);
    expect(useLiveShare.getState().share).toEqual(expect.objectContaining({ conversationId: 7 }));
    expect(await screen.findByTestId('live-share-bar-inline')).toHaveTextContent(/You're sharing your live location/);
    expect(await screen.findByTestId('card-live-40')).toHaveTextContent(/Live location/);
    await act(async () => fireEvent.press(screen.getByTestId('live-share-stop-inline')));
    expect(chat.stopLive).toHaveBeenCalledWith(7);
    expect(useLiveShare.getState().share).toBeNull();
  });

  it('an ended live location shows no map and no point', async () => {
    await openRoom(trip(today, plusDays(1)), [liveCard({ active: false, until: new Date().toISOString() }, 'bob')]);
    expect(await screen.findByTestId('card-live-40')).toHaveTextContent(/Live location ended/);
    expect(screen.queryByTestId('card-live-view-40')).toBeNull();
  });
});

describe('in the room, before the trip', () => {
  it("no chips, and the + sheet has no I'm here or live location", async () => {
    await openRoom(trip(plusDays(3), plusDays(4)));
    expect(screen.queryByTestId('chip-checkin')).toBeNull();
    await fireEvent.press(screen.getByTestId('chat-share'));
    expect(screen.queryByTestId('share-live')).toBeNull();
  });
});

/**
 * On the road (docs/friends-chat-plan.md, step 6; mockups 1 and 3): how a friend's
 * trip reads, the strip on Chats, the chat header line, the profile chip, and the
 * setting that hides your trips from friends (decisions C3 and C7).
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import FriendsScreen from '../../app/(tabs)/friends';
import ChatScreen from '../../app/chat/[id]';
import FriendScreen from '../../app/friends/[id]';
import ChatSettingsScreen from '../../app/settings/chats';
import { useChatOutbox } from '../features/chat/outbox';
import { progress, stripLabel, stripLine, tripLine } from '../features/friends/onTheRoad';
import { usePreferences } from '../features/preferences/store';
import { localToday } from '../features/trips/dates';
import i18n from '../i18n';
import { chatApi, friendsApi } from '../services/api';
import type { Conversation, OnTheRoad, RoadTrip } from '../types';

const mockPush = jest.fn();
let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => mockParams,
  useScrollToTop: jest.fn(),
  useFocusEffect: (effect: () => void) => jest.requireActual('react').useEffect(effect, [effect]),
  useIsFocused: () => true,
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
  useMe: () => ({ data: { id: 'me', username: 'ana', display_name: 'Ana', friend_code: 'ABCD2345' } }),
}));
jest.mock('../features/account/exportData', () => ({ exportMyData: jest.fn(() => Promise.resolve()) }));
// The profile's map and photos aren't what's tested here
jest.mock('../features/mapThemes/ThemePreviewMap', () => ({ ThemePreviewMap: () => null }));
jest.mock('../features/photos/PhotoStrip', () => ({ PhotoGrid: () => null }));
jest.mock('../services/api', () => ({
  ...jest.requireActual('../services/api'),
  friendsApi: {
    list: jest.fn(() => Promise.resolve([])),
    requests: jest.fn(() => Promise.resolve([])),
    onTheRoad: jest.fn(),
    profile: jest.fn(),
    trips: jest.fn(),
    remove: jest.fn(),
    block: jest.fn(),
  },
  chatApi: { list: jest.fn(() => Promise.resolve([])), open: jest.fn(), get: jest.fn(), messages: jest.fn(), read: jest.fn(() => Promise.resolve()) },
  visitsApi: { forUser: jest.fn(() => Promise.resolve([])), stats: jest.fn(() => Promise.resolve(null)) },
  tripsApi: { list: jest.fn(() => Promise.resolve([])) },
  destinationsApi: { list: jest.fn(() => Promise.resolve([])) },
}));

const friends = friendsApi as unknown as Record<string, jest.Mock>;
const chat = chatApi as unknown as Record<string, jest.Mock>;
const t = i18n.t.bind(i18n);
const n = (v: number) => String(v);

const RAFI = { id: 'rafi', username: 'rafi', display_name: 'Rafi Ahmed', avatar_url: null };
const TANVIR = { id: 'tanvir', username: 'tanvir', display_name: 'Tanvir Hasan', avatar_url: null };

/** A local date `days` from today, YYYY-MM-DD */
const inDays = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return localToday(d);
};
const onTrip: RoadTrip = { trip_id: 91, destination: 'Sylhet', start_date: inDays(-1), end_date: inDays(1), day: 2, days: 3, starts_in: 0 };
const soon = (startsIn: number): RoadTrip => ({
  trip_id: 92,
  destination: 'Bandarban',
  start_date: inDays(startsIn),
  end_date: inDays(startsIn + 1),
  day: null,
  days: 2,
  starts_in: startsIn,
});
const ROAD: OnTheRoad[] = [
  { friend: RAFI, trip: onTrip },
  { friend: TANVIR, trip: soon(3) },
];

const clients: QueryClient[] = [];
async function show(ui: React.ReactElement, seed?: (client: QueryClient) => void) {
  // Like the app's: data counts as fresh for 5 minutes
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity, staleTime: 5 * 60_000 } } });
  seed?.(client);
  clients.push(client);
  await render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
  return client;
}
afterEach(() => clients.splice(0).forEach((c) => c.clear()));
beforeEach(() => {
  jest.clearAllMocks();
  mockParams = {};
  friends.onTheRoad.mockResolvedValue(ROAD);
  friends.list.mockResolvedValue([RAFI, TANVIR].map((f) => ({ ...f, since: '2026-01-01T00:00:00', countries: 1, world_percent: 1 })));
});

describe('how a trip reads', () => {
  it('on a trip: the day, with a ring that far round', () => {
    expect(stripLine(onTrip, t, 'en', n)).toBe('Sylhet · day 2');
    expect(stripLabel('Rafi Ahmed', onTrip, t, 'en', n)).toBe('Rafi Ahmed, in Sylhet, day 2 of 3');
    expect(tripLine(onTrip, t, 'en', n)).toBe('On a trip · Sylhet, day 2');
    expect(progress(onTrip)).toBeCloseTo(2 / 3);
  });

  it('leaving soon: tomorrow, a weekday this week, a date after that; a dashed ring', () => {
    expect(stripLine(soon(1), t, 'en', n)).toBe('Bandarban · tomorrow');
    const weekday = (d: number, long: boolean) => new Date(`${inDays(d)}T00:00:00`).toLocaleDateString('en', { weekday: long ? 'long' : 'short' });
    expect(stripLine(soon(3), t, 'en', n)).toBe(`Bandarban · ${weekday(3, false)}`);
    expect(stripLabel('Tanvir Hasan', soon(3), t, 'en', n)).toBe(`Tanvir Hasan, Bandarban from ${weekday(3, true)}`);
    const date = new Date(`${inDays(10)}T00:00:00`).toLocaleDateString('en', { day: 'numeric', month: 'short' });
    expect(stripLine(soon(10), t, 'en', n)).toBe(`Bandarban · ${date}`);
    expect(tripLine(soon(1), t, 'en', n)).toBe('Trip to Bandarban · tomorrow');
    expect(progress(soon(3))).toBeNull();
  });
});

describe('the strip on Chats', () => {
  it('shows friends who are away; tap opens your chat, hold opens their trip', async () => {
    chat.open.mockResolvedValue({ id: 7 });
    await show(<FriendsScreen />);
    expect(await screen.findByTestId('on-the-road')).toBeTruthy();
    expect(friends.onTheRoad).toHaveBeenCalledWith(localToday());
    const rafi = screen.getByTestId('road-rafi');
    expect(rafi.props.accessibilityLabel).toBe('Rafi Ahmed, in Sylhet, day 2 of 3');
    expect(rafi).toHaveTextContent(/Rafi.*Sylhet · day 2/);
    await fireEvent.press(rafi);
    expect(chat.open).toHaveBeenCalledWith('rafi');
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith({ pathname: '/chat/[id]', params: { id: '7' } }));
    await fireEvent(screen.getByTestId('road-tanvir'), 'longPress');
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/trip/[id]', params: { id: '92' } });
    // And for screen readers, as an action
    await fireEvent(screen.getByTestId('road-rafi'), 'accessibilityAction', { nativeEvent: { actionName: 'openTrip' } });
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/trip/[id]', params: { id: '91' } });
  });

  it('is hidden when nobody is away', async () => {
    friends.onTheRoad.mockResolvedValue([]);
    await show(<FriendsScreen />);
    await screen.findByTestId('friends-segment');
    expect(screen.queryByTestId('on-the-road')).toBeNull();
  });
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
  created_at: inDays(-5),
};

describe('the chat header', () => {
  beforeEach(() => {
    mockParams = { id: '1' };
    useChatOutbox.setState({ userId: null, items: [] });
    chat.get.mockResolvedValue(conversation);
    chat.messages.mockResolvedValue({ messages: [], has_more: false });
  });

  it('says where they are, and screen readers hear it with the name', async () => {
    await show(<ChatScreen />);
    expect(await screen.findByTestId('chat-header-trip')).toHaveTextContent(/On a trip · Sylhet, day 2$/);
    expect(screen.getByTestId('chat-header').props.accessibilityLabel).toBe("Open Rafi Ahmed's profile. On a trip · Sylhet, day 2");
  });

  it("has no line when they aren't away (or hide their trips)", async () => {
    friends.onTheRoad.mockResolvedValue([]);
    await show(<ChatScreen />);
    await screen.findByTestId('chat-header');
    expect(screen.queryByTestId('chat-header-trip')).toBeNull();
  });
});

describe('the profile', () => {
  const profile = { ...RAFI, is_self: false, friends_since: '2026-01-02T00:00:00', home_country_iso2: 'BD' };
  beforeEach(() => {
    mockParams = { id: 'rafi' };
    friends.trips.mockResolvedValue([{ id: 91, destination: 'Sylhet', start_date: inDays(-1), end_date: inDays(1), stops: [] }]);
  });

  it('shows the trip chip and their trips', async () => {
    friends.profile.mockResolvedValue({ ...profile, shares_trips: true });
    await show(<FriendScreen />);
    expect(await screen.findByTestId('friend-trip-chip')).toHaveTextContent(/On a trip · Sylhet, day 2$/);
    expect(await screen.findByTestId('friend-trip-91')).toBeTruthy();
  });

  it('someone who hides their trips shows no chip and no trips, and none are asked for', async () => {
    friends.profile.mockResolvedValue({ ...profile, shares_trips: false });
    friends.onTheRoad.mockResolvedValue([]);
    await show(<FriendScreen />);
    await screen.findByText('@rafi'); // the profile has loaded
    expect(screen.queryByTestId('friend-trip-chip')).toBeNull();
    expect(screen.queryByText('Trips')).toBeNull();
    expect(friends.trips).not.toHaveBeenCalled();
  });
});

describe('the profile, seen before they hid their trips', () => {
  it('asks again on opening, shows no trips, and drops the saved ones', async () => {
    mockParams = { id: 'rafi' };
    friends.profile.mockResolvedValue({ ...RAFI, is_self: false, friends_since: null, home_country_iso2: null, shares_trips: false });
    friends.onTheRoad.mockResolvedValue([]);
    const client = await show(<FriendScreen />, (c) => {
      c.setQueryData(['friendProfile', 'rafi'], { ...RAFI, is_self: false, friends_since: null, home_country_iso2: null, shares_trips: true });
      c.setQueryData(['userTrips', 'rafi'], [{ id: 91, destination: 'Sylhet', start_date: inDays(-1), end_date: inDays(1), stops: [] }]);
    });
    await waitFor(() => expect(screen.queryByTestId('friend-trip-91')).toBeNull());
    expect(friends.profile).toHaveBeenCalled();
    expect(client.getQueryData(['userTrips', 'rafi'])).toBeUndefined();
  });
});

describe('Settings → Chats and privacy', () => {
  it('"Show my trips to friends" is on by default and can be turned off', async () => {
    usePreferences.setState({ shareTrips: true });
    await show(<ChatSettingsScreen />);
    expect(screen.getByTestId('settings-share-trips-row').props.accessibilityState).toEqual(expect.objectContaining({ checked: true }));
    await fireEvent.press(screen.getByTestId('settings-share-trips-row'));
    expect(usePreferences.getState().shareTrips).toBe(false);
  });
});

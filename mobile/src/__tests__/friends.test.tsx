import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import FriendCodeScreen from '../../app/add/[code]';
import FriendsScreen from '../../app/(tabs)/friends';
import AddFriendScreen from '../../app/friends/add';
import { formatFriendCode, inviteLink, parseFriendCode } from '../features/friends/friendCode';
import { PersonAction } from '../features/friends/PersonRow';
import '../i18n';
import { friendsApi } from '../services/api';
import { initials } from '../ui/Avatar';
import type { Person } from '../types';

const mockPush = jest.fn();
let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn() }),
  useLocalSearchParams: () => mockParams,
  useScrollToTop: jest.fn(),
  useFocusEffect: (effect: () => void) => jest.requireActual('react').useEffect(effect, [effect]),
  useIsFocused: () => true,
  Stack: { Screen: () => null },
}));
jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);
jest.mock('../ui/haptics', () => ({ haptic: jest.fn(), haptics: { success: jest.fn(), error: jest.fn(), light: jest.fn(), warning: jest.fn(), selection: jest.fn() } }));
jest.mock('../features/account/useMe', () => ({
  ME_QUERY_KEY: ['me'],
  useMe: () => ({ data: { id: 'me', username: 'ali', friend_code: 'ABCD2345' } }),
}));
jest.mock('../services/api', () => ({
  friendsApi: {
    list: jest.fn(),
    requests: jest.fn(),
    respond: jest.fn(),
    request: jest.fn(),
    search: jest.fn(() => Promise.resolve([])),
    byCode: jest.fn(),
  },
}));

const api = friendsApi as unknown as Record<string, jest.Mock>;
const { haptics } = jest.requireMock('../ui/haptics') as { haptics: { success: jest.Mock; error: jest.Mock } };

// gcTime Infinity: no cache timers left behind to keep Jest from exiting
const clients: QueryClient[] = [];
function renderWithQuery(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { gcTime: Infinity } } });
  clients.push(client);
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}
afterEach(() => clients.splice(0).forEach((c) => c.clear()));

const person = (relation: Person['relation']): Person => ({
  id: 'u2',
  username: 'bob',
  display_name: 'Bob',
  avatar_url: null,
  relation,
  request_id: relation === 'requested' || relation === 'incoming' ? 7 : null,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = {};
});

describe('friend codes', () => {
  it('reads a code from a scanned link, a typed code or a pasted share', () => {
    expect(parseFriendCode('vromon://add/ABCD2345')).toBe('ABCD2345');
    expect(parseFriendCode('https://vromon.app/add/abcd2345/')).toBe('ABCD2345');
    expect(parseFriendCode(' abcd 2345 ')).toBe('ABCD2345');
    expect(parseFriendCode('ABCD-2345')).toBe('ABCD2345');
  });

  it('rejects look-alike characters, wrong lengths and other QR codes', () => {
    expect(parseFriendCode('ABCD0345')).toBeNull(); // 0 isn't in the alphabet
    expect(parseFriendCode('ABCDI345')).toBeNull(); // nor is I
    expect(parseFriendCode('ABC2345')).toBeNull();
    expect(parseFriendCode('https://example.com/menu')).toBeNull();
    expect(parseFriendCode('WIFI:S:home;T:WPA;P:secret;;')).toBeNull();
  });

  it('builds the invite link and a readable form', () => {
    expect(inviteLink('ABCD2345')).toBe('vromon://add/ABCD2345');
    expect(formatFriendCode('ABCD2345')).toBe('ABCD 2345');
  });
});

describe('avatar initials', () => {
  it('use letters and digits only', () => {
    expect(initials('Rafi (QA)')).toBe('RQ'); // was "R(" on the device
    expect(initials('Alif')).toBe('AL');
    expect(initials('আলিফ আহাদ')).toBe('আআ');
    expect(initials('')).toBe('?');
  });
});

describe('Friends tab', () => {
  it('lists requests and friends; Accept answers the request with a success haptic', async () => {
    api.requests.mockImplementation((direction: string) =>
      Promise.resolve(direction === 'in' ? [{ id: 7, status: 'pending', direction: 'in', created_at: '', user: person('incoming') }] : []),
    );
    api.list.mockResolvedValue([{ id: 'u3', username: 'cara', display_name: 'Cara', avatar_url: null, since: '', countries: 3, world_percent: 1.5 }]);
    api.respond.mockResolvedValue({ id: 7, status: 'accepted' });
    await renderWithQuery(<FriendsScreen />);
    expect(await screen.findByText('Requests')).toBeTruthy();
    expect(screen.getByText('3 countries · 1.5% of the world')).toBeTruthy();
    expect(screen.queryByTestId('friends-empty')).toBeNull();
    await fireEvent.press(screen.getByTestId('accept-bob'));
    expect(api.respond).toHaveBeenCalledWith(7, 'accept');
    expect(haptics.success).toHaveBeenCalled();
  });

  it('shows the empty state from 12 when there is nobody yet', async () => {
    api.requests.mockResolvedValue([]);
    api.list.mockResolvedValue([]);
    await renderWithQuery(<FriendsScreen />);
    expect(await screen.findByTestId('friends-empty')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('friends-add-via-code'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/friends/add', params: { tab: 'search' } });
  });
});

describe('the action for each relation', () => {
  it.each([
    ['none', 'Add'],
    ['incoming', 'Accept'],
    ['requested', 'Requested'],
    ['friends', 'Friends'],
  ] as const)('%s → %s', async (relation, label) => {
    await renderWithQuery(<PersonAction person={person(relation)} />);
    expect(screen.getByText(label)).toBeTruthy();
  });

  it('Add sends a request by user id', async () => {
    api.request.mockResolvedValue({ id: 9, status: 'pending' });
    await renderWithQuery(<PersonAction person={person('none')} />);
    await fireEvent.press(screen.getByText('Add'));
    expect(api.request).toHaveBeenCalledWith({ user_id: 'u2' });
  });
});

describe('Add friend', () => {
  it('offers to use a typed friend code', async () => {
    await renderWithQuery(<AddFriendScreen />);
    await fireEvent.changeText(screen.getByTestId('friend-search'), 'abcd2345');
    await fireEvent.press(screen.getByTestId('use-code'));
    expect(mockPush).toHaveBeenCalledWith('/add/ABCD2345');
  });

  it('My code shows the code', async () => {
    mockParams = { tab: 'code' };
    await renderWithQuery(<AddFriendScreen />);
    expect(screen.getByTestId('my-code')).toHaveTextContent('ABCD 2345');
  });
});

describe('a friend code link', () => {
  it('a malformed code fails without asking the server, with an error haptic', async () => {
    mockParams = { code: 'not-a-code' };
    await renderWithQuery(<FriendCodeScreen />);
    expect(screen.getByTestId('code-invalid')).toBeTruthy();
    expect(api.byCode).not.toHaveBeenCalled();
    expect(haptics.error).toHaveBeenCalled();
  });

  it('shows the person and sends by code', async () => {
    mockParams = { code: 'wxyz6789' };
    api.byCode.mockResolvedValue(person('none'));
    api.request.mockResolvedValue({ id: 1, status: 'pending' });
    await renderWithQuery(<FriendCodeScreen />);
    expect(await screen.findByText('@bob')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('code-add'));
    expect(api.request).toHaveBeenCalledWith({ friend_code: 'WXYZ6789' });
  });
});

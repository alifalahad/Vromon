import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library';
import React from 'react';
import { Text } from 'react-native';

import AuthLayout from '../../app/(auth)/_layout';
import FriendsScreen from '../../app/(tabs)/friends';
import TabLayout from '../../app/(tabs)/_layout';
import SettingsScreen from '../../app/(tabs)/settings';
import RootLayout from '../../app/_layout';
import { useAuth } from '../features/auth/session';
import { DEFAULT_PREFERENCES, usePreferences } from '../features/preferences/store';
import i18n from '../i18n';
import { meApi } from '../services/api';
import { queryClient } from '../services/queryClient';
import type { Me } from '../types';

// No Supabase in tests: the gate is driven through useAuth and a mocked /me
jest.mock('../features/auth/supabase', () => ({ supabase: null, authRedirectUrl: () => 'vromon://auth/callback' }));
jest.mock('../services/api', () => {
  const actual = jest.requireActual('../services/api');
  return {
    ...actual,
    meApi: {
      ...actual.meApi,
      get: jest.fn(),
      getSettings: jest.fn(() => Promise.resolve({ language: null, appearance: 'system', haptics: true, units: 'km', map_theme: null, updated_at: null })),
      putSettings: jest.fn(() => Promise.resolve({})),
      update: jest.fn(),
    },
    // No friends or requests: the Friends tab shows its empty state (12-friends-empty.jpg)
    friendsApi: { ...actual.friendsApi, list: jest.fn(() => Promise.resolve([])), requests: jest.fn(() => Promise.resolve([])) },
  };
});

const ME: Me = {
  id: 'u1',
  email: 'ali@example.com',
  username: 'ali',
  display_name: 'Ali Ahad',
  home_country_iso2: 'BD',
  discoverable: true,
  friend_code: 'ABCD2345',
  created_at: '2026-10-12T00:00:00',
  needs_onboarding: false,
};
const mockedMe = meApi.get as jest.Mock;

// Map and Trips are stubbed: they load data or native views that aren't under test here.
const routes = {
  _layout: RootLayout,
  '(tabs)/_layout': TabLayout,
  '(tabs)/index': () => <Text>map-screen</Text>,
  '(tabs)/trips': () => <Text>trips-screen</Text>,
  '(tabs)/friends': FriendsScreen,
  '(tabs)/settings': SettingsScreen,
  'destination/[id]': () => null,
  'trip/new': () => null,
  'trip/[id]': () => null,
  'itinerary/[id]': () => null,
  '(auth)/_layout': AuthLayout,
  '(auth)/sign-in': () => <Text>sign-in-screen</Text>,
  onboarding: () => <Text>onboarding-screen</Text>,
  'settings/profile': () => null,
  'settings/home-country': () => null,
  'settings/delete-account': () => null,
  'auth/callback': () => null,
  'auth/reset-password': () => null,
  'map/add-place': () => null,
  'map/theme': () => null,
  'friends/add': () => null,
  'friends/[id]': () => null,
  'friends/compare/[id]': () => null,
  'add/[code]': () => null,
  'settings/blocked': () => null,
};

beforeEach(async () => {
  queryClient.clear();
  mockedMe.mockResolvedValue(ME);
  useAuth.setState({ status: 'signedIn', session: null, recovering: false });
  usePreferences.setState(DEFAULT_PREFERENCES);
  await act(() => i18n.changeLanguage('en'));
});

describe('bottom tabs', () => {
  it('renders Map · Trips · Friends · Settings in order, without Passport', async () => {
    await renderRouter(routes, { initialUrl: '/' });
    await screen.findByText('map-screen');
    const tabs = screen.getAllByTestId(/^tab-/).map((t) => t.props.testID);
    expect(tabs).toEqual(['tab-index', 'tab-trips', 'tab-friends', 'tab-settings']);
    for (const label of ['Map', 'Trips', 'Friends', 'Settings']) expect(screen.getByText(label)).toBeTruthy();
    expect(screen.queryByText('Passport')).toBeNull();
    expect(screen.getByText('map-screen')).toBeTruthy();
  });

  it('switches tabs', async () => {
    await renderRouter(routes, { initialUrl: '/' });
    await screen.findByTestId('tab-friends');
    await fireEvent.press(screen.getByTestId('tab-friends'));
    expect(await screen.findByText('No Friends Yet')).toBeTruthy();
  });
});

describe('Friends empty state', () => {
  it('shows the Invite and add-via-code links', async () => {
    await renderRouter(routes, { initialUrl: '/friends' });
    await screen.findByTestId('friends-invite');
    expect(screen.getByTestId('friends-invite')).toHaveTextContent('Invite');
    expect(screen.getByTestId('friends-add-via-code')).toHaveTextContent('add via code');
  });
});

describe('Settings', () => {
  it('changes Appearance from the option sheet', async () => {
    await renderRouter(routes, { initialUrl: '/settings' });
    await screen.findByTestId('settings-appearance');
    expect(screen.getByLabelText('Appearance, System')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('settings-appearance'));
    await fireEvent.press(screen.getAllByTestId('option-dark')[0]);
    expect(usePreferences.getState().appearance).toBe('dark');
    expect(screen.getByLabelText('Appearance, Dark')).toBeTruthy();
  });

  it('switches the UI language to Bangla', async () => {
    await renderRouter(routes, { initialUrl: '/settings' });
    await screen.findByTestId('settings-appearance');
    await fireEvent.press(screen.getByTestId('settings-language'));
    await act(async () => {
      await fireEvent.press(screen.getAllByTestId('option-bn')[0]);
    });
    expect(usePreferences.getState().language).toBe('bn');
    // Settings title and its tab label, plus the other tab labels, are now in Bangla
    expect(screen.getAllByText('সেটিংস')).toHaveLength(2);
    expect(screen.getByText('মানচিত্র')).toBeTruthy();
    expect(screen.queryByText('Settings')).toBeNull();
  });

  it('turns haptic feedback off by tapping the row (one switch for TalkBack)', async () => {
    await renderRouter(routes, { initialUrl: '/settings' });
    await screen.findByTestId('settings-appearance');
    const row = screen.getByTestId('settings-haptics-row');
    expect(row).toHaveProp('accessibilityRole', 'switch');
    expect(row).toBeChecked();
    await fireEvent.press(row);
    expect(usePreferences.getState().haptics).toBe(false);
  });
});

describe('sign-in gate', () => {
  it('sends signed-out users to sign-in, whatever URL they open', async () => {
    useAuth.setState({ status: 'signedOut' });
    await renderRouter(routes, { initialUrl: '/trips' });
    expect(await screen.findByText('sign-in-screen')).toBeTruthy();
    expect(screen.queryByTestId('tab-trips')).toBeNull();
  });

  it('sends a new account to onboarding until a username is claimed', async () => {
    mockedMe.mockResolvedValue({ ...ME, username: null, needs_onboarding: true });
    await renderRouter(routes, { initialUrl: '/' });
    expect(await screen.findByText('onboarding-screen')).toBeTruthy();
    expect(screen.queryByText('map-screen')).toBeNull();
  });

  it('shows the profile card for an onboarded account', async () => {
    // Cold start: the gate resolves the account first, then the user opens Settings
    await renderRouter(routes, { initialUrl: '/' });
    await screen.findByText('map-screen');
    await fireEvent.press(screen.getByTestId('tab-settings'));
    expect(await screen.findByText('@ali · Bangladesh')).toBeTruthy();
    expect(screen.getByText('Ali Ahad')).toBeTruthy();
  });
});

/**
 * Account and settings (docs/ui-refresh step 13, frames 26 and 27): who you are and your travel numbers at
 * the top, the groups, Sign out saying what it does (and hidden when the build has no sign-in), and Edit
 * profile's form: nothing to save, a taken or bad username, a free one saved, leaving with changes asks.
 */

import { QueryClientProvider } from '@tanstack/react-query';
import { Stack, router } from 'expo-router';
import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library';
import React from 'react';
import { Alert, Text } from 'react-native';

import EditProfileScreen from '../../app/settings/profile';
import SettingsScreen from '../../app/settings/index';
import { DEFAULT_PREFERENCES, usePreferences } from '../features/preferences/store';
import i18n from '../i18n';
import { meApi } from '../services/api';
import { queryClient } from '../services/queryClient';
import type { Me, Trip, Visit } from '../types';

const ME: Me = {
  id: 'u1',
  email: 'ana@example.com',
  username: 'ana',
  display_name: 'Ana Rahman',
  home_country_iso2: 'BD',
  discoverable: true,
  friend_code: 'ABCD2345',
  created_at: '2026-10-12T00:00:00',
  needs_onboarding: false,
};

const visit = (place_type: Visit['place_type'], place_code: string, status: Visit['status']): Visit => ({
  place_type,
  place_code,
  status,
  first_visited_on: null,
  last_visited_on: null,
  note: null,
  updated_at: '2026-11-01T00:00:00Z',
});

let mockMe: Me = ME;
let mockVisits: Visit[] = [];
let mockTrips: Partial<Trip>[] = [];
jest.mock('../features/account/useMe', () => ({ ME_QUERY_KEY: ['me'], useMe: () => ({ data: mockMe }) }));
jest.mock('../features/map/visits', () => ({ ...jest.requireActual('../features/map/visits'), useVisits: () => ({ data: mockVisits }) }));
jest.mock('../features/trips/queries', () => ({ ...jest.requireActual('../features/trips/queries'), useTrips: () => ({ data: mockTrips }) }));
// The build's sign-in switch, set per test on the mocked module (the screen reads it when it draws)
jest.mock('../features/auth/session', () => ({ ...jest.requireActual('../features/auth/session'), authEnabled: true }));
const session = jest.requireMock('../features/auth/session') as { authEnabled: boolean };
jest.mock('../features/auth/actions', () => ({ signOut: jest.fn(() => Promise.resolve()) }));
jest.mock('../services/api', () => {
  const actual = jest.requireActual('../services/api');
  return { ...actual, meApi: { ...actual.meApi, update: jest.fn(), usernameAvailable: jest.fn() } };
});

const routes = {
  _layout: () => (
    <QueryClientProvider client={queryClient}>
      <Stack />
    </QueryClientProvider>
  ),
  index: () => <Text>home</Text>,
  'settings/index': SettingsScreen,
  'settings/profile': EditProfileScreen,
  'settings/home-country': () => <Text>country picker</Text>,
  'settings/delete-account': () => <Text>delete account</Text>,
  'settings/chats': () => <Text>chats</Text>,
  'map/dashboard': () => <Text>your travels</Text>,
  'map/theme': () => null,
  'friends/add': () => <Text>friend code</Text>,
};

beforeEach(async () => {
  queryClient.clear();
  mockMe = ME;
  mockVisits = [];
  mockTrips = [];
  session.authEnabled = true;
  usePreferences.setState(DEFAULT_PREFERENCES);
  (meApi.update as jest.Mock).mockReset();
  (meApi.usernameAvailable as jest.Mock).mockReset();
  await act(() => i18n.changeLanguage('en'));
});

describe('Settings', () => {
  it('opens on you: your name, username and country, and your travel numbers that open Your travels', async () => {
    mockVisits = [
      visit('country', 'BD', 'lived'),
      visit('country', 'IN', 'visited'),
      visit('region', 'BD-A', 'visited'),
      visit('region', 'BD-D', 'lived'),
      visit('country', 'NP', 'want'),
    ];
    mockTrips = [
      { id: 1, destination: 'Khulna', start_date: '2020-01-01', end_date: '2020-01-03' },
      { id: 2, destination: "Cox's Bazar", start_date: '2099-01-01', end_date: '2099-01-03' },
    ];
    await renderRouter(routes, { initialUrl: '/settings' });
    expect(await screen.findByText('Ana Rahman')).toBeTruthy();
    expect(screen.getByText('@ana · Bangladesh')).toBeTruthy();
    // The dashboard's own numbers: a Want isn't a visit, an upcoming trip isn't taken yet
    expect(screen.getByTestId('settings-travels')).toHaveProp('accessibilityLabel', 'Your travels: 2 countries, 2 of 8 divisions, 1 trip taken');
    await fireEvent.press(screen.getByTestId('settings-travels'));
    expect(await screen.findByText('your travels')).toBeTruthy();
  });

  it('another home country without regions in the app: your cities in the middle', async () => {
    mockMe = { ...ME, home_country_iso2: 'JP' };
    mockVisits = [visit('city', '1850147', 'visited'), visit('city', '1853909', 'lived')];
    await renderRouter(routes, { initialUrl: '/settings' });
    expect(await screen.findByTestId('settings-travels')).toHaveProp('accessibilityLabel', 'Your travels: 0 countries, 2 cities, 0 trips taken');
    expect(screen.getByText('@ana · Japan')).toBeTruthy();
  });

  it('the groups and their rows, in the frame’s words, each with its value', async () => {
    await renderRouter(routes, { initialUrl: '/settings' });
    await screen.findByTestId('settings-language');
    for (const label of ['Language, English', 'Appearance, Same as the phone', 'Map theme, Default', 'Distances in, Kilometres']) {
      expect(screen.getByLabelText(label)).toBeTruthy();
    }
    expect(screen.getByTestId('settings-version').props.accessibilityLabel).toMatch(/^Version, /);
    expect(screen.getByTestId('settings-haptics-row')).toHaveProp('accessibilityLabel', 'Vibrate on taps');
    expect(screen.getByTestId('settings-chats')).toHaveProp(
      'accessibilityLabel',
      'Chats and privacy, Read receipts, trip sharing, notifications, blocked people',
    );
    expect(screen.getByTestId('settings-export')).toHaveProp('accessibilityLabel', 'Download my data');
    expect(screen.getByTestId('settings-licences')).toHaveProp('accessibilityLabel', 'Licences and data sources');
    for (const id of [
      'settings-profile',
      'settings-friend-code',
      'settings-discoverable-row',
      'settings-map-theme',
      'settings-units',
      'settings-delete-account',
    ]) {
      expect(screen.getByTestId(id)).toBeTruthy();
    }
    await fireEvent.press(screen.getByTestId('settings-friend-code'));
    expect(await screen.findByText('friend code')).toBeTruthy();
  });

  it('Sign out is its own button with your email under it, and says it signs you out everywhere first', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    await renderRouter(routes, { initialUrl: '/settings' });
    await screen.findByTestId('settings-sign-out');
    expect(screen.getByText('Signed in as ana@example.com')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('settings-sign-out'));
    const [title, body, buttons] = alert.mock.calls[0];
    expect(title).toBe('Sign out everywhere?');
    expect(body).toContain('on every other phone where you use this account');
    expect((buttons as { text: string }[]).map((b) => b.text)).toEqual(['Cancel', 'Sign out']);
    alert.mockRestore();
  });

  it('with sign-in switched off in the build: no Sign out, the rest as usual', async () => {
    session.authEnabled = false;
    await renderRouter(routes, { initialUrl: '/settings' });
    await screen.findByTestId('settings-language');
    expect(screen.queryByTestId('settings-sign-out')).toBeNull();
    expect(screen.queryByText('Signed in as ana@example.com')).toBeNull();
    expect(screen.getByTestId('settings-delete-account')).toBeTruthy();
  });

  it('in Bangla, with Bangla digits', async () => {
    mockVisits = [visit('country', 'BD', 'lived')];
    await act(() => i18n.changeLanguage('bn'));
    await renderRouter(routes, { initialUrl: '/settings' });
    expect(await screen.findByTestId('settings-travels')).toHaveProp('accessibilityLabel', 'আপনার ভ্রমণ: ১ দেশ, ০ / ৮ বিভাগ, ০ ভ্রমণ শেষ');
    expect(screen.getByLabelText('চেহারা, ফোনের মতো')).toBeTruthy();
  });
});

describe('Edit profile', () => {
  const open = async () => {
    await renderRouter(routes, { initialUrl: '/' });
    await screen.findByText('home');
    await act(() => router.push('/settings/profile'));
    await screen.findByTestId('profile-screen');
  };
  const save = () => screen.getByTestId('profile-save');

  it("unchanged: your username is yours, Save does nothing yet, and the email can't be changed here", async () => {
    await open();
    expect(screen.getByTestId('username-mine')).toHaveProp('accessibilityLabel', 'Yours');
    expect(save()).toBeDisabled();
    expect(screen.getByTestId('profile-email')).toHaveProp('accessibilityLabel', "Email (can't be changed here), ana@example.com");
    expect(screen.getByTestId('profile-home-country')).toHaveProp('accessibilityLabel', 'Your country, Bangladesh');
    expect(screen.getByText('The map and Explore open on your country.')).toBeTruthy();
  });

  it('a taken username: said inside the field and under it, and Save stays off', async () => {
    (meApi.usernameAvailable as jest.Mock).mockResolvedValue({ available: false });
    await open();
    await fireEvent.changeText(screen.getByTestId('username-input'), 'rafi');
    expect(screen.getByTestId('username-checking')).toBeTruthy();
    expect(await screen.findByTestId('username-taken', {}, { timeout: 2000 })).toHaveProp('accessibilityLabel', 'Taken');
    expect(screen.getByText('That username is taken')).toBeTruthy();
    expect(save()).toBeDisabled();
  });

  it('a username that breaks the rules: the rule under the field, no check, no Save', async () => {
    await open();
    await fireEvent.changeText(screen.getByTestId('username-input'), 'ab');
    expect(screen.getByText('Use 3–20 characters')).toBeTruthy();
    expect(screen.queryByTestId('username-free')).toBeNull();
    expect(save()).toBeDisabled();
    expect(meApi.usernameAvailable).not.toHaveBeenCalled();
  });

  it('a free username and a new name: Save sends both and goes back', async () => {
    (meApi.usernameAvailable as jest.Mock).mockResolvedValue({ available: true });
    (meApi.update as jest.Mock).mockResolvedValue({ ...ME, username: 'ana_r', display_name: 'Ana R.' });
    await open();
    await fireEvent.changeText(screen.getByTestId('profile-name'), 'Ana R.');
    await fireEvent.changeText(screen.getByTestId('username-input'), 'Ana_R');
    expect(await screen.findByTestId('username-free', {}, { timeout: 2000 })).toHaveProp('accessibilityLabel', 'Free');
    expect(save()).toBeEnabled();
    await fireEvent.press(save());
    expect(meApi.update).toHaveBeenCalledWith({ display_name: 'Ana R.', username: 'ana_r' });
    expect(await screen.findByText('home')).toBeTruthy();
  });

  it('leaving with changes not saved asks first; leaving without changes doesn’t', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    await open();
    await act(() => router.back());
    expect(alert).not.toHaveBeenCalled();
    expect(await screen.findByText('home')).toBeTruthy();

    await act(() => router.push('/settings/profile'));
    await screen.findByTestId('profile-screen');
    await fireEvent.changeText(screen.getByTestId('profile-name'), 'Someone else');
    expect(save()).toBeEnabled();
    await act(() => router.back());
    expect(alert).toHaveBeenCalledWith('Leave without saving?', "Your changes to your name or username aren't saved yet.", expect.any(Array));
    expect(screen.getByTestId('profile-screen')).toBeTruthy();
    alert.mockRestore();
  });
});

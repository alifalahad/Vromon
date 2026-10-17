import { act, renderHook } from '@testing-library/react-native';

import { selectTheme } from '../features/mapThemes/resolve';
import { DEFAULT_PREFERENCES, usePreferences } from '../features/preferences/store';
import { useSettingsSync } from '../features/preferences/sync';
import { meApi } from '../services/api';
import type { UserSettings } from '../types';

jest.mock('../services/api', () => ({ meApi: { getSettings: jest.fn(), putSettings: jest.fn() } }));
const getSettings = meApi.getSettings as jest.Mock;
const putSettings = meApi.putSettings as jest.Mock;

const SERVER: UserSettings = {
  language: 'en',
  appearance: 'dark',
  haptics: true,
  units: 'km',
  map_theme: { v: 1, themeId: 'midnight', styleId: 'theme:midnight', colorsId: 'theme:midnight', compareId: 'midnight' },
  notify_friend_requests: false,
  notify_friend_accepted: true,
  updated_at: '2026-10-13T10:00:00',
};

const flush = () => act(async () => {});

// Unmounted after each test, so an earlier hook's store subscription can't react to the next test's setup
let unmounts: (() => unknown)[] = [];
const start = async (userId: string) => {
  const { unmount } = await renderHook(() => useSettingsSync(userId));
  unmounts.push(unmount);
};

describe('settings sync', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    usePreferences.setState({ ...DEFAULT_PREFERENCES });
    getSettings.mockReset().mockResolvedValue(SERVER);
    putSettings.mockReset().mockResolvedValue({});
  });
  afterEach(async () => {
    for (const unmount of unmounts) await unmount();
    unmounts = [];
    jest.useRealTimers();
  });

  it("applies the account's saved theme after sign-in", async () => {
    await start('u1');
    await flush();
    expect(usePreferences.getState().mapTheme).toEqual(selectTheme('midnight'));
    expect(usePreferences.getState().appearance).toBe('dark');
    expect(usePreferences.getState().notifyFriendRequests).toBe(false);
    expect(putSettings).not.toHaveBeenCalled();
  });

  it('keeps the device theme for an account saved before map themes existed', async () => {
    usePreferences.setState({ mapTheme: selectTheme('rustic') });
    getSettings.mockResolvedValue({ ...SERVER, map_theme: null });
    await start('u1');
    await flush();
    expect(usePreferences.getState().mapTheme).toEqual(selectTheme('rustic'));
  });

  it('pushes a change after a short delay and then marks it synced', async () => {
    await start('u1');
    await flush();
    await act(async () => usePreferences.getState().setMapTheme(selectTheme('serenity')));
    expect(usePreferences.getState().unsyncedFor).toBe('u1');
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
    expect(putSettings).toHaveBeenCalledWith(expect.objectContaining({ map_theme: selectTheme('serenity') }));
    expect(usePreferences.getState().unsyncedFor).toBeNull();
  });

  it('a change that never reached the server (offline) is pushed on the next start instead of being overwritten', async () => {
    usePreferences.setState({ mapTheme: selectTheme('rustic'), unsyncedFor: 'u1' });
    await start('u1');
    await flush();
    expect(getSettings).not.toHaveBeenCalled();
    expect(putSettings).toHaveBeenCalledWith(expect.objectContaining({ map_theme: selectTheme('rustic') }));
    expect(usePreferences.getState().unsyncedFor).toBeNull();
  });

  it("never sends another account's unsent changes", async () => {
    usePreferences.setState({ mapTheme: selectTheme('rustic'), unsyncedFor: 'someone-else' });
    await start('u1');
    await flush();
    expect(putSettings).not.toHaveBeenCalled();
    expect(usePreferences.getState().unsyncedFor).toBeNull();
    expect(usePreferences.getState().mapTheme).toEqual(selectTheme('midnight'));
  });

  it('makes an unknown stored theme safe', async () => {
    getSettings.mockResolvedValue({ ...SERVER, map_theme: { themeId: 'from-the-future' } });
    await start('u1');
    await flush();
    expect(usePreferences.getState().mapTheme).toEqual(selectTheme('default'));
  });
});

/**
 * Local preferences (appearance, language, haptics, distance units, map theme).
 *
 * Persisted to AsyncStorage, so they apply offline and from first paint. The
 * account-level ones are synced with /me/settings by ./sync.ts.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { DEFAULT_USER_MAP_THEME, normalizeUserMapTheme, type UserMapTheme } from '../mapThemes/resolve';

export type Appearance = 'system' | 'light' | 'dark';
export type Language = 'en' | 'bn';
export type DistanceUnits = 'km' | 'mi';
export type MapView = 'countries' | 'regions' | 'cities';

export const APPEARANCES: readonly Appearance[] = ['system', 'light', 'dark'];
export const LANGUAGES: readonly Language[] = ['en', 'bn'];
export const DISTANCE_UNITS: readonly DistanceUnits[] = ['km', 'mi'];

export type Preferences = {
  appearance: Appearance;
  /** null until the user picks one: follow the device language */
  language: Language | null;
  haptics: boolean;
  units: DistanceUnits;
  /** Last map view (Countries / Regions / Cities) */
  mapView: MapView;
  /** Offer to mark the country when a region or city in it is marked */
  askMarkCountry: boolean;
  /** Map theme selection (synced to the account) */
  mapTheme: UserMapTheme;
  /** Push notifications (synced: the server decides whether to send) */
  notifyFriendRequests: boolean;
  notifyFriendAccepted: boolean;
  /**
   * Account whose settings changed here but haven't reached the server yet
   * (offline, or the app closed first). Sync pushes them before pulling.
   */
  unsyncedFor: string | null;
};

type PreferencesState = Preferences & {
  setAppearance: (v: Appearance) => void;
  setLanguage: (v: Language) => void;
  setHaptics: (v: boolean) => void;
  setUnits: (v: DistanceUnits) => void;
  setMapView: (v: MapView) => void;
  setAskMarkCountry: (v: boolean) => void;
  setMapTheme: (v: UserMapTheme) => void;
  setNotifyFriendRequests: (v: boolean) => void;
  setNotifyFriendAccepted: (v: boolean) => void;
};

export const DEFAULT_PREFERENCES: Preferences = {
  appearance: 'system',
  language: null,
  haptics: true,
  units: 'km',
  mapView: 'countries',
  askMarkCountry: true,
  mapTheme: DEFAULT_USER_MAP_THEME,
  notifyFriendRequests: true,
  notifyFriendAccepted: true,
  unsyncedFor: null,
};

export const usePreferences = create<PreferencesState>()(
  persist(
    (set) => ({
      ...DEFAULT_PREFERENCES,
      setAppearance: (appearance) => set({ appearance }),
      setLanguage: (language) => set({ language }),
      setHaptics: (haptics) => set({ haptics }),
      setUnits: (units) => set({ units }),
      setMapView: (mapView) => set({ mapView }),
      setAskMarkCountry: (askMarkCountry) => set({ askMarkCountry }),
      setMapTheme: (mapTheme) => set({ mapTheme }),
      setNotifyFriendRequests: (notifyFriendRequests) => set({ notifyFriendRequests }),
      setNotifyFriendAccepted: (notifyFriendAccepted) => set({ notifyFriendAccepted }),
    }),
    {
      name: 'vromon.preferences',
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: ({ appearance, language, haptics, units, mapView, askMarkCountry, mapTheme, notifyFriendRequests, notifyFriendAccepted, unsyncedFor }) => ({
        appearance,
        language,
        haptics,
        units,
        mapView,
        askMarkCountry,
        mapTheme,
        notifyFriendRequests,
        notifyFriendAccepted,
        unsyncedFor,
      }),
      // A stored theme may name catalog items this version doesn't have
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<Preferences>;
        return { ...current, ...p, mapTheme: normalizeUserMapTheme(p.mapTheme ?? current.mapTheme) };
      },
    },
  ),
);

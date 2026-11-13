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
/** Optional map layers (map home: the Map sheet's "On the map") */
export type MapLayer = 'trails' | 'plannable' | 'friends';

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
  /** Offer to mark the country when a region or city in it is marked */
  askMarkCountry: boolean;
  /** Which optional layers the map draws */
  mapLayers: Record<MapLayer, boolean>;
  /** The one-time "press and hold to mark" hint was shown */
  markHintSeen: boolean;
  /** Destinations chosen in the trip wizard's "Where to?" search, newest first (this device only) */
  recentDestinations: string[];
  /** Map theme selection (synced to the account) */
  mapTheme: UserMapTheme;
  /** Push notifications (synced: the server decides whether to send) */
  notifyFriendRequests: boolean;
  notifyFriendAccepted: boolean;
  /** Chat (Settings → Chats and privacy; synced). Read receipts are mutual */
  readReceipts: boolean;
  notifyMessages: boolean;
  notifyTripRooms: boolean;
  /** Off: a notification only says who wrote */
  notificationPreviews: boolean;
  /** Friends see your current and coming trips (On the road, the chat header, your profile) */
  shareTrips: boolean;
  /** Trips whose "Rate your trip?" card was answered "Not now": never asked again (trip upgrades step 7) */
  rateReminderDismissed: number[];
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
  setAskMarkCountry: (v: boolean) => void;
  setMapLayer: (layer: MapLayer, on: boolean) => void;
  setMarkHintSeen: () => void;
  addRecentDestination: (name: string) => void;
  clearRecentDestinations: () => void;
  setMapTheme: (v: UserMapTheme) => void;
  dismissRateReminder: (tripId: number) => void;
  setNotifyFriendRequests: (v: boolean) => void;
  setNotifyFriendAccepted: (v: boolean) => void;
  /** Chats and privacy: one or more of its switches */
  setChat: (change: Partial<Pick<Preferences, 'readReceipts' | 'notifyMessages' | 'notifyTripRooms' | 'notificationPreviews' | 'shareTrips' | 'notifyFriendRequests' | 'notifyFriendAccepted'>>) => void;
};

const MAX_RECENT = 4;

export const DEFAULT_PREFERENCES: Preferences = {
  appearance: 'system',
  language: null,
  haptics: true,
  units: 'km',
  askMarkCountry: true,
  mapLayers: { trails: true, plannable: true, friends: false },
  markHintSeen: false,
  recentDestinations: [],
  mapTheme: DEFAULT_USER_MAP_THEME,
  notifyFriendRequests: true,
  notifyFriendAccepted: true,
  readReceipts: true,
  notifyMessages: true,
  notifyTripRooms: true,
  notificationPreviews: true,
  shareTrips: true,
  rateReminderDismissed: [],
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
      setAskMarkCountry: (askMarkCountry) => set({ askMarkCountry }),
      setMapLayer: (layer, on) => set((s) => ({ mapLayers: { ...s.mapLayers, [layer]: on } })),
      setMarkHintSeen: () => set({ markHintSeen: true }),
      addRecentDestination: (name) => set((s) => ({ recentDestinations: [name, ...s.recentDestinations.filter((n) => n !== name)].slice(0, MAX_RECENT) })),
      clearRecentDestinations: () => set({ recentDestinations: [] }),
      setMapTheme: (mapTheme) => set({ mapTheme }),
      dismissRateReminder: (tripId) =>
        set((s) => ({ rateReminderDismissed: s.rateReminderDismissed.includes(tripId) ? s.rateReminderDismissed : [...s.rateReminderDismissed, tripId] })),
      setNotifyFriendRequests: (notifyFriendRequests) => set({ notifyFriendRequests }),
      setNotifyFriendAccepted: (notifyFriendAccepted) => set({ notifyFriendAccepted }),
      setChat: (change) => set(change),
    }),
    {
      name: 'vromon.preferences',
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: ({
        appearance,
        language,
        haptics,
        units,
        askMarkCountry,
        mapLayers,
        markHintSeen,
        recentDestinations,
        mapTheme,
        notifyFriendRequests,
        notifyFriendAccepted,
        readReceipts,
        notifyMessages,
        notifyTripRooms,
        notificationPreviews,
        shareTrips,
        rateReminderDismissed,
        unsyncedFor,
      }) => ({
        appearance,
        language,
        haptics,
        units,
        askMarkCountry,
        mapLayers,
        markHintSeen,
        recentDestinations,
        mapTheme,
        notifyFriendRequests,
        notifyFriendAccepted,
        readReceipts,
        notifyMessages,
        notifyTripRooms,
        notificationPreviews,
        shareTrips,
        rateReminderDismissed,
        unsyncedFor,
      }),
      // A stored theme may name catalog items this version doesn't have
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<Preferences>;
        // Layers added later get their default
        return { ...current, ...p, mapLayers: { ...current.mapLayers, ...p.mapLayers }, mapTheme: normalizeUserMapTheme(p.mapTheme ?? current.mapTheme) };
      },
    },
  ),
);

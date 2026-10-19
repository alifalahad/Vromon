/**
 * Today mode's switches, on this phone only (they never reach the server):
 * use my location for "leave by", remind me before leaving, and the evening-before
 * weather note. All start off; turning one on asks for the permission it needs.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

type TodaySettings = {
  useLocation: boolean;
  leaveReminders: boolean;
  weatherReminders: boolean;
  set: (patch: Partial<Omit<TodaySettings, 'set'>>) => void;
};

export const useTodaySettings = create<TodaySettings>()(
  persist(
    (set) => ({
      useLocation: false,
      leaveReminders: false,
      weatherReminders: false,
      set: (patch) => set(patch),
    }),
    { name: 'vromon.today', storage: createJSONStorage(() => AsyncStorage), partialize: ({ set: _set, ...rest }) => rest },
  ),
);

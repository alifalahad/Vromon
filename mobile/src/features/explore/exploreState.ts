/** Explore's switch, "Your country" or "The world": remembered while the app is open, not between launches. */

import { create } from 'zustand';

export type ExploreHalf = 'country' | 'world';

export const useExploreHalf = create<{ half: ExploreHalf; setHalf: (half: ExploreHalf) => void }>()((set) => ({
  half: 'country',
  setHalf: (half) => set({ half }),
}));

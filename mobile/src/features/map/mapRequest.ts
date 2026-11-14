/**
 * What another screen asks the Map tab to do when it comes back (docs/ui-refresh step 2): frame a
 * place ("Show on map" on the travel dashboard) or make the poster (its picture comes from the map).
 * The Map tab takes the request when it's in front and clears it.
 */

import { create } from 'zustand';

import type { MapTarget } from './travelPlaces';

export type MapRequest = { kind: 'show'; target: MapTarget } | { kind: 'poster' };

export const useMapRequest = create<{ request: MapRequest | null; ask: (r: MapRequest) => void; take: () => MapRequest | null }>((set, get) => ({
  request: null,
  ask: (request) => set({ request }),
  take: () => {
    const r = get().request;
    if (r) set({ request: null });
    return r;
  },
}));

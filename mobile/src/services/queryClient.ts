import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { focusManager, QueryClient } from '@tanstack/react-query';
import type { PersistQueryClientOptions } from '@tanstack/react-query-persist-client';
import { AppState, Platform } from 'react-native';

const WEEK = 1000 * 60 * 60 * 24 * 7;

/** The app's single TanStack Query cache (cleared on sign-out by the root layout). */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 1000 * 60 * 5, // 5 minutes
      gcTime: WEEK, // must outlive the persisted copy, or restored data is dropped at once
    },
  },
});

// React Native has no window focus: returning to the app counts as focus, so stale
// queries (e.g. a friend accepted your request meanwhile) refresh on their own.
if (Platform.OS !== 'web') {
  focusManager.setEventListener((setFocused) => {
    const sub = AppState.addEventListener('change', (state) => setFocused(state === 'active'));
    return () => sub.remove();
  });
}

/**
 * Queries saved to the device so the map, trips, profile and friends open offline.
 * Friends' data is removed from the cache when they unfriend or are blocked.
 */
const PERSISTED = new Set(['me', 'visits', 'trips', 'trip', 'tripStats', 'itinerary', 'destinations', 'friends', 'friendProfile', 'userStats', 'userTrips']);

export const queryPersister = createAsyncStoragePersister({ storage: AsyncStorage, key: 'vromon.query-cache' });

export const persistOptions: Omit<PersistQueryClientOptions, 'queryClient'> = {
  persister: queryPersister,
  maxAge: WEEK,
  buster: 'v1', // bump when cached shapes change incompatibly
  dehydrateOptions: {
    shouldDehydrateQuery: (q) => q.state.status === 'success' && PERSISTED.has(String(q.queryKey[0])),
  },
};

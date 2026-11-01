import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { focusManager, QueryClient, type Query } from '@tanstack/react-query';
import type { PersistedClient, PersistQueryClientOptions } from '@tanstack/react-query-persist-client';
import { AppState, Platform } from 'react-native';

import type { Thread } from '../features/chat/queries';
import { isTemporaryError } from './api';

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
 * Queries saved to the device so the map, trips, profile, friends and chats open offline.
 * Friends' data is removed from the cache when they unfriend or are blocked.
 */
const PERSISTED = new Set(['me', 'visits', 'trips', 'trip', 'tripStats', 'itinerary', 'budget', 'conditions', 'dayRoute', 'destinations', 'friends', 'friendProfile', 'userStats', 'userTrips', 'chat']);

/** Messages saved per chat. The whole cache is one AsyncStorage entry, which Android can't read back past about 2 MB. */
export const CHAT_MESSAGES_SAVED = 50;

/**
 * The cache as saved. Data whose last refresh failed offline is saved as the good data
 * it still is (the next refresh tries again). Each chat keeps only its newest messages;
 * older ones load again when scrolled to.
 */
export function forDisk(saved: PersistedClient): PersistedClient {
  const queries = saved.clientState.queries.map((q) => {
    const state = q.state.status === 'error' ? { ...q.state, status: 'success' as const, error: null, fetchFailureCount: 0, fetchFailureReason: null } : q.state;
    const thread = state.data as Thread | undefined;
    if (q.queryKey[0] !== 'chat' || q.queryKey[1] !== 'thread' || !thread || thread.messages.length <= CHAT_MESSAGES_SAVED) return { ...q, state };
    return { ...q, state: { ...state, data: { messages: thread.messages.slice(-CHAT_MESSAGES_SAVED), hasOlder: true } } };
  });
  return { ...saved, clientState: { ...saved.clientState, queries } };
}

/** Saved: a successful query, or one whose newest refresh failed only for now (offline), keeping its last good data. */
const keep = (q: Query) =>
  PERSISTED.has(String(q.queryKey[0])) && (q.state.status === 'success' || (q.state.data !== undefined && isTemporaryError(q.state.error)));

export const queryPersister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: 'vromon.query-cache',
  serialize: (saved) => JSON.stringify(forDisk(saved)),
});

export const persistOptions: Omit<PersistQueryClientOptions, 'queryClient'> = {
  persister: queryPersister,
  maxAge: WEEK,
  buster: 'v1', // bump when cached shapes change incompatibly
  dehydrateOptions: { shouldDehydrateQuery: keep },
};

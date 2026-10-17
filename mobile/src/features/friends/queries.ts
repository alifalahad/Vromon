/**
 * Friends data (TanStack Query). After any change, the lists, the badge and the
 * people's button states refresh together.
 */

import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { friendsApi } from '../../services/api';
import { visitsKey } from '../map/visits';
import { photoKeys } from '../photos/queries';

export const friendKeys = {
  friends: ['friends'] as const,
  requests: (direction: 'in' | 'out') => ['friendRequests', direction] as const,
  search: (q: string) => ['userSearch', q] as const,
  code: (code: string) => ['friendCode', code] as const,
  profile: (id: string) => ['friendProfile', id] as const,
  compare: (id: string) => ['compare', id] as const,
  trips: (id: string) => ['userTrips', id] as const,
  stats: (id: string) => ['userStats', id] as const,
  blocks: ['blocks'] as const,
};

/** Refresh everything a friend action can change. */
export function refreshFriends(client: QueryClient) {
  for (const key of ['friends', 'friendRequests', 'userSearch', 'friendCode', 'blocks']) {
    void client.invalidateQueries({ queryKey: [key] });
  }
}

/** After unfriending or blocking: their data must not linger in the cache (or on disk). */
export function forgetPerson(client: QueryClient, userId: string) {
  for (const key of [visitsKey(userId), friendKeys.profile(userId), friendKeys.compare(userId), friendKeys.trips(userId), friendKeys.stats(userId), photoKeys.forUser(userId)]) {
    client.removeQueries({ queryKey: key });
  }
  refreshFriends(client);
}

export function useFriends(enabled = true) {
  return useQuery({ queryKey: friendKeys.friends, queryFn: friendsApi.list, enabled });
}

/** Incoming requests also drive the tab badge, so they're polled. */
export function useFriendRequests(direction: 'in' | 'out', enabled = true) {
  return useQuery({
    queryKey: friendKeys.requests(direction),
    queryFn: () => friendsApi.requests(direction),
    enabled,
    refetchInterval: direction === 'in' ? 60_000 : false,
  });
}

export function useRefreshFriends() {
  const client = useQueryClient();
  return useCallback(() => refreshFriends(client), [client]);
}

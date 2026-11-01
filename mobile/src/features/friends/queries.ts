/**
 * Friends data (TanStack Query). After any change, the lists, the badge and the
 * people's button states refresh together.
 */

import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { friendsApi } from '../../services/api';
import type { OnTheRoad } from '../../types';
import { visitsKey } from '../map/visits';
import { photoKeys } from '../photos/queries';
import { localToday } from '../trips/dates';

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
  footprints: (placeType: 'country' | 'region') => ['footprints', placeType] as const,
  onTheRoad: ['onTheRoad'] as const,
};

/** Refresh everything a friend action can change. */
export function refreshFriends(client: QueryClient) {
  for (const key of ['friends', 'friendRequests', 'userSearch', 'friendCode', 'blocks', 'footprints', 'onTheRoad']) {
    void client.invalidateQueries({ queryKey: [key] });
  }
}

/** After unfriending or blocking: their data must not linger in the cache (or on disk). */
export function forgetPerson(client: QueryClient, userId: string) {
  for (const key of [
    visitsKey(userId),
    friendKeys.profile(userId),
    friendKeys.compare(userId),
    friendKeys.trips(userId),
    friendKeys.stats(userId),
    photoKeys.forUser(userId),
  ]) {
    client.removeQueries({ queryKey: key });
  }
  // Their places on the map too (the lists mix friends, so drop them all)
  client.removeQueries({ queryKey: ['footprints'] });
  client.removeQueries({ queryKey: friendKeys.onTheRoad });
  refreshFriends(client);
}

/** Friends' places on the travel map (map home step 9); refreshed with the friend lists. */
export function useFootprints(placeType: 'country' | 'region' | null, enabled = true) {
  return useQuery({
    queryKey: friendKeys.footprints(placeType ?? 'country'),
    queryFn: () => friendsApi.footprints(placeType!),
    enabled: enabled && !!placeType,
    staleTime: 5 * 60_000,
  });
}

export function useFriends(enabled = true) {
  return useQuery({ queryKey: friendKeys.friends, queryFn: friendsApi.list, enabled });
}

/** Friends on a trip today or leaving within 14 days (the strip, the chat header, the profile chip). */
export function useOnTheRoad(enabled = true) {
  return useQuery({ queryKey: friendKeys.onTheRoad, queryFn: () => friendsApi.onTheRoad(localToday()), enabled, staleTime: 5 * 60_000 });
}

/** One friend's trip from the same list, or null. */
export function useRoadTripOf(userId: string | null | undefined): OnTheRoad['trip'] | null {
  const road = useOnTheRoad(!!userId);
  return road.data?.find((r) => r.friend.id === userId)?.trip ?? null;
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

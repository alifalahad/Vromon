/**
 * Trips data (TanStack Query). Trip lists and stats are persisted for offline use
 * (`trips`, `tripStats` in queryClient.ts). Stats are asked for with the phone's
 * local date, so "completed" follows the user's calendar.
 */

import { useQuery, type QueryClient } from '@tanstack/react-query';

import { tripsApi } from '../../services/api';
import { localToday } from './dates';

export const tripKeys = {
  list: ['trips'] as const,
  trip: (id: number) => ['trip', id] as const,
  stats: (userId: string | undefined, today: string) => ['tripStats', userId ?? 'me', today] as const,
};

export function useTrips() {
  return useQuery({ queryKey: tripKeys.list, queryFn: tripsApi.list });
}

export function useTripStats(userId?: string, today = localToday()) {
  return useQuery({ queryKey: tripKeys.stats(userId, today), queryFn: () => tripsApi.stats(today, userId) });
}

/** After creating, changing or deleting a trip. */
export function refreshTrips(client: QueryClient, tripId?: number) {
  void client.invalidateQueries({ queryKey: tripKeys.list });
  void client.invalidateQueries({ queryKey: ['tripStats'] });
  if (tripId != null) void client.invalidateQueries({ queryKey: tripKeys.trip(tripId) });
}

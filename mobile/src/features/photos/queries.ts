/**
 * Photo lists (TanStack Query). The URLs in them are signed and expire, so lists
 * are never persisted to disk and refetch shortly before they run out. Images
 * are cached by photo id (`cacheKey`), so a fresh URL doesn't download again.
 */

import { useQuery, type QueryClient } from '@tanstack/react-query';

import { photosApi } from '../../services/api';
import type { Photo, PhotoFilter } from '../../types';

const EARLY_MS = 60_000; // refresh a minute before the URLs expire

export function filterKey(filter: PhotoFilter): string {
  if ('place_type' in filter) return `${filter.place_type}:${filter.place_code}`;
  if ('trip_id' in filter) return `trip:${filter.trip_id}`;
  return 'all';
}

export const photoKeys = {
  forUser: (userId: string) => ['photos', userId] as const,
  list: (userId: string, filter: PhotoFilter) => ['photos', userId, filterKey(filter)] as const,
};

export function msUntilRefresh(photos: readonly Photo[] | undefined, now = Date.now()): number | false {
  if (!photos?.length) return false;
  const soonest = Math.min(...photos.map((p) => Date.parse(p.expires_at)));
  return Math.max(5_000, soonest - now - EARLY_MS);
}

export function usePhotos(userId: string | undefined, filter: PhotoFilter, enabled = true) {
  return useQuery({
    queryKey: photoKeys.list(userId ?? '', filter),
    queryFn: () => photosApi.forUser(userId!, filter),
    enabled: enabled && !!userId,
    staleTime: 4 * 60_000,
    refetchInterval: (query) => msUntilRefresh(query.state.data),
  });
}

/** After an upload or delete: every list of this user's photos may have changed. */
export function refreshPhotos(client: QueryClient, userId: string) {
  return client.invalidateQueries({ queryKey: photoKeys.forUser(userId) });
}

export const thumbSource = (p: Photo) => ({ uri: p.thumb_url, cacheKey: `photo:${p.id}:thumb` });
export const fullSource = (p: Photo) => ({ uri: p.url, cacheKey: `photo:${p.id}:full` });

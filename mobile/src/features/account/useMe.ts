import { useQuery } from '@tanstack/react-query';

import { meApi } from '../../services/api';

export const ME_QUERY_KEY = ['me'] as const;

/** The signed-in user's profile (GET /me). */
export function useMe(enabled = true) {
  return useQuery({ queryKey: ME_QUERY_KEY, queryFn: meApi.get, enabled, staleTime: 60_000 });
}

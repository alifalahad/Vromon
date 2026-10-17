/**
 * The signed-in user's visits, offline-first.
 *
 * - Reads: GET /users/{me}/visits, kept in the persisted query cache, so the map
 *   opens offline.
 * - Writes: applied to the cache immediately (the map recolours at once), then queued
 *   in a persisted outbox and sent when the server is reachable. Each change carries
 *   the time it was made; the server keeps the newest change per place.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { QueryClient } from '@tanstack/react-query';
import { useQuery } from '@tanstack/react-query';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { ApiError, visitsApi } from '../../services/api';
import type { PlaceType, Visit, VisitInput, VisitStatus } from '../../types';

export const visitsKey = (userId: string | undefined) => ['visits', userId] as const;

export function useVisits(userId: string | undefined) {
  return useQuery({
    queryKey: visitsKey(userId),
    queryFn: () => visitsApi.forUser(userId!),
    enabled: !!userId,
    staleTime: 60_000,
  });
}

// ---------------------------------------------------------------------------
// Outbox
// ---------------------------------------------------------------------------

export type VisitOp =
  | { kind: 'upsert'; visit: VisitInput }
  | { kind: 'remove'; place_type: PlaceType; place_code: string; at: string };

type OutboxState = {
  /** Owner of the queued ops; a different account never sends them */
  userId: string | null;
  ops: VisitOp[];
};

export const useVisitOutbox = create<OutboxState>()(
  persist(() => ({ userId: null, ops: [] }) as OutboxState, {
    name: 'vromon.visit-outbox',
    version: 1,
    storage: createJSONStorage(() => AsyncStorage),
  }),
);

const sameplace = (op: VisitOp, type: PlaceType, code: string) =>
  (op.kind === 'upsert' ? op.visit.place_type : op.place_type) === type &&
  (op.kind === 'upsert' ? op.visit.place_code : op.place_code) === code;

/** Queue an op, replacing an older queued op for the same place (only the latest matters). */
export function enqueue(userId: string, op: VisitOp) {
  const type = op.kind === 'upsert' ? op.visit.place_type : op.place_type;
  const code = op.kind === 'upsert' ? op.visit.place_code : op.place_code;
  const state = useVisitOutbox.getState();
  const ops = state.userId === userId ? state.ops.filter((o) => !sameplace(o, type, code)) : [];
  useVisitOutbox.setState({ userId, ops: [...ops, op] });
}

let flushing: Promise<void> | null = null;

/**
 * Send queued ops in order, only for the account that queued them (another
 * account's edits must never go out with this account's token). Stops at the first
 * network failure (retried later); an op the server rejects (4xx) is dropped so it
 * can't block the queue.
 */
export function flushOutbox(currentUserId: string, queryClient?: QueryClient): Promise<void> {
  if (flushing) return flushing;
  flushing = (async () => {
    let sent = false;
    for (;;) {
      const { ops, userId } = useVisitOutbox.getState();
      const op = ops[0];
      if (!op || userId !== currentUserId) break;
      try {
        if (op.kind === 'upsert') await visitsApi.upsert([op.visit]);
        else await visitsApi.remove(op.place_type, op.place_code);
        sent = true;
      } catch (e) {
        const status = e instanceof ApiError ? e.status : undefined;
        if (status === undefined || status >= 500 || status === 401 || status === 429) break; // offline / server down: retry later
        sent = true; // rejected and dropped: refetch so the map stops showing it
      }
      // By identity: a newer edit for the same place may have replaced it meanwhile
      useVisitOutbox.setState((s) => ({ ops: s.ops.filter((o) => o !== op) }));
    }
    if (sent && queryClient) await queryClient.invalidateQueries({ queryKey: visitsKey(currentUserId) });
  })().finally(() => {
    flushing = null;
  });
  return flushing;
}

// ---------------------------------------------------------------------------
// Edits (optimistic)
// ---------------------------------------------------------------------------

function updateCache(queryClient: QueryClient, userId: string, update: (visits: Visit[]) => Visit[]) {
  queryClient.setQueryData<Visit[]>(visitsKey(userId), (old) => update(old ?? []));
}

export type PlaceRef = { place_type: PlaceType; place_code: string; country_iso2?: string | null };

export function setVisitStatus(
  queryClient: QueryClient,
  userId: string,
  ref: PlaceRef,
  status: VisitStatus,
  extra: Pick<VisitInput, 'first_visited_on' | 'last_visited_on' | 'note'> = {},
) {
  const now = new Date().toISOString();
  // Only the API's fields: callers may pass richer objects (e.g. search results with names)
  const place = { place_type: ref.place_type, place_code: ref.place_code };
  const country_iso2 = ref.country_iso2;
  const input: VisitInput = { ...place, status, ...extra, client_updated_at: now };
  updateCache(queryClient, userId, (visits) => {
    const others = visits.filter((v) => !(v.place_type === place.place_type && v.place_code === place.place_code));
    const previous = visits.find((v) => v.place_type === place.place_type && v.place_code === place.place_code);
    return [
      ...others,
      {
        place_type: place.place_type,
        place_code: place.place_code,
        status,
        first_visited_on: extra.first_visited_on ?? previous?.first_visited_on ?? null,
        last_visited_on: extra.last_visited_on ?? previous?.last_visited_on ?? null,
        note: extra.note ?? previous?.note ?? null,
        updated_at: now,
        country_iso2: country_iso2 ?? previous?.country_iso2 ?? null,
      },
    ];
  });
  enqueue(userId, { kind: 'upsert', visit: input });
  void flushOutbox(userId, queryClient);
}

export function clearVisit(queryClient: QueryClient, userId: string, ref: PlaceRef) {
  const place = { place_type: ref.place_type, place_code: ref.place_code };
  updateCache(queryClient, userId, (visits) =>
    visits.filter((v) => !(v.place_type === place.place_type && v.place_code === place.place_code)),
  );
  enqueue(userId, { kind: 'remove', ...place, at: new Date().toISOString() });
  void flushOutbox(userId, queryClient);
}

/** A place's current status (from the cache, so offline edits show immediately). */
export function statusOf(visits: readonly Visit[] | undefined, type: PlaceType, code: string): VisitStatus | null {
  return visits?.find((v) => v.place_type === type && v.place_code === code)?.status ?? null;
}

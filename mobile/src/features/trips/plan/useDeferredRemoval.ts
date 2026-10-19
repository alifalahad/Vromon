/**
 * Remove a stop with Undo. The stop disappears at once; the server is asked to
 * remove it only when its Undo window ends (or the screen closes), so Undo is
 * just "don't send it". The backend has no "put it back" call.
 *
 * Each stop has its own timer, and asking to remove a stop that is already
 * waiting does nothing (a swipe can report "opened" more than once).
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { tripsApi } from '../../../services/api';

export const UNDO_MS = 5000;

export function useDeferredRemoval(tripId: number, refresh: () => Promise<unknown>, onError: (error: unknown) => void) {
  const [hidden, setHidden] = useState<number[]>([]);
  const pending = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const mounted = useRef(true);
  // Keep the latest callbacks without re-creating the timers
  const latest = useRef({ refresh, onError });
  useEffect(() => {
    latest.current = { refresh, onError };
  });

  const commit = useCallback(
    async (itemId: number) => {
      pending.current.delete(itemId);
      try {
        await tripsApi.removeItem(tripId, itemId);
        await latest.current.refresh();
      } catch (e) {
        if (mounted.current) latest.current.onError(e);
      } finally {
        if (mounted.current) setHidden((h) => h.filter((x) => x !== itemId));
      }
    },
    [tripId],
  );

  const remove = useCallback(
    (itemId: number) => {
      if (pending.current.has(itemId)) return;
      setHidden((h) => (h.includes(itemId) ? h : [...h, itemId]));
      pending.current.set(
        itemId,
        setTimeout(() => commit(itemId), UNDO_MS),
      );
    },
    [commit],
  );

  /** Cancel the removal of `itemId`, if it hasn't been sent yet. */
  const undo = useCallback((itemId: number) => {
    const timer = pending.current.get(itemId);
    if (timer == null) return;
    clearTimeout(timer);
    pending.current.delete(itemId);
    setHidden((h) => h.filter((x) => x !== itemId));
  }, []);

  // Leaving the screen ends the Undo windows: send the removals now
  useEffect(() => {
    mounted.current = true;
    const waiting = pending.current;
    return () => {
      mounted.current = false;
      for (const [itemId, timer] of [...waiting]) {
        clearTimeout(timer);
        commit(itemId);
      }
    };
  }, [commit]);

  return { hidden, remove, undo };
}

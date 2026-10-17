/**
 * Live username check: local rules first (instant), then the server's
 * availability endpoint, debounced so typing doesn't send a request per key.
 */

import { useEffect, useState } from 'react';

import { meApi } from '../../services/api';
import { normalizeUsername, usernameProblem, type UsernameProblem } from './username';

export type UsernameCheck =
  | { state: 'empty' }
  | { state: 'invalid'; problem: UsernameProblem }
  | { state: 'checking' }
  | { state: 'available' }
  | { state: 'taken' }
  | { state: 'error' };

const DEBOUNCE_MS = 400;

export function useUsernameCheck(input: string, current?: string | null): { name: string; check: UsernameCheck } {
  const name = normalizeUsername(input);
  const problem = name ? usernameProblem(name) : null;
  const local: UsernameCheck | null = !name
    ? { state: 'empty' }
    : problem
      ? { state: 'invalid', problem }
      : name === current
        ? { state: 'available' }
        : null;
  const [remote, setRemote] = useState<{ name: string; check: UsernameCheck } | null>(null);

  useEffect(() => {
    if (local) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      meApi
        .usernameAvailable(name)
        .then((r) => !cancelled && setRemote({ name, check: { state: r.available ? 'available' : 'taken' } }))
        .catch(() => !cancelled && setRemote({ name, check: { state: 'error' } }));
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // `local` is derived from `name` and `current`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, current]);

  if (local) return { name, check: local };
  return { name, check: remote?.name === name ? remote.check : { state: 'checking' } };
}

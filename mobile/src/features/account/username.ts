/**
 * Username rules — the same as the backend (app/schemas/accounts.py), so the app
 * can explain problems before asking the server. The server stays authoritative.
 */

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;
const RESERVED = new Set([
  'admin', 'administrator', 'root', 'support', 'help', 'vromon', 'official', 'staff', 'moderator', 'system', 'api', 'me', 'null', 'undefined',
]);

export type UsernameProblem = 'length' | 'characters' | 'dots' | 'reserved';

export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

export function usernameProblem(name: string): UsernameProblem | null {
  if (name.length < USERNAME_MIN || name.length > USERNAME_MAX) return 'length';
  if (!/^[a-z0-9._]+$/.test(name)) return 'characters';
  if (name.startsWith('.') || name.endsWith('.') || name.includes('..')) return 'dots';
  if (RESERVED.has(name)) return 'reserved';
  return null;
}

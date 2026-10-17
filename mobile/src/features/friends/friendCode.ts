/**
 * Friend codes: 8 characters from an alphabet without look-alikes (no 0/O, 1/I/L),
 * the same as the server's. A QR code holds the invite link, so the phone's own
 * camera app can open Vromon too; the in-app scanner also accepts a bare code.
 */

export const FRIEND_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const FRIEND_CODE_LENGTH = 8;

/** The link a QR code or a share holds. Opens the app through the `vromon` scheme. */
export function inviteLink(code: string): string {
  return `vromon://add/${code}`;
}

function normalize(code: string): string | null {
  const c = code.trim().toUpperCase();
  if (c.length !== FRIEND_CODE_LENGTH) return null;
  return [...c].every((ch) => FRIEND_CODE_ALPHABET.includes(ch)) ? c : null;
}

/** The friend code in a scanned QR, a pasted link or typed text; null if there isn't one. */
export function parseFriendCode(text: string): string | null {
  const trimmed = text.trim();
  // vromon://add/CODE, https://any.host/add/CODE (App Links later), with or without a trailing slash
  const fromLink = /^(?:[a-z][a-z0-9+.-]*:\/\/)(?:[^/]+\/)?add\/([A-Za-z0-9]+)\/?(?:[?#].*)?$/i.exec(trimmed);
  if (fromLink) return normalize(fromLink[1]);
  return normalize(trimmed.replace(/[\s-]/g, ''));
}

/** "ABCD2345" → "ABCD 2345", easier to read aloud. */
export function formatFriendCode(code: string): string {
  return `${code.slice(0, 4)} ${code.slice(4)}`;
}

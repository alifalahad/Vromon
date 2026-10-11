/**
 * Vromon Mobile — display formatting helpers (pure, unit-tested).
 */

/** "৳1,500" — rounds to whole taka. Uses an explicit grouping so output is the same on every device. */
export function formatBDT(amount: number): string {
  const rounded = Math.round(amount);
  const sign = rounded < 0 ? '-' : '';
  const digits = String(Math.abs(rounded)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${sign}৳${digits}`;
}

/** 95 → "1 h 35 min", 40 → "40 min". */
export function formatMinutes(minutes: number): string {
  const m = Math.round(minutes);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${h} h ${rest} min` : `${h} h`;
}

/** Number of nights between two YYYY-MM-DD dates (never negative). */
export function nightsBetween(start: string, end: string): number {
  const ms = new Date(`${end}T00:00:00Z`).getTime() - new Date(`${start}T00:00:00Z`).getTime();
  return Math.max(0, Math.round(ms / 86_400_000));
}

export function percent(score: number): string {
  return `${Math.round(score * 100)}%`;
}

/** plural(1, 'night') → "1 night", plural(2, 'night') → "2 nights". */
export function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

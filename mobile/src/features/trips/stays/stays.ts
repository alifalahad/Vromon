/**
 * Where the traveller stays, night by night (docs/trip-upgrades, step 2): the choices the app
 * edits (one per night), turned into the stays the server takes (nights that share a choice are
 * one stay), and how they're named. Pure, unit-tested.
 */

import type { DayBase, Hotel, Stay, StayIn, StayKind } from '../../../types';

/** One night's choice. `auto`: nothing chosen, Vromon picks a hotel (a new trip only) */
export type StayPick =
  | { kind: 'auto' }
  | { kind: 'hotel'; hotelId: number; name: string; perNight: number | null }
  | { kind: 'home'; lat: number; lon: number; label: string | null }
  | { kind: 'none' }
  | { kind: 'undecided' };

export const nightsOf = (days: number) => Math.max(0, days - 1);

export function samePick(a: StayPick, b: StayPick): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'hotel' && b.kind === 'hotel') return a.hotelId === b.hotelId;
  if (a.kind === 'home' && b.kind === 'home') return a.lat === b.lat && a.lon === b.lon && a.label === b.label;
  return true;
}

export function hotelPick(h: Pick<Hotel, 'id' | 'name' | 'price_per_night' | 'price_known'>): StayPick {
  return { kind: 'hotel', hotelId: h.id, name: h.name, perNight: h.price_known === false ? null : h.price_per_night };
}

/** The server's stays as one pick per night (missing nights: the last stay's). */
export function picksFromStays(stays: readonly (Stay | StayIn)[], nights: number): StayPick[] {
  const pickOf = (s: Stay | StayIn): StayPick => {
    if (s.kind === 'hotel') {
      const h = 'hotel' in s ? s.hotel : null;
      const id = h?.id ?? (s as StayIn).hotel_id ?? 0;
      return { kind: 'hotel', hotelId: id, name: h?.name ?? '', perNight: h && h.price_known ? h.price_per_night : null };
    }
    if (s.kind === 'home') return { kind: 'home', lat: s.lat ?? 0, lon: s.lon ?? 0, label: s.label ?? null };
    return { kind: s.kind };
  };
  const out: StayPick[] = [];
  for (let n = 1; n <= nights; n++) {
    const s = stays.find((x) => x.first_night <= n && n <= x.last_night) ?? stays[stays.length - 1];
    out.push(s ? pickOf(s) : { kind: 'auto' });
  }
  return out;
}

/** One pick per night as the stays to send (consecutive equal nights become one stay). null: Vromon picks. */
export function staysFromPicks(picks: readonly StayPick[]): StayIn[] | null {
  if (!picks.length || picks.every((p) => p.kind === 'auto')) return null;
  const out: StayIn[] = [];
  picks.forEach((p, i) => {
    const night = i + 1;
    const last = out[out.length - 1];
    if (last && i > 0 && samePick(picks[i - 1], p)) {
      last.last_night = night;
      return;
    }
    // A night left to Vromon among chosen ones: "decide later" (the server needs every night)
    const pick: StayPick = p.kind === 'auto' ? { kind: 'undecided' } : p;
    out.push({
      first_night: night,
      last_night: night,
      kind: pick.kind as StayKind,
      hotel_id: pick.kind === 'hotel' ? pick.hotelId : null,
      label: pick.kind === 'home' ? pick.label : null,
      lat: pick.kind === 'home' ? pick.lat : null,
      lon: pick.kind === 'home' ? pick.lon : null,
    });
  });
  return out;
}

/** True when every night has the same choice. */
export function allSame(picks: readonly StayPick[]): boolean {
  return picks.every((p) => samePick(p, picks[0]));
}

/** Nights that cost nothing (a home, or no night there). */
export function freeNights(picks: readonly StayPick[]): number {
  return picks.filter((p) => p.kind === 'home' || p.kind === 'none').length;
}

/**
 * What a free night takes off the suggested budget: the middle price of the destination's priced
 * hotels at that level, per room. 0 when no hotel there has a price (nothing is guessed).
 */
export function freeNightSaving(hotels: readonly Hotel[], level: string, rooms: number): number {
  const prices = hotels
    .filter((h) => h.category === level && h.price_known !== false && h.price_per_night > 0)
    .map((h) => h.price_per_night)
    .sort((a, b) => a - b);
  if (!prices.length) return 0;
  const mid = prices.length % 2 ? prices[(prices.length - 1) / 2] : (prices[prices.length / 2 - 1] + prices[prices.length / 2]) / 2;
  return Math.round(mid) * rooms;
}

type T = (key: string, options?: Record<string, unknown>) => string;

/** A pick in words: "Hotel Castle Salam", "Uncle's house", "With family or friends", "Day trips, no night here"… */
export function pickName(p: StayPick, t: T): string {
  switch (p.kind) {
    case 'hotel':
      return p.name;
    case 'home':
      return p.label || t('stays.home');
    case 'none':
      return t('stays.none');
    case 'undecided':
      return t('stays.undecided');
    default:
      return t('stays.auto');
  }
}

/** A day's start or end in words; a home that isn't yours is only "with family or friends". */
export function baseName(base: DayBase | null | undefined, t: T): string | null {
  if (!base) return null;
  if (base.kind === 'hotel') return base.name;
  if (base.kind === 'home') return base.name || t('stays.home');
  if (base.kind === 'none') return base.name || t('stays.startPoint');
  return t('stays.undecidedShort');
}

/** The icon of a stay kind (the map's pin and the rows). */
export function stayIcon(kind: StayKind | 'auto'): 'bed-outline' | 'home-heart' | 'home-import-outline' | 'help-circle-outline' {
  if (kind === 'home') return 'home-heart';
  if (kind === 'none') return 'home-import-outline';
  if (kind === 'undecided') return 'help-circle-outline';
  return 'bed-outline';
}

type StayBlockLine = NonNullable<import('../../../types').BudgetPart['detail']['blocks']>[number];
type Fmt = { n: (v: number) => string; money: (v: number) => string };

/** The nights of a stay in words: "Night 3", "Nights 1–2". */
export function nightsText(first: number, last: number, t: T, f: Pick<Fmt, 'n'>): string {
  return first === last ? t('stays.nightN', { n: f.n(first) }) : t('stays.nightsRange', { from: f.n(first), to: f.n(last) });
}

/**
 * The budget's stay, a line per stay (docs/trip-upgrades, step 2): when the stay isn't one hotel
 * for every night. "Nights 1–2 · Hotel X · ৳6,000", "Night 3 · With family or friends · No cost",
 * "Night 3 · Decide later · Not chosen yet". Empty for one hotel (the part's own line says it).
 */
export function stayLines(blocks: readonly StayBlockLine[] | undefined, t: T, f: Fmt): { key: string; nights: string; name: string; amount: string; free: boolean }[] {
  if (!blocks?.length || (blocks.length === 1 && blocks[0].kind === 'hotel')) return [];
  return blocks.map((b) => {
    const name =
      b.kind === 'hotel' ? b.hotel ?? t('stays.undecided') : b.kind === 'home' ? b.label || t('stays.home') : b.kind === 'none' ? t('stays.none') : t('stays.undecided');
    const free = b.kind === 'home' || b.kind === 'none';
    const amount = free ? t('stays.noCostShort') : b.amount != null ? f.money(b.amount) : b.kind === 'undecided' ? t('stays.notChosen') : t('budget.unknown');
    return { key: `${b.first_night}-${b.kind}`, nights: nightsText(b.first_night, b.last_night, t, f), name, amount, free };
  });
}

/**
 * "Where to?" search in the trip wizard: finds a destination Vromon can plan from
 * whatever people type, the way travel apps' destination search works:
 *
 * - its name in English or Bangla, or another spelling (Chittagong, Srimangal);
 * - a typo of a word or two letters (sylet, srimongol);
 * - a district or division it lies in (Moulvibazar → Sreemangal, Barishal → Kuakata);
 * - an attraction there (Ratargul → Sylhet).
 *
 * One row per destination, best match first, at most MAX_RESULTS (Baymard: 4–8 on
 * mobile). Pure functions, so the screen only renders.
 */

import type { Destination, Place } from '../../../types';

export const MAX_RESULTS = 8;

/** Other names people use for a destination (old spellings, Bangla), by destination name. */
export const DESTINATION_NAMES: Record<string, { bn: string; also?: string[] }> = {
  Bandarban: { bn: 'বান্দরবান' },
  Chattogram: { bn: 'চট্টগ্রাম', also: ['Chittagong', 'Ctg'] },
  "Cox's Bazar": { bn: 'কক্সবাজার', also: ['Coxs Bazar', 'Cox Bazar', 'Coxbazar'] },
  Dhaka: { bn: 'ঢাকা', also: ['Dacca'] },
  Khulna: { bn: 'খুলনা' },
  Kuakata: { bn: 'কুয়াকাটা' },
  Rajshahi: { bn: 'রাজশাহী' },
  Rangamati: { bn: 'রাঙ্গামাটি', also: ['রাঙামাটি'] },
  Sreemangal: { bn: 'শ্রীমঙ্গল', also: ['Srimangal', 'Shrimangal', 'Sreemongol', 'Srimongol'] },
  Sylhet: { bn: 'সিলেট' },
  Tangail: { bn: 'টাঙ্গাইল' },
};

export type HitKind = 'destination' | 'place' | 'district' | 'division';

export type SearchHit = {
  destination: Destination;
  kind: HitKind;
  /** What matched, as shown: the destination, the attraction, the district or the division */
  label: string;
  /** The same in Bangla, for districts and divisions */
  labelBn?: string;
  /** Typed text inside `label`, for bold (NN/g: highlight the typed part when it can match anywhere) */
  match: [number, number] | null;
  /** For a district: how far the destination is */
  km?: number;
  /** For an attraction: its category and id (picking it adds it to the trip's must-sees) */
  category?: string;
  placeId?: number;
  score: number;
};

/** A district or division from the bundled map data. */
export type Area = { name: string; name_bn?: string; lon: number; lat: number; division?: string };

type Entry = {
  destination: Destination;
  kind: HitKind;
  label: string;
  labelBn?: string;
  terms: string[];
  km?: number;
  category?: string;
  placeId?: number;
};

// What kind of match ranks higher when the text matches equally well. A division beats a
// district: most division names are district names too (Barishal), and a destination in the
// division (Kuakata) is a better answer than one merely near the district (Khulna, 81 km)
const KIND_BONUS: Record<HitKind, number> = { destination: 20, division: 8, district: 4, place: 0 };

/** Lower case, accents off (Jamālpur), apostrophes gone (Cox's), Latin and Bangla letters kept. */
export function normalize(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9ঀ-৿]+/g, ' ')
    .trim();
}

export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cur = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
  }
  return row[b.length];
}

const km = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => {
  const r = Math.PI / 180;
  const h = Math.sin(((b.lat - a.lat) * r) / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lon - a.lon) * r) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
};

// A district is suggested through the nearest destination within this distance
const DISTRICT_MAX_KM = 90;

/** Everything a search can match, built once per data change. */
export function buildIndex(
  destinations: readonly Destination[],
  places: readonly Place[],
  districts: readonly Area[],
  divisions: readonly (Area & { code: string })[],
): Entry[] {
  const entries: Entry[] = [];
  const byName = new Map(destinations.map((d) => [normalize(d.name), d]));

  for (const d of destinations) {
    const names = DESTINATION_NAMES[d.name];
    entries.push({ destination: d, kind: 'destination', label: d.name, terms: [d.name, names?.bn ?? '', ...(names?.also ?? [])].filter(Boolean).map(normalize) });
  }

  for (const p of places) {
    const d = destinations.find((x) => x.name === p.destination_name);
    if (d) entries.push({ destination: d, kind: 'place', label: p.name, terms: [normalize(p.name)], category: p.category, placeId: p.id });
  }

  const placed = destinations.filter((d) => d.latitude != null && d.longitude != null && (d.latitude !== 0 || d.longitude !== 0));
  for (const area of districts) {
    if (byName.has(normalize(area.name))) continue; // the destination itself matches already
    const nearest = placed
      .map((d) => ({ d, km: km(area, { lat: d.latitude!, lon: d.longitude! }) }))
      .sort((a, b) => a.km - b.km)[0];
    if (!nearest || nearest.km > DISTRICT_MAX_KM) continue;
    entries.push({
      destination: nearest.d,
      kind: 'district',
      label: area.name,
      labelBn: area.name_bn,
      terms: [area.name, area.name_bn ?? ''].filter(Boolean).map(normalize),
      km: Math.round(nearest.km),
    });
  }

  for (const division of divisions) {
    for (const d of destinations.filter((x) => x.region_code === division.code)) {
      entries.push({
        destination: d,
        kind: 'division',
        label: division.name,
        labelBn: division.name_bn,
        terms: [division.name, division.name_bn ?? ''].filter(Boolean).map(normalize),
      });
    }
  }
  return entries;
}

/** How well a normalized query matches a normalized term (0: not at all). */
function termScore(q: string, term: string): number {
  if (!term) return 0;
  if (term === q) return 100;
  if (term.startsWith(q)) return 90;
  const words = term.split(' ');
  if (words.some((w) => w.startsWith(q))) return 80;
  if (term.includes(q)) return 60;
  // Typos: a letter or two off, against a word or the same-length start of one
  if (q.length >= 4) {
    const allowed = q.length >= 7 ? 2 : 1;
    const best = Math.min(...words.flatMap((w) => [editDistance(q, w), editDistance(q, w.slice(0, q.length))]), editDistance(q, term));
    if (best <= allowed) return 45 - best * 5;
  }
  return 0;
}

/** Where the typed text sits in the label, ignoring case (null when it matched another way). */
export function matchRange(label: string, query: string): [number, number] | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  const i = label.toLowerCase().indexOf(q);
  return i >= 0 ? [i, i + q.length] : null;
}

/** The best hits, one per destination. */
export function searchDestinations(index: readonly Entry[], query: string, limit = MAX_RESULTS): SearchHit[] {
  const q = normalize(query);
  if (!q) return [];
  const best = new Map<number, SearchHit>();
  for (const e of index) {
    const s = Math.max(0, ...e.terms.map((t) => termScore(q, t)));
    if (s === 0) continue;
    const score = s + KIND_BONUS[e.kind];
    const prev = best.get(e.destination.id);
    if (!prev || score > prev.score) {
      best.set(e.destination.id, {
        destination: e.destination,
        kind: e.kind,
        label: e.label,
        labelBn: e.labelBn,
        match: matchRange(e.label, query),
        km: e.km,
        category: e.category,
        placeId: e.placeId,
        score,
      });
    }
  }
  return [...best.values()].sort((a, b) => b.score - a.score || a.destination.name.localeCompare(b.destination.name)).slice(0, limit);
}

/** With nothing found: the destination whose name is closest to what was typed, if any is close. */
export function didYouMean(destinations: readonly Destination[], query: string): Destination | null {
  const q = normalize(query);
  if (q.length < 3) return null;
  let best: { d: Destination; dist: number } | null = null;
  for (const d of destinations) {
    const names = [d.name, ...(DESTINATION_NAMES[d.name]?.also ?? [])].map(normalize);
    // Against the whole name (a letter left out: silet) and its start (still typing: kuakataa)
    const dist = Math.min(...names.flatMap((n) => [editDistance(q, n), editDistance(q, n.slice(0, q.length))]));
    if (!best || dist < best.dist) best = { d, dist };
  }
  return best && best.dist <= Math.max(2, Math.floor(q.length / 3)) ? best.d : null;
}

/** A destination's name in the app language (Bangla when we know it). */
export const destinationName = (name: string, lang: string) => (lang === 'bn' && DESTINATION_NAMES[name]?.bn) || name;

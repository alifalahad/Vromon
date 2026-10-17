/**
 * Country names for pickers (home country), in English and Bangla, from
 * i18n-iso-countries (ISO 3166-1 alpha-2). The world map's reference data
 * (Natural Earth, Bangladesh point of view) replaces this in Phase 3.
 */

import countries from 'i18n-iso-countries';
import bn from 'i18n-iso-countries/langs/bn.json';
import en from 'i18n-iso-countries/langs/en.json';

import type { Language } from '../preferences/store';

countries.registerLocale(en);
countries.registerLocale(bn);

export type Country = { code: string; name: string; flag: string };

/** Emoji flag from the two regional-indicator letters of an ISO code. */
export function flagEmoji(code: string): string {
  return String.fromCodePoint(...[...code.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

const cache = new Map<Language, Country[]>();

export function countryList(lang: Language): Country[] {
  let list = cache.get(lang);
  if (!list) {
    const names = countries.getNames(lang, { select: 'official' });
    list = Object.entries(names)
      .map(([code, name]) => ({ code, name, flag: flagEmoji(code) }))
      .sort((a, b) => a.name.localeCompare(b.name, lang));
    cache.set(lang, list);
  }
  return list;
}

export function countryName(code: string | null | undefined, lang: Language): string | null {
  if (!code) return null;
  return countries.getName(code, lang, { select: 'official' }) ?? code;
}

/** Case-insensitive match on name or code. */
export function searchCountries(list: Country[], query: string): Country[] {
  const q = query.trim().toLocaleLowerCase();
  if (!q) return list;
  return list.filter((c) => c.name.toLocaleLowerCase().includes(q) || c.code.toLowerCase() === q);
}

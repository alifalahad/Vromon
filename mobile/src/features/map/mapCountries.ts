/**
 * The countries on the map (bundled Natural Earth layer, Bangladesh point of view),
 * with English and Bangla names: the only countries that can be marked.
 */

import type { Language } from '../preferences/store';
import { flagEmoji } from '../geo/countries';

const COUNTRIES = require('../../../assets/geo/countries.json') as GeoJSON.FeatureCollection<GeoJSON.Geometry, { iso2: string; name: string; name_bn: string | null }>;

export type MapCountry = { code: string; name: string; flag: string };

const cache = new Map<Language, MapCountry[]>();

export function mapCountries(lang: Language): MapCountry[] {
  let list = cache.get(lang);
  if (!list) {
    const seen = new Set<string>();
    list = [];
    for (const f of COUNTRIES.features) {
      const { iso2, name, name_bn } = f.properties;
      if (seen.has(iso2)) continue;
      seen.add(iso2);
      list.push({ code: iso2, name: (lang === 'bn' && name_bn) || name, flag: flagEmoji(iso2) });
    }
    list.sort((a, b) => a.name.localeCompare(b.name, lang));
    cache.set(lang, list);
  }
  return list;
}

export function mapCountryName(code: string, lang: Language): string {
  return mapCountries(lang).find((c) => c.code === code)?.name ?? code;
}

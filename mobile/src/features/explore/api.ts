/**
 * Explore: Bangladesh's divisions and districts (with GI foods, attractions, hotels) and the
 * world's continents, countries and cities (GET /explore/*). Everything is from the catalog:
 * photos only with an approved licence, each with its credit.
 */

import { useQuery } from '@tanstack/react-query';
import type { TFunction } from 'i18next';

import api from '../../services/api';
import { localDigits } from '../trips/plan/usePlanFormat';

export type ExplorePhoto = {
  /** photo of the place itself; attraction: of a sight there (`caption`); satellite: Esri imagery */
  kind: 'photo' | 'attraction' | 'satellite';
  url: string | null;
  thumb_url: string | null;
  page_url: string;
  license: string | null;
  attribution: string | null;
  caption?: string | null;
};

export type Photo = Omit<ExplorePhoto, 'kind' | 'caption'>;

export type DistrictCounts = {
  attractions: number;
  gi_foods: number;
  gi_products: number;
  hotels: number;
  hotels_with_price: number;
  restaurants: number;
};

export type DistrictCard = {
  slug: string;
  name_en: string | null;
  name_bn: string | null;
  division_slug: string | null;
  division_en: string | null;
  division_bn: string | null;
  centroid_lat: number | null;
  centroid_lon: number | null;
  area_km2: number | null;
  bbox: [number, number, number, number] | null;
  photo: ExplorePhoto | null;
  counts: DistrictCounts;
};

export type Division = { slug: string; name_en: string | null; name_bn: string | null; area_km2: number | null; districts: DistrictCard[] };

export type GiFood = {
  name_bn: string;
  name_en: string | null;
  district_slug: string | null;
  is_food: boolean;
  gi_registration_no: string | null;
  gi_application_date: string | null;
  source_url: string | null;
};

export type CountryFacts = {
  capital_en: string | null;
  capital_bn: string | null;
  population: number | null;
  population_year: number | null;
  area_km2: number | null;
  currencies: { code: string; name: string | null }[];
  languages: string[];
  calling_codes: string[];
  description_en: string | null;
  description_bn: string | null;
  wikidata_id: string | null;
};

export type CountryCard = {
  iso2: string;
  name: string;
  name_bn: string | null;
  continent: string | null;
  un_member_or_observer: boolean;
  status: string | null;
  photo: ExplorePhoto | null;
  facts: CountryFacts | null;
};

export type CityCard = {
  geonameid: number;
  name: string;
  country_iso2: string;
  country_name: string | null;
  region: string | null;
  population: number;
  latitude: number;
  longitude: number;
  photo: ExplorePhoto | null;
};

export type Bangladesh = { country: CountryCard; divisions: Division[]; gi_foods: GiFood[]; sources: string[] };

export type Continent = {
  name: string;
  countries: number;
  un_members_and_observers: number;
  population: number | null;
  largest: CountryCard[];
};

export type RoomPrice = { from_amount: number; currency: string; room: string; source_url: string | null; checked_at: string };

export type Hotel = {
  slug: string;
  name_en: string | null;
  name_bn: string | null;
  category: string | null;
  latitude: number | null;
  longitude: number | null;
  address: string | null;
  website: string | null;
  official_star_rating: number | null;
  price: RoomPrice | null;
};

export type Attraction = {
  slug: string;
  name_en: string | null;
  name_bn: string | null;
  category: string | null;
  latitude: number | null;
  longitude: number | null;
  short_description_en: string | null;
  photo: Photo | null;
};

export type Named = { slug: string; name_en: string | null; name_bn: string | null };

export type DistrictDetail = DistrictCard & {
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon | null;
  neighbors: Named[];
  subdistricts: Named[];
  foods: GiFood[];
  attractions: Attraction[];
  hotels: Hotel[];
  trip_destinations: { id: number; name: string }[];
};

export type CountryDetail = CountryCard & { regions: number; cities: CityCard[]; label_lat: number | null; label_lon: number | null };

export type SearchResult = { districts: DistrictCard[]; countries: CountryCard[]; cities: CityCard[] };

export const exploreApi = {
  bangladesh: () => api.get<Bangladesh>('/explore/bangladesh').then((r) => r.data),
  district: (slug: string) => api.get<DistrictDetail>(`/explore/districts/${slug}`).then((r) => r.data),
  continents: () => api.get<Continent[]>('/explore/continents').then((r) => r.data),
  countries: (continent?: string) => api.get<CountryCard[]>('/explore/countries', { params: { continent } }).then((r) => r.data),
  country: (iso2: string) => api.get<CountryDetail>(`/explore/countries/${iso2}`).then((r) => r.data),
  cities: (params: { continent?: string; country?: string; limit?: number }) =>
    api.get<CityCard[]>('/explore/cities', { params }).then((r) => r.data),
  search: (q: string) => api.get<SearchResult>('/explore/search', { params: { q } }).then((r) => r.data),
};

// The catalog changes with imports, not by the minute. Queries are kept on the phone between
// launches: bump V when the responses change shape so phones fetch them again
const STALE = 30 * 60 * 1000;
const V = 'explore-2';

export const useBangladesh = () => useQuery({ queryKey: [V, 'bd'], queryFn: exploreApi.bangladesh, staleTime: STALE });
export const useDistrict = (slug: string) =>
  useQuery({ queryKey: [V, 'district', slug], queryFn: () => exploreApi.district(slug), enabled: !!slug, staleTime: STALE });
export const useContinents = () => useQuery({ queryKey: [V, 'continents'], queryFn: exploreApi.continents, staleTime: STALE });
export const useCountries = (continent?: string) =>
  useQuery({ queryKey: [V, 'countries', continent ?? ''], queryFn: () => exploreApi.countries(continent), staleTime: STALE });
export const useCountry = (iso2: string) =>
  useQuery({ queryKey: [V, 'country', iso2], queryFn: () => exploreApi.country(iso2), enabled: !!iso2, staleTime: STALE });
export const useCities = (params: { continent?: string; country?: string; limit?: number }) =>
  useQuery({ queryKey: [V, 'cities', params], queryFn: () => exploreApi.cities(params), staleTime: STALE });
export const useExploreSearch = (q: string) =>
  useQuery({ queryKey: [V, 'search', q], queryFn: () => exploreApi.search(q), enabled: q.trim().length >= 2, staleTime: STALE });

/** The name in the app's language, falling back to the other one. */
export function localName(item: { name_en?: string | null; name_bn?: string | null }, lang: string): string {
  return (lang === 'bn' ? item.name_bn || item.name_en : item.name_en || item.name_bn) ?? '';
}

const UNITS: { at: number; en: string; bn: string }[] = [
  { at: 1e9, en: 'B', bn: ' শত কোটি' },
  { at: 1e7, en: '', bn: ' কোটি' },
  { at: 1e6, en: 'M', bn: '' },
  { at: 1e5, en: '', bn: ' লাখ' },
  { at: 1e3, en: 'K', bn: ' হাজার' },
];

/** A big number the way people say it: 171.5M in English, ১৭.১ কোটি in Bangla. */
export function compactNumber(n: number, lang: string): string {
  const bn = lang.startsWith('bn');
  const unit = UNITS.find((u) => n >= u.at && (bn ? u.bn : u.en));
  if (!unit) return fullNumber(n, lang);
  const v = n / unit.at;
  const text = (v >= 100 ? Math.round(v) : Math.round(v * 10) / 10).toString();
  return localDigits(text + (bn ? unit.bn : unit.en), lang);
}

export function fullNumber(n: number, lang: string): string {
  return localDigits(Math.round(n).toLocaleString('en-US'), lang);
}

/** Continent names as the catalog stores them (Natural Earth), with their translation keys. */
export const CONTINENT_KEYS: Record<string, string> = {
  Africa: 'africa',
  Antarctica: 'antarctica',
  Asia: 'asia',
  Europe: 'europe',
  'North America': 'northAmerica',
  Oceania: 'oceania',
  'South America': 'southAmerica',
};

/** A district card's second line: its sights and hotels, else its division. */
export function districtLine(d: DistrictCard, t: TFunction, lang: string): string {
  const parts: string[] = [];
  if (d.counts.attractions) parts.push(t('explore.nSights', { count: d.counts.attractions, n: localDigits(String(d.counts.attractions), lang) }));
  if (d.counts.hotels) parts.push(t('explore.nHotels', { count: d.counts.hotels, n: localDigits(String(d.counts.hotels), lang) }));
  return parts.join(' · ') || (lang === 'bn' ? d.division_bn || d.division_en || '' : d.division_en || '');
}

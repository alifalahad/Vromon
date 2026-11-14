/**
 * Names and points for the places on the travel dashboard (docs/ui-refresh step 2). Countries,
 * Bangladesh's divisions and its districts are in the app; other regions and every city come from
 * the server's lookup by code, kept in the persisted query cache so the lists still read offline.
 */

import { useQuery } from '@tanstack/react-query';

import type { Language } from '../preferences/store';
import { geoApi } from '../../services/api';
import type { Visit } from '../../types';
import { HOME_DISTRICT_AREAS, HOME_REGIONS } from './geoData';
import { countryBounds } from './home';
import { mapCountryName } from './mapCountries';

export type PlacePoint = { name: string; name_bn?: string | null; lat: number | null; lon: number | null; region?: string | null; country: string };
export type PlaceLookup = { regions: Map<string, PlacePoint>; cities: Map<string, PlacePoint> };

const EMPTY: PlaceLookup = { regions: new Map(), cities: new Map() };
const BUNDLED_REGIONS = new Set(HOME_REGIONS.features.map((f) => f.properties.code));

/** The lookup for these marks: only what the app doesn't have itself is asked for. */
export function useTravelPlaces(visits: readonly Visit[]): { lookup: PlaceLookup; loading: boolean; failed: boolean } {
  const regions = [...new Set(visits.filter((v) => v.place_type === 'region' && !BUNDLED_REGIONS.has(v.place_code)).map((v) => v.place_code))].sort();
  const cities = [...new Set(visits.filter((v) => v.place_type === 'city').map((v) => v.place_code))].sort();
  const q = useQuery({
    queryKey: ['travelPlaces', regions, cities],
    queryFn: () => geoApi.places(regions, cities),
    enabled: regions.length + cities.length > 0,
    staleTime: 24 * 60 * 60_000,
  });
  if (!q.data) return { lookup: EMPTY, loading: q.isPending && regions.length + cities.length > 0, failed: q.isError };
  return {
    lookup: {
      regions: new Map(q.data.regions.map((r) => [r.code, { name: r.name, name_bn: r.name_bn, lat: r.lat, lon: r.lon, country: r.country_iso2 }])),
      cities: new Map(q.data.cities.map((c) => [String(c.geonameid), { name: c.name, lat: c.lat, lon: c.lon, region: c.region_code, country: c.country_iso2 }])),
    },
    loading: false,
    failed: false,
  };
}

/** A marked place's name in the app's language, or null when it isn't known yet (a city offline). */
export function placeName(v: Pick<Visit, 'place_type' | 'place_code'>, lang: Language, lookup: PlaceLookup): string | null {
  switch (v.place_type) {
    case 'country':
      return mapCountryName(v.place_code, lang);
    case 'district': {
      const p = HOME_DISTRICT_AREAS.features.find((f) => f.properties.code === v.place_code)?.properties;
      return p ? (lang === 'bn' ? p.name_bn : p.name) : null;
    }
    case 'region': {
      const p = HOME_REGIONS.features.find((f) => f.properties.code === v.place_code)?.properties;
      if (p) return lang === 'bn' ? p.name_bn : p.name;
      const r = lookup.regions.get(v.place_code);
      return r ? (lang === 'bn' && r.name_bn ? r.name_bn : r.name) : null;
    }
    case 'city':
      return lookup.cities.get(v.place_code)?.name ?? null;
  }
}

type Box = [number, number, number, number];

function boxOf(geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon): Box {
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  const box: Box = [180, 90, -180, -90];
  for (const p of polygons)
    for (const [x, y] of p[0]) {
      box[0] = Math.min(box[0], x);
      box[1] = Math.min(box[1], y);
      box[2] = Math.max(box[2], x);
      box[3] = Math.max(box[3], y);
    }
  return box;
}

/** Where "Show on map" takes the map: a box to frame, or a point and a zoom. Null when not known. */
export type MapTarget = { bounds: Box } | { center: [number, number]; zoom: number };

export function targetOf(v: Pick<Visit, 'place_type' | 'place_code'>, lookup: PlaceLookup): MapTarget | null {
  switch (v.place_type) {
    case 'country': {
      const b = countryBounds(v.place_code);
      return b ? { bounds: b } : null;
    }
    case 'district': {
      const f = HOME_DISTRICT_AREAS.features.find((x) => x.properties.code === v.place_code);
      return f ? { bounds: boxOf(f.geometry) } : null;
    }
    case 'region': {
      const f = HOME_REGIONS.features.find((x) => x.properties.code === v.place_code);
      if (f) return { bounds: boxOf(f.geometry) };
      const r = lookup.regions.get(v.place_code);
      return r?.lat != null && r.lon != null ? { center: [r.lon, r.lat], zoom: 6 } : null;
    }
    case 'city': {
      const c = lookup.cities.get(v.place_code);
      return c?.lat != null && c.lon != null ? { center: [c.lon, c.lat], zoom: 9 } : null;
    }
  }
}

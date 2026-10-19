/**
 * The street map under trip plans. Light: OpenFreeMap "liberty" as it is. Dark:
 * OpenFreeMap "dark" recoloured so the sea, land, parks and roads can be told
 * apart (the original is near-black everywhere), in the trip screen's palette.
 * Same free tiles; only colours change, in the app.
 */

import type { StyleSpecification } from '@maplibre/maplibre-react-native';
import { useQuery } from '@tanstack/react-query';

export const STREETS = { light: 'https://tiles.openfreemap.org/styles/liberty', dark: 'https://tiles.openfreemap.org/styles/dark' };

type Style = StyleSpecification;

/** Paint changes by layer id */
const DARK: Record<string, Record<string, string | number>> = {
  background: { 'background-color': '#2A2A2A' },
  water: { 'fill-color': '#1B2733' },
  waterway: { 'line-color': '#1F3040' },
  water_name: { 'text-color': '#6F8BA3', 'text-halo-color': 'rgba(0,0,0,0)' },
  landcover_wood: { 'fill-color': '#2D3A2B' },
  landuse_park: { 'fill-color': '#2D3A2B' },
  landuse_residential: { 'fill-color': '#2F2F2F' },
  landcover_ice_shelf: { 'fill-color': '#2A2A2A' },
  building: { 'fill-color': '#353535', 'fill-outline-color': '#3C3C3C' },
  aeroway_area: { 'fill-color': '#333333' },
  'aeroway-area': { 'fill-color': '#333333' },
  'aeroway-runway': { 'line-color': '#444444' },
  'aeroway-taxiway': { 'line-color': '#3C3C3C' },
  road_area_pier: { 'fill-color': '#2A2A2A' },
  road_pier: { 'line-color': '#2A2A2A' },
  highway_path: { 'line-color': '#3A3A3A' },
  highway_minor: { 'line-color': '#404040' },
  highway_major_casing: { 'line-color': '#4E4E4E' },
  highway_major_inner: { 'line-color': '#4A4A4A' },
  highway_major_subtle: { 'line-color': '#474747' },
  highway_motorway_casing: { 'line-color': '#555555' },
  highway_motorway_inner: { 'line-color': '#575757' },
  highway_motorway_subtle: { 'line-color': '#4A4A4A' },
  railway: { 'line-color': '#3A3A3A' },
  railway_minor: { 'line-color': '#3A3A3A' },
  railway_transit: { 'line-color': '#3A3A3A' },
  railway_dashline: { 'line-color': '#2A2A2A' },
  railway_minor_dashline: { 'line-color': '#2A2A2A' },
  railway_transit_dashline: { 'line-color': '#2A2A2A' },
  highway_name_other: { 'text-color': '#8A8A8A', 'text-halo-color': '#2A2A2A' },
  highway_name_motorway: { 'text-color': '#8A8A8A' },
  boundary_state: { 'line-color': '#4A4A4A' },
  'boundary_country_z0-4': { 'line-color': '#555555' },
  'boundary_country_z5-': { 'line-color': '#555555' },
};
const DARK_PLACE_TEXT = { 'text-color': '#A0A0A0', 'text-halo-color': 'rgba(42,42,42,0.9)' };

/** The style with the dark palette applied (a new object; the original is left as it is). */
export function recolour(style: Style): Style {
  return {
    ...style,
    layers: style.layers.map((l) => {
      const change = DARK[l.id] ?? (l.id.startsWith('place_') ? DARK_PLACE_TEXT : undefined);
      return (change && 'paint' in l ? { ...l, paint: { ...l.paint, ...change } } : l) as typeof l;
    }),
  };
}

/** The map style to use: the recoloured dark style once fetched (the plain URL until then, or offline). */
export function useStreetStyle(scheme: 'light' | 'dark'): string | Style {
  const dark = useQuery({
    queryKey: ['mapStyle', 'dark'],
    queryFn: async () => recolour((await (await fetch(STREETS.dark)).json()) as Style),
    enabled: scheme === 'dark',
    staleTime: Infinity,
    gcTime: Infinity,
    retry: 1,
  });
  if (scheme === 'light') return STREETS.light;
  return dark.data ?? STREETS.dark;
}

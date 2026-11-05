/**
 * The map under trip plans: Esri basemaps, streets or satellite imagery with place labels.
 *
 * Without a key: Esri's public tile services (server.arcgisonline.com: World Street Map, World Imagery
 * with World Boundaries and Places on top, and the dark grey canvas in dark mode). These need no key;
 * they are raster tiles with English labels, and Esri no longer updates them. Esri's terms expect an
 * app in production to run under an ArcGIS account, so before release set EXPO_PUBLIC_ESRI_API_KEY.
 *
 * With EXPO_PUBLIC_ESRI_API_KEY (an ArcGIS Location Platform key with only the basemap privileges):
 * Esri's vector basemap styles, navigation (night in dark mode) and imagery, in Bangla or English.
 *
 * Either way Esri requires its credit on the map (`ESRI_CREDIT`).
 */

import type { StyleSpecification } from '@maplibre/maplibre-react-native';

const ESRI_KEY = process.env.EXPO_PUBLIC_ESRI_API_KEY ?? '';
export const ESRI_KEYED = ESRI_KEY.length > 0;
export const ESRI_CREDIT = 'Powered by Esri';
const ESRI_STYLES = 'https://basemapstyles-api.arcgis.com/arcgis/rest/services/styles/v2/styles/arcgis';
const ESRI_TILES = 'https://server.arcgisonline.com/ArcGIS/rest/services';
// Raster styles have no fonts of their own; the app's labels (Noto Sans) come from OpenFreeMap's
const GLYPHS = 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf';

/** An Esri basemap style URL (needs the key): `navigation`, `navigation-night` or `imagery` (with labels). */
export function esriStyle(name: 'navigation' | 'navigation-night' | 'imagery', language: string): string {
  return `${ESRI_STYLES}/${name}?token=${encodeURIComponent(ESRI_KEY)}&language=${language === 'bn' ? 'bn' : 'en'}`;
}

type Keyless = 'streets' | 'imagery' | 'dark';

/** Esri's public tile services, bottom layer first, and the credit each asks for. */
const KEYLESS: Record<Keyless, { services: string[]; attribution: string }> = {
  streets: { services: ['World_Street_Map'], attribution: 'Esri, HERE, Garmin, USGS, NGA, OpenStreetMap contributors' },
  imagery: {
    services: ['World_Imagery', 'Reference/World_Boundaries_and_Places'],
    attribution: 'Esri, Vantor, Earthstar Geographics, and the GIS User Community',
  },
  dark: {
    services: ['Canvas/World_Dark_Gray_Base', 'Canvas/World_Dark_Gray_Reference'],
    attribution: 'Esri, HERE, Garmin, OpenStreetMap contributors',
  },
};

/** A keyless Esri style: its tile services as raster layers. */
export function esriKeylessStyle(kind: Keyless): StyleSpecification {
  const { services, attribution } = KEYLESS[kind];
  const ids = services.map((s) => `esri-${s.replace(/\W+/g, '-').toLowerCase()}`);
  return {
    version: 8,
    glyphs: GLYPHS,
    sources: Object.fromEntries(
      services.map((s, i) => [
        ids[i],
        { type: 'raster', tiles: [`${ESRI_TILES}/${s}/MapServer/tile/{z}/{y}/{x}`], tileSize: 256, maxzoom: 19, attribution },
      ]),
    ),
    layers: ids.map((id) => ({ id, type: 'raster', source: id })),
  } as StyleSpecification;
}

const KEYLESS_STYLES: Record<Keyless, StyleSpecification> = {
  streets: esriKeylessStyle('streets'),
  imagery: esriKeylessStyle('imagery'),
  dark: esriKeylessStyle('dark'),
};

/** The map style to use: streets (dark-mode canvas in dark mode) or satellite imagery. */
export function useStreetStyle(scheme: 'light' | 'dark', satellite = false, language = 'en'): string | StyleSpecification {
  if (ESRI_KEYED) return esriStyle(satellite ? 'imagery' : scheme === 'dark' ? 'navigation-night' : 'navigation', language);
  return KEYLESS_STYLES[satellite ? 'imagery' : scheme === 'dark' ? 'dark' : 'streets'];
}

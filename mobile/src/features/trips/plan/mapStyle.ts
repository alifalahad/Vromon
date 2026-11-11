/**
 * The maps under trip plans.
 *
 * - Map: OpenStreetMap, as OpenFreeMap's vector styles (no key): "liberty" in light mode,
 *   "dark" in dark mode. Road and place names are vector labels drawn last, so routes and
 *   pins can go under them and never hide a road's name.
 * - Satellite: Esri's World Imagery (keyless public tiles), drawn as one more layer of the
 *   same map, under the labels (OpenStreetMap's names over the imagery). Turning it on or off
 *   fades its opacity (`SATELLITE_FADE_MS`) instead of reloading the map.
 *
 * Both need their credit on the map: MapLibre shows the sources' attributions, and
 * `ESRI_CREDIT` is shown while the imagery is on.
 */

export const ESRI_CREDIT = 'Powered by Esri';
export const SATELLITE_FADE_MS = 450;
export const ESRI_IMAGERY = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
export const ESRI_IMAGERY_CREDIT = 'Imagery: Esri, Vantor, Earthstar Geographics, and the GIS User Community';

const STYLES = {
  light: 'https://tiles.openfreemap.org/styles/liberty',
  dark: 'https://tiles.openfreemap.org/styles/dark',
} as const;

/**
 * Where our layers go in each style: the satellite imagery just under the boundaries and
 * labels, and routes just under the first label layer, so names stay readable over them.
 */
export const ANCHORS = {
  light: { satellite: 'boundary_3', route: 'waterway_line_label' },
  dark: { satellite: 'highway_name_other', route: 'highway_name_other' },
} as const;

/** The street map for the app's appearance. */
export function useStreetStyle(scheme: 'light' | 'dark'): string {
  return STYLES[scheme];
}
